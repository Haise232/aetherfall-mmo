// Ventana de habilidades y clase (tecla K, o el botón de arriba): título de clase y su progreso, puntos libres,
// y para cada casilla (teclas 1–3) sus tres habilidades: la de siempre y dos que se desbloquean con el nivel.
// Se aprenden y mejoran con puntos (uno por nivel) y se elige cuál llevar equipada. Debajo, la definitiva (tecla 4).
import {
  CLASS_RANK_BONUS, CLASS_RANK_LEVELS, CLASS_TITLES, SKILL_SLOTS, START_SKILLS, canRankUp, classOf, classRank, freePoints, lookColor, maxRankOf,
  nextRankText, passiveOf, rankedSkill, skillKey, skillOptions, type InvState, type LookSel, type SkillDef,
} from "@mmorpg/shared";
import { passiveIcon, skillIcon } from "./skills";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const SLOT_NAMES = ["Golpe", "Técnica", "Recurso"];

function stats(sk: SkillDef) {
  const p: string[] = [];
  if (sk.mult !== undefined) p.push(`daño ×${num(sk.mult)}`);
  if (sk.stun) p.push(`aturde ${num(sk.stun)} s`);
  if (sk.dur) p.push(`dura ${num(sk.dur)} s`);
  if (sk.heal) p.push(`cura ${Math.round(sk.heal * 100)} %`);
  if (sk.radius) p.push(`radio ${num(sk.radius)} m`);
  if (sk.range && (sk.kind === "charge" || sk.kind === "blink" || sk.range > 4)) p.push(`alcance ${num(sk.range)} m`);
  p.push(`recarga ${num(sk.cd)} s`);
  return p.join(" · ");
}

