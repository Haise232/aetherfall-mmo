import * as THREE from "three";
import { NPCS, type NpcDef } from "@mmorpg/shared";
import { Character, playerLook } from "../models/character";
import { createBubble } from "./bubble";

// NPCs del mundo con los que se puede hablar: nombre, título, marca de misión, columna de luz, flecha guía,
// giro hacia quien se acerca, saludo en bocadillo y resaltado al pasar el ratón.
const GOLD = 0xe2b23f;
const GREET_RANGE = 7, FACE_RANGE = 8;

/** Marca sobre la cabeza: "!" misión nueva o por hacer aquí, "?" lista para entregar, "…" en curso. */
export type NpcMark = "new" | "turnin" | "progress" | null;

function canvasSprite(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, scale: number) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(scale * (w / h), scale, 1); s.renderOrder = 14;
  return s;
}

function markSprite(glyph: string, fill: string) {
  return canvasSprite(96, 120, g => {
    g.fillStyle = fill; g.strokeStyle = "#111a29"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(8, 8); g.lineTo(88, 8); g.lineTo(88, 70); g.lineTo(48, 112); g.lineTo(8, 70); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#111a29"; g.font = "bold 72px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(glyph, 48, 56);
  }, 0.85);
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function createOne(scene: THREE.Scene, def: NpcDef) {
  const { x, z, ry, look } = def;
  const npc = new Character(playerLook(look), { shadow: true });
  npc.group.position.set(x, 0, z); npc.group.rotation.y = ry;
  scene.add(npc.group);
  npc.hitbox.userData.npcId = def.id;

  const drawLabel = (hover: boolean) => (g: CanvasRenderingContext2D) => {
    g.clearRect(0, 0, 512, 112);
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.font = "bold 40px Georgia, serif"; g.lineWidth = 8; g.strokeStyle = "rgba(17,26,41,.92)"; g.strokeText(def.name, 256, 36);
    g.fillStyle = hover ? "#fff3c4" : "#f5d76a"; g.fillText(def.name, 256, 36);
    g.font = "26px Georgia, serif"; g.lineWidth = 6; g.strokeText(def.title, 256, 84); g.fillStyle = hover ? "#ffffff" : "#efe6d0"; g.fillText(def.title, 256, 84);
  };
  const label = canvasSprite(512, 112, drawLabel(false), 0.95);
  label.position.set(x, 2.75, z); scene.add(label);
  const labelCanvas = (label.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
  const setLabelHover = (h: boolean) => { drawLabel(h)(labelCanvas.getContext("2d")!); label.material.map!.needsUpdate = true; label.scale.multiplyScalar(h ? 1.08 : 1 / 1.08); };

  const marks: Record<Exclude<NpcMark, null>, THREE.Sprite> = {
    new: markSprite("!", "#e2b23f"),
    turnin: markSprite("?", "#e2b23f"),
    progress: markSprite("?", "#9aa3ad"),
  };
  for (const m of Object.values(marks)) { m.visible = false; scene.add(m); }

  const gc = document.createElement("canvas"); gc.width = 4; gc.height = 128;
  const gg = gc.getContext("2d")!, grad = gg.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.7, "rgba(255,255,255,.55)"); grad.addColorStop(1, "rgba(255,255,255,.9)");
  gg.fillStyle = grad; gg.fillRect(0, 0, 4, 128);
  const beamTex = new THREE.CanvasTexture(gc);
  const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, map: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beamGeo = new THREE.CylinderGeometry(0.7, 0.9, 46, 16, 1, true); beamGeo.translate(0, 23, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(x, 0, z); beam.renderOrder = 4; scene.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false }));
  ring.position.set(x, 0.13, z); ring.renderOrder = 3; scene.add(ring);
  // anillo claro al pasar el ratón
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf5d76a, transparent: true, opacity: 0.7, depthWrite: false }));
  hoverRing.position.set(x, 0.14, z); hoverRing.renderOrder = 3; hoverRing.visible = false; scene.add(hoverRing);

  const bubble = createBubble({ scale: 0.95 });
  bubble.sprite.position.set(x, 3.95, z); scene.add(bubble.sprite);

  let wasNear = false, hover = false, talking = false, greetCooldown = 0, greetIdx = Math.floor(Math.random() * def.greet.length);
  return {
    hitbox: npc.hitbox,
    id: def.id,
    def,
    position: new THREE.Vector3(x, 0, z),
    setHover(h: boolean) { if (h === hover) return; hover = h; hoverRing.visible = h; setLabelHover(h); },
    /** Mientras dura la conversación mira al jugador y no saluda. */
    setTalking(t: boolean) { talking = t; if (t) { bubble.hide(); npc.emote("Interact"); } },
    say(text: string, seconds?: number) { bubble.show(text, seconds); },
    update(dt: number, t: number, me: THREE.Vector3 | null, mark: NpcMark) {
      npc.update(dt, 0); bubble.update(dt);
      const d = me ? Math.hypot(me.x - x, me.z - z) : Infinity;
      // girarse hacia quien se acerca; volver a su postura al quedarse solo
      const want = me && (d < FACE_RANGE || talking) ? Math.atan2(me.x - x, me.z - z) : ry;
      const cur = npc.group.rotation.y;
      npc.group.rotation.y = cur + angDiff(cur, want) * Math.min(1, dt * 5);
      // saludo al llegar (con espera para no repetirlo si das vueltas a su alrededor)
      greetCooldown -= dt;
      const near = d < GREET_RANGE;
      if (near && !wasNear && !talking) {
        npc.emote("Interact");
        if (greetCooldown <= 0 && def.greet.length) { bubble.show(def.greet[greetIdx++ % def.greet.length]!, 3.2); greetCooldown = 20; }
      }
      wasNear = near;
      for (const [k, m] of Object.entries(marks)) m.visible = k === mark;
      const active = mark === "new" || mark === "turnin";
      beam.visible = ring.visible = active && d > 4; // de cerca la columna estorba
      if (mark) marks[mark].position.set(x, (bubble.visible ? 4.4 + bubble.height : 3.35) + Math.sin(t * 2.4) * 0.12, z);
      if (beam.visible) {
        beamMat.opacity = 0.55 + Math.sin(t * 1.6) * 0.15;
        ring.scale.setScalar(1 + ((t * 0.6) % 1) * 0.6); (ring.material as THREE.MeshBasicMaterial).opacity = 1 - ((t * 0.6) % 1);
      }
      return d;
    },
  };
}

