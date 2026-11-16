import * as THREE from "three";
import type { ClientMsg, EntityState, InvState, ServerMsg, Slot } from "@mmorpg/shared";
import { CITY_NAME, FLY, ITEMS, PLAYER, resolveCollisions } from "@mmorpg/shared";
import { Wolf } from "./models/wolf";
import { Character, playerLook, preloadCharacters } from "./models/character";
import { Broom } from "./models/broom";
import { buildLobby } from "./world/lobby";
import { buildLife } from "./world/life";
import "./ui/hud.css";
import { createMinimap } from "./ui/minimap";
import { createLogin } from "./ui/login";
const minimap = createMinimap();

const $ = (id: string) => document.getElementById(id)!;
const info = $("info"), hpfill = $("hpfill"), hptxt = $("hptxt"), log = $("log"), chatin = $("chatin") as HTMLInputElement, deadEl = $("dead"), panel = $("panel"), xpfill = $("xpfill");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize); resize();

void preloadCharacters();
const lobby = buildLobby(scene);
const life = buildLife(scene);
// Con cámara en perspectiva se ve el horizonte: cielo y niebla de distancia.
const SKY = 0xb9cfe4;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 160, 620);

// ---- Entidades ----
interface View {
  group: THREE.Group; // posición en el mundo
  rot: THREE.Group; // orientación (yaw) y altura de salto
  body: THREE.Mesh; // volumen para picking
  bar: THREE.Mesh;
  bars: THREE.Group;
  wolf?: Wolf;
  player?: Character;
  label?: THREE.Sprite; labelText?: string;
  tx: number; tz: number; state: EntityState;
  heading: number; // rad, 0 = +Z
  deadFor: number; // seg desde que murió
  jumpT: number; // seg desde que saltó; <0 si está en el suelo
  alt: number; // altura mostrada (vuelo en escoba)
  lean: number; // inclinación al volar
  barsY: number;
  broom?: Broom;
}
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const views = new Map<number, View>();
let myId = -1;
const barBg = new THREE.PlaneGeometry(1.2, 0.14), barFg = new THREE.PlaneGeometry(1.2, 0.14);
barFg.translate(0.6, 0, 0); // ancla a la izquierda para escalar en x

