# Handoff General — 2026-09-26

Continuación directa de `GENERAL_HANDOFF_2026-09-21.md`. Sesión muy larga: triage del informe
de julio, laboratorio Jarvis-Research auditado y cerrado, deploy del feedback button, rediseño
completo de Settings, `DetailScreen` con edición completa (título/ícono/color/categoría/apuntes),
los 7 quick wins del triage de julio, fix del dual schema de movimientos, arreglo del token de
Telegram (con un bug real de doc encontrado en el camino: `docker-compose restart` no relee
`.env`), auditoría genérica de Jarvis (24 hallazgos, corregidos y deployados, con una corrección
mía sobre el hallazgo #18 que violaba el patrón strangler), y auditoría de los 4 módulos
restantes (Bóveda cerrada y deployada; Finanzas/Hábitos/Agenda con reportes de corrección pero
**código no recuperable todavía**, ver más abajo).

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Triage `SGR-Informe-Siguiente-Nivel.md` (julio 2026)** — verificado ítem por ítem contra el
  código real. Premisa de "cero tests" ya no aplicaba; el resto de la deuda (monolitos, cajones
  por typo, migraciones, dual schema, quick wins) se volcó a `PROXIMAMENTE.md` con evidencia. 7
  quick wins implementados después en tanda aparte (3 commits: `8317089`, `502c18d`, `3652bef`).
  Archivo original + verificación borrados una vez volcado el contenido.
- **Laboratorio Jarvis-Research** (`D:\Proyectos\Investigacion\Jarvis-Research\`, no
  `D:\Jarvis-Research\` como decía la doc vieja) — dado por perdido en el handoff anterior por
  buscar en la ruta equivocada; auditado a fondo, ola 1 completada (7/7 dossiers), 1 ADR
  (routing de agentes/modelos) anotado en `PROXIMAMENTE.md` sin implementar. Ola 2 sigue sin
  arrancar, sin decisión de retomarla.
- **Deploy feedback button + rediseño de Settings + DetailScreen completo + 7 quick wins + fix
  dual schema** — todo verificado (tests + build) y deployado al homelab, en varias tandas.
  Commits en `master` entre `12ef1b3` y `a09fa61` aprox (ver `git log`).
- **Fix token de Telegram** — el token estaba partido en dos entre `TELEGRAM_BOT_TOKEN` y
  `BOT_ALLOWED_CHAT_IDS` por un error de copiado; corregido. Bug de infra real encontrado:
  `docker-compose restart` no aplica cambios de `.env` (usa el entorno cacheado del último
  `up`), hay que usar `docker-compose up -d --no-build <servicio>` — documentado en
  `HOMELAB.md` y en memoria.
- **Auditoría genérica de Jarvis** (prompt de solo lectura → 24 hallazgos, prioridad "alto":
  fuga de privacidad en `call_reason()` sin Privacy Gateway desde auditoría/consolidación/
  triage) — otra sesión implementó los 24 sin que se le pidiera (solo se pidió el #1), commit
  `e0f02d8`. Encontré y corregí un problema real en su fix del hallazgo #18: hacía que **todo
  el backend** abortara el arranque si Jarvis fallaba al inicializar, violando el patrón
  strangler declarado en `CLAUDE.md` — revertido, commit `d66f1c5` (Jarvis se deshabilita solo,
  el resto de SGR sigue funcionando). Deployado al homelab.
- **Auditoría de Bóveda** (27 hallazgos + 1 encontrado por la propia sesión) — implementada en
  dos tandas (`21c27c1`, `3bc88be`), revisadas diff por diff antes de commitear. **Al deployar
  la primera tanda, encontré un crash real en producción** (`TypeError` en `sincronizar_vault`,
  carrera entre requests concurrentes) — diagnosticado, arreglado con test de regresión, commit
  `91202a3`, redeployado y verificado. Bóveda queda **cerrada y deployada por completo**.
- **Auditoría de Finanzas/Hábitos/Agenda** — prompts entregados (con mis aclaraciones en
  MAYÚSCULAS sobre 3 puntos ambiguos: Agenda materializa ocurrencias como filas independientes
  con `serie_id` en vez de solo avisar; Hábitos no permite marcar días futuros; Hábitos extiende
  la grilla horaria en vez de restringir el horario del hábito). **CORRECCIÓN sobre lo que decía
  antes esta misma entrada**: en un primer chequeo (`git status`/`git fetch`) el código parecía
  no existir en ningún lado — error mío, esas tres sesiones corrieron en este mismo checkout
  local (no en sandboxes), simplemente todavía no habían commiteado en el momento en que
  chequeé. **Ya está todo commiteado y pusheado a `origin/master`**, confirmado con
  `git log`/`git status` después:
  - `9b13ab1` — Finanzas (30 archivos, `crud.py` con 648 líneas cambiadas — ledger PPC,
    conversión de moneda, validación de ventas retroactivas; UI nueva `GlobalLedgerPanel.jsx`/
    `FinDataTools.jsx` para CSV).
  - `ebc0127` — Hábitos (H01-H15 + P0 offline con `cliente_id`/outbox).
  - `daedd4e` — Agenda (recurrencia materializada con `serie_id`, migración de series
    virtuales viejas al arrancar, auto-extensión de ventana — este último no era parte del
    alcance original de esta auditoría).
  - Suite completa verificada por el orquestador después de estos 3 commits: **375 backend (0
    skip) + 184 frontend en verde, build limpio**.
  - **Revisión de diffs de riesgo — empezada, no terminada** (nos quedamos sin contexto a mitad
    de la revisión): repasé `finanzas.js` (helpers de conversión de moneda —
    `montoEnMoneda`/`contribucionCategoriaEnMoneda`/`acumuladoPorCategoriaNombreEnMoneda`, todo
    correcto, reemplaza duplicación vieja) y `_recalcular_posicion` en `crud.py` (recorre
    transacciones en orden FIFO por fecha, valida venta contra la posición disponible en ESE
    punto — `if cant > cantidad + 1e-8: raise ValueError(...)` — y congela el tipo de cambio de
    compras ARS legacy sin `tipo_cambio` una sola vez; se ve correcto). **Falta revisar**: el
    resto de `crud.py` de Finanzas (2.048 líneas de diff sin repasar), la migración de series
    recurrentes de Agenda en `daedd4e` (el ítem de más riesgo de los tres, corre sobre datos
    reales al arrancar — no se llegó a leer el código todavía), y la reconciliación offline de
    Hábitos (`ebc0127`, cliente_id + outbox en localStorage).

## Pendiente / bloqueado

- **Ya NO es un bloqueo de recuperar código — eso se resolvió.** Ver arriba: los tres commits
  (`9b13ab1`, `ebc0127`, `daedd4e`) ya están en `origin/master`, verificados con tests+build.
  **Lo que queda es la revisión de riesgo que no se terminó** (nos quedamos sin contexto) + el
  deploy al homelab. Orden sugerido para la próxima sesión:
  1. Terminar de leer el resto de `crud.py` de Finanzas (el ledger/PPC ya revisado se ve bien,
     pero es mucho código sin repasar todavía) y, sobre todo, **la migración de series
     recurrentes de Agenda en `daedd4e`** — es lo más riesgoso de los tres porque corre una sola
     vez sobre datos reales al arrancar la app (convierte series virtuales viejas en filas
     materializadas). Buscar la lógica de migración (probablemente en `crud.py` o
     `database.py`, algo tipo "migrar series virtuales"/"marca por serie" según describe
     `audit_agenda.txt` punto 2) y confirmar que es idempotente (no vuelve a correr ni duplica
     nada en el segundo arranque) antes de deployar.
  2. Revisar la reconciliación offline de Hábitos (`ebc0127` — `cliente_id` + outbox en
     `localStorage`, `useStore.js`) — es lógica nueva no trivial, aunque el hallazgo P0 que
     resuelve ya era conocido de antes.
  3. **Antes de deployar Agenda: hacer un backup del `app.db` real del homelab** (`GET
     /settings/backup` desde la app, o `docker exec` + `sqlite3 .backup`, ver `HOMELAB.md`) —
     por la migración de series de arriba. No es opcional dado que toca datos reales de
     recurrencia existentes.
  4. Deploy completo al homelab: mismo proceso ya usado varias veces en esta sesión —
     `npm run build` local, copiar `project/app`, `project/mybot`, `project/frontend/dist`
     (con `rm -rf` remoto antes del `scp -r` del `dist/`, para no repetir el bug de `dist/dist`
     anidado ya documentado), `docker build --network=host` en el homelab, `docker-compose up
     -d --no-build` (nunca `restart` — no relee `.env`, aunque acá no cambia `.env`, es buen
     hábito igual), y esperar activamente a que `GET /` responda antes de asumir que quedó
     caído (el backfill de embeddings puede tardar varios minutos si cambió algo de indexado).
     Verificar después endpoints clave de cada módulo tocado (`/fin/*`, `/habitos/*`,
     `/agenda/*`) con datos reales, no solo que el healthcheck responda.
  5. Documentar en `Cerebro/estado-actual.md` el cierre de Finanzas/Hábitos/Agenda (mismo
     formato que ya se usó para Bóveda/Jarvis en esta misma sesión) y actualizar
     `Cerebro/PROXIMAMENTE.md` si algún hallazgo de ahí quedó resuelto (probablemente varios,
     dado que Agenda resolvió también la auto-extensión de recurrencia que era un ítem aparte).
- **Alcance de más, patrón repetido a tener en cuenta**: las tres sesiones (Jarvis, Finanzas,
  Hábitos, Agenda) resolvieron más de lo que se les pidió explícitamente (ver detalle en cada
  entrada arriba). Salió bien las veces que se pudo verificar (Jarvis, Bóveda) — para
  Finanzas/Hábitos/Agenda todavía no se verificó nada porque no hay código para revisar. No
  asumir que salió igual de bien solo porque los reportes son detallados.
- **Riesgo real conocido, todavía no aplicado**: la migración de series recurrentes de Agenda
  (hallazgo #2 de `audit_agenda.txt`) corre **una sola vez al arrancar la app**, convirtiendo
  series virtuales viejas en filas materializadas — sobre datos reales de producción. Cuando se
  recupere y despliegue ese código, tratarlo con el mismo cuidado que el bug de `sincronizar_vault`
  de Bóveda: mirar los logs de arranque del homelab de cerca, tener un backup fresco antes de
  reiniciar el backend con esa imagen.
- **Working tree local**: solo un diff mínimo y legítimo en `project/app/main.py` (reordena dos
  líneas de un dict + un import nuevo — parte de lo que describe `audit_finanzas.txt` punto 3,
  pero aislado, sin el resto del cambio). No commitear esto solo — o se descarta o se recupera
  junto con el resto de Finanzas.
- **Dos archivos sueltos en la raíz sin tocar**: `Idea-1-Agenda.png`, `Idea-2-Agenda.png`
  (18/09, sin relación con esta sesión — probablemente referencia visual del usuario para
  Agenda). No se investigaron, no se borraron.

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- **Nunca asumir que "ya está commiteado y pusheado" solo porque una sesión dice que terminó** —
  pasó varias veces esta sesión que el trabajo real vivía solo en un sandbox sin pushear.
  Siempre confirmar con `git status` + `git fetch` + `git branch -r` antes de decir que algo
  está listo para deploy.
- **`docker-compose restart` nunca aplica cambios de `.env`** — usar siempre
  `docker-compose up -d --no-build <servicio>` para eso. Ya documentado en `HOMELAB.md`.
- **Después de un `docker build` + `up -d` en el homelab, esperar activamente a que el backend
  responda antes de asumir que está caído** — un rebuild que dispara backfill de embeddings
  puede tardar varios minutos en volver a aceptar conexiones sin que sea un bug (visto en vivo:
  el fix de "indexar apuntes" de Bóveda cambió la firma de las 169 hojas existentes y forzó un
  reindexado completo al primer arranque).
- **El patrón "resolver más de lo pedido" en sesiones delegadas** viene funcionando bien cuando
  se verifica cada vez (tests + revisión de diff de las partes riesgosas antes de commitear) —
  no relajar esa verificación asumiendo que "esta vez seguro también salió bien".

## Estado del working tree al momento de este handoff (actualizado)

`master` == `origin/master`, `HEAD` en `ebc0127` (Hábitos, el último de los tres commits en
llegar). `git status` muestra solo: `project/app/main.py` modificado (diff chico, 3 líneas,
parte de lo que tocó Finanzas pero que las tres sesiones dejaron afuera de sus commits a
propósito — decidir si se descarta o se incorpora al revisar Finanzas) y dos PNG sin trackear
(`Idea-1-Agenda.png`, `Idea-2-Agenda.png`, del 18/09, sin relación con esta sesión, no
investigados). Verificado por el orquestador después del último commit: 375 tests backend (0
skip) + 184 frontend en verde, build de frontend limpio. **Nada de esto está deployado al
homelab todavía** — el homelab sigue en el estado del deploy de Bóveda (`91202a3`/`3bc88be`).
