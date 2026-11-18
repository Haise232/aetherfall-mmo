import {
  BUFFS, EMOTES, WORLD_EVENTS, START_SKILLS, equippedSkills, skillKey, skillOptions, canRankUp, freePoints, validSkills, SKILL_SLOTS, type SkillState, RARITIES, baseItem, rollRichness, FLY, GATHER, REST_AFTER_HIT, REST_REGEN, SEATS, SEAT_RANGE, TOWNSFOLK_SEATS, GATHER_NODES, GATHER_TOOL, GATHER_RARE_XP, GATHER_XP, ITEMS, RARE_GATHER, gatherOfJob, gatherTime, rollGather, MOB, MOB_IDS, MOB_SPAWN_POINTS, mobOf, type MobId, NPCS, PLAYER, QUESTS, SPAWN_POINT, TALK_RANGE, TICK_MS, blessedLook, classOf, clampWorld, dist, inSafeZone, jobOf, jobXpForNext, npcOf, playerStats, questOf, resolveCollisions, skillsOf, MOUNTS, mountOf, SWIM, inWater, LAKE, MARKET_RANGE, DRAGON, DRAGON_LAIR, type MountId, MARKET_RATE_MS, isTradable, passiveOf, stepMover, validLook, xpForNext,
} from "@mmorpg/shared";
import type { CharStore } from "./store";
import { Auth, type AuthResult } from "./auth";
import type { Account } from "./store";
import { MarketBook, type MkResult } from "./market";
import type { BuffId, GatherKind, Pose, WorldEventId, ClientMsg, EntityState, Equip, GameEvent, Inventory, LookSel, Mover, ServerMsg, SkillDef } from "@mmorpg/shared";

interface Ent extends Mover {
  id: number;
  kind: "player" | "mob" | "boss";
  mob?: MobId; // tipo de criatura (solo kind "mob")
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
  coins: number; // besantes
  inv: Inventory;
  equip: Equip;
  skillCd: number[]; // seg que faltan a cada habilidad (teclas 1–4)
  skills: SkillState; // rango de cada habilidad aprendida y la elegida en cada casilla
  account: number | null; authBusy: boolean; // cuenta con la que se ha iniciado sesión (y si hay un inicio en curso)
  acc: Account | null; // datos de esa cuenta (rol y si debe cambiar la contraseña)
  lastAuthMs: number; // última solicitud de cuenta (para frenar abusos)
  stun: number; // seg aturdido
  sel: number | null; // entidad seleccionada (sin atacar)
  quest?: string; questCount: number; completedQuests: string[]; // misión activa, progreso y completadas
  job?: string; jobLevel: number; jobXp: number;
  buff: BuffId | null; buffLeft: number;
  named: boolean; // ya tiene nombre reservado (puede faltarle elegir clase y aspecto)
  look?: LookSel;
  persistent: boolean; // true cuando ya tiene nombre, clase y aspecto: hasta entonces no existe para los demás
  ix: number; iz: number; // entrada WASD (dirección en el mundo)
  lastInput: number; // tick
  lastJump: number; // tick
  ry: number; // orientación
  swim: boolean; // nadando en el lago
  fly: boolean; y: number; iy: number; // escoba: montado, altura y entrada vertical
  regenAcc: number; // vida regenerada pendiente (fracción de punto)
  gather: { kind: GatherKind; node?: number; corpse?: number; left: number; x: number; z: number } | null; // faena en curso
  skinned: boolean; // lobo abatido ya desollado
  pose: Pose | null; seat: number | null; poseRy: number; // descansando (banco, suelo o tumbado)
  lastHit: number; // tick del último golpe recibido (descansar solo cura fuera de combate)
  restAcc: number; // vida recuperada descansando pendiente (fracción de punto)
  mounts: MountId[]; mountSel: MountId | null; // monturas ganadas (el dragón) y la elegida (null: la de la clase)
  breathCd: number; // jefe: seg hasta el próximo aliento de fuego
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
  private market: MarketBook;
  private mkLast = new Map<number, number>(); // último mensaje de mercado por jugador (ms)
  private boardAt = 0;

  private auth: Auth;
  /** `requireAuth`: hay que iniciar sesión para jugar (el servidor real; las pruebas en proceso entran sin cuenta). */
  constructor(private send: (id: number, msg: ServerMsg) => void, private store: CharStore, private requireAuth = false) {
    this.auth = new Auth(store);
    if (requireAuth) void this.auth.ensureAdmin(); // primera vez: cuenta "admin"
    for (const id of MOB_IDS) for (const p of MOB_SPAWN_POINTS[id]) this.spawnMob(id, p.x, p.z);
    this.market = new MarketBook(store, {
      online: name => { for (const e of this.ents.values()) if (e.kind === "player" && e.persistent && e.name === name) return e; return undefined; },
      send: (id, m) => this.send(id, m),
      emit: e => this.events.push(e),
      save: e => this.save(e as Ent),
      sendInv: e => this.sendInv(e as Ent),
    });
  }