function nameSprite(text: string, color: string) {
  const c = document.createElement("canvas"); c.width = 320; c.height = 56;
  const g = c.getContext("2d")!; g.font = "bold 28px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.9)"; g.strokeText(text, 160, 30); g.fillStyle = color; g.fillText(text, 160, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(2.9, 0.5, 1); sp.renderOrder = 12;
  return sp;
}
function upsert(e: EntityState) {
  let v = views.get(e.id);
  if (!v) {
    const group = new THREE.Group();
    const rot = new THREE.Group();
    let body: THREE.Mesh, wolf: Wolf | undefined, player: Character | undefined;
    if (e.kind === "mob") {
      wolf = new Wolf(); body = wolf.hitbox; rot.add(wolf.group);
    } else {
      player = new Character(playerLook(e.weapon, e.armor), { shadow: true }); body = player.hitbox; rot.add(player.group);
    }
    body.userData.id = e.id;
    const bg = new THREE.Mesh(barBg, new THREE.MeshBasicMaterial({ color: 0x220000, depthTest: false }));
    const bar = new THREE.Mesh(barFg, new THREE.MeshBasicMaterial({ color: 0xdd3333, depthTest: false }));
    const bars = new THREE.Group(); bars.position.set(0, e.kind === "mob" ? 1.9 : 2.55, 0);
    bar.position.x = -0.6; bar.position.z = 0.001;
    bg.renderOrder = 10; bar.renderOrder = 11;
    bars.add(bg, bar);
    group.add(rot, bars);
    group.position.set(e.x, 0, e.z);
    rot.rotation.order = "YXZ"; // primero el rumbo, luego la inclinación
    rot.rotation.y = e.ry;
    scene.add(group);
    v = { group, rot, body, bar, bars, wolf, player, tx: e.x, tz: e.z, state: e, heading: e.ry, deadFor: 0, jumpT: -1, alt: e.y ?? 0, lean: 0, barsY: bars.position.y };
    views.set(e.id, v);
    if (e.id === myId) { pred.x = e.x; pred.z = e.z; pred.y = e.y ?? 0; pred.ready = true; flying = !!e.fly; }
  }
  v.state = e; v.tx = e.x; v.tz = e.z;
  if (!e.dead) { v.deadFor = 0; v.group.visible = true; }
  v.wolf?.setDead(e.dead);
  if (v.player) {
    v.player.setDead(e.dead);
    // Depuración: ?look=arma,armadura fuerza el aspecto de tu personaje.
    const dbg = e.id === myId ? new URLSearchParams(location.search).get("look")?.split(",") : undefined;
    v.player.setLook(playerLook(dbg ? dbg[0] || undefined : e.weapon, dbg ? dbg[1] || undefined : e.armor));
    const text = "Nv" + e.level + " " + e.name;
    if (v.labelText !== text) {
      v.label?.removeFromParent();
      v.label = nameSprite(text, e.id === myId ? "#9fd0ff" : "#ffffff"); v.label.position.y = 2.9; v.labelText = text;
      v.group.add(v.label);
    }
  }
  v.bar.scale.x = Math.max(0.001, e.hp / e.maxHp);
}

// ---- HUD ----
function say(text: string, color = "#fff") {
  const d = document.createElement("div"); d.textContent = text; d.style.color = color; log.appendChild(d);
  while (log.childElementCount > 8) log.firstElementChild!.remove();
}
function floatText(id: number, text: string, color: string) {
  const v = views.get(id); if (!v) return;
  const p = v.group.position.clone(); p.y = 2.6; p.project(camera);
  if (p.z > 1) return; // detrás de la cámara
  const d = document.createElement("div"); d.className = "dmg"; d.textContent = text; d.style.color = color;
  d.style.left = ((p.x + 1) / 2) * innerWidth + "px"; d.style.top = ((1 - p.y) / 2) * innerHeight + "px";
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}

// ---- Red y entrada al mundo ----
let joined = false;
let savedName = "";
try { savedName = localStorage.getItem("name") ?? ""; } catch { /* sin almacenamiento */ }
let invState: InvState | null = null;
const ws = new WebSocket("ws://" + location.hostname + ":8787");
const send = (m: ClientMsg) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const login = createLogin(CITY_NAME, name => send({ t: "join", name }));
info.textContent = "conectando…";
login.show();
ws.onopen = () => {
  login.setReady(true);
  if (savedName) { login.setReady(true, "Entrando…"); send({ t: "join", name: savedName }); }
};
ws.onclose = () => {
  info.textContent = "desconectado del servidor";
  joined = false; login.setReady(false, "Sin conexión"); login.show("Se perdió la conexión con el servidor. Recarga la página.");
};
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data) as ServerMsg;
  if (msg.t === "welcome") { myId = msg.id; return; }
  if (msg.t === "joined") {
    joined = true; savedName = msg.name;
    try { localStorage.setItem("name", msg.name); } catch { /* ignorar */ }
    login.hide();
    return;
  }
  if (msg.t === "joinError") {
    login.setReady(true);
    login.show(msg.reason === "taken" ? "Ese nombre ya está dentro del juego ahora mismo. Elige otro." : "Ese nombre no es válido. Usa de 2 a 16 letras o números.");
    return;
  }
  if (msg.t === "inv") { invState = msg; renderPanel(); return; }
  const alive = new Set<number>();
  for (const e of msg.entities) { upsert(e); alive.add(e.id); }
  for (const [id, v] of views) if (!alive.has(id)) { scene.remove(v.group); views.delete(id); }
  for (const ev of msg.events) {
    if (ev.e === "hit") {
      const a = views.get(ev.from), b = views.get(ev.to);
      if (a && b) { a.wolf?.attack(); a.player?.attack(); }
      floatText(ev.to, "-" + ev.dmg, ev.to === myId ? "#ff5050" : "#ffe060");
    } else if (ev.e === "death") {
      const n = views.get(ev.id)?.state.name ?? "?", k = views.get(ev.killer)?.state.name ?? "?";
      say(`${k} mató a ${n}`, "#ffa060");
    } else if (ev.e === "loot") {
      if (ev.to === myId) say("+" + ev.qty + " " + (ITEMS[ev.item]?.name ?? ev.item), "#8f8");
    } else if (ev.e === "levelup") {
      say((views.get(ev.id)?.state.name ?? "?") + " sube a nivel " + ev.level + "!", "#ff6");
      floatText(ev.id, "¡NIVEL " + ev.level + "!", "#ffff60");
    } else if (ev.e === "jump") {
      const v = views.get(ev.id);
      if (v && ev.id !== myId && v.jumpT < 0) { v.jumpT = 0; v.player?.jump(); } // el salto propio ya se inició al pulsar
    } else say(`${ev.name}: ${ev.text}`, "#cfe");
  }
  const me = views.get(myId)?.state;
  if (me) {
    if (me.dead) flying = false;
    hpfill.style.width = (me.hp / me.maxHp) * 100 + "%";
    hptxt.textContent = `${me.name}  Nv ${me.level}  ${me.hp}/${me.maxHp}`;
    deadEl.style.display = me.dead ? "flex" : "none";
  }
  const n = msg.entities.filter(e => e.kind === "player").length;
  info.textContent = CITY_NAME + " · jugadores: " + n;
};

