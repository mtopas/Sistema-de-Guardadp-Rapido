# Handoff General — 2026-09-21

Continuación directa de `GENERAL_HANDOFF_2026-09-19.md`. Sesión larga: deploy completo al
homelab de trabajo pendiente de sesiones anteriores, auditoría de 3 commits frontend sin
documentar, dos auditorías externas (otro modelo de IA) evaluadas y en su mayoría diferidas,
cambios reales en Jarvis (consolidación semanal, triage de Inbox con botones), y 7 mejoras/fixes
de UI y seguridad en Agenda/Finanzas/Hábitos/Telegram.

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Deploy completo al homelab de todo lo pendiente de la sesión del 19/09** (Horario Facultad,
  canvas de listas, rebuild de `seed_demo.py`) — verificado y desplegado. El primer intento de
  esta sesión había quedado a mitad de camino (sync de archivos hecho, pero el
  `docker build && docker-compose up` final nunca se confirmó corrido) — se detectó y se
  completó de punta a punta, con verificación real (`docker inspect` RestartCount=0, `curl`
  externo confirmando el hash del build servido).
- **Confirmación visual del usuario, Horario Facultad + canvas de listas** — el usuario abrió
  el frontend local (`npm run dev`) él mismo y confirmó "ambos cambios surtieron efecto". Cierra
  el pendiente que venía de la sesión del 19/09.
- **Auditoría + fix: 3 commits frontend sin documentar (Bóveda/Agenda/Jarvis)** — aparecieron en
  `master` sin pasar por el orquestador (autoría "Mateo-PC", otra sesión no registrada acá).
  Auditoría por fork (código + build), luego recorrido real en Chrome que confirmó 2 hallazgos
  reales en el rediseño de Bóveda: resaltado de nota seleccionada ausente en
  `BovedaWorkspace.jsx`, y menú contextual (clic derecho) ausente en la vista central — ambos
  arreglados y verificados en vivo. De paso se encontró y arregló un bug real preexistente:
  `POST /hojas` daba 500 genérico si la categoría no tenía ruta sincronizada al vault (ahora
  400 con mensaje claro). Verificando esto se destapó que el entorno local tenía **dos procesos
  uvicorn duplicados en :8765** (uno sin `--reload`, nunca había recargado código de la sesión)
  — resuelto, documentado como algo a chequear al inicio de la próxima sesión local.
- **Cambio: consolidación de memoria de Jarvis, diaria → semanal** — pedido explícito del
  usuario. `JARVIS_CONSOLIDATION_INTERVAL_DAYS` nuevo (default 7), mismo patrón que
  `agenda_patterns`/`inbox_triage`. Desplegado.
- **Triage automático del Inbox — primera propuesta real + botones de Telegram** — el usuario
  preguntó por esta feature (implementada el 15/09, nunca había producido nada real). Se
  investigó: nunca había alcanzado el umbral de antigüedad de 21 días con datos reales. A pedido
  explícito, se bajó el umbral (`JARVIS_INBOX_TRIAGE_MIN_AGE_DAYS`, terminó en **6**, no 7 —
  el código trunca a entero) y se forzó una corrida real: 4 propuestas generadas, 1 ya empujada
  a Telegram. El usuario reportó que el mensaje de texto plano no decía qué nota era ni ofrecía
  corregir el destino — se implementó un rediseño completo de la UX (botones Sí/No/Ver
  contenido, submenú de categoría manual, mensaje de cierre "Terminamos con «título»", cola ya
  resuelta por el throttle existente sin código nuevo). Desplegado. **Pendiente real: nunca se
  probó el flujo de clics en un chat de Telegram real** — solo verificado con sandbox aislado.
- **Auditoría técnica externa (otro modelo de IA, "SGR-Auditoria-Siguiente-Nivel")** — el
  usuario la pidió aparte, la compartió para que la resuma y evalúe. Se decidió NO seguir el
  roadmap completo de 90 días (está pensado para un producto con equipo, no un proyecto de un
  solo desarrollador) — se extrajeron 4 ítems baratos y de valor real, implementados y
  desplegados: allowlist de Telegram global (antes solo cubría Finanzas), timezone explícita en
  jobs del bot (corrían en UTC naive), `SGR_SYNC_TOKEN` obligatorio para `/sync/*` (antes fallaba
  abierto), avisos visibles en vez de "guardado" falso en 8 mutaciones de Finanzas/Agenda/
  Hábitos. El resto del roadmap (SSRF, XSS, outbox real, RFC 5545, dinero en centavos, CI/tests,
  etc.) quedó registrado en `Cerebro/PROXIMAMENTE.md`. El archivo original se borró del repo a
  pedido del usuario una vez volcado el contenido.
- **Catálogo de features / visión de producto JARVIS (otro modelo de IA)** — documento de
  dirección a 1-2 años (Mission Control, memoria con procedencia, motor de acciones con
  aprobación/verificación, entidad "Misión", Home Assistant, modo sombra). Resumido para el
  usuario, anotado en `Cerebro/PROXIMAMENTE.md` como visión de largo plazo, sin implementar
  nada. **El archivo original (`SGR-JARVIS-Catalogo-de-Features-2026-09-21.md`) sigue en la raíz
  del repo, sin borrar** — a diferencia del anterior, el usuario no pidió borrarlo todavía.
