import { Camera, ImagePlus, Trash2, Star, ShieldCheck, Paperclip, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router";

import { Alert, Avatar, Field, PageHeader, Spinner, UserVerifiedBadge, useToast } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useApi } from "../../lib/hooks";
import { api } from "../../lib/pb";
import { uploadMany, uploadProfileImage, PROFILE_TYPES, PROFILE_MAX } from "../../lib/storage";
import { THEMES, coverStyle, themeOf } from "../../lib/themes";
import { fmtDate } from "../../lib/util";

function validImage(file) {
  if (!file) return "Elige una imagen.";
  if (!PROFILE_TYPES.includes(file.type)) return "Formato no permitido. Usa JPG, PNG o WebP.";
  if (file.size > PROFILE_MAX) return "La imagen debe pesar 5 MB o menos.";
  return "";
}

export default function EditProfile() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error } = useApi("/profile");
  const [f, setF] = useState(null);
  const [interest, setInterest] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // Archivos locales aún no subidos (se suben al guardar).
  const [pending, setPending] = useState({ avatar: null, cover: null });

  useEffect(() => {
    if (data && !f) setF({ name: data.name, headline: data.headline, bio: data.bio, theme: data.theme, interests: data.interests || [], avatar_path: data.avatar_path, cover_path: data.cover_path, avatar_url: data.avatar_url, cover_url: data.cover_url });
  }, [data, f]);
  const previews = useMemo(() => ({
    avatar: pending.avatar ? URL.createObjectURL(pending.avatar) : null,
    cover: pending.cover ? URL.createObjectURL(pending.cover) : null,
  }), [pending]);
  useEffect(() => () => { Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)); }, [previews]);

  if (loading || (!f && !error)) return <Spinner />;
  if (error) return <Alert kind="error">No se pudo cargar tu perfil: {error}</Alert>;

  const avatarUrl = previews.avatar || f.avatar_url;
  const coverUrl = previews.cover || f.cover_url;
  const t = themeOf(f.theme);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function pick(kind) {
    return (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const m = validImage(file);
      if (m) { setErr(m); return; }
      setErr("");
      setPending((p) => ({ ...p, [kind]: file }));
    };
  }
  function removeImg(kind) {
    setPending((p) => ({ ...p, [kind]: null }));
    setF({ ...f, [kind + "_path"]: "", [kind + "_url"]: "" });
  }
  function addInterest(e) {
    e?.preventDefault();
    const v = interest.trim().replace(/\s+/g, " ").slice(0, 40);
    if (v.length < 2) return;
    if (f.interests.length >= 12) { setErr("Puedes añadir hasta 12 intereses."); return; }
    if (!f.interests.some((x) => x.toLowerCase() === v.toLowerCase())) setF({ ...f, interests: [...f.interests, v] });
    setInterest("");
  }
  async function save(e) {
    e.preventDefault(); setErr("");
    if (f.name.trim().length < 2) { setErr("Tu nombre público debe tener al menos 2 caracteres."); return; }
    setBusy("save");
    try {
      let avatar_path = f.avatar_path, cover_path = f.cover_path;
      if (pending.avatar) avatar_path = (await uploadProfileImage(pending.avatar, "avatar")).path;
      if (pending.cover) cover_path = (await uploadProfileImage(pending.cover, "cover")).path;
      await api("/profile", { method: "POST", body: { name: f.name, headline: f.headline, bio: f.bio, theme: f.theme, interests: f.interests, avatar_path, cover_path } });
      await refresh?.();
      toast("Perfil actualizado.");
      nav(`/app/persona/${me.id}`);
    } catch (er) { setErr(er.message); } finally { setBusy(""); }
  }
  function cancel() { nav("/app/perfil"); }

  return (
    <>
      <PageHeader title="Editar mi perfil" subtitle="Personaliza cómo te ven las demás personas. Tu correo, contraseña, rol y verificación no se modifican aquí." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <form onSubmit={save} className="space-y-6" data-testid="edit-profile-form" noValidate>
          <section className="card space-y-4">
            <h2 className="text-xl font-bold">Fotografía y portada</h2>
            <p className="hint">Formatos permitidos: JPG, PNG o WebP. Máximo 5 MB por imagen. La portada se ve mejor en formato horizontal (por ejemplo 1500 × 500 px).</p>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={f.name || "?"} size={84} src={avatarUrl} />
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-ghost btn-sm cursor-pointer" data-testid="avatar-upload-button"><Camera size={16} aria-hidden="true" />{avatarUrl ? "Cambiar fotografía" : "Subir fotografía"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick("avatar")} data-testid="avatar-file-input" /></label>
                {avatarUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeImg("avatar")} data-testid="avatar-remove-button"><Trash2 size={16} aria-hidden="true" />Eliminar fotografía</button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-ghost btn-sm cursor-pointer" data-testid="cover-upload-button"><ImagePlus size={16} aria-hidden="true" />{coverUrl ? "Cambiar portada" : "Subir portada"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick("cover")} data-testid="cover-file-input" /></label>
              {coverUrl && <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeImg("cover")} data-testid="cover-remove-button"><Trash2 size={16} aria-hidden="true" />Eliminar portada</button>}
            </div>
          </section>

          <section className="card space-y-4">
            <h2 className="text-xl font-bold">Sobre ti</h2>
            <Field label="Nombre público">{(p) => <input {...p} className="input" maxLength={100} value={f.name} onChange={set("name")} data-testid="profile-name-input" />}</Field>
            <Field label="Titular" hint="Una frase corta, por ejemplo: «Profe de inglés y amante del senderismo».">{(p) => <input {...p} className="input" maxLength={120} value={f.headline} onChange={set("headline")} data-testid="profile-headline-input" />}</Field>
            <Field label="Descripción personal">{(p) => <textarea {...p} className="input" rows={5} maxLength={2000} value={f.bio} onChange={set("bio")} data-testid="profile-bio-input" />}</Field>
            <div>
              <label htmlFor="interest-input" className="label">Intereses</label>
              <div className="flex gap-2">
                <input id="interest-input" className="input" maxLength={40} value={interest} placeholder="Ej. fotografía, ajedrez…" onChange={(e) => setInterest(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addInterest(e); }} data-testid="interest-input" />
                <button type="button" className="btn btn-dark btn-sm shrink-0" onClick={addInterest} data-testid="interest-add-button">Añadir</button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2" data-testid="interest-list">
                {f.interests.map((x) => <li key={x} className="chip bg-white">{x}<button type="button" className="ml-1 rounded-full p-0.5 hover:bg-sand" onClick={() => setF({ ...f, interests: f.interests.filter((y) => y !== x) })} aria-label={`Quitar ${x}`}><X size={12} aria-hidden="true" /></button></li>)}
                {!f.interests.length && <li className="hint">Aún no añades intereses.</li>}
              </ul>
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-xl font-bold">Mis habilidades</h2>
            {data.offers.length + data.wants.length === 0 ? <p className="text-[#3c3829]">Aún no tienes habilidades registradas.</p> : (
              <div className="space-y-2 text-sm">
                {data.offers.length > 0 && <p><strong>Ofrezco:</strong> {data.offers.map((s) => s.name).join(", ")}</p>}
                {data.wants.length > 0 && <p><strong>Quiero aprender:</strong> {data.wants.map((s) => s.name).join(", ")}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2"><Link to="/app/mis-habilidades" className="btn btn-ghost btn-sm">Gestionar habilidades</Link><Link to="/app/quiero-aprender" className="btn btn-ghost btn-sm">Lo que quiero aprender</Link></div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-xl font-bold">Tema de color</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema de color">
              {Object.entries(THEMES).map(([k, th]) => (
                <button type="button" role="radio" aria-checked={f.theme === k} key={k} onClick={() => setF({ ...f, theme: k })} data-testid={`theme-option-${k}`}
                  className={`flex items-center gap-3 rounded-xl border-2 p-2 text-left text-sm font-bold transition-[border-color,transform] duration-150 hover:-translate-y-0.5 ${f.theme === k ? "border-ink" : "border-line bg-white"}`}>
                  <span className="h-9 w-9 shrink-0 rounded-lg" style={{ backgroundImage: `linear-gradient(120deg, ${th.from}, ${th.to})`, boxShadow: `inset 0 -6px 0 ${th.accent}` }} aria-hidden="true" />{th.label}
                </button>
              ))}
            </div>
          </section>

          {err && <Alert kind="error">{err}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!!busy} data-testid="profile-save-button">{busy === "save" ? "Guardando…" : "Guardar cambios"}</button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={!!busy} data-testid="profile-cancel-button">Cancelar</button>
          </div>
        </form>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:h-fit">
          <section aria-label="Vista previa del perfil" className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm" data-testid="profile-preview">
            <div className="h-28" style={coverStyle(f.theme, coverUrl)} />
            <div className="-mt-10 px-4 pb-4">
              <Avatar name={f.name || "?"} size={76} src={avatarUrl} />
              <p className="mt-2 text-xl font-extrabold">{f.name || "Tu nombre"}<UserVerifiedBadge show={data.verified} /></p>
              <p className="text-sm text-[#3c3829]">{f.headline || "Miembro de la comunidad"}</p>
              {f.bio && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm">{f.bio}</p>}
              {f.interests.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{f.interests.map((x) => <li key={x} className="chip text-xs" style={{ borderColor: t.to }}>{x}</li>)}</ul>}
            </div>
            <p className="border-t border-line bg-sand px-4 py-2 text-xs font-semibold">Vista previa · los cambios se aplican al guardar</p>
          </section>
          <AccountVerification />
        </aside>
      </div>
    </>
  );
}

const V_ST = { pending: "chip-warn", approved: "chip-ok", rejected: "chip-bad" };
function AccountVerification() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi("/verification");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (loading && !data) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;
  const open = data.items.find((x) => x.status === "pending");
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (message.trim().length < 10) { setErr("Escribe al menos 10 caracteres."); return; }
    if (!files.length) { setErr("Adjunta al menos una evidencia."); return; }
    const bad = files.find((x) => !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(x.type) || x.size > 5 * 1024 * 1024);
    if (bad) { setErr(`«${bad.name}» no es válido: usa PDF, JPG, PNG o WebP de hasta 5 MB.`); return; }
    setBusy(true);
    try {
      const up = await uploadMany(files, "verification", "evidence");
      await api("/verification", { method: "POST", body: { message, files: up } });
      toast("Solicitud enviada. La administración la revisará."); setMessage(""); setFiles([]); reload();
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  }
  return (
    <section className="card space-y-3" data-testid="account-verification-card">
      <h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck size={20} aria-hidden="true" />Verificación de cuenta</h2>
      <p className="text-sm text-[#3c3829]">Es distinta de la acreditación de habilidades. Si la administración la aprueba, aparecerá una insignia <Star size={13} className="inline text-amber-deep" fill="currentColor" aria-hidden="true" /> junto a tu nombre.</p>
      {data.verified ? <Alert kind="success">Tu cuenta está verificada desde {fmtDate(data.verified_at)}.</Alert> : open ? (
        <Alert kind="info">Tu solicitud está en revisión desde {fmtDate(open.created)}.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="¿Quién eres y por qué solicitas la verificación?">{(p) => <textarea {...p} className="input" rows={3} maxLength={1500} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="verification-message-input" />}</Field>
          <div>
            <label className="btn btn-ghost btn-sm cursor-pointer"><Paperclip size={16} aria-hidden="true" />Adjuntar evidencias<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { setFiles([...e.target.files].slice(0, 3)); e.target.value = ""; }} data-testid="verification-file-input" /></label>
            <p className="hint mt-1">Identificación, credencial o comprobante (PDF, JPG, PNG o WebP; hasta 3 archivos de 5 MB). Solo la administración puede verlos.</p>
            {files.length > 0 && <ul className="mt-2 text-sm">{files.map((x) => <li key={x.name}>• {x.name}</li>)}</ul>}
          </div>
          {err && <Alert kind="error">{err}</Alert>}
          <button className="btn btn-dark btn-sm" disabled={busy} data-testid="verification-submit-button"><Sparkles size={16} aria-hidden="true" />{busy ? "Enviando…" : "Solicitar verificación"}</button>
        </form>
      )}
      {data.items.length > 0 && (
        <ul className="space-y-2 border-t border-line pt-3 text-sm" data-testid="verification-history">
          {data.items.map((r) => <li key={r.id}><span className={`chip ${V_ST[r.status] || ""}`}>{r.status_label}</span> <span className="text-[#4b4638]">{fmtDate(r.created)}</span>{r.reason && <p className="mt-1"><strong>Motivo:</strong> {r.reason}</p>}</li>)}
        </ul>
      )}
    </section>
  );
}
