// Temas de color predeterminados para la portada y los detalles del perfil.
export const THEMES = {
  clasico: { label: "Clásico", from: "#0c1626", to: "#213650", accent: "#f4a93b" },
  oceano: { label: "Océano", from: "#0b3d5c", to: "#0b6f6a", accent: "#6ee7d0" },
  bosque: { label: "Bosque", from: "#123524", to: "#2f6b3f", accent: "#c8e86b" },
  atardecer: { label: "Atardecer", from: "#7a2e0e", to: "#d9792b", accent: "#ffd36e" },
  lavanda: { label: "Lavanda", from: "#33264d", to: "#6b5b95", accent: "#f2c4de" },
  grafito: { label: "Grafito", from: "#1f1f1f", to: "#4a4a4a", accent: "#f4a93b" },
};
export const themeOf = (k) => THEMES[k] || THEMES.clasico;
export const coverStyle = (theme, url) => {
  const t = themeOf(theme);
  return url
    ? { backgroundImage: `linear-gradient(180deg, rgba(12,22,38,.05), rgba(12,22,38,.55)), url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: `linear-gradient(120deg, ${t.from}, ${t.to})` };
};
