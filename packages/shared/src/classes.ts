// Clases y aspectos de personaje. La clase decide el modelo; cada clase tiene sus propios aspectos.
// Por ahora es solo apariencia: las estadísticas no cambian con la clase.
// Habilidades (teclas 1-2-3). Cinco mecánicas básicas; los números son un primer ajuste, no un balance definitivo.
//  strike: golpe al objetivo · charge: salta hasta el objetivo y golpea · aoe: daña alrededor de ti
//  buff: efecto temporal sobre ti · blink: te teletransporta hacia delante · heal: te cura
// Cualquier habilidad puede además curar (`heal`: fracción de tu vida máxima).
export type BuffId = "guard" | "rage" | "aegis";
export const BUFFS: Record<BuffId, { name: string; taken: number; dealt: number }> = {
  guard: { name: "En guardia", taken: 0.4, dealt: 1 }, // recibes el 40 % del daño
  rage: { name: "Furia", taken: 1, dealt: 1.5 }, // haces un 50 % más de daño
  aegis: { name: "Égida sagrada", taken: 0.3, dealt: 1.2 }, // recibes el 30 % del daño y pegas un 20 % más
};
export interface SkillDef {
  name: string; desc: string; cd: number; // enfriamiento en segundos
  kind: "strike" | "charge" | "aoe" | "buff" | "blink" | "heal";
  range?: number; // strike/charge: distancia al objetivo · blink: metros que avanza
  radius?: number; // aoe
  mult?: number; // multiplicador sobre tu daño
  stun?: number; // segundos que deja aturdido (solo afecta a criaturas)
  buff?: BuffId; dur?: number;
  heal?: number; // fracción de la vida máxima que te cura al lanzarla
  anim: string; // animación del modelo
}
export type ClassId = "knight" | "barbarian" | "mage" | "rogue";
// Pasiva: siempre activa, la aplica el servidor. Cada clase (y cada forma bendecida) tiene la suya.
export interface PassiveDef {
  name: string; desc: string;
  block?: number; // probabilidad de bloquear por completo un golpe recibido
  taken?: number; // multiplicador del daño recibido
  rage?: number; // daño extra máximo (con la vida a cero), crece al perder vida
  killHeal?: number; // fracción de vida máxima que recuperas al matar
  cdMult?: number; // multiplicador de los enfriamientos de habilidades
  crit?: number; critMult?: number; // probabilidad y multiplicador de crítico
  speed?: number; // multiplicador de velocidad a pie
  regen?: number; // fracción de vida máxima por segundo
  lifesteal?: number; // fracción del daño hecho que te cura
}
// Monturas (tecla R). Solo la escoba vuela; las demás corren por el suelo y chocan con los muros como a pie.
export type MountId = "broom" | "horse" | "warhorse" | "goat" | "panther";
export const MOUNTS: Record<MountId, { name: string; flies: boolean; speedMult: number }> = {
  broom: { name: "Escoba voladora", flies: true, speedMult: 2.6 },
  horse: { name: "Caballo", flies: false, speedMult: 2.3 },
  warhorse: { name: "Corcel sagrado", flies: false, speedMult: 2.4 },
  goat: { name: "Cabra montesa", flies: false, speedMult: 2.1 },
  panther: { name: "Pantera sombría", flies: false, speedMult: 2.4 },
};
export interface StyleDef {
  name: string;
  kind: "Knight" | "Barbarian" | "Mage" | "Rogue" | "Rogue_Hooded"; // modelo (.glb)
  show: string[]; // accesorios visibles
  hidden?: boolean; // no se muestra en la creación inicial
  tint?: number; // tinte opcional del modelo
  // --- formas bendecidas por la diosa: son casi una clase propia ---
  title?: string; // nombre de clase que se muestra
  color?: number; // color de sus efectos y de la barra de habilidades
  glow?: number; // resplandor suave propio del modelo
  palette?: Record<number, number>; // recoloreado de la textura: casilla del atlas (fila*8+columna) -> color
  aura?: "light" | "paladin"; // adornos de luz (halo, orbes, alas)
  unarmed?: string[]; // sustituye a lo que lleva la clase en las manos
  shield?: string; // escudo que acompaña al arma equipada
  skills?: [SkillDef, SkillDef, SkillDef]; // sustituyen a las de la clase
  mount?: MountId; // sustituye a la montura de la clase
  passive?: PassiveDef; // sustituye a la pasiva de la clase
}
export interface ClassDef {
  id: ClassId; name: string; blurb: string; color: number;
  unarmed: string[]; // lo que lleva en las manos sin arma equipada
  range?: number; // alcance del ataque básico; sin él, cuerpo a cuerpo (PLAYER.range)
  styles: StyleDef[];
  skills: [SkillDef, SkillDef, SkillDef];
  mount: MountId;
  passive: PassiveDef;
}
export const CLASSES: ClassDef[] = [
  {
    id: "knight", name: "Caballero", blurb: "Acero, escudo y juramento. Guarda las puertas de la ciudad.", color: 0x3d6fa8, unarmed: ["Round_Shield"], mount: "horse",
    passive: { name: "Escudo firme", desc: "20 % de probabilidad de bloquear por completo un golpe y recibes un 10 % menos de daño.", block: 0.2, taken: 0.9 },
    styles: [
      { name: "Yelmo y capa", kind: "Knight", show: ["Knight_Helmet", "Knight_Cape"] },
      { name: "Solo yelmo", kind: "Knight", show: ["Knight_Helmet"] },
      { name: "Cara descubierta", kind: "Knight", show: ["Knight_Cape"] },
      {
        name: "Paladín", kind: "Knight", show: ["Knight_Helmet", "Knight_Cape"], hidden: true,
        title: "Paladín", color: 0xf2c94c, glow: 0x6a5420,
        palette: { 3: 0xe8ecf2, 7: 0xe8ecf2, 10: 0xdfe4ec, 11: 0xdfe4ec, 4: 0xd6a838, 15: 0xd6a838, 8: 0x2f5fb0, 18: 0x2f5fb0, 12: 0xf4c84a, 6: 0xd6a838, 13: 0x2f5fb0, 19: 0x2f5fb0 }, aura: "paladin", unarmed: ["1H_Sword", "Rectangle_Shield"], shield: "Rectangle_Shield", mount: "warhorse",
        passive: { name: "Juramento de luz", desc: "Bloqueas el 25 % de los golpes, recibes un 15 % menos de daño y recuperas un 1 % de vida por segundo.", block: 0.25, taken: 0.85, regen: 0.01 },
        skills: [
          { name: "Martillo de justicia", desc: "Golpe sagrado que aturde 2,5 s al objetivo.", cd: 8, kind: "strike", range: 3.5, mult: 1.8, stun: 2.5, anim: "1H_Melee_Attack_Chop" },
          { name: "Égida sagrada", desc: "6 s: recibes un 70 % menos de daño, pegas un 20 % más y recuperas un 15 % de vida.", cd: 16, kind: "buff", buff: "aegis", dur: 6, heal: 0.15, anim: "Block" },
          { name: "Consagración", desc: "La luz estalla a tu alrededor: daña a los enemigos cercanos y te cura un 12 %.", cd: 11, kind: "aoe", radius: 5, mult: 1.7, heal: 0.12, anim: "1H_Melee_Attack_Slice_Horizontal" },
        ],
      },
    ],
    skills: [
      { name: "Golpe de escudo", desc: "Golpea al objetivo y lo aturde 2 s.", cd: 8, kind: "strike", range: 3, mult: 1.2, stun: 2, anim: "Block_Attack" },
      { name: "En guardia", desc: "Durante 5 s recibes menos de la mitad del daño.", cd: 14, kind: "buff", buff: "guard", dur: 5, anim: "Block" },
      { name: "Barrido", desc: "Tajo amplio que daña a todos los enemigos cercanos.", cd: 10, kind: "aoe", radius: 4, mult: 1.5, anim: "1H_Melee_Attack_Slice_Horizontal" },
    ],
  },
  {
    id: "barbarian", name: "Bárbaro", blurb: "Bajó de la sierra con una piel de oso y pocas palabras.", color: 0x9b2f3d, unarmed: [], mount: "goat",
    passive: { name: "Sangre caliente", desc: "Cuanta menos vida te queda, más daño haces (hasta +50 %). Cada enemigo que matas te devuelve un 10 % de vida.", rage: 0.5, killHeal: 0.1 },
    styles: [
      { name: "Gorro de oso y capa", kind: "Barbarian", show: ["Barbarian_Hat", "Barbarian_Cape"] },
      { name: "Gorro de oso", kind: "Barbarian", show: ["Barbarian_Hat"] },
      { name: "Cabeza descubierta", kind: "Barbarian", show: [] },
    ],
    skills: [
      { name: "Hachazo", desc: "Un golpe brutal al objetivo.", cd: 6, kind: "strike", range: 3, mult: 2.2, anim: "2H_Melee_Attack_Chop" },
      { name: "Torbellino", desc: "Giras y dañas a todos los enemigos a tu alrededor.", cd: 9, kind: "aoe", radius: 4.5, mult: 1.4, anim: "2H_Melee_Attack_Spin" },
      { name: "Furia", desc: "Durante 6 s haces un 50 % más de daño.", cd: 18, kind: "buff", buff: "rage", dur: 6, anim: "Cheer" },
    ],
  },
  {
    id: "mage", name: "Mago", blurb: "Estudió en la torre del castillo. Varita en mano y sombrero de pico.", color: 0x6b4a8f, unarmed: ["1H_Wand"], range: 12, mount: "broom",
    passive: { name: "Mente arcana", desc: "Tus habilidades se recargan un 25 % más rápido.", cdMult: 0.75 },
    styles: [
      { name: "Sombrero y capa", kind: "Mage", show: ["Mage_Hat", "Mage_Cape"] },
      { name: "Solo sombrero", kind: "Mage", show: ["Mage_Hat"] },
      { name: "Capa sin sombrero", kind: "Mage", show: ["Mage_Cape"] },
      {
        name: "Mago de la Luz", kind: "Mage", show: ["Mage_Hat", "Mage_Cape"], hidden: true,
        title: "Mago de la Luz", color: 0xffe08a, glow: 0x5a4a20,
        passive: { name: "Gracia divina", desc: "Tus habilidades se recargan un 30 % más rápido y el daño que haces te cura un 15 %.", cdMult: 0.7, lifesteal: 0.15 },
        palette: { 8: 0xf6f1e4, 9: 0xf6f1e4, 15: 0xe9d7a0, 10: 0xe8c66a, 17: 0xe8c66a, 5: 0xf0c450, 24: 0xf0c450, 18: 0x8fd4ff, 22: 0xbfe8ff }, aura: "light", unarmed: ["2H_Staff"],
        skills: [
          { name: "Lanza de luz", desc: "Un rayo de luz atraviesa al objetivo desde muy lejos.", cd: 4, kind: "strike", range: 16, mult: 2.2, anim: "Spellcast_Shoot" },
          { name: "Sol naciente", desc: "Un estallido cegador daña y deslumbra 2 s a los enemigos cercanos.", cd: 12, kind: "aoe", radius: 7, mult: 1.5, stun: 2, anim: "Spellcast_Raise" },
          { name: "Plegaria sanadora", desc: "La diosa te devuelve un 35 % de tu vida.", cd: 16, kind: "heal", heal: 0.35, anim: "Spellcast_Long" },
        ],
      },
    ],
    skills: [
      { name: "Descarga arcana", desc: "Proyectil que golpea al objetivo desde lejos.", cd: 4, kind: "strike", range: 14, mult: 1.8, anim: "Spellcast_Shoot" },
      { name: "Nova de escarcha", desc: "Daña y congela 2,5 s a los enemigos cercanos.", cd: 12, kind: "aoe", radius: 6, mult: 1.2, stun: 2.5, anim: "Spellcast_Raise" },
      { name: "Parpadeo", desc: "Te teletransportas 8 m hacia delante.", cd: 10, kind: "blink", range: 8, anim: "Dodge_Forward" },
    ],
  },
  {
    id: "rogue", name: "Pícaro", blurb: "Conoce cada callejón. Cuchillo corto y paso ligero.", color: 0x4f8a4c, unarmed: ["Knife"], mount: "panther",
    passive: { name: "Golpe certero", desc: "25 % de probabilidad de asestar un crítico de daño doble. Corres un 12 % más rápido.", crit: 0.25, critMult: 2, speed: 1.12 },
    styles: [
      { name: "Encapuchado", kind: "Rogue_Hooded", show: ["Rogue_Cape"] },
      { name: "Con capa", kind: "Rogue", show: ["Rogue_Cape"] },
      { name: "Sin capa", kind: "Rogue", show: [] },
    ],
    skills: [
      { name: "Puñalada", desc: "Estocada rápida y fuerte al objetivo.", cd: 5, kind: "strike", range: 3, mult: 2, anim: "1H_Melee_Attack_Stab" },
      { name: "Paso sombrío", desc: "Apareces junto a un objetivo lejano y lo golpeas.", cd: 10, kind: "charge", range: 12, mult: 1.5, anim: "Dualwield_Melee_Attack_Stab" },
      { name: "Bomba de humo", desc: "Aturde 3 s a los enemigos cercanos.", cd: 14, kind: "aoe", radius: 4, mult: 0.5, stun: 3, anim: "Throw" },
    ],
  },
];
/** Tono que multiplica el color del personaje (el primero lo deja tal cual). */
export const TONES = [
  { name: "Natural", color: 0xffffff }, { name: "Cálido", color: 0xffdcb8 }, { name: "Frío", color: 0xcfdcff },
  { name: "Musgo", color: 0xdcf5c8 }, { name: "Rosado", color: 0xffcfd6 }, { name: "Ceniza", color: 0xc4c4d2 },
];

