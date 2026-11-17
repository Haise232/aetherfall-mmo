import * as THREE from "three";
import { CATHEDRAL, HALL, WALL_T, doorW, hollowFloors, interiorFrame, interiorProps, isEnterable, type Building, type Tower } from "@mmorpg/shared";
import {
  DOOR, GLASS, Merge, STONE, STONE_D, STONE_L, TIMBER, WARM, WOOD, archGeo, archWallGeo, bannerGeo, flareConeGeo, hash2, hipGeo, pennantGeo,
} from "./kit";

export const RY = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const NRM = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
/** Punto del mundo a `along` (tangente) y `out` (normal) de la cara `dir` de un edificio centrado en (cx,cz). */
export function onFace(cx: number, cz: number, dir: number, along: number, out: number) {
  const th = RY[dir]!, c = Math.cos(th), s = Math.sin(th);
  return { x: cx + along * c + out * s, z: cz - along * s + out * c };
}
const SHUTTER = [0x2f5d62, 0x7a2f3a, 0x3f6b3a, 0x2c3e66, 0x8a5a2b];
const pick = <T,>(a: readonly T[], h: number) => a[Math.floor(h * a.length) % a.length]!;

export interface Ctx { chimneys: THREE.Vector3[] }

/** Franjas de tejas sobre un tejado a dos aguas (bandas oscuras que dan escala y textura). */
function tileRows(m: Merge, span: number, len: number, rh: number, ov: number, x: number, y: number, z: number, color: number, alongX: boolean) {
  const S = span / 2 + ov, th = Math.atan2(rh, S), c = new THREE.Color(color).multiplyScalar(0.72).getHex();
  const L = Math.hypot(S, rh);
  for (const t of [0.28, 0.52, 0.76]) for (const sg of [-1, 1]) {
    const a = S * t * sg, yy = rh * (1 - t) + 0.02;
    if (alongX) m.box("solid", len + 0.4, 0.09, L * 0.1, x, y + yy, z + a, c, 0, sg * th, 0);
    else m.box("solid", L * 0.1, 0.09, len + 0.4, x + a, y + yy, z, c, 0, 0, -sg * th);
  }
}
/** Cumbrera y remates de un tejado a dos aguas. */
function ridge(m: Merge, len: number, rh: number, x: number, y: number, z: number, color: number, alongX: boolean) {
  const c = new THREE.Color(color).multiplyScalar(0.62).getHex();
  if (alongX) m.box("solid", len + 1.0, 0.22, 0.3, x, y + rh + 0.05, z, c); else m.box("solid", 0.3, 0.22, len + 1.0, x, y + rh + 0.05, z, c);
}

function window2(m: Merge, p: { x: number; z: number }, dir: number, y: number, glow: number, h: number, shut: boolean, flowers: boolean) {
  const n = NRM[dir]!, tx = n[1], tz = -n[0]; // tangente de la cara
  m.box("solid", 1.15, 1.35, 0.1, p.x, y, p.z, TIMBER, RY[dir]!);
  m.box("glow", 0.8, 1.0, 0.1, p.x + n[0] * 0.06, y, p.z + n[1] * 0.06, glow, RY[dir]!);
  m.box("solid", 0.07, 1.0, 0.04, p.x + n[0] * 0.12, y, p.z + n[1] * 0.12, TIMBER, RY[dir]!);
  if (shut) for (const s of [-1, 1]) m.box("solid", 0.36, 1.25, 0.07, p.x + tx * s * 0.78 + n[0] * 0.04, y, p.z + tz * s * 0.78 + n[1] * 0.04, pick(SHUTTER, h), RY[dir]!);
  if (flowers) {
    m.box("solid", 1.0, 0.24, 0.34, p.x + n[0] * 0.2, y - 0.8, p.z + n[1] * 0.2, WOOD, RY[dir]!);
    m.box("solid", 0.9, 0.16, 0.28, p.x + n[0] * 0.2, y - 0.62, p.z + n[1] * 0.2, pick([0xd9534f, 0xe8a0b4, 0xf2c14e, 0xb48ae0], h * 3.7 % 1), RY[dir]!);
  }
}

function chimney(m: Merge, ctx: Ctx, x: number, z: number, roofY: number, rh: number, w = 0.95) {
  const ch = rh + 1.6;
  m.box("solid", w, ch, w, x, roofY + ch / 2 - 0.3, z, 0x7b7166);
  m.box("solid", w + 0.25, 0.2, w + 0.25, x, roofY + ch - 0.2, z, 0x4a443d);
  ctx.chimneys.push(new THREE.Vector3(x, roofY + ch, z));
}

