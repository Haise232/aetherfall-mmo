import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ClientMsg, EntityState, InvState, ServerMsg, Slot } from "@mmorpg/shared";
import { MARKET_RANGE, fmtCoins } from "@mmorpg/shared";
import { GATHER, GATHER_NODES, RARITIES, gatherOfJob, gatherTime, rarityOf, type GatherKind } from "@mmorpg/shared";
import { START_SKILLS, equippedSkills, freePoints, rankedSkill, skillByKey } from "@mmorpg/shared";
import type { CharSummary } from "@mmorpg/shared";
import { DISTRICTS, SEATS, SEAT_RANGE, TOWNSFOLK_SEATS, districtAt, type DistrictId } from "@mmorpg/shared";
import { createGatherNodes } from "./world/nodes";
import { createGatherBar } from "./ui/gather";
import { createInventory } from "./ui/inventory";
import { createSkillsWindow } from "./ui/progression";
import { createTopbar } from "./ui/topbar";
import { createAdminPanel } from "./ui/admin";
import { createWorldBanner } from "./ui/worldEvents";
import { rayBlockDist } from "@mmorpg/shared";
import { INTERIOR_ROOMS, CITY_NAME, FLY, GODDESS_STATUE, PRAY_RANGE, ITEMS, MOB_XP, NPCS, PLAYER, QUESTS, TALK_RANGE, classOf, inSafeZone, isBlessed, jobOf, lookColor, MOUNTS, mountOf, npcOf, passiveOf, questOf, resolveCollisions, skillsOf, styleOf } from "@mmorpg/shared";
import { Wolf } from "./models/wolf";
import { Character, playerLook, preloadCharacters } from "./models/character";
import { Broom } from "./models/broom";
import { Steed } from "./models/steed";
import { buildLobby } from "./world/lobby";
import { createSky } from "./world/sky";
import { buildLife } from "./world/life";
import "@fontsource-variable/grenze-gotisch";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "@fontsource/alegreya-sans/800.css";
import "./ui/hud.css";
import { createMinimap } from "./ui/minimap";
import { createLogin } from "./ui/login";
import { createCreator } from "./ui/create";
import { createSkillBar } from "./ui/skills";
import { createTargetFrame } from "./ui/target";
import { createFx } from "./world/fx";
import { createNpcs, type NpcMark } from "./world/npcs";
import { createBubble } from "./world/bubble";
import { createQuestUi } from "./ui/quest";
import { createMarket } from "./ui/market";
import { createMarket as createMarketWorld } from "./world/market";
import { createParks } from "./world/parks";
import { createMountSound } from "./world/mountSound";
import { createAmbience } from "./world/ambience";
const minimap = createMinimap();

const $ = (id: string) => document.getElementById(id)!;
const info = $("info"), hpfill = $("hpfill"), hptxt = $("hptxt"), log = $("log"), chatin = $("chatin") as HTMLInputElement, deadEl = $("dead"), panel = $("panel"), xpfill = $("xpfill"), pname = $("pname"), lvl = $("lvl");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 900);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", resize); resize();

