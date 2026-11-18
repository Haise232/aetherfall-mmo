// Reglas puras compartidas por cliente (predicción) y servidor (autoridad).

export const PLAYER = { speed: 6, maxHp: 100, damage: 12, range: 2.5, cooldown: 1.0, respawnSec: 4 };
/** Jefe dragón (evento "dragon" del panel): muerde de cerca y cada cierto tiempo escupe fuego en cono. */
export const DRAGON = {
  name: "Vermithrax, el Dragón Verde", level: 15, maxHp: 2600, speed: 5, damage: 18, range: 5.5, cooldown: 2,
  aggro: 30, leash: 42, radius: 2.4,
  breath: { every: 9, range: 13, halfAngle: 0.6, mult: 2 }, // cono de fuego: alcance (m), medio ángulo (rad), daño ×mult
  xp: 400, minShare: 0.02, // experiencia para cada participante; montura para quien hizo al menos ese porcentaje del daño
  despawnSec: 12, // tras morir, sigue en el suelo este tiempo antes de desaparecer
};
export const MOB = { speed: 3, maxHp: 50, damage: 6, range: 1.8, cooldown: 1.5, aggro: 10, leash: 18, respawnSec: 10, count: 22 };

// Escoba voladora (tecla R): más rápida, sube y baja, pasa por encima de lo que sea más bajo que ella.
/** Duración de un día completo del juego en segundos reales (24 min: una hora del juego = un minuto). */
export const DAY_CYCLE_SEC = 24 * 60;
export const FLY = { speedMult: 2.6, vSpeed: 13, minY: 1.4, maxY: 75, fallSpeed: 20 };

export interface Mover { x: number; z: number; tx: number; tz: number }

import { WORLD_HALF } from "./world";

export function clampWorld(v: number): number {
  return Math.max(-WORLD_HALF, Math.min(WORLD_HALF, v));
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export function stepMover(m: Mover, speed: number, dt: number): void {
  const dx = m.tx - m.x, dz = m.tz - m.z;
  const d = Math.hypot(dx, dz);
  const maxStep = speed * dt;
  if (d <= maxStep) { m.x = m.tx; m.z = m.tz; return; }
  m.x += (dx / d) * maxStep;
  m.z += (dz / d) * maxStep;
}
