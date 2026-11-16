import * as THREE from "three";
import { CITY_R, GATE_ANGLES, GREAT_HALL, STALLS, resolveCollisions } from "@mmorpg/shared";
import { Character, type Kind, type Look } from "../models/character";

// Vida ambiental de la ciudad (solo visual, se simula en cada cliente): vecinos que pasean por las avenidas,
// mercaderes que pregonan, guardias en las puertas y aves.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Grafo de paseo: anillo de la plaza + avenidas ----
const NODES: [number, number][] = [];
const EDGES: number[][] = [];
const link = (a: number, b: number) => { EDGES[a]!.push(b); EDGES[b]!.push(a); };
const node = (x: number, z: number) => { NODES.push([x, z]); EDGES.push([]); return NODES.length - 1; };
for (let k = 0; k < 8; k++) node(Math.cos(k * Math.PI / 4) * 15.6, Math.sin(k * Math.PI / 4) * 15.6);
for (let k = 0; k < 8; k++) link(k, (k + 1) % 8);
const chain = (from: number, pts: [number, number][]) => { let p = from; for (const [x, z] of pts) { const n = node(x, z); link(p, n); p = n; } };
chain(0, [[45, 0], [85, 0], [CITY_R - 8, 0]]);
chain(4, [[-45, 0], [-85, 0], [-CITY_R + 8, 0]]);
chain(2, [[0, 45], [0, 85], [0, CITY_R - 8]]);
chain(6, [[0, -30], [0, -47], [0, -57]]);

function route(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, -1]]), q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const m of EDGES[n]!) if (!prev.has(m)) { prev.set(m, n); q.push(m); }
  }
  const path: number[] = [];
  for (let n = to; n !== -1 && n !== from; n = prev.get(n) ?? -1) path.unshift(n);
  return path;
}

type Role = "walker" | "vendor" | "guard";
interface Npc {
  role: Role; x: number; z: number; heading: number; speed: number;
  at: number; path: number[]; lane: number; wait: number; body: Character; wasNear: boolean;
}

const CRIES = ["¡Manzanas frescas!", "¡Pan recién hecho!", "¡Telas de oriente!", "¡Pociones, pociones!", "¡Hierro del bueno!", "¡Quesos curados!",
  "¡Pescado del lago!", "¡Especias y sal!", "¡Flechas y arcos!", "¡Miel de la sierra!", "¡Velas y aceite!", "¡Pieles de lobo!"];

function crySprite(text: string) {
  const c = document.createElement("canvas"); c.width = 384; c.height = 80;
  const g = c.getContext("2d")!;
  g.font = "bold 28px Georgia, serif"; const w = Math.min(360, g.measureText(text).width + 36), x = (384 - w) / 2;
  g.fillStyle = "rgba(243,231,196,0.95)"; g.strokeStyle = "#4a2a0c"; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, 6, w, 50, 12); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(182, 55); g.lineTo(192, 74); g.lineTo(204, 55); g.fill(); g.stroke();
  g.fillStyle = "#2a1a0c"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 192, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(4.2, 0.875, 1); s.renderOrder = 15; s.visible = false;
  return s;
}

const WALKERS = 40;
const NPC_RANGE = 60; // más lejos no se dibujan ni se animan

export interface Life { update(dt: number, t: number, focus: THREE.Vector3): void }

