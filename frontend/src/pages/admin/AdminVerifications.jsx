import { ShieldCheck, Paperclip } from "lucide-react";
import { useState } from "react";
import { Alert, Empty, Field, PageHeader, Spinner, UserVerifiedBadge, useToast } from "../../components/ui";
import { useApi } from "../../lib/hooks";
import { api } from "../../lib/pb";
import { useAuth } from "../../lib/auth";
import { fmtDateTime } from "../../lib/util";

const FILTERS = [["pending", "En revisión"], ["approved", "Aprobadas"], ["rejected", "Rechazadas"], ["", "Todas"]];
const ST = { pending: "chip-warn", approved: "chip-ok", rejected: "chip-bad" };

function Item({ r, me, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  async function act(action) {
    setErr("");
    if (action === "reject" && reason.trim().length < 5) { setErr("Escribe el motivo del rechazo (mínimo 5 caracteres)."); return; }
    setBusy(action);
    try { await api(`/admin/verifications/${r.id}/review`, { method: "POST", body: { action, reason } }); toast(action === "approve" ? "Cuenta verificada: ya muestra la insignia." : "Solicitud rechazada y la persona fue avisada."); onDone(); }
    catch (er) { setErr(er.message); } finally { setBusy(""); }
  }
  const own = r.member === me.id;
  return (
    <li className="card space-y-3" data-testid={`verification-item-${r.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${ST[r.status] || ""}`}>{r.status_label}</span>
        <h3 className="text-lg font-bold">{r.member_name}<UserVerifiedBadge show={r.member_verified} /></h3>
        <span className="text-sm text-[#4b4638]">{r.member_email} · {fmtDateTime(r.created)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words">{r.message}</p>
      <ul className="flex flex-wrap gap-2">
        {r.files.map((f, i) => <li key={i}><a className="btn btn-ghost btn-sm" href={f.url || undefined} target="_blank" rel="noopener noreferrer"><Paperclip size={16} aria-hidden="true" />{f.name}</a></li>)}
      </ul>
      {r.status !== "pending" && <p className="text-sm"><strong>Revisó:</strong> {r.reviewed_by_name || "—"} · {fmtDateTime(r.reviewed_at)}{r.reason && <> · <strong>Motivo:</strong> {r.reason}</>}</p>}
      {r.status === "pending" && (own ? <Alert kind="info">No puedes revisar tu propia solicitud.</Alert> : (
        <div className="space-y-2">
          <Field label="Motivo del rechazo (obligatorio para rechazar)">{(p) => <textarea {...p} className="input" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="verification-reason-input" />}</Field>
          {err && <Alert kind="error">{err}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("approve")} data-testid="verification-approve-button">{busy === "approve" ? "Aprobando…" : "Aprobar"}</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => act("reject")} data-testid="verification-reject-button">{busy === "reject" ? "Rechazando…" : "Rechazar"}</button>
          </div>
        </div>
      ))}
    </li>
  );
}

export default function AdminVerifications() {
  const { me } = useAuth();
  const [status, setStatus] = useState("pending");
  const { data, loading, error, reload } = useApi("/admin/verifications", { status });
  return (
    <>
      <PageHeader title="Verificación de cuentas" subtitle="Revisa las evidencias y aprueba o rechaza. Se registra quién revisó y cuándo. Es independiente de la acreditación de habilidades." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={`min-h-11 rounded-full border px-4 text-sm font-bold ${status === k ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-sand"}`} data-testid={`verification-filter-${k || "all"}`}>{l}</button>)}
      </div>
      {loading && !data ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : !data.items.length ? <Empty icon={ShieldCheck} title="Sin solicitudes">No hay solicitudes con este estado.</Empty> : (
        <ul className="space-y-4">{data.items.map((r) => <Item key={r.id} r={r} me={me} onDone={reload} />)}</ul>
      )}
    </>
  );
}
