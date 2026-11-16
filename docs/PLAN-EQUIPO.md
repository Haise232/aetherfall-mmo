# Plan de equipo y flujo de trabajo: MMORPG sandbox en navegador (estilo Albion Online)

Este documento es un plan. No contiene código del juego. Lo ejecuta quien invoque a los subagentes (una persona o un orquestador). La coordinación entre agentes es solo mediante archivos compartidos (ver "Puntos de traspaso").

## 1. Resumen de la tarea

**Objetivo:** un MMORPG sandbox en el navegador con cámara isométrica/top-down (Three.js), servidor autoritativo con WebSockets (Node + TypeScript), Postgres y un monorepo.

**Características clave de Albion que hay que cubrir:**
- Mundo abierto con zonas por nivel de riesgo (PvP y full loot).
- Economía dirigida por jugadores (recolección, crafting, mercado).
- Clase definida por el equipamiento, sin clases fijas.
- Gremios y territorios.

**Entregables por fase:**
- Fase 0: base del repositorio, CI y decisiones de arquitectura.
- Fase 1 (MVP): movimiento y combate básico multijugador en una zona.
- Fase 2: inventario, crafting y mercado, con persistencia.
- Fase 3: gremios, zonas PvP, full loot y territorios.
- Fase 4: endurecimiento, escalado y lanzamiento.

## 2. Inventario de agentes

Se resolvió el directorio `C:\Users\Joaqu\.claude\agents`. El primer `Glob` devolvió 100 de 160 archivos, y un segundo `Glob` con el patrón `[o-z]*.md` listó el resto de los que empiezan por o–z. Confirmé la existencia y la `description` de los agentes que se usan abajo leyendo sus archivos. No los leí todos a fondo.

Agentes usados y por qué:

| Agente | Capacidad (según su archivo) | Herramientas |
|---|---|---|
| game-developer | sistemas de juego, ECS, rendering, físicas, IA/pathfinding, networking multijugador | Read, Write, Edit, Bash, Glob, Grep |
| websocket-engineer | comunicación bidireccional en tiempo real con WebSockets a escala | Read, Write, Edit, Bash, Glob, Grep |
| typescript-pro | tipos avanzados, genéricos, type-safety de extremo a extremo | Read, Write, Edit, Bash, Glob, Grep |
| backend-developer | APIs y backends de producción | Read, Write, Edit, Bash, Glob, Grep |
| postgres-pro | rendimiento de PostgreSQL, replicación, backups | Read, Write, Edit, Bash, Glob, Grep |
| database-optimizer | consultas lentas e índices | Read, Write, Edit, Bash, Glob, Grep |
| frontend-developer | aplicaciones frontend en React, Vue o Angular | Read, Write, Edit, Bash, Glob, Grep |
| ui-designer | interfaces visuales y sistemas de diseño | Read, Write, Edit, Bash, Glob, Grep |
| visual-asset-generator | generación de assets visuales mediante `mcp__prompt-to-asset` | Read, Write, Bash, mcp__prompt-to-asset |
| security-engineer | modelado de amenazas, controles de seguridad en CI/CD | Read, Write, Edit, Bash, Glob, Grep |
| penetration-tester | pruebas de intrusión autorizadas | Read, Grep, Glob, Bash (no escribe archivos) |
| security-auditor | auditoría | Read, Grep, Glob (solo lectura) |
| devops-engineer | CI/CD, contenedores, despliegue | Read, Write, Edit, Bash, Glob, Grep |
| docker-expert | imágenes y orquestación de contenedores | Read, Write, Edit, Bash, Glob, Grep |
| sre-engineer | SLO, fiabilidad, respuesta a incidentes | Read, Write, Edit, Bash, Glob, Grep |
| qa-expert | estrategia de QA y planes de prueba | Read, Grep, Glob, Bash (no escribe archivos) |
| test-automator | frameworks de pruebas automatizadas e integración en CI | Read, Write, Edit, Bash, Glob, Grep |
| performance-engineer | cuellos de botella de rendimiento | Read, Write, Edit, Bash, Glob, Grep |
| chaos-engineer | experimentos de fallo y pruebas de resiliencia | Read, Write, Edit, Bash, Glob, Grep |
| architect-reviewer | revisión de arquitectura a nivel macro | Read, Write, Edit, Bash, Glob, Grep |
| api-designer | diseño de contratos y especificaciones de API | Read, Write, Edit, Bash, Glob, Grep |
| documentation-engineer | sistemas de documentación | Read, Write, Edit, Glob, Grep, WebFetch, WebSearch |
| project-manager | planes, riesgos y seguimiento | Read, Write, Edit, Glob, Grep, WebFetch, WebSearch |
| performance-monitor | plan de observabilidad a partir de métricas y logs existentes | ver su archivo |
| legal-advisor | términos de servicio, IP, riesgos legales | Read, Write, Edit, Glob, Grep, WebFetch, WebSearch |

