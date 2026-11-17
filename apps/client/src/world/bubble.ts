import * as THREE from "three";

// Bocadillo de texto sobre la cabeza (saludos de NPCs y mensajes de chat).
// Estilo heráldico plano: fondo pizarra, texto cal, borde oro, sin degradados.
const W = 512, H = 256, PAD = 18, LINE = 34, MAX_LINES = 4; // lienzo de tamaño fijo: la textura no se redimensiona

function wrap(g: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (g.measureText(next).width <= max || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > MAX_LINES) { lines.length = MAX_LINES; lines[MAX_LINES - 1] = lines[MAX_LINES - 1]!.replace(/.{0,2}$/, "…"); }
  // palabras más largas que el ancho: se recortan
  return lines.map(l => { while (l.length > 1 && g.measureText(l).width > max) l = l.slice(0, -2) + "…"; return l; });
}

export function createBubble(opts: { border?: string; scale?: number } = {}) {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat); sprite.renderOrder = 20; sprite.visible = false;
  sprite.center.set(0.5, 0); // se ancla por abajo (la punta) para crecer hacia arriba
  const unit = (opts.scale ?? 1) / 140; // metros por píxel
  sprite.scale.set(W * unit, H * unit, 1);
  let left = 0, total = 0, height = 0;

  function draw(text: string, name?: string) {
    g.font = "500 28px 'Alegreya Sans', system-ui, sans-serif";
    const lines = wrap(g, text, W - PAD * 2 - 8);
    const nameH = name ? 30 : 0;
    g.font = "500 28px 'Alegreya Sans', system-ui, sans-serif";
    let tw = Math.max(...lines.map(l => g.measureText(l).width));
    if (name) { g.font = "700 22px 'Alegreya Sans', system-ui, sans-serif"; tw = Math.max(tw, g.measureText(name).width); }
    const bw = Math.min(W - 8, Math.ceil(tw) + PAD * 2), bh = PAD * 2 + nameH + lines.length * LINE - 6, tail = 16;
    g.clearRect(0, 0, W, H);
    g.save(); g.translate(0, H - (bh + tail + 6)); // el bocadillo va pegado al borde de abajo (la punta es el ancla)
    const x0 = (W - bw) / 2;
    g.fillStyle = "rgba(13,18,28,.45)"; g.fillRect(x0 + 5, 5, bw, bh); // sombra plana
    g.fillStyle = "#1c2638"; g.fillRect(x0, 0, bw, bh);
    g.beginPath(); g.moveTo(W / 2 - 12, bh); g.lineTo(W / 2, bh + tail); g.lineTo(W / 2 + 12, bh); g.closePath(); g.fill();
    g.fillStyle = opts.border ?? "#e2b23f"; g.fillRect(x0, 0, 5, bh); // filete a la izquierda, como el seguimiento de misión
    g.textAlign = "center"; g.textBaseline = "top";
    let y = PAD - 2;
    if (name) { g.font = "700 22px 'Alegreya Sans', system-ui, sans-serif"; g.fillStyle = opts.border ?? "#e2b23f"; g.fillText(name, W / 2, y); y += nameH; }
    g.font = "500 28px 'Alegreya Sans', system-ui, sans-serif"; g.fillStyle = "#efe6d0";
    for (const l of lines) { g.fillText(l, W / 2, y); y += LINE; }
    g.restore();
    tex.needsUpdate = true;
    height = (bh + tail + 6) * unit;
  }

  return {
    sprite,
    /** Alto en metros de lo dibujado (para colocar cosas encima). */
    get height() { return height; },
    /** Tiene un mensaje en pantalla (aunque ahora esté oculto por distancia). */
    get visible() { return left > 0; },
    /** Muestra el texto; la duración por defecto depende de lo largo que sea. */
    show(text: string, seconds?: number, name?: string) {
      draw(text, name);
      total = left = seconds ?? Math.min(10, 3.5 + text.length * 0.06);
      sprite.visible = true; mat.opacity = 1;
    },
    hide() { left = 0; sprite.visible = false; },
    update(dt: number, show = true) {
      if (left <= 0) return;
      left -= dt;
      sprite.visible = left > 0 && show;
      mat.opacity = Math.min(1, left / 0.4, (total - left) / 0.15);
    },
    dispose() { tex.dispose(); mat.dispose(); },
  };
}
