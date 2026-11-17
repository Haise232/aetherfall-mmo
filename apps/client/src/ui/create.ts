// Creación de personaje: tras dar el nombre se elige clase y, según la clase, aspecto y tono.
import * as THREE from "three";
import { CLASSES, TONES, type ClassDef, type LookSel } from "@mmorpg/shared";
import { Character, playerLook } from "../models/character";
import { passiveIcon, skillIcon } from "./skills";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

const CSS = `
#create { position: fixed; inset: 0; z-index: 50; display: none; background: rgba(13,18,28,.5); font-family: var(--text); color: var(--cal); overflow: hidden auto; }
#create.open { display: block; }
#create .hang { width: min(900px, calc(100vw - 32px)); margin: 0 auto 24px; filter: drop-shadow(7px 7px 0 rgba(13,18,28,.5)); }
#create.open .hang { animation: unfurl .6s cubic-bezier(.3,1.2,.5,1) both; }
#create .rod { height: 14px; margin: 0 -18px; background: var(--pizarra-d); border-bottom: 3px solid var(--oro); }
#create form { margin: 0; padding: 20px 32px 26px; background: var(--pizarra); }
#create h1 { margin: 0; font: 700 clamp(40px, 7vh, 60px)/1 var(--display); letter-spacing: .5px; }
#create .lead { margin: 6px 0 14px; font-size: 18px; }
#create fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
#create legend { padding: 0; font-weight: 700; font-size: 16px; margin-bottom: 8px; }
#create input[type=radio] { position: absolute; opacity: 0; pointer-events: none; }

/* Clases: cuatro pendones, cada uno con su esmalte. El elegido se llena de color. */
#create .classes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
#create .cls { display: block; cursor: pointer; padding: 12px 10px 26px; text-align: center; font: 600 26px/1 var(--display);
  background: var(--pizarra-d); color: var(--cal-d); border-top: 6px solid var(--c);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 14px), 0 100%); }
#create .cls:hover { color: var(--cal); }
#create input:checked + .cls { background: var(--c); color: var(--cal); }
#create input:focus-visible + .cls { border-top-color: var(--oro); color: var(--cal); text-decoration: underline; text-decoration-color: var(--oro); text-underline-offset: 5px; }

#create .body { display: grid; grid-template-columns: 300px 1fr; gap: 28px; margin-top: 18px; align-items: start; }
/* El retrato toma el esmalte de la clase elegida. */
#create .stage { position: relative; height: 380px; background: var(--c); transition: background-color .3s; cursor: grab; touch-action: none; }
#create .stage:active { cursor: grabbing; }
#create .stage::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: 26px; height: 46px; border-radius: 50%; background: rgba(13,18,28,.28); }
#create .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }
#create .turn { position: absolute; left: 0; right: 0; bottom: 6px; text-align: center; font-size: 13px; z-index: 2; pointer-events: none; }
#create h2 { margin: 0; font: 600 40px/1 var(--display); }
#create .blurb { margin: 6px 0 14px; font-size: 17px; line-height: 1.35; max-width: 40ch; }
#create .opts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
#create .opt { display: block; cursor: pointer; padding: 7px 14px 8px; background: var(--pizarra-d); border: 2px solid transparent; font-weight: 500; }
#create .opt:hover { border-color: var(--cal-d); }
#create input:checked + .opt { background: var(--cal); color: var(--pizarra); font-weight: 700; }
#create input:focus-visible + .opt { border-color: var(--oro); }
#create .tone { display: block; cursor: pointer; width: 34px; height: 34px; border-radius: 50%; background: var(--t); border: 3px solid var(--pizarra-d); box-shadow: 0 0 0 2px transparent; }
#create input:checked + .tone { box-shadow: 0 0 0 3px var(--oro); }
#create input:focus-visible + .tone { box-shadow: 0 0 0 3px var(--cal); }
#create .basic { margin: 0 0 8px; font-size: 15px; }
#create .skills { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 6px; max-width: 46ch; }
#create .skills li { display: grid; grid-template-columns: auto auto 1fr; gap: 0 8px; align-items: center; font-size: 15px; line-height: 1.25; }
#create .skills svg { width: 18px; height: 18px; fill: var(--cal); }
#create .skills .pas { margin-top: 4px; } #create .skills small { font-weight: 400; color: var(--cal-d); }
#create .skills b { grid-column: 3; } #create .skills span { grid-column: 3; color: var(--cal-d); }
#create .note { font-size: 14px; color: var(--cal-d); margin: 0 0 12px; max-width: 46ch; line-height: 1.35; }
#create .go { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
#create button { cursor: pointer; font: 800 19px var(--text); border: 0; border-radius: 0; outline: 3px solid transparent; outline-offset: 3px; }
#create .enter { padding: 12px 28px; color: var(--pizarra); background: var(--oro); box-shadow: 4px 4px 0 var(--pizarra-d); }
#create .enter:hover:not(:disabled) { background: var(--cal); }
#create .enter:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--pizarra-d); }
#create .enter:disabled { background: var(--cal-d); cursor: default; }
#create .back { background: none; color: var(--cal); font-weight: 500; font-size: 16px; text-decoration: underline; text-underline-offset: 3px; padding: 4px 0; }
#create button:focus-visible { outline-color: var(--cal); }
@media (max-width: 760px) {
  #create form { padding: 20px 18px 24px; }
  #create .classes { grid-template-columns: repeat(2, 1fr); } #create .cls { font-size: 22px; }
  #create .body { grid-template-columns: 1fr; gap: 16px; } #create .stage { height: 280px; }
}
@media (prefers-reduced-motion: reduce) { #create.open .hang { animation: none; } #create .stage { transition: none; } }
`;