**Notas de adecuación (honestas):**
- No existe un agente "three.js" dedicado. El render con Three.js lo cubre **game-developer**, que lista rendering, shaders, LOD y culling, apoyado en las skills `threejs-*` de `.claude/skills` (13 skills encontradas). Es un ajuste razonable pero no perfecto: hay que indicarle explícitamente que lea esas skills.
- `frontend-developer` se describe para React, Vue y Angular. Úsalo solo para la UI que rodea al canvas (HUD, inventario, mercado, chat). La skill `threejs-react-three-fiber` existe, pero la decisión de usar React o DOM sin framework es una pregunta abierta (sección 9).
- **qa-expert**, **penetration-tester** y **security-auditor** no tienen herramienta `Write`. Pueden analizar y ejecutar con Bash (los dos primeros) o solo leer (el tercero). Cualquier informe que produzcan debe guardarlo otro agente (por ejemplo `documentation-engineer`) o el orquestador. La automatización de pruebas va a **test-automator**, que sí escribe archivos.
- No hay un agente de diseño de juego (economía, balance, tablas de loot). Es un hueco, ver sección 9.

## 3. Principios de arquitectura (a validar por architect-reviewer)

1. **Servidor autoritativo.** El cliente envía intenciones (input, comando), nunca estado. El servidor simula, valida y difunde.
2. **Simulación con tick fijo** (por ejemplo 20 Hz), con predicción en el cliente, reconciliación e interpolación de entidades remotas. Los valores concretos se miden en el MVP, no se asumen.
3. **Paquete `shared` con tipos y reglas puras** (protocolo, fórmulas de combate, stats) usado por cliente y servidor. Esto permite predicción determinista y type-safety de extremo a extremo.
4. **Datos de juego en archivos de datos** (items, recetas, mobs, zonas), versionados y validados al cargar, no en código.
5. **Estado caliente en memoria, persistencia asíncrona en Postgres.** Las operaciones económicas (compra, venta, crafting, trade) son transacciones en la base de datos con registro de auditoría (ledger).
6. **Un proceso de servidor por zona** (shard de zona) desde el diseño, aunque el MVP corra todo en un proceso. Un gateway enruta jugadores a zonas.

## 4. Estructura de carpetas propuesta del monorepo

