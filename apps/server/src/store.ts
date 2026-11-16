import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import type { Equip, Inventory } from "@mmorpg/shared";

export interface CharData { level: number; xp: number; inv: Inventory; equip: Equip }

// La Zone solo conoce esta interfaz; SQLite es un detalle de este runtime.
export interface CharStore {
  load(name: string): CharData | null;
  save(name: string, d: CharData): void;
}

export class SqliteStore implements CharStore {
  private db: DatabaseSync;
  constructor(path = "data/game.db") {
    if (path !== ":memory:") mkdirSync("data", { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS characters (
      name TEXT PRIMARY KEY, level INTEGER NOT NULL, xp INTEGER NOT NULL,
      inv TEXT NOT NULL, equip TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
  }
  load(name: string): CharData | null {
    const r = this.db.prepare("SELECT level, xp, inv, equip FROM characters WHERE name = ?").get(name) as
      | { level: number; xp: number; inv: string; equip: string } | undefined;
    return r ? { level: r.level, xp: r.xp, inv: JSON.parse(r.inv), equip: JSON.parse(r.equip) } : null;
  }
  save(name: string, d: CharData): void {
    this.db.prepare(`INSERT INTO characters (name, level, xp, inv, equip, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET level=excluded.level, xp=excluded.xp, inv=excluded.inv,
      equip=excluded.equip, updated_at=excluded.updated_at`)
      .run(name, d.level, d.xp, JSON.stringify(d.inv), JSON.stringify(d.equip), Date.now());
  }
}