export function house(m: Merge, b: Building, ctx: Ctx, opts: { glow?: number } = {}) {
  m.at(b.x, b.z);
  const style = b.style, STORY = 2.8, Y0 = 0.5, glow = opts.glow ?? WARM;
  const hh = hash2(b.x, b.z), stoneBase = !style && hh < 0.28;
  const floors = style === "hut" ? 1 : b.floors;
  if (style === "barn") return barn(m, b, ctx);
  if (style === "stable") return stable(m, b, ctx);
  const hollow = isEnterable(b), HF = hollow ? hollowFloors(b) : 0;
  if (hollow) { // zócalo solo en el perímetro (abierto en la puerta): dentro el suelo está a ras de calle
    const gap = doorW(b) / 2;
    for (let dir = 0; dir < 4; dir++) {
      const span = dir % 2 === 0 ? b.w + 0.5 : b.d, half = dir % 2 === 0 ? b.d / 2 : b.w / 2;
      const segs: [number, number][] = dir === b.facing ? [[-span / 2, -gap], [gap, span / 2]] : [[-span / 2, span / 2]];
      for (const [a0, a1] of segs) { const p = onFace(b.x, b.z, dir, (a0 + a1) / 2, half); m.box("solid", a1 - a0, 0.5, 0.55, p.x, 0.25, p.z, STONE_D, RY[dir]!); }
    }
  } else m.box("solid", b.w + 0.5, 0.5, b.d + 0.5, b.x, 0.25, b.z, STONE_D);
  for (let f = 0; f < floors; f++) {
    const jet = style === "watch" || style === "hut" || f < HF ? 0 : 0.4;
    const wf = b.w + jet * f, df = b.d + jet * f, yb = Y0 + f * STORY, storyH = style === "hut" ? 2.3 : STORY;
    const stone = (stoneBase && f === 0) || style === "watch";
    const wallCol = stone ? (style === "watch" ? 0xa7a194 : 0xb6ae9c) : b.wall;
    if (f < HF) { // planta hueca: cuatro paños de muro (con la puerta en la planta baja) y la viga solo en el perímetro
      const y0 = f === 0 ? 0 : yb, hgt = yb + storyH - y0, T = WALL_T, dw = doorW(b);
      for (let dir = 0; dir < 4; dir++) {
        const span = dir % 2 === 0 ? wf : df, half = (dir % 2 === 0 ? df : wf) / 2 - T / 2;
        const seg = (a0: number, a1: number, y: number, h: number) => { const p = onFace(b.x, b.z, dir, (a0 + a1) / 2, half); m.box("solid", a1 - a0, h, T, p.x, y + h / 2, p.z, wallCol, RY[dir]!); };
        if (f === 0 && dir === b.facing) { seg(-span / 2, -dw / 2, y0, hgt); seg(dw / 2, span / 2, y0, hgt); seg(-dw / 2, dw / 2, FLOOR_TOP + 2.75, yb + storyH - FLOOR_TOP - 2.75); }
        else seg(-span / 2, span / 2, y0, hgt);
        const beam = (a0: number, a1: number) => { const pb = onFace(b.x, b.z, dir, (a0 + a1) / 2, half + T / 2 + 0.03); m.box("solid", a1 - a0, 0.26, 0.2, pb.x, yb + 0.13, pb.z, TIMBER, RY[dir]!); };
        const S = span / 2 + 0.08;
        if (f === 0 && dir === b.facing) { beam(-S, -dw / 2); beam(dw / 2, S); } else beam(-S, S); // la viga no cruza la puerta
      }
      if (f === HF - 1) interiorShell(m, b, yb + storyH);
    } else {
      m.box("solid", wf, storyH, df, b.x, yb + storyH / 2, b.z, wallCol);
      m.box("solid", wf + 0.16, 0.26, df + 0.16, b.x, yb + 0.13, b.z, TIMBER);
    }
    if (f > 0 && jet > 0) m.box("solid", wf + 0.3, 0.3, df + 0.3, b.x, yb - 0.1, b.z, TIMBER); // viga del voladizo
    for (let dir = 0; dir < 4; dir++) {
      const span = dir % 2 === 0 ? wf : df, half = (dir % 2 === 0 ? df : wf) / 2;
      const long = dir === b.facing || dir === (b.facing + 2) % 4;
      if (!stone) {
        const n = Math.max(2, Math.round(span / 2.6) + 1), step = span / (n - 1);
        for (let i = 0; i < n; i++) {
          const p = onFace(b.x, b.z, dir, -span / 2 + i * step, half + 0.02);
          m.box("solid", 0.22, storyH, 0.22, p.x, yb + storyH / 2, p.z, TIMBER);
          if (i < n - 1 && long) {
            const q = onFace(b.x, b.z, dir, -span / 2 + (i + 0.5) * step, half + 0.03), sgn = (i + f + dir) % 2 ? 1 : -1;
            m.box("solid", 0.14, Math.hypot(step, storyH * 0.85), 0.1, q.x, yb + storyH * 0.5, q.z, TIMBER, RY[dir]!, 0, sgn * Math.atan2(step, storyH * 0.85));
          }
        }
      } else for (const s of [-1, 1]) { // esquinas de sillería
        const p = onFace(b.x, b.z, dir, s * span / 2, half + 0.02);
        if (s === 1) m.box("solid", 0.4, storyH, 0.4, p.x, yb + storyH / 2, p.z, STONE_L);
      }
      const nW = long ? Math.max(1, Math.floor(span / 3.4)) : 1;
      for (let i = 0; i < nW; i++) {
        const along = (i - (nW - 1) / 2) * (span / nW);
        if (f === 0 && dir === b.facing && Math.abs(along) < (b.kind === "guild" ? 2.9 : 1.7)) continue; // el Gremio necesita sitio para su portada
        if (style === "hut" && !long) continue;
        const p = onFace(b.x, b.z, dir, along, half + 0.05);
        if (style === "watch") { m.box("glow", 0.35, 1.3, 0.1, p.x, yb + 1.7, p.z, glow, RY[dir]!); continue; }
        window2(m, p, dir, yb + 1.7, glow, hash2(b.x + i, b.z + f * 7 + dir), long && dir === b.facing, long && dir === b.facing && hh > 0.45 && f > 0);
        if (f < HF) { // la misma ventana vista desde dentro
          const q = onFace(b.x, b.z, dir, along, (dir % 2 === 0 ? b.d : b.w) / 2 - WALL_T - 0.03);
          m.box("solid", 1.15, 1.35, 0.06, q.x, yb + 1.7, q.z, TIMBER, RY[dir]!); m.box("glow", 0.8, 1.0, 0.07, q.x, yb + 1.7, q.z, glow, RY[dir]!);
          m.box("solid", 1.2, 0.08, 0.22, q.x, yb + 1.08, q.z, TIMBER, RY[dir]!); // alféizar
        }
      }
    }
  }
  // puerta en arco (en los interiores, abierta de par en par)
  const dh = b.facing % 2 === 0 ? b.d / 2 : b.w / 2;
  const d1 = onFace(b.x, b.z, b.facing, 0, dh + 0.1), d2 = onFace(b.x, b.z, b.facing, 0, dh + 0.18), d3 = onFace(b.x, b.z, b.facing, 0, dh + 0.55);
  if (b.kind === "guild") guildPortal(m, b, dh);
  else if (hollow) {
    const dw = doorW(b), fr = onFace(b.x, b.z, b.facing, 0, dh + 0.05);
    m.put("solid", archWallGeo(dw + 0.6, 3.1, 0.2, dw, 2.75), TIMBER, fr.x, 0, fr.z, RY[b.facing]!);
    m.box("solid", dw + 0.5, 0.06, WALL_T + 0.5, d1.x, 0.03, d1.z, STONE_L, RY[b.facing]!); // umbral
    const leaves = [1];
    for (const s of leaves) { // hojas abiertas hacia dentro, pegadas al muro
      const w = dw / leaves.length, p = onFace(b.x, b.z, b.facing, s * (dw / 2 + 0.06), dh - WALL_T - w / 2);
      m.box("solid", 0.09, 2.6, w - 0.05, p.x, 1.3, p.z, DOOR, RY[b.facing]!);
    }
    m.box("solid", dw + 0.9, 0.2, 1.1, d3.x, 0.1, d3.z, STONE_D, RY[b.facing]!); // escalón bajo
  } else {
    m.put("solid", archGeo(1.8, 2.8, 0.14), TIMBER, d1.x, Y0, d1.z, RY[b.facing]!);
    m.put("solid", archGeo(1.3, 2.45, 0.16), DOOR, d2.x, Y0, d2.z, RY[b.facing]!);
    m.box("solid", 1.9, 0.25, 0.8, d3.x, 0.3, d3.z, STONE_D, RY[b.facing]!);
  }
  // tejado
  const jet = style === "watch" || style === "hut" ? 0 : 0.4;
  const topW = b.w + jet * (floors - 1), topD = b.d + jet * (floors - 1);
  const alongX = topW >= topD, span = alongX ? topD : topW, len = alongX ? topW : topD;
  const roofY = Y0 + floors * (style === "hut" ? 2.3 : STORY);
  let rh: number;
  if (style === "watch") { // parapeto almenado y tejado piramidal
    rh = span * 0.85 + 1; const ov = 0.7;
    m.box("solid", topW + 0.7, 0.45, topD + 0.7, b.x, roofY + 0.2, b.z, STONE_D);
    m.put("solid", hipGeo(topW + ov * 2, topD + ov * 2, rh, 0), b.roof, b.x, roofY + 0.4, b.z);
    m.cyl("solid", 0.08, 0.08, 2.6, 5, b.x, roofY + 0.4 + rh, b.z, 0x3a3a3e);
    m.put("solid", pennantGeo(1.5, 0.9), 0xb02a30, b.x, roofY + 0.4 + rh + 2.1, b.z);
    rh += 0.4;
    const ox = topW * 0.3, oz = topD * 0.28; chimney(m, ctx, b.x + ox * -1, b.z + oz, roofY, 0.8);
  } else if (style === "hut") {
    rh = 1.6 + span * 0.35;
    m.put("solid", hipGeo(topW + 1.2, topD + 1.2, rh, Math.max(0, len - span) * 0.7), 0xb8944a, b.x, roofY, b.z, alongX ? 0 : Math.PI / 2);
    chimney(m, ctx, b.x + (alongX ? len * 0.25 : 0), b.z + (alongX ? 0 : len * 0.25), roofY, rh * 0.5, 0.7);
  } else if (style === "hip") {
    rh = 1.4 + span * 0.3; const ov = 0.65;
    m.put("solid", hipGeo(topW + ov * 2, topD + ov * 2, rh, Math.max(0, len - span)), b.roof, b.x, roofY, b.z, alongX ? 0 : Math.PI / 2);
    chimney(m, ctx, b.x + (alongX ? len * 0.2 : 0), b.z + (alongX ? 0.0 : len * 0.2), roofY, rh * 0.8);
  } else {
    rh = 1.5 + span * 0.3;
    m.prism(span, len, rh, 0.6, b.x, roofY, b.z, b.roof, alongX, 0.45);
    tileRows(m, span, len, rh, 0.6, b.x, roofY, b.z, b.roof, alongX);
    ridge(m, len, rh, b.x, roofY, b.z, b.roof, alongX);
    const ox = alongX ? len * 0.27 : span * 0.18, oz = alongX ? span * 0.12 : len * 0.27;
    chimney(m, ctx, b.x + ox, b.z + oz, roofY, rh);
    // buhardilla en el faldón de la fachada
    const front = (b.facing % 2 === 0) === alongX && (b.floors >= 2 || hh > 0.6);
    if (front && len > 7) {
      const n = NRM[b.facing]!, S = span / 2 + 0.6, a = S * 0.48, ys = rh * (1 - 0.48);
      const along = alongX ? (hh > 0.5 ? -len * 0.22 : len * 0.2) : 0, along2 = alongX ? 0 : (hh > 0.5 ? -len * 0.22 : len * 0.2);
      const sgn = b.facing === 0 || b.facing === 1 ? 1 : -1;
      const dx = alongX ? along : a * sgn, dz = alongX ? a * sgn : along2;
      m.box("solid", 1.6, 1.8, 1.3, b.x + dx, roofY + ys - 0.05, b.z + dz, b.wall, RY[b.facing]!);
      m.prism(1.6, 1.3, 1.0, 0.25, b.x + dx, roofY + ys + 0.85, b.z + dz, b.roof, !alongX, 0.25);
      const fx = b.x + dx + n[0] * 0.67, fz = b.z + dz + n[1] * 0.67;
      m.box("solid", 0.95, 1.05, 0.08, fx, roofY + ys + 0.1, fz, TIMBER, RY[b.facing]!);
      m.box("glow", 0.7, 0.8, 0.08, fx + n[0] * 0.05, roofY + ys + 0.1, fz + n[1] * 0.05, glow, RY[b.facing]!);
    }
  }
  // taller: techillo con yunque y barriles; granja: pozo/porche, etc.
  if (style === "workshop") { // tejadillo de trabajo junto a la puerta (sin taparla)
    const side = 2.75, n = NRM[b.facing]!, p = onFace(b.x, b.z, b.facing, side, dh + 1.6);
    m.box("solid", 2.6, 0.14, 2.6, p.x - n[0] * 0.2, 2.8, p.z - n[1] * 0.2, 0x7a4a2b, RY[b.facing]!, 0.0, 0.0);
    for (const s of [-1, 1]) { const q = onFace(b.x, b.z, b.facing, side + s * 1.1, dh + 2.6); m.box("solid", 0.16, 2.6, 0.16, q.x, 1.3, q.z, WOOD); }
    m.box("solid", 0.8, 0.5, 0.4, p.x, 0.75, p.z, 0x3b3f46); m.box("solid", 0.5, 0.5, 0.5, p.x, 0.25, p.z, 0x55504a);
    const q2 = onFace(b.x, b.z, b.facing, -b.w * 0.25, dh + 0.5);
    m.box("solid", 0.15, 2.4, 0.15, q2.x, 3.2, q2.z, TIMBER); m.box("solid", 1.2, 0.9, 0.1, q2.x, 4.2, q2.z, pick([0x7a2f3a, 0x2f5d62, 0x8a6a2b], hh), RY[b.facing]!);
  }
  return { roofY, rh };
}

function barn(m: Merge, b: Building, ctx: Ctx) {
  void ctx;
  const H = 5.2, alongX = b.w >= b.d, span = alongX ? b.d : b.w, len = alongX ? b.w : b.d;
  m.at(b.x, b.z);
  m.box("solid", b.w + 0.4, 0.4, b.d + 0.4, b.x, 0.2, b.z, STONE_D);
  m.box("solid", b.w, H, b.d, b.x, H / 2 + 0.4, b.z, b.wall);
  for (let dir = 0; dir < 4; dir++) {
    const sp = dir % 2 === 0 ? b.w : b.d, half = (dir % 2 === 0 ? b.d : b.w) / 2;
    for (let i = 0; i <= 4; i++) { const p = onFace(b.x, b.z, dir, -sp / 2 + (i * sp) / 4, half + 0.02); m.box("solid", 0.3, H, 0.25, p.x, H / 2 + 0.4, p.z, 0xe9e0cc); }
  }
  const dh = (b.facing % 2 === 0 ? b.d : b.w) / 2, n = NRM[b.facing]!;
  const g = onFace(b.x, b.z, b.facing, 0, dh + 0.06);
  m.box("solid", 3.8, 3.8, 0.14, g.x, 2.3, g.z, 0xe9e0cc, RY[b.facing]!);
  m.box("solid", 3.4, 3.4, 0.16, g.x + n[0] * 0.04, 2.3, g.z + n[1] * 0.04, 0x7a3a2c, RY[b.facing]!);
  for (const s of [-1, 1]) m.box("solid", 0.2, 4.6, 0.12, g.x, 2.3, g.z, 0xe9e0cc, RY[b.facing]!, 0, s * 0.86 + 0);
  const h = onFace(b.x, b.z, b.facing, 0, dh + 0.06);
  m.box("solid", 1.4, 1.2, 0.14, h.x, H - 0.3, h.z, 0xe9e0cc, RY[b.facing]!); m.box("solid", 1.0, 0.9, 0.16, h.x + n[0] * 0.04, H - 0.3, h.z + n[1] * 0.04, 0x2a1e16, RY[b.facing]!);
  const roofY = H + 0.4, rh = 1.6 + span * 0.32;
  // el gablete mira al lado de la puerta si la cumbrera apunta hacia ella
  m.prism(span, len, rh, 0.7, b.x, roofY, b.z, b.roof, alongX, 0.5);
  tileRows(m, span, len, rh, 0.7, b.x, roofY, b.z, b.roof, alongX);
  ridge(m, len, rh, b.x, roofY, b.z, b.roof, alongX);
  return { roofY, rh };
}