```
Mmorpg/
├─ .claude/skills/              (ya existe: skills threejs-*)
├─ docs/
│  ├─ PLAN-EQUIPO.md            (este archivo)
│  ├─ adr/                      (decisiones de arquitectura numeradas)
│  ├─ protocol.md               (contrato de mensajes cliente-servidor)
│  ├─ threat-model.md
│  ├─ test-strategy.md
│  └─ handoff/                  (notas de traspaso entre agentes, ver sección 7)
├─ apps/
│  ├─ client/                   (Three.js + UI; Vite)
│  ├─ game-server/              (simulación autoritativa por zona, WebSockets)
│  ├─ gateway/                  (login, sesión, enrutado a zonas; Fase 2-3)
│  └─ api/                      (REST: cuentas, mercado, gremios; puede empezar dentro de gateway)
├─ packages/
│  ├─ shared/                   (tipos, protocolo, reglas puras, fórmulas)
│  ├─ game-data/                (items, recetas, mobs, zonas en JSON/TS validado)
│  ├─ db/                       (esquema, migraciones, repositorios)
│  ├─ netcode/                  (serialización, predicción, interpolación, utilidades de tick)
│  └─ config/                   (tsconfig base, eslint, prettier)
├─ tools/
│  ├─ bots/                     (clientes simulados para carga y pruebas)
│  ├─ zone-editor/              (opcional: edición/exportación de mapas)
│  └─ scripts/                  (seed, utilidades)
├─ infra/
│  ├─ docker/                   (Dockerfiles, docker-compose para dev)
│  └─ ci/                       (pipelines)
├─ tests/
│  ├─ e2e/
│  └─ load/
├─ package.json                 (workspaces)
└─ tsconfig.base.json
```

El gestor de workspaces (pnpm, npm o similar) y el orquestador de tareas (Turborepo, Nx o ninguno) se deciden en la Fase 0 (ADR).

## 5. Fases, módulos y asignación de agentes

La numeración S-x identifica subtareas. En cada fase, "dep." indica lo que debe estar terminado antes.

### Fase 0: Fundaciones (corta, mayormente secuencial)

| ID | Subtarea | Agente | Dep. | Criterio de terminado |
|---|---|---|---|---|
| S0.1 | Backlog de MVP y alcance recortado, criterios de aceptación | project-manager | ninguna | Backlog priorizado en `docs/backlog.md` |
| S0.2 | ADRs: protocolo de red, tick, formato de mensajes, workspaces, ECS sí/no, un proceso por zona | architect-reviewer (revisa) con game-developer y websocket-engineer (proponen) | S0.1 | ADRs 001..n en `docs/adr/` aprobados por el humano |
| S0.3 | Scaffold del monorepo, tsconfig estricto, lint, tipos compartidos base | typescript-pro | S0.2 | `pnpm install && build` (o equivalente) pasa en vacío |
| S0.4 | Pipeline de CI (lint, typecheck, tests) y docker-compose de dev con Postgres | devops-engineer (con docker-expert para imágenes) | S0.3 | CI verde en una rama vacía |
| S0.5 | Modelo de amenazas inicial (cheats típicos del género, cuentas, economía) | security-engineer | S0.2 | `docs/threat-model.md` |
| S0.6 | Estrategia de pruebas (unitarias, simulación determinista, carga con bots) | qa-expert (análisis, sin Write; lo guarda el orquestador o test-automator) | S0.2 | `docs/test-strategy.md` |

Paralelo: S0.3 y S0.5/S0.6 una vez terminado S0.2. S0.4 requiere S0.3.

### Fase 1: MVP, movimiento y combate básico multijugador en una zona

