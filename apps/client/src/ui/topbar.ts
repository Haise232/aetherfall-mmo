// Barra superior (al estilo de Albion): inventario (I), habilidades y clase (K) con los puntos sin gastar, y mapa (M).
// Cada botón simula su tecla, así que hace exactamente lo mismo que el atajo.
const ICONS = {
  bag: "M8 7V6a4 4 0 0 1 8 0v1h3l1 14H4L5 7zm2 0h4V6a2 2 0 0 0-4 0z",
  skills: "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z",
  map: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zm6 0v12m6-10v12",
};

export function createTopbar(press: (code: string) => void) {
  const el = document.createElement("nav"); el.id = "topbar"; el.setAttribute("aria-label", "Menú");
  const btn = (code: string, icon: keyof typeof ICONS, label: string) =>
    `<button type="button" data-code="${code}" aria-label="${label} (${code.slice(3)})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[icon]}"/></svg><span>${label}</span><kbd>${code.slice(3)}</kbd></button>`;
  el.innerHTML = btn("KeyI", "bag", "Inventario") + btn("KeyK", "skills", "Habilidades").replace("</button>", `<b class="badge" hidden></b></button>`) + btn("KeyM", "map", "Mapa");
  document.body.append(el);
  el.addEventListener("click", ev => { const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-code]"); if (b) { b.blur(); press(b.dataset.code!); } });
  const badge = el.querySelector<HTMLElement>(".badge")!, skillsBtn = el.querySelector<HTMLElement>('[data-code="KeyK"]')!;
  let shown = -1;
  return {
    /** Puntos de habilidad sin gastar: si hay, el botón de habilidades se ilumina con el número. */
    setPoints(n: number) {
      if (n === shown) return; shown = n;
      badge.hidden = n <= 0; badge.textContent = String(n);
      skillsBtn.classList.toggle("has", n > 0);
      skillsBtn.setAttribute("aria-label", n > 0 ? `Habilidades (K): ${n} punto${n === 1 ? "" : "s"} sin gastar` : "Habilidades (K)");
    },
  };
}
