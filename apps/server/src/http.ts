// Servidor HTTP de producción: sirve la página compilada del cliente (apps/client/dist) para que no haga falta Vite.
// La conexión del juego (WebSocket) va por el mismo puerto: la acepta main.ts en el evento "upgrade".
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
};
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/** Carpeta con la página compilada, o null si no existe (entonces solo hay WebSocket, como en desarrollo). */
export function clientDir(): string | null {
  const dir = resolve(process.env.STATIC_DIR || new URL("../../client/dist", import.meta.url).pathname);
  return existsSync(join(dir, "index.html")) ? dir : null;
}

/** Tipos que merece la pena comprimir (los modelos .glb bajan de 3,6 a 1,2 MB; Cloudflare no los comprime solo). */
const ZIP = new Set([".html", ".js", ".css", ".json", ".svg", ".glb", ".gltf", ".bin", ".txt"]);
const zipped = new Map<string, { mtime: number; buf: Buffer }>();
function gz(file: string, mtime: number) {
  const c = zipped.get(file);
  if (c && c.mtime === mtime) return c.buf;
  const buf = gzipSync(readFileSync(file), { level: 9 });
  zipped.set(file, { mtime, buf });
  return buf;
}

/** Comprime todo de antemano al arrancar (si no, el primer jugador frenaría la simulación mientras se comprime). */
function warm(dir: string) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) warm(p); else if (ZIP.has(extname(p).toLowerCase())) gz(p, statSync(p).mtimeMs);
  }
}

export function createHttp(root: string | null) {
  if (root) warm(root);
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, SECURITY).end(); return; }
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); } catch { res.writeHead(400, SECURITY).end(); return; }
    if (path === "/salud") { res.writeHead(200, { ...SECURITY, "Content-Type": "text/plain" }).end("ok"); return; }
    if (!root) { res.writeHead(404, { ...SECURITY, "Content-Type": "text/plain; charset=utf-8" }).end("Sin página compilada: ejecuta npm run build."); return; }
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root + sep) || path.includes("\0")) { res.writeHead(403, SECURITY).end(); return; }
    let st;
    try { st = statSync(file); } catch { st = null; }
    if (!st?.isFile()) { res.writeHead(404, { ...SECURITY, "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado"); return; }
    const hashed = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(file); // nombres con huella de Vite: no cambian nunca
    const ext = extname(file).toLowerCase();
    const head = {
      ...SECURITY,
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": hashed ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=3600",
      Vary: "Accept-Encoding",
    };
    if (ZIP.has(ext) && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
      const buf = gz(file, st.mtimeMs);
      res.writeHead(200, { ...head, "Content-Encoding": "gzip", "Content-Length": buf.length });
      res.end(req.method === "HEAD" ? undefined : buf); return;
    }
    res.writeHead(200, { ...head, "Content-Length": st.size });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  });
}
