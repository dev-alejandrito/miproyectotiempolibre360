import { CATEGORIES, LEVELS } from "../lib/util";

export default function Filters({ value, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <form role="search" className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
      <div className="lg:col-span-2"><label htmlFor="f-q" className="label">¿Qué quieres aprender?</label><input id="f-q" className="input" type="search" placeholder="Guitarra, Excel, inglés…" value={value.q} onChange={set("q")} /></div>
      <div><label htmlFor="f-c" className="label">Categoría</label><select id="f-c" className="input" value={value.category} onChange={set("category")}><option value="">Todas</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label htmlFor="f-m" className="label">Modalidad</label><select id="f-m" className="input" value={value.mode} onChange={set("mode")}><option value="">Cualquiera</option><option value="virtual">Virtual</option><option value="in_person">Presencial</option></select></div>
      <div><label htmlFor="f-l" className="label">Nivel</label><select id="f-l" className="input" value={value.level} onChange={set("level")}><option value="">Cualquiera</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    </form>
  );
}