| ID | Subtarea | Agente | Dep. | Criterio de terminado |
|---|---|---|---|---|
| S1.1 | Contrato de protocolo v0 (conectar, input, snapshot, ataque, daño, muerte) | websocket-engineer + typescript-pro (tipos en `packages/shared`) | S0.2, S0.3 | `docs/protocol.md` y tipos compilando |
| S1.2 | Servidor de juego: bucle de tick fijo, gestión de conexiones, entidades, validación de inputs | game-developer + websocket-engineer | S1.1 | Dos clientes de prueba (bots) se ven moviéndose |
| S1.3 | Movimiento: velocidad máxima, colisión con mapa (grid/navmesh simple), anti-speedhack en servidor | game-developer | S1.2 | Inputs inválidos rechazados en pruebas |
| S1.4 | Combate básico: auto-ataque y 2-3 habilidades, cooldowns, daño, muerte/respawn, mobs simples con IA de persecución | game-developer | S1.2 | Duelo jugador vs jugador y jugador vs mob funcional |
| S1.5 | Cliente Three.js: escena, cámara isométrica, terreno, personaje, input, render de entidades remotas | game-developer (con skills `threejs-*`) | S1.1 | Se ve y se controla al personaje contra servidor local |
| S1.6 | Netcode cliente: predicción, reconciliación, interpolación, reloj sincronizado | game-developer + websocket-engineer | S1.2, S1.5 | Movimiento fluido con latencia artificial |
| S1.7 | Cuentas y sesión mínimas (login/registro, token de sesión) y persistencia básica del personaje | backend-developer + postgres-pro (esquema) | S0.4 | Personaje conserva posición/nivel al reconectar |
| S1.8 | HUD mínimo (vida, hotbar, chat, nameplates) | frontend-developer + ui-designer | S1.5 | HUD sobre el canvas |
| S1.9 | Assets provisionales (modelos low-poly, texturas, iconos) | visual-asset-generator | ninguna | Carpeta de assets con licencia clara |
| S1.10 | Bots de carga y pruebas de integración del bucle de tick | test-automator | S1.2 | Prueba con N bots en CI |
| S1.11 | Revisión de seguridad del MVP: validación de mensajes, rate limit, límites de tamaño de frame | security-engineer; revisión adicional con security-auditor | S1.2, S1.7 | Lista de hallazgos corregidos o aceptados |

Hito MVP: ~N jugadores simultáneos (N se mide con S1.10, no se fija a priori) combatiendo en una zona, con reconexión y persistencia mínima.

**Paralelización en Fase 1:**
- Tras S1.1, tres líneas independientes: servidor (S1.2-S1.4), cliente (S1.5, S1.8) y persistencia (S1.7).
- S1.9 corre desde el inicio.
- S1.6 es el punto de unión de cliente y servidor.
- Riesgo de conflicto de archivos: dos agentes no deben editar `packages/shared` a la vez. Un solo propietario (typescript-pro) acepta cambios de protocolo.

### Fase 2: Inventario, crafting y mercado

| ID | Subtarea | Agente | Dep. | Criterio |
|---|---|---|---|---|
| S2.1 | Diseño de la economía: items, tiers, recursos, recetas, sumideros de oro, reglas de durabilidad | **hueco: sin agente de diseño de juego** (borrador por project-manager o product-manager; decisiones por el humano) | Fase 1 | `packages/game-data` con esquema definido |
| S2.2 | Esquema de BD: inventarios, items, ledger de transacciones, órdenes de mercado | postgres-pro (con database-optimizer en índices) | S2.1 | Migraciones y pruebas de integridad |
| S2.3 | Inventario y equipamiento en servidor: slots, peso, equipar; **la clase emerge del equipamiento** (armas y armaduras otorgan habilidades) | game-developer + backend-developer | S2.1, S2.2 | Cambiar equipo cambia habilidades disponibles |
| S2.4 | Recolección de recursos en el mundo (nodos, respawn, herramientas) | game-developer | S2.3 | Un jugador recolecta y el nodo reaparece |
| S2.5 | Crafting: recetas, estaciones, colas de producción, validación atómica en transacción | backend-developer + postgres-pro | S2.2, S2.3 | Craft consume y produce de forma atómica |
| S2.6 | Mercado: órdenes de compra/venta, matching, comisiones, historial | backend-developer + postgres-pro; contrato por api-designer | S2.2 | Dos jugadores comercian sin duplicar items |
| S2.7 | Prevención de duplicación (dupes): idempotencia, bloqueos, ledger, reconciliación | security-engineer + postgres-pro | S2.5, S2.6 | Pruebas de concurrencia que no encuentran duplicados |
| S2.8 | UI de inventario, equipamiento, crafting y mercado | frontend-developer + ui-designer | S2.3, S2.6 (contratos) | Flujos completos jugables |
| S2.9 | Pruebas automatizadas de economía (propiedades: conservación de items y oro) | test-automator | S2.5, S2.6 | Corren en CI |
| S2.10 | Gateway/API separados del servidor de zona | backend-developer + websocket-engineer | S1.7 | Login independiente de zona |
| S2.11 | Documentación de API y de datos de juego | documentation-engineer | S2.6 | Docs actualizadas |