function stable(m: Merge, b: Building, ctx: Ctx) {
  void ctx;
  const H = 3.2, alongX = b.w >= b.d, span = alongX ? b.d : b.w, len = alongX ? b.w : b.d;
  m.at(b.x, b.z);
  m.box("solid", b.w + 0.4, 0.35, b.d + 0.4, b.x, 0.17, b.z, STONE_D);
  m.box("solid", b.w, H, b.d, b.x, H / 2 + 0.35, b.z, b.wall);
  for (let dir = 0; dir < 4; dir++) {
    const sp = dir % 2 === 0 ? b.w : b.d, half = (dir % 2 === 0 ? b.d : b.w) / 2;
    for (let i = 0; i <= 3; i++) { const p = onFace(b.x, b.z, dir, -sp / 2 + (i * sp) / 3, half + 0.02); m.box("solid", 0.22, H, 0.22, p.x, H / 2 + 0.35, p.z, TIMBER); }
    const pb = onFace(b.x, b.z, dir, 0, half + 0.02); m.box("solid", sp, 0.2, 0.28, pb.x, 3.4, pb.z, TIMBER, RY[dir]!);
  }
  const dh = (b.facing % 2 === 0 ? b.d : b.w) / 2, n = NRM[b.facing]!;
  for (const s of [-1.8, 1.8]) { // dos boxes abiertos con media puerta
    const p = onFace(b.x, b.z, b.facing, s * (b.w >= 8 ? 1 : 0.8), dh + 0.06);
    m.box("solid", 2.0, 2.4, 0.1, p.x, 1.55, p.z, 0x2a1e16, RY[b.facing]!);
    m.box("solid", 2.0, 1.1, 0.14, p.x + n[0] * 0.08, 0.95, p.z + n[1] * 0.08, 0x7a4a2b, RY[b.facing]!);
  }
  const roofY = H + 0.35, rh = 1.2 + span * 0.28;
  m.prism(span, len, rh, 0.7, b.x, roofY, b.z, b.roof, alongX, 0.5);
  tileRows(m, span, len, rh, 0.7, b.x, roofY, b.z, b.roof, alongX);
  ridge(m, len, rh, b.x, roofY, b.z, b.roof, alongX);
  const t = onFace(b.x, b.z, b.facing, 0, dh + 1.2); // abrevadero y heno
  m.box("solid", 2.6, 0.5, 0.6, t.x, 0.3, t.z, WOOD, RY[b.facing]!); m.box("solid", 2.3, 0.1, 0.4, t.x, 0.52, t.z, 0x3f8fd0, RY[b.facing]!);
  const hy = onFace(b.x, b.z, b.facing, b.w / 2 + 0.2, dh * 0.2); m.box("solid", 0.9, 0.9, 0.9, hy.x, 0.45, hy.z, 0xc9a84a);
  return { roofY, rh };
}

// ---------- portada del Gremio de Mercaderes ----------
const GULES = 0x7a2f3a, OR = 0xd9b13b, IRON = 0x2b2b30;
/** Escudo heráldico (francés) de alto h, de pie sobre y=0 y de cara a +z. */
export function shieldGeo(w: number, h: number, d: number) {
  const sh = new THREE.Shape(), hw = w / 2;
  sh.moveTo(-hw, h); sh.lineTo(hw, h); sh.lineTo(hw, h * 0.4);
  sh.quadraticCurveTo(hw, h * 0.08, 0, 0); sh.quadraticCurveTo(-hw, h * 0.08, -hw, h * 0.4); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -d / 2); return g;
}
/**
 * Entrada principal del Gremio: portada de piedra en arco con columnas, tejadillo con el escudo del gremio
 * (bezante de oro sobre gules), faroles, escalinata, alfombra y hojas de roble con herrajes abiertas hacia dentro.
 * Todo queda fuera del hueco de paso (doorW) para no estorbar al entrar; el servidor no necesita colisiones nuevas.
 */
function guildPortal(m: Merge, b: Building, dh: number) {
  const dw = doorW(b), ry = RY[b.facing]!;
  const P = (along: number, out: number) => onFace(b.x, b.z, b.facing, along, dh + out);
  const box = (w: number, h: number, d: number, along: number, out: number, y: number, c: number, g: "solid" | "glow" = "solid", rx = 0) => {
    const p = P(along, out), geo = new THREE.BoxGeometry(w, h, d);
    if (rx) geo.rotateX(rx); // inclinar en el marco de la fachada y luego orientar
    m.put(g, geo, c, p.x, y, p.z, ry);
  };
  // portada: muro de sillería con arco apuntado y, delante, una arquivolta más estrecha que da profundidad
  const HOLE = 3.0, p0 = P(0, 0.12), p1 = P(0, 0.34);
  m.put("solid", archWallGeo(dw + 2.0, 4.1, 0.3, dw, HOLE), STONE_L, p0.x, 0, p0.z, ry);
  m.put("solid", archWallGeo(dw + 0.7, 3.45, 0.18, dw + 0.02, HOLE), STONE, p1.x, 0, p1.z, ry);
  box(0.5, 0.62, 0.3, 0, 0.42, HOLE + 0.2, STONE_L); // clave
  box(dw + 2.3, 0.22, 0.5, 0, 0.3, 4.15, STONE_D); // cornisa
  // columnas a los lados del arco
  for (const s of [-1, 1]) {
    const c = P(s * (dw / 2 + 0.55), 0.5);
    m.box("solid", 0.62, 0.34, 0.62, c.x, 0.17, c.z, STONE_D, ry);
    m.cyl("solid", 0.2, 0.23, 2.75, 10, c.x, 0.34, c.z, STONE_L);
    m.box("solid", 0.6, 0.28, 0.6, c.x, 3.23, c.z, STONE_D, ry);
  }
  // tejadillo a dos aguas sobre ménsulas, con el escudo del gremio en el hastial
  const roofOut = 0.95, roofLen = 1.5, roofY = 4.26;
  const r = P(0, roofOut);
  m.prism(dw + 2.1, roofLen, 0.95, 0.16, r.x, roofY, r.z, b.roof, b.facing % 2 === 1, 0.08);
  box(dw + 2.5, 0.12, 0.16, 0, roofOut + roofLen / 2 + 0.1, roofY, TIMBER); // alero
  for (const s of [-1, 1]) {
    box(0.16, 0.16, 1.5, s * (dw / 2 + 0.9), 0.78, roofY - 0.08, TIMBER);
    box(0.13, 0.13, 1.3, s * (dw / 2 + 0.9), 0.62, roofY - 0.5, TIMBER, "solid", -0.75); // tornapuntas
  }
  const shY = roofY + 0.06, shOut = roofOut + roofLen / 2 + 0.17;
  { const p = P(0, shOut); m.put("solid", shieldGeo(0.82, 0.86, 0.06), OR, p.x, shY, p.z, ry); }
  { const p = P(0, shOut + 0.04); m.put("solid", shieldGeo(0.66, 0.72, 0.06), GULES, p.x, shY + 0.08, p.z, ry); }
  { const p = P(0, shOut + 0.08); m.put("solid", new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14).rotateX(Math.PI / 2), OR, p.x, shY + 0.5, p.z, ry); }
  // faroles de pared a ambos lados
  for (const s of [-1, 1]) {
    const a = s * (dw / 2 + 1.55);
    box(0.12, 0.12, 0.55, a, 0.27, 2.75, IRON); // brazo
    box(0.36, 0.08, 0.36, a, 0.55, 2.72, IRON); // tapa
    box(0.3, 0.42, 0.3, a, 0.55, 2.46, IRON);
    box(0.22, 0.32, 0.32, a, 0.55, 2.46, WARM, "glow");
    box(0.32, 0.22, 0.22, a, 0.55, 2.46, WARM, "glow");
    box(0.14, 0.1, 0.14, a, 0.55, 2.2, IRON);
  }
  // macetas con arbustos recortados
  for (const s of [-1, 1]) {
    const p = P(s * (dw / 2 + 1.7), 0.75);
    m.box("solid", 0.75, 0.55, 0.75, p.x, 0.28, p.z, STONE_D, ry);
    m.put("solid", new THREE.IcosahedronGeometry(0.46, 0), 0x3f6b3a, p.x, 0.92, p.z, ry);
  }
  // escalinata baja (a ras para poder pisarla) y alfombra de gules con orla de oro
  box(dw + 2.6, 0.08, 1.9, 0, 0.95, 0.04, STONE_D);
  box(dw + 1.6, 0.14, 1.0, 0, 0.5, 0.07, STONE);
  box(dw - 0.5, 0.02, 3.3, 0, 0.45, 0.155, GULES);
  for (const s of [-1, 1]) box(0.08, 0.025, 3.3, s * (dw / 2 - 0.3), 0.45, 0.16, OR);
  box(dw + 0.3, 0.06, WALL_T + 0.5, 0, -0.05, 0.03, STONE_L); // umbral
  // hojas de roble abiertas de par en par hacia dentro, con bandas de hierro y aldaba
  for (const s of [-1, 1]) {
    const w = dw / 2, out = -WALL_T - w / 2;
    box(0.1, 2.85, w - 0.05, s * (dw / 2 + 0.07), out, 1.43, DOOR);
    for (const y of [0.5, 1.45, 2.4]) box(0.13, 0.1, w - 0.12, s * (dw / 2 + 0.07), out, y, IRON);
    const k = P(s * (dw / 2 + 0.07) - s * 0.08, out - w * 0.25);
    m.put("solid", new THREE.TorusGeometry(0.1, 0.025, 5, 10).rotateY(Math.PI / 2), 0xb08d3a, k.x, 1.3, k.z, ry);
  }
}

/** Estandartes de la fachada del Gremio (en el centro manda el escudo de la portada). */
export function guildBanners(m: Merge, b: Building) {
  const fd = (b.facing % 2 === 0 ? b.d : b.w) / 2;
  for (const s of [-1, 1]) { const p = onFace(b.x, b.z, b.facing, s * 5.2, fd + 0.2); m.put("solid", bannerGeo(1.3, 4.0), GULES, p.x, 7.6, p.z, RY[b.facing]!); }
}

// ---------- interiores (Gremio y casas-taller) ----------
const FLOOR_TOP = 0.5;
/** Suelo de tablas, techo con vigas y muebles. Los muebles salen de `interiorProps` (las colisiones también). */
function interiorShell(m: Merge, b: Building, ceilY: number) {
  const f = interiorFrame(b), T = WALL_T, iw = b.w - 2 * T, id = b.d - 2 * T, guild = b.kind === "guild";
  const planks = guild ? 0x6e4a2c : 0x7a5634;
  const flat = (w: number, d: number, x: number, z: number, y: number, c: number, down = false) => m.put("solid", new THREE.PlaneGeometry(w, d), c, x, y, z, 0, down ? Math.PI / 2 : -Math.PI / 2);
  // tablas del suelo alternando tono, a lo largo del lado largo
  const alongX = iw >= id, n = Math.max(4, Math.round((alongX ? id : iw) / 0.7));
  for (let i = 0; i < n; i++) {
    const o = -((alongX ? id : iw) / 2) + ((i + 0.5) * (alongX ? id : iw)) / n, c = i % 2 ? planks : new THREE.Color(planks).multiplyScalar(0.86).getHex();
    if (alongX) flat(iw, id / n, b.x, b.z + o, 0.09, c); else flat(iw / n, id, b.x + o, b.z, 0.09, c); // por encima del empedrado
  }
  // techo y vigas
  flat(iw, id, b.x, b.z, ceilY - 0.02, 0x5a3e26, true);
  for (let i = 1; i < 6; i++) {
    const o = -(alongX ? iw : id) / 2 + (i * (alongX ? iw : id)) / 6;
    if (alongX) m.box("solid", 0.22, 0.24, id, b.x + o, ceilY - 0.14, b.z, TIMBER); else m.box("solid", iw, 0.24, 0.22, b.x, ceilY - 0.14, b.z + o, TIMBER);
  }
  // zócalo interior de madera
  for (let dir = 0; dir < 4; dir++) {
    const span = dir % 2 === 0 ? iw : id, p = onFace(b.x, b.z, dir, 0, (dir % 2 === 0 ? b.d : b.w) / 2 - T - 0.02);
    m.box("solid", span, 0.3, 0.04, p.x, 0.15, p.z, TIMBER, RY[dir]!);
  }
  for (const p of interiorProps(b)) furnish(m, b, f, p, ceilY);
}

