// TIEMPO LIBRE 360 — pagos de clases personalizadas con Stripe Connect (cargos con destino).
// El alumno paga el precio publicado; Stripe retiene la comisión de la plataforma (application_fee_amount)
// y transfiere el resto a la cuenta conectada del instructor. Una clase solo se marca como pagada
// cuando Stripe lo confirma (webhook firmado o consulta directa a Stripe desde el servidor).
// No se guardan datos de tarjetas: el pago ocurre en la página segura de Stripe Checkout.
import { getRequest } from "@tanstack/react-start/server";
import { db, q, fail, str, isUuid, displayName, membersMap, audit, notify, settings, TLError } from "./core.server.js";

const API = "https://api.stripe.com/v1";
export const PAY_LABEL = { pending: "Pago pendiente", paid: "Pagado", refunding: "Reembolso en proceso", refunded: "Reembolsado", expired: "Pago expirado", failed: "Pago fallido" };
export const COMM_LABEL = { pending: "Pendiente", collected: "Cobrada", reversed: "Revertida", none: "Sin comisión" };

// ---------- cálculo de comisión (precio publicado = total que paga el alumno) ----------
export function splitAmount(priceMxn, pct) {
  const total = Math.round(Number(priceMxn) * 100);
  const p = Number(pct);
  if (!(total > 0)) throw new TLError(400, "Precio no válido.");
  if (!(p >= 0 && p <= 50)) throw new TLError(500, "Porcentaje de comisión no válido.");
  const fee = Math.round((total * p) / 100);
  return { pct: p, total_cents: total, fee_cents: fee, net_cents: total - fee, total: total / 100, fee: fee / 100, net: (total - fee) / 100 };
}
export async function commissionPct() {
  const s = await settings();
  const n = parseFloat(s.commission_pct);
  return n >= 0 && n <= 50 ? n : 10;
}

