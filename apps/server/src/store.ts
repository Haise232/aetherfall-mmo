import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { jobOf, validLook, type Equip, type Inventory, type LookSel } from "@mmorpg/shared";

export interface CharData { level: number; xp: number; inv: Inventory; equip: Equip; look?: LookSel; quest?: string; questCount?: number; completedQuests?: string[]; job?: string; jobLevel?: number; jobXp?: number; coins?: number; skillRanks?: unknown; account?: number | null; mounts?: unknown } // skillRanks: estado de habilidades en JSON (lo valida validSkills)

/** Orden de la casa de subastas tal como se guarda. `price` es por unidad; `qty` lo que queda; `total` lo publicado; `got` lo comprado sin recoger. */
export interface StoredOrder { id: number; owner: string; side: "buy" | "sell"; item: string; price: number; qty: number; total: number; got: number; createdAt: number }

// La Zone solo conoce esta interfaz; SQLite es un detalle de este runtime.
export interface CharStore {
  load(name: string): CharData | null;
  save(name: string, d: CharData): void;
  // ---- Casa de subastas ----
  /** Agrupa varias escrituras en una transacción (se anidan sin problema). Si `fn` lanza, se deshace todo. */
  transaction<T>(fn: () => T): T;
  loadOrders(): StoredOrder[];
  insertOrder(o: Omit<StoredOrder, "id">): number;
  updateOrder(id: number, qty: number, got: number): void;
  deleteOrder(id: number): void;
  /** Para personajes desconectados: suma besantes directamente en la base de datos. */
  addCoins(name: string, n: number): void;
  /** Para personajes desconectados: suma objetos a su inventario guardado. */
  addItems(name: string, item: string, n: number): void;
  // ---- Cuentas ----
  /** Crea una cuenta; null si el usuario ya existe (sin distinguir mayúsculas). */
  createAccount(user: string, email: string | null, salt: string, hash: string, opts?: { status?: Account["status"]; role?: Account["role"]; mustChange?: boolean; note?: string | null }): number | null;
  setPassword(id: number, salt: string, hash: string, mustChange: boolean): void;
  setStatus(id: number, status: Account["status"]): void;
  /** Cierra todas las sesiones recordadas de una cuenta. */
  deleteSessions(account: number): void;
  deleteAccount(id: number): void;
  listAccounts(): AccountRow[];
  hasAdmin(): boolean;
  findAccount(user: string): Account | undefined;
  touchAccount(id: number): void;
  /** Sesiones: se guarda el hash del token, nunca el token. */
  addSession(tokenHash: string, account: number, expires: number): void;
  sessionAccount(tokenHash: string): Account | undefined;
  deleteSession(tokenHash: string): void;
  /** Personajes de una cuenta (resumen para la pantalla de selección). */
  listChars(account: number): CharSummaryRow[];
  /** Dueño de un personaje: id de cuenta, null si es antiguo sin dueño, undefined si no existe. */
  charOwner(name: string): number | null | undefined;
  setCharOwner(name: string, account: number): void;
}
export interface Account { id: number; user: string; salt: string; hash: string; role: "player" | "admin"; status: "pending" | "active" | "banned"; mustChange: boolean }
export interface AccountRow { id: number; user: string; email: string | null; note: string | null; role: Account["role"]; status: Account["status"]; created: number; lastLogin: number | null }
export interface CharSummaryRow { name: string; level: number; look?: LookSel }