// ---- Inventario ----
function itemLabel(id: string) {
  const d = ITEMS[id];
  if (!d) return id;
  const st = d.damage ? " +" + d.damage + " daño" : d.defense ? " +" + d.defense + " def" : "";
  return "T" + d.tier + " " + d.name + st;
}
function renderPanel() {
  if (!invState) return;
  xpfill.style.width = (invState.xp / invState.xpNext) * 100 + "%";
  if (panel.style.display === "none" || !panel.style.display) return;
  const eq = invState.equip;
  let h = "<h2>Inventario</h2><b>Nivel " + invState.level + "</b> · XP " + invState.xp + "/" + invState.xpNext + "<h3>Equipado</h3>";
  for (const slot of ["weapon", "armor"] as Slot[]) {
    const id = eq[slot];
    h += "<div class=\"row\" data-un=\"" + slot + "\"><span>" + (slot === "weapon" ? "Arma" : "Armadura") + ": " + (id ? itemLabel(id) : "—") + "</span></div>";
  }
  h += "<h3>Mochila</h3>";
  const items = Object.entries(invState.inv);
  if (!items.length) h += "<div class=\"hint\">vacía: mata lobos</div>";
  for (const [id, n] of items) h += "<div class=\"row\" data-eq=\"" + id + "\"><span>" + itemLabel(id) + "</span><span>x" + n + "</span></div>";
  h += "<div class=\"hint\">clic: equipar / desequipar · I: cerrar</div>";
  panel.innerHTML = h;
}
panel.addEventListener("click", ev => {
  const row = (ev.target as HTMLElement).closest<HTMLElement>(".row");
  if (!row) return;
  if (row.dataset.eq) send({ t: "equip", item: row.dataset.eq });
  else if (row.dataset.un) send({ t: "unequip", slot: row.dataset.un as Slot });
});

// ---- Controles ----
// WASD: moverse respecto a la cámara (el personaje mira hacia donde camina) · Espacio: saltar
// Arrastrar con el ratón (cualquier botón): girar la cámara · rueda: zoom
// R: subir o bajar de la escoba voladora · volando: Espacio sube, Shift (o C) baja
const keys = new Set<string>();
const cam = { yaw: Math.PI, pitch: 0.38, dist: 13 }; // yaw PI = mirando al norte, hacia el castillo
let charYaw = Math.PI;
let lmb = false, rmb = false, dragDist = 0;
const typing = () => document.activeElement instanceof HTMLInputElement;
const canvas = renderer.domElement;
const ray = new THREE.Raycaster();

