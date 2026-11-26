-- ============ TIEMPO LIBRE 360: cola de integraciones (recibos, avisos al administrador, Google Calendar y Sheets) ============
-- Migración aditiva y NO destructiva. No modifica créditos, intercambios, acreditaciones, verificaciones ni clases.
create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'calendar_sync', 'sheet_sync')),
  dedupe_key text not null default '',
  subject text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'done', 'failed')),
  attempts integer not null default 0,
  error text not null default '',
  result jsonb not null default '{}'::jsonb,
  created timestamptz not null default now(),
  done_at timestamptz
);
-- Un correo con la misma clave nunca se envía dos veces (recibos, avisos).
create unique index if not exists integration_jobs_dedupe on public.integration_jobs(dedupe_key) where dedupe_key <> '';
-- Solo una sincronización pendiente por reservación/pago (lee siempre el estado más reciente).
create unique index if not exists integration_jobs_one_pending on public.integration_jobs(kind, subject) where status = 'pending' and kind <> 'email';
create index if not exists integration_jobs_queue_idx on public.integration_jobs(status, created);
grant all on public.integration_jobs to service_role;
alter table public.integration_jobs enable row level security;
-- Sin políticas para usuarios: solo el servidor lee y escribe.
