// TIEMPO LIBRE 360 — avisos de seguridad por correo (Gmail de alejandroortizcalles@gmail.com).
// Los eventos los registra la base de datos (triggers en auth.users y auth.sessions, migración 0007);
// aquí solo se envían. Un fallo de Gmail nunca bloquea el registro ni el inicio de sesión:
// el evento queda pendiente y se reintenta (máx. 5 intentos). Cada evento genera un solo correo.
import { db, q } from "./core.server.js";

const CONNECTORS_BASE = () => (String(process.env.INTEGRATION_PROXY_URL || "").trim() || "https://integrations.emergentagent.com").replace(/\/$/, "");
// El remitente es siempre la cuenta de Gmail conectada (Gmail no permite enviar como otra dirección).
let sender = "";
let cached = { token: "", exp: 0 };

export function mailConfigured() { return !!(process.env.EMERGENT_LLM_KEY && process.env.GMAIL_CONNECTION_ID); }

async function gmailToken(fresh) {
  if (!fresh && cached.token && Date.now() < cached.exp - 60000) return cached.token;
  const r = await fetch(CONNECTORS_BASE() + "/connectors/v2/access-token", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.EMERGENT_LLM_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: process.env.GMAIL_CONNECTION_ID }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("gmail token " + (body.code || r.status));
  const exp = Date.parse(body.expires_at || "");
  cached = { token: body.access_token, exp: isNaN(exp) ? Date.now() + 300000 : exp };
  return cached.token;
}

// Base64 UTF-8 compatible con Node y Workers (sin Buffer).
const b64 = (s) => { const bytes = new TextEncoder().encode(String(s)); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const b64url = (s) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const clean = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim();

export function buildMessage({ to, subject, text, from }) {
  return [
    "From: TIEMPO LIBRE 360 <" + clean(from || sender || "alejandroortizcalles@gmail.com") + ">",
    "To: " + clean(to),
    "Subject: =?UTF-8?B?" + b64(clean(subject)) + "?=",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");
}

export async function sendMail(msg) {
  if (!mailConfigured()) throw new Error("correo no configurado");
  if (!sender) {
    const p = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + (await gmailToken(false)) } });
    const pj = await p.json().catch(() => ({}));
    if (p.ok && pj.emailAddress) sender = pj.emailAddress;
  }
  const raw = b64url(buildMessage({ ...msg, from: sender }));
  for (const fresh of [false, true]) {
    const token = await gmailToken(fresh);
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
    });
    if (r.status === 401 && !fresh) continue;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("gmail " + r.status + " " + ((body.error && body.error.message) || ""));
    return body.id;
  }
}

// «Chrome en Windows», «Safari en iPhone»… sin IP ni datos sensibles.
export function deviceLabel(ua) {
  const u = String(ua || "");
  const b = /Edg\//.test(u) ? "Edge" : /OPR\/|Opera/.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "";
  const o = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "";
  return b && o ? b + " en " + o : b || o || "un navegador o dispositivo no identificado";
}
const fmtMx = (iso) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short" });

export function composeSecurityEmail(ev, name) {
  const when = fmtMx(ev.created);
  const hola = "Hola" + (name ? " " + String(name).split(/\s+/)[0] : "") + ",";
  const notYou = "Si no fuiste tú, cambia tu contraseña de inmediato desde «¿Olvidaste tu contraseña?» en la página de inicio de sesión y escríbenos a alejandroortizcalles@gmail.com.";
  if (ev.kind === "password_changed") {
    return { subject: "Aviso de seguridad: se cambió tu contraseña", text: [hola, "", "Tipo de evento: cambio de contraseña", "Fecha y hora: " + when + " (hora de Ciudad de México)", "", "La contraseña de tu cuenta de TIEMPO LIBRE 360 se cambió.", "Si fuiste tú, no necesitas hacer nada.", notYou, "", "Este es un aviso automático; nunca te pediremos tu contraseña.", "TIEMPO LIBRE 360"].join("\n") };
  }
  return { subject: "Aviso de seguridad: nuevo inicio de sesión", text: [hola, "", "Tipo de evento: inicio de sesión desde un navegador o dispositivo nuevo", "Dispositivo: " + deviceLabel(ev.device_label), "Fecha y hora: " + when + " (hora de Ciudad de México)", "", "Si fuiste tú, no necesitas hacer nada. No volveremos a avisarte por este mismo navegador.", notYou, "", "Este es un aviso automático; nunca te pediremos tu contraseña.", "TIEMPO LIBRE 360"].join("\n") };
}

// Envía hasta `limit` avisos pendientes. Nunca lanza errores hacia quien la llama.
export async function flushSecurity(limit = 5) {
  if (!mailConfigured()) return { sent: 0, skipped: true };
  let sent = 0;
  try {
    const rows = await q(db.from("security_events").select("*").in("status", ["pending", "failed"]).lt("attempts", 5).gt("created", new Date(Date.now() - 7 * 86400000).toISOString()).order("created", { ascending: true }).limit(limit));
    for (const ev of rows) {
      // Reclamo atómico: un evento solo lo envía una petición (evita correos duplicados).
      const claim = await q(db.from("security_events").update({ status: "sending", attempts: Number(ev.attempts) + 1 }).eq("id", ev.id).eq("status", ev.status).select("id"));
      if (!claim.length) continue;
      try {
        const m = await q(db.from("members").select("email, name").eq("id", ev.member).maybeSingle());
        if (!m || !m.email) throw new Error("sin correo");
        await sendMail({ to: m.email, ...composeSecurityEmail(ev, m.name) });
        await q(db.from("security_events").update({ status: "sent", sent_at: new Date().toISOString(), error: "" }).eq("id", ev.id));
        sent++;
      } catch (err) {
        console.error("security email failed", String(err && err.message).slice(0, 200));
        await q(db.from("security_events").update({ status: "failed", error: String(err && err.message).slice(0, 300) }).eq("id", ev.id));
      }
    }
  } catch (err) { console.error("flushSecurity failed", err); }
  return { sent };
}
// Con tope de tiempo: si Gmail tarda, la petición del usuario no espera.
export function flushSoon(ms = 4000) {
  return Promise.race([flushSecurity(5), new Promise((r) => setTimeout(() => r({ timeout: true }), ms))]).catch(() => ({}));
}
