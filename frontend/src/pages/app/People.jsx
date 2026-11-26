import { SearchX } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";

import { Alert, Empty, PageHeader, Spinner } from "../../components/ui";
import Filters from "../../components/Filters";
import SkillResult from "../../components/SkillResult";
import RequestModal from "../../components/RequestModal";
import { useApi } from "../../lib/hooks";

export default function People() {
  const [f, setF] = useState({ q: "", category: "", mode: "", level: "" });
  const [req, setReq] = useState(null);
  const { data, loading, error, reload } = useApi("/people", f);
  const items = data?.items || [];
  return (
    <>
      <PageHeader title="Buscar personas" subtitle="Encuentra personas con intereses y habilidades en común, crea conexiones y descubre nuevas oportunidades para aprender." />
      <Filters value={f} onChange={setF} />
      <div className="mt-6" aria-live="polite">
        {loading ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : items.length === 0 ? <Empty icon={SearchX} title="No encontramos personas con esos filtros">Prueba con menos filtros o una categoría distinta. También puedes revisar tus <Link className="font-bold underline" to="/app/coincidencias">coincidencias</Link>.</Empty> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((it) => <SkillResult key={it.skill.id} item={it} authed onRequest={setReq} />)}</ul>
        )}
      </div>
      {req && <RequestModal person={req.person} skill={req.skill} onClose={() => setReq(null)} onDone={reload} />}
    </>
  );
}
