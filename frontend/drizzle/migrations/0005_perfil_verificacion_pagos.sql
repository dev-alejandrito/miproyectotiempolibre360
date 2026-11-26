-- ============ TIEMPO LIBRE 360: perfil, verificación de cuentas, pagos con Stripe Connect y comisiones ============
-- Migración ADITIVA: no borra tablas, columnas, usuarios ni registros existentes.
-- Aplícala completa desde Lovable (Cloud → SQL / migraciones). Se puede ejecutar más de una vez sin duplicar nada.

-- ---------- 1. Cuenta administradora ----------
-- El rol admin YA NO se otorga automáticamente por correo (ver 0006_admin_seguro_sin_confirmacion.sql).
-- Solo una cuenta administradora: se retira el rol admin a la cuenta anterior (la cuenta y sus datos se conservan).
delete from public.user_roles
where role = 'admin' and user_id in (select id from auth.users where lower(email) = 'ortizcallesjoahann@gmail.com');

-- ---------- 2. Personalización del perfil ----------
alter table public.members add column if not exists avatar_path text not null default '';
alter table public.members add column if not exists cover_path text not null default '';
alter table public.members add column if not exists theme text not null default 'clasico';
alter table public.members add column if not exists interests jsonb not null default '[]'::jsonb;
-- Estas columnas solo se escriben desde el servidor (validación de archivos y tema); no se otorgan permisos de UPDATE a usuarios.

-- Almacenamiento persistente de fotografías de perfil y portadas (JPG, PNG o WebP, máx. 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfiles', 'perfiles', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "perfiles_insert_own_folder" on storage.objects;
create policy "perfiles_insert_own_folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'perfiles' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_member(auth.uid()));
drop policy if exists "perfiles_delete_own_folder" on storage.objects;
create policy "perfiles_delete_own_folder" on storage.objects for delete to authenticated
  using (bucket_id = 'perfiles' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 3. Verificación de cuentas (independiente de la acreditación de habilidades) ----------
create table if not exists public.account_verifications (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  message text not null default '',
  files jsonb not null default '[]'::jsonb,
  reason text not null default '',
  reviewed_by uuid references public.members(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index if not exists account_verifications_member_idx on public.account_verifications(member, created desc);
create unique index if not exists account_verifications_one_pending on public.account_verifications(member) where status = 'pending';
grant all on public.account_verifications to service_role;
alter table public.account_verifications enable row level security;
-- Sin políticas para usuarios: solo el servidor (con identidad verificada) lee y escribe.

-- ---------- 4. Método de pago de las clases personalizadas ----------
alter table public.private_offers add column if not exists payment_method text not null default 'direct';
alter table public.private_bookings add column if not exists payment_method text not null default 'direct';
do $$ begin
  alter table public.private_offers add constraint private_offers_payment_method_chk check (payment_method in ('direct', 'stripe'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.private_bookings add constraint private_bookings_payment_method_chk check (payment_method in ('direct', 'stripe'));
exception when duplicate_object then null; end $$;

-- ---------- 5. Cuentas conectadas de Stripe (instructores) ----------
create table if not exists public.payout_accounts (
  member uuid primary key references public.members(id) on delete cascade,
  provider text not null default 'stripe',
  account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  livemode boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
grant all on public.payout_accounts to service_role;
alter table public.payout_accounts enable row level security;

-- ---------- 6. Pagos y comisiones de clases personalizadas ----------
create table if not exists public.class_payments (
  id uuid primary key default gen_random_uuid(),
  booking uuid not null unique references public.private_bookings(id) on delete restrict,
  booking_code text not null default '',
  student uuid not null references public.members(id) on delete restrict,
  instructor uuid not null references public.members(id) on delete restrict,
  provider text not null default 'stripe',
  destination_account text not null default '',
  checkout_session_id text unique,
  payment_intent_id text unique,
  amount_mxn numeric(10,2) not null check (amount_mxn > 0),
  commission_pct numeric(5,2) not null check (commission_pct >= 0 and commission_pct <= 50),
  commission_mxn numeric(10,2) not null check (commission_mxn >= 0),
  instructor_net_mxn numeric(10,2) not null check (instructor_net_mxn >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunding', 'refunded', 'expired', 'failed')),
  commission_status text not null default 'pending' check (commission_status in ('pending', 'collected', 'reversed', 'none')),
  livemode boolean not null default false,
  refund_id text unique,
  refunded_mxn numeric(10,2) not null default 0,
  refund_reason text not null default '',
  refunded_by text not null default '',
  refunded_at timestamptz,
  attempts integer not null default 0,
  created timestamptz not null default now(),
  confirmed_at timestamptz,
  updated timestamptz not null default now(),
  check (commission_mxn + instructor_net_mxn = amount_mxn)
);
create index if not exists class_payments_created_idx on public.class_payments(created desc);
create index if not exists class_payments_status_idx on public.class_payments(status);
grant all on public.class_payments to service_role;
alter table public.class_payments enable row level security;

-- Eventos de webhook ya procesados (idempotencia: un evento nunca se procesa dos veces).
create table if not exists public.payment_events (
  id text primary key,
  type text not null default '',
  created timestamptz not null default now()
);
grant all on public.payment_events to service_role;
alter table public.payment_events enable row level security;

-- ---------- 7. Porcentaje de comisión (solo administradores pueden modificarlo; políticas existentes de site_settings) ----------
insert into public.site_settings(key, value) values ('commission_pct', '10') on conflict (key) do nothing;
