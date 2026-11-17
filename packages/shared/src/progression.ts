// Progresión de habilidades y de clases: puntos por nivel, rangos de cada habilidad, habilidad definitiva y títulos de clase.
// Reglas puras compartidas por cliente (ventana de habilidades, barra, predicción) y servidor (lo único que manda).
import type { ClassId, LookSel, SkillDef } from "./classes";
import { classOf, styleOf } from "./classes";

/** Rango máximo de las habilidades normales (1..3) y de la definitiva (4). */
export const MAX_RANK = 5, ULT_MAX_RANK = 3;
/** Nivel del personaje al que se puede aprender la definitiva. */
export const ULT_LEVEL = 6;
/** Número de habilidades (teclas 1–4). */
export const SKILL_SLOTS = 4;

/** Habilidad definitiva (tecla 4) de cada clase y de cada forma bendecida (por nombre de estilo). */
export const ULTIMATES: Record<ClassId, SkillDef> & Record<string, SkillDef> = {
  knight: { name: "Carga del estandarte", desc: "Cargas contra un enemigo lejano con el estandarte en alto: golpe enorme que lo aturde.", cd: 28, kind: "charge", range: 12, mult: 2.8, stun: 1.5, anim: "1H_Melee_Attack_Chop" },
  barbarian: { name: "Terremoto", desc: "Golpeas el suelo con tal fuerza que dañas y derribas a todos los enemigos cercanos.", cd: 28, kind: "aoe", radius: 6, mult: 2.6, stun: 1.5, anim: "2H_Melee_Attack_Spinning" },
  mage: { name: "Lluvia de meteoros", desc: "Haces caer fuego del cielo sobre todos los enemigos que te rodean.", cd: 30, kind: "aoe", radius: 7, mult: 2.5, stun: 1, anim: "Spellcast_Long" },
  rogue: { name: "Danza de cuchillas", desc: "Un torbellino de cuchilladas alcanza a todos los enemigos a tu alrededor.", cd: 24, kind: "aoe", radius: 4.5, mult: 2.6, anim: "Dualwield_Melee_Attack_Slice" },
  "Paladín": { name: "Juicio divino", desc: "La luz de la diosa estalla a tu alrededor: daña, aturde y te cura un 20 %.", cd: 30, kind: "aoe", radius: 6, mult: 2.8, stun: 2, heal: 0.2, anim: "1H_Melee_Attack_Slice_Horizontal" },
  "Mago de la Luz": { name: "Juicio solar", desc: "Un sol en miniatura arrasa a los enemigos cercanos y te cura un 20 %.", cd: 30, kind: "aoe", radius: 8, mult: 2.8, heal: 0.2, anim: "Spellcast_Long" },
};

