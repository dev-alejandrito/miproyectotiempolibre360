// TIEMPO LIBRE 360 — integraciones con Google (cuenta de la plataforma alejandroortizcalles@gmail.com):
//  1) recibos de clases pagadas por Gmail, 2) avisos al administrador por Gmail,
//  3) invitaciones de Google Calendar para clases confirmadas, 4) registro de comisiones en Google Sheets.
// Todo pasa por una cola (integration_jobs): si Google falla, la app sigue funcionando, el error queda
// registrado y se reintenta (máx. 5). Claves de deduplicación y operaciones idempotentes evitan duplicados.
import { getRequest } from "@tanstack/react-start/server";
import { db, q, displayName } from "./core.server.js";
import { sendMail } from "./security.server.js";

const TZ = "America/Mexico_City";
const BASE = () => (String(process.env.INTEGRATION_PROXY_URL || "").trim() || "https://integrations.emergentagent.com").replace(/\/$/, "");
const ADMIN_EMAIL = () => String(process.env.ADMIN_ALERT_EMAIL || "alejandroortizcalles@gmail.com").trim();
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
export const money = (n) => MXN.format(Number(n || 0)) + " MXN";
export const fmtMx = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }) : "");
const shortMx = (iso) => {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

// ---------- tokens de Google (conexiones de Emergent; nunca se exponen al navegador) ----------
const tokens = {};
async function googleToken(envName, fresh) {
  const conn = process.env[envName];
  if (!process.env.EMERGENT_LLM_KEY || !conn) throw new Error("Falta configurar " + envName);
  const c = tokens[conn];
  if (!fresh && c && Date.now() < c.exp - 60000) return c.token;
  const r = await fetch(BASE() + "/connectors/v2/access-token", { method: "POST", headers: { Authorization: "Bearer " + process.env.EMERGENT_LLM_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ connection_id: conn }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("token " + envName + " " + (b.code || r.status));
  const exp = Date.parse(b.expires_at || "");
  tokens[conn] = { token: b.access_token, exp: isNaN(exp) ? Date.now() + 300000 : exp };
  return b.access_token;
}
async function google(envName, method, url, body) {
  for (const fresh of [false, true]) {
    const t = await googleToken(envName, fresh);
    const r = await fetch(url, { method, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && !fresh) continue;
    const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, body: j };
  }
}

function appOrigin() {
  const env = String(process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
  if (/^https?:\/\//.test(env)) return env;
  try {
    const h = getRequest()?.headers;
    const origin = h && h.get("origin");
    if (origin && /^https?:\/\/[^\s/]+$/.test(origin)) return origin;
    const host = h && (h.get("x-forwarded-host") || h.get("host"));
    if (host && /^[a-z0-9.:-]+$/i.test(host)) return (host.startsWith("localhost") ? "http://" : "https://") + host;
  } catch { /* sin petición (webhook) */ }
  return "";
}

// ---------- cola ----------
export async function enqueue(kind, { dedupe = "", subject = "", payload = {} } = {}) {
  try {
    const { error } = await db.from("integration_jobs").insert({ kind, dedupe_key: dedupe, subject: String(subject || ""), payload });
    if (error && error.code !== "23505") console.error("enqueue failed", kind, error.message);
  } catch (err) { console.error("enqueue failed", kind, err); }
}
export async function enqueueEmail(dedupe, to, subject, text) {
  if (!to) return;
  await enqueue("email", { dedupe, payload: { to, subject, text } });
}

async function runJob(job) {
  if (job.kind === "email") { const id = await sendMail(job.payload); return { gmail_id: id }; }
  if (job.kind === "calendar_sync") return await calendarSync(job.subject);
  if (job.kind === "sheet_sync") return await sheetSync(job.subject);
  throw new Error("tipo desconocido");
}
export async function runJobs(limit = 6) {
  let done = 0;
  try {
    const rows = await q(db.from("integration_jobs").select("*").in("status", ["pending", "failed"]).lt("attempts", 5).gt("created", new Date(Date.now() - 14 * 86400000).toISOString()).order("created", { ascending: true }).limit(limit));
    for (const job of rows) {
      if (job.kind !== "email") {
        const busy = await q(db.from("integration_jobs").select("id").eq("kind", job.kind).eq("subject", job.subject).eq("status", "sending").limit(1));
        if (busy.length) continue;
      }
      const claim = await q(db.from("integration_jobs").update({ status: "sending", attempts: Number(job.attempts) + 1 }).eq("id", job.id).eq("status", job.status).select("id"));
      if (!claim.length) continue;
      try {
        const result = await runJob(job);
        await q(db.from("integration_jobs").update({ status: "done", result: result || {}, error: "", done_at: new Date().toISOString() }).eq("id", job.id));
        done++;
      } catch (err) {
        const msg = String((err && err.message) || err).slice(0, 300);
        console.error("integration job failed", job.kind, msg);
        await q(db.from("integration_jobs").update({ status: "failed", error: msg }).eq("id", job.id));
      }
    }
  } catch (err) { console.error("runJobs failed", err); }
  return { done };
}
// Con tope de tiempo: la acción del usuario nunca espera a Google más de `ms`.
export function kickJobs(ms = 3500) {
  return Promise.race([runJobs(6), new Promise((r) => setTimeout(() => r({ timeout: true }), ms))]).catch(() => ({}));
}

// ---------- 1) recibos ----------
export function receiptText(role, b, p, names) {
  const lines = [
    "Hola " + (role === "student" ? names.student : names.instructor) + ",",
    "",
    role === "student" ? "Recibimos tu pago. Este es el recibo de tu clase personalizada:" : "Se confirmó el pago de una de tus clases personalizadas. Este es el recibo:",
    "",
    "Clase: " + b.title,
    "Reservación: " + b.code,
    "Fecha de la clase: " + fmtMx(b.starts_at) + " (hora de Ciudad de México)",
    "Alumno: " + names.student,
    "Instructor: " + names.instructor,
    "",
    "Precio total: " + money(p.amount_mxn),
    "Comisión de la plataforma (" + Number(p.commission_pct) + "%): " + money(p.commission_mxn),
    "Importe neto del instructor (" + (100 - Number(p.commission_pct)) + "%): " + money(p.instructor_net_mxn),
    "",
    "Estado del pago: Pagado (confirmado por Stripe el " + fmtMx(p.confirmed_at) + ")",
    "Identificador del pago: " + (p.payment_intent_id || p.id),
    p.livemode ? "" : "Operación en MODO PRUEBA de Stripe: no se realizó un cobro real.",
    "",
    "El precio publicado ya incluye la comisión; no hay cargos adicionales.",
    "TIEMPO LIBRE 360",
  ];
  return lines.filter((x, i) => x !== "" || lines[i - 1] !== "").join("\n");
}
// Solo se llama cuando Stripe confirmó el pago (markPaid). Claves únicas por pago y destinatario.
export async function onPaymentConfirmed(paymentId) {
  try {
    const p = await q(db.from("class_payments").select("*").eq("id", paymentId).maybeSingle());
    if (!p || p.status !== "paid" || !p.confirmed_at) return;
    const b = await q(db.from("private_bookings").select("*").eq("id", p.booking).single());
    const ms = await q(db.from("members").select("id, name, email").in("id", [p.student, p.instructor]));
    const m = Object.fromEntries(ms.map((x) => [x.id, x]));
    const names = { student: displayName(m[p.student]?.name || "Alumno"), instructor: displayName(m[p.instructor]?.name || "Instructor") };
    const subj = "Recibo de clase personalizada " + b.code + " · " + money(p.amount_mxn);
    await enqueueEmail("receipt:" + p.id + ":student", m[p.student]?.email, subj, receiptText("student", b, p, names));
    await enqueueEmail("receipt:" + p.id + ":instructor", m[p.instructor]?.email, subj, receiptText("instructor", b, p, names));
    await enqueue("sheet_sync", { subject: p.id });
    await enqueue("calendar_sync", { subject: b.id });
  } catch (err) { console.error("onPaymentConfirmed failed", err); }
}
export async function onPaymentChanged(paymentId) { await enqueue("sheet_sync", { subject: paymentId }); }
export async function onBookingChanged(bookingId) { await enqueue("calendar_sync", { subject: bookingId }); }

// ---------- 2) avisos al administrador ----------
export async function adminAlert(dedupe, title, fields, path) {
  const origin = appOrigin();
  const text = ["Hola,", "", "Hay un caso nuevo en TIEMPO LIBRE 360:", "", "Tipo: " + title, ...fields.filter(Boolean), "Fecha: " + fmtMx(new Date().toISOString()) + " (hora de Ciudad de México)", "", "Revísalo en el panel administrativo: " + (origin ? origin + path : path + " (inicia sesión como administrador)"), "", "Aviso automático. No incluye contraseñas ni datos bancarios.", "TIEMPO LIBRE 360"].join("\n");
  await enqueueEmail("admin:" + dedupe, ADMIN_EMAIL(), "[TIEMPO LIBRE 360] " + title, text);
}

// ---------- 3) Google Calendar (invitaciones desde el calendario de la plataforma) ----------
export const eventIdFor = (bookingId) => "tl360" + String(bookingId).replace(/-/g, "").toLowerCase();
export function eventBody(b, names, emails) {
  const isLink = /^https?:\/\//i.test(String(b.place || "").trim());
  const desc = [
    "Clase personalizada de TIEMPO LIBRE 360",
    "Reservación: " + b.code,
    "Habilidad: " + b.skill_name,
    "Instructor: " + names.instructor,
    "Alumno: " + names.student,
    "Duración: " + b.minutes + " minutos",
    "Modalidad: " + (b.mode === "virtual" ? "En línea" : b.mode === "presencial" ? "Presencial" : b.mode),
    isLink ? "Enlace de la clase: " + b.place.trim() : b.place ? "Lugar: " + b.place : "",
  ].filter(Boolean).join("\n");
  return {
    id: eventIdFor(b.id), status: "confirmed",
    summary: "Clase personalizada: " + b.title,
    description: desc,
    location: b.place ? String(b.place).slice(0, 300) : undefined,
    start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: TZ },
    end: { dateTime: new Date(b.ends_at || new Date(b.starts_at).getTime() + Number(b.minutes) * 60000).toISOString(), timeZone: TZ },
    attendees: emails.filter(Boolean).map((email) => ({ email })),
    guestsCanInviteOthers: false, guestsCanModify: false,
    source: isLink ? { title: "Enlace de la clase", url: b.place.trim() } : undefined,
  };
}
export async function calendarSync(bookingId) {
  const b = await q(db.from("private_bookings").select("*").eq("id", bookingId).maybeSingle());
  if (!b) return { skipped: "no booking" };
  const cal = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  const base = "https://www.googleapis.com/calendar/v3/calendars/" + cal + "/events";
  const eid = eventIdFor(b.id);
  if (b.status === "confirmed") {
    const ms = await q(db.from("members").select("id, name, email").in("id", [b.student, b.instructor]));
    const m = Object.fromEntries(ms.map((x) => [x.id, x]));
    const body = eventBody(b, { student: displayName(m[b.student]?.name || "Alumno"), instructor: displayName(m[b.instructor]?.name || "Instructor") }, [m[b.student]?.email, m[b.instructor]?.email]);
    // Mismo ID de evento por reservación: si existe se actualiza; si no, se crea (sin duplicados).
    const up = await google("GCAL_CONNECTION_ID", "PUT", base + "/" + eid + "?sendUpdates=all", body);
    if (up.ok) return { event: eid, action: "updated" };
    if (up.status !== 404) throw new Error("calendar " + up.status + " " + (up.body?.error?.message || ""));
    const ins = await google("GCAL_CONNECTION_ID", "POST", base + "?sendUpdates=all", body);
    if (ins.ok) return { event: eid, action: "created" };
    throw new Error("calendar " + ins.status + " " + (ins.body?.error?.message || ""));
  }
  if (b.status === "cancelled" || b.status === "rejected") {
    const del = await google("GCAL_CONNECTION_ID", "DELETE", base + "/" + eid + "?sendUpdates=all");
    if (del.ok || del.status === 404 || del.status === 410) return { event: eid, action: del.ok ? "cancelled" : "none" };
    throw new Error("calendar " + del.status + " " + (del.body?.error?.message || ""));
  }
  return { skipped: b.status };
}

// ---------- 4) Google Sheets (solo pagos confirmados; una fila por operación) ----------
export const SHEET_TAB = "Comisiones";
export const SHEET_HEADER = ["Fecha de confirmación", "ID de operación", "Mes", "Reservación", "Clase", "Importe total (MXN)", "% comisión", "Comisión plataforma (MXN)", "Neto instructor (MXN)", "Estado del pago", "ID de pago Stripe", "Fecha de reembolso", "Actualizado"];
const ST = { paid: "Pagado", refunding: "Reembolso en proceso", refunded: "Reembolsado" };
export function sheetRow(p, b) {
  return [shortMx(p.confirmed_at), p.id, shortMx(p.confirmed_at).slice(0, 7), p.booking_code, b ? b.title : "", Number(p.amount_mxn), Number(p.commission_pct) / 100, Number(p.commission_mxn), Number(p.instructor_net_mxn), ST[p.status] || p.status, p.payment_intent_id || "", shortMx(p.refunded_at), shortMx(new Date().toISOString())];
}
export async function sheetSync(paymentId) {
  const sid = process.env.COMMISSIONS_SHEET_ID;
  if (!sid) throw new Error("Falta configurar COMMISSIONS_SHEET_ID");
  const p = await q(db.from("class_payments").select("*").eq("id", paymentId).maybeSingle());
  if (!p || !p.confirmed_at || !ST[p.status]) return { skipped: p ? p.status : "no payment" };
  const b = await q(db.from("private_bookings").select("title").eq("id", p.booking).maybeSingle());
  const api = "https://sheets.googleapis.com/v4/spreadsheets/" + sid + "/values/";
  const col = await google("GSHEETS_CONNECTION_ID", "GET", api + encodeURIComponent(SHEET_TAB + "!B:B"));
  if (!col.ok) throw new Error("sheets " + col.status + " " + (col.body?.error?.message || ""));
  const ids = (col.body.values || []).map((r) => r[0]);
  const idx = ids.indexOf(p.id);
  const row = sheetRow(p, b);
  if (idx >= 1) {
    const r = await google("GSHEETS_CONNECTION_ID", "PUT", api + encodeURIComponent(`${SHEET_TAB}!A${idx + 1}:M${idx + 1}`) + "?valueInputOption=RAW", { values: [row] });
    if (!r.ok) throw new Error("sheets " + r.status);
    return { row: idx + 1, action: "updated" };
  }
  const r = await google("GSHEETS_CONNECTION_ID", "POST", api + encodeURIComponent(SHEET_TAB + "!A:M") + ":append?valueInputOption=RAW&insertDataOption=OVERWRITE", { values: [row] });
  if (!r.ok) throw new Error("sheets " + r.status);
  return { action: "appended", range: r.body?.updates?.updatedRange || "" };
}
