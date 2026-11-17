// Panel de administración (solo cuentas con rol de administrador): solicitudes de cuenta (aprobar con contraseña
// temporal o rechazar), cuentas (contraseña temporal nueva, bloquear), jugadores conectados (expulsar),
// eventos del mundo (doble experiencia, doble recolección, luna de lobos) y avisos para todos.
import { WORLD_EVENTS, type AdminOp, type ServerMsg, type WorldEventId } from "@mmorpg/shared";

type State = Extract<ServerMsg, { t: "adminState" }>;
type Result = Extract<ServerMsg, { t: "adminResult" }>;
type Tab = "pending" | "accounts" | "online" | "events" | "announce";
const TABS: [Tab, string][] = [["pending", "Solicitudes"], ["accounts", "Cuentas"], ["online", "Conectados"], ["events", "Eventos"], ["announce", "Aviso"]];
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (ms?: number) => (ms ? new Date(ms).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function createAdminPanel(op: (o: AdminOp) => void, onPlay: () => void) {
  const el = document.createElement("div"); el.id = "admin"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-labelledby", "admin-h");
  document.body.append(el);
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) el.addEventListener(t, e => e.stopPropagation());
  let tab: Tab = "pending", state: State | null = null, result: Result | null = null, timer = 0;

  el.addEventListener("click", ev => {
    const t = ev.target as HTMLElement, b = t.closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.tab) { tab = d.tab as Tab; render(); return; }
    if (b.classList.contains("ad-play")) { api.hide(); onPlay(); return; }
    if (b.classList.contains("ad-copy") && result?.tempPass) { void navigator.clipboard?.writeText(result.tempPass).then(() => { b.textContent = "Copiada"; }, () => { b.textContent = "Selecciónala y cópiala"; }); return; }
    if (d.op === "approve" || d.op === "reject" || d.op === "resetPass" || d.op === "ban" || d.op === "unban") {
      if ((d.op === "reject" || d.op === "ban") && !confirm(d.op === "reject" ? `¿Rechazar la solicitud de ${d.user}?` : `¿Bloquear la cuenta de ${d.user}? Se le expulsará del juego.`)) return;
      op({ op: d.op, user: d.user! }); return;
    }
    if (d.op === "kick" && confirm(`¿Expulsar a ${d.name}?`)) { op({ op: "kick", name: d.name! }); return; }
    if (d.op === "event") { op({ op: "event", id: d.id as WorldEventId, minutes: Number(d.min) }); return; }
    if (d.op === "announce") { const txt = el.querySelector<HTMLTextAreaElement>("#ad-text")!.value.trim(); if (txt) op({ op: "announce", text: txt }); return; }
    if (d.op === "refresh") op({ op: "refresh" });
  });

  function body(): string {
    if (!state) return `<p class="ad-empty">Cargando…</p>`;
    const now = Date.now();
    if (tab === "pending") {
      const list = state.accounts.filter(a => a.status === "pending");
      return list.length ? `<ul class="ad-list">${list.map(a => `<li><div><b>${esc(a.user)}</b><small>${a.email ? esc(a.email) + " · " : ""}pedida ${date(a.created)}</small>${a.note ? `<q>${esc(a.note)}</q>` : ""}</div>
        <span class="ad-acts"><button data-op="approve" data-user="${esc(a.user)}" class="ok">Aceptar</button><button data-op="reject" data-user="${esc(a.user)}" class="no">Rechazar</button></span></li>`).join("")}</ul>`
        : `<p class="ad-empty">No hay solicitudes pendientes.</p>`;
    }
    if (tab === "accounts") {
      const list = state.accounts.filter(a => a.status !== "pending");
      return `<ul class="ad-list">${list.map(a => `<li class="${a.status}"><div><b>${esc(a.user)}</b>${a.role === "admin" ? ' <small class="tag">admin</small>' : ""}${a.status === "banned" ? ' <small class="tag ban">bloqueada</small>' : ""}
        <small>${a.chars.length ? a.chars.map(esc).join(", ") : "sin personajes"} · última vez ${date(a.lastLogin)}</small></div>
        <span class="ad-acts"><button data-op="resetPass" data-user="${esc(a.user)}">Contraseña temporal</button>${a.role === "admin" ? "" : a.status === "banned" ? `<button data-op="unban" data-user="${esc(a.user)}">Desbloquear</button>` : `<button data-op="ban" data-user="${esc(a.user)}" class="no">Bloquear</button>`}</span></li>`).join("")}</ul>`;
    }
    if (tab === "online") {
      return state.online.length ? `<ul class="ad-list">${state.online.map(o => `<li><div><b>${esc(o.name)}</b><small>cuenta ${esc(o.user || "—")} · nivel ${o.level}</small></div><span class="ad-acts"><button data-op="kick" data-name="${esc(o.name)}" class="no">Expulsar</button></span></li>`).join("")}</ul>`
        : `<p class="ad-empty">No hay nadie conectado.</p>`;
    }
    if (tab === "events") {
      return `<ul class="ad-list ad-events">${(Object.keys(WORLD_EVENTS) as WorldEventId[]).map(id => {
        const ev = WORLD_EVENTS[id], on = state!.events.find(e => e.id === id && e.until > now), left = on ? Math.ceil((on.until - now) / 60000) : 0;
        return `<li class="${on ? "on" : ""}"><div><b>${ev.name}</b>${on ? ` <small class="tag">activo · ${left} min</small>` : ""}<small>${ev.desc}</small></div>
          <span class="ad-acts">${[15, 30, 60].map(m => `<button data-op="event" data-id="${id}" data-min="${m}">${on ? "+" : ""}${m} min</button>`).join("")}${on ? `<button data-op="event" data-id="${id}" data-min="0" class="no">Terminar</button>` : ""}</span></li>`;
      }).join("")}</ul>`;
    }
    return `<label for="ad-text">Aviso para todos los jugadores conectados</label><textarea id="ad-text" maxlength="200" rows="3" placeholder="Por ejemplo: esta noche reiniciamos el servidor a las 22:00"></textarea>
      <button data-op="announce" class="ok">Enviar aviso</button>`;
  }
  function render() {
    if (el.hidden) return;
    const pend = state?.accounts.filter(a => a.status === "pending").length ?? 0;
    el.innerHTML = `<div class="ad-win">
      <header><div><small>Valdoria · beta</small><h2 id="admin-h">Administración</h2></div><button data-op="refresh" class="ghost">Actualizar</button><button class="ad-play">Jugar</button></header>
      <nav>${TABS.map(([id, l]) => `<button data-tab="${id}" aria-pressed="${tab === id}">${l}${id === "pending" && pend ? ` <b class="n">${pend}</b>` : id === "online" && state ? ` <b class="n gray">${state.online.length}</b>` : ""}</button>`).join("")}</nav>
      ${result ? `<div class="ad-result ${result.ok ? "ok" : "bad"}"><span>${esc(result.text)}</span>${result.tempPass ? `<div class="pw"><small>Contraseña temporal de <b>${esc(result.user ?? "")}</b> (dásela; al entrar tendrá que cambiarla):</small><code>${esc(result.tempPass)}</code><button class="ad-copy">Copiar</button></div>` : ""}</div>` : ""}
      <section class="ad-body">${body()}</section></div>`;
  }

  const api = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; render(); op({ op: "refresh" }); clearInterval(timer); timer = window.setInterval(() => op({ op: "refresh" }), 10000); },
    hide() { el.hidden = true; clearInterval(timer); },
    setState(s: State) { state = s; render(); },
    setResult(r: Result) { result = r; render(); },
  };
  return api;
}
