import { createFileRoute } from "@tanstack/react-router";
import AdminRevenue from "@/pages/admin/AdminRevenue";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/admin/ingresos")({
  head: () => ({ meta: pageMeta("Ingresos y comisiones", "Ingresos de la plataforma, comisiones y transacciones de clases personalizadas.") }),
  component: RoutePage,
});

function RoutePage() {
  return <AdminRevenue />;
}