type Frame = ReturnType<typeof interiorFrame>;
function furnish(m: Merge, b: Building, f: Frame, p: ReturnType<typeof interiorProps>[number], ceilY: number) {
  const ry = f.ry, IRON = 0x2f3036, GOLD = 0xd9b13b;
  /** Caja en coordenadas locales: (u, v) centro en planta, y base, tamaños su × h × sv. */
  const box = (u: number, v: number, y: number, su: number, h: number, sv: number, c: number, g: "solid" | "glow" = "solid") => { const q = f.at(u, v); m.box(g, su, h, sv, q.x, y + h / 2, q.z, c, ry); };
  const cyl = (u: number, v: number, y: number, r: number, h: number, c: number, seg = 8) => { const q = f.at(u, v); m.cyl("solid", r, r, h, seg, q.x, y, q.z, c); };
  const { u, v, su, sv } = p;
  switch (p.kind) {
    case "counter": // mostrador de roble con tapa clara, libro de cuentas, balanza y velas
      box(u, v, 0, su, 1.0, sv, 0x5a3a22); box(u, v, 1.0, su + 0.15, 0.08, sv + 0.15, 0x8a6236);
      for (let k = -2; k <= 2; k++) box(u + k * (su / 5), v + sv / 2 + 0.01, 0.12, 0.1, 0.8, 0.04, TIMBER);
      box(u - 1.6, v, 1.08, 0.5, 0.06, 0.36, 0xe8dcc0); box(u - 1.6, v, 1.14, 0.48, 0.02, 0.34, 0x7a2f3a);
      cyl(u + 1.2, v, 1.08, 0.04, 0.4, GOLD); box(u + 1.2, v, 1.46, 0.6, 0.03, 0.03, GOLD);
      for (const s of [-1, 1]) cyl(u + 1.2 + s * 0.28, v, 1.24, 0.1, 0.03, GOLD, 10);
      for (const s of [-1, 1]) { cyl(u + s * su * 0.45, v, 1.08, 0.05, 0.22, 0xe9e2d0); box(u + s * su * 0.45, v, 1.3, 0.06, 0.1, 0.06, WARM, "glow"); }
      break;
    case "ledgers": // estantería con libros de colores
      box(u, v, 0, su, p.h, sv, TIMBER);
      for (let r = 0; r < 4; r++) {
        const y = 0.3 + r * 0.58; box(u, v + 0.03, y, su - 0.1, 0.05, sv - 0.05, 0x5a3e26);
        for (let k = 0; k < 9; k++) { const w = 0.16 + hash2(u + k, r) * 0.1, x = u - su / 2 + 0.2 + k * ((su - 0.4) / 8); box(x, v + 0.06, y + 0.05, w * 0.8, 0.3 + hash2(k, r + u) * 0.14, 0.3, [0x7a2f3a, 0x2c4a8a, 0x3f6b3a, 0x8a6a2b, 0x5a3a6a][(k + r) % 5]!); }
      }
      break;
    case "strongbox": box(u, v, 0, su, 0.7, sv, 0x4a3320); box(u, v, 0.7, su + 0.05, 0.12, sv + 0.05, 0x5a3e26); for (const s of [-0.45, 0, 0.45]) box(u + s * su, v + 0.01, 0, 0.06, 0.82, sv + 0.06, IRON); box(u, v + sv / 2 + 0.03, 0.45, 0.16, 0.18, 0.04, GOLD); break;
    case "chest": box(u, v, 0, su, 0.55, sv, 0x6b4a2b); box(u, v, 0.55, su, 0.15, sv, 0x7a5634); for (const s of [-1, 1]) box(u + s * su * 0.4, v, 0, 0.06, 0.72, sv + 0.04, IRON); break;
    case "barrels": for (const [du, dv] of [[-0.3, -0.3], [0.3, -0.3], [0, 0.3]] as const) { cyl(u + du * su / 1.4 * 1.4, v + dv * sv / 1.4 * 1.4, 0, 0.32, 0.85, 0x7a5a38, 10); cyl(u + du * su, v + dv * sv, 0.18, 0.335, 0.06, IRON, 10); cyl(u + du * su, v + dv * sv, 0.62, 0.335, 0.06, IRON, 10); } break;
    case "pelts": // mostrador del peletero con pieles dobladas
      box(u, v, 0, su, 0.9, sv, 0x5a3a22); box(u, v, 0.9, su + 0.1, 0.07, sv + 0.1, 0x8a6236);
      for (let k = 0; k < 4; k++) box(u, v - sv / 2 + 0.45 + k * 0.75, 0.97, su * 0.75, 0.08 + (k % 2) * 0.05, 0.6, [0x8a6e4e, 0x6e7279, 0xa0703c, 0x5a4636][k]!);
      break;
    case "hiderack": // bastidor con pieles tensadas en la pared
      box(u, v, 0, su * 0.3, p.h, 0.1, TIMBER); for (const s of [-1, 1]) box(u, v + s * sv / 2, 0, su * 0.3, p.h, 0.1, TIMBER);
      box(u, v, p.h - 0.1, su * 0.3, 0.1, sv, TIMBER);
      for (const s of [-1, 1]) box(u, v + s * sv / 4, 0.5, 0.06, 1.4, sv / 2 - 0.2, s > 0 ? 0x8a6e4e : 0x6e7279);
      break;
    case "table": { // mesa larga con bancos, jarras y un mapa
      box(u, v, 0.78, su, 0.08, sv, 0x8a6236);
      for (const a of [-1, 1]) for (const c of [-1, 1]) box(u + a * (su / 2 - 0.15), v + c * (sv / 2 - 0.2), 0, 0.12, 0.78, 0.12, TIMBER);
      for (const a of [-1, 1]) { box(u + a * (su / 2 + 0.35), v, 0.42, 0.34, 0.06, sv - 0.4, 0x7a5634); for (const c of [-1, 1]) box(u + a * (su / 2 + 0.35), v + c * (sv / 2 - 0.5), 0, 0.08, 0.42, 0.25, TIMBER); }
      box(u, v - 0.6, 0.86, 0.9, 0.01, 0.7, 0xe8dcc0); box(u + 0.1, v - 0.6, 0.87, 0.3, 0.01, 0.2, 0x8a6a2b);
      for (const k of [0.6, 1.4, -1.6]) { cyl(u + (k > 0 ? 0.35 : -0.3), v + k, 0.86, 0.07, 0.16, 0x9a8a72); }
      break;
    }
    case "board": // tablón de encargos con papeles clavados
      box(u, v, 0.8, 0.08, 1.4, sv, 0x7a5634); box(u, v, 0.75, 0.12, 0.08, sv + 0.1, TIMBER); box(u, v, 2.2, 0.12, 0.08, sv + 0.1, TIMBER);
      for (let k = 0; k < 7; k++) box(u + 0.05, v - sv / 2 + 0.3 + (k % 4) * 0.55 + (k > 3 ? 0.25 : 0), 1.0 + (k > 3 ? 0.55 : 0) + hash2(k, 3) * 0.15, 0.02, 0.36, 0.28, k % 3 ? 0xe8dcc0 : 0xd9c48a);
      break;
    case "hearth": { // chimenea de piedra con fuego y caldero
      box(u, v, 0, su, 1.3, sv, STONE); box(u, v, 1.3, su + 0.15, 0.15, sv + 0.3, STONE_D);
      const into = Math.sign(u) || 1; // el hogar se abre hacia el centro de la sala
      box(u - into * 0.4, v, 0.15, 0.25, 0.9, sv * 0.6, 0x1a1410); box(u - into * 0.35, v, 0.15, 0.2, 0.35, sv * 0.4, 0xff8a3a, "glow");
      box(u - into * 0.35, v, 0.4, 0.12, 0.25, sv * 0.25, 0xffc766, "glow");
      box(u, v, 1.45, su * 0.6, ceilY - 1.45, sv * 0.55, STONE_D);
      break;
    }
    case "rug": { const q = f.at(u, v); m.box("solid", su, 0.02, sv, q.x, 0.11, q.z, 0x7a2f3a, ry); m.box("solid", su - 0.4, 0.02, sv - 0.4, q.x, 0.115, q.z, 0xb08a3a, ry); m.box("solid", su - 0.6, 0.02, sv - 0.6, q.x, 0.12, q.z, 0x8a2f3a, ry); break; }
    case "gallery": { // galería alta sobre las estanterías, con barandilla y estandartes
      const y = ceilY - 2.8 - 0.1;
      box(u, v, y, su, 0.2, sv, 0x5a3e26);
      for (let k = 0; k <= 16; k++) box(u - su / 2 + (k * su) / 16, v + sv / 2 - 0.05, y + 0.2, 0.06, 0.8, 0.06, TIMBER);
      box(u, v + sv / 2 - 0.05, y + 1.0, su, 0.08, 0.1, TIMBER);
      for (const s of [-1, 1]) box(u + s * su * 0.42, v + sv / 2, 0, 0.22, y, 0.22, TIMBER); // pies derechos
      for (const s of [-1, 0, 1]) { const q = f.at(u + s * 3.2, v + sv / 2 + 0.06); m.put("solid", bannerGeo(1.1, 2.4), s === 0 ? GOLD : 0x7a2f3a, q.x, y - 0.05, q.z, ry); }
      break;
    }
    case "chandelier": { const q = f.at(u, v), y = ceilY - 1.6; m.cyl("solid", 0.03, 0.03, ceilY - y, 4, q.x, y, q.z, IRON); m.put("solid", new THREE.TorusGeometry(0.75, 0.05, 5, 12).rotateX(Math.PI / 2), IRON, q.x, y, q.z);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; m.box("solid", 0.08, 0.16, 0.08, q.x + Math.cos(a) * 0.75, y + 0.08, q.z + Math.sin(a) * 0.75, 0xe9e2d0); m.box("glow", 0.07, 0.12, 0.07, q.x + Math.cos(a) * 0.75, y + 0.22, q.z + Math.sin(a) * 0.75, WARM); }
      break; }
    case "workbench": // banco de trabajo con tornillo, tablas y herramientas
      box(u, v, 0.85, su, 0.1, sv, 0x8a6236);
      for (const a of [-1, 1]) for (const c of [-1, 1]) box(u + a * (su / 2 - 0.1), v + c * (sv / 2 - 0.1), 0, 0.12, 0.85, 0.12, TIMBER);
      box(u, v, 0.25, su - 0.2, 0.05, sv - 0.2, 0x6b4a2b);
      box(u + su / 2 - 0.25, v + 0.3, 0.95, 0.2, 0.18, 0.25, IRON); box(u - 0.4, v + 0.1, 0.95, 0.9, 0.04, 0.22, 0xc9a06a); box(u + 0.2, v + 0.15, 0.96, 0.35, 0.05, 0.08, IRON);
      box(u - su / 2 + 0.3, v, 0.95, 0.25, 0.12, 0.25, 0x7a5634);
      break;
    case "toolwall": // panel de herramientas colgadas
      box(u, v, 1.3, su, 0.9, 0.04, 0x6b4a2b);
      for (let k = 0; k < 6; k++) { const x = u - su / 2 + 0.3 + k * ((su - 0.6) / 5); box(x, v + 0.04, 1.45 + (k % 2) * 0.15, 0.05, 0.45, 0.04, TIMBER); box(x, v + 0.05, 1.75 + (k % 2) * 0.15, k % 3 ? 0.18 : 0.06, 0.1, 0.05, IRON); }
      break;
    case "anvil": cyl(u, v, 0, 0.25, 0.45, 0x5a3e26); box(u, v, 0.45, 0.7, 0.18, 0.28, IRON); box(u, v, 0.63, 0.5, 0.12, 0.22, 0x3b3f46); { const q = f.at(u + 0.4, v); m.cone("solid", 0.1, 0.25, 4, q.x, 0.66, q.z, 0x3b3f46, ry); } break;
    case "smithy": // fragua pequeña con fuelle y brasas
      box(u, v, 0, su, 0.9, sv, STONE); box(u, v, 0.9, su * 0.8, 0.12, sv * 0.8, 0x1a1410); box(u, v, 0.95, su * 0.6, 0.1, sv * 0.6, 0xff6a2a, "glow");
      box(u, v, 1.05, su * 0.5, ceilY - 1.05, sv * 0.4, STONE_D);
      box(u + su / 2 + 0.15, v, 0.7, 0.2, 0.35, 0.6, 0x5a3a22);
      break;
    case "shelf": // estante con tarros, rollos de tela y cajas
      box(u, v, 0, su, p.h, sv, TIMBER);
      for (let r = 0; r < 3; r++) { const y = 0.45 + r * 0.6; box(u - 0.05, v, y, su, 0.05, sv - 0.05, 0x5a3e26);
        for (let k = 0; k < 4; k++) { const vv = v - sv / 2 + 0.3 + k * ((sv - 0.6) / 3); if (k % 2) box(u - 0.05, vv, y + 0.05, 0.22, 0.22, 0.22, 0x8a6a4a); else cyl(u - 0.05, vv, y + 0.05, 0.09, 0.24, [0x6a8a9a, 0xb06a4a, 0x7a9a5a][(k + r) % 3]!); } }
      break;
    case "lantern": { const q = f.at(u, v), y = ceilY - 0.9; m.cyl("solid", 0.02, 0.02, ceilY - y, 4, q.x, y, q.z, IRON); m.box("solid", 0.3, 0.06, 0.3, q.x, y + 0.02, q.z, IRON); m.box("glow", 0.22, 0.3, 0.22, q.x, y - 0.25, q.z, WARM); m.box("solid", 0.32, 0.05, 0.32, q.x, y - 0.42, q.z, IRON); break; }
  }
}