void preloadCharacters();
const lobby = buildLobby(scene);
const life = buildLife(scene);
// Cielo con sol, luna, estrellas y nubes, y ciclo de día y noche (la misma hora para todos).
const sky = createSky(scene, lobby.lights);
const clockEl = $("mm-time");
let clockShown = "";
/** "14:20 · Tarde": hora del juego redondeada a 10 minutos. */
function clockText(h: number) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
  const part = h < 5 || h >= 21 ? "Noche" : h < 7 ? "Amanecer" : h < 12 ? "Mañana" : h < 18 ? "Tarde" : h < 21 ? "Atardecer" : "Noche";
  const s = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${part}`;
  return s;
}

// ---- Entidades ----
interface View {
  group: THREE.Group; // posición en el mundo
  rot: THREE.Group; // orientación (yaw) y altura de salto
  body: THREE.Mesh; // volumen para picking
  bar: THREE.Mesh;
  lag: THREE.Mesh; lagW: number; lagHold: number; // tramo de vida perdido que se vacía con retraso
  stars?: THREE.Group; // aturdido
  bars: THREE.Group;
  wolf?: Wolf;
  player?: Character;
  label?: THREE.Sprite; labelText?: string;
  bubble?: ReturnType<typeof createBubble>; // último mensaje de chat sobre la cabeza
  actT?: number; // seg hasta repetir la animación de faena
  turnRate?: number; prevHeading?: number; // velocidad de giro (rad/s): la montura se inclina en las curvas
  line?: THREE.Line; // sedal mientras pesca
  aura?: THREE.Mesh; // anillo a los pies mientras dura un efecto
  tx: number; tz: number; state: EntityState;
  heading: number; // rad, 0 = +Z
  deadFor: number; // seg desde que murió
  jumpT: number; // seg desde que saltó; <0 si está en el suelo
  alt: number; // altura mostrada (vuelo en escoba)
  lean: number; // inclinación al volar
  barsY: number;
  steed?: Broom | Steed; steedId?: string; // montura actual (se rehace si cambia la clase)
  mount?: number; // 0 a pie · 1 montado (transición animada)
  seatY?: number; // cuánto se eleva el jinete sobre una montura de tierra
  bank?: number; // alabeo al girar volando
}
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const views = new Map<number, View>();
let myId = -1;
const barBg = new THREE.PlaneGeometry(1.3, 0.22), barFg = new THREE.PlaneGeometry(1.2, 0.13);
barFg.translate(0.6, 0, 0); // ancla a la izquierda para escalar en x
const barMat = (color: number) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
const FOE = 0xd8434f, FRIEND = 0x5fae55;

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
      player = new Character(playerLook(e.look, e.weapon), { shadow: true }); body = player.hitbox; rot.add(player.group);
    }
    body.userData.id = e.id;
    const bg = new THREE.Mesh(barBg, barMat(0x111a29));
    const lag = new THREE.Mesh(barFg, barMat(0xf5d76a));
    const bar = new THREE.Mesh(barFg, barMat(e.kind === "mob" ? FOE : FRIEND));
    const bars = new THREE.Group(); bars.position.set(0, e.kind === "mob" ? 1.9 : 2.55, 0);
    for (const m of [lag, bar]) m.position.x = -0.6;
    lag.position.z = 0.001; bar.position.z = 0.002;
    bg.renderOrder = 10; lag.renderOrder = 11; bar.renderOrder = 12;
    bars.add(bg, lag, bar);
    group.add(rot, bars);
    if (player) group.add(player.blob); // la sombra de contacto se queda en el suelo aunque el personaje salte o vuele
    group.position.set(e.x, 0, e.z);
    rot.rotation.order = "YXZ"; // primero el rumbo, luego la inclinación
    rot.rotation.y = e.ry;
    scene.add(group);
    v = { group, rot, body, bar, lag, lagW: e.hp / e.maxHp, lagHold: 0, bars, wolf, player, tx: e.x, tz: e.z, state: e, heading: e.ry, deadFor: 0, jumpT: -1, alt: e.y ?? 0, lean: 0, barsY: bars.position.y };
    views.set(e.id, v);
    if (e.id === myId) { pred.x = e.x; pred.z = e.z; pred.y = e.y ?? 0; pred.ready = true; flying = !!e.fly; }
  }
  if (e.stun && !v.state.stun) floatText(e.id, "Aturdido", "note stun");
  v.state = e; v.tx = e.x; v.tz = e.z;
  if (!e.dead) { v.deadFor = 0; v.group.visible = true; }
  v.wolf?.setDead(e.dead);
  if (v.player) {
    v.player.setDead(e.dead);
    v.player.setLook(playerLook(e.look, e.weapon));
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
function say(text: string, color = "#efe6d0") {
  const d = document.createElement("div"); d.textContent = text; d.style.color = color; log.appendChild(d);
  while (log.childElementCount > 8) log.firstElementChild!.remove();
}
// Números y avisos flotantes: siguen a la entidad mientras suben y se desvanecen.
// Clases: out (daño que haces), in (daño que recibes), other (daño entre terceros), note (avisos); sk = golpe de habilidad.
const floats: { el: HTMLElement; id: number; x: number; z: number; y: number; t: number; dx: number }[] = [];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function floatText(id: number, text: string, cls: string) {
  const v = views.get(id); if (!v) return;
  const el = document.createElement("div"); el.className = "dmg " + cls; el.textContent = text;
  document.body.appendChild(el);
  floats.push({ el, id, x: v.group.position.x, z: v.group.position.z, y: (v.state.kind === "mob" ? 1.7 : 2.4) + v.alt, t: 0, dx: (Math.random() - 0.5) * 50 });
  while (floats.length > 40) floats.shift()!.el.remove();
}
const fv3 = new THREE.Vector3();
function updateFloats(dt: number) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]!; f.t += dt;
    const v = views.get(f.id); if (v) { f.x = v.group.position.x; f.z = v.group.position.z; }
    fv3.set(f.x, f.y, f.z).project(camera);
    if (f.t > 1.1 || fv3.z > 1) { f.el.remove(); floats.splice(i, 1); continue; }
    const k = f.t / 1.1, rise = (1 - (1 - k) * (1 - k)) * (still ? 20 : 60), pop = still ? 1 : 1 + Math.max(0, 0.12 - f.t) * 4;
    f.el.style.transform = `translate(calc(-50% + ${f.dx * k}px), ${-rise}px) scale(${pop})`;
    f.el.style.left = ((fv3.x + 1) / 2) * innerWidth + "px"; f.el.style.top = ((1 - fv3.y) / 2) * innerHeight + "px";
    f.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
  }
}

// Al recibir daño: borde rojo que late y una sacudida corta de la cámara.
const hurtEl = document.createElement("div"); hurtEl.id = "hurt"; document.body.appendChild(hurtEl);
let hurtLevel = 0, shake = 0;

// Indicador de interacción con objetos del mundo (rezar, hablar...)
const interactEl = document.createElement("div"); interactEl.id = "interact"; document.body.appendChild(interactEl);

// ---- Red y entrada al mundo ----
let joined = false;
let savedName = ""; // personaje con el que se juega (para cambiar de clase en el gremio)
// sesión recordada: token que da el servidor al iniciar sesión con "Recordarme"
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } } };
let account: { user: string; chars: CharSummary[]; admin: boolean } | null = null, kickedText = "";
let invState: InvState | null = null, questAnnounced = false;
const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
const send = (m: ClientMsg) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const login = createLogin(CITY_NAME, {
  login: (user, pass, remember) => send({ t: "login", user, pass, remember }),
  register: (user, email, note) => send({ t: "register", user, email: email || undefined, note: note || undefined }),
  changePass: pass => send({ t: "changePass", pass }),
  admin: () => adminPanel.show(),
  play: name => send({ t: "join", name }),
  logout: () => { send({ t: "logout", token: store.get("session") ?? undefined }); store.set("session", null); account = null; location.reload(); }, // conexión nueva y limpia
});
const showChars = (error?: string) => { if (account) login.showChars(account.user, account.chars, error, account.admin); else login.showAuth(error); };
const adminPanel = createAdminPanel(o => send({ t: "admin", ...o }), () => showChars());
const worldBanner = createWorldBanner();
// Personaje nuevo: el servidor acepta el nombre y pide clase y aspecto antes de dejarlo entrar.
const creator = createCreator(CITY_NAME, ([cls, style, tone], changeClass) => {
  if (changeClass) send({ t: "changeClass", cls, style, tone });
  else send({ t: "create", cls, style, tone });
}, () => { creator.hide(); login.setReady(true); showChars(); });
info.textContent = "Conectando…";
login.showAuth();
ws.onopen = () => {
  login.setReady(true);
  const token = store.get("session");
  if (token) { login.busy("Entrando…"); send({ t: "resume", token }); }
};
ws.onclose = ev => {
  info.textContent = "Sin conexión con el servidor";
  joined = false; creator.hide(); adminPanel.hide(); login.setReady(false);
  if (ev.code === 1012 && !kickedText) { // el servidor se está actualizando: se recarga solo cuando vuelva (la sesión recordada vuelve a entrar)
    login.showAuth("El servidor se está actualizando. Volverás a entrar en unos segundos…");
    const retry = () => fetch("/salud", { cache: "no-store" }).then(r => (r.ok ? location.reload() : setTimeout(retry, 2000)), () => setTimeout(retry, 2000));
    setTimeout(retry, 2500); return;
  }
  login.showAuth(kickedText || "Se perdió la conexión con el servidor. Recarga la página.");
};
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data) as ServerMsg;
  if (msg.t === "welcome") { myId = msg.id; return; }
  if (msg.t === "joined") {
    joined = true; savedName = msg.name;
    creator.hide(); login.hide();
    return;
  }
  if (msg.t === "needLook") { login.hide(); creator.show(msg.name); return; }
  if (msg.t === "auth") {
    if (msg.token) store.set("session", msg.token);
    account = { user: msg.user, chars: msg.chars, admin: !!msg.admin };
    if (msg.mustChange) { login.showChange(msg.user); return; } // contraseña temporal: primero, la suya
    showChars();
    if (msg.admin) { login.hide(); adminPanel.show(); } // los administradores entran directos al panel
    return;
  }
  if (msg.t === "registered") { login.showAuth(msg.text, true); return; }
  if (msg.t === "adminState") { adminPanel.setState(msg); return; }
  if (msg.t === "adminResult") { adminPanel.setResult(msg); return; }
  if (msg.t === "world") { worldBanner.setEvents(msg.events); return; }
  if (msg.t === "kicked") { kickedText = msg.text; store.set("session", null); ws.close(); return; }
  if (msg.t === "authError") {
    if (msg.reason === "expired") store.set("session", null);
    if (msg.reason === "weak" && account) { login.showChange(account.user, msg.text); return; } // al cambiar la contraseña
    login.showAuth(msg.text);
    return;
  }
  if (msg.t === "joinError") {
    creator.hide(); login.setReady(true);
    const text = { taken: "Ese nombre ya está en uso. Elige otro.", invalid: "Ese nombre no es válido. Usa de 2 a 16 letras o números.", auth: "Tienes que iniciar sesión.",
      notYours: "Ese personaje pertenece a otra cuenta. Elige otro nombre.", limit: "Ya tienes el máximo de personajes." }[msg.reason];
    showChars(text);
    return;
  }
  if (msg.t === "inv") {
    const prev = invState; invState = msg; renderPanel();
    if (creator.open) { creator.hide(); }
    // anunciar misión activa al entrar al mundo
    if (joined && !questAnnounced && msg.quest) {
      questAnnounced = true;
      const q = questOf(msg.quest);
      if (q) {
        questUi.toast("new", "Nueva misión", q.title, q.description);
        say("Nueva misión: " + q.title + ". " + q.description, "#f0cf6a");
      }
    }
    // detectar completación de misión
    if (prev && prev.quest && (prev.quest !== msg.quest || msg.completedQuests.includes(prev.quest))) {
      const q = QUESTS[prev.quest];
      const npcId = questUi.npc;
      questUi.close();
      if (npcId) npcs.npcOf(npcId)?.say("¡Gracias! Que te vaya bien.", 3); // el NPC agradece la entrega
      if (q) {
        questUi.toast("done", "Misión completada", q.title, `+${q.reward.xp ?? 0} XP`);
        say(`Misión completada: ${q.title}. +${q.reward.xp ?? 0} XP`, "#a9d99a");
      }
    }
    if (prev && prev.job !== msg.job && msg.job) {
      const j = jobOf(msg.job)!; questUi.close();
      if (prev.quest === "guild" && !msg.quest) {
        const q = QUESTS["guild"]!;
        questUi.toast("done", "Misión completada", q.title, `Ahora eres ${j.name.toLowerCase()}. +${q.reward.xp} XP`);
        say(`Misión completada: ${q.title}. +${q.reward.xp} XP`, "#a9d99a");
      } else {
        questUi.toast("done", "Oficio cambiado", `Ahora eres ${j.name.toLowerCase()}`, "Puedes volver a cambiarlo cuando quieras");
      }
      say(`El gremio te ha apuntado como ${j.name.toLowerCase()}.`, "#efe6d0");
    }
    return;
  }
  // casa de subastas
  if (msg.t === "mkState") { market.setState(msg); return; }
  if (msg.t === "mkBook") { market.setBook(msg.book); return; }
  if (msg.t === "mkBoard") { marketWorld.setBoard(msg.rows); return; }
  if (msg.t === "mkResult") { market.setResult(msg); return; }
  if (msg.t !== "snapshot") return;
  const alive = new Set<number>();
  for (const e of msg.entities) { upsert(e); alive.add(e.id); }
  for (const [id, v] of views) if (!alive.has(id)) { scene.remove(v.group); v.bubble?.dispose(); if (v.line) scene.remove(v.line); if (v.steed instanceof Steed) v.steed.dispose(); views.delete(id); }
  gatherNodes.setDown(msg.down); gatherNodes.setRich(msg.rich);
  for (const ev of msg.events) {
    if (ev.e === "hit") {
      const a = views.get(ev.from), b = views.get(ev.to);
      if (a && b && !ev.sk) {
        a.wolf?.attack(); a.player?.attack(); // las habilidades ya tienen su animación
        const ac = a.state.look && classOf(a.state.look[0]);
        if (ac?.range) fx.bolt(new THREE.Vector3(a.tx, 1.4 + a.alt, a.tz), new THREE.Vector3(b.tx, b.wolf ? 0.9 : 1.2, b.tz), lookColor(a.state.look)); // ataque a distancia
      }
      if (ev.block) { // pasiva de bloqueo: el golpe no hace nada
        floatText(ev.to, "Bloqueo", "note block");
        if (b) fx.ring(b.tx, b.tz, 1.2, 0x9fc4ff, 0.3, 1.1);
        continue;
      }
      b?.wolf?.hurt(ev.sk || ev.crit); b?.player?.hurt();
      if (ev.crit && ev.from !== myId && ev.to !== myId) floatText(ev.to, "¡" + ev.dmg + "!", "other");
      else if (ev.crit && ev.from === myId) { floatText(ev.to, "¡Crítico! " + ev.dmg, "out sk crit"); shake = Math.max(shake, 0.3); }
      else if (ev.to === myId) {
        floatText(ev.to, "−" + ev.dmg, "in");
        const me = views.get(myId);
        hurtLevel = Math.min(1, hurtLevel + 0.35 + (me ? (ev.dmg / me.state.maxHp) * 3 : 0)); shake = Math.min(1, shake + 0.6);
      } else if (ev.from === myId) { floatText(ev.to, String(ev.dmg), ev.sk ? "out sk" : "out"); if (ev.sk) shake = Math.max(shake, 0.25); }
      else floatText(ev.to, String(ev.dmg), "other");
    } else if (ev.e === "death") {
      const n = views.get(ev.id)?.state.name ?? "?", k = views.get(ev.killer)?.state.name ?? "?";
      if (ev.killer === myId && views.get(ev.id)?.state.kind === "mob") floatText(ev.id, "+" + MOB_XP + " XP", "note xp");
      if (ev.id === targetId) attacking = false;
      say(`${k} mató a ${n}`, "#f2a08f");
    } else if (ev.e === "loot") {
      if (ev.to === myId) { const r = rarityOf(ev.item); say("+" + ev.qty + " " + (ITEMS[ev.item]?.name ?? ev.item), r ? "#" + RARITIES[r]!.color.toString(16).padStart(6, "0") : "#a9d99a"); }
    } else if (ev.e === "levelup") {
      say((views.get(ev.id)?.state.name ?? "?") + " sube al nivel " + ev.level, "#f0cf6a");
      floatText(ev.id, "¡Nivel " + ev.level + "!", "note lvl");
    } else if (ev.e === "jobLevelUp" && ev.id === myId) {
      const j = jobOf(ev.job);
      say(`Tu oficio de ${j?.name.toLowerCase() ?? ev.job} sube al nivel ${ev.level}`, "#a9d99a");
      floatText(ev.id, `¡${j?.name ?? ev.job} Nivel ${ev.level}!`, "note lvl");
    } else if (ev.e === "jump") {
      const v = views.get(ev.id);
      if (v && ev.id !== myId && v.jumpT < 0) { v.jumpT = 0; v.player?.jump(); } // el salto propio ya se inició al pulsar
    } else if (ev.e === "cast") onCast(ev.id, ev.slot, ev.k, ev.to);
    else if (ev.e === "heal") floatText(ev.id, "+" + ev.amount, "note heal");
    else if (ev.e === "bless") onBless(ev.id, !!ev.transformed);
    else if (ev.e === "sold") { if (ev.to === myId) say(`Has vendido ${ev.qty} × ${ITEMS[ev.item]?.name ?? ev.item} por ${fmtCoins(ev.net)}.`, "#a9d99a"); }
    else if (ev.e === "bought") { if (ev.to === myId) say(`Has comprado ${ev.qty} × ${ITEMS[ev.item]?.name ?? ev.item} a ${fmtCoins(ev.price)} c/u. Recógelo en la subasta.`, "#a9d99a"); }
    else if (ev.e === "note") { if (ev.to === myId) say(ev.text, "#f2a08f"); }
    else if (ev.e === "announce") { worldBanner.announce(ev.text); say("Aviso: " + ev.text, "#f0cf6a"); }
    else if (ev.e === "emote") {
      const v = views.get(ev.id);
      // las posturas las anima setPose; los gestos sueltos, solo de pie (tumbado no se saluda dando un brinco)
      if (v?.player && !/^(Sit_|Lie_)/.test(ev.anim) && !v.state.pose) v.player.cast(ev.anim);
      if (v && ev.text) say(`${v.state.name} ${ev.text}.`, "#cdbfe8");
    }
    else if (ev.e === "gathered") {
      const r = ev.rarity ?? 0;
      if (r >= 2) floatText(ev.id, "¡" + RARITIES[r]!.name[0]!.toUpperCase() + RARITIES[r]!.name.slice(1) + "!", "note r" + r); // calidad rara, épica o legendaria
      else if (ev.rare) floatText(ev.id, "¡Hallazgo!", "note lvl");
      if (ev.id === myId && r >= 3) say(r === 4 ? "¡Un hallazgo legendario! Pocos oficiales verán algo así." : "¡Un hallazgo de calidad épica!", "#" + RARITIES[r]!.color.toString(16).padStart(6, "0"));
      else if (ev.id === myId && ev.rare) say("¡Un hallazgo raro! Tu oficio te lo agradece.", "#f0cf6a");
    }
    else if (ev.e === "chat") {
      say(`${ev.name}: ${ev.text}`, "#efe6d0");
      const v = views.get(ev.from);
      if (v?.player && ev.name !== "Sistema") {
        v.bubble ??= createBubble({ border: ev.from === myId ? "#9fd0ff" : "#e2b23f", scale: 0.9 });
        if (!v.bubble.sprite.parent) v.group.add(v.bubble.sprite);
        v.bubble.show(ev.text);
      }
    }
  }
  const me = views.get(myId)?.state;
  if (me) {
    if (me.dead) flying = false;
    const myClass = me.look && classOf(me.look[0]);
    if (myClass) {
      const eq = equippedSkills(me.look, invState?.skills ?? START_SKILLS());
      skillBar.setClass(myClass, eq.map(e => e.sk), lookColor(me.look), passiveOf(me.look), eq.map(e => e.rank));
      topbar.setPoints(invState ? freePoints(invState.level, invState.skills ?? START_SKILLS()) : 0);
    }
    hpfill.style.width = (me.hp / me.maxHp) * 100 + "%";
    hptxt.textContent = `${me.hp} / ${me.maxHp}`; pname.textContent = me.name; lvl.textContent = String(me.level);
    deadEl.style.display = me.dead ? "flex" : "none";
  }
  const n = msg.entities.filter(e => e.kind === "player").length;
  info.textContent = n === 1 ? "1 jugador en línea" : n + " jugadores en línea";
};

// ---- Inventario y ventana de habilidades (K) ----
const inventory = createInventory(panel, item => send({ t: "equip", item }), slot => send({ t: "unequip", slot }));
const skillWin = createSkillsWindow((slot, opt) => send({ t: "skillUp", slot, opt }), (slot, opt) => send({ t: "skillPick", slot, opt }), () => send({ t: "skillReset" }));
// barra superior (como en Albion): inventario, habilidades (con los puntos sin gastar) y mapa
const topbar = createTopbar(code => dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3).toLowerCase() })));
function renderPanel() {
  if (!invState) return;
  xpfill.style.width = (invState.xp / invState.xpNext) * 100 + "%";
  const me = views.get(myId)?.state;
  market.setInventory(invState);
  inventory.render(invState, me?.name ?? savedName, me?.look, me?.maxHp ?? 100);
  if (me?.look) skillWin.render(invState, me.look);
}

// ---- Controles ----
// WASD: moverse respecto a la cámara (el personaje mira hacia donde camina) · Espacio: saltar
// Arrastrar con el ratón (cualquier botón): girar la cámara · rueda: zoom
// R: subir o bajar de la montura · en escoba: Espacio sube, Shift (o C) baja
const keys = new Set<string>();
const cam = { yaw: Math.PI, pitch: 0.38, dist: 13 }; // yaw PI = mirando al norte, hacia el castillo
// Vuelo: al avanzar se sigue la mirada. Con la cámara en FLIGHT_LEVEL (la vista normal) se vuela recto;
// mirando más abajo se pica y más arriba se asciende.
// Dentro de la catedral la cámara se acerca lo necesario para no salirse de la sala en la que está el personaje.
let camRoomDist = 13;
function roomCamDist(t: THREE.Vector3, yaw: number, pitch: number, want: number, prev: number, dt: number) {
  const cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp, TOL = 0.6;
  want = Math.min(want, rayBlockDist(t.x, t.y, t.z, dx, dy, dz, want)); // fuera: la cámara no atraviesa casas, muros ni torres
  let best = -1;
  for (const r of INTERIOR_ROOMS) {
    if (t.x < r.x0 - TOL || t.x > r.x1 + TOL || t.z < r.z0 - TOL || t.z > r.z1 + TOL || t.y > r.h) continue;
    let k = want;
    if (dx > 1e-6) k = Math.min(k, (r.x1 - t.x) / dx); else if (dx < -1e-6) k = Math.min(k, (r.x0 - t.x) / dx);
    if (dz > 1e-6) k = Math.min(k, (r.z1 - t.z) / dz); else if (dz < -1e-6) k = Math.min(k, (r.z0 - t.z) / dz);
    if (dy > 1e-6) k = Math.min(k, (r.h - t.y) / dy);
    best = Math.max(best, k);
  }
  const goal = best < 0 ? want : Math.max(1.1, best);
  return goal < prev ? prev + (goal - prev) * Math.min(1, dt * 16) : prev + (goal - prev) * Math.min(1, dt * 5);
}
const FLIGHT_LEVEL = 0.32, PITCH_MIN_FLY = -0.95, PITCH_MIN_WALK = -0.3;
let charYaw = Math.PI;
let lmb = false, rmb = false, dragDist = 0;
const typing = () => document.activeElement instanceof HTMLInputElement;
const canvas = renderer.domElement;
const ray = new THREE.Raycaster();

canvas.addEventListener("contextmenu", ev => ev.preventDefault());
canvas.addEventListener("pointerdown", ev => {
  if (!lmb && !rmb) dragDist = 0;
  if (ev.button === 0) lmb = true;
  if (ev.button === 2) rmb = true;
  canvas.setPointerCapture(ev.pointerId);
  if (typing()) (document.activeElement as HTMLElement).blur();
});
canvas.addEventListener("pointermove", ev => {
  if (!lmb && !rmb) { hoverAt = [ev.clientX, ev.clientY]; return; }
  dragDist += Math.abs(ev.movementX) + Math.abs(ev.movementY);
  cam.yaw -= ev.movementX * 0.0055;
  // volando se puede mirar hacia arriba (cámara por debajo de ti); a pie, solo un poco
  cam.pitch = Math.max(airborne() ? PITCH_MIN_FLY : PITCH_MIN_WALK, Math.min(1.45, cam.pitch + ev.movementY * 0.0045));
});
const release = (ev: PointerEvent) => {
  if (ev.button === 0) {
    if (lmb && dragDist < 6 && joined) click(ev.clientX, ev.clientY, false); // clic sin arrastrar: seleccionar
    lmb = false;
  }
  if (ev.button === 2) {
    if (rmb && dragDist < 6 && joined) click(ev.clientX, ev.clientY, true); // clic derecho sin arrastrar: atacar
    rmb = false;
  }
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", () => { lmb = rmb = false; });
canvas.addEventListener("wheel", ev => { cam.dist = Math.max(3, Math.min(48, cam.dist * (ev.deltaY > 0 ? 1.12 : 0.89))); }, { passive: true });
addEventListener("blur", () => { keys.clear(); lmb = rmb = false; });

function pick(cx: number, cy: number): number | undefined {
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const bodies = [...views.values()].filter(v => v.group.visible && !v.state.dead && v.state.id !== myId).map(v => v.body);
  return ray.intersectObjects(bodies)[0]?.object.userData.id as number | undefined;
}

// ---- Selección de objetivo ----
// Clic: seleccionar · clic otra vez sobre el seleccionado o clic derecho: atacar · Tab: siguiente enemigo · Esc: soltar
let targetId: number | null = null, attacking = false, hoverId: number | undefined, hoverAt: [number, number] | null = null, targetGone = 0;
function setTarget(id: number | null, attack = false, tell = true) {
  if (id !== targetId) { targetId = id; attacking = false; targetGone = 0; if (tell && !attack) send({ t: "select", target: id }); }
  if (attack && id !== null) {
    const v = views.get(id), me = views.get(myId);
    if (!v || v.state.kind !== "mob") return;
    if (me && (inSafeZone(me.group.position.x, me.group.position.z) || inSafeZone(v.tx, v.tz))) { say("Dentro de la ciudad no se combate. Sal por una puerta.", "#f2a08f"); return; }
    if (tell) send({ t: "attack", target: id });
    attacking = true;
  }
}
/** NPC bajo el rayo (ya colocado con setFromCamera), si lo hay. */
function pickNpc() {
  let best: string | undefined, bestD = Infinity;
  for (const h of npcs.hitboxes) {
    const i = ray.intersectObject(h)[0];
    if (i && i.distance < bestD) { bestD = i.distance; best = npcs.idOfHitbox(h); }
  }
  return best;
}
function click(cx: number, cy: number, attack: boolean) {
  // los NPCs tienen prioridad si están delante
  ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), camera);
  const npcId = pickNpc();
  if (npcId) { talk(npcId); return; }
  const id = pick(cx, cy);
  if (id === undefined) { if (!attack && targetId !== null) setTarget(null); return; } // clic en el vacío: soltar
  setTarget(id, attack || id === targetId);
}
// ---- Auras de personajes bendecidos por la diosa ----
const blessedAuraGeo = new THREE.RingGeometry(0.72, 0.86, 48).rotateX(-Math.PI / 2);
const blessedAuraMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
const blessedAuras = new Map<number, { ring: THREE.Mesh; halo: THREE.Mesh }>();
function updateBlessedAuras(dt: number, t: number) {
  for (const [id, v] of views) {
    const active = !!v.player && !v.state.dead && isBlessed(v.state.look);
    let aura = blessedAuras.get(id);
    if (active && !aura) {
      const ring = new THREE.Mesh(blessedAuraGeo, blessedAuraMat.clone()); ring.position.y = 0.16; ring.renderOrder = 5;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.y = 0.18; halo.renderOrder = 5;
      v.group.add(ring, halo);
      aura = { ring, halo };
      blessedAuras.set(id, aura);
    } else if (!active && aura) {
      v.group.remove(aura.ring, aura.halo);
      (aura.ring.material as THREE.Material).dispose(); (aura.halo.material as THREE.Material).dispose();
      blessedAuras.delete(id);
    }
    if (aura && active) {
      aura.ring.rotation.y += dt * 0.7;
      aura.halo.rotation.y -= dt * 0.45;
      aura.ring.scale.setScalar(1 + Math.sin(t * 2) * 0.08);
      aura.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.12);
      (aura.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 2) * 0.15;
      (aura.halo.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 2.4) * 0.1;
    }
  }
}

/** Tab: el siguiente enemigo vivo más cercano delante de la cámara (hasta 40 m). */
function cycleTarget() {
  const me = views.get(myId); if (!me) return;
  const px = me.group.position.x, pz = me.group.position.z, fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const list = [...views.values()].filter(v => v.state.kind === "mob" && !v.state.dead && v.group.visible)
    .map(v => ({ id: v.state.id, d: Math.hypot(v.tx - px, v.tz - pz), front: (v.tx - px) * fx + (v.tz - pz) * fz > -2 }))
    .filter(o => o.d < 40 && o.front).sort((a, b) => a.d - b.d);
  if (!list.length) { say("No hay enemigos cerca.", "#f2a08f"); return; }
  const i = list.findIndex(o => o.id === targetId);
  setTarget(list[(i + 1) % list.length]!.id);
}
const targetFrame = createTargetFrame(() => setTarget(null));
// Anillos en el suelo: el del objetivo (cuatro arcos que giran) y uno tenue bajo lo que señala el ratón.
const arcs = (r0: number, r1: number) => {
  const parts = [0, 1, 2, 3].map(k => new THREE.RingGeometry(r0, r1, 12, 1, k * Math.PI / 2 + 0.18, Math.PI / 2 - 0.36));
  const g = mergeGeometries(parts)!; g.rotateX(-Math.PI / 2); return g;
};
const selRing = new THREE.Mesh(arcs(0.86, 1), new THREE.MeshBasicMaterial({ color: FOE, transparent: true, depthWrite: false }));
const hovRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xefe6d0, transparent: true, opacity: 0.45, depthWrite: false }));
for (const m of [selRing, hovRing]) { m.renderOrder = 3; m.visible = false; scene.add(m); }
const starGeo = new THREE.OctahedronGeometry(0.09), starMat = new THREE.MeshBasicMaterial({ color: 0xf5d76a });
// cursor de espada sobre enemigos, mano sobre jugadores
// bocadillo sobre NPCs
const TALK_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 3h20v13H10l-5 5v-5H2z" fill="#efe6d0" stroke="#111a29" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 8h12M6 11.5h8" stroke="#111a29" stroke-width="1.5"/></svg>')}") 4 4, pointer`;
const SWORD = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2l10 3 9 9-2 2 2 2-1.5 1.5-2-2-2 2-9-9z" fill="#efe6d0" stroke="#111a29" stroke-width="1.5" stroke-linejoin="round"/></svg>')}") 2 2, crosshair`;