export class SqliteStore implements CharStore {
  // ---- Cuentas ----
  createAccount(user: string, email: string | null, salt: string, hash: string, opts: { status?: Account["status"]; role?: Account["role"]; mustChange?: boolean; note?: string | null } = {}): number | null {
    try {
      const r = this.db.prepare("INSERT INTO accounts (user, email, salt, hash, created_at, status, role, must_change, note) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(user, email, salt, hash, Date.now(), opts.status ?? "active", opts.role ?? "player", opts.mustChange ? 1 : 0, opts.note ?? null);
      return Number(r.lastInsertRowid);
    } catch { return null; } // UNIQUE: ya existe
  }
  private acc(row: Record<string, unknown> | undefined): Account | undefined {
    return row ? { id: row.id as number, user: row.user as string, salt: row.salt as string, hash: row.hash as string, role: row.role as Account["role"], status: row.status as Account["status"], mustChange: !!row.must_change } : undefined;
  }
  findAccount(user: string): Account | undefined { return this.acc(this.db.prepare("SELECT id, user, salt, hash, role, status, must_change FROM accounts WHERE user = ?").get(user) as Record<string, unknown> | undefined); }
  setPassword(id: number, salt: string, hash: string, mustChange: boolean) { this.db.prepare("UPDATE accounts SET salt = ?, hash = ?, must_change = ? WHERE id = ?").run(salt, hash, mustChange ? 1 : 0, id); }
  setStatus(id: number, status: Account["status"]) { this.db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, id); if (status !== "active") this.db.prepare("DELETE FROM sessions WHERE account = ?").run(id); }
  deleteSessions(account: number) { this.db.prepare("DELETE FROM sessions WHERE account = ?").run(account); }
  deleteAccount(id: number) { this.db.prepare("DELETE FROM sessions WHERE account = ?").run(id); this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id); }
  listAccounts(): AccountRow[] {
    return (this.db.prepare("SELECT id, user, email, note, role, status, created_at, last_login FROM accounts ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC").all() as Record<string, unknown>[])
      .map(r => ({ id: r.id as number, user: r.user as string, email: r.email as string | null, note: r.note as string | null, role: r.role as Account["role"], status: r.status as Account["status"], created: r.created_at as number, lastLogin: r.last_login as number | null }));
  }
  hasAdmin() { return !!this.db.prepare("SELECT 1 FROM accounts WHERE role = 'admin' LIMIT 1").get(); }
  touchAccount(id: number) { this.db.prepare("UPDATE accounts SET last_login = ? WHERE id = ?").run(Date.now(), id); }
  addSession(tokenHash: string, account: number, expires: number) { this.db.prepare("INSERT INTO sessions (token_hash, account, expires) VALUES (?,?,?)").run(tokenHash, account, expires); }
  sessionAccount(tokenHash: string): Account | undefined {
    return this.acc(this.db.prepare("SELECT a.id, a.user, a.salt, a.hash, a.role, a.status, a.must_change FROM sessions s JOIN accounts a ON a.id = s.account WHERE s.token_hash = ? AND s.expires > ?").get(tokenHash, Date.now()) as Record<string, unknown> | undefined);
  }
  deleteSession(tokenHash: string) { this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash); }
  listChars(account: number): CharSummaryRow[] {
    const rows = this.db.prepare("SELECT name, level, look FROM characters WHERE account = ? ORDER BY updated_at DESC").all(account) as { name: string; level: number; look: string | null }[];
    return rows.map(r => { let look: LookSel | undefined; try { const a = r.look ? JSON.parse(r.look) : null; look = a ? validLook(a[0], a[1], a[2]) ?? undefined : undefined; } catch { /* */ } return { name: r.name, level: r.level, look }; });
  }
  charOwner(name: string): number | null | undefined {
    const r = this.db.prepare("SELECT account FROM characters WHERE name = ?").get(name) as { account: number | null } | undefined;
    return r ? r.account : undefined;
  }
  setCharOwner(name: string, account: number) { this.db.prepare("UPDATE characters SET account = ? WHERE name = ?").run(account, name); }

  private db: DatabaseSync;
  constructor(path = "data/game.db") {
    if (path !== ":memory:") mkdirSync("data", { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS characters (
      name TEXT PRIMARY KEY, level INTEGER NOT NULL, xp INTEGER NOT NULL,
      inv TEXT NOT NULL, equip TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
    // bases de datos anteriores a las clases: se añade la columna (los personajes viejos eligen al entrar)
    const cols = this.db.prepare("PRAGMA table_info(characters)").all() as { name: string }[];
    if (!cols.some(c => c.name === "look")) this.db.exec("ALTER TABLE characters ADD COLUMN look TEXT");
    if (!cols.some(c => c.name === "quest")) this.db.exec("ALTER TABLE characters ADD COLUMN quest TEXT");
    if (!cols.some(c => c.name === "quest_count")) this.db.exec("ALTER TABLE characters ADD COLUMN quest_count INTEGER NOT NULL DEFAULT 0");
    if (!cols.some(c => c.name === "completed_quests")) this.db.exec("ALTER TABLE characters ADD COLUMN completed_quests TEXT NOT NULL DEFAULT '[]'");
    if (!cols.some(c => c.name === "job")) this.db.exec("ALTER TABLE characters ADD COLUMN job TEXT");
    if (!cols.some(c => c.name === "job_level")) this.db.exec("ALTER TABLE characters ADD COLUMN job_level INTEGER NOT NULL DEFAULT 1");
    if (!cols.some(c => c.name === "job_xp")) this.db.exec("ALTER TABLE characters ADD COLUMN job_xp INTEGER NOT NULL DEFAULT 0");
    if (!cols.some(c => c.name === "skill_ranks")) this.db.exec("ALTER TABLE characters ADD COLUMN skill_ranks TEXT"); // rangos de habilidad (JSON)
    if (!cols.some(c => c.name === "mounts")) this.db.exec("ALTER TABLE characters ADD COLUMN mounts TEXT"); // monturas ganadas y la elegida (JSON)
    if (!cols.some(c => c.name === "coins")) this.db.exec("ALTER TABLE characters ADD COLUMN coins INTEGER NOT NULL DEFAULT 0");
    if (!cols.some(c => c.name === "account")) this.db.exec("ALTER TABLE characters ADD COLUMN account INTEGER"); // cuenta dueña (null: personaje antiguo)
    this.db.exec(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL UNIQUE COLLATE NOCASE, email TEXT,
      salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER)`);
    const acols = this.db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
    if (!acols.some(c => c.name === "role")) this.db.exec("ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
    if (!acols.some(c => c.name === "status")) this.db.exec("ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"); // las cuentas de antes de la aprobación quedan activas
    if (!acols.some(c => c.name === "must_change")) this.db.exec("ALTER TABLE accounts ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0");
    if (!acols.some(c => c.name === "note")) this.db.exec("ALTER TABLE accounts ADD COLUMN note TEXT");
    this.db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account INTEGER NOT NULL, expires INTEGER NOT NULL)`);
    this.db.exec("DELETE FROM sessions WHERE expires < " + Date.now());
    this.db.exec("CREATE INDEX IF NOT EXISTS characters_account ON characters (account)");
    this.db.exec(`CREATE TABLE IF NOT EXISTS market_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, side TEXT NOT NULL, item TEXT NOT NULL,
      price INTEGER NOT NULL, qty INTEGER NOT NULL, total INTEGER NOT NULL, got INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`);
    this.db.exec("CREATE INDEX IF NOT EXISTS market_orders_item ON market_orders (item, side)");
    this.db.exec("CREATE INDEX IF NOT EXISTS market_orders_owner ON market_orders (owner)");
  }
  load(name: string): CharData | null {
    const r = this.db.prepare("SELECT level, xp, inv, equip, look, quest, quest_count, completed_quests, job, job_level, job_xp, coins, skill_ranks, mounts FROM characters WHERE name = ?").get(name) as
      | { level: number; xp: number; inv: string; equip: string; look: string | null; quest: string | null; quest_count: number; completed_quests: string; job: string | null; job_level: number; job_xp: number; coins: number; skill_ranks: string | null; mounts: string | null } | undefined;
    if (!r) return null;
    let look: LookSel | undefined;
    try { const l = JSON.parse(r.look ?? "null") as unknown[] | null; look = (l && validLook(l[0], l[1], l[2])) || undefined; } catch { /* aspecto ilegible: se vuelve a elegir */ }
    let completed: string[] = [];
    try { completed = JSON.parse(r.completed_quests) as string[]; } catch { }
    return { level: r.level, xp: r.xp, inv: JSON.parse(r.inv), equip: JSON.parse(r.equip), look, quest: r.quest ?? undefined, questCount: r.quest_count, completedQuests: completed, job: jobOf(r.job ?? undefined)?.id, jobLevel: r.job_level, jobXp: r.job_xp, coins: r.coins, skillRanks: r.skill_ranks ? JSON.parse(r.skill_ranks) : undefined, mounts: r.mounts ? JSON.parse(r.mounts) : undefined };
  }
  save(name: string, d: CharData): void {
    this.db.prepare(`INSERT INTO characters (name, level, xp, inv, equip, look, quest, quest_count, completed_quests, job, job_level, job_xp, coins, skill_ranks, mounts, account, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET level=excluded.level, xp=excluded.xp, inv=excluded.inv,
      equip=excluded.equip, look=excluded.look, quest=excluded.quest, quest_count=excluded.quest_count, completed_quests=excluded.completed_quests,
      job=excluded.job, job_level=excluded.job_level, job_xp=excluded.job_xp, coins=excluded.coins, skill_ranks=excluded.skill_ranks, mounts=COALESCE(excluded.mounts, characters.mounts), account=COALESCE(excluded.account, characters.account), updated_at=excluded.updated_at`)
      .run(name, d.level, d.xp, JSON.stringify(d.inv), JSON.stringify(d.equip), d.look ? JSON.stringify(d.look) : null, d.quest ?? null, d.questCount ?? 0, JSON.stringify(d.completedQuests ?? []), d.job ?? null, d.jobLevel ?? 1, d.jobXp ?? 0, d.coins ?? 0, d.skillRanks ? JSON.stringify(d.skillRanks) : null, d.mounts ? JSON.stringify(d.mounts) : null, d.account ?? null, Date.now());
  }

  // ---- Casa de subastas ----
  private depth = 0;
  /** Copia coherente de toda la base de datos en `file` (VACUUM INTO: no hace falta parar el servidor). */
  backup(file: string) { this.db.prepare("VACUUM INTO ?").run(file); }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec("BEGIN");
    this.depth = 1;
    try { const r = fn(); this.db.exec("COMMIT"); return r; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
    finally { this.depth = 0; }
  }
  loadOrders(): StoredOrder[] {
    const rows = this.db.prepare("SELECT id, owner, side, item, price, qty, total, got, created_at FROM market_orders ORDER BY id").all() as
      { id: number; owner: string; side: string; item: string; price: number; qty: number; total: number; got: number; created_at: number }[];
    return rows.filter(r => r.side === "buy" || r.side === "sell").map(r => ({ id: r.id, owner: r.owner, side: r.side as "buy" | "sell", item: r.item, price: r.price, qty: r.qty, total: r.total, got: r.got, createdAt: r.created_at }));
  }
  insertOrder(o: Omit<StoredOrder, "id">): number {
    const r = this.db.prepare("INSERT INTO market_orders (owner, side, item, price, qty, total, got, created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(o.owner, o.side, o.item, o.price, o.qty, o.total, o.got, o.createdAt);
    return Number(r.lastInsertRowid);
  }
  updateOrder(id: number, qty: number, got: number): void {
    this.db.prepare("UPDATE market_orders SET qty = ?, got = ? WHERE id = ?").run(qty, got, id);
  }
  deleteOrder(id: number): void {
    this.db.prepare("DELETE FROM market_orders WHERE id = ?").run(id);
  }
  addCoins(name: string, n: number): void {
    this.db.prepare("UPDATE characters SET coins = coins + ? WHERE name = ?").run(n, name);
  }
  addItems(name: string, item: string, n: number): void {
    const r = this.db.prepare("SELECT inv FROM characters WHERE name = ?").get(name) as { inv: string } | undefined;
    if (!r) return;
    const inv = JSON.parse(r.inv) as Record<string, number>;
    inv[item] = (Object.prototype.hasOwnProperty.call(inv, item) ? inv[item]! : 0) + n;
    this.db.prepare("UPDATE characters SET inv = ? WHERE name = ?").run(JSON.stringify(inv), name);
  }
}
