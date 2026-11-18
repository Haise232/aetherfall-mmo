// Inventario: ficha del personaje, equipo, oficio con su herramienta y mochila en cuadrícula con pestañas.
// Mismo lenguaje heráldico plano que el resto de la interfaz (tokens de hud.css).
import { GATHER_TOOL, ITEMS, MOUNTS, mountOf, type MountId, RARITIES, fmtCoins, PLAYER, classOf, gatherOfJob, jobOf, playerStats, type InvState, type ItemCat, type ItemDef, type LookSel, type Slot } from "@mmorpg/shared";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
/** Color del borde de una casilla: la rareza manda (si la tiene); si no, el tier. */
export const itemEdge = (d: ItemDef | undefined) => d?.rarity ? hex(RARITIES[d.rarity]!.color) : TIER[d?.tier ?? 1] ?? TIER[1];
export const TIER = ["", "#a9a28f", "#6fae5c", "#4f8fd0", "#a46ad8", "#e2b23f"];

// Iconos planos (24×24) por categoría; `c` es el color principal del objeto.
const ICON: Record<ItemCat, (c: string) => string> = {
  weapon: c => `<path d="M17 3l4 0 0 4-9 9-4-4z" fill="${c}"/><path d="M5 13l6 6-2 2-1.5-1.5L5 22l-3-3 2.5-2.5L3 15z" fill="#6b4a2b"/><path d="M7 11l6 6" stroke="#2b2b30" stroke-width="2"/>`,
  armor: c => `<path d="M6 3l3 2h6l3-2 4 4-3 4v10H5V11L2 7z" fill="${c}"/><path d="M9 5h6v4H9z" fill="rgba(0,0,0,.25)"/><path d="M12 9v12" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>`,
  tool: c => `<path d="M4 20L15 9" stroke="#8a6a42" stroke-width="2.6" stroke-linecap="round"/><path d="M12 4c4-1 7 1 8 4l-3 1-2-2-3 1z" fill="${c}"/>`,
  fish: c => `<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0z" fill="${c}"/><path d="M18 12l4-4v8z" fill="${c}"/><circle cx="8" cy="11" r="1.3" fill="#1c2638"/>`,
  ore: c => `<path d="M3 17l4-9 6-3 7 4 1 8-6 4H8z" fill="#6f6a62"/><path d="M9 9l3-2 2 3-3 3zM14 14l3-1 1 3-3 1z" fill="${c}"/>`,
  herb: c => `<path d="M12 22V10" stroke="#3f7a34" stroke-width="2"/><path d="M12 14c-5 0-7-3-7-6 4 0 7 2 7 6zM12 12c5 0 7-3 7-6-4 0-7 2-7 6z" fill="#4f9442"/><circle cx="12" cy="6" r="3" fill="${c}"/>`,
  hide: c => `<path d="M6 3l3 3h6l3-3 2 5-2 4 2 6-4 3h-8l-4-3 2-6-2-4z" fill="${c}"/><path d="M9 9h6M9 13h6" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/>`,
  trophy: c => `<path d="M8 3c5 2 8 8 7 18-3-4-6-9-7-18z" fill="${c}"/><path d="M8 3c1 6 3 11 7 18" stroke="rgba(0,0,0,.25)" stroke-width="1.2" fill="none"/>`,
};
const ITEM_COLOR: Record<string, string> = {
  wooden_club: "#9aa0a8", rusty_sword: "#b07a4a", leather_armor: "#a0703c", iron_armor: "#9aa0a8",
  fishing_rod: "#d9d2bf", pickaxe: "#9aa0a8", sickle: "#c8ccd2", skinning_knife: "#c8ccd2",
  trout: "#8fb0c8", carp: "#c8a04a", golden_pike: "#e2b23f", iron_ore: "#c8743a", coal: "#2e2e33", silver_nugget: "#e0e6ee",
  healing_herb: "#d94f6a", wild_berries: "#7a3ab0", moonflower: "#c8d8ff", thick_hide: "#7a5634", wolf_pelt: "#8d8478", wolf_fang: "#efe6d0",
};
export const icon = (d: ItemDef | undefined, size = 30) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICON[d?.cat ?? "trophy"](ITEM_COLOR[d?.base ?? d?.id ?? ""] ?? "#efe6d0") /* las variantes de rareza usan el color de su objeto base */}</svg>`;

type Tab = "all" | "gear" | "res" | "tool";
const TABS: [Tab, string][] = [["all", "Todo"], ["gear", "Equipo"], ["res", "Recursos"], ["tool", "Herramientas"]];
const inTab = (d: ItemDef | undefined, t: Tab) =>
  t === "all" || (t === "gear" && (d?.cat === "weapon" || d?.cat === "armor")) || (t === "tool" && d?.cat === "tool") ||
  (t === "res" && !!d && !["weapon", "armor", "tool"].includes(d.cat));

function describe(d: ItemDef) {
  const lines = [`<b>${d.name}</b> <small style="color:${TIER[d.tier] ?? TIER[1]}">T${d.tier}</small>`];
  if (d.rarity) lines.push(`<span style="color:${hex(RARITIES[d.rarity]!.color)};font-weight:700">Calidad ${RARITIES[d.rarity]!.name}</span> · vale ${RARITIES[d.rarity]!.price} veces más`);
  if (d.damage) lines.push(`+${d.damage} de daño`);
  if (d.defense) lines.push(`+${d.defense} de defensa`);
  if (d.cat === "tool") lines.push("Herramienta de oficio: llévala encima para trabajar.");
  else if (d.slot) lines.push("Clic para equipar.");
  else lines.push({ fish: "Pescado fresco del lago.", ore: "Mineral sin fundir.", herb: "Planta silvestre.", hide: "Piel sin curtir.", trophy: "Botín de caza." }[d.cat as "fish"] ?? "");
  return lines.join("<br>");
}

export function createInventory(el: HTMLElement, onEquip: (item: string) => void, onUnequip: (slot: Slot) => void, onMount: (id: MountId | null) => void = () => {}) {
  let tab: Tab = "all";
  try { tab = (localStorage.getItem("inv-tab") as Tab) || "all"; } catch { /* sin almacenamiento */ }
  let last: { inv: InvState; name: string; look?: LookSel; maxHp: number } | null = null;

  el.addEventListener("click", ev => {
    const t = ev.target as HTMLElement;
    const tb = t.closest<HTMLElement>("[data-tab]");
    if (tb) { tab = tb.dataset.tab as Tab; try { localStorage.setItem("inv-tab", tab); } catch { /* */ } if (last) api.render(last.inv, last.name, last.look, last.maxHp); return; }
    if (t.closest(".x")) { api.toggle(false); return; }
    const it = t.closest<HTMLElement>("[data-eq]"); if (it) { onEquip(it.dataset.eq!); return; }
    const un = t.closest<HTMLElement>("[data-un]"); if (un) { onUnequip(un.dataset.un as Slot); return; }
    const mo = t.closest<HTMLElement>("[data-mount]"); if (mo) onMount(mo.dataset.mount ? mo.dataset.mount as MountId : null);
  });
  // detalle del objeto bajo el ratón
  el.addEventListener("pointerover", ev => {
    const cell = (ev.target as HTMLElement).closest<HTMLElement>("[data-item]");
    const det = el.querySelector<HTMLElement>(".detail");
    if (!det) return;
    const d = cell ? ITEMS[cell.dataset.item!] : undefined;
    det.innerHTML = d ? describe(d) : `<span class="muted">Pasa el ratón por un objeto para ver qué es.</span>`;
  });

  const api = {
    get open() { return el.classList.contains("open"); },
    toggle(force?: boolean) { el.classList.toggle("open", force ?? !api.open); if (api.open && last) api.render(last.inv, last.name, last.look, last.maxHp); },
    render(inv: InvState, name: string, look: LookSel | undefined, maxHp: number) {
      last = { inv, name, look, maxHp };
      if (!api.open) return;
      const cls = look ? classOf(look[0]) : undefined;
      const st = playerStats(inv.level, inv.equip, { maxHp: PLAYER.maxHp, damage: PLAYER.damage });
      const job = jobOf(inv.job), kind = gatherOfJob(inv.job), tool = kind ? GATHER_TOOL[kind] : undefined;
      const hasTool = !!tool && (inv.inv[tool] ?? 0) > 0;
      const bar = (a: number, b: number) => `<div class="bar"><i style="width:${Math.min(100, (a / Math.max(1, b)) * 100)}%"></i></div>`;

      const slot = (s: Slot, label: string) => {
        const id = inv.equip[s], d = id ? ITEMS[id] : undefined;
        return d
          ? `<button class="slot" data-un="${s}" data-item="${d.id}" title="Clic para quitártelo">${icon(d, 34)}<span><small>${label}</small><b>${d.name}</b><em>${d.damage ? "+" + d.damage + " daño" : "+" + (d.defense ?? 0) + " defensa"}</em></span></button>`
          : `<div class="slot empty"><svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">${ICON[s === "weapon" ? "weapon" : "armor"]("rgba(239,230,208,.18)")}</svg><span><small>${label}</small><b>Vacío</b></span></div>`;
      };

      const items = Object.entries(inv.inv).filter(([, n]) => n > 0).filter(([id]) => inTab(ITEMS[id], tab))
        .sort(([a], [b]) => (ITEMS[a]?.cat ?? "").localeCompare(ITEMS[b]?.cat ?? "") || (ITEMS[a]?.base ?? a).localeCompare(ITEMS[b]?.base ?? b) || (ITEMS[b]?.rarity ?? 0) - (ITEMS[a]?.rarity ?? 0) || (ITEMS[b]?.tier ?? 0) - (ITEMS[a]?.tier ?? 0));
      const cells = items.map(([id, n]) => {
        const d = ITEMS[id];
        const act = d?.slot ? `data-eq="${id}"` : "";
        return `<button class="cell${d?.slot ? " eq" : ""}" ${act} data-item="${id}" style="--t:${itemEdge(d)}" aria-label="${d?.name ?? id}, ${n}">${icon(d)}${n > 1 ? `<span class="n">${n}</span>` : ""}</button>`;
      });
      const free = Math.max(0, 20 - cells.length);
      const empty = !items.length ? `<p class="none">${tab === "all" ? "Tu mochila está vacía. Los lobos de fuera de la muralla sueltan equipo, y tu oficio te dará recursos." : "Nada en esta pestaña."}</p>` : "";

      el.innerHTML = `
        <header><h2>Inventario</h2><button class="x" aria-label="Cerrar">×</button></header>
        <section class="who">
          <div class="lvl">${inv.level}</div>
          <div class="txt"><b>${name}</b><span>${cls ? cls.name : ""}</span>${bar(inv.xp, inv.xpNext)}<small>${inv.xp} / ${inv.xpNext} de experiencia</small><small class="coins">Besantes: <b>${fmtCoins(inv.coins ?? 0)}</b></small></div>
        </section>
        <dl class="stats"><div><dt>Vida</dt><dd>${maxHp}</dd></div><div><dt>Daño</dt><dd>${st.damage}</dd></div><div><dt>Defensa</dt><dd>${st.defense}</dd></div></dl>
        <section class="gear">${slot("weapon", "Arma")}${slot("armor", "Armadura")}</section>
        <section class="job" style="--c:${job ? hex(job.color) : "var(--cal-d)"}">
          ${job ? `<div class="jt"><b>${job.name}</b><span>Nivel ${inv.jobLevel ?? 1}</span></div>${bar(inv.jobXp ?? 0, inv.jobXpNext ?? 100)}
            <p class="${hasTool ? "ok" : "bad"}">${tool ? (hasTool ? `${icon(ITEMS[tool], 18)} ${ITEMS[tool]!.name}` : `Te falta la herramienta (${ITEMS[tool]?.name}): habla con el maestro del gremio.`) : ""}</p>`
            : `<div class="jt"><b>Sin oficio</b></div><p class="bad">Habla con el maestro del gremio para aprender uno.</p>`}
        </section>
        ${inv.mounts?.length ? `<section class="mounts"><small>Montura (<kbd>R</kbd>)</small><div>${[null, ...inv.mounts].map(m => {
          const id = m ?? mountOf(look), on = (inv.mount ?? null) === m;
          return `<button data-mount="${m ?? ""}" aria-pressed="${on}">${MOUNTS[id].name}${m ? "" : " <em>de tu clase</em>"}${MOUNTS[id].flies ? " · vuela" : ""}</button>`;
        }).join("")}</div></section>` : ""}
        <nav class="tabs" role="tablist">${TABS.map(([t, l]) => `<button role="tab" data-tab="${t}" aria-selected="${t === tab}">${l}</button>`).join("")}</nav>
        ${empty}<div class="grid">${cells.join("")}${tab === "all" ? '<span class="cell void"></span>'.repeat(free) : ""}</div>
        <p class="detail"><span class="muted">Pasa el ratón por un objeto para ver qué es.</span></p>
        <p class="hint">Clic en arma o armadura: equipar · <kbd>I</kbd> cierra</p>`;
    },
  };
  return api;
}