addEventListener("keydown", ev => {
  if (login.open || creator.open || questUi.open || market.open) return;
  if (ev.key === "Enter") {
    if (document.activeElement === chatin) {
      if (chatin.value.trim()) send({ t: "chat", text: chatin.value });
      chatin.value = ""; chatin.blur();
    } else { keys.clear(); chatin.focus(); }
    return;
  }
  if (typing()) { if (ev.key === "Escape") (document.activeElement as HTMLElement).blur(); return; }
  if (ev.code === "Tab") { ev.preventDefault(); if (!ev.repeat && joined) cycleTarget(); return; }
  if (ev.key === "Escape" && !mapWasOpen && targetId !== null) setTarget(null);
  if (ev.code === "KeyI") { inventory.toggle(); renderPanel(); }
  if (ev.code === "KeyK" && !ev.repeat) { skillWin.toggle(); renderPanel(); }
  if (ev.code === "Space") { ev.preventDefault(); if (!ev.repeat && !(flying && myMount().flies)) jump(); } // en montura de tierra también se salta
  if (ev.code === "KeyR" && !ev.repeat) toggleBroom();
  if (ev.code === "KeyE" && !ev.repeat) interact();
  if (ev.code === "KeyF" && !ev.repeat) pray();
  if (!ev.repeat && /^(Digit|Numpad)[1234]$/.test(ev.code)) castSkill(Number(ev.code.slice(-1)) - 1);
  if (ev.code.startsWith("Arrow")) ev.preventDefault();
  keys.add(ev.code);
});
addEventListener("keyup", ev => keys.delete(ev.code));
// Esc cierra primero el mapa grande; solo si no estaba abierto suelta el objetivo
let mapWasOpen = false;
addEventListener("keydown", ev => { if (ev.key === "Escape") mapWasOpen = $("bigmap").style.display === "flex"; }, true);

