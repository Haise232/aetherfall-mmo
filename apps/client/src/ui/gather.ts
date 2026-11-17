// Barra de faena (pescando, picando, recogiendo, desollando). La duración la marca el servidor;
// aquí solo se dibuja el avance mientras tu personaje tenga una faena activa.
import { GATHER, type GatherKind } from "@mmorpg/shared";

export function createGatherBar() {
  const el = document.createElement("div"); el.id = "gatherbar"; el.hidden = true;
  el.innerHTML = `<span class="lbl"></span><div class="track"><div class="fill"></div></div><small>Muévete para cancelar</small>`;
  document.body.append(el);
  const lbl = el.querySelector<HTMLSpanElement>(".lbl")!, fill = el.querySelector<HTMLDivElement>(".fill")!;
  let kind: GatherKind | undefined, start = 0, dur = 1;
  return {
    /** Se llama cada fotograma con la faena activa de tu personaje (o undefined). */
    update(now: number, act: GatherKind | undefined, duration: number) {
      if (act !== kind) {
        kind = act; el.hidden = !act;
        if (act) { start = now; dur = duration; lbl.textContent = GATHER[act].doing + "…"; }
      }
      if (kind) fill.style.width = Math.min(100, ((now - start) / 1000 / dur) * 100) + "%";
    },
  };
}
