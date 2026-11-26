import { createFileRoute } from "@tanstack/react-router";
import { handleWebhook } from "@/server/tl/pay.server.js";

// Webhook de Stripe: confirma pagos, expiraciones y cambios de cuentas conectadas.
// La firma se verifica con STRIPE_WEBHOOK_SECRET antes de procesar cualquier evento.
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.text();
          const out = await handleWebhook(payload, request.headers.get("stripe-signature") || "");
          return new Response(out.body, { status: out.status });
        } catch (err) {
          console.error("stripe webhook failed", err);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