// ---- NPCs y misiones ----
const npcs = createNpcs(scene);
const questUi = createQuestUi(
  job => send({ t: "job", job }),
  () => creator.changeClass(savedName),
  npcId => send({ t: "questTalk", npc: npcId }),
  () => npcs.setTalking(null),
  () => { keys.clear(); market.show(); },
);
// ---- Casa de subastas ----
const market = createMarket(send);
const marketWorld = createMarketWorld(scene); // plaza del mercado y tablón de precios
const parks = createParks(scene); // parques de los barrios, bancos de la Plaza Mayor y sus vecinos
const mountSound = createMountSound(); // cascos y viento de tu montura
const ambience = createAmbience(); // agua, pájaros, grillos, viento y hojas según dónde estés y la hora
const goddessDist = () => { const me = views.get(myId); return me ? Math.hypot(me.group.position.x - GODDESS_STATUE.x, me.group.position.z - GODDESS_STATUE.z) : Infinity; };
// ---- Barrios: rótulo al entrar y nombre en el pendón del minimapa ----
const districtEl = document.createElement("div"); districtEl.id = "district"; districtEl.hidden = true;
districtEl.innerHTML = `<strong></strong><span></span>`; document.body.append(districtEl);
let curDistrict: DistrictId | null = null, districtTimer = 0;
function showDistrict(id: DistrictId) {
  if (id === curDistrict) return;
  const first = curDistrict === null; curDistrict = id;
  const d = DISTRICTS[id];
  $("mm-city").textContent = id === "fields" ? CITY_NAME : d.name;
  if (first) return; // al entrar al juego no se anuncia
  districtEl.style.setProperty("--c", "#" + d.color.toString(16).padStart(6, "0"));
  districtEl.querySelector("strong")!.textContent = d.name; districtEl.querySelector("span")!.textContent = d.blurb;
  districtEl.hidden = false; districtEl.style.animation = "none"; void districtEl.offsetWidth; districtEl.style.animation = "";
  clearTimeout(districtTimer); districtTimer = window.setTimeout(() => { districtEl.hidden = true; }, 3600);
}

