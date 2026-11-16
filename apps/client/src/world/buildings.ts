import * as THREE from "three";
import type { Building, Tower } from "@mmorpg/shared";
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
  m.box("solid", b.w + 0.5, 0.5, b.d + 0.5, b.x, 0.25, b.z, STONE_D);
  for (let f = 0; f < floors; f++) {
    const jet = style === "watch" || style === "hut" ? 0 : 0.4;
    const wf = b.w + jet * f, df = b.d + jet * f, yb = Y0 + f * STORY, storyH = style === "hut" ? 2.3 : STORY;
    const stone = (stoneBase && f === 0) || style === "watch";
    m.box("solid", wf, storyH, df, b.x, yb + storyH / 2, b.z, stone ? (style === "watch" ? 0xa7a194 : 0xb6ae9c) : b.wall);
    m.box("solid", wf + 0.16, 0.26, df + 0.16, b.x, yb + 0.13, b.z, TIMBER);
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
        if (f === 0 && dir === b.facing && Math.abs(along) < 1.7) continue;
        if (style === "hut" && !long) continue;
        const p = onFace(b.x, b.z, dir, along, half + 0.05);
        if (style === "watch") { m.box("glow", 0.35, 1.3, 0.1, p.x, yb + 1.7, p.z, glow, RY[dir]!); continue; }
        window2(m, p, dir, yb + 1.7, glow, hash2(b.x + i, b.z + f * 7 + dir), long && dir === b.facing, long && dir === b.facing && hh > 0.45 && f > 0);
      }
    }
  }
  // puerta en arco
  const dh = b.facing % 2 === 0 ? b.d / 2 : b.w / 2;
  const d1 = onFace(b.x, b.z, b.facing, 0, dh + 0.1), d2 = onFace(b.x, b.z, b.facing, 0, dh + 0.18), d3 = onFace(b.x, b.z, b.facing, 0, dh + 0.55);
  m.put("solid", archGeo(1.8, 2.8, 0.14), TIMBER, d1.x, Y0, d1.z, RY[b.facing]!);
  m.put("solid", archGeo(1.3, 2.45, 0.16), DOOR, d2.x, Y0, d2.z, RY[b.facing]!);
  m.box("solid", 1.9, 0.25, 0.8, d3.x, 0.3, d3.z, STONE_D, RY[b.facing]!);
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
  if (style === "workshop") {
    const n = NRM[b.facing]!, p = onFace(b.x, b.z, b.facing, b.w * 0.2, dh + 1.6);
    m.box("solid", 3.4, 0.14, 2.6, p.x - n[0] * 0.2, 2.8, p.z - n[1] * 0.2, 0x7a4a2b, RY[b.facing]!, 0.0, 0.0);
    for (const s of [-1, 1]) { const q = onFace(b.x, b.z, b.facing, b.w * 0.2 + s * 1.5, dh + 2.6); m.box("solid", 0.16, 2.6, 0.16, q.x, 1.3, q.z, WOOD); }
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
export function cathedral(m: Merge, b: Building) {
  m.at(b.x, b.z);
  const H = b.h, nz = b.d / 2, NAVE = 9.6, AIS = (b.w - NAVE) / 2 - 0.4, X = b.x, Z = b.z, AH = 7.6;
  const stoneW = b.wall, slate = b.roof;
  m.box("solid", b.w + 0.6, 0.6, b.d + 0.6, X, 0.3, Z, STONE_D);
  // nave central y naves laterales
  m.box("solid", NAVE, H, b.d, X, H / 2 + 0.6, Z, stoneW);
  for (const s of [-1, 1]) {
    const ax = X + s * (NAVE / 2 + AIS / 2 + 0.2);
    m.box("solid", AIS + 0.4, AH, b.d - 0.2, ax, AH / 2 + 0.6, Z, stoneW);
    // tejado de la nave lateral (a un agua)
    const run = 3.9, rise = 2.6, ang = Math.atan2(rise, run);
    m.box("solid", Math.hypot(run, rise) + 0.3, 0.3, b.d + 0.6, X + s * (NAVE / 2 + run / 2 - 0.1), 0.6 + AH + rise / 2, Z, slate, 0, 0, -s * ang);
    m.box("solid", 0.5, 0.3, b.d + 0.3, X + s * (b.w / 2 + 0.55), 0.6 + AH - 0.1, Z, STONE_D);
  }
  m.prism(NAVE, b.d, 6.2, 0.9, X, H + 0.6, Z, slate, false, 0.5);
  tileRows(m, NAVE, b.d, 6.2, 0.9, X, H + 0.6, Z, slate, false);
  ridge(m, b.d, 6.2, X, H + 0.6, Z, slate, false);
  // transepto
  const TZ = Z, TW = 22, TD = 7.6;
  m.box("solid", TW, H - 1.6, TD, X, (H - 1.6) / 2 + 0.6, TZ, stoneW);
  m.prism(TD, TW, 5.2, 0.7, X, H - 1.0, TZ, slate, true, 0.5);
  tileRows(m, TD, TW, 5.2, 0.7, X, H - 1.0, TZ, slate, true);
  for (const s of [-1, 1]) { // rosetón del brazo del crucero (el este es el visible)
    const x = X + s * (TW / 2) + s * 0.04;
    rose(m, x, H * 0.62, TZ, s, 0, 1.9);
    m.box("solid", 0.6, H - 1.6, 0.6, x - s * 0.2, (H - 1.6) / 2 + 0.6, TZ + TD / 2, STONE_L);
    m.box("solid", 0.6, H - 1.6, 0.6, x - s * 0.2, (H - 1.6) / 2 + 0.6, TZ - TD / 2, STONE_L);
    m.put("solid", archGeo(1.4, 4, 0.2), STONE_L, x + s * 0.0, 1.2, TZ - 2.2, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.put("glow", archGeo(1.0, 3.6, 0.2), GLASS[0]!, x + s * 0.08, 1.2, TZ - 2.2, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.put("solid", archGeo(1.4, 4, 0.2), STONE_L, x + s * 0.0, 1.2, TZ + 2.2, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.put("glow", archGeo(1.0, 3.6, 0.2), GLASS[1]!, x + s * 0.08, 1.2, TZ + 2.2, s > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // ventanales del claristorio y de las naves laterales, contrafuertes y arbotantes
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const z = Z - nz + 3.6 + i * ((b.d - 7.2) / 5);
    if (Math.abs(z - TZ) < TD / 2 + 1.2) continue;
    const wx = X + s * (b.w / 2), col = GLASS[(i + (s > 0 ? 1 : 0)) % 5]!;
    m.put("solid", archGeo(1.5, 4.6, 0.2), STONE_L, wx, 1.4, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.put("glow", archGeo(1.05, 4.1, 0.2), col, wx + s * 0.08, 1.4, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    const cx = X + s * (NAVE / 2 + 0.04);
    m.put("solid", archGeo(1.6, 3.5, 0.2), STONE_L, cx, 11.2, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
    m.put("glow", archGeo(1.15, 3.1, 0.2), col, cx + s * 0.08, 11.2, z, s > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const z = Z - nz + 1.8 + i * ((b.d - 3.6) / 6), x = X + s * (b.w / 2 + 0.25);
    m.box("solid", 0.9, AH + 1.2, 0.9, x, (AH + 1.2) / 2 + 0.6, z, STONE);
    m.cone("solid", 0.62, 1.8, 4, x, AH + 1.8, z, STONE_L, Math.PI / 4);
    // arbotante: puntal inclinado del contrafuerte al muro de la nave
    const run = 3.35, rise = 3.2, ang = Math.atan2(rise, run);
    m.box("solid", Math.hypot(run, rise), 0.28, 0.34, X + s * 6.575, 10.6, z, STONE, 0, 0, -s * ang);
  }
  // fachada (+z): dos torres con campanarios, portal, rosetón y frontón
  const fz = Z + nz;
  for (const s of [-1, 1]) {
    const tx = X + s * (b.w / 2 - 2.9), tz = fz - 2.7, th = H + 15, tw = 5.8;
    m.box("solid", tw, th, tw, tx, th / 2 + 0.6, tz, stoneW);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box("solid", 0.55, th, 0.55, tx + sx * tw / 2, th / 2 + 0.6, tz + sz * tw / 2, STONE_L);
    for (const y of [H * 0.55, H + 5]) m.box("solid", tw + 0.5, 0.4, tw + 0.5, tx, y, tz, STONE_D);
    // vanos del campanario
    for (const [nx, nzz] of [[0, 1], [1, 0]] as const) {
      for (const o of [-1.15, 1.15]) {
        const px = tx + nx * (tw / 2 + 0.03) + (nzz ? o : 0), pz = tz + nzz * (tw / 2 + 0.03) + (nx ? o : 0), ry = Math.atan2(nx, nzz);
        m.put("solid", archGeo(1.3, 4.0, 0.2), STONE_L, px, th - 6.2, pz, ry);
        m.put("glow", archGeo(0.9, 3.7, 0.2), 0x2a2f45, px + nx * 0.06, th - 6.2, pz + nzz * 0.06, ry);
      }
    }
    m.put("solid", archGeo(1.0, 3.2, 0.2), STONE_L, tx, H * 0.55 + 1.6, tz + tw / 2 + 0.02, 0);
    m.put("glow", archGeo(0.7, 2.9, 0.2), GLASS[0]!, tx, H * 0.55 + 1.6, tz + tw / 2 + 0.08, 0);
    // chapitel octogonal con gabletes y cruz
    m.cyl("solid", tw / 2 + 0.3, tw / 2 + 0.3, 0.7, 4, tx, th + 0.6, tz, STONE_D, Math.PI / 4);
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) m.cone("solid", 0.55, 2.4, 4, tx + px * tw / 2, th + 1.2, tz + pz * tw / 2, STONE_L, Math.PI / 4);
    m.cone("solid", tw * 0.78, 15, 4, tx, th + 1.2, tz, slate, Math.PI / 4);
    m.cyl("solid", 0.11, 0.11, 3.2, 5, tx, th + 15.8, tz, 0xd9b13b); m.box("solid", 1.4, 0.18, 0.18, tx, th + 18, tz, 0xd9b13b);
  }
  // portal con arco apuntado y arquivoltas
  const pz = fz + 0.3;
  m.put("solid", archWallGeo(7.4, 8.4, 0.7, 3.6, 7.0), STONE_L, X, 0.6, pz);
  m.put("solid", archGeo(3.6, 7.0, 0.5), 0x2a1c12, X, 0.6, pz - 0.1);
  m.put("solid", archGeo(3.2, 6.6, 0.3), DOOR, X, 0.6, pz + 0.05);
  for (const s of [-1, 1]) m.box("solid", 0.18, 6.2, 0.14, X + s * 0.8, 3.7, pz + 0.22, 0x2a1c12);
  m.box("solid", 3.4, 0.2, 0.14, X, 3.9, pz + 0.22, 0x2a1c12);
  for (let i = 0; i < 3; i++) { const sh = 0.6 - 0.2 * i; m.box("solid", 7.6, sh, 1.0, X, sh / 2, fz + 0.9 + i * 1.0, STONE_D); }
  // rosetón
  rose(m, X, 12.4, fz + 0.06, 0, 1, 2.6);
  for (const s of [-1, 1]) {
    m.put("solid", archGeo(1.2, 3.4, 0.3), STONE_L, X + s * 3.4, H * 0.66 - 1.4, fz + 0.1, 0); m.put("glow", archGeo(0.85, 3.1, 0.3), GLASS[s > 0 ? 3 : 1]!, X + s * 3.4, H * 0.66 - 1.4, fz + 0.18, 0);
  }
  // flecha del crucero
  m.cyl("solid", 2.2, 2.6, 2.0, 8, X, H + 5.2, Z, stoneW);
  m.cone("solid", 2.8, 10.5, 8, X, H + 7.0, Z, slate);
  m.cyl("solid", 0.1, 0.1, 3, 5, X, H + 17.2, Z, 0xd9b13b); m.box("solid", 1.2, 0.16, 0.16, X, H + 19, Z, 0xd9b13b);
  // ábside
  m.cyl("solid", b.w / 2 - 1, b.w / 2 - 1, H - 2, 10, X, 0.6, Z - nz - 3, stoneW);
  m.cone("solid", b.w / 2, 7, 10, X, H - 1.4, Z - nz - 3, slate);
  return { top: H + 19 };
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
export function greatHall(m: Merge, h: { x: number; z: number; w: number; d: number; h: number }, porch: { x: number; z: number; w: number; d: number; h: number }) {
  m.at(h.x, h.z);
  const sz = h.z + h.d / 2, nzp = h.z - h.d / 2, ex = h.x + h.w / 2, WALL = 0xd0c4aa, SLATE = 0x39414f;
  m.box("solid", h.w + 0.8, 0.7, h.d + 0.8, h.x, 0.35, h.z, STONE_D);
  m.box("solid", h.w, h.h, h.d, h.x, h.h / 2 + 0.7, h.z, WALL);
  m.box("solid", h.w + 0.5, 0.6, h.d + 0.5, h.x, h.h + 0.4, h.z, STONE_D); // cornisa
  m.box("solid", h.w + 0.3, 1.8, h.d + 0.3, h.x, 1.3, h.z, 0xb4a88f); // zócalo
  const bays = 9, step = (h.w - 6) / (bays - 1);
  for (let i = 0; i < bays; i++) {
    const x = h.x - h.w / 2 + 3 + i * step, warm = i % 3 === 1 ? 0xffb347 : WARM;
    for (const [s, zf] of [[1, sz], [-1, nzp]] as const) {
      const ry = s > 0 ? 0 : Math.PI;
      m.put("solid", archGeo(2.6, 8.4, 0.3), STONE_L, x, 2.6, zf + s * 0.05, ry);
      m.put("glow", archGeo(2.0, 7.8, 0.3), warm, x, 2.6, zf + s * 0.12, ry);
      m.box("solid", 0.1, 5.6, 0.1, x, 4.9, zf + s * 0.2, STONE_L); m.box("solid", 2.0, 0.1, 0.1, x, 6.6, zf + s * 0.2, STONE_L); m.box("solid", 2.0, 0.1, 0.1, x, 4.4, zf + s * 0.2, STONE_L);
      if (s > 0 && i % 2 === 0) m.put("solid", bannerGeo(1.1, 3.6), i % 4 === 0 ? 0xb02a30 : 0x2c4a8a, x + step / 2, 11.4, zf + 0.3);
    }
    if (i < bays - 1) for (const [s, zf] of [[1, sz], [-1, nzp]] as const) {
      const bx = x + step / 2;
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
  // pórtico de entrada con arco, frontón, escalones y antorchas
  const pz0 = porch.z + porch.d / 2, ph = porch.h, pw = porch.w;
  m.at(porch.x, porch.z);
  m.box("solid", pw, ph, porch.d, porch.x, ph / 2 + 0.2, porch.z, WALL);
  m.put("solid", archWallGeo(pw + 0.4, ph + 1.8, 0.6, 3.8, 6.2), STONE_L, porch.x, 0.2, pz0 + 0.1);
  m.put("solid", archGeo(3.8, 6.2, 0.5), 0x24180f, porch.x, 0.2, pz0 - 0.1);
  m.put("solid", archGeo(3.4, 5.8, 0.2), DOOR, porch.x, 0.2, pz0 + 0.0);
  m.box("solid", 0.16, 5.4, 0.12, porch.x, 3.0, pz0 + 0.12, 0x2a1c12);
  m.prism(pw + 0.4, porch.d, 3.4, 0.5, porch.x, ph + 0.2 + 1.6, porch.z - 0.0, SLATE, false, 0.6);
  for (let i = 0; i < 3; i++) m.box("solid", pw + 1.4 - i * 0.5, 0.2, 1.0, porch.x, 0.1 + 0.0, pz0 + 0.6 + i * 0.7, 0xb8b1a2);
  for (const s of [-1, 1]) {
    m.box("solid", 0.18, 2.3, 0.18, porch.x + s * 3.0, 1.25, pz0 + 0.4, 0x2a2a2e);
    m.box("glow", 0.4, 0.4, 0.4, porch.x + s * 3.0, 2.6, pz0 + 0.4, 0xffb347);
    m.put("solid", bannerGeo(1.3, 4.6), s > 0 ? 0xb02a30 : 0x2c4a8a, porch.x + s * 2.7, ph + 0.4 + 0.9, pz0 + 0.5);
  }
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