// ---- Habilidades alternativas: cada casilla (1–3) tiene la de siempre y dos más que se desbloquean ----
/** Habilidad que se puede aprender: nivel mínimo para desbloquearla (cuesta un punto). */
export type AltSkill = SkillDef & { req: number };
export const ALT_SKILLS: Record<ClassId, [AltSkill[], AltSkill[], AltSkill[]]> = {
  knight: [
    [{ name: "Estocada", desc: "Una estocada certera y rápida.", cd: 6, kind: "strike", range: 3, mult: 2.0, anim: "1H_Melee_Attack_Stab", req: 3 },
     { name: "Lanza arrojadiza", desc: "Arrojas una lanza contra un enemigo lejano.", cd: 7, kind: "strike", range: 10, mult: 1.5, anim: "Throw", req: 8 }],
    [{ name: "Segundo aliento", desc: "Recuperas el aliento y un 25 % de tu vida.", cd: 18, kind: "heal", heal: 0.25, anim: "Cheer", req: 3 },
     { name: "Grito de batalla", desc: "Durante 5 s haces un 50 % más de daño.", cd: 20, kind: "buff", buff: "rage", dur: 5, anim: "Cheer", req: 8 }],
    [{ name: "Carga", desc: "Cargas contra un enemigo lejano y lo aturdes 1 s.", cd: 12, kind: "charge", range: 10, mult: 1.4, stun: 1, anim: "Block_Attack", req: 3 },
     { name: "Pisotón", desc: "Haces temblar el suelo: aturdes 2,5 s a los enemigos cercanos.", cd: 14, kind: "aoe", radius: 3.5, mult: 0.8, stun: 2.5, anim: "Unarmed_Melee_Attack_Kick", req: 8 }],
  ],
  barbarian: [
    [{ name: "Embestida", desc: "Te lanzas contra un enemigo lejano.", cd: 9, kind: "charge", range: 9, mult: 1.6, anim: "2H_Melee_Attack_Chop", req: 3 },
     { name: "Hacha arrojadiza", desc: "Lanzas un hacha de mano a un enemigo lejano.", cd: 6, kind: "strike", range: 10, mult: 1.5, anim: "Throw", req: 8 }],
    [{ name: "Rugido", desc: "Un rugido que aturde 2 s a los enemigos cercanos.", cd: 14, kind: "aoe", radius: 5, mult: 0.6, stun: 2, anim: "Cheer", req: 3 },
     { name: "Golpe sísmico", desc: "Golpe brutal contra el suelo que daña a los enemigos muy cercanos.", cd: 12, kind: "aoe", radius: 3.5, mult: 2.0, anim: "2H_Melee_Attack_Slice", req: 8 }],
    [{ name: "Piel de oso", desc: "Durante 5 s recibes menos de la mitad del daño.", cd: 18, kind: "buff", buff: "guard", dur: 5, anim: "Block", req: 3 },
     { name: "Festín", desc: "Un buen trago y un trozo de carne: recuperas un 30 % de tu vida.", cd: 20, kind: "heal", heal: 0.3, anim: "Use_Item", req: 8 }],
  ],
  mage: [
    [{ name: "Bola de fuego", desc: "Una bola de fuego que golpea fuerte desde lejos.", cd: 7, kind: "strike", range: 12, mult: 2.4, anim: "Spellcast_Shoot", req: 3 },
     { name: "Rayo de hielo", desc: "Congela 1,5 s al objetivo desde muy lejos.", cd: 8, kind: "strike", range: 14, mult: 1.4, stun: 1.5, anim: "Spellcast_Shoot", req: 8 }],
    [{ name: "Llamarada", desc: "Un anillo de fuego daña a los enemigos cercanos.", cd: 10, kind: "aoe", radius: 5, mult: 1.8, anim: "Spellcast_Raise", req: 3 },
     { name: "Tormenta", desc: "Relámpagos que alcanzan a los enemigos en un radio enorme.", cd: 12, kind: "aoe", radius: 8, mult: 1.0, anim: "Spellcast_Long", req: 8 }],
    [{ name: "Escudo de maná", desc: "Durante 4 s recibes menos de la mitad del daño.", cd: 16, kind: "buff", buff: "guard", dur: 4, anim: "Spellcast_Raise", req: 3 },
     { name: "Meditación", desc: "Recuperas un 30 % de tu vida.", cd: 20, kind: "heal", heal: 0.3, anim: "Spellcast_Long", req: 8 }],
  ],
  rogue: [
    [{ name: "Cuchillo arrojadizo", desc: "Lanzas un cuchillo a un enemigo lejano.", cd: 5, kind: "strike", range: 10, mult: 1.4, anim: "Throw", req: 3 },
     { name: "Golpe bajo", desc: "Un golpe a traición que aturde 2 s.", cd: 8, kind: "strike", range: 3, mult: 1.2, stun: 2, anim: "Unarmed_Melee_Attack_Kick", req: 8 }],
    [{ name: "Voltereta", desc: "Ruedas 6 m hacia delante.", cd: 7, kind: "blink", range: 6, anim: "Dodge_Forward", req: 3 },
     { name: "Asalto", desc: "Saltas sobre un enemigo lejano con un golpe doble.", cd: 12, kind: "charge", range: 9, mult: 2.0, anim: "Dualwield_Melee_Attack_Chop", req: 8 }],
    [{ name: "Hoja envenenada", desc: "Durante 6 s haces un 50 % más de daño.", cd: 18, kind: "buff", buff: "rage", dur: 6, anim: "Use_Item", req: 3 },
     { name: "Abanico de cuchillas", desc: "Lanzas cuchillas en todas direcciones.", cd: 10, kind: "aoe", radius: 4, mult: 1.4, anim: "Throw", req: 8 }],
  ],
};

