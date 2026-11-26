# TIEMPO LIBRE 360 — configuración pendiente (manual, desde Lovable)

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