export interface Creator {
  show(name: string): void;
  hide(): void;
  readonly open: boolean;
  /** Abre el selector en modo cambio de clase (botón y título distintos). */
  changeClass(name?: string): void;
}

export function createCreator(city: string, onSubmit: (look: LookSel, changeClass: boolean) => void, onBack: () => void): Creator {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement("div"); el.id = "create";
  el.innerHTML = `
    <div class="hang"><div class="rod"></div>
    <form>
      <h1></h1>
      <p class="lead">Elige tu clase y tu aspecto antes de cruzar la puerta.</p>
      <fieldset><legend>Clase</legend><div class="classes">${CLASSES.map((c, i) =>
        `<div><input type="radio" name="cls" id="cls-${c.id}" value="${i}"><label class="cls" for="cls-${c.id}" style="--c:${hex(c.color)}">${c.name}</label></div>`).join("")}</div></fieldset>
      <div class="body">
        <div class="stage" title="Arrastra para girar"><canvas></canvas><div class="turn">Arrastra para girar</div></div>
        <div>
          <h2></h2><p class="blurb"></p>
          <fieldset><legend></legend><div class="opts styles"></div></fieldset>
          <fieldset><legend>Tono</legend><div class="opts">${TONES.map((t, i) =>
            `<div><input type="radio" name="tone" id="tone-${i}" value="${i}"><label class="tone" for="tone-${i}" style="--t:${hex(t.color)}" title="${t.name}"><span hidden>${t.name}</span></label></div>`).join("")}</div></fieldset>
          <fieldset><legend>Habilidades</legend><p class="basic"></p><ul class="skills"></ul></fieldset>
          <p class="note">La clase decide tus tres habilidades. Puedes cambiarla hablando con el maestro del gremio.</p>
          <div class="go"><button type="submit" class="enter"></button><button type="button" class="back">Cambiar de nombre</button></div>
        </div>
      </div>
    </form></div>`;
  document.body.appendChild(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const form = q<HTMLFormElement>("form"), h1 = q("h1"), h2 = q("h2"), blurb = q(".blurb"), stylesBox = q(".styles"), styleLegend = q(".body legend");
  const basicEl = q(".basic"), skillsBox = q(".skills"), stage = q(".stage"), canvas = q<HTMLCanvasElement>("canvas"), enter = q<HTMLButtonElement>(".enter");
  enter.textContent = "Entrar a " + city;
  for (const t of ["keydown", "keyup", "pointerdown", "wheel"]) el.addEventListener(t, e => e.stopPropagation());

  let isOpen = false, changeMode = false, cls: ClassDef = CLASSES[0]!, styleI = 0, toneI = 0;
  const sel = (): LookSel => [cls.id, styleI, toneI];

  // ---- retrato 3D (renderizador propio, solo vive mientras la pantalla está abierta) ----
  let renderer: THREE.WebGLRenderer | null = null, raf = 0, body: Character | null = null, yaw = 0.5, dragX: number | null = null;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 300 / 380, 0.1, 30);
  camera.position.set(0, 1.35, 5.2); camera.lookAt(0, 1.02, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9c, 1.6));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.4); key.position.set(2.5, 4, 3.5); scene.add(key);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fit = () => { if (!renderer) return; const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  addEventListener("resize", fit);
  stage.addEventListener("pointerdown", e => { dragX = e.clientX; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener("pointermove", e => { if (dragX === null) return; yaw += (e.clientX - dragX) * 0.012; dragX = e.clientX; });
  for (const t of ["pointerup", "pointercancel"]) stage.addEventListener(t, () => { dragX = null; });
  function startPreview() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    body = new Character(playerLook(sel()), { shadow: false }); body.blob.visible = false; scene.add(body.group);
    fit();
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (dragX === null && !still) yaw += dt * 0.35;
      body!.group.rotation.y = yaw; body!.update(dt, 0);
      renderer!.render(scene, camera);
    };
    loop();
  }
  function stopPreview() {
    cancelAnimationFrame(raf);
    if (body) scene.remove(body.group);
    body = null; renderer?.dispose(); renderer?.forceContextLoss(); renderer = null;
  }

  // ---- selección ----
  function paint(cheer = false) {
    h2.textContent = cls.name; blurb.textContent = cls.blurb; stage.style.setProperty("--c", hex(cls.color));
    styleLegend.textContent = "Aspecto de " + cls.name.toLowerCase();
    body?.setLook(playerLook(sel()));
    if (cheer) body?.emote("Cheer");
  }
  function pickClass(i: number) {
    cls = CLASSES[i]!; styleI = 0;
    // los aspectos dependen de la clase: se reconstruyen al cambiarla (los ocultos no se muestran)
    stylesBox.innerHTML = cls.styles.map((s, k) => s.hidden ? "" :
      `<div><input type="radio" name="style" id="style-${k}" value="${k}"${k === 0 ? " checked" : ""}><label class="opt" for="style-${k}">${s.name}</label></div>`).join("");
    basicEl.textContent = cls.range ? `Ataque básico a distancia, hasta ${cls.range} m.` : "Ataque básico cuerpo a cuerpo.";
    skillsBox.innerHTML = cls.skills.map((s, k) => `<li><kbd>${k + 1}</kbd>${skillIcon(s.kind)}<b>${s.name}</b><span>${s.desc}</span></li>`).join("")
      + `<li class="pas"><kbd>P</kbd>${passiveIcon()}<b>${cls.passive.name} <small>(pasiva)</small></b><span>${cls.passive.desc}</span></li>`;
    paint(true);
  }
  form.addEventListener("change", ev => {
    const t = ev.target as HTMLInputElement, v = Number(t.value);
    if (t.name === "cls") pickClass(v);
    else { if (t.name === "style") styleI = v; else if (t.name === "tone") toneI = v; paint(); }
  });
  form.addEventListener("submit", ev => {
    ev.preventDefault();
    enter.disabled = true; enter.textContent = changeMode ? "Cambiando…" : "Entrando…";
    onSubmit(sel(), changeMode);
  });
  q(".back").addEventListener("click", () => { if (changeMode) { api.hide(); changeMode = false; } else onBack(); });

  const api = {
    show(name: string) {
      changeMode = false;
      h1.textContent = name;
      enter.disabled = false; enter.textContent = "Entrar a " + city;
      if (isOpen) return;
      isOpen = true; el.classList.add("open");
      toneI = 0; q<HTMLInputElement>("#tone-0").checked = true;
      const i = Math.max(0, CLASSES.indexOf(cls)); q<HTMLInputElement>("#cls-" + CLASSES[i]!.id).checked = true;
      startPreview(); pickClass(i);
      setTimeout(() => q<HTMLInputElement>("input[name=cls]:checked").focus(), 50);
    },
    changeClass(name?: string) {
      changeMode = true;
      h1.textContent = name ?? "Cambiar de clase";
      enter.disabled = false; enter.textContent = "Cambiar de clase";
      q(".back").textContent = "Cancelar";
      if (isOpen) return;
      isOpen = true; el.classList.add("open");
      const i = Math.max(0, CLASSES.indexOf(cls)); q<HTMLInputElement>("#cls-" + CLASSES[i]!.id).checked = true;
      startPreview(); pickClass(i);
      setTimeout(() => q<HTMLInputElement>("input[name=cls]:checked").focus(), 50);
    },
    hide() {
      if (!isOpen) return;
      isOpen = false; changeMode = false; q(".back").textContent = "Cambiar de nombre";
      el.classList.remove("open"); stopPreview();
    },
    get open() { return isOpen; },
  };
  return api;
}