export function createSkillsWindow(onUp: (slot: number, opt: number) => void, onPick: (slot: number, opt: number) => void, onReset: () => void) {
  const el = document.createElement("div"); el.id = "skillwin"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-labelledby", "skillwin-h");
  document.body.append(el);
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) el.addEventListener(t, e => {
    e.stopPropagation();
    const k = e as KeyboardEvent;
    if (t === "keydown" && (k.key === "Escape" || (k.code === "KeyK" && !k.repeat))) { k.preventDefault(); api.toggle(false); }
  });
  el.addEventListener("pointerdown", e => { if (e.target === el) api.toggle(false); }); // clic fuera de la ventana
  el.addEventListener("click", ev => {
    const t = ev.target as HTMLElement;
    const up = t.closest<HTMLButtonElement>("[data-up]"); if (up && !up.disabled) { const [s, o] = up.dataset.up!.split(":").map(Number); onUp(s!, o!); return; }
    const pk = t.closest<HTMLButtonElement>("[data-pick]"); if (pk && !pk.disabled) { const [s, o] = pk.dataset.pick!.split(":").map(Number); onPick(s!, o!); return; }
    if (t.closest(".sw-reset")) { if (confirm("¿Recuperar todos tus puntos de habilidad? Olvidarás las habilidades aprendidas y las de siempre volverán a rango 1.")) onReset(); return; }
    if (t.closest(".sw-x")) api.toggle(false);
  });
  let last: { inv: InvState; look: LookSel } | null = null;

  const card = (look: LookSel, inv: InvState, slot: number, opt: number) => {
    const st = inv.skills ?? START_SKILLS(), base = skillOptions(look, slot)[opt]!, key = skillKey(slot, opt), rank = st.ranks[key] ?? 0;
    const max = maxRankOf(slot), why = canRankUp(look, inv.level, st, slot, opt), ult = slot === SKILL_SLOTS - 1;
    const equipped = ult ? rank > 0 : (st.pick[slot] ?? 0) === opt && rank > 0, locked = rank === 0 && !!base.req && inv.level < base.req;
    const pips = Array.from({ length: max }, (_, k) => `<i class="${k < rank ? "on" : ""}"></i>`).join("");
    const sk = rankedSkill(base, Math.max(1, rank));
    const next = rank >= max ? "Rango máximo." : locked ? `Se desbloquea a nivel ${base.req}.` : rank === 0 ? "Cuesta 1 punto aprenderla." : `Siguiente: ${nextRankText(base, rank)}`;
    return `<li class="sw-sk${equipped ? " eq" : ""}${rank === 0 ? " off" : ""}${locked ? " locked" : ""}">
      <div class="hd"><span class="ic">${skillIcon(base.kind)}</span><b>${base.name}</b>${equipped && !ult ? '<small class="tag">equipada</small>' : ""}</div>
      <span class="ds">${base.desc}</span>
      ${rank ? `<em>${stats(sk)}</em>` : ""}
      <small class="nx">${next}</small>
      <div class="rk"><span class="pips">${pips}</span>
        ${!ult && rank > 0 && !equipped ? `<button type="button" class="pick" data-pick="${slot}:${opt}">Equipar</button>` : ""}
        <button type="button" data-up="${slot}:${opt}" ${why ? "disabled" : ""} title="${why ?? ""}">${rank === 0 ? (locked ? `Nivel ${base.req}` : "Aprender") : "Mejorar"}</button></div>
    </li>`;
  };

  const api = {
    get open() { return !el.hidden; },
    toggle(force?: boolean) {
      el.hidden = !(force ?? el.hidden);
      if (!el.hidden) { if (last) api.render(last.inv, last.look); setTimeout(() => el.querySelector<HTMLElement>("[data-up]:not(:disabled), .sw-x")?.focus(), 30); }
    },
    render(inv: InvState, look: LookSel) {
      last = { inv, look };
      if (el.hidden) return;
      const c = classOf(look[0]); if (!c) return;
      const level = inv.level, pts = freePoints(level, inv.skills ?? START_SKILLS());
      const cr = classRank(level), titles = CLASS_TITLES[c.id], nextLv = CLASS_RANK_LEVELS[cr + 1];
      const prevLv = CLASS_RANK_LEVELS[cr]!, prog = nextLv ? (level - prevLv) / (nextLv - prevLv) : 1;
      const passive = passiveOf(look), color = hex(lookColor(look));
      const slots = [0, 1, 2].map(s => `<section class="sw-slot"><h3><kbd>${s + 1}</kbd> ${SLOT_NAMES[s]}</h3><ul>${skillOptions(look, s).map((_, o) => card(look, inv, s, o)).join("")}</ul></section>`).join("");
      const ult = skillOptions(look, SKILL_SLOTS - 1).length ? `<section class="sw-slot ult"><h3><kbd>4</kbd> Definitiva</h3><ul>${card(look, inv, SKILL_SLOTS - 1, 0)}</ul></section>` : "";
      el.innerHTML = `
        <div class="sw-win" style="--c:${color}">
          <header><div><small>${c.name}</small><h2 id="skillwin-h">${titles[cr]}</h2></div>
            <p class="sw-pts${pts > 0 ? " has" : ""}"><b>${pts}</b> punto${pts === 1 ? "" : "s"}</p><button class="sw-x" type="button" aria-label="Cerrar">×</button></header>
          <section class="sw-rank">
            <ol>${titles.map((t, k) => `<li class="${k < cr ? "done" : k === cr ? "now" : ""}"><b>${t}</b><small>nivel ${CLASS_RANK_LEVELS[k]}</small></li>`).join("")}</ol>
            <div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div>
            <p>${nextLv ? `Nivel ${level}: a nivel ${nextLv} serás <b>${titles[cr + 1]}</b>.` : "Has alcanzado el rango más alto de tu clase."} Cada rango de clase te da un ${Math.round(CLASS_RANK_BONUS * 100)} % más de vida y daño (ahora +${Math.round(CLASS_RANK_BONUS * cr * 100)} %).</p>
          </section>
          <div class="sw-grid">${slots}</div>
          ${ult}
          ${passive ? `<p class="sw-passive">${passiveIcon()}<span><b>${passive.name}</b> · pasiva: ${passive.desc}</span></p>` : ""}
          <footer><span>Ganas un punto por nivel: aprende habilidades nuevas o mejora las que tienes. Lleva una por casilla. <kbd>K</kbd> o <kbd>Esc</kbd> cierra.</span><button type="button" class="sw-reset">Recuperar puntos</button></footer>
        </div>`;
    },
  };
  return api;
}