// ---------- torres ----------
function visibleAngles(count: number, row: number) {
  // ángulos (polares en el plano xz) del semicírculo que mira a la cámara isométrica (+x,+z)
  const out: number[] = [], lo = -Math.PI / 4 + 0.12, hi = (3 * Math.PI) / 4 - 0.12;
  for (let k = 0; k < count; k++) out.push(lo + ((k + 0.5 + (row % 2 ? 0.25 : -0.1)) / count) * (hi - lo));
  return out;
}

export function tower(m: Merge, t: Tower, windows = true) {
  m.at(t.x, t.z);
  const style = t.style ?? "round", r = t.r, h = t.h, seg = style === "spire" ? 8 : 16;
  if (style === "square") return squareTower(m, t);
  m.cyl("solid", r * 1.0, r * 1.16, 1.5, seg, t.x, 0, t.z, STONE_D); // talud
  m.cyl("solid", r * 0.93, r, h - 1.4, seg, t.x, 1.4, t.z, STONE);
  for (let y = 5; y < h - 3; y += style === "spire" ? 8 : 5.5) m.cyl("solid", r * 0.99 + 0.14, r * 0.99 + 0.14, 0.34, seg, t.x, y, t.z, STONE_D);
  // matacanes: corbeles bajo el parapeto
  const topY = h - 1.2;
  const ring = style === "spire" ? r + 0.45 : r + 0.75;
  m.cyl("solid", ring, r * 0.93, 0.9, seg, t.x, topY - 0.9, t.z, STONE_D);
  if (style !== "spire") for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2; m.box("solid", 0.45, 0.8, 0.45, t.x + Math.cos(a) * (r + 0.25), topY - 1.0, t.z + Math.sin(a) * (r + 0.25), STONE_L);
  }
  m.cyl("solid", ring, ring, 1.0, seg, t.x, topY, t.z, STONE_L);
  // ventanas apuntadas encendidas en la cara visible
  if (windows) {
    let row = 0;
    for (let y = style === "spire" ? 7 : 4.5; y < topY - 3; y += style === "spire" ? 8 : 5.2, row++) {
      const cnt = style === "spire" ? 1 : r > 4 ? 3 : 2;
      for (const th of visibleAngles(cnt, row)) {
        const x = t.x + Math.cos(th) * (r * 0.97 + 0.03), z = t.z + Math.sin(th) * (r * 0.97 + 0.03), ry = Math.PI / 2 - th;
        const w = style === "spire" ? 0.7 : 1.0;
        m.put("solid", archGeo(w + 0.36, 2.1, 0.14), STONE_L, x, y, z, ry);
        m.put("glow", archGeo(w, 1.8, 0.14), WARM, x + Math.cos(th) * 0.06, y, z + Math.sin(th) * 0.06, ry);
      }
    }
  }
  // tejado acampanado con buhardillas y remate dorado
  const rh = style === "spire" ? r * 8 + 2 : style === "keep" ? r * 2.7 + 4 : r * 2.25 + 3;
  m.put("solid", flareConeGeo(r + (style === "spire" ? 0.5 : 1.0), rh, seg), t.roof, t.x, topY + 0.8, t.z);
  if (style === "keep") {
    for (const th of [-Math.PI / 4 + 0.1, Math.PI / 4 + 0.5, Math.PI / 2 + 0.3]) {
      const rr = (r + 0.8) * 0.78, x = t.x + Math.cos(th) * rr, z = t.z + Math.sin(th) * rr, y = topY + 1.6;
      m.box("solid", 1.2, 1.4, 1.2, x, y + 0.6, z, STONE, Math.PI / 2 - th);
      m.cone("solid", 1.0, 1.8, 4, x, y + 1.3, z, t.roof, Math.PI / 4 + Math.PI / 2 - th);
      const o = 0.62; m.box("glow", 0.5, 0.7, 0.1, x + Math.cos(th) * o, y + 0.6, z + Math.sin(th) * o, WARM, Math.PI / 2 - th);
    }
    // balcón intermedio con barandilla y garitas (bartizanas) en lo alto
    const by = h * 0.58; m.cyl("solid", r + 1.0, r + 0.85, 0.35, seg, t.x, by, t.z, STONE_D);
    for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; m.box("solid", 0.14, 0.9, 0.14, t.x + Math.cos(a) * (r + 0.9), by + 0.6, t.z + Math.sin(a) * (r + 0.9), STONE_L); }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4, rr = r + 0.45, x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr, y = topY - 3.2;
      m.cone("solid", 0.75, 1.5, 8, x, y - 1.2, z, STONE_D); m.cyl("solid", 0.8, 0.8, 2.0, 8, x, y + 0.2, z, STONE);
      m.cone("solid", 1.1, 2.4, 8, x, y + 2.1, z, t.roof);
    }
  }
  const fy = topY + 0.8 + rh;
  m.cyl("solid", 0.09, 0.09, 2.8, 5, t.x, fy - 0.2, t.z, 0x3a3a3e);
  m.put("solid", new THREE.SphereGeometry(0.3, 6, 5), 0xd9b13b, t.x, fy - 0.1, t.z);
  m.put("solid", pennantGeo(1.9, 1.0), style === "spire" ? 0xe0c040 : 0xb02a30, t.x, fy + 2.1, t.z);
}

function squareTower(m: Merge, t: Tower) {
  const s = t.r * 0.78, h = t.h, topY = h - 1;
  m.box("solid", s * 2 + 0.9, 1.4, s * 2 + 0.9, t.x, 0.7, t.z, STONE_D);
  m.box("solid", s * 2, h, s * 2, t.x, h / 2, t.z, STONE);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box("solid", 0.5, h, 0.5, t.x + sx * s, h / 2, t.z + sz * s, STONE_L);
  for (let y = 6; y < h - 2; y += 6) m.box("solid", s * 2 + 0.3, 0.3, s * 2 + 0.3, t.x, y, t.z, STONE_D);
  m.box("solid", s * 2 + 1.0, 1.0, s * 2 + 1.0, t.x, topY, t.z, STONE_D);
  for (const dir of [0, 1]) {
    const nx = dir === 1 ? 1 : 0, nz = dir === 0 ? 1 : 0;
    for (let y = 5; y < topY - 3; y += 5.5) for (const o of [-s * 0.45, s * 0.45]) {
      const x = t.x + nx * (s + 0.02) + (nz ? o : 0), z = t.z + nz * (s + 0.02) + (nx ? o : 0), ry = Math.atan2(nx, nz);
      m.put("solid", archGeo(1.3, 2.3, 0.14), STONE_L, x, y, z, ry);
      m.put("glow", archGeo(0.95, 1.95, 0.14), WARM, x + nx * 0.06, y, z + nz * 0.06, ry);
    }
  }
  const rh = s * 3.2 + 3;
  m.put("solid", hipGeo(s * 2 + 1.8, s * 2 + 1.8, rh, 0), t.roof, t.x, topY + 0.5, t.z);
  for (const sx of [-1, 1]) m.cone("solid", 0.55, 2.2, 4, t.x + sx * (s + 0.3), topY + 0.5, t.z + s + 0.3, t.roof);
  m.cyl("solid", 0.09, 0.09, 2.6, 5, t.x, topY + 0.5 + rh - 0.2, t.z, 0x3a3a3e);
  m.put("solid", pennantGeo(1.8, 0.95), 0xb02a30, t.x, topY + 0.5 + rh + 1.9, t.z);
}

// ---------- catedral ----------
/** Catedral gótica hueca: se entra por el portal sur (+z). Los muros son losas (se ven por fuera y por dentro), con arcadas,
 *  crucero, cabecera plana con gran vidriera (ante ella va la estatua de la diosa, que se añade aparte), vidrieras pasantes y mobiliario. Medidas en `CATHEDRAL`. */
