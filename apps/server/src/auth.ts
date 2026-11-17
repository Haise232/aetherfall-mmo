// Cuentas de jugador: registro, inicio de sesión y sesiones recordadas.
// Contraseñas con scrypt (sal aleatoria por cuenta) calculado de forma asíncrona para no frenar la simulación.
// Las sesiones se guardan como hash SHA-256 del token: una copia de la base de datos no sirve para entrar.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { MAX_CHARS, PASS_MIN, USER_RE, type AuthError } from "@mmorpg/shared";
import type { Account, CharStore } from "./store";

const KEYLEN = 64, SCRYPT = { N: 16384, r: 8, p: 1 };
const SESSION_DAYS = 30;
/** Tras FAIL_MAX fallos seguidos con un usuario, se bloquea FAIL_LOCK_MS. */
const FAIL_MAX = 5, FAIL_LOCK_MS = 60_000;

const kdf = (pass: string, salt: string) => new Promise<Buffer>((ok, ko) => scrypt(pass, salt, KEYLEN, SCRYPT, (e, k) => (e ? ko(e) : ok(k))));
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export type AuthResult = { ok: true; account: Account; token?: string } | { ok: false; reason: AuthError; text: string };

export class Auth {
  private fails = new Map<string, { n: number; until: number }>();
  constructor(private store: CharStore) {}

  private locked(user: string) {
    const f = this.fails.get(user.toLowerCase());
    return !!f && f.until > Date.now();
  }
  private fail(user: string) {
    const k = user.toLowerCase(), f = this.fails.get(k) ?? { n: 0, until: 0 };
    f.n++; if (f.n >= FAIL_MAX) { f.until = Date.now() + FAIL_LOCK_MS; f.n = 0; }
    this.fails.set(k, f);
  }
  private session(account: number) {
    const token = randomBytes(32).toString("hex");
    this.store.addSession(sha(token), account, Date.now() + SESSION_DAYS * 86_400_000);
    return token;
  }