export function createNpcs(scene: THREE.Scene) {
  const byId = new Map<string, ReturnType<typeof createOne>>();
  for (const def of NPCS) byId.set(def.id, createOne(scene, def));

  // flecha en el suelo junto al jugador
  const sh = new THREE.Shape(); sh.moveTo(0, 0.55); sh.lineTo(0.42, -0.1); sh.lineTo(0.16, -0.1); sh.lineTo(0, 0.12); sh.lineTo(-0.16, -0.1); sh.lineTo(-0.42, -0.1); sh.closePath();
  const arrowGeo = new THREE.ShapeGeometry(sh); arrowGeo.rotateX(-Math.PI / 2); arrowGeo.rotateY(Math.PI);
  const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  arrow.renderOrder = 6; arrow.visible = false; scene.add(arrow);

  let hovered: string | null = null, talkingTo: string | null = null;
  return {
    hitboxes: [...byId.values()].map(n => n.hitbox),
    /** Id del NPC al que pertenece una caja de colisión del rayo. */
    idOfHitbox(h: THREE.Object3D) { return h.userData.npcId as string | undefined; },
    npcOf(id: string) { return byId.get(id); },
    setHover(id: string | null) {
      if (id === hovered) return;
      if (hovered) byId.get(hovered)?.setHover(false);
      hovered = id; if (id) byId.get(id)?.setHover(true);
    },
    setTalking(id: string | null) {
      if (id === talkingTo) return;
      if (talkingTo) byId.get(talkingTo)?.setTalking(false);
      talkingTo = id; if (id) byId.get(id)?.setTalking(true);
    },
    nearest(me: THREE.Vector3 | null) {
      if (!me) return null;
      let best: { id: string; d: number } | null = null;
      for (const [id, n] of byId) {
        const d = Math.hypot(me.x - n.position.x, me.z - n.position.z);
        if (!best || d < best.d) best = { id, d };
      }
      return best;
    },
    distanceTo(id: string, me: THREE.Vector3) { const n = byId.get(id); return n ? Math.hypot(me.x - n.position.x, me.z - n.position.z) : Infinity; },
    update(dt: number, t: number, me: THREE.Vector3 | null, marks: Record<string, NpcMark>, goalId?: string) {
      for (const [id, n] of byId) n.update(dt, t, me, marks[id] ?? null);
      const goal = goalId ? byId.get(goalId) : undefined;
      const gd = goal && me ? Math.hypot(me.x - goal.position.x, me.z - goal.position.z) : Infinity;
      arrow.visible = !!goal && !!me && gd > 9;
      if (arrow.visible && goal && me) {
        const a = Math.atan2(goal.position.x - me.x, goal.position.z - me.z), r = 2.3 + Math.sin(t * 4) * 0.15;
        arrow.position.set(me.x + Math.sin(a) * r, me.y + 0.16, me.z + Math.cos(a) * r);
        arrow.rotation.y = a;
        (arrow.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 4) * 0.2;
      }
    },
  };
}