// ---------- cliente de Stripe (REST, solo en el servidor) ----------
export function stripeKey() {
  const k = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!k) fail("Los pagos en línea aún no están activados: falta configurar la clave secreta de Stripe.", 503);
  // Modo prueba por defecto: una clave real solo se acepta con autorización explícita (STRIPE_LIVE_ENABLED=1).
  if (!k.startsWith("sk_test_") && !(k.startsWith("sk_live_") && process.env.STRIPE_LIVE_ENABLED === "1")) fail("Los pagos reales no están autorizados todavía. Usa una clave de prueba de Stripe.", 503);
  return k;
}
export function paymentsEnabled() { try { stripeKey(); return true; } catch { return false; } }
function encode(obj, prefix, out) {
  out = out || [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + "[" + k + "]" : k;
    if (typeof v === "object") encode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}
async function stripe(method, path, params, idem) {
  const headers = { Authorization: "Bearer " + stripeKey(), "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" };
  if (idem) headers["Idempotency-Key"] = idem;
  const url = API + path + (method === "GET" && params ? "?" + encode(params) : "");
  const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : encode(params || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("stripe error", path, res.status, data && data.error && data.error.message);
    fail("Stripe respondió: " + ((data && data.error && data.error.message) || "error " + res.status), res.status >= 500 ? 502 : 400);
  }
  return data;
}
function appOrigin() {
  const env = String(process.env.APP_PUBLIC_URL || "").replace(/\/+$/, "");
  if (/^https?:\/\//.test(env)) return env;
  const req = getRequest();
  const h = req && req.headers;
  const origin = h && h.get("origin");
  if (origin && /^https?:\/\/[^\s/]+$/.test(origin)) return origin;
  const host = h && (h.get("x-forwarded-host") || h.get("host"));
  if (host && /^[a-z0-9.:-]+$/i.test(host)) return (host.startsWith("localhost") ? "http://" : "https://") + host;
  fail("No pudimos determinar la dirección de la aplicación.", 500);
}

// ---------- cuentas conectadas (instructores) ----------
async function refreshAccount(row) {
  const a = await stripe("GET", "/accounts/" + encodeURIComponent(row.account_id));
  const patch = { charges_enabled: !!a.charges_enabled, payouts_enabled: !!a.payouts_enabled, details_submitted: !!a.details_submitted, livemode: !!a.livemode, updated: new Date().toISOString() };
  await q(db.from("payout_accounts").update(patch).eq("member", row.member));
  return { ...row, ...patch };
}
function accountView(row) {
  if (!row) return { connected: false, ready: false };
  return { connected: true, ready: !!row.charges_enabled, charges_enabled: !!row.charges_enabled, payouts_enabled: !!row.payouts_enabled, details_submitted: !!row.details_submitted, livemode: !!row.livemode };
}
export async function payAccount(me) {
  const enabled = paymentsEnabled();
  let row = await q(db.from("payout_accounts").select("*").eq("member", me.id).maybeSingle());
  if (row && enabled) { try { row = await refreshAccount(row); } catch (err) { console.error("refresh account failed", err); } }
  return { enabled, commission_pct: await commissionPct(), account: accountView(row) };
}
export async function payOnboard(me) {
  const acc = await q(db.from("accreditations").select("id").eq("member", me.id).eq("status", "approved").limit(1));
  if (!acc.length) fail("Necesitas al menos una habilidad acreditada para recibir pagos como instructor.", 403);
  let row = await q(db.from("payout_accounts").select("*").eq("member", me.id).maybeSingle());
  if (!row) {
    const a = await stripe("POST", "/accounts", {
      type: "express", country: "MX", email: me.email || undefined, business_type: "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { member: me.id, platform: "TIEMPO LIBRE 360" },
    }, "acct:" + me.id);
    const { error } = await db.from("payout_accounts").insert({ member: me.id, provider: "stripe", account_id: a.id, livemode: !!a.livemode });
    if (error && error.code !== "23505") throw error;
    row = await q(db.from("payout_accounts").select("*").eq("member", me.id).single());
    await audit(me, "payout_account_created", me.id, a.id);
  }
  const origin = appOrigin();
  const link = await stripe("POST", "/account_links", { account: row.account_id, type: "account_onboarding", refresh_url: origin + "/app/clases-particulares?tab=myoffers&stripe=refresh", return_url: origin + "/app/clases-particulares?tab=myoffers&stripe=return" });
  return { url: link.url };
}

// ---------- pagos de reservaciones ----------
export function payView(p) {
  if (!p) return null;
  return {
    id: p.id, status: p.status, status_label: PAY_LABEL[p.status] || p.status, commission_status: p.commission_status, commission_label: COMM_LABEL[p.commission_status] || p.commission_status,
    amount_mxn: Number(p.amount_mxn), commission_pct: Number(p.commission_pct), commission_mxn: Number(p.commission_mxn), instructor_net_mxn: Number(p.instructor_net_mxn),
    payment_intent_id: p.payment_intent_id || "", refunded_mxn: Number(p.refunded_mxn || 0), refund_reason: p.refund_reason || "", refunded_at: p.refunded_at || "",
    created: p.created, confirmed_at: p.confirmed_at || "", livemode: !!p.livemode,
  };
}
export async function paymentsFor(bookingIds) {
  const ids = [...new Set(bookingIds.filter(isUuid))];
  const out = {};
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await q(db.from("class_payments").select("*").in("booking", ids.slice(i, i + 200)));
    rows.forEach((r) => { out[r.booking] = r; });
  }
  return out;
}

export async function checkout(me, bookingId) {
  const b = isUuid(bookingId) ? await q(db.from("private_bookings").select("*").eq("id", bookingId).maybeSingle()) : null;
  if (!b || b.student !== me.id) fail("No encontramos esa clase.", 404);
  if (b.payment_method !== "stripe") fail("Esta clase se paga directamente con el instructor.");
  if (b.status !== "accepted") fail("Solo puedes pagar una clase que el instructor ya aceptó.");
  if (new Date(b.starts_at).getTime() < Date.now()) fail("El horario de esta clase ya pasó.");
  const acc = await q(db.from("payout_accounts").select("*").eq("member", b.instructor).maybeSingle());
  const fresh = acc ? await refreshAccount(acc) : null;
  if (!fresh || !fresh.charges_enabled) fail("El instructor todavía no termina de configurar su cuenta para recibir pagos. Inténtalo más tarde.");
  let p = await q(db.from("class_payments").select("*").eq("booking", b.id).maybeSingle());
  if (p && ["paid", "refunding", "refunded"].includes(p.status)) fail("Esta clase ya tiene un pago registrado.", 409);
  // Reutiliza la sesión abierta para no generar cobros duplicados.
  if (p && p.checkout_session_id && p.status === "pending") {
    const s = await stripe("GET", "/checkout/sessions/" + encodeURIComponent(p.checkout_session_id));
    if (s.payment_status === "paid") { await markPaid(s); fail("Este pago ya fue confirmado.", 409); }
    if (s.status === "open" && s.url) return { url: s.url };
  }
  if (!p) {
    const sp = splitAmount(b.price_mxn, await commissionPct());
    const { error } = await db.from("class_payments").insert({
      booking: b.id, booking_code: b.code, student: b.student, instructor: b.instructor, provider: "stripe", destination_account: fresh.account_id,
      amount_mxn: sp.total, commission_pct: sp.pct, commission_mxn: sp.fee, instructor_net_mxn: sp.net, status: "pending", commission_status: "pending",
    });
    if (error && error.code !== "23505") throw error;
    p = await q(db.from("class_payments").select("*").eq("booking", b.id).single());
  }
  const attempt = Number(p.attempts || 0) + 1;
  const origin = appOrigin();
  const total = Math.round(Number(p.amount_mxn) * 100), fee = Math.round(Number(p.commission_mxn) * 100);
  const s = await stripe("POST", "/checkout/sessions", {
    mode: "payment", customer_email: me.email || undefined, client_reference_id: b.id,
    line_items: { 0: { quantity: 1, price_data: { currency: "mxn", unit_amount: total, product_data: { name: "Clase personalizada: " + str(b.title, 200), description: b.code + " · " + b.skill_name } } } },
    payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: p.destination_account || fresh.account_id }, metadata: { booking: b.id, payment: p.id, code: b.code }, description: "TIEMPO LIBRE 360 · " + b.code },
    metadata: { booking: b.id, payment: p.id, code: b.code },
    success_url: origin + "/app/clases-particulares?tab=mine&pago=ok&clase=" + b.id,
    cancel_url: origin + "/app/clases-particulares?tab=mine&pago=cancelado&clase=" + b.id,
  }, "checkout:" + p.id + ":" + attempt);
  await q(db.from("class_payments").update({ checkout_session_id: s.id, status: "pending", attempts: attempt, livemode: !!s.livemode, updated: new Date().toISOString() }).eq("id", p.id).in("status", ["pending", "expired", "failed"]));
  return { url: s.url };
}

