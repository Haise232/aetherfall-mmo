// Ficha del objetivo seleccionado: nombre, nivel, vida (con el tramo perdido que se vacía con retraso) y estado.
import type { EntityState } from "@mmorpg/shared";

export interface TargetInfo {
  state: EntityState;
  distance: number;
  attacking: boolean; // le estás atacando
  hostile: boolean; // criatura (los jugadores se muestran pero no se atacan desde aquí)
  safe: boolean; // alguno de los dos está en la ciudad: no hay combate
}

export function createTargetFrame(onClear: () => void) {
  const el = document.createElement("div"); el.id = "target"; el.hidden = true;
  el.innerHTML = `
    <div class="lv"></div>
    <div class="main">
      <div class="top"><span class="nm"></span><button type="button" class="x" aria-label="Quitar selección" title="Quitar selección (Esc)">×</button></div>
      <div class="hp"><div class="lag"></div><div class="fill"></div><span class="num"></span></div>
      <div class="tags"></div>
    </div>`;
  document.body.appendChild(el);
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const lv = q(".lv"), nm = q(".nm"), fill = q(".fill"), lag = q(".lag"), num = q(".num"), tags = q(".tags");
  q(".x").addEventListener("click", onClear);
  el.addEventListener("pointerdown", e => e.stopPropagation());

  let id = -1, lagW = 1, hold = 0, shown = "";
  return {
    update(t: TargetInfo | null, dt: number) {
      if (!t) { if (!el.hidden) { el.hidden = true; id = -1; } return; }
      const s = t.state, ratio = s.dead ? 0 : s.hp / s.maxHp;
      if (s.id !== id) { id = s.id; lagW = ratio; hold = 0; el.hidden = false; el.classList.toggle("foe", t.hostile); }
      // tramo perdido: espera un instante y luego baja hasta la vida actual
      if (ratio >= lagW) { lagW = ratio; hold = 0; }
      else if ((hold += dt) > 0.35) lagW = Math.max(ratio, lagW - dt * 0.9);
      fill.style.width = ratio * 100 + "%"; lag.style.width = lagW * 100 + "%";
      const tagList: string[] = [];
      if (s.dead) tagList.push("Muerto");
      else {
        if (s.stun) tagList.push("<b class=\"stun\">Aturdido</b>");
        if (s.buff === "guard") tagList.push("<b>En guardia</b>");
        if (s.buff === "rage") tagList.push("<b class=\"rage\">Furia</b>");
        if (t.hostile && t.attacking) tagList.push("<b class=\"atk\">Atacando</b>");
        else if (t.hostile && t.safe) tagList.push("No se combate en la ciudad");
        else if (t.hostile) tagList.push("Clic otra vez o clic derecho para atacar");
      }
      tagList.push(Math.round(t.distance) + " m");
      const key = s.name + "|" + s.level + "|" + s.hp + "|" + s.maxHp + "|" + tagList.join();
      if (key === shown) return;
      shown = key;
      nm.textContent = s.name; lv.textContent = String(s.level);
      num.textContent = s.dead ? "" : `${s.hp} / ${s.maxHp}`;
      tags.innerHTML = tagList.map(x => `<span>${x}</span>`).join("");
    },
  };
}
