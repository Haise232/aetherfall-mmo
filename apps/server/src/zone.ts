import {
  FLY, ITEMS, LOOT_WOLF, MOB, MOB_SPAWNS, MOB_XP, PLAYER, SPAWN_POINT, TICK_MS, clampWorld, dist, inSafeZone, playerStats, resolveCollisions, stepMover, xpForNext,
  type ClientMsg, type Equip, type EntityState, type GameEvent, type Inventory, type Mover, type ServerMsg,
} from "@mmorpg/shared";
import type { CharStore } from "./store";

interface Ent extends Mover {
  id: number;
  kind: "player" | "mob";
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  dmg: number;
  defense: number;
  dead: boolean;
  respawnAt: number; // tick
  cooldownLeft: number; // seg
  target: number | null;
  spawnX: number;
  spawnZ: number;
  // Solo jugadores
  xp: number;
  inv: Inventory;
  equip: Equip;
  persistent: boolean; // true cuando ya eligió nombre: hasta entonces no existe para los demás
  ix: number; iz: number; // entrada WASD (dirección en el mundo)
  lastInput: number; // tick
  lastJump: number; // tick
  ry: number; // orientación
  fly: boolean; y: number; iy: number; // escoba: montado, altura y entrada vertical
}

const INPUT_TIMEOUT_TICKS = 10; // si el cliente deja de enviar entrada, se detiene
const JUMP_COOLDOWN_TICKS = 12;

const DT = TICK_MS / 1000;
const SAVE_EVERY_TICKS = Math.round(10 / DT);

// Una Zone es independiente del transporte y del almacenamiento: recibe un `send` y un `store`.
export class Zone {
  private ents = new Map<number, Ent>();
  private nextId = 1;
  private tick = 0;
  private events: GameEvent[] = [];

  constructor(private send: (id: number, msg: ServerMsg) => void, private store: CharStore) {
    MOB_SPAWNS.slice(0, MOB.count).forEach((p, i) => this.spawn("mob", `Lobo ${i + 1}`, p.x, p.z, MOB.maxHp));
  }

  private spawn(kind: "player" | "mob", name: string, x: number, z: number, maxHp: number): Ent {
    const e: Ent = {
      id: this.nextId++, kind, name, level: 1, x, z, tx: x, tz: z, hp: maxHp, maxHp,
      dmg: kind === "mob" ? MOB.damage : PLAYER.damage, defense: 0,
      dead: false, respawnAt: 0, cooldownLeft: 0, target: null, spawnX: x, spawnZ: z,
      xp: 0, inv: {}, equip: {}, persistent: false,
      ix: 0, iz: 0, lastInput: 0, lastJump: -100, ry: 0, fly: false, y: 0, iy: 0,
    };
    this.ents.set(e.id, e);
    return e;
  }

  connect(): number {
    // repartidos alrededor del punto de aparición para que no se amontonen
    const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 3.5;
    const [sx, sz] = resolveCollisions(SPAWN_POINT.x + Math.cos(a) * d, SPAWN_POINT.z + Math.sin(a) * d, 0.4);
    const e = this.spawn("player", "Jugador", sx, sz, PLAYER.maxHp);
    e.name = `Jugador${e.id}`;
    return e.id;
  }
  // Se llama cuando el transporte ya puede entregar mensajes a este id.
  welcome(id: number) {
    this.send(id, { t: "welcome", id, tickHz: 1000 / TICK_MS });
    const e = this.ents.get(id);
    if (e) this.sendInv(e);
  }
  disconnect(id: number) {
    const e = this.ents.get(id);
    if (e) this.save(e);
    this.ents.delete(id);
    for (const o of this.ents.values()) if (o.target === id) o.target = null;
  }

  // ---- Personaje ----
  private applyStats(e: Ent, fullHeal: boolean) {
    const s = playerStats(e.level, e.equip, PLAYER);
    e.maxHp = s.maxHp; e.dmg = s.damage; e.defense = s.defense;
    e.hp = fullHeal ? e.maxHp : Math.min(e.hp, e.maxHp);
  }
  private sendInv(e: Ent) {
    if (e.kind !== "player") return;
    this.send(e.id, { t: "inv", inv: e.inv, equip: e.equip, level: e.level, xp: e.xp, xpNext: xpForNext(e.level) });
  }
  private save(e: Ent) {
    if (e.kind === "player" && e.persistent) this.store.save(e.name, { level: e.level, xp: e.xp, inv: e.inv, equip: e.equip });
  }
  private addItem(e: Ent, item: string, qty: number) { e.inv[item] = (e.inv[item] ?? 0) + qty; }
  private takeItem(e: Ent, item: string): boolean {
    const n = e.inv[item] ?? 0;
    if (n <= 0) return false;
    if (n === 1) delete e.inv[item]; else e.inv[item] = n - 1;
    return true;
  }

