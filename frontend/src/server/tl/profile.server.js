// TIEMPO LIBRE 360 — «Editar mi perfil» y verificación de cuentas (independiente de la acreditación de habilidades).
// Cada persona solo modifica su propio perfil; correo, contraseña, rol, permisos y verificación NO se cambian aquí.
import { db, q, fail, str, isUuid, displayName, membersMap, getMember, audit, notify, notifyStaff, signFiles } from "./core.server.js";
import { takeFiles } from "./ext.server.js";

import { PROFILE_BUCKET, publicUrl } from "./profile-url.server.js";
export { PROFILE_BUCKET, publicUrl };
export const THEMES = ["clasico", "oceano", "bosque", "atardecer", "lavanda", "grafito"];
export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
export const IMAGE_MAX = 5 * 1024 * 1024;
const extOf = (n) => String(n || "").split(".").pop().toLowerCase();

export function profileExtras(m) {
  return {
    avatar_url: publicUrl(m && m.avatar_path), cover_url: publicUrl(m && m.cover_path),
    theme: THEMES.includes(m && m.theme) ? m.theme : "clasico",
    interests: Array.isArray(m && m.interests) ? m.interests.slice(0, 12) : [],
  };
}

// Valida que la imagen esté en la carpeta de la persona, tenga formato permitido y exista realmente.
async function checkImage(me, kind, path) {
  const p = str(path, 300);
  if (!p) return "";
  if (!p.startsWith(me.id + "/" + kind + "/") || p.includes("..") || p.split("/").length !== 3) fail("Imagen no válida. Vuelve a subirla.");
  if (!IMAGE_EXT.includes(extOf(p))) fail("Formato no permitido. Usa JPG, PNG o WebP.");
  const folder = me.id + "/" + kind, name = p.split("/").pop();
  const { data, error } = await db.storage.from(PROFILE_BUCKET).list(folder, { search: name, limit: 5 });
  const f = !error && Array.isArray(data) ? data.find((x) => x.name === name) : null;
  if (!f) fail("No encontramos la imagen subida. Vuelve a intentarlo.");
  const size = Number((f.metadata && f.metadata.size) || 0);
  if (size > IMAGE_MAX) fail("La imagen debe pesar 5 MB o menos.");
  const mime = String((f.metadata && f.metadata.mimetype) || "");
  if (mime && !["image/jpeg", "image/png", "image/webp"].includes(mime)) fail("Formato no permitido. Usa JPG, PNG o WebP.");
  return p;
}
async function removeOld(oldPath, newPath) {
  if (oldPath && oldPath !== newPath) { try { await db.storage.from(PROFILE_BUCKET).remove([oldPath]); } catch (err) { console.error("remove old image failed", err); } }
}