export function cathedral(m: Merge, b: Building) {
  m.at(b.x, b.z);
  const C = CATHEDRAL, X = b.x, Z = b.z, T = C.t, HW = C.hw, ND = C.hd, NV = C.nave, E = Math.PI / 2;
  const AH = C.aisleH, AW = AH + 0.4, NH = C.naveH, TH = C.transH, TA = C.transHw, TD = C.transHd;
  const stoneW = b.wall, slate = b.roof, GOLD = 0xd9b13b, IRON = 0x2a2a2e, FLAME = 0xffc766;
  const towerN = C.towerZ - C.tower / 2, fz = Z + ND;
  const bays = [-13.6, -10.8, -8.0, -5.2, 5.2, 8.0]; // centros de los tramos (entre pilares)
  /** Muro paralelo a z (en lx) o a x (en lz), de y0 a y1. */
  const wallX = (lx: number, z0: number, z1: number, y0: number, y1: number, color = stoneW) =>
    m.box("solid", T, y1 - y0, z1 - z0, X + lx, (y0 + y1) / 2, Z + (z0 + z1) / 2, color);
  const wallZ = (lz: number, xa: number, xb: number, y0: number, y1: number, color = stoneW) =>
    m.box("solid", Math.abs(xb - xa), y1 - y0, T, X + (xa + xb) / 2, (y0 + y1) / 2, Z + lz, color);
  /** Vidriera que atraviesa el muro de normal (nx,nz): luce por fuera y por dentro. */
  const lancet = (lx: number, y: number, lz: number, nx: number, nz: number, w: number, h: number, color: number, depth = T) => {
    const ry = Math.atan2(nx, nz);
    m.put("solid", archGeo(w + 0.4, h + 0.4, depth + 0.1), STONE_L, X + lx, y - 0.2, Z + lz, ry);
    m.put("glow", archGeo(w, h, depth + 0.18), color, X + lx, y, Z + lz, ry);
    m.box("solid", 0.07, h * 0.72, depth + 0.24, X + lx, y + h * 0.36, Z + lz, STONE_L, ry); // parteluz
  };
  const tile = (w: number, d: number, lx: number, lz: number, color: number, y = 0.1) => m.put("solid", new THREE.PlaneGeometry(w, d), color, X + lx, y, Z + lz, 0, -E);
  const flame = (x: number, y: number, z: number, s = 0.14) => { m.box("solid", s * 0.6, 0.22, s * 0.6, x, y - 0.11, z, 0xe9e2d0); m.box("glow", s, s * 1.7, s, x, y + s * 0.85, z, FLAME); };

  // --- suelo: damero de mármol, alfombra central y presbiterio ---
  const tw = ((HW - T) * 2) / 8, td = ((ND - T) * 2) / 16;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) tile(tw, td, -HW + T + (i + 0.5) * tw, -ND + T + (j + 0.5) * td, (i + j) % 2 ? 0xd6cfbf : 0x9d968b);
  tile(4.4, T + 1.2, 0, ND - T / 2 + 0.3, 0xbdb5a4, 0.09); // umbral
  for (const s of [-1, 1]) tile(TA - HW, (TD - T) * 2, s * (HW + TA - 2 * T) / 2, 0, 0xb9b2a2);
  const SZ = Z + C.statueZ, carpet0 = C.statueZ + 3.9, carpetL = ND - T - carpet0;
  tile(2.2, carpetL, 0, carpet0 + carpetL / 2, 0x8a2630, 0.115);
  for (const s of [-1, 1]) tile(0.14, carpetL, s * 1.03, carpet0 + carpetL / 2, GOLD, 0.12);
  m.put("solid", new THREE.CircleGeometry(4.05, 24), 0xe2dccd, X, 0.125, SZ, 0, -E); // estrado de la diosa
  m.put("solid", new THREE.RingGeometry(3.75, 3.95, 24), GOLD, X, 0.135, SZ, 0, -E);

  // --- naves: muros laterales, arcadas, claristorio, tejados, contrafuertes y arbotantes ---
  for (const s of [-1, 1]) {
    const wx = s * (HW - T / 2), segs = [[-ND, -TD], [TD, towerN]] as const;
    for (const [z0, z1] of segs) {
      wallX(wx, z0, z1, 0, AW);
      m.box("solid", 0.3, 0.9, z1 - z0, X + s * (HW + 0.1), 0.45, Z + (z0 + z1) / 2, STONE_D); // zócalo exterior
      m.box("solid", 0.5, 0.3, z1 - z0 + 0.3, X + s * (HW + 0.3), AW - 0.05, Z + (z0 + z1) / 2, STONE_D); // cornisa
      // tejado a un agua de la nave lateral
      const run = 3.9, rise = 2.6, ang = Math.atan2(rise, run), zr0 = z0 < 0 ? z0 - 0.3 : z0;
      m.box("solid", Math.hypot(run, rise) + 0.3, 0.3, z1 - zr0, X + s * (NV + run / 2 - 0.1), AW + rise / 2 - 0.45, Z + (zr0 + z1) / 2, slate, 0, 0, -s * ang);
      // imposta interior sobre las arcadas
      for (const y of [7.5, 10.8]) m.box("solid", 0.14, 0.22, z1 - z0, X + s * (NV - T / 2 - 0.05), y, Z + (z0 + z1) / 2, STONE_L);
    }
    bays.forEach((lz, i) => {
      const col = GLASS[(i + (s > 0 ? 1 : 0)) % 5]!;
      m.put("solid", archWallGeo(2.8, NH, T, 2.0, 6.8), stoneW, X + s * NV, 0, Z + lz, E); // arcada + muro del claristorio
      lancet(wx, 1.9, lz, s, 0, 1.05, 4.3, col);
      lancet(s * NV, 11.3, lz, s, 0, 1.15, 3.3, col);
    });
    wallX(s * NV, -TD, TD, TH, NH); // la nave sigue por encima del crucero
    for (const lz of [-ND + 0.45, ...C.piers.filter(p => Math.abs(p) > TD + 0.1)]) {
      const x = X + s * (HW + 0.35), z = Z + lz;
      m.box("solid", 1.0, AW + 1.4, 0.9, x, (AW + 1.4) / 2, z, STONE);
      m.box("solid", 1.2, 0.9, 1.1, x, 0.45, z, STONE_D);
      m.box("solid", 0.7, 1.5, 0.7, x, AW + 2.1, z, STONE_L);
      m.cone("solid", 0.6, 2.2, 4, x, AW + 2.85, z, STONE_L, Math.PI / 4);
      const run = 3.2, rise = 3.0, ang = Math.atan2(rise, run);
      m.box("solid", Math.hypot(run, rise), 0.28, 0.34, X + s * (NV + T / 2 + run / 2), AW + 2.4, z, STONE, 0, 0, -s * ang); // arbotante
    }
    // pilares: basa, fuste, capitel y columnilla hasta la cubierta
    for (const pz of C.piers) {
      const big = Math.abs(pz) < TD + 0.1, r = big ? 0.5 : 0.4, x = X + s * (NV - 0.3), z = Z + pz;
      m.box("solid", r * 2 + 0.3, 0.45, r * 2 + 0.3, x, 0.22, z, STONE_D);
      m.cyl("solid", r * 0.86, r, 5.2, 8, x, 0.4, z, STONE_L);
      m.box("solid", r * 2 + 0.25, 0.32, r * 2 + 0.25, x, 5.56, z, STONE_D);
      m.cyl("solid", 0.15, 0.15, NH - 6.1, 6, X + s * (NV - T / 2 - 0.1), 5.7, z, STONE_L);
    }
    // crucero: arco hacia el brazo, hastial con rosetón y vidrieras, muros del brazo
    m.put("solid", archWallGeo(2 * TD, TH, T, 6.4, 12.4), stoneW, X + s * NV, 0, Z, E);
    wallX(s * (TA - T / 2), -TD, TD, 0, TH);
    for (const sz of [-1, 1]) {
      wallZ(sz * (TD - T / 2), s * (HW - T), s * TA, 0, AW);
      wallZ(sz * (TD - T / 2), s * (NV + T / 2), s * TA, AW, TH);
      m.box("solid", 0.8, TH + 0.6, 0.8, X + s * (TA + 0.05), (TH + 0.6) / 2, Z + sz * (TD + 0.05), STONE_L);
      m.cone("solid", 0.55, 2.0, 4, X + s * (TA + 0.05), TH + 0.6, Z + sz * (TD + 0.05), STONE_L, Math.PI / 4);
      lancet(s * (TA - T / 2), 1.6, sz * 1.9, s, 0, 1.0, 4.4, GLASS[sz > 0 ? 1 : 0]!);
    }
    rose(m, X + s * (TA + 0.04), 9.7, Z, s, 0, 1.9);
    rose(m, X + s * (TA - T - 0.04), 9.7, Z, -s, 0, 1.9);
    // capilla del brazo: mesa de ofrendas con velas
    const ax = X + s * (TA - T - 0.55);
    m.box("solid", 0.9, 0.9, 2.0, ax, 0.55, Z, STONE_L); m.box("solid", 1.05, 0.14, 2.2, ax, 1.07, Z, 0xe2dccd);
    m.box("solid", 0.95, 0.5, 1.2, ax + s * 0.02, 0.75, Z, s > 0 ? 0x2c4a8a : 0x7a2f3a);
    for (let k = -2; k <= 2; k++) flame(ax, 1.36 + (2 - Math.abs(k)) * 0.09, Z + k * 0.4, 0.1);
    // testero norte de la nave lateral
    wallZ(-ND + T / 2, s * (NV + T / 2), s * HW, 0, 11.4);
    // estandartes a los lados de la gran vidriera
    m.put("solid", bannerGeo(0.8, 5.2), s > 0 ? 0x2c4a8a : 0x7a2f3a, X + s * 3.85, 12.0, Z - ND + T + 0.07);
    m.box("solid", 1.0, 0.08, 0.08, X + s * 3.85, 12.02, Z - ND + T + 0.07, GOLD);
    // candelabros ante la diosa
    const cx = X + s * 3.5, cz = SZ + 4.3;
    m.cyl("solid", 0.32, 0.4, 0.14, 8, cx, 0.1, cz, IRON); m.cyl("solid", 0.06, 0.06, 1.9, 6, cx, 0.2, cz, GOLD);
    m.box("solid", 0.9, 0.06, 0.06, cx, 1.9, cz, GOLD); m.box("solid", 0.06, 0.06, 0.9, cx, 1.9, cz, GOLD);
    for (const [ox, oz, oy] of [[0, 0, 0.3], [-0.42, 0, 0], [0.42, 0, 0], [0, -0.42, 0], [0, 0.42, 0]] as const) flame(cx + ox, 2.2 + oy, cz + oz, 0.1);
  }
  // cabecera plana: testero con gran vidriera (tres lancetas y rosetón) tras la diosa, y grada de piedra al pie
  wallZ(-ND + T / 2, -(NV + T / 2), NV + T / 2, 0, NH);
  lancet(0, 3.2, -ND + T / 2, 0, -1, 1.5, 7.6, GLASS[2]!);
  for (const s of [-1, 1]) lancet(s * 2.0, 3.2, -ND + T / 2, 0, -1, 1.1, 6.2, GLASS[s > 0 ? 0 : 3]!);
  rose(m, X, 13.1, Z - ND - 0.04, 0, -1, 1.45);
  rose(m, X, 13.1, Z - ND + T + 0.04, 0, 1, 1.45);
  m.box("solid", 2 * (HW - T), 0.6, 0.5, X, 0.3, Z - ND + T + 0.25, STONE_D);
  // arcos fajones del crucero
  for (const sz of [-1, 1]) m.put("solid", archWallGeo(2 * NV - T, NH, 0.5, 8.0, 13.2), stoneW, X, 0, Z + sz * TD);
  // cubiertas: nave y crucero (su cara inferior hace de techo), artesonado y vigas vistas
  m.prism(2 * NV, b.d, 6.2, 0.9, X, NH, Z, slate, false, 0); // sin vuelo: el hastial queda tras las torres
  tileRows(m, 2 * NV, b.d, 6.2, 0.9, X, NH, Z, slate, false);
  ridge(m, b.d, 6.2, X, NH, Z, slate, false);
  m.prism(2 * TD, 2 * TA, 5.2, 0.7, X, TH, Z, slate, true, 0.5);
  tileRows(m, 2 * TD, 2 * TA, 5.2, 0.7, X, TH, Z, slate, true);
  m.put("solid", new THREE.PlaneGeometry(2 * NV - T, 2 * (ND - T)), 0x7a5a3a, X, NH - 0.04, Z, 0, E);
  m.put("solid", new THREE.PlaneGeometry(2 * (TA - T), 2 * (TD - T)), 0x7a5a3a, X, TH - 0.04, Z, 0, E);
  for (const lz of [-12.2, -9.4, -6.6, 6.6, 9.3]) m.box("solid", 2 * NV - T, 0.34, 0.3, X, NH - 0.25, Z + lz, TIMBER);
  for (const lx of [-8.2, -5.4, 5.4, 8.2]) m.box("solid", 0.3, 0.3, 2 * (TD - T), X + lx, TH - 0.22, Z, TIMBER);
  // flecha del crucero
  m.cyl("solid", 2.2, 2.6, 2.0, 8, X, NH + 4.6, Z, stoneW);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; m.box("glow", 0.5, 1.1, 0.1, X + Math.sin(a) * 2.42, NH + 5.7, Z + Math.cos(a) * 2.42, WARM, a); }
  m.cone("solid", 2.8, 10.5, 8, X, NH + 6.4, Z, slate);
  m.cyl("solid", 0.1, 0.1, 3, 5, X, NH + 16.6, Z, GOLD); m.box("solid", 1.2, 0.16, 0.16, X, NH + 18.4, Z, GOLD);

  // --- fachada (+z): torres con campanario, portal abocinado con gablete, rosetón y tribuna ---
  for (const s of [-1, 1]) {
    const tx = X + s * C.towerX, tz = Z + C.towerZ, th = NH + 15, w = C.tower;
    m.box("solid", w, th, w, tx, th / 2, tz, stoneW);
    m.box("solid", w + 0.5, 1.0, w + 0.5, tx, 0.5, tz + 0.0, STONE_D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box("solid", 0.6, th, 0.6, tx + sx * w / 2, th / 2, tz + sz * w / 2, STONE_L);
    for (const y of [8.6, NH + 0.2, NH + 5.6]) m.box("solid", w + 0.5, 0.4, w + 0.5, tx, y, tz, STONE_D);
    // vanos del campanario (las cuatro caras) con lamas
    for (const [nx, nzz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) for (const o of [-1.15, 1.15]) {
      const px = tx + nx * (w / 2 + 0.03) + (nzz ? o : 0), pz = tz + nzz * (w / 2 + 0.03) + (nx ? o : 0), ry = Math.atan2(nx, nzz);
      m.put("solid", archGeo(1.3, 4.6, 0.2), STONE_L, px, th - 6.8, pz, ry);
      m.put("solid", archGeo(0.9, 4.3, 0.24), 0x23283a, px, th - 6.8, pz, ry);
      for (let k = 0; k < 4; k++) m.box("solid", 0.9, 0.08, 0.34, px, th - 6.3 + k * 0.85, pz, 0x4a4036, ry, 0.5);
    }
    // vidrieras de la torre en las caras exteriores
    for (const [nx, nzz] of [[0, 1], [s, 0]] as const) {
      const px = tx + nx * (w / 2 + 0.03), pz = tz + nzz * (w / 2 + 0.03), ry = Math.atan2(nx, nzz);
      for (const [y, h, g] of [[2.6, 3.6, 0], [9.6, 4.2, 2], [NH + 1.2, 3.2, 4]] as const) {
        m.put("solid", archGeo(1.3, h + 0.4, 0.2), STONE_L, px, y - 0.2, pz, ry);
        m.put("glow", archGeo(0.9, h, 0.26), GLASS[(g + (s > 0 ? 1 : 0)) % 5]!, px, y, pz, ry);
      }
    }
    // chapitel con pináculos, gabletes y remate dorado
    m.cyl("solid", w / 2 + 0.3, w / 2 + 0.3, 0.7, 4, tx, th, tz, STONE_D, Math.PI / 4);
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { m.box("solid", 0.7, 1.4, 0.7, tx + px * w / 2, th + 1.2, tz + pz * w / 2, STONE_L); m.cone("solid", 0.55, 3.0, 4, tx + px * w / 2, th + 1.9, tz + pz * w / 2, STONE_L, Math.PI / 4); }
    for (const [nx, nzz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) m.cone("solid", 1.3, 3.2, 4, tx + nx * (w / 2 - 0.9), th + 0.6, tz + nzz * (w / 2 - 0.9), slate, Math.PI / 4);
    m.cone("solid", w * 0.74, 16, 4, tx, th + 0.6, tz, slate, Math.PI / 4);
    m.cyl("solid", 0.11, 0.11, 3.2, 5, tx, th + 16.2, tz, GOLD); m.box("solid", 1.4, 0.18, 0.18, tx, th + 18.4, tz, GOLD);
    m.put("solid", new THREE.SphereGeometry(0.32, 6, 5), GOLD, tx, th + 16.6, tz);
    // hojas del portón, abiertas hacia dentro, con herrajes
    const lx = X + s * (C.door / 2 + 0.36), lz = fz - T - 0.86;
    m.box("solid", 0.14, 6.5, 1.7, lx, 3.25, lz, DOOR, s * 0.08);
    for (const y of [1.2, 3.2, 5.2]) m.box("solid", 0.18, 0.14, 1.5, lx, y, lz, IRON, s * 0.08);
    // braseros del atrio
    const bx = X + s * 2.9, bz = fz + 1.25;
    m.cyl("solid", 0.3, 0.42, 1.1, 6, bx, 0, bz, STONE_D); m.cyl("solid", 0.5, 0.3, 0.3, 8, bx, 1.1, bz, IRON); m.box("glow", 0.5, 0.4, 0.5, bx, 1.55, bz, 0xff9a3a);
    // tubos del órgano en la tribuna
    for (let k = 0; k < 4; k++) m.cyl("solid", 0.11, 0.11, 2.4 + k * 0.5, 6, X + s * (0.75 + k * 0.36), 8.75, fz - T - 0.4, GOLD);
  }
  // paño central con el hueco del portal, arquivoltas, gablete y escalinata
  const gap = 2 * (C.towerX - C.tower / 2);
  m.put("solid", archWallGeo(gap + 0.1, NH, T, C.door, 6.8), stoneW, X, 0, fz - T / 2);
  m.put("solid", archWallGeo(7.4, 8.6, 0.5, 3.6, 7.0), STONE_L, X, 0, fz + 0.45);
  m.put("solid", archWallGeo(5.4, 8.1, 0.3, 4.2, 7.5), STONE_D, X, 0, fz + 0.82);
  m.prism(7.4, 0.5, 2.2, 0.2, X, 8.6, fz + 0.45, STONE_L, false, 0.0);
  m.put("glow", new THREE.CircleGeometry(0.55, 10), GLASS[2]!, X, 9.45, fz + 0.72);
  m.cyl("solid", 0.07, 0.07, 1.2, 5, X, 10.8, fz + 0.45, GOLD); m.box("solid", 0.7, 0.12, 0.12, X, 11.6, fz + 0.45, GOLD);
  for (const s of [-1, 1]) { // columnillas del portal y nichos con figuras
    for (const o of [2.05, 2.5]) { m.cyl("solid", 0.13, 0.15, 5.2, 6, X + s * o, 0.3, fz + 0.9 - (o - 2.05) * 0.6, STONE); m.box("solid", 0.4, 0.3, 0.4, X + s * o, 0.15, fz + 0.9 - (o - 2.05) * 0.6, STONE_D); }
    m.box("solid", 0.5, 1.7, 0.3, X + s * 3.2, 9.9, fz + 0.3, STONE_D); m.cone("solid", 0.36, 0.7, 4, X + s * 3.2, 10.75, fz + 0.3, STONE_L, Math.PI / 4);
  }
  // hastial de piedra entre las torres, con tres lancetas y remate
  m.box("solid", gap + 0.1, 6.5, 0.3, X, NH + 3.25, fz + 0.3, stoneW);
  m.box("solid", gap + 0.3, 0.35, 0.5, X, NH + 0.1, fz + 0.3, STONE_D); m.box("solid", gap + 0.3, 0.35, 0.5, X, NH + 6.5, fz + 0.3, STONE_D);
  for (const o of [-1.2, 0, 1.2]) { m.put("solid", archGeo(0.9, o ? 3.4 : 4.2, 0.2), STONE_L, X + o, NH + 1.0, fz + 0.44); m.put("glow", archGeo(0.56, o ? 3.0 : 3.8, 0.24), GLASS[o ? 0 : 2]!, X + o, NH + 1.2, fz + 0.44); }
  rose(m, X, 13.0, fz + 0.26, 0, 1, 1.9);
  rose(m, X, 13.0, fz - T - 0.04, 0, -1, 1.9);
  m.box("solid", 5.6, 0.12, 1.4, X, 0.06, fz + 1.2, STONE_L); m.box("solid", 9.4, 0.07, 3.6, X, 0.035, fz + 2.0, 0xbdb5a4);
  // tribuna del órgano sobre la entrada
  const lz0 = Z + towerN, ld = ND - T - towerN;
  m.box("solid", gap, 0.35, ld, X, 8.55, lz0 + ld / 2, TIMBER);
  m.box("solid", gap, 0.9, 0.12, X, 9.15, lz0 + 0.06, WOOD);
  for (let k = -3; k <= 3; k++) m.box("solid", 0.1, 1.0, 0.16, X + k * 0.68, 9.2, lz0 + 0.06, TIMBER);
  m.put("solid", archWallGeo(gap, 8.4, 0.3, 3.6, 6.9), STONE_L, X, 0, lz0 + 0.15);

  // --- bancos a ambos lados del pasillo central ---
  const P = C.pews, pl = P.x1 - P.x0;
  for (let k = 0; k < P.n; k++) for (const s of [-1, 1]) {
    const x = X + s * (P.x0 + P.x1) / 2, z = Z + P.z0 + k * P.step;
    m.box("solid", pl, 0.1, 0.5, x, 0.5, z, WOOD); m.box("solid", pl, 0.8, 0.09, x, 0.75, z + 0.27, WOOD);
    m.box("solid", pl - 0.2, 0.08, 0.2, x, 0.2, z - 0.42, TIMBER); // reclinatorio
    for (const e of [-1, 1]) m.box("solid", 0.1, 1.05, 0.66, x + e * pl / 2, 0.58, z + 0.02, TIMBER);
  }
  // --- lámparas de corona ---
  for (const [lz, top] of [[6.6, NH], [0, TH], [-5.4, NH]] as const) {
    const y = 8.4, z = Z + lz;
    m.cyl("solid", 0.035, 0.035, top - y, 4, X, y, z, IRON);
    m.put("solid", new THREE.TorusGeometry(1.15, 0.07, 5, 14).rotateX(E), IRON, X, y, z);
    m.put("solid", new THREE.TorusGeometry(0.6, 0.05, 5, 10).rotateX(E), IRON, X, y + 0.5, z);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; m.box("solid", 0.04, 0.04, 2.3, X, y + 0.02, z, IRON, a); }
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; flame(X + Math.cos(a) * 1.15, y + 0.3, z + Math.sin(a) * 1.15, 0.11); }
  }
  return { top: NH + 18.4 };
}