// Confirmación idempotente: solo con datos que vienen de Stripe y coinciden con lo registrado.
export async function markPaid(session) {
  if (!session || session.object !== "checkout.session" || session.payment_status !== "paid") return false;
  const pid = session.metadata && session.metadata.payment;
  if (!isUuid(pid)) return false;
  const p = await q(db.from("class_payments").select("*").eq("id", pid).maybeSingle());
  if (!p) return false;
  if (p.checkout_session_id && p.checkout_session_id !== session.id) {
    // Sesión anterior pagada: se acepta solo si el monto coincide (Stripe la confirmó igualmente).
    console.warn("payment for previous session", session.id);
  }
  const total = Math.round(Number(p.amount_mxn) * 100);
  if (Number(session.amount_total) !== total || String(session.currency).toLowerCase() !== "mxn") { console.error("amount mismatch", session.id); return false; }
  const now = new Date().toISOString();
  const upd = await q(db.from("class_payments").update({ status: "paid", commission_status: "collected", payment_intent_id: String(session.payment_intent || ""), checkout_session_id: session.id, livemode: !!session.livemode, confirmed_at: now, updated: now }).eq("id", p.id).in("status", ["pending", "expired", "failed"]).select("id"));
  if (!upd.length) return false; // ya estaba confirmado: no se duplica
  const b = await q(db.from("private_bookings").select("*").eq("id", p.booking).single());
  const hist = (Array.isArray(b.history) ? b.history : []).concat([{ at: now, by: "Stripe", action: "Pago confirmado por Stripe", from: b.status, to: "confirmed" }]).slice(-100);
  if (b.status === "accepted") await q(db.from("private_bookings").update({ status: "confirmed", updated: now, history: hist }).eq("id", b.id).eq("status", "accepted"));
  else await q(db.from("private_bookings").update({ history: hist, updated: now }).eq("id", b.id));
  await notify(b.instructor, "private_class", "Pago confirmado · " + b.code, "Recibirás $" + Number(p.instructor_net_mxn).toFixed(2) + " MXN en tu cuenta de Stripe.", "/app/clases-particulares");
  await notify(b.student, "private_class", "Pago confirmado · " + b.code, "Tu clase «" + b.title + "» quedó confirmada.", "/app/clases-particulares");
  return true;
}
export async function paySync(me, bookingId) {
  const b = isUuid(bookingId) ? await q(db.from("private_bookings").select("id, student, instructor").eq("id", bookingId).maybeSingle()) : null;
  if (!b || (b.student !== me.id && b.instructor !== me.id)) fail("No encontramos esa clase.", 404);
  const p = await q(db.from("class_payments").select("*").eq("booking", b.id).maybeSingle());
  if (!p || !p.checkout_session_id) return { status: p ? p.status : "none" };
  if (p.status === "pending") {
    const s = await stripe("GET", "/checkout/sessions/" + encodeURIComponent(p.checkout_session_id));
    if (s.payment_status === "paid") await markPaid(s);
    else if (s.status === "expired") await q(db.from("class_payments").update({ status: "expired", updated: new Date().toISOString() }).eq("id", p.id).eq("status", "pending"));
  }
  const now = await q(db.from("class_payments").select("status").eq("id", p.id).single());
  return { status: now.status, status_label: PAY_LABEL[now.status] };
}