canvas.addEventListener("contextmenu", ev => ev.preventDefault());
canvas.addEventListener("pointerdown", ev => {
  if (ev.button === 0) { lmb = true; dragDist = 0; }
  if (ev.button === 2) rmb = true;
  canvas.setPointerCapture(ev.pointerId);
  if (typing()) (document.activeElement as HTMLElement).blur();
});
canvas.addEventListener("pointermove", ev => {
  if (!lmb && !rmb) return;
  dragDist += Math.abs(ev.movementX) + Math.abs(ev.movementY);
  cam.yaw -= ev.movementX * 0.0055;
  cam.pitch = Math.max(0.04, Math.min(1.45, cam.pitch + ev.movementY * 0.0045));
});
const release = (ev: PointerEvent) => {
  if (ev.button === 0) {
    if (lmb && dragDist < 6 && joined) pick(ev.clientX, ev.clientY); // clic sin arrastrar: seleccionar/atacar
    lmb = false;
  }
  if (ev.button === 2) rmb = false;
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", () => { lmb = rmb = false; });
canvas.addEventListener("wheel", ev => { cam.dist = Math.max(3, Math.min(48, cam.dist * (ev.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });
addEventListener("blur", () => { keys.clear(); lmb = rmb = false; });

function pick(cx: number, cy: number) {
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const bodies = [...views.values()].filter(v => v.group.visible && !v.state.dead).map(v => v.body);
  const id = ray.intersectObjects(bodies)[0]?.object.userData.id as number | undefined;
  if (id !== undefined && id !== myId) send({ t: "attack", target: id });
}

addEventListener("keydown", ev => {
  if (login.open) return;
  if (ev.key === "Enter") {
    if (document.activeElement === chatin) {
      if (chatin.value.trim()) send({ t: "chat", text: chatin.value });
      chatin.value = ""; chatin.blur();
    } else { keys.clear(); chatin.focus(); }
    return;
  }
  if (typing()) { if (ev.key === "Escape") (document.activeElement as HTMLElement).blur(); return; }
  if (ev.code === "KeyI") { panel.style.display = panel.style.display === "block" ? "none" : "block"; renderPanel(); }
  if (ev.code === "Space") { ev.preventDefault(); if (!ev.repeat && !flying) jump(); }
  if (ev.code === "KeyR" && !ev.repeat) toggleBroom();
  if (ev.code.startsWith("Arrow")) ev.preventDefault();
  keys.add(ev.code);
});
addEventListener("keyup", ev => keys.delete(ev.code));

// Salto: visual y validado por el servidor (que lo difunde a los demás).
const JUMP_V = 7.5, GRAVITY = 22, JUMP_TIME = (2 * JUMP_V) / GRAVITY;
function jump() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead || me.jumpT >= 0) return;
  me.jumpT = 0; me.player?.jump();
  send({ t: "jump" });
}

// Escoba voladora: el servidor valida el estado, la altura y la velocidad.
let flying = false;
function toggleBroom() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead) return;
  flying = !flying;
  if (flying) { me.jumpT = -1; pred.y = Math.max(pred.y, 0.2); }
  send({ t: "mount", on: flying });
}

// Predicción local: el personaje propio se mueve al instante con las mismas reglas que el servidor,
// y se corrige suavemente hacia la posición autoritativa.
const pred = { x: 0, z: 0, y: 0, ready: false };
const sent = { dx: 0, dz: 0, dy: 0, ry: 0, at: 0 };
function control(dt: number, me: View, now: number) {
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  const alive = joined && !me.state.dead && !typing();
  let fwd = 0, side = 0, dy = 0;
  if (alive) {
    fwd = Math.min(1, k("KeyW") + k("ArrowUp")) - Math.min(1, k("KeyS") + k("ArrowDown"));
    side = Math.min(1, k("KeyD") + k("ArrowRight")) - Math.min(1, k("KeyA") + k("ArrowLeft"));
    if (flying) dy = k("Space") - Math.min(1, k("ShiftLeft") + k("ShiftRight") + k("KeyC"));
  }
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx; // adelante y derecha de la cámara
  let dx = fx * fwd + rx * side, dz = fz * fwd + rz * side;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  const moving = len > 0;
  if (moving) charYaw = Math.atan2(dx, dz); // el personaje mira hacia donde se mueve

  if (pred.ready) {
    const speed = PLAYER.speed * (flying ? FLY.speedMult : 1);
    pred.x += dx * speed * dt; pred.z += dz * speed * dt;
    if (flying) pred.y = Math.max(FLY.minY, Math.min(FLY.maxY, pred.y + dy * FLY.vSpeed * dt));
    else pred.y = Math.max(0, pred.y - FLY.fallSpeed * dt);
    [pred.x, pred.z] = resolveCollisions(pred.x, pred.z, 0.4, pred.y);
    const ex = me.tx - pred.x, ez = me.tz - pred.z, err = Math.hypot(ex, ez);
    if (err > 12) { pred.x = me.tx; pred.z = me.tz; pred.y = me.state.y ?? 0; } // reaparición o corrección grande
    else { const c = Math.min(1, dt * (moving ? 2 : 10)); pred.x += ex * c; pred.z += ez * c; }
  }

  // Enviar la intención al servidor: al cambiar (máx. 20/s) y como latido mientras hay movimiento.
  const changed = Math.abs(dx - sent.dx) > 0.01 || Math.abs(dz - sent.dz) > 0.01 || dy !== sent.dy || (moving && Math.abs(angDiff(charYaw, sent.ry)) > 0.03);
  const since = now - sent.at;
  if (joined && ((changed && since > 50) || ((moving || dy !== 0) && since > 200))) {
    sent.dx = dx; sent.dz = dz; sent.dy = dy; sent.ry = charYaw; sent.at = now;
    send({ t: "input", dx: +dx.toFixed(3), dz: +dz.toFixed(3), ry: +charYaw.toFixed(2), dy });
  }
  return moving;
}

