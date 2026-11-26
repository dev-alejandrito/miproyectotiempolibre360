// Subida de archivos privados (evidencias y adjuntos). Cada persona solo escribe en su carpeta.
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "evidencias";
const ext = (n) => String(n || "").split(".").pop().toLowerCase();

export async function uploadPrivate(file, folder, kind = "other") {
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("Inicia sesión para adjuntar archivos.");
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  const path = `${uid}/${folder}/${id}.${ext(file.name) || "bin"}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`No se pudo subir «${file.name}». ${error.message || ""}`.trim());
  return { path, name: file.name, kind, size: file.size, type: file.type || "" };
}

export async function uploadMany(files, folder, kind = "other") {
  const out = [];
  for (const f of files) out.push(await uploadPrivate(f, folder, f.__kind || kind));
  return out;
}

// Fotografías de perfil y portadas (bucket público «perfiles»). Solo JPG, PNG o WebP de hasta 5 MB.
export const PROFILE_BUCKET = "perfiles";
export const PROFILE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PROFILE_MAX = 5 * 1024 * 1024;
export async function uploadProfileImage(file, kind) {
  if (!PROFILE_TYPES.includes(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  if (file.size > PROFILE_MAX) throw new Error("La imagen debe pesar 5 MB o menos.");
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("Inicia sesión para subir imágenes.");
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/${kind}/${id}.${extension}`;
  const { error } = await supabase.storage.from(PROFILE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`No se pudo subir la imagen. ${error.message || ""}`.trim());
  return { path };
}
