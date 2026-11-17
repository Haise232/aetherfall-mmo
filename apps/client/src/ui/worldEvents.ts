// Eventos del mundo y avisos del administrador: cinta bajo la barra superior con los eventos activos y su tiempo,
// y un cartel grande cuando llega un aviso.
import { WORLD_EVENTS, type ActiveEvent } from "@mmorpg/shared";

export function createWorldBanner() {
  const strip = document.createElement("div"); strip.id = "worldev"; strip.hidden = true; strip.setAttribute("aria-live", "polite");
  const note = document.createElement("div"); note.id = "announce"; note.hidden = true; note.setAttribute("role", "status");
  note.innerHTML = `<small>Aviso de Valdoria</small><strong></strong>`;
  document.body.append(strip, note);
  let events: ActiveEvent[] = [], shown = "", noteTimer = 0;
  return {
    setEvents(list: ActiveEvent[]) { events = list; },
    announce(text: string) {
      note.querySelector("strong")!.textContent = text; note.hidden = false;
      note.style.animation = "none"; void note.offsetWidth; note.style.animation = "";
      clearTimeout(noteTimer); noteTimer = window.setTimeout(() => { note.hidden = true; }, 7000);
    },
    /** Cada fotograma: actualiza los minutos que quedan. */
    update(now: number) {
      const act = events.filter(e => e.until > now);
      const html = act.map(e => `<span title="${WORLD_EVENTS[e.id].desc}"><b>${WORLD_EVENTS[e.id].name}</b> ${Math.ceil((e.until - now) / 60000)} min</span>`).join("");
      if (html === shown) return;
      shown = html; strip.innerHTML = html; strip.hidden = !act.length;
    },
  };
}
