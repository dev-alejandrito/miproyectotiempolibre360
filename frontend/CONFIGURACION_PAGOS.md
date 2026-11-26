# TIEMPO LIBRE 360 — configuración pendiente (manual, desde Lovable)

## 0. Registro sin confirmación de correo + cuenta administradora (en este orden)
1. Aplica `drizzle/migrations/0006_admin_seguro_sin_confirmacion.sql` (desactiva el admin automático por correo).
2. Lovable → More → Users → Settings → Email → activa **Auto-confirm email**. Mantén activo el inicio con correo.
   En la misma sección revisa que la URL del sitio y las Redirect URLs incluyan `https://TU-DOMINIO/restablecer`.
3. Cuenta admin: si `alejandroortizcalles@gmail.com` no existe, regístrala en `/registro`. Si ya existía, usa
   «¿Olvidaste tu contraseña?» y fija una contraseña nueva (prueba que el correo es tuyo y cierra otras sesiones).
4. Inicia sesión una vez y luego, en el editor SQL de Lovable Cloud, ejecuta:
   `select public.tl_promote_admin('alejandroortizcalles@gmail.com');`
5. Vuelve a iniciar sesión: verás «Panel de gestión». Para retirar el rol: `select public.tl_revoke_admin('correo');`

## 1. Aplicar la migración SQL (obligatorio)
Archivo: `drizzle/migrations/0005_perfil_verificacion_pagos.sql` (aditiva; no borra datos).
Crea: columnas de perfil (`avatar_path`, `cover_path`, `theme`, `interests`), bucket público `perfiles`,
tablas `account_verifications`, `payout_accounts`, `class_payments`, `payment_events`,
columna `payment_method` en ofertas/reservaciones, ajuste `commission_pct = 10`
y deja el rol admin solo para `alejandroortizcalles@gmail.com`.

## 2. Secretos del servidor (Lovable → Cloud → Secrets)
| Nombre | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | Clave secreta de **prueba** `sk_test_...` de tu cuenta Stripe (Dashboard → Developers → API keys). |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` del webhook (paso 3). |
| `STRIPE_LIVE_ENABLED` | **No lo agregues** hasta autorizar cobros reales. Sin él, solo se aceptan claves `sk_test_`. |
| `APP_PUBLIC_URL` (opcional) | URL pública de la app, p. ej. `https://tu-dominio`. Si no existe se usa el origen de la petición. |

## 3. Stripe
1. Activa **Connect** en tu cuenta Stripe (Dashboard → Connect → Get started), tipo de cuenta **Express**, país México.
2. Crea un webhook (Developers → Webhooks → Add endpoint): `https://TU-DOMINIO/api/stripe-webhook`
   Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `account.updated`.
   **Escucha también eventos de cuentas conectadas** (Connect) para `account.updated`.
3. Copia el *Signing secret* en `STRIPE_WEBHOOK_SECRET`.

## Flujo de pago
Alumno solicita → instructor acepta → alumno paga en Stripe Checkout (cargo con destino:
`application_fee_amount` = 10 % para la plataforma, 90 % se transfiere a la cuenta conectada del instructor)
→ Stripe confirma (webhook firmado o consulta del servidor a Stripe) → reservación «Confirmada».
Cancelación antes del inicio o resolución de disputa como «cancelada» → reembolso total en Stripe con
`reverse_transfer` y `refund_application_fee` (comisión revertida). Sin cargos adicionales.

## Avisos de seguridad por correo (Gmail)
1. Aplica `drizzle/migrations/0007_avisos_seguridad.sql` (triggers que registran cambio de contraseña y navegador nuevo; nunca bloquean el acceso).
2. Agrega en Lovable → Cloud → Secrets: `EMERGENT_LLM_KEY` (tu clave personal de Emergent) y `GMAIL_CONNECTION_ID = 16bd2a94-852c-47f3-b40d-d46e84c126b5`.
   La autorización OAuth de Gmail la guarda Emergent; la app solo pide un token temporal desde el servidor.
3. Remitente: la cuenta conectada (alejandroortizcalles@gmail.com). Los avisos se envían al iniciar sesión o al abrir el panel; si Gmail falla se reintentan (máx. 5).

## Recibos, avisos al administrador, Google Calendar y Google Sheets
1. Aplica `drizzle/migrations/0008_integraciones_google.sql` (cola `integration_jobs` con control de duplicados y registro de errores).
2. Agrega en Lovable → Cloud → Secrets (además de `EMERGENT_LLM_KEY` y `GMAIL_CONNECTION_ID`):
   - `GCAL_CONNECTION_ID = b3d98eb7-ed82-48b8-b2b2-040e0df02b6d`
   - `GOOGLE_CALENDAR_ID = b7a688892af130a7f0765073a0fedc1ab2ebe98b40bacc9d1342ee28293b540d@group.calendar.google.com` (calendario «TIEMPO LIBRE 360 — Clases»)
   - `GSHEETS_CONNECTION_ID = 01aabe43-ea46-4194-a6b0-947531b3e9d1`
   - `COMMISSIONS_SHEET_ID = 1JP1RMGWvKggxmnm1Ial1pYS-G9WfaLUnsmiJ93Bg1ZQ` (hoja «TIEMPO LIBRE 360 — Comisiones»: https://docs.google.com/spreadsheets/d/1JP1RMGWvKggxmnm1Ial1pYS-G9WfaLUnsmiJ93Bg1ZQ)
   - Opcional: `APP_PUBLIC_URL` (para enlaces completos al panel en los avisos) y `ADMIN_ALERT_EMAIL` (por defecto alejandroortizcalles@gmail.com).
3. Prueba manual real (opcional): `LIVE_GOOGLE=1 npx vitest run src/test/integrations.live.manual.test.ts` (envía 2 correos PRUEBA, crea/cancela 1 evento y agrega/actualiza 1 fila que después debes borrar).
