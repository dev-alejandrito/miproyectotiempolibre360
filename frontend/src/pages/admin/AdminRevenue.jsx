import { Banknote, Undo2 } from "lucide-react";
import { useState } from "react";
import { Alert, Empty, Field, Modal, PageHeader, Spinner, useToast } from "../../components/ui";
import { useApi } from "../../lib/hooks";
import { api } from "../../lib/pb";
import { fmtDateTime } from "../../lib/util";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const money = (n) => MXN.format(Number(n || 0));
const ST = { pending: "chip-warn", paid: "chip-ok", refunding: "chip-warn", refunded: "chip-bad", expired: "chip", failed: "chip-bad" };
const STATUS = [["", "Todos"], ["paid", "Pagado"], ["pending", "Pago pendiente"], ["refunded", "Reembolsado"], ["expired", "Expirado"]];

function RefundModal({ item, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (reason.trim().length < 5) { setErr("Escribe el motivo (mínimo 5 caracteres)."); return; }
    setBusy(true);
    try { await api(`/admin/revenue/${item.booking}/refund`, { method: "POST", body: { reason } }); toast("Reembolso registrado en Stripe. La comisión se revirtió."); onDone(); onClose(); }
    catch (er) { setErr(er.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Reembolsar ${item.booking_code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert kind="warn">Se devolverá el total ({money(item.amount_mxn)}) al alumno. Stripe revierte la transferencia al instructor ({money(item.instructor_net_mxn)}) y la comisión de la plataforma ({money(item.commission_mxn)}). No se aplican cargos adicionales.</Alert>
        <Field label="Motivo del reembolso">{(p) => <textarea {...p} className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="refund-reason-input" />}</Field>
        {err && <Alert kind="error">{err}</Alert>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Volver</button><button className="btn btn-danger" disabled={busy} data-testid="refund-confirm-button">{busy ? "Procesando…" : "Confirmar reembolso"}</button></div>
      </form>
    </Modal>
  );
}

export default function AdminRevenue() {
  const [f, setF] = useState({ from: "", to: "", status: "" });
  const [refund, setRefund] = useState(null);
  const { data, loading, error, reload } = useApi("/admin/revenue", f);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const t = data?.totals;
  const cards = t ? [
    ["Ingresos totales de TIEMPO LIBRE 360", money(t.platform_income), "revenue-total"],
    ["Comisiones cobradas", money(t.commissions_collected), "revenue-collected"],
    ["Comisiones pendientes (pago sin confirmar)", money(t.commissions_pending), "revenue-pending"],
    ["Clases pagadas", t.paid_classes, "revenue-paid-count"],
    ["Pagado a instructores (neto)", money(t.instructor_net), "revenue-instructor-net"],
    ["Reembolsos", `${t.refunds} · ${money(t.refunded_mxn)}`, "revenue-refunds"],
  ] : [];
  return (
    <>
      <PageHeader title="Ingresos y comisiones" subtitle={`Comisión de la plataforma: ${data?.commission_pct ?? 10}% sobre cada clase personalizada pagada. Solo cuentan pagos confirmados por Stripe. Fechas en hora de Ciudad de México.`} />
      {data && !data.enabled && <div className="mb-4"><Alert kind="warn">Los pagos en línea todavía no están activados: falta configurar la clave de Stripe en el servidor.</Alert></div>}
      <form className="card mb-6 grid gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()} role="search" aria-label="Filtros de transacciones">
        <Field label="Desde">{(p) => <input {...p} type="date" className="input" value={f.from} onChange={set("from")} data-testid="revenue-filter-from" />}</Field>
        <Field label="Hasta">{(p) => <input {...p} type="date" className="input" value={f.to} onChange={set("to")} data-testid="revenue-filter-to" />}</Field>
        <Field label="Estado del pago">{(p) => <select {...p} className="input" value={f.status} onChange={set("status")} data-testid="revenue-filter-status">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
      </form>
      {loading && !data ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : (
        <>
          <dl className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(([l, v, id]) => <div key={id} className="card"><dd className="num text-3xl font-bold" data-testid={id}>{v}</dd><dt className="mt-1 text-sm font-semibold text-[#3c3829]">{l}</dt></div>)}
          </dl>
          {!data.items.length ? <Empty icon={Banknote} title="Sin transacciones">Todavía no hay pagos de clases personalizadas con estos filtros.</Empty> : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[1100px] text-left text-sm" data-testid="revenue-table">
                <thead className="bg-sand text-xs uppercase tracking-wide"><tr>
                  {["Fecha de operación", "Confirmación", "Reservación", "ID de pago", "Alumno", "Instructor", "Precio", "Comisión", "Retenido plataforma", "Neto instructor", "Estado", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="px-3 py-2">{fmtDateTime(r.created)}</td>
                      <td className="px-3 py-2">{r.confirmed_at ? fmtDateTime(r.confirmed_at) : "—"}</td>
                      <td className="num px-3 py-2 font-semibold">{r.booking_code}</td>
                      <td className="num max-w-[10rem] truncate px-3 py-2 text-xs" title={r.payment_intent_id || r.checkout_session_id}>{r.payment_intent_id || "—"}</td>
                      <td className="px-3 py-2">{r.student_name}</td>
                      <td className="px-3 py-2">{r.instructor_name}</td>
                      <td className="num px-3 py-2">{money(r.amount_mxn)}</td>
                      <td className="num px-3 py-2">{r.commission_pct}%</td>
                      <td className="num px-3 py-2">{money(r.commission_mxn)}<span className="block text-xs text-[#4b4638]">{r.commission_label}</span></td>
                      <td className="num px-3 py-2">{money(r.instructor_net_mxn)}</td>
                      <td className="px-3 py-2"><span className={`chip ${ST[r.status] || ""}`}>{r.status_label}</span>{!r.livemode && <span className="mt-1 block text-xs text-[#4b4638]">Modo prueba</span>}{r.refunded_at && <span className="block text-xs">Reembolso {money(r.refunded_mxn)} · {fmtDateTime(r.refunded_at)}</span>}</td>
                      <td className="px-3 py-2">{r.status === "paid" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefund(r)} data-testid={`refund-button-${r.booking_code}`}><Undo2 size={14} aria-hidden="true" />Reembolsar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {refund && <RefundModal item={refund} onClose={() => setRefund(null)} onDone={reload} />}
    </>
  );
}