// ---- Bucle ----
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(0, 3, 0);
function frame() {
  const dt = Math.min(0.1, clock.getDelta()), now = performance.now(), t = clock.elapsedTime;
  const me = views.get(myId);
  const moving = me ? control(dt, me, now) : false;

  for (const v of views.values()) {
    const px = v.group.position.x, pz = v.group.position.z;
    if (v === me && pred.ready) { v.group.position.x = pred.x; v.group.position.z = pred.z; }
    else { v.group.position.x += (v.tx - px) * Math.min(1, dt * 14); v.group.position.z += (v.tz - pz) * Math.min(1, dt * 14); }
    const speed = Math.hypot(v.group.position.x - px, v.group.position.z - pz) / Math.max(dt, 1e-3);
    if (!v.state.dead) v.heading = v === me ? charYaw : v.state.ry;
    v.rot.rotation.y += angDiff(v.rot.rotation.y, v.heading) * Math.min(1, dt * 14);
    // altura: vuelo en escoba (o caída al desmontar) más el arco del salto
    const fly = v === me ? flying : !!v.state.fly;
    const wantAlt = v === me ? pred.y : v.state.y ?? 0;
    v.alt = v === me ? wantAlt : v.alt + (wantAlt - v.alt) * Math.min(1, dt * 12);
    let hop = 0;
    if (v.jumpT >= 0) {
      v.jumpT += dt;
      if (v.jumpT >= JUMP_TIME) v.jumpT = -1;
      else hop = JUMP_V * v.jumpT - 0.5 * GRAVITY * v.jumpT * v.jumpT;
    }
    v.rot.position.y = v.alt + hop;
    v.bars.position.y = v.barsY + v.alt;
    if (v.label) v.label.position.y = 2.9 + v.alt;
    if (v.player) {
      if (fly && !v.broom) { v.broom = new Broom(); v.broom.group.position.y = 0.42; v.rot.add(v.broom.group); }
      if (v.broom) { v.broom.group.visible = fly; if (fly) v.broom.update(t, Math.min(1, speed / (PLAYER.speed * FLY.speedMult))); }
      v.player.setRiding(fly);
      v.lean += ((fly ? 0.22 * Math.min(1, speed / 8) : 0) - v.lean) * Math.min(1, dt * 6);
      v.rot.rotation.x = v.lean;
    }
    if (v.wolf) {
      v.wolf.update(dt, speed);
      if (v.state.dead) { v.deadFor += dt; if (v.deadFor > 3) v.group.visible = false; }
    }
    v.player?.update(dt, fly ? 0 : speed);
    if (v.label) v.label.visible = !v.state.dead;
    v.bars.visible = !v.state.dead;
    v.bars.quaternion.copy(camera.quaternion);
  }

  // Cámara en tercera persona que orbita al personaje. Antes de entrar: vuelo lento sobre la plaza.
  let yaw = cam.yaw, pitch = cam.pitch, dist = cam.dist;
  if (me && joined) camTarget.set(me.group.position.x, 1.7 + me.alt + (me.rot.position.y - me.alt) * 0.6, me.group.position.z);
  else { camTarget.set(0, 4, 0); yaw = t * 0.06; pitch = 0.42; dist = 52; }
  const cp = Math.cos(pitch);
  camera.position.set(camTarget.x - Math.sin(yaw) * cp * dist, Math.max(0.6, camTarget.y + Math.sin(pitch) * dist), camTarget.z - Math.cos(yaw) * cp * dist);
  camera.lookAt(camTarget);

  minimap.update(me, views.values());
  lobby.update(dt, t, camTarget);
  life.update(dt, t, me && joined ? me.group.position : camTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