// Reembolso total (sin cargos adicionales): revierte la transferencia al instructor y la comisión de la plataforma.
export async function refundBooking(actor, bookingId, reason) {
  const p = await q(db.from("class_payments").select("*").eq("booking", bookingId).maybeSingle());
  if (!p || p.status !== "paid") return false;
  const claim = await q(db.from("class_payments").update({ status: "refunding", updated: new Date().toISOString() }).eq("id", p.id).eq("status", "paid").select("id"));
  if (!claim.length) fail("Este pago ya se está reembolsando o ya fue reembolsado.", 409);
  let r;
  try {
    r = await stripe("POST", "/refunds", { payment_intent: p.payment_intent_id, reverse_transfer: "true", refund_application_fee: "true", metadata: { booking: p.booking, payment: p.id } }, "refund:" + p.id);
  } catch (err) {
    await q(db.from("class_payments").update({ status: "paid", updated: new Date().toISOString() }).eq("id", p.id).eq("status", "refunding"));
    throw err;
  }
  const now = new Date().toISOString();
  await q(db.from("class_payments").update({ status: "refunded", commission_status: "reversed", refund_id: r.id, refunded_mxn: Number(r.amount || 0) / 100, refund_reason: str(reason, 500), refunded_by: actor ? actor.name : "Sistema", refunded_at: now, updated: now }).eq("id", p.id).eq("status", "refunding"));
  await audit(actor, "class_refund", p.booking, p.booking_code + " · " + r.id + " · $" + (Number(r.amount || 0) / 100).toFixed(2) + " MXN");
  await notify(p.student, "private_class", "Reembolso registrado · " + p.booking_code, "Stripe devolverá $" + (Number(r.amount || 0) / 100).toFixed(2) + " MXN a tu método de pago.", "/app/clases-particulares");
  await notify(p.instructor, "private_class", "Clase reembolsada · " + p.booking_code, str(reason, 160), "/app/clases-particulares");
  return true;
}
export async function adminRefund(me, bookingId, b) {
  const reason = str(b.reason, 500);
  if (reason.length < 5) fail("Escribe el motivo del reembolso (mínimo 5 caracteres).");
  const bk = isUuid(bookingId) ? await q(db.from("private_bookings").select("*").eq("id", bookingId).maybeSingle()) : null;
  if (!bk) fail("No encontramos esa clase.", 404);
  if (!(await refundBooking(me, bk.id, reason))) fail("Esta clase no tiene un pago confirmado para reembolsar.");
  if (bk.status !== "cancelled") {
    const now = new Date().toISOString();
    const hist = (Array.isArray(bk.history) ? bk.history : []).concat([{ at: now, by: "Administración", action: "Reembolso registrado", from: bk.status, to: "cancelled", note: reason }]).slice(-100);
    await q(db.from("private_bookings").update({ status: "cancelled", updated: now, history: hist }).eq("id", bk.id));
  }
  return { ok: true };
}

