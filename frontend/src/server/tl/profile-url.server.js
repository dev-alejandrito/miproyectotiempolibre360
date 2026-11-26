// URL pública de imágenes de perfil (bucket «perfiles»). Separado para evitar dependencias circulares.
export const PROFILE_BUCKET = "perfiles";
export function publicUrl(path) {
  if (!path) return "";
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  return base ? base + "/storage/v1/object/public/" + PROFILE_BUCKET + "/" + String(path).split("/").map(encodeURIComponent).join("/") : "";
}