**Paralelización:** S2.2 y S2.1 arrancan juntos (S2.2 usa borrador de S2.1). S2.4 y S2.5 y S2.6 son independientes entre sí una vez estable el inventario. La UI (S2.8) puede avanzar con mocks apoyándose en los contratos.

### Fase 3: Gremios, zonas por riesgo, PvP y territorios

| ID | Subtarea | Agente | Dep. | Criterio |
|---|---|---|---|---|
| S3.1 | Zonas por riesgo (segura, amarilla, roja, negra): reglas de PvP, pérdida de items, portales entre zonas | game-developer + backend-developer | Fase 2 | Reglas por zona configurables en `game-data` |
| S3.2 | Full loot: muerte suelta equipo/inventario según la zona, tumba/loot lootable, protección anti-abuso | game-developer + security-engineer | S3.1 | Pruebas de que no hay duplicación ni pérdida |
| S3.3 | Múltiples shards de zona, transferencia de personajes entre procesos | websocket-engineer + backend-developer + architect-reviewer | S2.10, S3.1 | Cambiar de zona sin perder estado |
| S3.4 | Gremios: creación, roles, banco de gremio, chat | backend-developer + postgres-pro; UI por frontend-developer | Fase 2 | CRUD y permisos probados |
| S3.5 | Territorios: reclamar, impuestos, ventanas de conflicto, asedios | game-developer + backend-developer | S3.4, S3.1 | Un gremio puede poseer un territorio |
| S3.6 | Chat, grupos/parties, amigos, reportes | websocket-engineer + backend-developer | S2.10 | Canales funcionando |
| S3.7 | Anti-cheat de segunda capa: detección estadística de aimbots/speedhacks, logs de auditoría, herramientas de moderación | security-engineer | S3.1 | Alertas en pruebas |
| S3.8 | Pruebas de penetración | penetration-tester (analiza, no escribe), registrado por security-engineer | S3.2, S3.5 | Informe con hallazgos clasificados |
| S3.9 | UI de mapa, gremios, party, minimapa | frontend-developer + ui-designer | S3.4 | Jugable |
| S3.10 | Pruebas de carga con bots en múltiples zonas | test-automator + performance-engineer | S3.3 | Resultados guardados en `tests/load/` |

### Fase 4: Endurecimiento, escalado y lanzamiento

| ID | Subtarea | Agente | Dep. | Criterio |
|---|---|---|---|---|
| S4.1 | Rendimiento del cliente (draw calls, instancing, LOD, culling, memoria) | game-developer + performance-engineer (skill `threejs-performance`) | Fase 3 | Perfiles antes/después |
| S4.2 | Rendimiento y escala de Postgres: índices, particionado, réplica, backups | postgres-pro + database-optimizer | Fase 3 | Plan de backup restaurado en una prueba |
| S4.3 | Despliegue (contenedores, entornos staging y producción, rollout de zonas) | devops-engineer + docker-expert (kubernetes-specialist disponible si se elige Kubernetes) | Fase 3 | Despliegue reproducible |
| S4.4 | Observabilidad: SLO, métricas de tick, latencia, errores, alertas | sre-engineer + performance-monitor | S4.3 | Dashboards/plan en `docs/observability.md` |
| S4.5 | Pruebas de caos (caída de zona, corte de BD, pérdida de paquetes) | chaos-engineer | S4.3 | Informe y correcciones |
| S4.6 | Términos de servicio, privacidad, normas de la economía virtual | legal-advisor | independiente | Borradores revisados por una persona |
| S4.7 | Documentación para jugadores y desarrolladores | documentation-engineer | Fase 3 | Docs publicadas |
| S4.8 | Revisión final de arquitectura y deuda técnica | architect-reviewer + refactoring-specialist | Fase 3 | Lista de deuda priorizada |