export function cleanInterests(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = str(raw, 40).replace(/\s+/g, " ");
    if (t.length >= 2 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

export async function profileGet(me) {
  const m = await getMember(me.id);
  const skills = await q(db.from("skills").select("name, kind, category").eq("owner", me.id).eq("active", true).eq("hidden", false).limit(60));
  return {
    name: m.name, headline: m.headline, bio: m.bio, avatar_path: m.avatar_path || "", cover_path: m.cover_path || "",
    ...profileExtras(m), themes: THEMES, offers: skills.filter((s) => s.kind === "offer"), wants: skills.filter((s) => s.kind === "want"),
    verified: !!m.verified_at,
  };
}

export async function profileSave(me, b) {
  const m = await getMember(me.id);
  if (!m) fail("No encontramos tu perfil.", 404);
  const name = str(b.name, 100).replace(/\s+/g, " ");
  if (name.length < 2) fail("Tu nombre público debe tener entre 2 y 100 caracteres.");
  const headline = str(b.headline, 120), bio = str(b.bio, 2000);
  const theme = str(b.theme, 20) || "clasico";
  if (!THEMES.includes(theme)) fail("Elige uno de los temas disponibles.");
  const avatar = await checkImage(me, "avatar", b.avatar_path);
  const cover = await checkImage(me, "cover", b.cover_path);
  // Solo estos campos: el correo, la contraseña, el rol, los permisos y la verificación no se tocan.
  await q(db.from("members").update({ name, headline, bio, theme, interests: cleanInterests(b.interests), avatar_path: avatar, cover_path: cover }).eq("id", me.id));
  await removeOld(m.avatar_path, avatar);
  await removeOld(m.cover_path, cover);
  return { ok: true, ...profileExtras({ avatar_path: avatar, cover_path: cover, theme, interests: cleanInterests(b.interests) }) };
}

// ================= VERIFICACIÓN DE CUENTAS =================
export const VER_LABEL = { pending: "En revisión", approved: "Aprobada", rejected: "Rechazada" };
function readJson(v) { return Array.isArray(v) ? v : []; }
async function verView(r, staff, names) {
  const v = { id: r.id, status: r.status, status_label: VER_LABEL[r.status] || r.status, message: r.message, reason: r.reason, files: await signFiles(r.files), created: r.created, reviewed_at: r.reviewed_at || "" };
  if (staff) {
    const m = names[r.member];
    v.member = r.member; v.member_name = m ? m.name : "Miembro"; v.member_email = m ? m.email : ""; v.member_verified = !!(m && m.verified_at);
    v.reviewed_by_name = r.reviewed_by_name; v.history = readJson(r.history);
  }
  return v;
}
export async function verMine(me) {
  const m = await getMember(me.id);
  const rows = await q(db.from("account_verifications").select("*").eq("member", me.id).order("created", { ascending: false }).limit(20));
  const items = []; for (const r of rows) items.push(await verView(r, false, {}));
  return { verified: !!m.verified_at, verified_at: m.verified_at || "", items };
}
export async function verCreate(me, b) {
  const m = await getMember(me.id);
  if (m.verified_at) fail("Tu cuenta ya está verificada.");
  const message = str(b.message, 1500);
  if (message.length < 10) fail("Cuéntanos brevemente quién eres y por qué solicitas la verificación (mínimo 10 caracteres).");
  const files = await takeFiles(me, "verification", b.files, ["pdf", "jpg", "jpeg", "png", "webp"]);
  if (!files.length) fail("Adjunta al menos una evidencia (identificación, credencial o comprobante) en PDF, JPG, PNG o WebP.");
  if (files.length > 3) fail("Puedes adjuntar hasta 3 archivos.");
  if (files.some((f) => f.size > 5 * 1024 * 1024)) fail("Cada archivo debe pesar 5 MB o menos.");
  const open = await q(db.from("account_verifications").select("id").eq("member", me.id).eq("status", "pending").limit(1));
  if (open.length) fail("Ya tienes una solicitud en revisión. Te avisaremos cuando se revise.");
  const now = new Date().toISOString();
  const { data, error } = await db.from("account_verifications").insert({ member: me.id, status: "pending", message, files, history: [{ at: now, by: me.name, action: "Solicitud enviada", to: "pending" }] }).select("id").single();
  if (error) { if (error.code === "23505") fail("Ya tienes una solicitud en revisión."); throw error; }
  await notifyStaff("verification", "Nueva solicitud de verificación de cuenta", displayName(me.name), "/admin/verificaciones");
  return { ok: true, id: data.id };
}
export async function verAdminList(status) {
  let b = db.from("account_verifications").select("*").order("created", { ascending: false }).limit(300);
  if (status) b = b.eq("status", status);
  const rows = await q(b);
  const names = await membersMap(rows.map((r) => r.member));
  const items = []; for (const r of rows) items.push(await verView(r, true, names));
  return { items, labels: VER_LABEL };
}
export async function verReview(me, id, b) {
  const r = isUuid(id) ? await q(db.from("account_verifications").select("*").eq("id", id).maybeSingle()) : null;
  if (!r) fail("No encontramos esa solicitud.", 404);
  if (r.member === me.id) fail("No puedes revisar tu propia solicitud.", 403);
  if (r.status !== "pending") fail("Esta solicitud ya fue revisada.", 409);
  const action = str(b.action, 10), reason = str(b.reason, 1000);
  if (action !== "approve" && action !== "reject") fail("Acción no válida.");
  if (action === "reject" && reason.length < 5) fail("Escribe el motivo del rechazo (mínimo 5 caracteres).");
  const now = new Date().toISOString(), to = action === "approve" ? "approved" : "rejected";
  const hist = readJson(r.history).concat([{ at: now, by: me.name, action: action === "approve" ? "Aprobada" : "Rechazada", from: "pending", to, note: reason }]).slice(-50);
  const upd = await q(db.from("account_verifications").update({ status: to, reason, reviewed_by: me.id, reviewed_by_name: me.name, reviewed_at: now, updated: now, history: hist }).eq("id", r.id).eq("status", "pending").select("id"));
  if (!upd.length) fail("Esta solicitud cambió mientras tanto. Vuelve a cargar.", 409);
  if (action === "approve") await q(db.from("members").update({ verified_at: now, verified_by: me.id }).eq("id", r.member));
  await audit(me, "account_verification_" + action, r.member, reason);
  await notify(r.member, "verified", action === "approve" ? "¡Tu cuenta fue verificada!" : "Tu solicitud de verificación fue rechazada", action === "approve" ? "Ahora aparece la insignia «Usuario verificado por TIEMPO LIBRE 360» junto a tu nombre." : reason, "/app/editar-perfil");
  return { ok: true, status: to };
}