// ---------- webhook de Stripe (firma verificada) ----------
async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
export async function verifySignature(payload, header, secret, toleranceSec = 300) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(",").map((kv) => kv.split("=")).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header).split(",").filter((x) => x.trim().startsWith("v1=")).map((x) => x.trim().slice(3));
  const t = parseInt(parts.t, 10);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, t + "." + payload);
  return sigs.some((s) => safeEq(s, expected));
}
export async function handleWebhook(payload, header) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "");
  if (!secret) return { status: 503, body: "webhook not configured" };
  if (!(await verifySignature(payload, header, secret))) return { status: 400, body: "invalid signature" };
  let evt; try { evt = JSON.parse(payload); } catch { return { status: 400, body: "invalid json" }; }
  const { error } = await db.from("payment_events").insert({ id: String(evt.id), type: String(evt.type) });
  if (error) { if (error.code === "23505") return { status: 200, body: "duplicate" }; throw error; }
  const obj = evt.data && evt.data.object;
  try {
    if (evt.type === "checkout.session.completed" || evt.type === "checkout.session.async_payment_succeeded") await markPaid(obj);
    else if (evt.type === "checkout.session.expired" && obj && obj.metadata && isUuid(obj.metadata.payment)) await q(db.from("class_payments").update({ status: "expired", updated: new Date().toISOString() }).eq("id", obj.metadata.payment).eq("status", "pending").eq("checkout_session_id", obj.id));
    else if (evt.type === "account.updated" && obj && obj.id) await q(db.from("payout_accounts").update({ charges_enabled: !!obj.charges_enabled, payouts_enabled: !!obj.payouts_enabled, details_submitted: !!obj.details_submitted, updated: new Date().toISOString() }).eq("account_id", obj.id));
  } catch (err) {
    await db.from("payment_events").delete().eq("id", String(evt.id)); // permite que Stripe reintente
    throw err;
  }
  return { status: 200, body: "ok" };
}

// ---------- panel administrativo: ingresos y comisiones ----------
const MX_OFFSET = "-06:00"; // Ciudad de México (sin horario de verano desde 2022)
export async function adminRevenue(qy) {
  const from = str(qy.from, 10), to = str(qy.to, 10), status = str(qy.status, 20);
  let b = db.from("class_payments").select("*").order("created", { ascending: false }).limit(1000);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) b = b.gte("created", from + "T00:00:00" + MX_OFFSET);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) b = b.lte("created", to + "T23:59:59.999" + MX_OFFSET);
  if (status && PAY_LABEL[status]) b = b.eq("status", status);
  const rows = await q(b);
  const names = await membersMap(rows.flatMap((r) => [r.student, r.instructor]));
  const sum = (list, k) => Math.round(list.reduce((a, r) => a + Number(r[k] || 0), 0) * 100) / 100;
  const paid = rows.filter((r) => r.status === "paid" || r.status === "refunding");
  const pending = rows.filter((r) => r.status === "pending");
  const refunded = rows.filter((r) => r.status === "refunded");
  return {
    commission_pct: await commissionPct(), enabled: paymentsEnabled(),
    totals: {
      platform_income: sum(paid, "commission_mxn"), commissions_collected: sum(paid, "commission_mxn"), commissions_pending: sum(pending, "commission_mxn"),
      paid_classes: paid.length, gross_paid: sum(paid, "amount_mxn"), instructor_net: sum(paid, "instructor_net_mxn"),
      refunds: refunded.length, refunded_mxn: sum(refunded, "refunded_mxn"), commissions_reversed: sum(refunded, "commission_mxn"),
    },
    items: rows.map((r) => ({
      ...payView(r), booking: r.booking, booking_code: r.booking_code, checkout_session_id: r.checkout_session_id || "",
      student_name: names[r.student] ? displayName(names[r.student].name) : "Miembro", instructor_name: names[r.instructor] ? displayName(names[r.instructor].name) : "Miembro",
    })),
    labels: PAY_LABEL,
  };
}

export async function instructorReady(memberId) {
  const row = await q(db.from("payout_accounts").select("charges_enabled").eq("member", memberId).maybeSingle());
  return !!(row && row.charges_enabled);
}