  private join(p: Ent, rawName: string) {
    if (p.persistent) return; // solo se puede entrar una vez por conexión
    const name = String(rawName).replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16);
    if (name.length < 2) { this.send(p.id, { t: "joinError", reason: "invalid" }); return; }
    for (const o of this.ents.values()) if (o !== p && o.kind === "player" && o.persistent && o.name.toLowerCase() === name.toLowerCase()) {
      this.send(p.id, { t: "joinError", reason: "taken" }); return; // ya conectado
    }
    p.name = name;
    p.persistent = true;
    const d = this.store.load(name);
    if (d) { p.level = d.level; p.xp = d.xp; p.inv = d.inv; p.equip = d.equip; }
    this.applyStats(p, true);
    this.save(p);
    this.send(p.id, { t: "joined", name });
    this.sendInv(p);
  }

  handle(id: number, msg: ClientMsg) {
    const p = this.ents.get(id);
    if (!p || p.kind !== "player") return;
    switch (msg.t) {
      case "join":
        this.join(p, msg.name);
        break;
      case "input": {
        if (!p.persistent || ![msg.dx, msg.dz, msg.ry].every(Number.isFinite)) return;
        const m = Math.hypot(msg.dx, msg.dz), k = m > 1 ? 1 / m : 1; // nunca más rápido que la velocidad máxima
        p.ix = msg.dx * k; p.iz = msg.dz * k; p.ry = msg.ry; p.lastInput = this.tick;
        p.iy = typeof msg.dy === "number" && Number.isFinite(msg.dy) ? Math.max(-1, Math.min(1, msg.dy)) : 0;
        break;
      }
      case "mount":
        if (!p.persistent || p.dead) return;
        p.fly = msg.on === true;
        if (p.fly) p.target = null; // en la escoba no se combate
        break;
      case "jump":
        if (!p.persistent || p.dead || p.fly || this.tick - p.lastJump < JUMP_COOLDOWN_TICKS) return;
        p.lastJump = this.tick;
        this.events.push({ e: "jump", id });
        break;
      case "moveTo":
        if (!p.persistent || p.dead || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
        p.target = null;
        p.tx = clampWorld(msg.x); p.tz = clampWorld(msg.z); // validar siempre en el servidor
        break;
      case "attack": {
        const t = this.ents.get(msg.target);
        if (!p.persistent || p.dead || p.fly || !t || t.id === p.id || t.dead || t.fly) return;
        if (inSafeZone(p.x, p.z) || inSafeZone(t.x, t.z)) return; // ciudad: sin combate
        p.target = t.id;
        break;
      }
      case "chat": {
        const text = String(msg.text).slice(0, 120).trim();
        if (text) this.events.push({ e: "chat", from: id, name: p.name, text });
        break;
      }
      case "equip": {
        const def = ITEMS[msg.item];
        if (!def?.slot || !this.takeItem(p, msg.item)) return;
        const old = p.equip[def.slot];
        if (old) this.addItem(p, old, 1);
        p.equip[def.slot] = def.id;
        this.applyStats(p, false); this.sendInv(p); this.save(p);
        break;
      }
      case "unequip": {
        const cur = p.equip[msg.slot];
        if (!cur) return;
        delete p.equip[msg.slot];
        this.addItem(p, cur, 1);
        this.applyStats(p, false); this.sendInv(p); this.save(p);
        break;
      }
    }
  }

  // ---- Combate ----
  private damage(from: Ent, to: Ent) {
    if (inSafeZone(from.x, from.z) || inSafeZone(to.x, to.z)) { from.target = null; return; }
    if (from.fly || to.fly || to.y > 2.5) { from.target = null; return; } // fuera del alcance: en el aire
    const dmg = Math.max(1, from.dmg - to.defense);
    to.hp = Math.max(0, to.hp - dmg);
    this.events.push({ e: "hit", from: from.id, to: to.id, dmg });
    if (to.hp > 0) return;
    to.dead = true;
    to.target = null;
    to.respawnAt = this.tick + Math.round((to.kind === "player" ? PLAYER.respawnSec : MOB.respawnSec) / DT);
    this.events.push({ e: "death", id: to.id, killer: from.id });
    if (to.kind === "mob" && from.kind === "player") this.reward(from);
  }

  private reward(p: Ent) {
    for (const l of LOOT_WOLF) {
      if (Math.random() >= l.chance) continue;
      const qty = l.min + Math.floor(Math.random() * (l.max - l.min + 1));
      this.addItem(p, l.item, qty);
      this.events.push({ e: "loot", to: p.id, item: l.item, qty });
    }
    p.xp += MOB_XP;
    while (p.xp >= xpForNext(p.level)) {
      p.xp -= xpForNext(p.level);
      p.level++;
      this.applyStats(p, true);
      this.events.push({ e: "levelup", id: p.id, level: p.level });
    }
    this.sendInv(p);
    this.save(p);
  }

  private nearestPlayer(m: Ent, maxD: number): Ent | null {
    let best: Ent | null = null, bd = maxD;
    for (const e of this.ents.values()) {
      if (e.kind !== "player" || !e.persistent || e.dead || e.fly || e.y > 2.5 || inSafeZone(e.x, e.z)) continue;
      const d = dist(m.x, m.z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  step() {
    this.tick++;
    if (this.tick % SAVE_EVERY_TICKS === 0) for (const e of this.ents.values()) this.save(e);

    for (const e of this.ents.values()) {
      if (e.dead) {
        if (this.tick >= e.respawnAt) {
          e.dead = false; e.hp = e.maxHp; e.target = null; e.fly = false; e.y = 0;
          e.x = e.tx = e.kind === "player" ? SPAWN_POINT.x : e.spawnX;
          e.z = e.tz = e.kind === "player" ? SPAWN_POINT.z : e.spawnZ;
        }
        continue;
      }
      e.cooldownLeft = Math.max(0, e.cooldownLeft - DT);
      const stats = e.kind === "player" ? PLAYER : MOB;

      // IA del mob: elegir objetivo, soltarlo si se aleja demasiado del spawn.
      if (e.kind === "mob") {
        const cur = e.target !== null ? this.ents.get(e.target) : undefined;
        if (!cur || cur.dead || inSafeZone(cur.x, cur.z) || dist(e.x, e.z, e.spawnX, e.spawnZ) > MOB.leash) {
          e.target = null;
          const n = dist(e.x, e.z, e.spawnX, e.spawnZ) > MOB.leash ? null : this.nearestPlayer(e, MOB.aggro);
          if (n) e.target = n.id;
          else { e.tx = e.spawnX; e.tz = e.spawnZ; }
        }
      }

      if (e.kind === "player" && this.tick - e.lastInput > INPUT_TIMEOUT_TICKS) { e.ix = 0; e.iz = 0; e.iy = 0; }
      if (e.fly) e.y = Math.max(FLY.minY, Math.min(FLY.maxY, e.y + e.iy * FLY.vSpeed * DT));
      else if (e.y > 0) e.y = Math.max(0, e.y - FLY.fallSpeed * DT); // al desmontar, cae
      const speed = stats.speed * (e.fly ? FLY.speedMult : 1);
      const manual = e.ix !== 0 || e.iz !== 0; // con WASD el jugador manda; sin entrada persigue a su objetivo
      const tgt = e.target !== null ? this.ents.get(e.target) : undefined;
      if (tgt && !tgt.dead) {
        const d = dist(e.x, e.z, tgt.x, tgt.z);
        if (d > stats.range * (manual ? 1 : 0.9)) { if (!manual) { e.tx = tgt.x; e.tz = tgt.z; } }
        else {
          if (!manual) { e.tx = e.x; e.tz = e.z; e.ry = Math.atan2(tgt.x - e.x, tgt.z - e.z); }
          if (e.cooldownLeft === 0) { this.damage(e, tgt); e.cooldownLeft = stats.cooldown; }
        }
      } else if (e.target !== null) e.target = null;

      if (manual) {
        e.x += e.ix * speed * DT; e.z += e.iz * speed * DT;
        e.tx = e.x; e.tz = e.z;
      } else {
        const ox = e.x, oz = e.z;
        stepMover(e, stats.speed, DT);
        if (Math.hypot(e.x - ox, e.z - oz) > 1e-4) e.ry = Math.atan2(e.x - ox, e.z - oz);
      }
      [e.x, e.z] = resolveCollisions(e.x, e.z, e.kind === "player" ? 0.4 : 0.6, e.y);
    }

    // los jugadores que aún no han elegido nombre no existen para nadie
    const entities: EntityState[] = [...this.ents.values()].filter(e => e.kind === "mob" || e.persistent).map(e => ({
      id: e.id, kind: e.kind, name: e.name, level: e.level, x: e.x, z: e.z, ry: Math.round(e.ry * 100) / 100, y: e.y > 0 ? Math.round(e.y * 10) / 10 : undefined, fly: e.fly || undefined, hp: e.hp, maxHp: e.maxHp, dead: e.dead,
      weapon: e.equip.weapon, armor: e.equip.armor,
    }));
    const events = this.events;
    this.events = [];
    for (const e of this.ents.values()) {
      if (e.kind === "player") this.send(e.id, { t: "snapshot", tick: this.tick, entities, events });
    }
  }
}