/** Elección del jugador: [clase, índice de aspecto dentro de la clase, índice de tono]. */
export type LookSel = [cls: ClassId, style: number, tone: number];
export const classOf = (id: string) => CLASSES.find(c => c.id === id);
/** Valida una elección llegada de fuera (red o base de datos). */
export function validLook(cls: unknown, style: unknown, tone: unknown): LookSel | null {
  const c = typeof cls === "string" ? classOf(cls) : undefined;
  if (!c || !Number.isInteger(style) || !Number.isInteger(tone)) return null;
  if ((style as number) < 0 || (style as number) >= c.styles.length || (tone as number) < 0 || (tone as number) >= TONES.length) return null;
  return [c.id, style as number, tone as number];
}
/** Aspecto transformado por la bendición de la diosa: mago -> mago de la luz, caballero -> paladín. */
export function blessedLook(look: LookSel): LookSel {
  const [cls, , tone] = look;
  if (cls === "mage") return ["mage", 3, tone];
  if (cls === "knight") return ["knight", 3, tone];
  return look;
}
export const styleOf = (look?: LookSel) => (look ? classOf(look[0])?.styles[look[1]] : undefined);
/** Habilidades del personaje: las de su aspecto (formas bendecidas) o, si no tiene, las de su clase. */
export const skillsOf = (look?: LookSel) => styleOf(look)?.skills ?? (look ? classOf(look[0])?.skills : undefined);
/** Pasiva del personaje: la de su forma bendecida o la de su clase. */
export const passiveOf = (look?: LookSel): PassiveDef | undefined => styleOf(look)?.passive ?? (look ? classOf(look[0])?.passive : undefined);
/** Montura del personaje (R). */
export const mountOf = (look?: LookSel): MountId => styleOf(look)?.mount ?? (look ? classOf(look[0])?.mount : undefined) ?? "horse";
/** Color de los efectos del personaje. */
export const lookColor = (look?: LookSel) => styleOf(look)?.color ?? (look ? classOf(look[0])?.color : undefined) ?? 0xefe6d0;
/** Devuelve true si el personaje está en su forma bendecida por la diosa. */
export function isBlessed(look?: LookSel): boolean {
  return !!look && (look[0] === "mage" || look[0] === "knight") && look[1] === 3;
}
