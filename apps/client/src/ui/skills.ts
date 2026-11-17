// Barra de habilidades (teclas 1–4): icono según la mecánica, nombre, rango (puntitos) y enfriamiento.
// La cuarta es la definitiva: bloqueada hasta aprenderla en la ventana de habilidades (K). Los puntos sin gastar se avisan arriba (ui/topbar.ts).
import type { ClassDef, PassiveDef, SkillDef } from "@mmorpg/shared";

const ICON: Record<SkillDef["kind"], string> = {
  strike: "M19 3l2 2-9.5 9.5 1.5 1.5-1.5 1.5-1.8-1.8L6 19.4 4.6 18l3.7-3.7-1.8-1.8L8 11l1.5 1.5z",
  charge: "M3 5l8 7-8 7zm10 0l8 7-8 7z",
  aoe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm0 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  buff: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z",
  blink: "M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z",
  heal: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
};
const PASSIVE_ICON = "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z";
export const passiveIcon = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PASSIVE_ICON}"/></svg>`;
export const skillIcon = (k: SkillDef["kind"]) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${ICON[k]}"/></svg>`;

export function createSkillBar(root: HTMLElement, onCast: (slot: number) => void) {
  let shown = "";
  const until = [0, 0, 0, 0], total = [1, 1, 1, 1]; // fin del enfriamiento (ms de performance.now) y su duración
  const slots: { el: HTMLElement; cd: HTMLElement; num: HTMLElement; shown: string }[] = [];
  root.addEventListener("click", ev => { const s = (ev.target as HTMLElement).closest<HTMLElement>(".slot:not(.passive)"); if (s) onCast(Number(s.dataset.i)); });
  return {
    /** Reconstruye la barra cuando se conoce (o cambia) la clase o la forma del jugador. */
    setClass(c: ClassDef, skills: readonly SkillDef[] = c.skills, color = c.color, passive?: PassiveDef, ranks: number[] = []) {
      const key = c.id + "|" + skills.map(s => s.name + s.cd).join() + "|" + (passive?.name ?? "") + "|" + ranks.join();
      if (key === shown) return;
      shown = key; slots.length = 0; root.innerHTML = ""; until.fill(0);
      root.style.setProperty("--c", "#" + color.toString(16).padStart(6, "0"));
      skills.forEach((sk, i) => {
        const rank = ranks[i] ?? 1, locked = rank < 1, max = i === 3 ? 3 : 5;
        const el = document.createElement("div"); el.className = "slot" + (locked ? " locked" : "") + (i === 3 ? " ult" : ""); el.dataset.i = String(i);
        el.setAttribute("aria-label", `${sk.name}${locked ? " (sin aprender)" : `, rango ${rank}`}. ${sk.desc} Enfriamiento: ${sk.cd} s.`);
        const pips = locked ? "" : `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < rank ? "on" : ""}"></i>`).join("")}</span>`;
        el.innerHTML = `${skillIcon(sk.kind)}<kbd>${i + 1}</kbd>${pips}<div class="cd"></div><b class="num"></b><div class="tip" role="tooltip"><b></b><span></span><i></i></div>`;
        el.querySelector(".tip b")!.textContent = sk.name;
        el.querySelector(".tip span")!.textContent = sk.desc;
        const cd = Math.round(sk.cd * (passive?.cdMult ?? 1) * 10) / 10;
        el.querySelector(".tip i")!.textContent = locked ? "Sin aprender: ábrela en la ventana de habilidades (K)." : `Rango ${rank} de ${max} · enfriamiento: ${String(cd).replace(".", ",")} s`;
        root.appendChild(el);
        slots.push({ el, cd: el.querySelector<HTMLElement>(".cd")!, num: el.querySelector<HTMLElement>(".num")!, shown: "" });
      });
      if (passive) { // pasiva: siempre activa, solo informa al pasar el ratón
        const el = document.createElement("div"); el.className = "slot passive"; el.tabIndex = 0;
        el.setAttribute("aria-label", `Pasiva: ${passive.name}. ${passive.desc}`);
        el.innerHTML = `${passiveIcon()}<div class="tip" role="tooltip"><b></b><span></span><i>Pasiva · siempre activa</i></div>`;
        el.querySelector(".tip b")!.textContent = passive.name; el.querySelector(".tip span")!.textContent = passive.desc;
        root.appendChild(el);
      }
    },
    ready(slot: number, now: number) { return now >= until[slot]!; },
    /** El servidor confirmó el lanzamiento: empieza el enfriamiento. */
    start(slot: number, seconds: number, now: number) { until[slot] = now + seconds * 1000; total[slot] = seconds * 1000; },
    /** Aviso visual de que la habilidad no se pudo usar. */
    deny(slot: number) { const el = slots[slot]?.el; if (!el) return; el.classList.remove("deny"); void el.offsetWidth; el.classList.add("deny"); },
    update(now: number) {
      slots.forEach((s, i) => {
        const left = Math.max(0, until[i]! - now), txt = left > 0 ? (left > 9950 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1)) : "";
        if (txt === s.shown) return;
        s.shown = txt; s.num.textContent = txt; s.cd.style.height = (left / total[i]!) * 100 + "%"; s.el.classList.toggle("wait", left > 0);
      });
    },
  };
}
