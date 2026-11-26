import { createFileRoute } from "@tanstack/react-router";
import AdminVerifications from "@/pages/admin/AdminVerifications";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/admin/verificaciones")({
  head: () => ({ meta: pageMeta("Verificación de cuentas", "Revisa, aprueba o rechaza solicitudes de verificación de cuentas.") }),
  component: RoutePage,
});

function RoutePage() {
  return <AdminVerifications />;
}
