# Handoff General — 2026-09-18

Continuación de la transición del 2026-09-17 (mismo día de trabajo real, la sesión se extendió
hasta pasada la medianoche). Foco: limpieza de datos de prueba en Jarvis, acceso remoto vía
Tailscale, el homelab pasó a servir la UI completa (no solo el bot), y una investigación real de
por qué un reporte diario de auditoría llegó como 37 mensajes de Telegram.

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Limpieza manual (sin worker, hecha directo por el orquestador): borrado de data sintética de
  la `jarvis.db` LOCAL** — verificado, con backup previo.
  → 22 `memory_entries` de prueba (agosto 2026) + 2 `memory_projects` huérfanos ("Jarvis",
  "Homelab") + 3 entidades + 19 tags que quedaron con 0 referencias. El handoff anterior decía
  "6 entradas" — era un conteo desactualizado, el real (verificado contra la DB) era 22. Commit
  `0704e4b`.
- **Auditoría (fork, solo lectura): conexión frontend↔backend↔DB de `/jarvis`** — completada.
  → Encontró que las ~15 funciones `fetchJarvis*` del store tragaban errores en silencio (mismo
  patrón que causaba el síntoma "todo en cero" que el usuario había reportado antes), más una
  columna `pushed_at` faltante en la `jarvis.db` local que rompía 2 endpoints con 500.
- **Implementación (fork): fix de los hallazgos de la auditoría** — verificado, commiteado
  (`ab0a902` código, `d2db8f3` doc).
  → Logging agregado a los 15 catch silenciosos (mismo patrón `if (DEBUG) console.error(...)`
  que ya usaba el resto del archivo); 18 filas huérfanas de `inbox_queue` limpiadas (con backup);
  migración de `pushed_at` disparada arrancando el backend real una vez.
- **Instalación de Tailscale en el gabinete** (hecho directo por el orquestador vía SSH, con
  autorización explícita) — verificado.
  → `gabinete-sgr` → `100.117.86.117` en el tailnet del usuario (junto a su PC y laptop, que ya
  lo tenían). Objetivo: usar SGR completo (no solo el bot) desde afuera de casa sin exponer nada
  a Internet -- importante porque SGR no tiene login propio.
- **Deploy del frontend al homelab** (hecho directo por el orquestador) — verificado, commiteado
  y pusheado (`57c1d15`).
  → El homelab nunca serví­a la UI (`Dockerfile` solo copiaba `app/`+`mybot/`, y
  `project/frontend/dist/` estaba en `.dockerignore`). Se agregó `COPY project/frontend/dist` al
  `Dockerfile`, se sacó `dist/` del `.dockerignore` (local y homelab -- éste último vive en `~`,
  no en `~/project/`, error real que también se corrigió en la documentación). Build manual,
  **a propósito no automatizado** (pedido explícito del usuario) -- repetir build+scp+rebuild
  cada vez que cambie el frontend, ver `HOMELAB.md`.
- **Investigación + fix: "NaNd"/timestamps rotos en el Inbox de Jarvis** — verificado, commiteado
  y pusheado (`eb754d4`).
  → `formatAge()` (frontend) le agregaba una `Z` a timestamps que ya tenían offset explícito
  (`+00:00`), produciendo fechas inválidas. Fix: detectar cualquier sufijo de timezone antes de
  decidir si hace falta agregar la `Z`. Redeployado al homelab.
- **Investigación + fix real de infraestructura: Ethernet 2 bloqueaba Ollama para el homelab**
  — verificado en vivo por el usuario, commiteado (`a2c4fdd`, junto con la ampliación del
  watchdog).
  → No era falta de capacidad del modelo -- era que `Ethernet 2` (adaptador ICS hacia el
  gabinete) había caído a perfil "Público" en Windows, activando una regla de Firewall que
  Windows crea sola (`ollama.exe`, Block en Público) que **gana** sobre las reglas explícitas de
  Allow para el puerto 11434. Usuario corrió `Ensure-Ics.ps1` (ya hacía el fix, `Public ->
  Private`) y confirmó `curl` de 6s de timeout a 200 en 1.6ms. La nota real que había quedado
  atascada en `ERROR` (parcial de Física 3, 26/09) se reprocesó sola y quedó `DONE`/`SEMANTIC`.
- **Ampliación del watchdog `SGR-Ensure-ICS`** — 2 intentos, el primero falló, el segundo
  verificado por el usuario.
  → Antes solo corría `Ensure-Ics.ps1` una vez al arrancar Windows; ahora también cada 5 min
  indefinidamente (mismo criterio que el watchdog systemd de 60s del lado Ubuntu). Primer intento
  del usuario falló con `Register-ScheduledTask` (`[TimeSpan]::MaxValue` fuera de rango del
  schema de Task Scheduler) -- **y el script igual imprimió "instalada" con la tarea sin crearse
  de verdad** (`$ErrorActionPreference="Stop"` no alcanza para cmdlets CDXML). Se corrigió la
  duración (truco documentado: `Repetition.Duration = ""` para "indefinido") y se agregó
  `-ErrorAction Stop` explícito. Segunda corrida del usuario: sin errores. Commit final del fix
  del script en `e8f1e14` (bundleado con el fix de abajo).
