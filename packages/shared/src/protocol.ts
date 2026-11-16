// Protocolo v2 (JSON). El cliente envía intenciones, nunca estado.
import type { InvState, Slot } from "./items";

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "moveTo"; x: number; z: number } // intención: ir hacia un punto (cancela el objetivo)
  | { t: "input"; dx: number; dz: number; ry: number; dy?: number } // dy: subir/bajar (-1..1) cuando vuela
  | { t: "mount"; on: boolean } // subirse o bajarse de la escoba // WASD: dirección en el mundo (|d|<=1) y hacia dónde mira
  | { t: "jump" }
  | { t: "attack"; target: number } // intención: perseguir y atacar a una entidad
  | { t: "chat"; text: string }
  | { t: "equip"; item: string }
  | { t: "unequip"; slot: Slot };

export type EntityKind = "player" | "mob";

export interface EntityState {
  id: number;
  kind: EntityKind;
  name: string;
  level: number;
  x: number;
  z: number;
  ry: number; // orientación (rad, 0 = +Z)
  y?: number; // altura sobre el suelo (vuelo o caída)
  fly?: boolean; // montado en la escoba
  hp: number;
  maxHp: number;
  dead: boolean;
  weapon?: string; // equipo visible (público, como en Albion)
  armor?: string;
}

export type GameEvent =
  | { e: "hit"; from: number; to: number; dmg: number }
  | { e: "death"; id: number; killer: number }
  | { e: "chat"; from: number; name: string; text: string }
  | { e: "loot"; to: number; item: string; qty: number }
  | { e: "levelup"; id: number; level: number }
  | { e: "jump"; id: number };

export type ServerMsg =
  | { t: "welcome"; id: number; tickHz: number }
  | { t: "joined"; name: string }
  | { t: "joinError"; reason: "taken" | "invalid" }
  | { t: "snapshot"; tick: number; entities: EntityState[]; events: GameEvent[] }
  | ({ t: "inv" } & InvState); // estado privado: solo se envía a su dueño