export function buildLife(scene: THREE.Scene): Life {
  const r = rng(99);
  const npcs: Npc[] = [];
  // Vecinos: mezcla de modelos, con y sin sombrero o capa, y tintes de ropa para que no haya dos iguales.
  const TINTS = [0xffffff, 0xffe2c4, 0xd9e6ff, 0xe6ffd9, 0xffd9d9, 0xf2e0b8, 0xd6d6e6, 0xcfe8e0, 0xffe9a8, 0xe8d0f0];
  const townsfolk = (): Look => {
    const roll = r(), tint = TINTS[Math.floor(r() * TINTS.length)]!;
    if (roll < 0.3) return { kind: "Rogue", show: r() < 0.4 ? ["Rogue_Cape"] : [], tint };
    if (roll < 0.5) return { kind: "Rogue_Hooded", show: r() < 0.5 ? ["Rogue_Cape"] : [], tint };
    if (roll < 0.72) return { kind: "Barbarian", show: r() < 0.5 ? ["Barbarian_Hat"] : r() < 0.3 ? ["Mug"] : [], tint };
    if (roll < 0.9) return { kind: "Mage", show: r() < 0.7 ? ["Mage_Hat", ...(r() < 0.5 ? ["2H_Staff"] : ["Spellbook"])] : ["Mage_Cape"], tint };
    return { kind: "Knight", show: ["Knight_Cape"], tint };
  };
  const mk = (role: Role, x: number, z: number, heading: number, look: Look): Npc => {
    const body = new Character(look, { shadow: false, scale: 0.94 + r() * 0.12 });
    body.group.visible = false; scene.add(body.group);
    const n: Npc = { role, x, z, heading, speed: 1.3 + r() * 0.7, at: 0, path: [], lane: (r() - 0.5) * 6.4, wait: r() * 4, body, wasNear: false };
    npcs.push(n); return n;
  };
  for (let i = 0; i < WALKERS; i++) { const at = Math.floor(r() * NODES.length), [x, z] = NODES[at]!; const n = mk("walker", x + (r() - 0.5) * 5, z + (r() - 0.5) * 5, r() * 6.28, townsfolk()); n.at = at; }
  // mercaderes detrás de cada puesto, mirando a la plaza
  const vendorKinds: Kind[] = ["Barbarian", "Rogue", "Mage", "Rogue_Hooded"];
  const vendors = STALLS.map((s, i) => {
    const d = Math.hypot(s.x, s.z), ux = s.x / d, uz = s.z / d, kind = vendorKinds[i % vendorKinds.length]!;
    return mk("vendor", s.x + ux * 1.9, s.z + uz * 1.9, Math.atan2(-ux, -uz), { kind, show: kind === "Barbarian" ? ["Barbarian_Hat"] : kind === "Mage" ? ["Mage_Hat"] : [], tint: TINTS[(i * 3) % TINTS.length] });
  });
  // guardias: puertas de la ciudad, puerta del castillo y gran salón
  const guard: Look = { kind: "Knight", show: ["Knight_Helmet", "Knight_Cape", "1H_Sword", "Rectangle_Shield"] };
  for (const a of GATE_ANGLES) for (const s of [-1, 1]) mk("guard", Math.cos(a) * (CITY_R - 7) - Math.sin(a) * s * 4.2, Math.sin(a) * (CITY_R - 7) + Math.cos(a) * s * 4.2, Math.atan2(-Math.cos(a), -Math.sin(a)), guard);
  for (const s of [-1, 1]) { mk("guard", s * 4.2, -40.5, 0, guard); mk("guard", s * 4.6, GREAT_HALL.z + GREAT_HALL.d / 2 + 3.2, 0, guard); }

  const cries = vendors.map((v, i) => { const s = crySprite(CRIES[i % CRIES.length]!); s.position.set(v.x, 3.1, v.z); scene.add(s); return { s, npc: v, next: 3 + r() * 14, until: 0 }; });

  // ---- Aves (instanciadas) ----
  const birdMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  const bodyGeo = new THREE.ConeGeometry(0.09, 0.36, 5); bodyGeo.rotateX(Math.PI / 2);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.1, 0.42, 0, -0.02, 0, 0, -0.12]), 3)); wingGeo.computeVertexNormals();
  interface Bird { ground: boolean; hx: number; hz: number; x: number; y: number; z: number; heading: number; ph: number; flee: number; cx: number; cz: number; rad: number; h: number; w: number; }
  const birds: Bird[] = [];
  const flocks: [number, number, number, number][] = [[0, 0, 13, 17], [-55, -24, 16, 38], [0, -70, 22, 44], [60, 40, 14, 22]];
  for (const [cx, cz, rad, h] of flocks) for (let i = 0; i < 9; i++) birds.push({ ground: false, hx: 0, hz: 0, x: cx, y: h, z: cz, heading: 0, ph: r() * 6.28, flee: 0, cx, cz, rad: rad + r() * 5, h: h + r() * 4, w: (0.32 + r() * 0.1) * (r() < 0.5 ? 1 : -1) });
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 5.6 + r() * 4.5; birds.push({ ground: true, hx: Math.cos(a) * d, hz: Math.sin(a) * d, x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, heading: r() * 6.28, ph: r() * 6.28, flee: 0, cx: 0, cz: 0, rad: 0, h: 0, w: 0 }); }
  const inst = (geo: THREE.BufferGeometry, count: number) => { const m = new THREE.InstancedMesh(geo, birdMat, count); m.frustumCulled = false; scene.add(m); return m; };
  const bBody = inst(bodyGeo, birds.length), bWing = inst(wingGeo, birds.length * 2), col = new THREE.Color();
  birds.forEach((b, i) => { col.setHex(b.ground ? [0x8a8f98, 0xb9bcc2, 0x6f747c][i % 3]! : [0x2a2a2e, 0x3a3a40, 0xe8e8e8][i % 3]!); bBody.setColorAt(i, col); bWing.setColorAt(i * 2, col); bWing.setColorAt(i * 2 + 1, col); });
  const bObj = new THREE.Object3D(), wL = new THREE.Object3D(), wR = new THREE.Object3D(); bObj.add(wL, wR); wR.scale.x = -1;

  return {
    update(dt, t, focus) {
      for (const n of npcs) {
        let moving = false;
        if (n.role === "walker") {
          if (n.wait > 0) n.wait -= dt;
          else {
            if (!n.path.length) { let to = n.at; while (to === n.at) to = Math.floor(r() * NODES.length); n.path = route(n.at, to); }
            const next = n.path[0]!, [ax, az] = NODES[n.at]!, [bx, bz] = NODES[next]!;
            const dl = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az) / dl, pz = (bx - ax) / dl; // carril a un lado del eje
            const tx = bx + px * n.lane, tz = bz + pz * n.lane, dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
            if (d < 1.2) { n.at = next; n.path.shift(); if (!n.path.length) n.wait = 2 + r() * 9; }
            else {
              const want = Math.atan2(dx, dz); n.heading += Math.atan2(Math.sin(want - n.heading), Math.cos(want - n.heading)) * Math.min(1, dt * 5);
              n.x += Math.sin(n.heading) * n.speed * dt; n.z += Math.cos(n.heading) * n.speed * dt;
              [n.x, n.z] = resolveCollisions(n.x, n.z, 0.35);
              moving = true;
            }
          }
        }
        const near = Math.abs(n.x - focus.x) < NPC_RANGE && Math.abs(n.z - focus.z) < NPC_RANGE;
        const g = n.body.group; g.visible = near;
        if (!near) continue;
        g.position.set(n.x, 0, n.z); g.rotation.y = n.heading;
        n.body.update(dt, moving ? n.speed : 0);
      }

      // pregones de los mercaderes cuando el jugador anda cerca
      const nearPlaza = Math.hypot(focus.x, focus.z) < 40;
      for (const c of cries) {
        if (c.s.visible && t > c.until) c.s.visible = false;
        if (!c.s.visible && t > c.next) { c.next = t + 9 + r() * 16; if (nearPlaza) { c.s.visible = true; c.until = t + 3.2; c.npc.body.emote("Cheer"); } }
      }

      // aves
      birds.forEach((b, i) => {
        let flap = 0, pitch = 0, roll = 0;
        if (!b.ground) {
          const a = b.ph + t * b.w; b.x = b.cx + Math.cos(a) * b.rad; b.z = b.cz + Math.sin(a) * b.rad; b.y = b.h + Math.sin(t * 0.7 + b.ph) * 1.6;
          b.heading = Math.atan2(-Math.sin(a) * b.w, Math.cos(a) * b.w); flap = Math.sin(t * 11 + b.ph) * 0.8; roll = b.w > 0 ? -0.35 : 0.35;
        } else {
          const dx = b.x - focus.x, dz = b.z - focus.z, d = Math.hypot(dx, dz);
          if (b.flee <= 0 && b.y < 0.05 && d < 4.2 && focus.y < 6) { b.flee = 9 + r() * 5; b.heading = Math.atan2(dx, dz) + (r() - 0.5); } // ¡espantada!
          if (b.flee > 0) {
            b.flee -= dt;
            if (b.flee > 4) { b.x += Math.sin(b.heading) * 5.5 * dt; b.z += Math.cos(b.heading) * 5.5 * dt; b.y = Math.min(11, b.y + 4.5 * dt); b.heading += 0.5 * dt; pitch = -0.4; }
            else { // regresa planeando a su sitio
              const hx = b.hx - b.x, hz = b.hz - b.z, hd = Math.hypot(hx, hz);
              if (hd > 0.3) { b.heading = Math.atan2(hx, hz); const sp = Math.min(6, hd * 1.6 + 0.8); b.x += (hx / hd) * sp * dt; b.z += (hz / hd) * sp * dt; }
              b.y = Math.max(0, b.y - (b.y / Math.max(0.4, b.flee)) * dt * 1.4); if (b.flee <= 0.05) { b.y = 0; b.x = b.hx; b.z = b.hz; }
            }
            flap = Math.sin(t * 16 + b.ph) * 0.9;
          } else { pitch = Math.max(0, Math.sin(t * 2.2 + b.ph * 3)) * 0.7; flap = -1.25; if (Math.sin(t * 0.4 + b.ph) > 0.98) b.heading += dt * 3; } // picotea
        }
        bObj.position.set(b.x, b.y + (b.ground ? 0.12 : 0), b.z); bObj.rotation.set(pitch, b.heading, roll, "YXZ");
        wL.rotation.z = flap; wR.rotation.z = flap; // el ala derecha está reflejada en X
        const near = Math.abs(b.x - focus.x) < 110 && Math.abs(b.z - focus.z) < 110;
        bObj.scale.setScalar(near ? 1 : 0);
        bObj.updateMatrixWorld(true);
        bBody.setMatrixAt(i, bObj.matrixWorld); bWing.setMatrixAt(i * 2, wL.matrixWorld); bWing.setMatrixAt(i * 2 + 1, wR.matrixWorld);
      });
      bBody.instanceMatrix.needsUpdate = true; bWing.instanceMatrix.needsUpdate = true;
    },
  };
}