/** Rosetón: aro de piedra, gajos de vidrio de colores y radios. (nx,nz) = normal de la cara. */
function rose(m: Merge, x: number, y: number, z: number, nx: number, nz: number, r: number) {
  const ry = Math.atan2(nx, nz);
  const ring = new THREE.CylinderGeometry(r + 0.35, r + 0.35, 0.22, 20); ring.rotateX(Math.PI / 2);
  m.put("solid", ring, STONE_L, x, y, z, ry);
  const wedges = 12, nxn = nx, nzn = nz;
  for (let k = 0; k < wedges; k++) {
    const g = new THREE.CircleGeometry(r, 2, (k / wedges) * Math.PI * 2, (1 / wedges) * Math.PI * 2);
    m.put("glow", g, GLASS[k % 5]!, x + nxn * 0.13, y, z + nzn * 0.13, ry);
  }
  const hub = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 8); hub.rotateX(Math.PI / 2);
  m.put("solid", hub, STONE_L, x + nxn * 0.16, y, z + nzn * 0.16, ry);
  for (let k = 0; k < 6; k++) m.box("solid", r * 2, 0.12, 0.1, x + nxn * 0.17, y, z + nzn * 0.17, STONE_L, ry, 0, (k / 6) * Math.PI);
}

// ---------- gran salón del castillo ----------
export function greatHall(m: Merge, h: { x: number; z: number; w: number; d: number; h: number }) {
  m.at(h.x, h.z);
  const sz = h.z + h.d / 2, nzp = h.z - h.d / 2, ex = h.x + h.w / 2, WALL = 0xd0c4aa, SLATE = 0x39414f;
  const T = HALL.wallT, F = HALL.frontT, gap = HALL.door / 2, top = h.h + 0.7;
  // muros huecos (por dentro está el salón del trono): fondo, laterales y fachada con el arco de la puerta
  m.box("solid", h.w, top, T, h.x, top / 2, nzp + T / 2, WALL);
  for (const s of [-1, 1]) m.box("solid", T, top, h.d - T - F, h.x + s * (h.w / 2 - T / 2), top / 2, h.z + (T - F) / 2, WALL);
  m.put("solid", archWallGeo(h.w, top, F, HALL.door, HALL.doorH), WALL, h.x, 0, sz - F / 2);
  m.box("solid", h.w + 0.5, 0.6, h.d + 0.5, h.x, h.h + 0.4, h.z, STONE_D); // cornisa (por dentro, el techo)
  // zócalo y basamento solo por fuera (y abiertos en la puerta)
  for (const [w, hh, y, c] of [[0.4, 0.7, 0.35, STONE_D], [0.15, 1.8, 1.3, 0xb4a88f]] as const) {
    m.box("solid", h.w + w * 2, hh, w, h.x, y, nzp - w / 2, c);
    for (const s of [-1, 1]) {
      m.box("solid", w, hh, h.d + w * 2, h.x + s * (h.w / 2 + w / 2), y, h.z, c);
      const a0 = gap + 0.1, a1 = h.w / 2 + w; m.box("solid", a1 - a0, hh, w, h.x + s * (a0 + a1) / 2, y, sz + w / 2, c);
    }
  }
  const bays = 9, step = (h.w - 6) / (bays - 1);
  for (let i = 0; i < bays; i++) {
    const x = h.x - h.w / 2 + 3 + i * step, warm = i % 3 === 1 ? 0xffb347 : WARM;
    for (const [s, zf] of [[1, sz], [-1, nzp]] as const) {
      const ry = s > 0 ? 0 : Math.PI;
      m.put("solid", archGeo(2.6, 8.4, 0.3), STONE_L, x, 2.6, zf + s * 0.05, ry);
      m.put("glow", archGeo(2.0, 7.8, 0.3), warm, x, 2.6, zf + s * 0.12, ry);
      // la misma vidriera vista desde dentro (las del sur junto a la puerta del castillo quedan tapadas por ella)
      if (!(s > 0 && Math.abs(x - h.x) < 11)) {
        const wi = zf - s * ((s > 0 ? F : T) + 0.04);
        m.put("solid", archGeo(2.6, 8.4, 0.12), STONE_L, x, 2.6, wi, ry); m.put("glow", archGeo(2.0, 7.8, 0.14), i % 2 ? 0xffd9a0 : 0xc8e0ff, x, 2.6, wi - s * 0.04, ry);
      }
      m.box("solid", 0.1, 5.6, 0.1, x, 4.9, zf + s * 0.2, STONE_L); m.box("solid", 2.0, 0.1, 0.1, x, 6.6, zf + s * 0.2, STONE_L); m.box("solid", 2.0, 0.1, 0.1, x, 4.4, zf + s * 0.2, STONE_L);
      if (s > 0 && i % 2 === 0) m.put("solid", bannerGeo(1.1, 3.6), i % 4 === 0 ? 0xb02a30 : 0x2c4a8a, x + step / 2, 11.4, zf + 0.3);
    }
    if (i < bays - 1) for (const [s, zf] of [[1, sz], [-1, nzp]] as const) {
      const bx = x + step / 2;
      if (s > 0 && Math.abs(bx - h.x) < 11) continue; // la puerta del castillo tapa la fachada: aquí estorbarían el paso
      m.box("solid", 1.2, h.h - 1, 1.0, bx, h.h / 2 + 0.2, zf + s * 0.5, STONE);
      m.box("solid", 0.8, 1.6, 0.8, bx, h.h + 1.4, zf + s * 0.45, STONE);
      m.cone("solid", 0.6, 1.8, 4, bx, h.h + 2.2, zf + s * 0.45, STONE_L, Math.PI / 4);
    }
  }
  // tejado de pizarra, empinado, con cresta, lucernarios y flecha central
  const rh = 8.4;
  m.prism(h.d, h.w, rh, 0.9, h.x, h.h + 0.7, h.z, SLATE, true, 0.3);
  tileRows(m, h.d, h.w, rh, 0.9, h.x, h.h + 0.7, h.z, SLATE, true);
  m.box("solid", h.w + 0.8, 0.3, 0.5, h.x, h.h + 0.7 + rh + 0.05, h.z, 0xd9b13b);
  for (let i = 0; i < 5; i++) { // lucernarios en el faldón sur
    const x = h.x - h.w / 2 + 5 + i * ((h.w - 10) / 4), S = h.d / 2 + 0.9, ys = rh * (1 - 0.46), zz = h.z + S * 0.46;
    m.box("solid", 2.0, 2.2, 1.6, x, h.h + 0.7 + ys, zz, WALL);
    m.prism(2.0, 1.6, 1.3, 0.3, x, h.h + 0.7 + ys + 1.1, zz, SLATE, false, 0.3);
    m.put("solid", archGeo(1.3, 1.7, 0.1), STONE_L, x, h.h + 0.7 + ys - 0.7, zz + 0.82, 0);
    m.put("glow", archGeo(0.95, 1.4, 0.1), WARM, x, h.h + 0.7 + ys - 0.7, zz + 0.88, 0);
  }
  const fy = h.h + 0.7 + rh;
  m.cyl("solid", 1.3, 1.5, 2.2, 8, h.x, fy - 1.2, h.z, WALL);
  m.cone("solid", 1.9, 9.5, 8, h.x, fy + 0.9, h.z, 0x2f4a6b);
  m.cyl("solid", 0.08, 0.08, 2.6, 5, h.x, fy + 10, h.z, 0xd9b13b);
  // hastial este con rosetón y vidrieras
  const gx = ex + 0.3 + 0.05;
  rose(m, gx, h.h + 4.2, h.z, 1, 0, 2.3);
  for (const o of [-3.2, 3.2]) {
    m.put("solid", archGeo(1.5, 5.8, 0.3), STONE_L, gx, 2.6, h.z + o, Math.PI / 2); m.put("glow", archGeo(1.1, 5.4, 0.3), WARM, gx + 0.08, 2.6, h.z + o, Math.PI / 2);
  }
  m.put("solid", archGeo(2.4, 7.4, 0.3), STONE_L, gx - 0.2, 2.4, h.z, Math.PI / 2);
  m.put("glow", archGeo(1.9, 6.9, 0.3), 0xffc24d, gx - 0.1, 2.4, h.z, Math.PI / 2);
  // vidriera grande sobre el pórtico, en el faldón del hall
  m.put("solid", archGeo(3.4, 6.4, 0.3), STONE_L, h.x, h.h - 2.0, sz + 0.06, 0);
  m.put("glow", archGeo(2.8, 5.9, 0.3), 0xffc24d, h.x, h.h - 2.0, sz + 0.14, 0);
}