- **3 mejoras de Agenda pedidas explícitamente** (lanzadas como un solo fork por tocar archivos
  en común): HOY con panel izquierdo en 2 bloques (con fecha / sin fecha); TAREAS→Lista ahora
  permite editar una tarea ya creada (antes solo desde Canvas); recurrencia de tareas (diario/
  días de semana/día del mes), materializando ocurrencias reales con ventana acotada (60 días
  diario, 12 semanas semanal, 12 ocurrencias mensual — sin job que la extienda, documentado como
  limitación conocida). Verificado con sandbox propio (3 frecuencias, completar/borrar una
  ocurrencia no afecta a las hermanas). Desplegado.
- **Canvas de Tareas: panel "Sin fecha" colapsable + color por lista** — pedido explícito. Se
  sacó la tarjeta "Sin fecha" de la grilla, ahora es una barra lateral derecha colapsable.
  Cada tarea en Canvas muestra el color de su lista. Verificado con Chrome real, desplegado.

## Pendiente / bloqueado

- **Botones de triage_move de Telegram — nunca probados con clics reales**, solo con sandbox
  aislado (payload_override moviendo archivos, reject sin mover nada, otros 7 tipos de
  propuesta sin cambios). Es lo primero a confirmar con el usuario si no lo menciona solo.
- **`SGR-JARVIS-Catalogo-de-Features-2026-09-21.md`** sigue en la raíz del repo — preguntarle al
  usuario si lo borra como el anterior, una vez que ya está resumido/anotado en
  `Cerebro/PROXIMAMENTE.md`.
- **`project.tar.gz`** en la raíz del repo — artefacto temporal de un deploy manual con archivo
  intermedio (para evitar el bug de pipe binario corrupto en PowerShell), nunca se borró. Sin
  riesgo real (no está trackeado), pero es ruido.
- **`[semantic] UNIQUE constraint failed: hojas.ruta` para la ficha de Robert Kiyosaki** sigue
  apareciendo en cada arranque del backend — se observó de nuevo esta sesión (ver
  `Cerebro/estado-actual.md`, entrada del 21/09), la causa real (¿fila huérfana vieja vs.
  colisión nueva?) sigue sin investigarse.
- **Ventana de recurrencia de tareas no se auto-extiende** — anotado en `PROXIMAMENTE.md`,
  sin diseñar si vale la pena un job que la extienda o si alcanza con recrear a mano.
- **`project/database/app.db.bak`** sigue modificándose en cada sesión y quedando afuera de cada
  commit (el clasificador de permisos lo bloquea como "Sensitive-Source Provenance" cada vez que
  se intenta). No es un problema nuevo — mismo patrón desde hace varias sesiones — pero sigue
  sin resolverse de raíz (¿gitignorarlo definitivamente? es decisión del usuario).

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- **Dos forks lanzados en paralelo sin worktree aislado terminaron tocando 3 archivos en común**
  (`main.py`, `HoyTab.jsx`, `TareaModal.jsx`) — funcionó bien en este caso puntual (verificado
  diff por diff que el resultado combina ambos trabajos sin corrupción), pero fue más suerte que
  garantía. **La próxima vez que haya trabajo paralelo genuino sobre los mismos módulos, usar
  `isolation: "worktree"`** como ya se hizo en sesiones anteriores para casos similares.
- **Un fork puede terminar sin haber hecho nada real** (visto esta sesión: un primer intento
  terminó en 5 segundos, 0 tool_uses, sin tocar ningún archivo, pese a reportar como si hubiera
  terminado normalmente) — siempre verificar `git status`/`git diff` contra lo reportado antes
  de confiar, y reintentar sin asumir que el reporte vacío es un trabajo genuinamente vacío.
- **Con dos navegadores conectados a Claude in Chrome, uno puede estar roto** (no cargaba ni
  `example.com`) mientras el otro funciona bien — verificar con `list_connected_browsers` y
  cambiar (`select_browser`) antes de asumir que la app en sí está rota.
- **Backend local con `--reload` puede quedar duplicado entre sesiones** (un proceso viejo sin
  `--reload`, corriendo con el Python global en vez del venv, sirviendo requests reales sin
  reflejar ningún cambio de código) — antes de asumir "esto no refleja mi código actual", correr
  `Get-CimInstance Win32_Process -Filter "name='python.exe'"` y confirmar que no hay duplicados
  en el mismo puerto.

## Estado del working tree al momento de este handoff

`master`, todo lo de arriba commiteado y pusheado a `origin/master`. Sin cambios sin commitear
relevantes, salvo el ruido ya conocido de `app.db.bak`, `Consolidacion.txt`,
`SGR-JARVIS-Catalogo-de-Features-2026-09-21.md` y `project.tar.gz` (ninguno forma parte del
repo real — los primeros dos preexistentes, los últimos dos nuevos de esta sesión).