// ---- Oficios: recolección ----
const gatherNodes = createGatherNodes(scene);
const gatherBar = createGatherBar();
/** Recurso al alcance: punto de recolección o lobo abatido (ok: es de tu oficio). */
function gatherTarget(): { kind: GatherKind; node?: number; corpse?: number; ok: boolean; d: number } | null {
  const me = views.get(myId);
  if (!me || !invState) return null;
  const mine = gatherOfJob(invState.job), p = me.group.position;
  let best: ReturnType<typeof gatherTarget> = null;
  const consider = (kind: GatherKind, x: number, z: number, node?: number, corpse?: number) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > GATHER[kind].range) return;
    const ok = kind === mine;
    if (!best || (ok && !best.ok) || (ok === best.ok && d < best.d)) best = { kind, node, corpse, ok, d };
  };
  for (const n of GATHER_NODES) if (!gatherNodes.isDown(n.id)) consider(n.kind, n.x, n.z, n.id);
  for (const v of views.values()) if (v.state.kind === "mob" && v.state.dead && !v.state.skinned) consider("skin", v.group.position.x, v.group.position.z, undefined, v.state.id);
  return best;
}
const JOB_NAMES: Record<GatherKind, string> = { fish: "pescador", ore: "minero", herb: "recolector", skin: "peletero" };
function gatherPrompt() {
  const g = gatherTarget();
  if (!g) return undefined;
  const def = GATHER[g.kind];
  const rich = g.node !== undefined ? gatherNodes.richOf(g.node) : 0, tag = rich ? ` (rico: calidad ${RARITIES[rich]!.name})` : "";
  return { text: g.ok ? `${def.verb}: ${def.place}${tag}` : `${def.place[0]!.toUpperCase() + def.place.slice(1)}${tag} (oficio de ${JOB_NAMES[g.kind]})`, ok: g.ok };
}
/** Asiento libre más cercano al alcance (los de los vecinos y los ocupados por jugadores no cuentan). */
function freeSeat() {
  const me = views.get(myId);
  if (!me || me.state.pose) return null;
  let best: (typeof SEATS)[number] | null = null, bd = SEAT_RANGE;
  for (const s of SEATS) {
    if (TOWNSFOLK_SEATS.has(s.id)) continue;
    const d = Math.hypot(s.x - me.group.position.x, s.z - me.group.position.z);
    if (d > bd) continue;
    let taken = false;
    for (const v of views.values()) if (v !== me && v.state.pose === "chair" && Math.hypot(v.tx - s.x, v.tz - s.z) < 0.3) { taken = true; break; }
    if (!taken) { best = s; bd = d; }
  }
  return best;
}
/** E: hablar si hay alguien al lado; si no, sentarse en un banco cercano; si no, trabajar en el recurso más cercano de tu oficio. */
function interact() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead || !invState || questUi.open || market.open) return;
  const near = npcs.nearest(me.group.position);
  if (near && near.d <= TALK_RANGE) { talk(near.id); return; }
  const seat = freeSeat();
  if (seat) { if (flying) toggleBroom(); keys.clear(); if (targetId !== null) setTarget(null); send({ t: "sit", seat: seat.id }); return; }
  const g = gatherTarget();
  if (!g) { say("No hay nadie ni nada cerca con lo que interactuar.", "#f2a08f"); return; }
  if (!g.ok) { say(invState.job ? `Eso es trabajo de ${JOB_NAMES[g.kind]}. Puedes cambiar de oficio en el gremio.` : "Necesitas un oficio: habla con el maestro del gremio.", "#f2a08f"); return; }
  if (me.state.act) return;
  if (flying) toggleBroom();
  keys.clear();
  if (targetId !== null) setTarget(null);
  send(g.kind === "skin" ? { t: "gather", corpse: g.corpse } : { t: "gather", node: g.node });
}

/** Habla con un NPC concreto (clic) o con el más cercano (E). */
function talk(npcId?: string) {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead || !invState || questUi.open || market.open) return;
  const id = npcId ?? npcs.nearest(me.group.position)?.id;
  const d = id ? npcs.distanceTo(id, me.group.position) : Infinity;
  if (!id || d > TALK_RANGE) {
    say(id && npcId ? `Acércate a ${npcOf(id)?.name ?? "él"} para hablar (${Math.round(d)} m).` : "No hay nadie cerca con quien hablar.", "#f2a08f");
    return;
  }
  if (flying) toggleBroom();
  keys.clear();
  if (targetId !== null) setTarget(null);
  const n = npcOf(id)!;
  charYaw = Math.atan2(n.x - me.group.position.x, n.z - me.group.position.z); // mirar al NPC
  npcs.setTalking(id);
  questUi.talk(id, { quest: questOf(invState.quest), questCount: invState.questCount, job: invState.job });
}

// ---- Rezar ante la estatua de la diosa (catedral) ----
const prayAudio = new Audio("/assets/pray.mp3");
prayAudio.preload = "auto";
prayAudio.addEventListener("ended", () => { send({ t: "questProgress", kind: "pray" }); stopPraying(); });
let praying = false, prayTimer = 0;
// La música de la diosa suena desde su estatua: se oye al acercarse y llena la catedral (al rezar suena la pista completa).
const goddessMusic = new Audio("/assets/pray.mp3");
goddessMusic.loop = true; goddessMusic.preload = "none"; goddessMusic.volume = 0;
const GODDESS_MUSIC_RANGE = 32, GODDESS_MUSIC_VOL = 0.4;
function updateGoddessMusic(d: number, dt: number) {
  const near = Math.max(0, 1 - d / GODDESS_MUSIC_RANGE), want = praying || !joined ? 0 : near * near * GODDESS_MUSIC_VOL;
  const v = goddessMusic.volume + (want - goddessMusic.volume) * Math.min(1, dt * 2.5);
  goddessMusic.volume = Math.max(0, Math.min(1, v < 0.004 && want === 0 ? 0 : v));
  if (goddessMusic.volume > 0 && goddessMusic.paused) void goddessMusic.play().catch(() => { /* autoplay bloqueado hasta la primera interacción */ });
  else if (goddessMusic.volume === 0 && !goddessMusic.paused) goddessMusic.pause();
}
const PRAY_DURATION = 21;
const PRAY_FADE_START = 20;
const prayRingGeo = new THREE.TorusGeometry(1.4, 0.04, 16, 64).rotateX(Math.PI / 2);
const prayRingMat = new THREE.MeshBasicMaterial({ color: 0xffd78a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
let prayRing: THREE.Mesh | null = null;
let prayTimeout: ReturnType<typeof setTimeout> | null = null;
function stopPraying() {
  if (prayTimeout) { clearTimeout(prayTimeout); prayTimeout = null; }
  prayAudio.pause(); prayAudio.currentTime = 0; prayAudio.volume = 1;
  const me = views.get(myId);
  if (praying) { praying = false; me?.player?.stopPray(); }
  if (prayRing) { scene.remove(prayRing); (prayRing.geometry as THREE.BufferGeometry).dispose(); (prayRing.material as THREE.Material).dispose(); prayRing = null; }
}
function pray() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead || flying) return;
  if (goddessDist() > PRAY_RANGE) { say("Acércate a la estatua de la diosa, en la catedral, para rezar.", "#f2a08f"); return; }
  if (praying) return;
  praying = true; prayTimer = 0;
  keys.clear();
  // el personaje se gira hacia la estatua mientras reza
  charYaw = Math.atan2(GODDESS_STATUE.x - me.group.position.x, GODDESS_STATUE.z - me.group.position.z);
  me.player?.pray();
  say("Rezas ante la majestuosa estatua de la diosa…", "#f0cf6a");
  fx.ring(GODDESS_STATUE.x, GODDESS_STATUE.z, 3.5, 0xffd78a, 0.9, 0.16);
  fx.ring(GODDESS_STATUE.x, GODDESS_STATUE.z, 2.2, 0x9fd0ff, 0.6, 0.2);
  // aro de luz que envuelve al personaje mientras reza
  prayRing = new THREE.Mesh(prayRingGeo, prayRingMat.clone());
  prayRing.position.set(me.group.position.x, me.group.position.y + 0.8, me.group.position.z);
  prayRing.renderOrder = 9;
  scene.add(prayRing);
  // música de los primeros 21 s; al acabar se levanta automáticamente
  prayAudio.currentTime = 0; prayAudio.volume = 1;
  void prayAudio.play().catch(() => { /* el navegador puede bloquear autoplay hasta la primera interacción */ });
  prayTimeout = setTimeout(() => {
    send({ t: "questProgress", kind: "pray" });
    stopPraying();
  }, PRAY_DURATION * 1000);
}