  /** Solicitud de cuenta: queda pendiente hasta que un administrador la apruebe (y le dé una contraseña temporal). */
  register(user: unknown, email: unknown, note: unknown): { ok: boolean; text: string } {
    if (typeof user !== "string" || !USER_RE.test(user)) return { ok: false, text: "El usuario debe tener de 3 a 16 letras, números o guiones bajos." };
    const mail = typeof email === "string" && email.trim() ? email.trim().slice(0, 120) : null;
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, text: "Ese correo no parece válido (o déjalo en blanco)." };
    const msg = typeof note === "string" && note.trim() ? note.trim().slice(0, 300) : null;
    if (this.store.findAccount(user) || this.store.createAccount(user, mail, "", "", { status: "pending", note: msg }) === null) return { ok: false, text: "Ese usuario ya existe o ya está solicitado. Elige otro." };
    return { ok: true, text: `Solicitud enviada. Cuando un administrador la apruebe te dará una contraseña temporal para entrar como «${user}».` };
  }

  /** Contraseña temporal fácil de dictar: dos palabras y un número (el jugador la cambia al entrar). */
  private tempPassword() {
    const W = ["lobo", "torre", "plaza", "hierro", "trucha", "roble", "luna", "fuente", "yunque", "farol", "castillo", "dragon", "pino", "rio", "trigo", "escudo"];
    const b = randomBytes(3);
    return `${W[b[0]! % W.length]}-${W[b[1]! % W.length]}-${10 + (b[2]! % 90)}`;
  }
  private async setTemp(acc: Account) {
    const pass = this.tempPassword(), salt = randomBytes(16).toString("hex");
    this.store.setPassword(acc.id, salt, (await kdf(pass, salt)).toString("hex"), true);
    return pass;
  }
  /** Aprueba una solicitud: la cuenta queda activa con una contraseña temporal (que devuelve para dársela al jugador). */
  async approve(user: string) {
    const acc = this.store.findAccount(user); if (!acc) return null;
    const pass = await this.setTemp(acc); this.store.setStatus(acc.id, "active"); return pass;
  }
  /** Nueva contraseña temporal para una cuenta (por ejemplo, si el jugador olvidó la suya). */
  async resetPass(user: string) {
    const acc = this.store.findAccount(user); if (!acc) return null;
    const pass = await this.setTemp(acc); this.store.deleteSessions(acc.id); return pass; // las sesiones recordadas dejan de valer
  }

  /** El jugador pone su contraseña (obligatorio después de una temporal). */
  async changePass(account: Account, pass: unknown): Promise<{ ok: boolean; text: string }> {
    if (typeof pass !== "string" || pass.length < PASS_MIN || pass.length > 128) return { ok: false, text: `La contraseña necesita al menos ${PASS_MIN} caracteres.` };
    if (pass.toLowerCase().includes(account.user.toLowerCase())) return { ok: false, text: "La contraseña no puede contener tu usuario." };
    const salt = randomBytes(16).toString("hex");
    this.store.setPassword(account.id, salt, (await kdf(pass, salt)).toString("hex"), false);
    account.mustChange = false;
    return { ok: true, text: "Contraseña cambiada." };
  }

  /** Primera vez: crea la cuenta "admin". Contraseña de ADMIN_PASSWORD o, si no hay, "admin" (y obliga a cambiarla al entrar). */
  async ensureAdmin() {
    if (process.env.ADMIN_RESET === "1") { // recuperación: ADMIN_RESET=1 devuelve "admin" a ADMIN_PASSWORD (o "admin") y obliga a cambiarla
      const acc = this.store.findAccount("admin");
      if (acc && acc.role === "admin") {
        const pass = process.env.ADMIN_PASSWORD || "admin", salt = randomBytes(16).toString("hex");
        this.store.setPassword(acc.id, salt, (await kdf(pass, salt)).toString("hex"), true); this.store.deleteSessions(acc.id); this.store.setStatus(acc.id, "active");
        console.log("ADMIN_RESET: la contraseña de 'admin' vuelve a ser la inicial; cámbiala al entrar y arranca sin ADMIN_RESET.");
        return;
      }
    }
    if (this.store.hasAdmin()) return;
    const pass = process.env.ADMIN_PASSWORD || "admin", salt = randomBytes(16).toString("hex");
    const id = this.store.createAccount("admin", null, salt, (await kdf(pass, salt)).toString("hex"), { role: "admin", status: "active", mustChange: !process.env.ADMIN_PASSWORD });
    if (id === null) { console.log("AVISO: existe una cuenta 'admin' que no es administradora; crea otra con ADMIN_USER."); return; }
    console.log(process.env.ADMIN_PASSWORD ? "Cuenta de administración creada: admin (contraseña de ADMIN_PASSWORD)." : "Cuenta de administración creada: admin / admin. Al entrar por primera vez tendrás que cambiar la contraseña.");
  }

  async login(user: unknown, pass: unknown, remember: boolean): Promise<AuthResult> {
    const bad: AuthResult = { ok: false, reason: "wrong", text: "Usuario o contraseña incorrectos." };
    if (typeof user !== "string" || typeof pass !== "string" || !USER_RE.test(user) || pass.length > 128) return bad;
    if (this.locked(user)) return { ok: false, reason: "locked", text: "Demasiados intentos fallidos. Espera un minuto." };
    const acc = this.store.findAccount(user);
    if (acc?.status === "pending") return { ok: false, reason: "pending", text: "Tu solicitud aún no está aprobada. Cuando lo esté, el administrador te dará una contraseña temporal." };
    // se calcula el hash aunque el usuario no exista, para no delatar qué usuarios hay por el tiempo de respuesta
    const got = await kdf(pass, acc?.salt || "0000000000000000"), want = Buffer.from(acc?.hash ?? "", "hex");
    if (!acc || want.length !== got.length || !timingSafeEqual(got, want)) { this.fail(user); return bad; }
    if (acc.status === "banned") return { ok: false, reason: "banned", text: "Esta cuenta está bloqueada. Habla con el administrador." };
    this.fails.delete(user.toLowerCase());
    this.store.touchAccount(acc.id);
    return { ok: true, account: acc, token: remember ? this.session(acc.id) : undefined };
  }

  resume(token: unknown): AuthResult {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { ok: false, reason: "expired", text: "Tu sesión ha caducado. Vuelve a entrar." };
    const acc = this.store.sessionAccount(sha(token));
    if (!acc || acc.status !== "active") return { ok: false, reason: "expired", text: "Tu sesión ha caducado. Vuelve a entrar." };
    this.store.touchAccount(acc.id);
    return { ok: true, account: acc };
  }

  logout(token: unknown) { if (typeof token === "string" && /^[0-9a-f]{64}$/.test(token)) this.store.deleteSession(sha(token)); }

  /** ¿Puede esta cuenta jugar (o crear) el personaje `name`? */
  canPlay(account: number, name: string): { ok: true; claim: boolean; isNew: boolean } | { ok: false; reason: "notYours" | "limit" } {
    const owner = this.store.charOwner(name);
    if (owner === undefined) return this.store.listChars(account).length >= MAX_CHARS ? { ok: false, reason: "limit" } : { ok: true, claim: false, isNew: true };
    if (owner === null) return { ok: true, claim: true, isNew: false }; // personaje de antes de las cuentas: lo reclama quien entre primero
    return owner === account ? { ok: true, claim: false, isNew: false } : { ok: false, reason: "notYours" };
  }
}