/** Clave de una habilidad: "s{casilla}o{opción}" para las casillas 1–3 y "u" para la definitiva. */
export const skillKey = (slot: number, opt: number) => (slot === SKILL_SLOTS - 1 ? "u" : `s${slot}o${opt}`);
/** Opciones de una casilla (0..2): la de la clase o forma bendecida y sus alternativas. La definitiva (3) tiene una sola. */
export function skillOptions(look: LookSel | undefined, slot: number): (SkillDef & { req?: number })[] {
  if (!look) return [];
  const st = styleOf(look), c = classOf(look[0]);
  if (slot === SKILL_SLOTS - 1) { const u = (st?.title && ULTIMATES[st.title]) || ULTIMATES[look[0]]; return u ? [{ ...u, req: ULT_LEVEL }] : []; }
  const base = (st?.skills ?? c?.skills)?.[slot];
  return base ? [base, ...(ALT_SKILLS[look[0]]?.[slot] ?? [])] : [];
}
/** Estado de habilidades del personaje: rango de cada habilidad aprendida y opción elegida en cada casilla 1–3. */
export interface SkillState { ranks: Record<string, number>; pick: number[] }
export const START_SKILLS = (): SkillState => ({ ranks: { s0o0: 1, s1o0: 1, s2o0: 1 }, pick: [0, 0, 0] });
/** Las cuatro habilidades equipadas (con su rango aplicado) y su rango; rango 0 = sin aprender. */
export function equippedSkills(look: LookSel | undefined, st: SkillState): { sk: SkillDef; rank: number; key: string }[] {
  const out: { sk: SkillDef; rank: number; key: string }[] = [];
  for (let slot = 0; slot < SKILL_SLOTS; slot++) {
    const opt = slot === SKILL_SLOTS - 1 ? 0 : st.pick[slot] ?? 0, base = skillOptions(look, slot)[opt];
    if (!base) continue;
    const key = skillKey(slot, opt), rank = st.ranks[key] ?? 0;
    out[slot] = { sk: rankedSkill(base, rank), rank, key };
  }
  return out;
}
/** Habilidad por su clave (para animar y dibujar lo que lanza otro jugador). */
export function skillByKey(look: LookSel | undefined, key: string): SkillDef | undefined {
  if (key === "u") return skillOptions(look, SKILL_SLOTS - 1)[0];
  const m = /^s(\d)o(\d)$/.exec(key); return m ? skillOptions(look, Number(m[1]))[Number(m[2])] : undefined;
}