// ---- Habilidades (1-2-3) ----
// El cliente solo comprueba lo evidente para dar un aviso claro; el servidor decide si se lanza y aplica el enfriamiento.
const fx = createFx(scene);
const skillBar = createSkillBar($("hotbar"), slot => castSkill(slot));
const auraGeo = new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2);
const AURA = { guard: 0x6fb4ff, rage: 0xff7a4a, aegis: 0xffd98a };
/** La diosa bendice a quien reza: rayo desde la estrella de la estatua, columna de luz, chispas y, si se transforma, alas de luz. */
function onBless(id: number, transformed: boolean) {
  const v = views.get(id); if (!v) return;
  const pos = v.group.position.clone();
  fx.bless(pos, new THREE.Vector3(GODDESS_STATUE.x + 0.9, 7.4, GODDESS_STATUE.z + 0.4), transformed);
  setTimeout(() => views.get(id)?.player?.cast("Cheer"), 1500);
  if (transformed) {
    floatText(id, styleOf(v.state.look)?.title ?? "Bendecido", "note lvl");
    if (id === myId) { shake = Math.min(1, shake + 0.35); say("Tus habilidades han cambiado: mira la barra (1-2-3).", "#f0cf6a"); }
  } else floatText(id, "Bendición de la diosa", "note lvl");
}
function castSkill(slot: number) {
  const me = views.get(myId), eq = equippedSkills(me?.state.look, invState?.skills ?? START_SKILLS())[slot];
  if (!joined || !me || me.state.dead || !eq) return;
  if (eq.rank < 1) { skillBar.deny(slot); say(`Aún no has aprendido ${eq.sk.name}. Apréndela en la ventana de habilidades (K).`, "#f2a08f"); return; }
  const sk = eq.sk;
  const now = performance.now(), deny = (why?: string) => { skillBar.deny(slot); if (why) say(why, "#f2a08f"); };
  if (!skillBar.ready(slot, now)) return deny();
  if (flying) return deny("Baja de la montura (R) para usar habilidades.");
  const hostile = sk.kind === "strike" || sk.kind === "charge" || sk.kind === "aoe";
  const px = me.group.position.x, pz = me.group.position.z;
  if (hostile && inSafeZone(px, pz)) return deny("Dentro de la ciudad no se combate. Sal por una puerta.");
  if (sk.kind === "strike" || sk.kind === "charge") {
    const range = sk.range ?? PLAYER.range, near = (v: View) => !v.state.dead && Math.hypot(v.tx - px, v.tz - pz) <= range + 0.5;
    const t = targetId !== null ? views.get(targetId) : undefined;
    if (!(t && near(t)) && ![...views.values()].some(v => v.state.kind === "mob" && near(v))) return deny("No hay ningún enemigo a tu alcance.");
  }
  send({ t: "skill", slot });
}
function onCast(id: number, slot: number, k?: string, to?: number) {
  const v = views.get(id), base = k ? skillByKey(v?.state.look, k) : undefined;
  if (!v || !base) return;
  const sk = id === myId ? rankedSkill(base, invState?.skills?.ranks[k!] ?? 1) : base; // tu rango marca tu enfriamiento y alcance
  const cls = { color: lookColor(v.state.look) }, holy = isBlessed(v.state.look);
  v.player?.cast(sk.anim);
  const x = v.tx, z = v.tz, t = to !== undefined ? views.get(to) : undefined;
  if (id === myId) {
    skillBar.start(slot, sk.cd * (passiveOf(v.state.look)?.cdMult ?? 1), performance.now());
    if (to !== undefined) { setTarget(to, false, false); attacking = true; } // el servidor ya lo seleccionó y lo ataca
    if (sk.kind === "blink" || sk.kind === "charge") { fx.ring(pred.x, pred.z, 1.6, cls.color); pred.x = x; pred.z = z; } // el servidor te movió: sin corrección suave
    if (t) charYaw = Math.atan2(t.tx - x, t.tz - z);
  }
  if (sk.kind === "aoe") {
    fx.ring(x, z, sk.radius ?? 3, cls.color); fx.ring(x, z, (sk.radius ?? 3) * 0.6, 0xefe6d0, 0.3);
    if (holy) { fx.ring(x, z, (sk.radius ?? 3) * 0.8, 0xfff6da, 0.6, 0.2, 0.12); fx.beam(new THREE.Vector3(x, 14, z), new THREE.Vector3(x, 0.2, z), cls.color, 0.9, 0.6); }
  } else if (sk.kind === "heal") { fx.ring(x, z, 1.8, 0x9fe6a0, 0.7); fx.ring(x, z, 1.1, 0xfff6da, 0.5, 0.2, 0.15); fx.beam(new THREE.Vector3(x, 10, z), new THREE.Vector3(x, 0.2, z), 0xfff6da, 0.5, 0.7); }
  else if (sk.kind === "blink" || sk.kind === "charge") fx.ring(x, z, 1.6, cls.color);
  else if (sk.kind === "buff") fx.ring(x, z, 2.2, sk.buff ? AURA[sk.buff] : cls.color, 0.6);
  if (t && sk.kind === "strike" && (sk.range ?? 0) > 4) {
    if (holy) { fx.beam(new THREE.Vector3(x, 1.5, z), new THREE.Vector3(t.tx, 1.1, t.tz), cls.color, 0.22, 0.4); fx.ring(t.tx, t.tz, 1.6, 0xfff6da, 0.35, 0.2, 0.05); }
    else fx.bolt(new THREE.Vector3(x, 1.4, z), new THREE.Vector3(t.tx, 1.1, t.tz), cls.color);
  } else if (t && holy && sk.kind === "strike") { fx.beam(new THREE.Vector3(t.tx, 9, t.tz), new THREE.Vector3(t.tx, 0.2, t.tz), cls.color, 0.5, 0.45); fx.ring(t.tx, t.tz, 1.8, cls.color, 0.4); }
  else if (t && sk.kind !== "aoe") fx.ring(t.tx, t.tz, 1.1, 0xefe6d0, 0.25);
}

// Salto: visual y validado por el servidor (que lo difunde a los demás).
const JUMP_V = 7.5, GRAVITY = 22, JUMP_TIME = (2 * JUMP_V) / GRAVITY;
function jump() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead || me.jumpT >= 0) return;
  me.jumpT = 0; me.player?.jump();
  send({ t: "jump" });
}

// Montura (R): el servidor valida el estado, la altura y la velocidad. `flying` = montado; solo la escoba sube.
let flying = false;
const myMount = () => MOUNTS[mountOf(views.get(myId)?.state.look)];
const airborne = () => flying && myMount().flies;
function toggleBroom() {
  const me = views.get(myId);
  if (!joined || !me || me.state.dead) return;
  flying = !flying;
  if (flying) { me.jumpT = -1; if (myMount().flies) pred.y = Math.max(pred.y, 0.2); }
  send({ t: "mount", on: flying });
}

