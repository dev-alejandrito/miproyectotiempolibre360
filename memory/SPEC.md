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

## Roles
`user_roles` (admin/moderator/user). Admin automático solo para `alejandroortizcalles@gmail.com` (correo confirmado) — migración 0005. Rutas del servidor con nivel open/auth/staff/admin validado en `router.server.js`.

## Pendiente manual
Ver `/app/frontend/CONFIGURACION_PAGOS.md` (aplicar SQL 0005 en Lovable, secretos de Stripe, webhook).