// ---------- puertas (ciudad y castillo) ----------
/** Puerta con arco apuntado, almenas, rastrillo y estandartes. `nx,nz` = normal exterior; ancho a lo largo de la tangente. */
export function gatehouse(m: Merge, cx: number, cz: number, nx: number, nz: number, opts: { width: number; height: number; depth: number; hole: number; holeH: number; baseY?: number }) {
  m.at(cx, cz);
  const { width: W, height: H, depth: D, hole, holeH } = opts, y0 = opts.baseY ?? 0, ry = Math.atan2(nx, nz), tx = nz, tz = -nx;
  m.put("solid", archWallGeo(W, H, D, hole, holeH), STONE, cx, y0, cz, ry);
  m.box("solid", W + 0.4, 0.8, D + 0.8, cx, y0 + H, cz, STONE_D, ry);
  // matacanes + almenas en ambas caras
  const n = Math.floor(W / 1.7);
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    const along = (i - (n - 1) / 2) * (W / n), px = cx + tx * along + nx * s * (D / 2 + 0.1), pz = cz + tz * along + nz * s * (D / 2 + 0.1);
    m.box("solid", 0.55, 0.7, 0.55, px, y0 + H - 0.6, pz, STONE_L);
    m.box("solid", 0.9, 1.2, 0.5, px, y0 + H + 1.0, pz, STONE, ry);
  }
  // rastrillo alzado dentro del arco
  const gx = cx + nx * (D / 2 - 0.6), gz = cz + nz * (D / 2 - 0.6);
  for (let k = -4; k <= 4; k++) m.box("solid", 0.14, 2.6, 0.14, gx + tx * k * (hole / 9.5), y0 + holeH - 1.5, gz + tz * k * (hole / 9.5), 0x2a2a2e);
  m.box("solid", hole * 0.9, 0.16, 0.2, gx, y0 + holeH - 1.2, gz, 0x2a2a2e, ry); m.box("solid", hole * 0.9, 0.16, 0.2, gx, y0 + holeH - 2.4, gz, 0x2a2a2e, ry);
  // ventanas encima del arco y estandartes
  const wy = y0 + holeH + 1.2;
  if (H - holeH > 3.4) for (const o of [-2.2, 0, 2.2]) {
    const px = cx + tx * o + nx * (D / 2 + 0.03), pz = cz + tz * o + nz * (D / 2 + 0.03);
    m.put("solid", archGeo(1.0, 2.0, 0.12), STONE_L, px, wy, pz, ry); m.put("glow", archGeo(0.7, 1.7, 0.12), WARM, px + nx * 0.05, wy, pz + nz * 0.05, ry);
  }
  for (const s of [-1, 1]) m.put("solid", bannerGeo(1.5, 4.4), s > 0 ? 0xb02a30 : 0x2c4a8a, cx + tx * s * (hole / 2 + 0.9) + nx * (D / 2 + 0.1), y0 + holeH - 0.2, cz + tz * s * (hole / 2 + 0.9) + nz * (D / 2 + 0.1), ry);
}