- **Investigación profunda: reporte de consolidación de 37 mensajes + "sí" confuso** —
  completada, sin fork (investigación hecha directo por el orquestador).
  → Ver detalle completo en `Cerebro/estado-actual.md`, primera entrada. Resumen: el fix del
  16/09 (`575179c`) para esto ya existía en git pero **nunca se copió al homelab** -- confirmado
  con hash-diff de ~100 archivos que solo 1 (`jarvis/worker/consolidation.py`, 2 días
  desactualizado) tenía una diferencia real, el resto era ruido CRLF o estaba al día. El "sí" no
  era un bug de datos (la propuesta de la entidad Robert Kiyosaki se aceptó bien) -- el mensaje de
  confirmación del bot era idéntico al de una captura nueva.
- **Implementación (fork): deploy completo de `jarvis/` + aclarar mensaje de confirmación** —
  verificado, commiteado y pusheado (`e8f1e14`).
  → Re-sync completo de `jarvis/` (71 archivos, `tar|ssh`, no un parche puntual) + rebuild +
  restart de los 3 contenedores -- hash-diff final: 0 diferencias. `jarvis_handlers.py` líneas
  327/419: `"✅ Guardado..."` → `"✅ Propuesta confirmada..."` en las 2 ramas que confirman una
  propuesta (no en las de captura genuina). Desplegado al homelab (bind-mount, restart sin
  rebuild).

## Pendiente / bloqueado

- **`project/frontend/dist/` está trackeado en git desde el primer commit del repo**
  (`.gitignore` solo excluye `project/dist/`, el del `.exe`, no `project/frontend/dist/`). Cada
  build deja un diff de ruido (hashes de bundle). Encontrado de paso, **no resuelto** -- decisión
  del usuario si se agrega a `.gitignore` ahora que el flujo de deploy al homelab implica
  rebuildear seguido.
- **Diseño sin implementar: "pizarra" de referencia rápida (inspirado en Google Keep)** —
  conversación exploratoria, sin decisión ni código. El usuario usa 3 tipos de listas en Keep:
  (1) checklist diario "HOY" y (2) checklists simples de pendientes -- ambos ya cubiertos por
  Agenda (tabs Hoy/Tareas), recomendado probarlos tal cual antes de construir algo nuevo; (3)
  listas de referencia rápida (links, finales con fecha, "quiero rendir en diciembre") que **no**
  calzan en Bóveda (es "dejo y me olvido", esto es lo opuesto) ni bien en Tareas (no siempre es
  checklist). Sin definir si se estira Tareas o se construye un concepto nuevo tipo board. Sin
  arrancar.
- **Hallazgo nuevo, no investigado**: log del backend tras el último restart mostró
  `[semantic] backfill omitido: UNIQUE constraint failed: hojas.ruta` -- no aparecía en logs
  anteriores de esta sesión. No se tocó, queda para quien lo note en uso real o para investigación
  aparte.
- **Watchdog de Tailscale (`tailscaled`) no instalado** -- si el servicio muere o tras un reinicio
  del gabinete, nadie lo reinicia solo. Documentado como pendiente en `HOMELAB.md`, sección
  "Acceso remoto (Tailscale)".
- **`Consolidacion.txt`** en la raíz del repo -- ya no es solo scratch: se usó como evidencia real
  para diagnosticar el bug de los 37 mensajes esta sesión. El usuario puede borrarlo cuando quiera
  (su contenido relevante ya quedó resumido en `Cerebro/decisiones-implementacion.md` y
  `estado-actual.md`), no hace falta conservarlo.
- **`project/database/app.db.bak`** sigue apareciendo modificado en `git status` -- mismo ruido
  conocido de sesiones anteriores, no es señal de nada roto.

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- **Deploy de `jarvis/` al homelab: siempre sync completo por `tar`, nunca `scp` de archivos
  sueltos.** Fue exactamente un `scp` selectivo de una sesión anterior el que dejó
  `jarvis/worker/consolidation.py` 2 días desactualizado sin que nadie lo notara, hasta que
  produjo un reporte real de 37 mensajes de Telegram. El comando completo está en `HOMELAB.md`,
  sección "Actualizar código en el servidor".
- **Antes de confiar en "esto ya está arreglado" por lo que dice un commit o la documentación**,
  verificar el código que **realmente corre** en el homelab (hash-diff contra el repo local, o
  `docker exec ... inspect.getsource(...)` para funciones puntuales) -- la documentación puede
  estar bien y el deploy real puede estar atrasado igual, como pasó esta sesión.
  Fue exactamente al aplicar este mismo criterio (y no confiar en la fecha "5/6 entradas" del
  handoff anterior sin releer la DB real) que se destapó el conteo real de 22 entradas de
  prueba, no 6.
- **El watchdog de `Ensure-Ics.ps1`/`SGR-Ensure-ICS` ahora corre cada 5 min, no solo al boot** --
  el disparador real fue Ollama bloqueado por Firewall en pleno uso, no solo al arrancar Windows.
  Si en el futuro aparece otro síntoma parecido (timeouts intermitentes hacia el gabinete o hacia
  Ollama), revisar primero el perfil de red de `Ethernet 2` antes de asumir un problema de
  capacidad o de código.

## Estado del working tree al momento de este handoff

`master`, todo lo de arriba commiteado y pusheado a `origin/master`
(`0704e4b`..`e8f1e14`). Sin cambios sin commitear relevantes, salvo el ruido ya conocido de
`app.db.bak` y el propio `Consolidacion.txt` (ninguno de los dos forma parte del repo real).