  /** Criatura de un tipo de mobs.ts con sus cifras. */
  private spawnMob(id: MobId, x: number, z: number, name?: string): Ent {
    const d = mobOf(id), e = this.spawn("mob", name ?? d.name, x, z, d.hp);
    e.mob = id; e.level = d.level; e.dmg = d.damage;
    return e;
  }
  private spawn(kind: Ent["kind"], name: string, x: number, z: number, maxHp: number): Ent {
    const e: Ent = {
      id: this.nextId++, kind, name, level: 1, x, z, tx: x, tz: z, hp: maxHp, maxHp,
      dmg: kind === "mob" ? MOB.damage : PLAYER.damage, defense: 0,
      dead: false, respawnAt: 0, cooldownLeft: 0, target: null, spawnX: x, spawnZ: z,
      xp: 0, coins: 0, inv: {}, equip: {}, skillCd: [0, 0, 0, 0], skills: START_SKILLS(), account: null, authBusy: false, acc: null, lastAuthMs: 0, stun: 0, sel: null, quest: "guild", questCount: 0, completedQuests: [], jobLevel: 1, jobXp: 0, buff: null, buffLeft: 0, named: false, persistent: false,
      ix: 0, iz: 0, lastInput: 0, lastJump: -100, ry: 0, swim: false, fly: false, y: 0, iy: 0, regenAcc: 0, gather: null, skinned: false, pose: null, seat: null, poseRy: 0, lastHit: -1e9, restAcc: 0, mounts: [], mountSel: null, breathCd: DRAGON.breath.every,
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
    if (e) { this.standUp(e); this.save(e); }
    this.ents.delete(id);
    this.mkLast.delete(id);
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
    this.send(e.id, {
      t: "inv", inv: e.inv, equip: e.equip, level: e.level, xp: e.xp, xpNext: xpForNext(e.level),
      quest: e.quest, questCount: e.questCount, completedQuests: e.completedQuests,
      job: e.job, jobLevel: e.jobLevel, jobXp: e.jobXp, jobXpNext: jobXpForNext(e.jobLevel), coins: e.coins,
      skills: e.skills, skillPoints: freePoints(e.level, e.skills), mounts: e.mounts, mount: e.mountSel,
    });
  }
  /** Montura con la que va: la ganada que haya elegido o, si no, la de su clase. */
  private mountFor(e: Ent): MountId { return e.mountSel && e.mounts.includes(e.mountSel) ? e.mountSel : mountOf(e.look); }
  private save(e: Ent) {
    if (e.kind === "player" && e.persistent) this.store.save(e.name, { level: e.level, xp: e.xp, inv: e.inv, equip: e.equip, look: e.look, quest: e.quest, questCount: e.questCount, completedQuests: e.completedQuests, job: e.job, jobLevel: e.jobLevel, jobXp: e.jobXp, coins: e.coins, skillRanks: e.skills, account: e.account, mounts: { have: e.mounts, sel: e.mountSel } });
  }
  private addItem(e: Ent, item: string, qty: number) { e.inv[item] = (e.inv[item] ?? 0) + qty; }
  private takeItem(e: Ent, item: string): boolean {
    const n = e.inv[item] ?? 0;
    if (n <= 0) return false;
    if (n === 1) delete e.inv[item]; else e.inv[item] = n - 1;
    return true;
  }

  /** Respuesta de sesión iniciada: personajes, si es administrador y si debe cambiar la contraseña. */
  private sendAuth(p: Ent, token?: string) {
    const a = p.acc!;
    this.send(p.id, { t: "auth", user: a.user, token, chars: this.store.listChars(a.id), admin: a.role === "admin" || undefined, mustChange: a.mustChange || undefined });
  }

  // ---- Administración ----
  /** Eventos del mundo activos: id -> fecha de fin (ms). */
  private worldEvents = new Map<WorldEventId, number>();
  private wolfMoonIds: number[] = [];
  private eventOn = (id: WorldEventId) => (this.worldEvents.get(id) ?? 0) > Date.now();
  private worldMsg = (): ServerMsg => ({ t: "world", events: [...this.worldEvents].map(([id, until]) => ({ id, until })) });
  private broadcast(m: ServerMsg) { for (const e of this.ents.values()) if (e.kind === "player") this.send(e.id, m); }
  private setEvent(id: WorldEventId, minutes: number) {
    if (minutes > 0) this.worldEvents.set(id, Date.now() + minutes * 60_000); else this.worldEvents.delete(id);
    if (id === "wolfmoon") this.syncWolfMoon();
    if (id === "dragon") this.syncDragon();
    this.broadcast(this.worldMsg());
  }
  /** Luna de lobos: otra manada en los mismos puntos de salida mientras dure. */
  private syncWolfMoon() {
    const on = this.eventOn("wolfmoon");
    if (on && !this.wolfMoonIds.length) for (const s of MOB_SPAWN_POINTS.wolf) this.wolfMoonIds.push(this.spawnMob("wolf", s.x + 3, s.z + 3, "Lobo de la luna").id);
    if (!on && this.wolfMoonIds.length) { for (const id of this.wolfMoonIds) { this.ents.delete(id); for (const o of this.ents.values()) if (o.target === id) o.target = null; } this.wolfMoonIds = []; }
  }
  // ---- Jefe dragón ----
  private dragonId: number | null = null;
  private dragonDmg = new Map<string, number>(); // daño hecho por cada jugador (por nombre: sobrevive a reconexiones)
  private dragonGoneAt = 0; // tick en que desaparece el cadáver
  /** Aparece al empezar el evento "dragon" y se va al terminar (si nadie lo mató antes). */
  private syncDragon() {
    const on = this.eventOn("dragon");
    if (on && this.dragonId === null) {
      const d = this.spawn("boss", DRAGON.name, DRAGON_LAIR.x, DRAGON_LAIR.z, DRAGON.maxHp);
      d.level = DRAGON.level; d.dmg = DRAGON.damage; d.ry = Math.PI * 0.25; // mira hacia la ciudad
      this.dragonId = d.id; this.dragonDmg.clear(); this.dragonGoneAt = 0; // (el aviso lo da el propio evento)
    }
    if (!on && this.dragonId !== null) this.removeDragon();
  }
  private removeDragon() {
    const id = this.dragonId; if (id === null) return;
    this.ents.delete(id); for (const o of this.ents.values()) { if (o.target === id) o.target = null; if (o.sel === id) o.sel = null; }
    this.dragonId = null; this.dragonDmg.clear(); this.dragonGoneAt = 0;
  }
  /** Muerte del dragón: experiencia a todos los que lucharon y la montura a quien hizo una parte del daño. */
  private dragonSlain(d: Ent) {
    const total = [...this.dragonDmg.values()].reduce((a, b) => a + b, 0) || 1;
    const names: string[] = [];
    for (const [name, dmg] of this.dragonDmg) {
      const p = [...this.ents.values()].find(e => e.kind === "player" && e.persistent && e.name === name);
      if (!p) continue; // desconectado: se lo pierde
      names.push(name);
      this.gainXp(p, DRAGON.xp);
      if (dmg / total >= DRAGON.minShare && !p.mounts.includes("dragon")) {
        p.mounts.push("dragon"); p.mountSel = "dragon";
        this.events.push({ e: "note", to: p.id, text: "¡Has domado a Vermithrax! Ahora es tu montura: pulsa R para volar con él (elige montura en el inventario)." });
      }
      this.sendInv(p); this.save(p);
    }
    this.events.push({ e: "announce", text: names.length ? `¡Vermithrax ha caído! Lo derrotaron: ${names.join(", ")}.` : "¡Vermithrax ha caído!" });
    this.dragonGoneAt = this.tick + Math.round(DRAGON.despawnSec / DT);
    d.respawnAt = Number.MAX_SAFE_INTEGER; // el jefe no reaparece solo
  }
  /** Aliento de fuego: cono delante del dragón que daña a todos los que pille. */
  private breath(d: Ent) {
    const b = DRAGON.breath;
    this.events.push({ e: "breath", id: d.id, ry: d.ry });
    for (const t of [...this.ents.values()]) {
      if (t.kind !== "player" || !this.hostile(d, t)) continue;
      const dx = t.x - d.x, dz = t.z - d.z, r = Math.hypot(dx, dz);
      if (r > b.range + 1) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - d.ry), Math.cos(Math.atan2(dx, dz) - d.ry)));
      if (r < DRAGON.radius + 1 || off <= b.halfAngle) this.damage(d, t, b.mult, 0, true);
    }
  }
  /** IA del dragón: persigue al jugador más cercano sin alejarse de la guarida; sin nadie, vuelve y se cura. */
  private stepDragon(d: Ent) {
    const cur = d.target !== null ? this.ents.get(d.target) : undefined;
    const far = dist(d.x, d.z, DRAGON_LAIR.x, DRAGON_LAIR.z) > DRAGON.leash;
    if (!cur || cur.dead || cur.fly || inSafeZone(cur.x, cur.z) || far) {
      d.target = null;
      const n = far ? null : this.nearestPlayer(d, DRAGON.aggro);
      if (n) d.target = n.id;
      else { d.tx = DRAGON_LAIR.x; d.tz = DRAGON_LAIR.z; if (dist(d.x, d.z, DRAGON_LAIR.x, DRAGON_LAIR.z) < 3 && d.hp < d.maxHp) { d.hp = Math.min(d.maxHp, d.hp + Math.ceil(d.maxHp * 0.05 * DT)); if (d.hp === d.maxHp) this.dragonDmg.clear(); } }
    }
    const t = d.target !== null ? this.ents.get(d.target) : undefined;
    if (t && (d.breathCd -= DT) <= 0 && dist(d.x, d.z, t.x, t.z) <= DRAGON.breath.range) {
      d.ry = Math.atan2(t.x - d.x, t.z - d.z);
      this.breath(d); d.breathCd = DRAGON.breath.every; d.cooldownLeft = Math.max(d.cooldownLeft, 1.5); // tras escupir fuego no muerde enseguida
    }
  }

  private adminState(p: Ent) {
    const online = [...this.ents.values()].filter(e => e.kind === "player" && e.persistent).map(e => ({ name: e.name, user: e.acc?.user ?? "", level: e.level }));
    const accounts = this.store.listAccounts().map(a => ({ user: a.user, email: a.email ?? undefined, note: a.note ?? undefined, status: a.status, role: a.role, created: a.created, lastLogin: a.lastLogin ?? undefined, chars: this.store.listChars(a.id).map(c => c.name) }));
    this.send(p.id, { t: "adminState", accounts, online, events: [...this.worldEvents].filter(([, u]) => u > Date.now()).map(([id, until]) => ({ id, until })) });
  }
  private kickAccount(account: number, text: string) {
    for (const e of [...this.ents.values()]) if (e.kind === "player" && e.account === account) { this.send(e.id, { t: "kicked", text }); this.disconnect(e.id); }
  }
  private adminOp(p: Ent, m: Extract<ClientMsg, { t: "admin" }>) {
    const res = (ok: boolean, text: string, extra: { tempPass?: string; user?: string } = {}) => { this.send(p.id, { t: "adminResult", ok, text, ...extra }); this.adminState(p); };
    const target = "user" in m && typeof m.user === "string" ? this.store.findAccount(m.user) : undefined;
    switch (m.op) {
      case "refresh": this.adminState(p); return;
      case "approve": case "resetPass": {
        if (!target) return res(false, "No existe esa cuenta.");
        (m.op === "approve" ? this.auth.approve(target.user) : this.auth.resetPass(target.user)).then(pass => {
          if (!pass) return res(false, "No se pudo.");
          if (m.op === "resetPass") this.kickAccount(target.id, "El administrador ha cambiado tu contraseña. Entra con la nueva.");
          res(true, m.op === "approve" ? `Cuenta «${target.user}» aprobada.` : `Nueva contraseña temporal para «${target.user}».`, { tempPass: pass, user: target.user });
        });
        return;
      }
      case "reject":
        if (!target || target.status !== "pending") return res(false, "Solo se pueden rechazar solicitudes pendientes.");
        this.store.deleteAccount(target.id); return res(true, `Solicitud de «${target.user}» rechazada.`);
      case "ban": case "unban":
        if (!target) return res(false, "No existe esa cuenta.");
        if (target.role === "admin") return res(false, "No se puede bloquear a un administrador.");
        this.store.setStatus(target.id, m.op === "ban" ? "banned" : "active");
        if (m.op === "ban") this.kickAccount(target.id, "Tu cuenta ha sido bloqueada.");
        return res(true, m.op === "ban" ? `«${target.user}» bloqueada.` : `«${target.user}» desbloqueada.`);
      case "kick": {
        const e = [...this.ents.values()].find(x => x.kind === "player" && x.persistent && x.name === m.name);
        if (!e) return res(false, "Ese personaje no está conectado.");
        if (e.id === p.id) return res(false, "No puedes expulsarte a ti mismo.");
        this.send(e.id, { t: "kicked", text: "Un administrador te ha expulsado del juego." }); this.disconnect(e.id);
        return res(true, `«${m.name}» expulsado.`);
      }
      case "event": {
        if (!(m.id in WORLD_EVENTS)) return res(false, "Evento desconocido.");
        const min = Math.max(0, Math.min(24 * 60, Math.round(Number(m.minutes) || 0)));
        this.setEvent(m.id, min);
        if (min > 0) this.events.push({ e: "announce", text: `¡${WORLD_EVENTS[m.id].name}! ${WORLD_EVENTS[m.id].desc} (${min} min)` });
        return res(true, min > 0 ? `${WORLD_EVENTS[m.id].name}: ${min} min.` : `${WORLD_EVENTS[m.id].name} terminado.`);
      }
      case "announce": {
        const text = String(m.text ?? "").trim().slice(0, 200);
        if (!text) return res(false, "Escribe el aviso.");
        this.events.push({ e: "announce", text }); return res(true, "Aviso enviado.");
      }
    }
  }

  private join(p: Ent, rawName: string) {
    if (p.persistent) return; // solo se puede entrar una vez por conexión (antes de elegir clase se puede cambiar de nombre)
    if (p.acc?.mustChange) { this.send(p.id, { t: "joinError", reason: "auth" }); return; } // primero, cambiar la contraseña temporal
    if (this.requireAuth && p.account === null) { this.send(p.id, { t: "joinError", reason: "auth" }); return; } // antes, iniciar sesión
    const name = String(rawName).replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16);
    if (name.length < 2) { this.send(p.id, { t: "joinError", reason: "invalid" }); return; }
    for (const o of this.ents.values()) if (o !== p && o.kind === "player" && o.named && o.name.toLowerCase() === name.toLowerCase()) {
      this.send(p.id, { t: "joinError", reason: "taken" }); return; // ya conectado
    }
    if (p.account !== null) {
      const can = this.auth.canPlay(p.account, name);
      if (!can.ok) { this.send(p.id, { t: "joinError", reason: can.reason }); return; }
      if (can.claim) this.store.setCharOwner(name, p.account); // personaje de antes de las cuentas: pasa a esta cuenta
    }
    p.name = name;
    p.named = true;
    const d = this.store.load(name);
    p.level = d?.level ?? 1; p.xp = d?.xp ?? 0; p.coins = d?.coins ?? 0; p.inv = d?.inv ?? {}; p.equip = d?.equip ?? {}; p.look = d?.look;
    p.skills = validSkills(d?.skillRanks, p.level);
    const mo = d?.mounts as { have?: unknown; sel?: unknown } | undefined; // monturas ganadas: solo ids válidos
    p.mounts = Array.isArray(mo?.have) ? (mo.have as unknown[]).filter((m): m is MountId => typeof m === "string" && m in MOUNTS) : [];
    p.mountSel = typeof mo?.sel === "string" && p.mounts.includes(mo.sel as MountId) ? mo.sel as MountId : null;
    p.quest = d?.quest ?? "guild"; p.questCount = d?.questCount ?? 0; p.completedQuests = d?.completedQuests ?? [];
    p.job = d?.job; p.jobLevel = d?.jobLevel ?? 1; p.jobXp = d?.jobXp ?? 0;
    this.giveTool(p, false); // quien ya tenía oficio de antes de las herramientas la recibe al entrar
    if (p.look) this.enter(p);
    else this.send(p.id, { t: "needLook", name }); // personaje nuevo (o anterior a las clases): falta elegir
  }
  private enter(p: Ent) {
    if (p.account !== null) { // otra cuenta pudo crear este nombre mientras elegías la clase
      const o = this.store.charOwner(p.name);
      if (o !== undefined && o !== null && o !== p.account) { p.named = false; this.send(p.id, { t: "joinError", reason: "taken" }); return; }
    }
    // mientras elegía aspecto pudo recibir cobros por SQL (estaba desconectado para el mercado): se relee antes de guardar
    const fresh = this.store.load(p.name);
    if (fresh) { p.coins = fresh.coins ?? 0; p.inv = fresh.inv; }
    p.persistent = true;
    this.applyStats(p, true);
    this.save(p);
    this.send(p.id, { t: "joined", name: p.name });
    this.sendInv(p);
    if (this.worldEvents.size) this.send(p.id, this.worldMsg()); // eventos en curso
  }

  handle(id: number, msg: ClientMsg) {
    const p = this.ents.get(id);
    if (!p || p.kind !== "player") return;
    switch (msg.t) {
      case "register": {
        if (p.account !== null) return;
        const now = Date.now(); if (now - p.lastAuthMs < 2000) return; p.lastAuthMs = now; // sin avalanchas de solicitudes
        const r = this.auth.register(msg.user, msg.email, msg.note);
        this.send(p.id, r.ok ? { t: "registered", text: r.text } : { t: "authError", reason: "invalid", text: r.text });
        break;
      }
      case "login": case "resume": {
        if (p.account !== null || p.authBusy) return; // ya dentro, o esperando la respuesta anterior
        p.authBusy = true;
        const done = (r: AuthResult) => {
          p.authBusy = false;
          if (!this.ents.has(p.id)) return; // se desconectó mientras tanto
          if (!r.ok) { this.send(p.id, { t: "authError", reason: r.reason, text: r.text }); return; }
          p.account = r.account.id; p.acc = r.account;
          this.sendAuth(p, r.token);
        };
        const fail = () => { p.authBusy = false; this.send(p.id, { t: "authError", reason: "invalid", text: "No se pudo completar. Inténtalo de nuevo." }); };
        if (msg.t === "resume") done(this.auth.resume(msg.token));
        else this.auth.login(msg.user, msg.pass, msg.remember === true).then(done, fail);
        break;
      }
      case "changePass": {
        if (!p.acc || p.authBusy) return;
        p.authBusy = true;
        this.auth.changePass(p.acc, msg.pass).then(r => {
          p.authBusy = false; if (!this.ents.has(p.id)) return;
          if (!r.ok) this.send(p.id, { t: "authError", reason: "weak", text: r.text }); else this.sendAuth(p);
        }, () => { p.authBusy = false; });
        break;
      }
      case "admin": {
        if (!p.acc || p.acc.role !== "admin" || p.acc.mustChange) return; // solo administradores (y con su contraseña ya cambiada)
        this.adminOp(p, msg);
        break;
      }
      case "logout":
        this.auth.logout(msg.token);
        if (!p.persistent) p.account = null; // en pantalla de personajes: vuelve a la de entrada
        break;
      case "join":
        this.join(p, msg.name);
        break;
      case "create": {
        if (!p.named || p.persistent) return; // solo una vez, y después de tener nombre
        const look = validLook(msg.cls, msg.style, msg.tone);
        if (!look) return;
        p.look = look;
        this.enter(p);
        break;
      }
      case "input": {
        if (!p.persistent || ![msg.dx, msg.dz, msg.ry].every(Number.isFinite)) return;
        const m = Math.hypot(msg.dx, msg.dz), k = m > 1 ? 1 / m : 1; // nunca más rápido que la velocidad máxima
        p.ix = msg.dx * k; p.iz = msg.dz * k; p.ry = msg.ry; p.lastInput = this.tick;
        p.iy = typeof msg.dy === "number" && Number.isFinite(msg.dy) ? Math.max(-1, Math.min(1, msg.dy)) : 0;
        break;
      }
      case "pickMount": {
        if (!p.persistent || p.dead) return;
        const id = msg.id === null ? null : typeof msg.id === "string" && p.mounts.includes(msg.id) ? msg.id : undefined;
        if (id === undefined) return;
        if (p.fly && p.y > 2.5 && !MOUNTS[id ?? mountOf(p.look)].flies) { this.events.push({ e: "note", to: p.id, text: "Aterriza antes de cambiar a una montura que no vuela." }); return; }
        p.mountSel = id; this.sendInv(p); this.save(p);
        break;
      }
      case "mount":
        if (!p.persistent || p.dead || p.swim) return; // en el agua no se monta
        p.fly = msg.on === true;
        if (p.fly) p.target = null; // montado no se combate
        break;
      case "jump":
        // a pie o en montura de tierra (el caballo salta con su jinete); en la escoba, Espacio sube
        if (!p.persistent || p.dead || (p.fly && MOUNTS[this.mountFor(p)].flies) || p.swim || this.tick - p.lastJump < JUMP_COOLDOWN_TICKS) return;
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
        if (!p.persistent || p.dead || p.fly || p.swim || !t || t.id === p.id || t.dead || t.fly) return;
        if (inSafeZone(p.x, p.z) || inSafeZone(t.x, t.z)) return; // ciudad: sin combate
        p.target = t.id; p.sel = t.id;
        break;
      }
      case "skill": {
        const slot = Number(msg.slot), eq = Number.isInteger(slot) ? equippedSkills(p.look, p.skills)[slot] : undefined;
        if (!eq || eq.rank < 1) return; // la definitiva (y cualquier habilidad) hay que aprenderla
        const sk = eq.sk;
        if (!p.persistent || p.dead || p.fly || p.swim || p.stun > 0 || p.skillCd[slot]! > 0) return;
        const to = this.cast(p, sk);
        if (to === false) return; // sin objetivo válido: no gasta el enfriamiento
        p.gather = null; // combatir interrumpe la faena
        p.skillCd[slot] = sk.cd * (passiveOf(p.look)?.cdMult ?? 1);
        this.events.push({ e: "cast", id, slot, k: eq.key, to: to ?? undefined });
        break;
      }
      case "select":
        if (!p.persistent) return;
        p.sel = msg.target === null ? null : this.ents.has(Number(msg.target)) ? Number(msg.target) : null;
        if (p.target !== p.sel) p.target = null; // cambiar de objetivo (o soltarlo) detiene el ataque
        break;
      case "job": {
        const job = jobOf(msg.job);
        const guildMaster = npcOf("guild_master")!;
        if (!p.persistent || p.dead || !job || dist(p.x, p.z, guildMaster.x, guildMaster.z) > TALK_RANGE + 1) return;
        if (p.job !== job.id) { p.jobLevel = 1; p.jobXp = 0; p.gather = null; } // cada oficio empieza de cero
        p.job = job.id;
        this.giveTool(p, true);
        if (p.quest === "guild") this.advanceQuest(p);
        this.sendInv(p); this.save(p);
        break;
      }
      case "changeClass": {
        const guildMaster = npcOf("guild_master")!;
        if (!p.persistent || p.dead || dist(p.x, p.z, guildMaster.x, guildMaster.z) > TALK_RANGE + 1) return;
        const look = validLook(msg.cls, msg.style, msg.tone);
        if (!look) return;
        if (p.look?.[0] !== look[0]) { p.skills = START_SKILLS(); this.note(p, "Nueva clase: tus puntos de habilidad vuelven a estar libres (K)."); } // otra clase, otras habilidades
        p.look = look;
        this.applyStats(p, true);
        this.sendInv(p); this.save(p);
        break;
      }
      case "skillUp": {
        if (!p.persistent) return;
        const slot = Number(msg.slot), opt = slot === SKILL_SLOTS - 1 ? 0 : Number(msg.opt);
        const why = canRankUp(p.look, p.level, p.skills, slot, opt);
        if (why) { this.note(p, why); this.sendInv(p); return; }
        const key = skillKey(slot, opt), rank = (p.skills.ranks[key] ?? 0) + 1;
        p.skills.ranks[key] = rank;
        const sk = skillOptions(p.look, slot)[opt];
        if (rank === 1 && slot < SKILL_SLOTS - 1) { p.skills.pick[slot] = opt; p.skillCd[slot] = Math.max(p.skillCd[slot]!, 2); } // la recién aprendida se equipa
        this.note(p, rank === 1 ? `Has aprendido ${sk?.name ?? "una habilidad"}.` : `${sk?.name ?? "Habilidad"}: rango ${rank}.`);
        this.sendInv(p); this.save(p);
        break;
      }
      case "skillPick": {
        if (!p.persistent) return;
        const slot = Number(msg.slot), opt = Number(msg.opt);
        if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS - 1 || !Number.isInteger(opt) || !skillOptions(p.look, slot)[opt]) return;
        if ((p.skills.ranks[skillKey(slot, opt)] ?? 0) < 1) { this.note(p, "Primero tienes que aprender esa habilidad."); return; }
        if (p.skills.pick[slot] !== opt) { p.skills.pick[slot] = opt; p.skillCd[slot] = Math.max(p.skillCd[slot]!, 2); } // cambiar en pleno combate tiene un pequeño coste
        this.sendInv(p); this.save(p);
        break;
      }
      case "skillReset": {
        if (!p.persistent) return;
        if (this.tick - p.lastHit < REST_AFTER_HIT / DT) { this.note(p, "No puedes reorganizar tus habilidades en pleno combate."); return; }
        p.skills = START_SKILLS();
        this.note(p, "Has recuperado todos tus puntos de habilidad.");
        this.sendInv(p); this.save(p);
        break;
      }
      case "questTalk": {
        if (!p.persistent || p.dead) return;
        const npc = npcOf(msg.npc);
        if (!npc || dist(p.x, p.z, npc.x, npc.z) > TALK_RANGE + 1) return;
        this.talkToNpc(p, npc.id);
        break;
      }
      case "gather": {
        this.startGather(p, msg.node, msg.corpse);
        break;
      }
      case "sit": {
        this.sit(p, Number(msg.seat));
        break;
      }
      case "questProgress": {
        if (!p.persistent || p.dead || msg.kind !== "pray") return;
        this.progressPray(p);
        break;
      }
      case "mkOpen": case "mkBook": case "mkPlace": case "mkCancel": case "mkClaim": case "mkSellNpc":
        this.handleMarket(p, msg);
        break;
      case "chat": {
        const text = String(msg.text).slice(0, 120).trim();
        if (text.startsWith("/")) { this.emote(p, text.split(/\s+/)[0]!.toLowerCase()); break; } // gestos: /saludar, /sentarse...
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

  // ---- Casa de subastas (la lógica vive en market.ts; aquí solo se valida el acceso) ----
  private handleMarket(p: Ent, msg: Extract<ClientMsg, { t: `mk${string}` }>) {
    if (!p.persistent || p.dead) return;
    const now = Date.now();
    if (now - (this.mkLast.get(p.id) ?? 0) < MARKET_RATE_MS) { this.send(p.id, { t: "mkResult", ok: false, reason: "rate", text: "Más despacio, por favor." }); return; }
    this.mkLast.set(p.id, now);
    const au = npcOf("auctioneer")!;
    if (dist(p.x, p.z, au.x, au.z) > MARKET_RANGE) { this.send(p.id, { t: "mkResult", ok: false, reason: "far", text: "Acércate al subastador." }); return; }
    const m = msg as Record<string, unknown>;
    const bad = (): MkResult => ({ ok: false, reason: "invalid", text: "Petición no válida." });
    let res: MkResult | undefined;
    switch (msg.t) {
      case "mkOpen":
        res = this.market.open(p);
        this.send(p.id, this.market.board());
        break;
      case "mkBook":
        if (typeof m.item !== "string" || !isTradable(m.item)) res = bad();
        else this.send(p.id, { t: "mkBook", book: this.market.book(m.item) });
        break;
      case "mkPlace":
        res = typeof m.item === "string" && typeof m.price === "number" && typeof m.qty === "number" ? this.market.place(p, m.side as "buy" | "sell", m.item, m.price, m.qty) : bad();
        break;
      case "mkCancel":
        res = typeof m.order === "number" ? this.market.cancel(p, m.order) : bad();
        break;
      case "mkClaim": res = this.market.claim(p); break;
      case "mkSellNpc":
        res = typeof m.item === "string" && typeof m.qty === "number" ? this.market.sellNpc(p, m.item, m.qty) : bad();
        break;
    }
    if (!res) return;
    if (!res.ok || msg.t !== "mkOpen") this.send(p.id, { t: "mkResult", ok: res.ok, reason: res.reason, text: res.text });
  }

  // ---- Combate ----
  /** A quién puede dañar `p` ahora mismo (fuera de la ciudad, en el suelo, vivo). */
  private hostile(p: Ent, t: Ent | undefined): t is Ent {
    return !!t && t !== p && !t.dead && !t.fly && t.y <= 2.5 && (t.kind !== "player" || t.persistent) && !inSafeZone(t.x, t.z);
  }
  /** Ejecuta una habilidad. Devuelve el id del objetivo, null si no tiene, o false si no se pudo lanzar. */
  private cast(p: Ent, sk: SkillDef): number | null | false {
    const heal = () => {
      const amount = Math.min(p.maxHp - p.hp, Math.round(p.maxHp * (sk.heal ?? 0)));
      if (amount > 0) { p.hp += amount; this.events.push({ e: "heal", id: p.id, amount }); }
    };
    if (sk.kind === "heal") { heal(); return null; }
    if (sk.kind === "buff") { p.buff = sk.buff ?? null; p.buffLeft = sk.dur ?? 0; heal(); return null; }
    if (sk.kind === "blink") {
      // avanza a pasos cortos; se detiene si un obstáculo lo desvía (no atraviesa muros)
      const dx = Math.sin(p.ry), dz = Math.cos(p.ry);
      for (let d = 0.5; d <= (sk.range ?? 0); d += 0.5) {
        const wx = p.x + dx * 0.5, wz = p.z + dz * 0.5, [nx, nz] = resolveCollisions(wx, wz, 0.4, p.y);
        if (Math.hypot(nx - wx, nz - wz) > 0.05) break;
        p.x = nx; p.z = nz;
      }
      p.tx = p.x; p.tz = p.z; p.target = null;
      return null;
    }
    if (inSafeZone(p.x, p.z)) return false; // ciudad: sin combate
    if (sk.kind === "aoe") {
      for (const t of [...this.ents.values()]) if (this.hostile(p, t) && dist(p.x, p.z, t.x, t.z) <= (sk.radius ?? 0)) this.damage(p, t, sk.mult, sk.stun, true);
      heal();
      return null;
    }
    // strike / charge: el seleccionado, si no el que atacas y, si no, la criatura más cercana a tu alcance
    const range = sk.range ?? PLAYER.range;
    const inReach = (o: Ent | undefined): o is Ent => this.hostile(p, o) && dist(p.x, p.z, o.x, o.z) <= range;
    let t = p.sel !== null ? this.ents.get(p.sel) : undefined;
    if (!inReach(t)) t = p.target !== null ? this.ents.get(p.target) : undefined;
    if (!inReach(t)) {
      t = undefined; let bd = range;
      for (const o of this.ents.values()) { const d = dist(p.x, p.z, o.x, o.z); if (o.kind !== "player" && this.hostile(p, o) && d <= bd) { bd = d; t = o; } }
    }
    if (!t) return false;
    const d = dist(p.x, p.z, t.x, t.z);
    if (sk.kind === "charge" && d > 1.6) {
      [p.x, p.z] = resolveCollisions(t.x + ((p.x - t.x) / d) * 1.5, t.z + ((p.z - t.z) / d) * 1.5, 0.4, p.y);
      p.tx = p.x; p.tz = p.z;
    }
    p.ry = Math.atan2(t.x - p.x, t.z - p.z);
    p.target = t.id; p.sel = t.id;
    const id = t.id;
    this.damage(p, t, sk.mult, sk.stun, true);
    heal();
    return id;
  }

  private damage(from: Ent, to: Ent, mult = 1, stun = 0, skill = false) {
    if (inSafeZone(from.x, from.z) || inSafeZone(to.x, to.z)) { from.target = null; return; }
    if (from.fly || to.fly || to.y > 2.5) { from.target = null; return; } // fuera del alcance: en el aire
    const pa = from.kind === "player" ? passiveOf(from.look) : undefined, pd = to.kind === "player" ? passiveOf(to.look) : undefined;
    if (to.kind !== "player" && to.target === null) to.target = from.id; // el golpeado responde
    if (to.kind === "boss" && from.kind === "player") this.dragonDmg.set(from.name, (this.dragonDmg.get(from.name) ?? 0) + Math.min(to.hp, Math.max(1, from.dmg * mult)));
    to.lastHit = this.tick; if (to.pose) this.standUp(to); // un golpe interrumpe el descanso
    if (pd?.block && Math.random() < pd.block) { this.events.push({ e: "hit", from: from.id, to: to.id, dmg: 0, sk: skill || undefined, block: true }); return; }
    const crit = !!pa?.crit && Math.random() < pa.crit;
    const rage = pa?.rage ? 1 + pa.rage * (1 - from.hp / from.maxHp) : 1;
    let dmg = Math.max(1, Math.round(from.dmg * mult * rage * (crit ? pa!.critMult ?? 2 : 1) * (from.buff ? BUFFS[from.buff].dealt : 1)) - to.defense);
    if (to.buff) dmg = Math.max(1, Math.round(dmg * BUFFS[to.buff].taken));
    if (pd?.taken) dmg = Math.max(1, Math.round(dmg * pd.taken));
    if (to.kind === "mob" && stun > 0) to.stun = Math.max(to.stun, stun);
    to.hp = Math.max(0, to.hp - dmg);
    this.events.push({ e: "hit", from: from.id, to: to.id, dmg, sk: skill || undefined, crit: crit || undefined });
    if (pa?.lifesteal) this.healBy(from, dmg * pa.lifesteal);
    if (to.hp > 0) return;
    if (pa?.killHeal) this.healBy(from, from.maxHp * pa.killHeal);
    to.dead = true; this.standUp(to);
    to.target = null;
    to.respawnAt = this.tick + Math.round((to.kind === "player" ? PLAYER.respawnSec : mobOf(to.mob).respawnSec) / DT);
    this.events.push({ e: "death", id: to.id, killer: from.id });
    if (to.kind === "mob" && from.kind === "player") this.reward(from, to.mob ?? "wolf");
    if (to.kind === "boss") this.dragonSlain(to);
  }

  /** Cura (redondeando) y avisa a los clientes. */
  private healBy(e: Ent, amount: number) {
    const n = Math.min(e.maxHp - e.hp, Math.round(amount));
    if (n > 0 && !e.dead) { e.hp += n; this.events.push({ e: "heal", id: e.id, amount: n }); }
  }

  private reward(p: Ent, id: MobId) {
    const def = mobOf(id);
    for (const l of def.loot) {
      if (Math.random() >= l.chance) continue;
      const qty = l.min + Math.floor(Math.random() * (l.max - l.min + 1));
      this.addItem(p, l.item, qty);
      this.events.push({ e: "loot", to: p.id, item: l.item, qty });
      this.progressCollect(p, l.item, qty);
    }
    this.gainXp(p, def.xp);
    this.progressKill(p, id);
    this.sendInv(p);
    this.save(p);
  }

  // ---- Descanso y gestos ----
  /** Asiento ocupado: id del asiento -> id del jugador. */
  private seated = new Map<number, number>();
  private sit(p: Ent, seatId: number) {
    if (!p.persistent || p.dead || p.fly || p.swim || p.stun > 0) return;
    const s = SEATS[seatId];
    if (!s || !Number.isInteger(seatId)) return;
    if (dist(p.x, p.z, s.x, s.z) > SEAT_RANGE) return;
    const taken = this.seated.get(s.id);
    if (TOWNSFOLK_SEATS.has(s.id) || (taken !== undefined && taken !== p.id)) { this.note(p, "Ese sitio está ocupado."); return; }
    this.standUp(p);
    p.gather = null; p.target = null; p.ix = p.iz = 0;
    p.x = p.tx = s.x; p.z = p.tz = s.z; p.ry = p.poseRy = s.ry;
    p.pose = "chair"; p.seat = s.id; this.seated.set(s.id, p.id);
  }
  /** Levantarse: del banco sale por delante (o por detrás si delante hay algo, como en las mesas). */
  private standUp(p: Ent) {
    if (!p.pose) return;
    if (p.seat !== null) {
      const s = SEATS[p.seat]!;
      this.seated.delete(p.seat); p.seat = null;
      for (const k of [0.95, -0.95, 1.4, -1.4]) {
        const fx = s.x + Math.sin(s.ry) * k, fz = s.z + Math.cos(s.ry) * k, [x, z] = resolveCollisions(fx, fz, 0.4);
        if (Math.hypot(x - fx, z - fz) < 0.05) { p.x = p.tx = x; p.z = p.tz = z; break; }
      }
    }
    p.pose = null; p.restAcc = 0;
  }
  private emote(p: Ent, cmd: string) {
    if (!p.persistent || p.dead) return;
    const em = EMOTES[cmd];
    if (!em) { this.note(p, "Gestos: " + Object.keys(EMOTES).join(", ")); return; }
    if (em.pose) {
      if (p.fly || p.swim || p.gather) return;
      this.standUp(p);
      p.target = null; p.ix = p.iz = 0; p.tx = p.x; p.tz = p.z; p.poseRy = p.ry; p.pose = em.pose;
    }
    this.events.push({ e: "emote", id: p.id, anim: em.anim, text: em.text });
  }
  /** Mientras descansa: no se mueve; cualquier intención de moverse, atacar o trabajar le levanta. Fuera de combate recupera vida. */
  private stepRest(p: Ent): boolean {
    if (p.ix !== 0 || p.iz !== 0 || p.target !== null || p.gather || p.fly || Math.hypot(p.tx - p.x, p.tz - p.z) > 0.05) { this.standUp(p); return false; }
    p.ry = p.poseRy;
    if (p.hp < p.maxHp && this.tick - p.lastHit > REST_AFTER_HIT / DT) {
      p.restAcc += p.maxHp * REST_REGEN * DT;
      if (p.restAcc >= 1) { const n = Math.min(p.maxHp - p.hp, Math.floor(p.restAcc)); p.hp += n; p.restAcc -= n; }
    }
    return true;
  }

  // ---- Recolección (oficios) ----
  /** Tick en que cada punto de recolección vuelve a estar disponible. */
  private nodeUp = new Array<number>(GATHER_NODES.length).fill(0);
  /** Riqueza de cada punto (0 normal; 1..3 brilla y da mejores rarezas). */
  private nodeRich = GATHER_NODES.map(() => rollRichness());
  private note(p: Ent, text: string) { this.events.push({ e: "note", to: p.id, text }); }
  /** El gremio entrega la herramienta del oficio si no la tiene. */
  private giveTool(p: Ent, tell: boolean) {
    const kind = gatherOfJob(p.job), tool = kind && GATHER_TOOL[kind];
    if (!tool || (p.inv[tool] ?? 0) > 0) return;
    this.addItem(p, tool, 1);
    this.events.push({ e: "loot", to: p.id, item: tool, qty: 1 });
    if (tell) this.note(p, `El maestro del gremio te entrega tu herramienta: ${ITEMS[tool]?.name ?? tool}. Sin ella no podrás trabajar.`);
  }
  private startGather(p: Ent, nodeId?: number, corpseId?: number) {
    if (!p.persistent || p.dead || p.fly || p.swim || p.stun > 0 || p.gather) return;
    const kind = gatherOfJob(p.job);
    if (!kind) { this.note(p, "Necesitas un oficio. Habla con el maestro del gremio."); return; }
    const def = GATHER[kind], tool = GATHER_TOOL[kind];
    if ((p.inv[tool] ?? 0) <= 0) { this.note(p, `Necesitas la herramienta de tu oficio (${ITEMS[tool]?.name ?? tool}): habla con el maestro del gremio.`); return; }
    let x: number, z: number;
    if (kind === "skin") {
      const c = corpseId !== undefined ? this.ents.get(Number(corpseId)) : undefined;
      if (!c || c.kind !== "mob" || !c.dead) return;
      if (!mobOf(c.mob).skin) { this.note(p, `${mobOf(c.mob).name}: no tiene piel que desollar.`); return; }
      if (c.skinned) { this.note(p, def.empty); return; }
      x = c.x; z = c.z;
    } else {
      const n = nodeId !== undefined ? GATHER_NODES[Number(nodeId)] : undefined;
      if (!n) return;
      if (n.kind !== kind) { this.note(p, `Eso no es para tu oficio: necesitas ser ${n.kind === "fish" ? "pescador" : n.kind === "ore" ? "minero" : "recolector"}.`); return; }
      if (this.nodeUp[n.id]! > this.tick) { this.note(p, def.empty); return; }
      x = n.x; z = n.z;
    }
    if (dist(p.x, p.z, x, z) > def.range + 0.6) return;
    p.target = null; p.ix = p.iz = 0;
    p.ry = Math.atan2(x - p.x, z - p.z);
    p.gather = { kind, node: kind === "skin" ? undefined : Number(nodeId), corpse: kind === "skin" ? Number(corpseId) : undefined, left: gatherTime(kind, p.jobLevel), x: p.x, z: p.z };
  }
  /** Avanza la faena; se interrumpe si el jugador se mueve, ataca, monta o el recurso desaparece. */
  private stepGather(p: Ent) {
    const g = p.gather!;
    const moved = Math.hypot(p.x - g.x, p.z - g.z) > 0.3 || p.ix !== 0 || p.iz !== 0;
    const corpse = g.corpse !== undefined ? this.ents.get(g.corpse) : undefined;
    const gone = g.kind === "skin" ? !corpse || !corpse.dead || corpse.skinned : this.nodeUp[g.node!]! > this.tick;
    if (p.dead || p.fly || p.swim || p.stun > 0 || p.target !== null || moved || gone) { p.gather = null; return; }
    if ((g.left -= DT) > 0) return;
    p.gather = null;
    const rich = g.kind === "skin" ? 0 : this.nodeRich[g.node!] ?? 0;
    const loot = rollGather(g.kind, p.jobLevel, Math.random, rich);
    let rare = false, best = 0;
    if (this.eventOn("gather2")) for (const l of loot) l.qty *= 2; // evento: doble recolección
    for (const l of loot) {
      this.addItem(p, l.item, l.qty);
      this.events.push({ e: "loot", to: p.id, item: l.item, qty: l.qty });
      this.progressCollect(p, l.item, l.qty);
      if (RARE_GATHER.has(baseItem(l.item)) || l.rarity >= 3) rare = true;
      best = Math.max(best, l.rarity);
    }
    if (g.kind === "skin") corpse!.skinned = true;
    else { this.nodeUp[g.node!] = this.tick + Math.round(GATHER[g.kind].respawn / DT); this.nodeRich[g.node!] = rollRichness(); } // reaparecerá con otra riqueza
    this.events.push({ e: "gathered", id: p.id, kind: g.kind, rare: rare || undefined, rarity: best || undefined });
    this.gainJobXp(p, Math.round((rare ? GATHER_RARE_XP : GATHER_XP) * RARITIES[best]!.xp)); // cuanto más raro, más experiencia
    this.sendInv(p); this.save(p);
  }

  private gainJobXp(p: Ent, n: number) {
    if (this.eventOn("xp2")) n *= 2;
    if (!p.job) return;
    p.jobXp += n;
    while (p.jobXp >= jobXpForNext(p.jobLevel)) {
      p.jobXp -= jobXpForNext(p.jobLevel);
      p.jobLevel++;
      this.events.push({ e: "jobLevelUp", id: p.id, level: p.jobLevel, job: p.job });
    }
  }

  private gainXp(p: Ent, n: number) {
    if (this.eventOn("xp2")) n *= 2; // evento: doble experiencia
    p.xp += n;
    while (p.xp >= xpForNext(p.level)) {
      p.xp -= xpForNext(p.level);
      p.level++;
      this.applyStats(p, true);
      this.events.push({ e: "levelup", id: p.id, level: p.level });
      this.note(p, `Tienes ${freePoints(p.level, p.skills)} punto(s) de habilidad para gastar: pulsa K.`);
    }
  }

  // ---- Misiones ----
  private talkToNpc(p: Ent, npcId: string) {
    const q = questOf(p.quest);
    if (!q || q.giver !== npcId) return; // NPC sin misión activa: solo diálogo
    // "pray" solo se completa rezando ante la estatua (progressPray); hablar con la sacerdotisa no basta
    if (q.type === "pray") return;
    this.advanceQuest(p); // talk: completa; kill/collect: entrega si el conteo está cumplido
  }
  private advanceQuest(p: Ent) {
    const q = questOf(p.quest);
    if (!q) return;
    if (q.type === "kill" || q.type === "collect") {
      // Para collect/kill, hablar con el giver entrega la misión si se cumple el conteo
      if (p.questCount < q.count) return;
    }
    this.completeQuest(p, q);
  }
  private progressCollect(p: Ent, item: string, qty: number) {
    const q = questOf(p.quest);
    if (!q || q.type !== "collect" || q.target !== baseItem(item)) return; // vale cualquier rareza
    p.questCount = Math.min(q.count, p.questCount + qty);
    this.sendInv(p); this.save(p);
  }
  private progressKill(p: Ent, kind: string) {
    const q = questOf(p.quest);
    if (!q || q.type !== "kill" || q.target !== kind) return;
    p.questCount = Math.min(q.count, p.questCount + 1);
    this.sendInv(p); this.save(p);
  }
  public progressPray(p: Ent) {
    // la bendición transforma el aspecto de magos y caballeros
    let transformed = false;
    if (p.look) {
      const before = p.look;
      p.look = blessedLook(p.look);
      if (p.look[0] !== before[0] || p.look[1] !== before[1]) {
        transformed = true;
        this.applyStats(p, true);
        this.events.push({ e: "chat", from: p.id, name: "Sistema", text: "La luz de la diosa te ha transformado." });
      }
    }
    this.events.push(transformed ? { e: "bless", id: p.id, transformed: true } : { e: "bless", id: p.id });
    const q = questOf(p.quest);
    if (q && q.type === "pray") this.completeQuest(p, q);
    else if (transformed) { this.sendInv(p); this.save(p); }
  }
  private completeQuest(p: Ent, q: ReturnType<typeof questOf>) {
    if (!q) return;
    // entregar recompensas
    if (q.reward.xp) this.gainXp(p, q.reward.xp);
    if (q.reward.items) for (const it of q.reward.items) { this.addItem(p, it.item, it.qty); this.events.push({ e: "loot", to: p.id, item: it.item, qty: it.qty }); }
    if (q.reward.job && !p.job) { /* la elección de job la maneja el cliente con t: "job" */ }
    p.completedQuests.push(q.id);
    p.quest = q.next;
    p.questCount = 0;
    this.sendInv(p); this.save(p);
  }

  private nearestPlayer(m: Ent, maxD: number): Ent | null {
    let best: Ent | null = null, bd = maxD;
    for (const e of this.ents.values()) {
      if (e.kind !== "player" || !e.persistent || e.dead || e.fly || e.swim || e.y > 2.5 || inSafeZone(e.x, e.z)) continue;
      const d = dist(m.x, m.z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  step() {
    this.tick++;
    if (this.tick % 20 === 0) for (const [id, until] of this.worldEvents) if (until <= Date.now()) this.setEvent(id, 0); // eventos que terminan
    if (this.tick % SAVE_EVERY_TICKS === 0) for (const e of this.ents.values()) this.save(e);
    if (Date.now() - this.boardAt >= 1000 && this.market.takeBoardDirty()) {
      this.boardAt = Date.now();
      const au = npcOf("auctioneer")!, board = this.market.board();
      for (const e of this.ents.values()) if (e.kind === "player" && e.persistent && dist(e.x, e.z, au.x, au.z) <= 40) this.send(e.id, board);
    }

    if (this.dragonGoneAt && this.tick >= this.dragonGoneAt) { this.removeDragon(); this.setEvent("dragon", 0); }
    for (const e of this.ents.values()) {
      if (e.dead) {
        if (e.kind === "boss") continue; // el cadáver del dragón se queda hasta que se retira (abajo)
        if (this.tick >= e.respawnAt) {
          e.dead = false; e.hp = e.maxHp; e.target = null; e.fly = false; e.swim = false; e.y = 0; e.stun = 0; e.buff = null; e.skinned = false; e.gather = null;
          e.x = e.tx = e.kind === "player" ? SPAWN_POINT.x : e.spawnX;
          e.z = e.tz = e.kind === "player" ? SPAWN_POINT.z : e.spawnZ;
        }
        continue;
      }
      e.cooldownLeft = Math.max(0, e.cooldownLeft - DT);
      for (let i = 0; i < e.skillCd.length; i++) e.skillCd[i] = Math.max(0, e.skillCd[i]! - DT);
      if (e.buff && (e.buffLeft -= DT) <= 0) e.buff = null;
      const passive = e.kind === "player" ? passiveOf(e.look) : undefined;
      if (passive?.regen && e.hp < e.maxHp) { // regeneración: se acumula y se aplica en enteros, sin avisos por cada punto
        e.regenAcc += e.maxHp * passive.regen * DT;
        if (e.regenAcc >= 1) { const n = Math.min(e.maxHp - e.hp, Math.floor(e.regenAcc)); e.hp += n; e.regenAcc -= n; }
      }
      if (e.stun > 0) { e.stun -= DT; e.tx = e.x; e.tz = e.z; continue; } // aturdido: ni se mueve ni ataca
      if (e.pose && this.stepRest(e)) continue; // descansando: quieto (y sin colisiones: está sobre el banco)
      const stats = e.kind === "player" ? PLAYER : e.kind === "boss" ? DRAGON : mobOf(e.mob);
      const md = e.kind === "mob" ? mobOf(e.mob) : undefined;
      const range = e.kind === "player" ? (e.look && classOf(e.look[0])?.range) || PLAYER.range : e.kind === "boss" ? DRAGON.range : md!.range; // el mago ataca de lejos
      if (e.kind === "boss") this.stepDragon(e);

      // IA del mob: elegir objetivo, soltarlo si se aleja demasiado del spawn.
      if (e.kind === "mob") {
        const cur = e.target !== null ? this.ents.get(e.target) : undefined;
        if (!cur || cur.dead || cur.swim || inSafeZone(cur.x, cur.z) || dist(e.x, e.z, e.spawnX, e.spawnZ) > md!.leash) {
          e.target = null;
          const n = dist(e.x, e.z, e.spawnX, e.spawnZ) > md!.leash ? null : this.nearestPlayer(e, md!.aggro * (e.mob === "wolf" && this.eventOn("wolfmoon") ? 1.6 : 1));
          if (n) e.target = n.id;
          else { e.tx = e.spawnX; e.tz = e.spawnZ; }
        }
      }

      if (e.kind === "player" && this.tick - e.lastInput > INPUT_TIMEOUT_TICKS) { e.ix = 0; e.iz = 0; e.iy = 0; }
      if (e.kind === "player") { // nadar: en el agua, a pie y sin volar; una montura de tierra se queda en la orilla
        const sw = !e.dead && inWater(e.x, e.z) && e.y <= 0.5 && !(e.fly && MOUNTS[this.mountFor(e)].flies);
        if (sw && !e.swim) {
          if (e.fly) { e.fly = false; this.note(e, "Desmontas: tu montura no sabe nadar."); }
          e.target = null; e.gather = null; if (e.pose) this.standUp(e);
        }
        e.swim = sw;
      }
      const mount = e.fly ? MOUNTS[this.mountFor(e)] : undefined; // vuelan la escoba y el dragón
      if (mount?.flies) e.y = Math.max(FLY.minY, Math.min(FLY.maxY, e.y + e.iy * FLY.vSpeed * DT));
      else if (e.y > 0) e.y = Math.max(0, e.y - FLY.fallSpeed * DT); // al desmontar (o en montura de tierra), cae
      const speed = stats.speed * (mount ? mount.speedMult : passive?.speed ?? 1) * (e.swim ? SWIM.speedMult : 1);
      const manual = e.ix !== 0 || e.iz !== 0; // con WASD el jugador manda; sin entrada persigue a su objetivo
      const tgt = e.target !== null ? this.ents.get(e.target) : undefined;
      if (tgt && !tgt.dead) {
        const d = dist(e.x, e.z, tgt.x, tgt.z);
        if (d > range * (manual ? 1 : 0.9)) { if (!manual) { e.tx = tgt.x; e.tz = tgt.z; } }
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
        stepMover(e, stats.speed * (e.swim ? SWIM.speedMult : 1), DT);
        if (Math.hypot(e.x - ox, e.z - oz) > 1e-4) e.ry = Math.atan2(e.x - ox, e.z - oz);
      }
      if (e.kind !== "boss") [e.x, e.z] = resolveCollisions(e.x, e.z, e.kind === "player" ? 0.4 : mobOf(e.mob).radius, e.y); // el dragón no choca con árboles
      if (e.kind === "mob" && inWater(e.x, e.z)) { // las criaturas no entran al agua: se quedan en la orilla
        const a = Math.atan2(e.z - LAKE.z, e.x - LAKE.x), rr = LAKE.r - SWIM.inset + 0.05;
        e.x = LAKE.x + Math.cos(a) * rr; e.z = LAKE.z + Math.sin(a) * rr;
      }
      if (e.gather) this.stepGather(e);
    }

    // los jugadores que aún no han elegido nombre no existen para nadie
    const entities: EntityState[] = [...this.ents.values()].filter(e => e.kind !== "player" || e.persistent).map(e => ({
      id: e.id, kind: e.kind, name: e.name, level: e.level, x: e.x, z: e.z, ry: Math.round(e.ry * 100) / 100, y: e.y > 0 ? Math.round(e.y * 10) / 10 : undefined, fly: e.fly || undefined, swim: e.swim || undefined, hp: e.hp, maxHp: e.maxHp, dead: e.dead,
      weapon: e.equip.weapon, armor: e.equip.armor, look: e.look, buff: e.buff ?? undefined, stun: e.stun > 0 || undefined,
      act: e.gather?.kind, skinned: (e.dead && e.skinned) || undefined, pose: e.pose ?? undefined,
      mount: e.kind === "player" && e.mountSel ? this.mountFor(e) : undefined, mob: e.mob,
    }));
    const down: number[] = [];
    const rich: number[] = [];
    for (let i = 0; i < this.nodeUp.length; i++) { if (this.nodeUp[i]! > this.tick) down.push(i); else if (this.nodeRich[i]) rich.push(i, this.nodeRich[i]!); }
    const events = this.events;
    this.events = [];
    for (const e of this.ents.values()) {
      if (e.kind === "player") this.send(e.id, { t: "snapshot", tick: this.tick, entities, events, down: down.length ? down : undefined, rich: rich.length ? rich : undefined });
    }
  }
}