/** La habilidad con los efectos de su rango (rango 0 = sin aprender; se trata como rango 1 para mostrarla). */
export function rankedSkill(sk: SkillDef, rank: number): SkillDef {
  const k = Math.max(0, rank - 1), out: SkillDef = { ...sk };
  out.cd = Math.round(sk.cd * (1 - 0.06 * k) * 10) / 10;
  if (sk.mult !== undefined) out.mult = Math.round(sk.mult * (1 + 0.15 * k) * 100) / 100;
  if (sk.stun !== undefined) out.stun = Math.round((sk.stun + 0.25 * k) * 100) / 100;
  if (sk.dur !== undefined) out.dur = sk.dur + 0.5 * k;
  if (sk.heal !== undefined) out.heal = Math.round((sk.heal + 0.02 * k) * 1000) / 1000;
  if (sk.radius !== undefined) out.radius = sk.radius + 0.25 * k;
  if (sk.kind === "blink" && sk.range !== undefined) out.range = sk.range + 1 * k;
  if (sk.kind === "charge" && sk.range !== undefined) out.range = sk.range + 0.5 * k;
  return out;
}
/** Rango máximo según la casilla (la definitiva tiene menos). */
export const maxRankOf = (slot: number) => (slot === SKILL_SLOTS - 1 ? ULT_MAX_RANK : MAX_RANK);
const slotOfKey = (key: string) => (key === "u" ? SKILL_SLOTS - 1 : Number(key[1]));
/** Puntos ganados hasta un nivel (uno por nivel a partir del 2). */
export const pointsEarned = (level: number) => Math.max(0, level - 1);
/** Puntos gastados: cada rango cuesta uno, salvo el primero de las tres habilidades iniciales (gratis). */
export const pointsSpent = (st: SkillState) => Object.entries(st.ranks).reduce((a, [k, r]) => a + Math.max(0, r - (/^s\do0$/.test(k) ? 1 : 0)), 0);
export const freePoints = (level: number, st: SkillState) => pointsEarned(level) - pointsSpent(st);
/** ¿Se puede aprender o mejorar la habilidad `opt` de la casilla `slot`? Devuelve el motivo si no. */
export function canRankUp(look: LookSel | undefined, level: number, st: SkillState, slot: number, opt: number): string | null {
  const sk = Number.isInteger(slot) && Number.isInteger(opt) ? skillOptions(look, slot)[opt] : undefined;
  if (!sk) return "Habilidad no válida.";
  const rank = st.ranks[skillKey(slot, opt)] ?? 0;
  if (rank >= maxRankOf(slot)) return "Esa habilidad ya está al máximo.";
  if (rank === 0 && sk.req && level < sk.req) return `Se desbloquea a nivel ${sk.req}.`;
  if (freePoints(level, st) <= 0) return "No te quedan puntos de habilidad. Ganas uno por nivel.";
  return null;
}
/** Valida el estado llegado de la base de datos (acepta el formato antiguo: lista de cuatro rangos). */
export function validSkills(raw: unknown, level: number): SkillState {
  const st = START_SKILLS();
  if (Array.isArray(raw) && raw.length === 4 && raw.every(n => Number.isInteger(n))) { // formato anterior: [r1, r2, r3, definitiva]
    raw.forEach((r, i) => { const k = skillKey(i, 0); const v = Math.max(i < 3 ? 1 : 0, Math.min(maxRankOf(i), r as number)); if (v > 0) st.ranks[k] = v; });
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as { ranks?: unknown; pick?: unknown };
    if (o.ranks && typeof o.ranks === "object") for (const [k, v] of Object.entries(o.ranks as Record<string, unknown>)) {
      if (!/^(s[0-2]o[0-2]|u)$/.test(k) || !Number.isInteger(v)) continue;
      const r = Math.max(0, Math.min(maxRankOf(slotOfKey(k)), v as number)); if (r > 0) st.ranks[k] = r;
    }
    if (Array.isArray(o.pick)) o.pick.slice(0, 3).forEach((p, i) => { if (Number.isInteger(p) && (st.ranks[skillKey(i, p as number)] ?? 0) > 0) st.pick[i] = p as number; });
  }
  for (const k of ["s0o0", "s1o0", "s2o0"]) st.ranks[k] = Math.max(1, st.ranks[k] ?? 1);
  return freePoints(level, st) < 0 ? START_SKILLS() : st;
}
/** Texto de lo que gana una habilidad al subir del rango `rank` al siguiente. */
export function nextRankText(sk: SkillDef, rank: number): string {
  const a = rankedSkill(sk, Math.max(1, rank)), b = rankedSkill(sk, rank + 1), parts: string[] = [];
  const pct = (x: number, y: number) => `+${Math.round((y / x - 1) * 100)} %`;
  if (rank === 0) return "Aprenderla (rango 1).";
  if (a.mult !== undefined && b.mult !== a.mult) parts.push(`daño ${pct(a.mult, b.mult!)}`);
  if (b.cd !== a.cd) parts.push(`enfriamiento ${String(a.cd).replace(".", ",")} → ${String(b.cd).replace(".", ",")} s`);
  if (a.stun !== undefined && b.stun !== a.stun) parts.push(`aturde ${String(b.stun).replace(".", ",")} s`);
  if (a.dur !== undefined && b.dur !== a.dur) parts.push(`dura ${String(b.dur).replace(".", ",")} s`);
  if (a.heal !== undefined && b.heal !== a.heal) parts.push(`cura ${Math.round(b.heal! * 100)} %`);
  if (a.radius !== undefined && b.radius !== a.radius) parts.push(`radio ${String(b.radius).replace(".", ",")} m`);
  if (a.range !== undefined && b.range !== a.range) parts.push(`alcance ${String(b.range).replace(".", ",")} m`);
  return parts.join(" · ");
}

// ---- Rangos de clase: títulos que llegan con el nivel y dan un pequeño extra de vida y daño ----
export const CLASS_RANK_LEVELS = [1, 5, 10, 15, 20];
export const CLASS_TITLES: Record<ClassId, string[]> = {
  knight: ["Escudero", "Caballero", "Campeón", "Señor de la guerra", "Leyenda del reino"],
  barbarian: ["Saqueador", "Guerrero", "Berserker", "Caudillo", "Leyenda de la sierra"],
  mage: ["Aprendiz", "Hechicero", "Mago", "Archimago", "Leyenda arcana"],
  rogue: ["Ratero", "Ladrón", "Asesino", "Maestro de sombras", "Leyenda de los callejones"],
};
/** Bonificación de vida y daño de cada rango de clase (+5 % por rango por encima del primero). */
export const CLASS_RANK_BONUS = 0.05;
/** Rango de clase (0..4) según el nivel. */
export const classRank = (level: number) => CLASS_RANK_LEVELS.filter(l => level >= l).length - 1;
export const classTitle = (cls: ClassId, level: number) => CLASS_TITLES[cls]?.[classRank(level)] ?? "";
export const classRankMult = (level: number) => 1 + CLASS_RANK_BONUS * classRank(level);
