# ADR 001: Decisiones iniciales

Estado: aceptado (tomadas por Claude por delegación del usuario). Restricción: presupuesto 0 y, por ahora, solo desarrollo local (sin hosting).

| Tema | Decisión | Motivo |
|---|---|---|
| Cliente | Three.js plano + Vite, UI en DOM | Control total del rendimiento; sin capa React en el bucle de render |
| Red | `ws` (WebSocket), mensajes JSON en v0 | Simple de depurar; pasar a binario cuando se mida el ancho de banda |
| Gestor | npm workspaces, sin Turborepo | Cero herramientas extra |
| Lenguaje | TypeScript estricto en todo | Tipos compartidos cliente-servidor |
| Servidor | Autoritativo, tick fijo 20 Hz | El cliente envía intenciones, nunca estado |
| Lógica | `Zone` independiente del transporte | Permite moverla luego a otro runtime (p. ej. Durable Objects) sin reescribir |
| Base de datos | Aplazada (Fase 1: S1.7). SQLite local o similar, gratis | Sin coste; Postgres solo si hace falta |
| Hosting | Aplazado | Decisión del usuario |

## Estructura

- `packages/shared`: protocolo y reglas puras (movimiento) usadas por cliente y servidor.
- `apps/server`: servidor de juego (Node + ws). `zone.ts` es la simulación, `main.ts` el transporte.
- `apps/client`: cliente Three.js con cámara isométrica.

## Cómo ejecutar

```
npm install
npm run dev:server   # ws://localhost:8787
npm run dev:client   # http://localhost:5173
```
