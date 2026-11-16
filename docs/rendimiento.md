# Rendimiento (medido 2026-11-16)

Herramientas: `npx tsx tools/bots/load.ts 50,100,200 20` (bots por WebSocket contra servidor propio en :8899, DB `:memory:`, `DEBUG_TICK=1`) y `npx tsx tools/bots/bench-step.ts` (Zone.step() en proceso). `apps/server/src/main.ts` acepta `PORT`, `DB_PATH`, `DEBUG_TICK=1`.
Nota: máquina compartida con otros procesos y bots en el mismo equipo: cifras con ruido (picos por GC/planificador).

## Servidor (step = simulación + JSON.stringify + send)
| Bots | tick medio | p95 | máx | snapshot/cliente | salida total |
|---|---|---|---|---|---|
| 25 | 1.3 ms | 2 ms | 6 ms | 5.7 KB | ~2.3 MB/s |
| 50 | 4-16 ms | 7+ ms | 160 ms | 9 KB | 4-8 MB/s |
| 100 | 11-12 ms | 15-40 ms | 44-250 ms | 15-16 KB | 29 MB/s |
| 200 | 20 ms (red) | 28 ms | 63 ms (picos GC >1 s en bench) | 28-30 KB | 108-113 MB/s |
| 400 | 51 ms | 78 ms | 136 ms | 56 KB | 284 MB/s, RSS 2 GB |
El tick medio supera 50 ms hacia 400 bots; el p95/máx lo supera ya desde ~100-200 (picos GC).

## Cuellos de botella (servidor)
1. Snapshot completo a todos: ~130 B/entidad x (N+22) entidades x N clientes x 20 Hz = O(N^2). 100 jugadores = 29 MB/s; inviable en red real (un cliente a 100 jugadores recibiría 15 KB x 20 = 300 KB/s).
2. `JSON.stringify` se repite por cada cliente con el mismo objeto (N serializaciones de N entidades) y genera basura -> picos de GC y RSS 2 GB a 400.
3. Guardado cada 10 s de todos los jugadores de forma síncrona en el mismo tick (SQLite) -> picos.
4. nearestPlayer por lobo recorre todas las entidades (menor, 22 lobos).

## Recomendaciones servidor
- P0: interés por área (rejilla de celdas ~32 m, enviar entidades en radio ~60 m: la cámara ve <=60 m). Pasa de N a ~decenas de entidades por cliente.
- P0: delta (solo entidades cambiadas; posiciones cuantizadas a 0.1 m; name/weapon/armor/maxHp solo al entrar en interés). Estimado 130 B -> ~12 B por entidad móvil.
- P1: serializar una vez por celda/grupo, o formato binario; reducir envío a 10 Hz con interpolación.
- P1: guardar jugadores escalonado (p. ej. 1/200 por tick) o en lote con transacción.
- P2: perMessageDeflate no recomendado (CPU); mejor delta+binario.

## Cliente (Edge+swiftshader, 1280x720, draw calls/triángulos reales; ms de swiftshader NO representativos)
| ?view | draw calls (principal) | triángulos principal | draw calls sombra | triángulos sombra |
|---|---|---|---|---|
| 20 | ~390 | ~144 k | ~350 | ~118 k |
| 40 | ~500 | ~269 k | ~390 | ~125 k |
| 60 | ~340 | ~309 k | ~195 | ~80 k |
(frame en software 1.3-2.7 s; promedio de los últimos 5 frames, varía con la posición.)

## Cuellos de botella (cliente)
1. Triángulos del pase principal crecen con la vista (144 k -> 309 k): árboles/hierba/casas instanciados sin LOD.
2. Pase de sombras: ~80-125 k triángulos y ~200-390 draw calls EXTRA cada frame, y son casi tan caros como el principal. El frustum de sombra es ±36 m, pero las mallas fusionadas gigantes (lobby.ts ~l.94) y los InstancedMesh completos (árboles ~2400) siempre pasan el culling -> se renderizan enteros en el mapa de sombras.
3. ~400-500 draw calls totales en principal: aceptable en GPU, alto en móvil; ponerse a 800+ con sombras.
4. antialias + pixelRatio 2 + PCF 2048 en pantallas grandes (coste de relleno).

## Recomendaciones cliente
- P0: sombras solo para jugadores/lobos/edificios cercanos: quitar castShadow a hierba, árboles lejanos y muralla; o `shadowMap.autoUpdate=false` y actualizar cada N frames/al moverse >2 m.
- P0: dividir mallas fusionadas e instancias por chunks (p. ej. 50 m) para que el frustum culling funcione (también en el pase de sombras).
- P1: LOD/distancia de dibujado: ocultar hierba y props pequeños fuera de ~50 m; árboles lejanos con geometría simple.
- P1: pixelRatio máx 1.5 y opción de calidad (sombras off).
- P2: exponer `renderer.info` con `?debug` para medir sin hacks.