// Predicción local: el personaje propio se mueve al instante con las mismas reglas que el servidor,
// y se corrige suavemente hacia la posición autoritativa.
const pred = { x: 0, z: 0, y: 0, ready: false };
const sent = { dx: 0, dz: 0, dy: 0, ry: 0, at: 0 };
function control(dt: number, me: View, now: number) {
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  const alive = joined && !me.state.dead && !typing() && !praying;
  let fwd = 0, side = 0, dy = 0;
  if (alive) {
    fwd = Math.min(1, k("KeyW") + k("ArrowUp")) - Math.min(1, k("KeyS") + k("ArrowDown"));
    side = Math.min(1, k("KeyD") + k("ArrowRight")) - Math.min(1, k("KeyA") + k("ArrowLeft"));
    if (airborne()) dy = k("Space") - Math.min(1, k("ShiftLeft") + k("ShiftRight") + k("KeyC"));
  }
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -fz, rz = fx; // adelante y derecha de la cámara
  let dx = fx * fwd + rx * side, dz = fz * fwd + rz * side;
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  if (airborne() && fwd !== 0) {
    const raw = Math.max(-1.2, Math.min(1.2, (FLIGHT_LEVEL - cam.pitch) * 1.4)), a = Math.abs(raw) < 0.1 ? 0 : raw; // zona muerta: recto
    const c = Math.cos(a);
    dx = fx * fwd * c + rx * side; dz = fz * fwd * c + rz * side;
    const l2 = Math.hypot(dx, dz); if (l2 > 1) { dx /= l2; dz /= l2; }
    dy = Math.max(-1, Math.min(1, dy + fwd * Math.sin(a) * (PLAYER.speed * FLY.speedMult) / FLY.vSpeed));
    dy = Math.round(dy * 20) / 20;
  }
  const moving = len > 0;
  if (moving) charYaw = Math.atan2(fx * fwd + rx * side, fz * fwd + rz * side); // el personaje mira hacia donde se mueve

  if (pred.ready) {
    const speed = PLAYER.speed * (flying ? myMount().speedMult : passiveOf(me.state.look)?.speed ?? 1);
    pred.x += dx * speed * dt; pred.z += dz * speed * dt;
    if (airborne()) pred.y = Math.max(FLY.minY, Math.min(FLY.maxY, pred.y + dy * FLY.vSpeed * dt));
    else pred.y = Math.max(0, pred.y - FLY.fallSpeed * dt);
    if (me.state.pose && !moving) { pred.x = me.tx; pred.z = me.tz; } // descansando (sobre el banco): manda el servidor
    else [pred.x, pred.z] = resolveCollisions(pred.x, pred.z, 0.4, pred.y);
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
let mySpeed = 0;
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
    if (v === me && v.state.pose && !moving) charYaw = v.state.ry; // sentado: mira hacia donde mira el banco
    if (!v.state.dead) v.heading = v === me ? charYaw : v.state.ry;
    v.player?.setPose(v.state.dead ? null : v.state.pose ?? null);
    const turn = angDiff(v.rot.rotation.y, v.heading);
    v.rot.rotation.y += turn * Math.min(1, dt * 14);
    // altura: vuelo en escoba (o caída al desmontar) más el arco del salto
    const fly = v === me ? flying : !!v.state.fly;
    const wantAlt = v === me ? pred.y : v.state.y ?? 0;
    const altBefore = v.alt;
    v.alt = v === me ? wantAlt : v.alt + (wantAlt - v.alt) * Math.min(1, dt * 12);
    const vy = (v.alt - altBefore) / Math.max(dt, 1e-3); // velocidad vertical: el personaje se inclina al picar o ascender
    if (v === me) mySpeed = fly ? Math.hypot(speed, vy) : speed;
    let hop = 0;
    if (v.jumpT >= 0) {
      v.jumpT += dt;
      if (v.jumpT >= JUMP_TIME) v.jumpT = -1;
      else hop = JUMP_V * v.jumpT - 0.5 * GRAVITY * v.jumpT * v.jumpT;
    }
    v.rot.position.y = v.alt + hop;
    v.bars.position.y = v.barsY + v.alt + (v.seatY ?? 0);
    if (v.label) v.label.position.y = 2.9 + v.alt + (v.seatY ?? 0);
    // faena: repetir su animación y, al pescar, tender el sedal hasta el banco de peces más cercano
    const act = v.state.act;
    if (act && v.player && !v.state.dead) {
      if ((v.actT = (v.actT ?? 0) - dt) <= 0) { v.actT = 1.4; v.player.cast(GATHER[act].anim); if (act !== "ore") v.player.emote("Interact"); }
      if (act === "fish") {
        const p = v.group.position;
        let best = GATHER_NODES[0]!, bd = Infinity;
        for (const n of GATHER_NODES) if (n.kind === "fish") { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = n; } }
        if (!v.line) { v.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xefe6d0, transparent: true, opacity: 0.8 })); scene.add(v.line); }
        const pos = v.line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, p.x + Math.sin(v.heading) * 0.6, 2.2 + v.alt, p.z + Math.cos(v.heading) * 0.6);
        pos.setXYZ(1, best.x + Math.sin(t * 2 + v.state.id) * 0.3, 0.08, best.z); pos.needsUpdate = true; v.line.visible = true;
      } else if (v.line) v.line.visible = false;
    } else { v.actT = 0; if (v.line) v.line.visible = false; }
    if (v.bubble?.visible) {
      // se ve a través de paredes: solo de cerca, para no llenar la pantalla de bocadillos lejanos
      v.bubble.update(dt, camera.position.distanceTo(v.group.position) < 45);
      v.bubble.sprite.position.y = 3.2 + v.alt + (v.seatY ?? 0);
    }
    if (v.player) {
      // Montar. Escoba: llega girando desde atrás y el personaje salta sobre ella; al bajar sale disparada.
      // Caballo, cabra o pantera: aparece de un salto bajo el jinete con una nube de polvo y al bajar se desvanece.
      const mid = mountOf(v.state.look), air = MOUNTS[mid].flies, mPrev = v.mount ?? (fly ? 1 : 0);
      const m = Math.max(0, Math.min(1, mPrev + (fly ? dt / (air ? 0.65 : 0.45) : -dt / 0.4)));
      v.mount = m;
      if (fly && mPrev === 0 && !air) { fx.ring(v.group.position.x, v.group.position.z, 2.2, 0xcbb894, 0.5); fx.ring(v.group.position.x, v.group.position.z, 1.3, 0xefe6d0, 0.4, 0.14, 0.08); }
      // velocidad de giro suavizada (positiva a la izquierda)
      const dh = v.prevHeading === undefined ? 0 : angDiff(v.prevHeading, v.rot.rotation.y); v.prevHeading = v.rot.rotation.y;
      v.turnRate = (v.turnRate ?? 0) + (dh / Math.max(dt, 1e-3) - (v.turnRate ?? 0)) * Math.min(1, dt * 8);
      if (m > 0 && v.steedId !== mid) {
        if (v.steed) { v.rot.remove(v.steed.group); if (v.steed instanceof Steed) v.steed.dispose(); }
        v.steed = mid === "broom" ? new Broom() : new Steed(mid); v.steedId = mid; v.rot.add(v.steed.group);
      }
      let seatY = 0;
      if (v.steed) {
        const b = v.steed.group; b.visible = m > 0;
        if (m > 0 && v.steed instanceof Broom) {
          v.steed.update(t, Math.max(Math.min(1, speed / (PLAYER.speed * FLY.speedMult)), fly ? 1 - m : 0), v.turnRate);
          if (fly) {
            const q = m - 1, e = 1 + 2.70158 * q * q * q + 1.70158 * q * q; // se pasa un poco y vuelve
            b.position.set(0, 0.42 - (1 - e) * 0.9, -(1 - e) * 3.2);
            b.rotation.x = 0; b.rotation.z += (1 - e) * Math.PI * 4;
            b.scale.setScalar(0.25 + 0.75 * Math.min(1, e));
          } else {
            const k = 1 - m;
            b.position.set(0, 0.42 + k * 1.2, k * k * 4);
            b.rotation.x = -k * 0.6; b.scale.setScalar(Math.max(0.01, m));
          }
        } else if (m > 0 && v.steed instanceof Steed) {
          v.steed.update(dt, fly ? speed : 0, v.turnRate);
          const q = m - 1, e = fly ? 1 + 2.70158 * q * q * q + 1.70158 * q * q : m; // crece con un pequeño rebote
          b.scale.setScalar(Math.max(0.01, e)); b.position.set(0, 0, 0);
          seatY = (v.steed.seat - 0.42 + v.steed.bob) * Math.min(1, m * 1.3) + (fly ? Math.sin(Math.PI * m) * 0.6 : 0); // salta a la silla
        }
      }
      v.seatY = seatY;
      v.player.group.position.y = seatY;
      if (v === me) mountSound.update(dt, fly && m > 0.9 ? mid : undefined, speed, v.jumpT < 0 && (air || v.alt < 0.3));
      // saltito al montar y vaivén suave mientras flota (escoba)
      if (air) v.rot.position.y += (fly ? Math.sin(Math.PI * m) * 0.5 : 0) + Math.sin(t * 2.1 + v.state.id) * 0.05 * m;
      const h = v.rot.position.y; // la sombra de contacto encoge con la altura
      v.player.blob.visible = h < 14 && seatY < 0.05; v.player.blob.scale.setScalar(1 / (1 + h * 0.35));
      v.player.setRiding(fly);
      v.player.setAirborne(!fly && v.alt > 0.3);
      const flyAir = fly && air;
      const dive = flyAir ? Math.max(-0.65, Math.min(0.65, -Math.atan2(vy, Math.max(speed, 4)))) : 0;
      v.lean += ((flyAir ? 0.22 * Math.min(1, speed / 8) + dive : 0) - v.lean) * Math.min(1, dt * 6);
      v.bank = (v.bank ?? 0) + ((flyAir ? Math.max(-0.4, Math.min(0.4, -turn * 1.2)) : 0) - (v.bank ?? 0)) * Math.min(1, dt * 5);
      v.rot.rotation.order = "YXZ"; // giro, luego cabeceo y alabeo en los ejes del propio personaje
      v.rot.rotation.x = v.lean; v.rot.rotation.z = v.bank;
    }
    if (v.wolf) {
      v.wolf.update(dt, speed);
      if (v.state.dead) { v.deadFor += dt; if (v.deadFor > 3) v.group.visible = false; }
    }
    v.player?.update(dt, fly ? 0 : speed);
    // efecto temporal activo: anillo a los pies que late
    const buff = v.state.dead ? undefined : v.state.buff;
    if (buff && !v.aura) { v.aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); v.aura.position.y = 0.13; v.group.add(v.aura); }
    if (v.aura) {
      v.aura.visible = !!buff;
      if (buff) { (v.aura.material as THREE.MeshBasicMaterial).color.setHex(AURA[buff]); v.aura.scale.setScalar(1 + Math.sin(t * 6) * 0.08); }
    }
    // aturdido: tres estrellas girando sobre la cabeza
    if (v.state.stun && !v.state.dead) {
      if (!v.stars) { v.stars = new THREE.Group(); for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(starGeo, starMat); s.position.set(Math.cos(k * 2.09) * 0.38, 0, Math.sin(k * 2.09) * 0.38); v.stars.add(s); } v.group.add(v.stars); }
      v.stars.visible = true; v.stars.position.y = (v.wolf ? 1.55 : 2.25) + v.alt; v.stars.rotation.y = t * 4;
    } else if (v.stars) v.stars.visible = false;
    // barra sobre la cabeza: el tramo perdido se vacía con retraso; las de criaturas sanas solo si las señalas
    const ratio = v.state.dead ? 0 : v.state.hp / v.state.maxHp;
    if (ratio >= v.lagW) { v.lagW = ratio; v.lagHold = 0; } else if ((v.lagHold += dt) > 0.35) v.lagW = Math.max(ratio, v.lagW - dt * 0.9);
    v.lag.scale.x = Math.max(0.001, v.lagW);
    if (v.label) v.label.visible = !v.state.dead;
    v.bars.visible = !v.state.dead && (v.state.kind !== "mob" || ratio < 1 || v.lagW > ratio || v.state.id === targetId || v.state.id === hoverId);
    v.bars.quaternion.copy(camera.quaternion);
  }

  // Cámara en tercera persona que orbita al personaje. Antes de entrar: vuelo lento sobre la plaza.
  if (!airborne() && cam.pitch < PITCH_MIN_WALK) cam.pitch += (PITCH_MIN_WALK - cam.pitch) * Math.min(1, dt * 4); // al aterrizar vuelve a la vista a pie
  // la vista se abre un poco con la velocidad del vuelo
  const wantFov = 55 + (flying && !still ? 12 * Math.min(1, mySpeed / (PLAYER.speed * myMount().speedMult)) : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  let yaw = cam.yaw, pitch = cam.pitch, dist = cam.dist;
  if (me && joined) camTarget.set(me.group.position.x, 1.7 + me.alt + (me.rot.position.y - me.alt) * 0.6 + (me.seatY ?? 0), me.group.position.z);
  else { camTarget.set(0, 4, 0); yaw = t * 0.06; pitch = 0.42; dist = 52; }
  if (me && joined) dist = camRoomDist = roomCamDist(camTarget, yaw, pitch, dist, camRoomDist, dt);
  const cp = Math.cos(pitch);
  camera.position.set(camTarget.x - Math.sin(yaw) * cp * dist, Math.max(0.6, camTarget.y + Math.sin(pitch) * dist), camTarget.z - Math.cos(yaw) * cp * dist);
  camera.lookAt(camTarget);

  fx.update(dt); skillBar.update(now); updateBlessedAuras(dt, t);
  const activeQuest = joined && invState?.quest ? questOf(invState.quest) : undefined;
  // marcas sobre los NPCs: "!" hay algo que hacer aquí, "?" dorado entregar, "?" gris en curso
  const npcMarks: Record<string, NpcMark> = {};
  const questDone = !!activeQuest && invState!.questCount >= activeQuest.count;
  const gathering = !!activeQuest && (activeQuest.type === "kill" || activeQuest.type === "collect") && !questDone;
  if (activeQuest) npcMarks[activeQuest.giver] = activeQuest.type === "talk" || activeQuest.type === "pray" ? "new" : questDone ? "turnin" : "progress";
  const goalDest = activeQuest ? (activeQuest.type === "pray" ? { x: GODDESS_STATUE.x, z: GODDESS_STATUE.z } : (n => n ? { x: n.x, z: n.z } : undefined)(npcOf(activeQuest.giver))) : undefined;
  const goalId = activeQuest && activeQuest.type !== "pray" && !gathering ? activeQuest.giver : undefined;
  npcs.update(dt, t, me && joined ? me.group.position : null, npcMarks, goalId);
  minimap.setGoal(goalDest ? { x: goalDest.x, z: goalDest.z } : null);
  const nearNpc = npcs.nearest(me && joined ? me.group.position : null);
  if (questUi.open && me && questUi.npc && npcs.distanceTo(questUi.npc, me.group.position) > TALK_RANGE + 2) questUi.close(); // te has ido
  if (market.open && me && npcs.distanceTo("auctioneer", me.group.position) > MARKET_RANGE + 2) market.close(); // te has alejado
  marketWorld.update(t); parks.update(dt, t, camera.position);
  questUi.update(joined && invState && me ? {
    quest: invState.quest, questCount: invState.questCount,
    goalDistance: goalDest && !gathering ? Math.hypot(me.group.position.x - goalDest.x, me.group.position.z - goalDest.z) : undefined,
    nearName: nearNpc && nearNpc.d <= TALK_RANGE && !me.state.dead ? npcOf(nearNpc.id)?.name : undefined,
    action: me.state.dead || me.state.act ? undefined : me.state.pose ? { text: "Muévete para levantarte", ok: true } : freeSeat() ? { text: "Sentarse a descansar", ok: true } : gatherPrompt(),
  } : null);
  const myKind = gatherOfJob(invState?.job);
  gatherNodes.setMine(myKind); gatherNodes.update(t);
  gatherBar.update(now, joined && me ? me.state.act : undefined, me?.state.act ? gatherTime(me.state.act, invState?.jobLevel ?? 1) : 1);
  minimap.setNodes(myKind && myKind !== "skin" ? GATHER_NODES.filter(n => n.kind === myKind && !gatherNodes.isDown(n.id)) : []);
  // objetivo: anillo, ficha y limpieza si muere o desaparece
  if (hoverAt && joined) {
    ray.setFromCamera(new THREE.Vector2((hoverAt[0] / innerWidth) * 2 - 1, -(hoverAt[1] / innerHeight) * 2 + 1), camera);
    const hn = pickNpc() ?? null;
    npcs.setHover(hn);
    hoverId = hn ? undefined : pick(hoverAt[0], hoverAt[1]); hoverAt = null;
    const hv = hoverId !== undefined ? views.get(hoverId) : undefined;
    canvas.style.cursor = hn ? TALK_CURSOR : hv ? (hv.state.kind === "mob" ? SWORD : "pointer") : "";
  }
  const tv = targetId !== null ? views.get(targetId) : undefined;
  if (targetId !== null && (!tv || (tv.state.dead && (targetGone += dt) > 2))) setTarget(null, false, !!tv);
  const showRing = (m: THREE.Mesh, v: View | undefined) => {
    m.visible = !!v && v.group.visible && !v.state.dead;
    if (v && m.visible) { m.position.set(v.group.position.x, 0.12 + v.alt, v.group.position.z); m.scale.setScalar(v.wolf ? 1.35 : 0.85); }
  };
  showRing(selRing, tv);
  showRing(hovRing, hoverId !== targetId && hoverId !== undefined ? views.get(hoverId) : undefined);
  if (tv) {
    (selRing.material as THREE.MeshBasicMaterial).color.setHex(tv.wolf ? FOE : 0x6fb4ff);
    selRing.rotation.y += dt * (attacking ? 2.4 : 0.8);
    (selRing.material as THREE.MeshBasicMaterial).opacity = attacking ? 0.75 + Math.sin(t * 10) * 0.25 : 0.9;
  }
  if (me && tv) targetFrame.update({
    state: tv.state, distance: Math.hypot(tv.tx - me.group.position.x, tv.tz - me.group.position.z), attacking, hostile: tv.state.kind === "mob",
    safe: inSafeZone(me.group.position.x, me.group.position.z) || inSafeZone(tv.tx, tv.tz),
  }, dt);
  else targetFrame.update(null, dt);
  updateFloats(dt);
  // Rezar: indicador de proximidad y partículas sagradas mientras dura.
  const goddessD = goddessDist();
  updateGoddessMusic(goddessD, dt);
  if (joined && !views.get(myId)?.state.dead && goddessD <= PRAY_RANGE && !praying) {
    interactEl.innerHTML = "<kbd>F</kbd> Rezar ante la diosa";
    interactEl.classList.add("show");
  } else interactEl.classList.remove("show");
  if (praying) {
    const me = views.get(myId);
    if (!me || me.state.dead || flying) stopPraying();
    else {
      prayTimer += dt;
      // aro de luz dorado que gira alrededor del personaje
      if (prayRing) {
        prayRing.position.set(me.group.position.x, me.group.position.y + 0.8, me.group.position.z);
        prayRing.rotation.z += dt * 0.9;
        prayRing.rotation.y += dt * 0.35;
      }
      // pequeñas partículas de luz que suben desde el personaje
      if (Math.random() < 0.25) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
        fx.ring(me.group.position.x + Math.sin(a) * r, me.group.position.z + Math.cos(a) * r, 0.25 + Math.random() * 0.2, 0xffe8a0, 0.55, 0.5 + Math.random() * 0.8);
      }
      // fade out suave del audio y del aro en el último segundo
      if (prayTimer >= PRAY_FADE_START) {
        const fade = Math.max(0, 1 - (prayTimer - PRAY_FADE_START) / (PRAY_DURATION - PRAY_FADE_START));
        prayAudio.volume = fade;
        if (prayRing) (prayRing.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
      }
    }
  }
  // daño recibido: borde rojo (más intenso con poca vida) y sacudida
  const lowHp = me && !me.state.dead && me.state.hp / me.state.maxHp < 0.3 ? 0.3 + Math.sin(t * 5) * 0.12 : 0;
  hurtLevel = Math.max(0, hurtLevel - dt * 1.6);
  hurtEl.style.opacity = String(Math.min(1, Math.max(hurtLevel, lowHp)));
  shake = Math.max(0, shake - dt * 3.5);
  if (shake > 0 && !still) camera.position.add(fv3.set((Math.random() - 0.5) * shake * 0.18, (Math.random() - 0.5) * shake * 0.18, 0).applyQuaternion(camera.quaternion));
  minimap.update(me, views.values());
  if (me && joined) showDistrict(districtAt(me.group.position.x, me.group.position.z));
  sky.update(camera.position, t);
  ambience.update(dt, camera.position, sky.hour, views.get(myId)?.alt ?? 0, cam.yaw);
  worldBanner.update(Date.now());
  lobby.update(dt, t, camTarget, sky.lightDir);
  { const c = clockText(sky.hour); if (c !== clockShown) { clockShown = c; clockEl.textContent = c; } }
  life.update(dt, t, me && joined ? me.group.position : camTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
