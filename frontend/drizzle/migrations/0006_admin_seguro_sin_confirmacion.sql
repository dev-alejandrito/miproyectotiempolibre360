-- ============ TIEMPO LIBRE 360: rol de administrador seguro (registro sin confirmación de correo) ============
-- Migración NO destructiva: no borra usuarios, contraseñas, perfiles ni registros. Se puede ejecutar varias veces.
-- Aplícala ANTES de activar «Auto-confirm email» en Lovable (More → Users → Settings → Email).
--
-- Motivo: al quitar la confirmación por enlace, cualquiera podría registrarse con un correo ajeno.
-- Por eso el rol admin deja de asignarse automáticamente por correo y solo se otorga con un
-- procedimiento manual del lado del servidor que ningún usuario de la aplicación puede ejecutar.

-- 1. Desactiva la asignación automática por correo (la función se conserva vacía para no romper los triggers existentes).
create or replace function public.tl_grant_owner_admin(p_uid uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Intencionalmente vacío: el rol admin solo se otorga con public.tl_promote_admin().
  return;
end $$;
revoke all on function public.tl_grant_owner_admin(uuid, text) from public, anon, authenticated;

-- 2. Procedimiento seguro para otorgar el rol admin (solo desde el editor SQL de Lovable Cloud / service_role).
--    - Exige que la cuenta exista, esté activa y haya iniciado sesión al menos una vez.
--    - Cierra todas las sesiones abiertas de esa cuenta: solo quien conozca la contraseña actual podrá entrar como admin.
--    - Deja constancia en audit_log.
create or replace function public.tl_promote_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid; v_last timestamptz; v_n int;
begin
  select count(*) into v_n from auth.users where lower(email) = lower(btrim(p_email));
  if v_n = 0 then return 'No existe una cuenta con ese correo. Regístrala primero desde /registro.'; end if;
  if v_n > 1 then return 'Hay más de una cuenta con ese correo; revisa en Lovable → Users antes de continuar.'; end if;
  select id, last_sign_in_at into v_uid, v_last from auth.users where lower(email) = lower(btrim(p_email));
  if v_last is null then return 'La cuenta nunca ha iniciado sesión. Inicia sesión una vez y vuelve a ejecutar.'; end if;
  if not exists (select 1 from public.members where id = v_uid and status = 'active') then
    return 'La cuenta no está activa en members.';
  end if;
  insert into public.user_roles(user_id, role) values (v_uid, 'admin') on conflict (user_id, role) do nothing;
  delete from auth.sessions where user_id = v_uid;            -- cierra sesiones (no borra la cuenta ni la contraseña)
  delete from auth.refresh_tokens where user_id = v_uid::text;
  insert into public.audit_log(actor, actor_name, action, target, detail)
    values (null, 'Procedimiento SQL', 'user.role.promote_admin', 'member:' || v_uid, lower(btrim(p_email)));
  return 'Rol admin otorgado a ' || lower(btrim(p_email)) || '. Vuelve a iniciar sesión.';
end $$;
revoke all on function public.tl_promote_admin(text) from public, anon, authenticated;

-- 3. Procedimiento para retirar el rol admin (mismo nivel de acceso).
create or replace function public.tl_revoke_admin(p_email text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_uid is null then return 'No existe una cuenta con ese correo.'; end if;
  delete from public.user_roles where user_id = v_uid and role = 'admin';
  insert into public.user_roles(user_id, role) values (v_uid, 'user') on conflict (user_id, role) do nothing;
  insert into public.audit_log(actor, actor_name, action, target, detail)
    values (null, 'Procedimiento SQL', 'user.role.revoke_admin', 'member:' || v_uid, lower(btrim(p_email)));
  return 'Rol admin retirado a ' || lower(btrim(p_email)) || '.';
end $$;
revoke all on function public.tl_revoke_admin(text) from public, anon, authenticated;

-- 4. Consulta de revisión (solo lectura): cuentas sin confirmar que hoy no pueden entrar.
--    Activar «Auto-confirm email» NO las confirma retroactivamente. Pueden activarse solas con
--    «¿Olvidaste tu contraseña?» (abrir el enlace confirma el correo). Ejecuta para ver cuántas son:
-- select count(*) from auth.users where email_confirmed_at is null;
