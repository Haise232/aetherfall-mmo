// Pantalla de entrada (beta con cuentas): entrar o crear cuenta y, después, elegir o crear personaje.
import { MAX_CHARS, PASS_MIN, USER_RE, classOf, type CharSummary } from "@mmorpg/shared";
const CSS = `
#login { position: fixed; inset: 0; z-index: 50; display: none; background: rgba(13,18,28,.38); font-family: var(--text); color: var(--cal); }
#login.open { display: block; }
/* El estandarte cuelga de un asta sobre la ciudad, que se sigue viendo detrás. */
#login .hang { position: absolute; top: 0; left: clamp(16px, 9vw, 140px); width: min(430px, calc(100vw - 32px));
  filter: drop-shadow(7px 7px 0 rgba(13,18,28,.5)); transform-origin: top; }
#login.open .hang { animation: unfurl .75s cubic-bezier(.3,1.25,.5,1) both; }
@keyframes unfurl { from { transform: translateY(-104%); } to { transform: none; } }
#login .rod { height: 14px; margin: 0 -18px; background: var(--pizarra); border-bottom: 3px solid var(--oro); }
#login form { margin: 0; padding: 34px 38px 96px; background: var(--gules);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 56px), 0 100%); }
#login svg { display: block; width: 76px; height: auto; fill: var(--oro); }
#login h1 { margin: 10px 0 0; font: 700 clamp(60px, 12vh, 92px)/.92 var(--display); letter-spacing: 1px; }
#login .sub { margin: 10px 0 26px; font-size: 19px; line-height: 1.3; max-width: 26ch; }
#login label { display: block; font-size: 16px; font-weight: 700; margin-bottom: 6px; }
#login input { width: 100%; box-sizing: border-box; font: 500 21px var(--text); color: var(--pizarra); padding: 9px 12px 10px;
  border: 0; border-radius: 0; background: var(--cal); outline: 3px solid transparent; outline-offset: 2px; }
#login input:focus { outline-color: var(--oro); }
#login input::placeholder { color: #8d8672; }
#login .hint { font-size: 14px; margin-top: 8px; min-height: 36px; line-height: 1.3; }
#login .err { font-weight: 700; background: var(--cal); color: var(--gules); padding: 4px 8px; }
#login button { margin-top: 10px; width: 100%; padding: 12px; cursor: pointer; font: 800 19px var(--text); color: var(--pizarra);
  border: 0; border-radius: 0; background: var(--oro); box-shadow: 4px 4px 0 var(--pizarra-d); outline: 3px solid transparent; outline-offset: 3px; }
#login button:hover:not(:disabled) { background: var(--cal); }
#login button:focus-visible { outline-color: var(--cal); }
#login button:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--pizarra-d); }
#login button:disabled { background: var(--cal-d); cursor: default; }
/* Controles: lista aparte, abajo a la derecha, para leerla mientras se mira la ciudad. */
#login dl { position: absolute; right: clamp(16px, 4vw, 48px); bottom: 28px; margin: 0; box-sizing: border-box;
  max-width: calc(100vw - clamp(16px, 9vw, 140px) - min(430px, calc(100vw - 32px)) - clamp(16px, 4vw, 48px) - 24px); /* nunca encima del estandarte */ padding: 14px 18px 16px; background: var(--pizarra);
  box-shadow: 4px 4px 0 rgba(13,18,28,.5); display: grid; grid-template-columns: auto auto; gap: 7px 16px; align-items: center; font-size: 15px; }
#login dt { display: flex; gap: 3px; justify-content: flex-end; } #login dd { margin: 0; }
@media (max-width: 900px), (max-height: 560px) { #login dl { display: none; } }
@media (max-height: 640px) { #login form { padding: 18px 30px 72px; } #login svg { width: 52px; } #login .sub { margin: 6px 0 14px; font-size: 16px; } }
@media (max-width: 520px) { #login .hang { left: 16px; } #login form { padding-left: 24px; padding-right: 24px; } }
@media (prefers-reduced-motion: reduce) { #login.open .hang { animation: none; } }
/* Pestañas, casilla de recordar y selección de personaje */
#login .tabs { display: flex; gap: 4px; margin: 0 0 14px; }
#login .tabs button { margin: 0; width: auto; flex: 1; padding: 7px 10px 8px; font-size: 16px; background: rgba(13,18,28,.25); color: var(--cal); box-shadow: none; }
#login .tabs button[aria-selected="true"] { background: var(--cal); color: var(--gules); }
#login .tabs button:hover:not([aria-selected="true"]) { background: rgba(13,18,28,.45); }
#login .field { margin-bottom: 10px; } #login .field label { margin-bottom: 4px; } #login .field small { font-weight: 500; opacity: .8; }
#login .remember { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; margin: 4px 0 0; cursor: pointer; }
#login .remember input { width: 20px; height: 20px; padding: 0; accent-color: var(--oro); }
#login .chars { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
#login .chars button { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; padding: 10px 14px; background: var(--cal); color: var(--pizarra); box-shadow: 4px 4px 0 var(--pizarra-d); }
#login .chars button b { font: 700 22px/1 var(--display); } #login .chars button span { font-size: 14px; font-weight: 700; color: #6b6450; }
#login .chars button:hover { background: var(--oro); }
#login .empty { margin: 0 0 12px; font-size: 16px; }
#login .new { display: flex; gap: 6px; } #login .new input { flex: 1; } #login .new button { margin: 0; width: auto; padding: 0 16px; }
#login .who { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 0 0 12px; font-size: 16px; }
#login .link { margin: 0; width: auto; padding: 0; background: none; box-shadow: none; color: var(--cal); font-weight: 500; font-size: 15px; text-decoration: underline; text-underline-offset: 3px; }
#login .link:hover:not(:disabled) { background: none; color: var(--oro); }
#login .note { margin: 0 0 12px; font-size: 15px; line-height: 1.35; }
#login .hint.ok { font-weight: 700; background: var(--sinople); color: var(--cal); padding: 6px 8px; }
#login .admin-open { margin: 0 0 12px; background: var(--pizarra); color: var(--oro); }
#login .admin-open:hover:not(:disabled) { background: var(--pizarra-d); color: var(--cal); }
`;

