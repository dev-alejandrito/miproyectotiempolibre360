-- ============ TIEMPO LIBRE 360: avisos de seguridad por correo (contraseña cambiada / dispositivo nuevo) ============
-- Migración aditiva y NO destructiva. No modifica cuentas, contraseñas, sesiones ni roles.
-- Los triggers solo registran eventos; si fallan, NUNCA bloquean el registro, el inicio de sesión ni el cambio de contraseña.

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('password_changed', 'new_device')),
  device_label text not null default '',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  error text not null default '',
  created timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists security_events_pending_idx on public.security_events(status, created);
grant all on public.security_events to service_role;
alter table public.security_events enable row level security;

create table if not exists public.known_devices (
  id uuid primary key default gen_random_uuid(),
  member uuid not null references public.members(id) on delete cascade,
  device_hash text not null,
  user_agent text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (member, device_hash)
);
grant all on public.known_devices to service_role;
alter table public.known_devices enable row level security;

-- Contraseña cambiada (recuperación por correo o cambio desde la cuenta).
create or replace function public.tl_security_password_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.encrypted_password is distinct from old.encrypted_password and old.encrypted_password is not null and old.encrypted_password <> ''
       and exists (select 1 from public.members where id = new.id) then
      insert into public.security_events(member, kind) values (new.id, 'password_changed');
    end if;
  exception when others then null; -- nunca bloquear el cambio de contraseña
  end;
  return new;
end $$;
drop trigger if exists tl_security_password_changed on auth.users;
create trigger tl_security_password_changed after update of encrypted_password on auth.users
  for each row execute function public.tl_security_password_changed();

-- Nueva sesión: se compara el navegador/sistema (user agent) con los ya conocidos de esa cuenta.
-- El primer dispositivo de una cuenta se registra sin aviso; los siguientes nuevos generan un aviso.
create or replace function public.tl_security_new_session() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ua text; v_hash text; v_has_any boolean;
begin
  begin
    if not exists (select 1 from public.members where id = new.user_id) then return new; end if;
    v_ua := left(coalesce(new.user_agent, ''), 400);
    v_hash := md5(lower(btrim(v_ua)));
    select exists (select 1 from public.known_devices where member = new.user_id) into v_has_any;
    if exists (select 1 from public.known_devices where member = new.user_id and device_hash = v_hash) then
      update public.known_devices set last_seen = now() where member = new.user_id and device_hash = v_hash;
    else
      insert into public.known_devices(member, device_hash, user_agent) values (new.user_id, v_hash, v_ua)
        on conflict (member, device_hash) do update set last_seen = now();
      if v_has_any then
        insert into public.security_events(member, kind, device_label) values (new.user_id, 'new_device', v_ua);
      end if;
    end if;
  exception when others then null; -- nunca bloquear el inicio de sesión
  end;
  return new;
end $$;
drop trigger if exists tl_security_new_session on auth.sessions;
create trigger tl_security_new_session after insert on auth.sessions
  for each row execute function public.tl_security_new_session();

revoke all on function public.tl_security_password_changed() from public, anon, authenticated;
revoke all on function public.tl_security_new_session() from public, anon, authenticated;
