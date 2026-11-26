import { createFileRoute } from "@tanstack/react-router";
import EditProfile from "@/pages/app/EditProfile";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/app/editar-perfil")({
  head: () => ({ meta: pageMeta("Editar mi perfil", "Personaliza tu fotografía, portada, descripción, intereses y tema de color.") }),
  component: RoutePage,
});

function RoutePage() {
  return <EditProfile />;
}
