import { ShieldCheck, CircleCheck, Circle, Palette } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";

import { Alert, Field, PageHeader, Progress, useToast } from "../../components/ui";
import AvailabilityEditor from "../../components/AvailabilityEditor";
import { useAuth } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import { errMsg, pb } from "../../lib/pb";

const parseAv = (v) => (Array.isArray(v) ? v : []);

export default function Profile() {
  const { me } = useAuth();
  const toast = useToast();
  const { data } = useApi("/person/" + me.id);
  const [f, setF] = useState({ name: me.name || "", headline: me.headline || "", bio: me.bio || "", availability: parseAv(me.availability) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const checks = [
    ["Escribe un titular y una breve presentación", !!(f.headline && f.bio)],
    ["Ofrece al menos una habilidad", (data?.offers?.length || 0) > 0, "/app/mis-habilidades"],
    ["Indica algo que quieras aprender", (data?.wants?.length || 0) > 0, "/app/quiero-aprender"],
    ["Define tu disponibilidad semanal (mejora tus coincidencias)", f.availability.length > 0],
    ["Añade una fotografía de perfil", !!me.avatar_path, "/app/editar-perfil"],
  ];
  const score = checks.filter((c) => c[1]).length;

  async function save(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      await pb.collection("members").update(me.id, { name: f.name.trim(), headline: f.headline.trim(), bio: f.bio.trim(), availability: f.availability }, { requestKey: null });
      toast("Perfil guardado.");
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader title="Perfil inteligente" subtitle="Cuanto más completo, mejores son tus coincidencias.">
        <Link to="/app/editar-perfil" className="btn btn-primary btn-sm" data-testid="edit-my-profile-link"><Palette size={16} aria-hidden="true" />Editar mi perfil</Link>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={save} className="space-y-6">
          <section className="card space-y-4">
            <h2 className="text-xl font-bold">Sobre ti</h2>
            <Field label="Nombre y apellido">{(p) => <input {...p} className="input" required value={f.name} onChange={set("name")} />}</Field>
            <Field label="Titular" hint="Una frase corta, por ejemplo: «Profe de inglés y amante del senderismo».">{(p) => <input {...p} className="input" maxLength={120} value={f.headline} onChange={set("headline")} />}</Field>
            <Field label="Presentación">{(p) => <textarea {...p} className="input" rows={4} maxLength={800} value={f.bio} onChange={set("bio")} />}</Field>
          </section>
          
          <section className="card space-y-4">
            <h2 className="text-xl font-bold">Disponibilidad semanal</h2>
            <p className="hint">Marca los días y horarios en los que sueles poder hacer sesiones.</p>
            <AvailabilityEditor value={f.availability} onChange={(a) => setF({ ...f, availability: a })} />
          </section>
          {error && <Alert kind="error">{error}</Alert>}
          <button className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</button>
        </form>
        <aside className="card h-fit lg:sticky lg:top-6">
          <h2 className="text-xl font-bold">Tu perfil al {Math.round((score / checks.length) * 100)}%</h2>
          <div className="mt-3"><Progress value={score} max={checks.length} label="Perfil completado" /></div>
          <ul className="mt-4 space-y-3">
            {checks.map(([t, ok, to]) => (
              <li key={t} className="flex gap-2 text-sm">{ok ? <CircleCheck size={18} className="shrink-0 text-ok" aria-hidden="true" /> : <Circle size={18} className="shrink-0 text-[#7a7466]" aria-hidden="true" />}<span>{ok ? <span className="sr-only">Hecho: </span> : <span className="sr-only">Pendiente: </span>}{!ok && to ? <Link to={to} className="font-semibold underline">{t}</Link> : t}</span></li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-sand p-3 text-sm"><ShieldCheck size={16} aria-hidden="true" />Tus datos privados (como tu correo) nunca se muestran a otras personas.</div>
        </aside>
      </div>
    </>
  );
}
