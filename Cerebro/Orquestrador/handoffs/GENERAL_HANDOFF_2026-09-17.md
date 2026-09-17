# Handoff General — 2026-09-17

Transición por contexto lleno de la sesión orquestadora anterior. Sesión larga,
con foco casi exclusivo en Jarvis (bugs reales encontrados investigando preguntas
del usuario, no trabajo planeado de antemano).

## Registro de sesiones lanzadas hoy (formato sección IV-C del bootstrap)

- **Diseño + implementación: fix reporte de consolidación** — verificado, commiteado, pusheado (`575179c`)
  → `_section_pairwise()` deja de listar pares "different" uno por uno (causaba reportes de hasta 37 mensajes de Telegram), los reduce a un conteo. `same_fact`/`contradiction` siguen en detalle.
- **Diseño + implementación: throttle de propuestas de auditoría** — verificado, commiteado, pusheado (`c2d959f`), desplegado en homelab
  → Columna `pushed_at` en `jarvis_audit_proposals`, `push_next_audit_batch()`, entrega de a 1 por vez (env `JARVIS_AUDIT_PUSH_BATCH_SIZE`), vencimiento de 24h basado en cuándo se entregó, no en cuándo se creó. Las 7 propuestas EXPIRED viejas se borraron a mano en el homelab para que se regeneren.
- **Auditoría (fork, solo lectura): bugs del mismo patrón en el resto de Jarvis** — completada
  → Encontró 3 hallazgos reales, ver "Bugs encontrados" abajo.
- **Sesión: resolver hallazgo #1 (Agenda con el mismo bug, sin arreglar)** — verificado, commiteado, pusheado (`c8072cc`), desplegado en homelab
  → Mismo patrón de cola aplicado a `jarvis_capture_proposals` (captura pasiva + `agenda.py` + `agenda_patterns.py`). Las 20 EXPIRED reales de Agenda se borraron a mano en el homelab.
- **Sesión: resolver hallazgo #2 (desambiguación rota si batch>1)** — verificado, commiteado, pusheado (mismo commit `c8072cc`), desplegado en homelab
  → Si `JARVIS_AUDIT_PUSH_BATCH_SIZE`/`JARVIS_CAPTURE_PUSH_BATCH_SIZE` se suben a 2+, el bot ahora pide que el usuario aclare con número en vez de aplicar la respuesta a la propuesta equivocada.
- **Hallazgo #3 (ráfaga de capturas pasivas)** — resultó ya resuelto como efecto colateral del fix de Agenda, verificado con script, no hizo falta sesión aparte (no se inventó trabajo innecesario).
- **Fix Bóveda: `/categorias`/`/hojas` devolvían 500** — commiteado, pusheado, desplegado (commits previos a esta tanda de propuestas, mismo día)
  → Contaminación de `.git/` en el escaneo del vault + bug de separador de ruta (`\` vs `/`) en `app/vault/sync.py` y `app/db/crud.py`.
- **Fix `.exe`: Jarvis operaba contra una `jarvis.db`/`Boveda` fantasma dentro del bundle** — commiteado, pusheado, `.exe` recompilado
  → `jarvis/config.py` no resolvía rutas de forma frozen-aware (PyInstaller onedir). Corregido con el mismo criterio que ya usaba `app/paths.py`.
- **Fix `.exe`: búsqueda semántica de Jarvis rota en el bundle** — commiteado, pusheado, `.exe` recompilado
  → `chromadb.api.rust` y `chromadb_rust_bindings` no se empaquetaban (submódulos dinámicos que PyInstaller no sigue). `sgr.spec` corregido con `collect_submodules("chromadb")`.
- **Fix watchdog de red del homelab** — commiteado, pusheado, instalado en homelab por el usuario
  → Primer intento (sacar el `networkctl reconfigure` incondicional) NO era la causa real del "DHCPv6 lease lost" repetido — verificado empíricamente que seguía pasando igual. Causa real: `accept-ra` sin desactivar en netplan, Windows ICS manda RAs pidiendo DHCPv6 sin tener servidor real. Fix real: `accept-ra: no` + `dhcp6: no` en netplan.

## Pendiente / bloqueado

- **Borrar 6 entradas de prueba + 2 proyectos huérfanos en la `jarvis.db` LOCAL** (no la del homelab) — bloqueado por el clasificador de permisos de Bash del propio Claude Code (rechaza el `DELETE` como "irreversible local destruction" pese a confirmación explícita del usuario en el chat). El usuario tendría que agregar una regla de permiso en la configuración de Claude Code para destrabarlo, o pedirle a una sesión que lo intente de nuevo por si la regla ya se agregó. Ya hay backup hecho (`project/database/backups/pre-limpieza-test-projects-<timestamp>/`).
- **`Consolidacion.txt`** en la raíz del repo — el usuario dijo que lo iba a borrar él mismo, no confirmado si ya lo hizo. Es un archivo de scratch (mensajes de Telegram pegados a mano), no parte del repo real; si sigue existiendo, no hace falta tocarlo salvo que el usuario lo pida.
- **`project/database/app.db.bak`** viene apareciendo modificado en `git status` en varias sesiones sin ser parte de ningún commit — es un artefacto binario local, no se commiteó nunca a propósito. Si un futuro orquestador lo ve modificado de nuevo, no es señal de nada roto, es ruido de pruebas locales.

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- El patrón de trabajo establecido hoy para cambios de backend de Jarvis: investigar y verificar personalmente contra datos reales (SQLite directo, journalctl, curl) antes de proponer nada; para cambios de cierto tamaño, lanzar una sesión de **diseño** (agent tool, general-purpose o fork) que entrega un prompt de implementación autocontenido, y recién ahí una sesión de **implementación** separada; el orquestador (esta conversación) revisa el diff real (`git diff`) y corre una verificación propia antes de confirmar que un hallazgo del worker es cierto, nunca confía en el reporte a ciegas. Commit y push los maneja siempre el orquestador, nunca el worker.
- Deploy a homelab: backup de `jarvis.db`/`app.db` vía `docker cp` antes de tocar nada → `scp` de los archivos cambiados (nunca el tar-pipe para `project/app`/`jarvis/`, falla en silencio) → `docker build --network=host` desde la raíz del repo → `docker-compose up -d --no-build` → verificar `RestartCount=0` en los 3 contenedores + logs sin errores nuevos + `curl /jarvis/health` y `/categorias`.
- `SGR.exe` se recompila con `project/venv/Scripts/python.exe -m PyInstaller -y --log-level WARN sgr.spec` (nunca Python global) cada vez que cambia código bajo `project/app/` o `jarvis/` que el bundle empaqueta.

## Bugs encontrados (aunque ya resueltos, quedan de referencia)

Ver `Cerebro/decisiones-implementacion.md`, entradas del 2026-09-16 y 2026-09-17 (hay varias el mismo día, todas con fecha en el título) para el detalle técnico completo de cada uno de los items de arriba.

## Estado del working tree al momento de este handoff

`master`, todo lo de arriba ya commiteado y pusheado a `origin/master`. Sin cambios sin commitear relevantes (salvo el ruido de `app.db.bak` mencionado arriba).