## 6. Orden, dependencias y paralelización

```
Fase 0:  S0.1 -> S0.2 -> { S0.3 -> S0.4 } || S0.5 || S0.6
Fase 1:  S1.1 -> { servidor S1.2->S1.3,S1.4 } || { cliente S1.5->S1.8 } || { persistencia S1.7 } || S1.9
         S1.6 une cliente+servidor -> S1.10 -> S1.11 -> HITO MVP
Fase 2:  S2.1 || S2.2 -> { S2.3 -> S2.4,S2.5 } || S2.6 -> S2.7 -> S2.9;  S2.8 en paralelo con mocks;  S2.10 en paralelo
Fase 3:  S3.1 -> S3.2;  S3.4 -> S3.5;  S3.3 tras S2.10;  S3.7 -> S3.8 -> S3.10
Fase 4:  S4.1 || S4.2 || S4.3 -> S4.4 -> S4.5;  S4.6 y S4.7 en cualquier momento
```

**Cuellos de botella (secuenciales por obligación):**
- S0.2 antes de todo el código.
- S1.1 (protocolo) antes de servidor y cliente.
- S2.2 (esquema de economía) antes de crafting y mercado.
- Los cambios en `packages/shared` pasan por un único dueño.

**Recomendación de ritmo:** no avanzar de fase hasta que el hito de la anterior se haya jugado de verdad (con bots y al menos pruebas manuales). Albion-like es un proyecto grande: tomar el MVP como producto demostrable por sí mismo.

## 7. Puntos de traspaso (archivos compartidos)

| Archivo | Escribe | Lee |
|---|---|---|
| `docs/backlog.md` | project-manager | todos |
| `docs/adr/*.md` | architect-reviewer, game-developer, websocket-engineer | todos |
| `docs/protocol.md` y `packages/shared` | websocket-engineer, typescript-pro | game-developer, frontend-developer, backend-developer, test-automator |
| `packages/game-data` | game-developer (con decisiones del humano) | servidor, cliente, test-automator |
| `packages/db` (esquema y migraciones) | postgres-pro, backend-developer | backend-developer, test-automator, security-engineer |
| `docs/threat-model.md` | security-engineer | todos los desarrolladores |
| `docs/test-strategy.md` | orquestador/test-automator a partir de qa-expert | test-automator |
| `docs/handoff/<ID>-<agente>.md` | cada agente al terminar una subtarea (qué hizo, qué falta, decisiones) | el siguiente agente |

Sugerencia: pedir a `context-manager` o al orquestador que fije estas rutas y que cada agente lea `docs/handoff/` antes de empezar. Un orquestador como `workflow-orchestrator` puede convertir las dependencias de la sección 6 en un flujo ejecutable, y `task-distributor` o `multi-agent-coordinator` en repartir las ramas paralelas. Existen los tres archivos de agente, pero no verifiqué sus detalles.

## 8. Riesgos

### Netcode
- **Latencia y percepción:** sin predicción y reconciliación, el movimiento se siente lento. Mitigación: S1.6 con latencia y pérdida simuladas desde el primer día de pruebas.
- **Ancho de banda:** enviar snapshots completos no escala. Mitigación: interés por área (grid espacial), deltas, cuantización y serialización binaria; medir bytes por jugador en bots.
- **Desincronización de reglas:** si cliente y servidor calculan distinto. Mitigación: reglas puras en `packages/shared`, pruebas deterministas.
- **WebSockets sobre TCP:** hay bloqueo de cabecera de línea ante pérdida de paquetes. Es una limitación conocida; WebRTC DataChannel o WebTransport son alternativas a evaluar en un ADR si las pruebas muestran problemas. No se asume que haga falta.
- **Pausas del recolector de basura de Node** en el bucle de tick. Mitigación: evitar asignaciones en el bucle caliente, medir la duración del tick.

