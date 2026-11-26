# TIEMPO LIBRE 360 — SPEC

Proyecto importado de Lovable: TanStack Start + React (JSX) + Lovable Cloud (Supabase). Código en `/app/frontend`.
La vista previa de Emergent ejecuta `vite dev` en el puerto 3000 (vite.config.ts → `vite.server`); en Lovable usa 8080.
El backend real es Lovable Cloud: la lógica del servidor vive en `src/server/tl/*.server.js` y se expone como `/api/tl/*`
mediante una server function (`src/lib/tl-api.functions.ts`). El webhook de Stripe es `src/routes/api.stripe-webhook.ts`.
Sin `SUPABASE_SERVICE_ROLE_KEY` (secreto de Lovable) las funciones del servidor no corren en esta vista previa.

## Módulos
- Intercambios con créditos (1 min = 1 crédito, 15–120 min, reserva → transferencia con doble confirmación, devolución en rechazo/cancelación; `tl_move` en BD, idempotente).
- Acreditación de habilidades (certificado + video obligatorios; estados pending/review/correction/approved/rejected/suspended). Solo habilidades aprobadas se ofrecen (trigger `tl_skills_guard`).
- Verificación de cuentas (nueva): `account_verifications`; usuario solicita en /app/editar-perfil, admin revisa en /admin/verificaciones; aprobar fija `members.verified_at/verified_by`; insignia estrella `UserVerifiedBadge` con texto "Usuario verificado por TIEMPO LIBRE 360".
- Editar mi perfil (nuevo): /app/editar-perfil — foto, portada (bucket público `perfiles`, JPG/PNG/WebP ≤ 5 MB), nombre público, descripción, intereses, tema de color, vista previa. Guardado vía `POST /profile` (solo campos permitidos).
- Clases personalizadas (MXN, sin créditos): ofertas con `payment_method` stripe|direct. Stripe Connect Express (`/pay/account`, `/pay/account/onboard`), Checkout con `application_fee_amount` 10% (`/pay/checkout/:id`), confirmación solo por Stripe (`/pay/sync/:id` o webhook), reembolsos con reversión de comisión.
- Ingresos y comisiones (admin): /admin/ingresos (`GET /admin/revenue`, filtros fecha/estado; `POST /admin/revenue/:bookingId/refund`).
- Quejas y sugerencias (/app/quejas, /admin/quejas), mensajería privada (chat), calendario mes/semana/día (intercambios + clases personalizadas, zona America/Mexico_City).

## Autenticación y roles
Supabase Auth (Lovable Cloud), correo + contraseña. Registro sin enlace de confirmación cuando «Auto-confirm email» está activo en Lovable (More → Users → Settings → Email); el código entra de inmediato si signUp devuelve sesión. «¿Olvidaste tu contraseña?» (/recuperar) envía enlace; /restablecer solo se habilita desde ese enlace (PASSWORD_RECOVERY) y al guardar cierra sesión en todos los dispositivos. Bloqueo por 5 intentos fallidos e inactividad de 30 min se conservan.
`user_roles` (admin/moderator/user): los usuarios solo pueden leerlo. El rol admin NO se asigna por correo (migración 0006 deja `tl_grant_owner_admin` vacío); se otorga con `select public.tl_promote_admin('correo');` desde el editor SQL de Lovable (no ejecutable por usuarios). Cambios de rol en la app: solo un admin, vía `/admin/user/:id/role`.

## Pendiente manual
Ver `/app/frontend/CONFIGURACION_PAGOS.md` (aplicar SQL 0005 en Lovable, secretos de Stripe, webhook).

## Avisos de seguridad por correo
Migración 0007: `security_events` (outbox) y `known_devices`. Triggers: `auth.users` (cambio de encrypted_password → password_changed) y `auth.sessions` (user agent nuevo → new_device; el primer dispositivo no avisa). `src/server/tl/security.server.js` envía vía Gmail API con token del conector Emergent (`EMERGENT_LLM_KEY` + `GMAIL_CONNECTION_ID`, cuenta alejandroortizcalles@gmail.com). Envío: `POST /security/flush` (tras login) y `GET /me/dashboard`, con tope de 3–4 s; reclamo atómico, un correo por evento, máx. 5 intentos.

## Integraciones Google (cuenta de la plataforma alejandroortizcalles@gmail.com)
`src/server/tl/integrations.server.js` + tabla `integration_jobs` (migración 0008). Tipos: `email` (dedupe_key único: `receipt:<pago>:student|instructor`, `admin:feedback:<id>`, `admin:verification:<id>`, `admin:private-dispute:<id>:<ts>`, `admin:exchange-dispute:<id>`), `calendar_sync` (subject = reservación; evento con ID fijo `tl360<uuid>` en el calendario GOOGLE_CALENDAR_ID, PUT→POST, DELETE al cancelar/rechazar, invitados alumno+instructor con sendUpdates=all), `sheet_sync` (subject = pago; solo pagos confirmados; una fila por ID de operación en la pestaña «Comisiones», «Resumen mensual» con QUERY). Ejecución: `kickJobs` tras cada evento (tope 3–4 s) y `flushSoon` (login / panel). Reintentos máx. 5; errores en `integration_jobs.error`.