export interface Login {
  /** Pantalla de cuenta (entrar o solicitar); `msg` en rojo (o en verde si `ok`). */
  showAuth(msg?: string, ok?: boolean): void;
  /** Selección de personaje de la cuenta `user` (los administradores ven también el panel). */
  showChars(user: string, chars: CharSummary[], error?: string, admin?: boolean): void;
  /** Cambio de contraseña obligatorio (después de una temporal). */
  showChange(user: string, error?: string): void;
  hide(): void;
  /** Los botones solo se activan cuando hay conexión con el servidor. */
  setReady(ready: boolean, text?: string): void;
  /** Bloquea el formulario mientras el servidor responde. */
  busy(text: string): void;
  readonly open: boolean;
}
export interface LoginHandlers {
  login(user: string, pass: string, remember: boolean): void;
  register(user: string, email: string, note: string): void;
  changePass(pass: string): void;
  play(name: string): void;
  logout(): void;
  admin(): void;
}

export function createLogin(city: string, h: LoginHandlers): Login {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement("div"); el.id = "login";
  el.innerHTML = `
    <div class="hang"><div class="rod"></div>
    <form autocomplete="on" novalidate>
      <svg viewBox="0 0 76 52" aria-hidden="true"><path d="M0 52V18h4v-6h4v6h4v-6h4v6h4v12h8V8h4V0h4v8h4V0h4v8h4V0h4v8h4v22h8V18h4v-6h4v6h4v-6h4v6h4v34H46V40a8 8 0 0 0-16 0v12z"/></svg>
      <h1></h1>
      <p class="sub">Ciudad amurallada. Dentro estás a salvo; fuera rondan los lobos.</p>
      <div class="body"></div>
      <div class="hint" role="status"></div>
    </form></div>
    <dl>
      <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Moverte</dd>
      <dt><kbd>Espacio</kbd></dt><dd>Saltar</dd>
      <dt><kbd>Ratón</kbd></dt><dd>Arrastra para girar la cámara, rueda para el zoom</dd>
      <dt><kbd>Clic</kbd></dt><dd>Atacar a un enemigo</dd>
      <dt><kbd>1</kbd>–<kbd>4</kbd> <kbd>K</kbd></dt><dd>Habilidades y su progresión</dd>
      <dt><kbd>R</kbd></dt><dd>Montura: caballo, cabra, pantera o, si eres mago, escoba voladora (Espacio sube, Shift baja)</dd>
      <dt><kbd>E</kbd></dt><dd>Hablar, sentarse o trabajar en tu oficio</dd>
      <dt><kbd>I</kbd><kbd>M</kbd><kbd>Enter</kbd></dt><dd>Inventario, mapa y chat</dd>
    </dl>`;
  document.body.appendChild(el);
  el.querySelector("h1")!.textContent = city;
  const form = el.querySelector("form")!, body = el.querySelector<HTMLElement>(".body")!, hint = el.querySelector<HTMLElement>(".hint")!;
  let ready = false, isOpen = false, mode: "login" | "register" | "chars" | "change" = "login", busyText = "";
  let charsUser = "", charsList: CharSummary[] = [], isAdmin = false;
  const $ = <T extends HTMLElement>(s: string) => body.querySelector<T>(s);
  const say = (msg = "", err = false) => { hint.textContent = msg; hint.classList.toggle("err", err); };
  const open = () => { isOpen = true; el.classList.add("open"); };
  const cleanName = (v: string) => v.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16);
  const submitLabel = () => (!ready ? "Conectando…" : busyText || ({ login: "Entrar", register: "Solicitar cuenta", chars: "Crear personaje", change: "Guardar contraseña" } as const)[mode]);
  const syncButtons = () => body.querySelectorAll<HTMLButtonElement>("button").forEach(b => { if (!b.classList.contains("tab")) b.disabled = !ready || !!busyText; });

  function renderAuth() {
    const reg = mode === "register";
    body.innerHTML = `
      <div class="tabs" role="tablist"><button type="button" class="tab" role="tab" data-mode="login" aria-selected="${!reg}">Entrar</button><button type="button" class="tab" role="tab" data-mode="register" aria-selected="${reg}">Solicitar cuenta</button></div>
      <div class="field"><label for="login-user">Usuario</label><input id="login-user" name="username" maxlength="16" spellcheck="false" autocomplete="username" placeholder="De 3 a 16 letras o números"></div>
      ${reg ? `<p class="note">La beta es por invitación: pide tu cuenta y, cuando la aprobemos, te daremos una contraseña temporal.</p>
      <div class="field"><label for="login-mail">Correo <small>(opcional)</small></label><input id="login-mail" type="email" maxlength="120" autocomplete="email"></div>
      <div class="field"><label for="login-note">Mensaje <small>(opcional: quién eres)</small></label><input id="login-note" maxlength="300" autocomplete="off"></div>`
      : `<div class="field"><label for="login-pass">Contraseña</label><input id="login-pass" name="password" type="password" maxlength="128" autocomplete="current-password"></div>
      <label class="remember"><input type="checkbox" id="login-rem" checked> Recordarme en este navegador</label>`}
      <button type="submit" class="go">${submitLabel()}</button>`;
    syncButtons();
    setTimeout(() => $<HTMLInputElement>("#login-user")?.focus(), 50);
  }
  function renderChars() {
    const can = charsList.length < MAX_CHARS;
    body.innerHTML = `
      <p class="who"><span>Hola, <b></b>.</span><button type="button" class="link logout">Cerrar sesión</button></p>
      ${isAdmin ? `<button type="button" class="admin-open">Panel de administración</button>` : ""}
      ${charsList.length ? `<ul class="chars">${charsList.map((c, i) => `<li><button type="button" data-play="${i}"><b></b><span>${c.look ? (classOf(c.look[0])?.name ?? "") + " · " : ""}nivel ${c.level}</span></button></li>`).join("")}</ul>`
        : `<p class="empty">Aún no tienes personajes. Crea el primero:</p>`}
      ${can ? `<label for="login-name">Nuevo personaje</label><div class="new"><input id="login-name" maxlength="16" spellcheck="false" autocomplete="off" placeholder="Por ejemplo, Aldara"><button type="submit" class="go">${submitLabel()}</button></div>`
        : `<p class="empty">Tienes el máximo de ${MAX_CHARS} personajes.</p>`}`;
    body.querySelector(".who b")!.textContent = charsUser;
    body.querySelectorAll<HTMLElement>("[data-play] b").forEach((b, i) => { b.textContent = charsList[i]!.name; });
    syncButtons();
    setTimeout(() => (body.querySelector<HTMLElement>("[data-play]") ?? $<HTMLInputElement>("#login-name"))?.focus(), 50);
  }
  function renderChange() {
    body.innerHTML = `
      <p class="who"><span>Hola, <b></b>.</span><button type="button" class="link logout">Cerrar sesión</button></p>
      <p class="note">Estás usando una contraseña temporal. Elige la tuya para seguir.</p>
      <input type="text" name="username" autocomplete="username" hidden>
      <div class="field"><label for="login-new">Contraseña nueva</label><input id="login-new" type="password" maxlength="128" autocomplete="new-password" placeholder="Mínimo ${PASS_MIN} caracteres"></div>
      <div class="field"><label for="login-new2">Repítela</label><input id="login-new2" type="password" maxlength="128" autocomplete="new-password"></div>
      <button type="submit" class="go">${submitLabel()}</button>`;
    body.querySelector(".who b")!.textContent = charsUser;
    (body.querySelector<HTMLInputElement>('input[name="username"]')!).value = charsUser;
    syncButtons();
    setTimeout(() => $<HTMLInputElement>("#login-new")?.focus(), 50);
  }
  const render = () => (mode === "chars" ? renderChars() : mode === "change" ? renderChange() : renderAuth());

  body.addEventListener("click", ev => {
    const t = ev.target as HTMLElement;
    const tab = t.closest<HTMLElement>("[data-mode]"); if (tab) { mode = tab.dataset.mode as typeof mode; say(); render(); return; }
    const play = t.closest<HTMLElement>("[data-play]"); if (play && ready && !busyText) { const c = charsList[Number(play.dataset.play)]; if (c) { api.busy("Entrando…"); h.play(c.name); } return; }
    if (t.closest(".logout")) { h.logout(); mode = "login"; say(); render(); return; }
    if (t.closest(".admin-open")) h.admin();
  });
  body.addEventListener("input", () => { if (hint.classList.contains("err")) say(); });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!ready || busyText) return;
    if (mode === "chars") {
      const name = cleanName($<HTMLInputElement>("#login-name")?.value ?? "");
      if (name.length < 2) { say("El nombre necesita al menos 2 letras o números.", true); return; }
      api.busy("Creando…"); h.play(name); return;
    }
    if (mode === "change") {
      const a = $<HTMLInputElement>("#login-new")?.value ?? "", b = $<HTMLInputElement>("#login-new2")?.value ?? "";
      if (a.length < PASS_MIN) { say(`La contraseña necesita al menos ${PASS_MIN} caracteres.`, true); return; }
      if (a !== b) { say("Las dos contraseñas no coinciden.", true); return; }
      api.busy("Guardando…"); h.changePass(a); return;
    }
    const user = ($<HTMLInputElement>("#login-user")?.value ?? "").trim(), pass = $<HTMLInputElement>("#login-pass")?.value ?? "", rem = $<HTMLInputElement>("#login-rem")?.checked ?? true;
    if (!USER_RE.test(user)) { say("El usuario debe tener de 3 a 16 letras, números o guiones bajos.", true); return; }
    if (mode === "register") {
      api.busy("Enviando…"); h.register(user, ($<HTMLInputElement>("#login-mail")?.value ?? "").trim(), ($<HTMLInputElement>("#login-note")?.value ?? "").trim());
    } else {
      if (!pass) { say("Escribe tu contraseña.", true); return; }
      api.busy("Entrando…"); h.login(user, pass, rem);
    }
  });
  // que las teclas del formulario no lleguen al juego
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) el.addEventListener(t, e => e.stopPropagation());

  const api: Login = {
    showAuth(msg, ok) { busyText = ""; if (mode === "chars" || mode === "change" || ok) mode = "login"; open(); render(); say(msg ?? "", !!msg && !ok); hint.classList.toggle("ok", !!ok); },
    showChars(user, chars, error, admin) { busyText = ""; mode = "chars"; charsUser = user; charsList = chars; isAdmin = !!admin; open(); render(); say(error ?? "", !!error); },
    showChange(user, error) { busyText = ""; mode = "change"; charsUser = user; open(); render(); say(error ?? "", !!error); },
    hide() { isOpen = false; busyText = ""; el.classList.remove("open"); (document.activeElement as HTMLElement | null)?.blur?.(); },
    setReady(r, text) { ready = r; if (text) busyText = text; else if (!r) busyText = ""; const go = body.querySelector<HTMLButtonElement>(".go"); if (go) go.textContent = submitLabel(); syncButtons(); if (!r) say(); },
    busy(text) { busyText = text; const go = body.querySelector<HTMLButtonElement>(".go"); if (go) go.textContent = text; syncButtons(); say(); },
    get open() { return isOpen; },
  };
  render();
  return api;
}