### Anti-cheat
- Nunca confiar en el cliente: posición, daño, cooldowns, loot y precios se calculan o validan en el servidor.
- Riesgos típicos: speedhack, teletransporte, manipulación de paquetes, bots de recolección, duplicación de items, abuso de mercado, DDoS y suplantación de cuentas.
- El cliente en navegador es inspeccionable por completo; la ofuscación no es una defensa. El valor está en la validación del servidor, el rate limiting, la detección estadística y los logs de auditoría.
- Full loot eleva el incentivo para hacer trampa. S3.2 y S3.8 son críticos antes de abrir zonas de PvP.
- Los bots de recolección y de mercado son difíciles de eliminar del todo; es una carrera continua, planificar moderación.

### Escalado
- Un solo proceso Node es de un hilo. Mitigación: un proceso por zona (principio 6) y límites de jugadores por instancia.
- Cuello de botella en Postgres si cada acción escribe. Mitigación: estado en memoria, escrituras agrupadas, transacciones solo para operaciones económicas.
- Mercado y subastas con alta concurrencia: bloqueos y contención. Mitigación: S2.7 y pruebas de concurrencia.
- Migración de personajes entre zonas (S3.3): fuente típica de bugs y de duplicación.
- Los números concretos de capacidad (jugadores por zona, por servidor) **no se conocen todavía**; salen de S1.10 y S3.10.

### Producto y alcance
- El riesgo mayor es el alcance. El MVP debe quedarse en una zona, sin economía.
- Assets: la calidad visual depende de la generación; hay que verificar licencias y coherencia de estilo.
- El balance y el diseño económico no tienen agente asignado (hueco).

## 9. Preguntas abiertas y huecos

1. **Hueco de diseño de juego:** no hay un agente de diseño de sistemas, economía o balance entre los que revisé. Decisiones de economía, tablas de loot y progresión necesitan a una persona, apoyada por project-manager o product-manager. Si hay otro agente de diseño de juego en el directorio, no lo identifiqué.
2. **Three.js:** no hay agente específico. Se usa game-developer con las skills `threejs-*`. Confirmar si se prefiere el cliente con React Three Fiber (skill `threejs-react-three-fiber`) o Three.js plano con UI en DOM. Esto cambia el papel de frontend-developer.
3. **Gestor de monorepo y orquestador de builds:** decidir en Fase 0.
4. **Transporte:** WebSocket nativo frente a Socket.IO. Para un juego con snapshots frecuentes, `ws` con protocolo binario propio es la opción habitual, pero queda para el ADR.
5. **Alojamiento y presupuesto:** definir proveedor, región y coste objetivo antes de S4.3.
6. **Equipo y paralelismo real:** el plan supone que varios agentes trabajan en paralelo sobre ramas distintas. Si solo hay un orquestador secuencial, la Fase 1 se ordena así: S1.1, S1.2, S1.5, S1.6, S1.3, S1.4, S1.7, S1.8.
7. **Estrategia de ramas y fusión:** si se quiere automatizar, el agente git-workflow-manager existe, pero no revisé sus detalles.
8. **Legal:** la economía virtual con dinero real (compras, venta de oro) añade requisitos de pagos y cumplimiento (payment-integration, compliance-auditor existen). Fuera del alcance de este plan hasta que se decida monetizar.

## 10. Resumen de cifras

- Archivos de agentes en el directorio: 160 (conteo del primer `Glob`, que informó 100 mostrados de 160 totales).
- Agentes en la tabla de la sección 2: 25 (además se mencionan product-manager, refactoring-specialist, kubernetes-specialist y los coordinadores workflow-orchestrator, task-distributor, multi-agent-coordinator y context-manager, cuya existencia confirmé por nombre de archivo).
- Subtareas: 6 (Fase 0) + 11 (Fase 1) + 11 (Fase 2) + 10 (Fase 3) + 8 (Fase 4) = 46.
- Subtareas sin agente adecuado: 1 (S2.1, diseño de economía).
