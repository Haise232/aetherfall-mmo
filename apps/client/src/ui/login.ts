// Pantalla de entrada: pide el nombre del personaje la primera vez (sin prompt() del navegador).
const CSS = `
#login { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(10,8,5,.35) 0%, rgba(10,8,5,.82) 75%); font-family: var(--serif, Georgia, serif); }
#login.open { display: flex; animation: login-in .5s ease-out; }
@keyframes login-in { from { opacity: 0; } to { opacity: 1; } }
#login .card { width: min(440px, calc(100vw - 32px)); padding: 6px; border-radius: 10px;
  background: linear-gradient(160deg, #5e3d1f, #24150a 60%, #3d2713); border: 2px solid #7a5a1c;
  box-shadow: 0 0 0 1px #000, 0 18px 60px rgba(0,0,0,.75), inset 0 0 0 1px rgba(243,217,138,.25); }
#login .inner { padding: 26px 30px 22px; border-radius: 6px; color: #2a1a0c; text-align: center;
  background: radial-gradient(ellipse at 30% 20%, #f3e7c4, #e2d09f 60%, #c9b283); border: 1px solid #8a6a34;
  box-shadow: inset 0 0 40px rgba(110,70,20,.35); }
#login .crest { font-size: 34px; line-height: 1; color: #7a2a14; }
#login h1 { margin: 6px 0 0; font-size: 40px; letter-spacing: 6px; text-transform: uppercase; color: #4a2a0c;
  text-shadow: 0 1px 0 #f7edcf, 0 2px 6px rgba(74,42,12,.35); font-weight: 700; }
#login .sub { font-style: italic; color: #6b4a1f; margin: 2px 0 14px; font-size: 15px; }
#login .rule { height: 0; border-top: 2px double #8a6a34; margin: 0 20px 16px; }
#login label { display: block; font-size: 16px; margin-bottom: 8px; color: #3a220c; }
#login input { width: 100%; box-sizing: border-box; font: 20px var(--serif, Georgia, serif); text-align: center; color: #2a1a0c;
  padding: 10px 12px; border-radius: 4px; border: 2px solid #8a6a34; background: rgba(255,250,232,.75); outline: none;
  box-shadow: inset 0 2px 6px rgba(74,42,12,.3); }
#login input:focus { border-color: #b8862a; box-shadow: inset 0 2px 6px rgba(74,42,12,.3), 0 0 0 3px rgba(212,166,64,.35); }
#login .hint { font-size: 12px; color: #6b5733; margin-top: 6px; min-height: 16px; }
#login .err { color: #a11d12; font-weight: 700; }
#login button { margin-top: 14px; width: 100%; padding: 12px; cursor: pointer; font: 700 17px var(--serif, Georgia, serif);
  letter-spacing: 2px; text-transform: uppercase; color: #f7e7b5; border-radius: 4px; border: 2px solid #7a5a1c;
  background: linear-gradient(#8f2a1a, #5d150c); text-shadow: 0 1px 2px #000;
  box-shadow: inset 0 1px 0 rgba(255,220,160,.35), 0 3px 8px rgba(0,0,0,.4); transition: filter .15s, transform .05s; }
#login button:hover:not(:disabled) { filter: brightness(1.18); }
#login button:active:not(:disabled) { transform: translateY(1px); }
#login button:disabled { filter: grayscale(.6) brightness(.8); cursor: default; }
#login .keys { margin-top: 16px; font-size: 12px; color: #4a3a1c; line-height: 1.9; }
#login kbd { font: 700 11px var(--serif, Georgia, serif); padding: 2px 6px; border-radius: 3px; background: #3d2713; color: #f3d98a;
  border: 1px solid #7a5a1c; box-shadow: 0 1px 0 #000; }
`;

export interface Login {
  /** Muestra el formulario; `error` aparece en rojo bajo el campo. */
  show(error?: string): void;
  hide(): void;
  /** El botón solo se activa cuando hay conexión con el servidor. */
  setReady(ready: boolean, text?: string): void;
  readonly open: boolean;
}

export function createLogin(city: string, onSubmit: (name: string) => void): Login {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement("div"); el.id = "login";
  el.innerHTML = `
    <form class="card" autocomplete="off"><div class="inner">
      <div class="crest">⚜</div>
      <h1></h1>
      <div class="sub">Las puertas de la ciudad te esperan</div>
      <div class="rule"></div>
      <label for="login-name">¿Cómo te llamas, viajero?</label>
      <input id="login-name" maxlength="16" spellcheck="false" placeholder="Nombre de tu personaje">
      <div class="hint">De 2 a 16 letras o números. Tu progreso se guarda con este nombre.</div>
      <button type="submit" disabled>Conectando…</button>
      <div class="keys">
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> moverte · <kbd>Espacio</kbd> saltar · arrastra el ratón para girar la cámara<br>
        <kbd>R</kbd> escoba voladora: <kbd>Espacio</kbd> sube, <kbd>Shift</kbd> baja · rueda para el zoom<br>
        clic en un enemigo para atacar · <kbd>I</kbd> inventario · <kbd>M</kbd> mapa · <kbd>Enter</kbd> chat
      </div>
    </div></form>`;
  document.body.appendChild(el);
  el.querySelector("h1")!.textContent = city;
  const form = el.querySelector("form")!, input = el.querySelector("input")!, hint = el.querySelector<HTMLElement>(".hint")!, btn = el.querySelector("button")!;
  const HINT = hint.textContent!;
  let ready = false, isOpen = false;
  const clean = (v: string) => v.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16);
  const fail = (msg: string) => { hint.textContent = msg; hint.classList.add("err"); input.focus(); };
  input.addEventListener("input", () => { hint.textContent = HINT; hint.classList.remove("err"); });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!ready) return;
    const name = clean(input.value);
    if (name.length < 2) { fail("Escribe al menos 2 letras o números."); return; }
    btn.disabled = true; btn.textContent = "Entrando…";
    onSubmit(name);
  });
  // que las teclas del formulario no lleguen al juego
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) el.addEventListener(t, e => e.stopPropagation());
  return {
    show(error) {
      isOpen = true; el.classList.add("open");
      btn.disabled = !ready; btn.textContent = ready ? "Entrar al mundo" : "Conectando…";
      if (error) fail(error); else { hint.textContent = HINT; hint.classList.remove("err"); }
      setTimeout(() => input.focus(), 50);
    },
    hide() { isOpen = false; el.classList.remove("open"); input.blur(); },
    setReady(r, text) { ready = r; btn.disabled = !r; btn.textContent = text ?? (r ? "Entrar al mundo" : "Conectando…"); },
    get open() { return isOpen; },
  };
}
