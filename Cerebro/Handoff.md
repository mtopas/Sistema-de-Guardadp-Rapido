# Handoffs de Coordinación — SGR / Jarvis

Este archivo es la **cadena de custodia persistente** entre sesiones del Orquestador de SGR.
A diferencia del chat (cuyo contexto se pierde al cerrar la ventana), este archivo mantiene la memoria viva del proyecto en disco.

## Reglas de uso para el Orquestador:
1. **Orden cronológico inverso (lo nuevo ARRIBA):** Cada nuevo handoff se inserta **inmediatamente debajo de este encabezado** (arriba de los anteriores). Los handoffs viejos nunca se borran; se van desplazando hacia abajo.
2. **Lectura al arrancar:** Toda nueva sesión orquestadora arranca leyendo los primeros 30-50 renglones de este archivo para absorber el estado actual y los pendientes activos.
3. **Arrastre de pendientes (Cadena de custodia):** Cada vez que un trabajador entrega su resumen, el orquestador toma la lista de pendientes del handoff anterior:
   - Marca o retira los que se acaban de resolver.
   - Suma los pendientes o sugerencias nuevas que trajo el trabajador.
   - Pega la lista consolidada de **Pendientes activos** en el nuevo handoff en el tope.
4. **Respaldo en disco:** Al recibir el resumen de la sesión de trabajo, el orquestador actualiza este archivo en el mismo turno.

---

## [2026-09-30, sesión 2 — incidente app.db] — Restauración de `app.db` del homelab tras deploy destructivo
- **Resultado:** Hecho (validado por el orquestador sobre el resumen del trabajador y el diff en disco).
- **Qué se hizo:** copias de seguridad en homelab y en Windows (`backup-incidente-20260930/`, gitignored): backup fuente sha256 `74b532dd…aceaf45`, réplica Windows `e7fbce24…28ba8`, vivo pisado `48bef241…ed3ae`. Comparación tabla por tabla, contenedores parados, `app.db` restaurado desde `app.db.bak-20260930-133414`, levantados. `integrity_check` ok, conteos = backup en todas las tablas (agenda_tareas 9, agenda_eventos 58, feedback 14, hojas 180, fin_movimientos 88…), 3 contenedores UP, `/meta` 200, `/jarvis/health` worker vivo. `jarvis.db` y chroma intactos. Reporte de rescate de 35 hojas divergentes + 2 categorías en `project/database/backup-incidente-20260930/reporte-rescate-hojas.md` (no versionado).
- **Decisión del orquestador:** restauración completa (homelab canónico) sin merge de hojas; rescate manual decidido por el usuario.
- **Corrección del orquestador al trabajo:** el fix de `HOMELAB.md` del trabajador usaba `--exclude='vault'` sin anclar, que también excluía `project/app/vault/` (código que importa el backend). Corregido a `project/database`, `project/uploads`, `project/vault`. Afirmación del trabajador también corregida: abrir el `.exe` NO "solo toca la DB local" (por diseño hace pull al abrir y push al cerrar contra el homelab).
- **Commits:** el trabajador no commiteó (se apoyó en una memoria compartida que dice "solo recomendar"); quedan sin commitear `HOMELAB.md`, `Cerebro/decisiones-implementacion.md` y `Cerebro/Handoff.md`. Inconsistencia de proceso: `PROMPT-MAESTRO-TRABAJADOR` (Regla 1.5) pide commits directos pero la memoria de git del usuario dice lo contrario.

### Pendientes activos (Arrastre):
- [ ] [COMMITS / USUARIO] Commitear `HOMELAB.md` (exclusiones de copia), `Cerebro/decisiones-implementacion.md` (entrada del incidente) y `Cerebro/Handoff.md`.
- [ ] [RESCATE HOJAS / USUARIO] Revisar `reporte-rescate-hojas.md` y decidir qué hojas solo-Windows (233, 238, 284, 287, 288, 289) y conflictivas (274-282, versión Windows) rescatar como filas nuevas en el homelab; ticket posterior.
- [ ] [USO DEL .EXE / USUARIO] Antes de abrir el `.exe`: confirmar que el homelab responde (`curl :8765/meta`). Si el pull al abrir falla, el push al cerrar podría subir la DB de Windows vieja encima de la restaurada (el homelab guarda un backup automático antes de cada push, pero conviene no depender de eso). Verificar en `project/SYNC-WINDOWS.md` qué pasa ante un pull fallido.
- [ ] [HUECO DE SYNC] Las réplicas ya habían divergido en `hojas` antes del deploy (IDs asignados de forma independiente): el sync de `SYNC-WINDOWS.md` no reconcilia hojas. Ticket de diseño a definir.
- [ ] [VERIF PROD / USUARIO] Abrir `/finanzas` y `/agenda` en `http://192.168.137.10:8765` (el trabajador verificó la DB, no la UI).
- [ ] [RIESGO CAPTURA PASIVA] Ollama ya fue reiniciado por el usuario: verificar que el bot lo ve (warmup en logs) y hacer la prueba end-to-end (mensaje de texto libre por Telegram, 20 min, "¿Guardo esto en tu memoria?"). Conteo de `conversation_messages` con el comando ssh ya dado.
- [ ] [TICKET CANDIDATO] `evaluate_for_capture()` traga el error si Ollama no responde: no hay señal visible de captura pasiva muerta.
- [ ] [SEGURIDAD] `BOT_ALLOWED_CHAT_IDS` sin configurar en el homelab (repo público, bot acepta cualquier chat). Setear y aplicar con `docker-compose up -d --no-build bot worker` (NO `restart`).
- [ ] [PUSH] Confirmar que `5dd3dd0` y `ef8993c` llegaron a `origin`.
- [ ] [TEST GAP] Los tests de `register_telegram_message()` no verifican que `bot.py::handle_message()` la invoque.
- [ ] [PROCESO] Alinear `PROMPT-MAESTRO-TRABAJADOR` (Regla 1.5, commits directos) con la memoria "no hacer commits" o decidir explícitamente cuál gana.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/` y `Front-GPT/`; decisión de producto del usuario.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes antes del ticket.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md`.
- [x] ~~[URGENTE pérdida de datos app.db]~~ — restaurado (ver arriba).
- **Próximo objetivo inmediato recomendado:** commitear el lote de docs y cerrar la verificación de producción (UI + prueba de captura pasiva).

---

## [2026-09-30, sesión 2 — deploy] — Deploy de master al homelab (192.168.137.10:8765)
- **Resultado:** PARCIAL — el código quedó desplegado, pero el deploy **pisó `app.db` de producción con la réplica de Windows** (ver [RIESGO DATOS] abajo, confirmado por el orquestador). Validación inicial "Hecho" corregida.
- **Qué se hizo:** backup de DBs (`~/project/database/app.db.bak-20260930-133414`, `jarvis.db.bak-20260930-133414`), copia de `project/` y `jarvis/` por scp/tar, build local del frontend, `docker build` de `sgr-app:latest` (`7af36909d7a4`, `--network=host`), `docker-compose up -d --no-build` (recreó los 3 contenedores). Ahora corren en producción: fix `extra_str`, fix `register_telegram_message`, auditorías Finanzas/Agenda/Hábitos, fix `serie_id`, frontend nuevo.
- **Verificado:** 3 contenedores UP; `/meta` 200 (hojas=180, fin_movimientos=88); `/jarvis/health` 200, `worker_alive: true`; `/` sirve el frontend; bot en polling sin Conflict/InvalidToken (el `InvalidToken` inicial fue del intento previo al restart).
- **Decisión del trabajador:** los `Permission denied` de scp en `jarvis.db`/`chroma.sqlite3` se ignoraron (en uso por Docker).
- **Observaciones del orquestador sobre el resumen:** (1) "Ollama no disponible" se dio por esperado, pero `evaluate_for_capture()` depende del modelo local y falla en silencio (devuelve `None`): con Ollama caído la captura pasiva no propone nada aunque el registro de mensajes funcione. (2) Esos mismos `Permission denied` muestran que el copiado intentó tocar `database/`: hay que confirmar que `app.db` no se pisó con la réplica de Windows.

### Pendientes activos (Arrastre):
- [ ] [VERIF PROD / USUARIO] Abrir `/finanzas` y `/agenda` en `http://192.168.137.10:8765`.
- [ ] [URGENTE — PÉRDIDA DE DATOS EN PRODUCCIÓN, CONFIRMADA 2026-09-30] `~/project/database/app.db` del homelab quedó idéntica (mismo tamaño 585728 B, mismos conteos) a la réplica local de Windows y difiere del backup `app.db.bak-20260930-133414`. Hojas y Finanzas coinciden (180 / 88), pero se perdieron: `agenda_tareas` 9→0, `agenda_eventos` 58→21, `agenda_horario_facultad` 9→4, `agenda_horario_facultad_excepciones` 3→0, `agenda_series` 1→0, `feedback` 14→0, `app_settings` 1→0. Los datos reales existen solo en el backup de esa carpeta del homelab. ESTADO: el trabajador reportó `bloqueado` al comparar (35 hojas y 2 categorías divergen entre homelab y Windows de forma preexistente, no por escrituras post-deploy; ids solo-Windows 233/238/284/287/288/289, solo-homelab 270-273/276/277, conflictos 274-282). Decisión del orquestador: restauración completa del backup (homelab canónico) + reporte de rescate de hojas de Windows para que el usuario decida, sin migrar nada automáticamente; hueco de sync homelab↔Windows anotado como hallazgo. Acciones: (1) copiar el backup a otro lugar ya; (2) restaurar app.db desde el backup con los 3 contenedores parados, verificando antes qué se escribió en el live desde el deploy; (3) corregir el procedimiento de copia de `HOMELAB.md` (~L152) para excluir `database/` — la vez anterior `jarvis.db` y `chroma.sqlite3` se salvaron solo por estar en uso; (4) no abrir/cerrar el `.exe` de Windows hasta restaurar (su sync de push podría propagar el DB equivocado).
- [ ] [RIESGO CAPTURA PASIVA] Antes de la prueba: verificar que Ollama corre en el PC host y es alcanzable desde el homelab (hoy el bot lo reporta "no disponible"). Después, prueba end-to-end: mensaje de texto libre por Telegram con dato factual, esperar 20 min (`JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES` no está en el `.env` del homelab, usa el default) y confirmar "¿Guardo esto en tu memoria?". Conteo en `conversation_messages` con el comando `ssh ... docker-compose exec backend python -c ...` del resumen del trabajador.
- [ ] [TICKET CANDIDATO] `evaluate_for_capture()` traga el error si Ollama no responde: no queda ninguna señal visible de que la captura pasiva está muerta. Evaluar dejar un registro o aviso cuando el evaluador falla repetidamente.
- [ ] [SEGURIDAD] `BOT_ALLOWED_CHAT_IDS` sin configurar en el homelab: el bot acepta cualquier chat y el repo es público. Setear con el chat id del usuario y aplicar con `docker-compose up -d --no-build bot worker` (NO `restart`, no toma cambios de `.env`).
- [ ] [COMMIT] `Cerebro/Handoff.md` con cambios sin commitear (este handoff y el anterior); commit a cargo del usuario.
- [ ] [PUSH] Confirmar que `5dd3dd0` y `ef8993c` llegaron a `origin`.
- [ ] [TEST GAP] Los tests de `register_telegram_message()` no verifican que `bot.py::handle_message()` la invoque (cableado sin cobertura).
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/` (Opus 5.5) y `Front-GPT/` (GPT-Astra); decisión de producto del usuario.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes antes de armar el ticket (a simple vista esos imports se usan).
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md` para tachar ítems resueltos por las auditorías.
- [x] ~~[DEPLOY / HOMELAB]~~ — hecho (ver arriba).
- **Próximo objetivo inmediato recomendado:** cerrar la verificación de producción (conteo de `app.db`, Ollama, prueba de captura pasiva), porque el fix de Jarvis no está confirmado hasta que llegue una propuesta real.

---

## [2026-09-30, sesión 2] — Fix gap `extra_str` del bot + causa raíz de captura pasiva de Jarvis
- **Resultado:** Hecho (validado por el orquestador: commits limpios, árbol limpio, tests de regresión citados).
- **Estado del repo:** `master`, 2 commits locales **sin pushear** (`5dd3dd0`, `ef8993c`). Antes en esta sesión: 6 commits de infraestructura/Front-* ya pusheados por el usuario (`4091c88`). 387 tests backend en verde (baseline previo 376).
- **Qué se hizo:**
  - (A) `project/mybot/finanzas_handlers.py`: `extra_str` (fecha + cuotas) ahora se interpola en ambos `reply_text` de `handle_fin_quick_capture`. Tests: `test_bot_finanzas.py::TestExtraStrEnReply` (3).
  - (B) **Causa raíz de "Jarvis no aprende de mis conversaciones":** el bot de Telegram nunca registraba mensajes en `conversation_messages` (`add_message()` solo lo llamaba `jarvis/query/service.py`, flujo `/jq` / chat web). Sin filas, `find_idle_conversations()` devolvía vacío y `evaluate_for_capture()` jamás corría. Fix: `register_telegram_message()` en `jarvis_handlers.py`, llamada desde `handle_message()` en `bot.py` solo para texto libre que llega al LLM router/Bóveda (excluye pasos estructurados de Finanzas/Agenda y respuestas a propuestas). Tests: `test_passive_capture_telegram.py` (3).
- **Decisión:** el cambio del evaluador de modelo local a GPT que pidió el usuario quedó **descartado**: la causa era falta de datos de entrada, no calidad del evaluador; además el modelo externo exigiría Privacy Gateway y sube costos. Reabrir solo si en producción el evaluador local resulta demasiado conservador.

### Pendientes activos (Arrastre):
- [ ] [PUSH] Pushear `5dd3dd0` y `ef8993c` (los ejecuta el usuario).
- [ ] [DEPLOY / HOMELAB] **Ahora más urgente**: el fix (B) no corre en producción hasta rebuild + reinicio de bot y worker en `192.168.137.10:8765`. Incluye además Jarvis, auditorías Finanzas/Agenda/Hábitos y fix de `serie_id` (ver `HOMELAB.md`).
- [ ] [VERIFICACIÓN PROD] Tras el deploy: mandar por Telegram un mensaje con dato factual, esperar `JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES` y confirmar que llega "¿Guardo esto en tu memoria?". Monitorear volumen de propuestas (si es ruidoso: subir umbral o restringir qué texto se registra).
- [ ] [TEST GAP] Los tests de (B) cubren `register_telegram_message()` pero no verifican que `bot.py::handle_message()` realmente la invoque en el bloque `step is None` (posible regresión silenciosa del cableado). Candidato a ticket chico.
- [ ] [FRONTEND] Evaluar exploraciones `Front-CLAUDE/` (Opus 5.5) y `Front-GPT/` (GPT-Astra), ya commiteadas; decisión de dirección de producto del usuario.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos señalados por pyflakes en `project/app/main.py:29-31` y variables muertas en `crud.py` — no confirmado, re-correr pyflakes antes de armar el ticket (a simple vista los imports de esa zona se usan).
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md` para tachar ítems resueltos por las auditorías.
- [x] ~~[BOT / UX] gap `extra_str` en `finanzas_handlers.py`~~ — resuelto (`5dd3dd0`).
- **Próximo objetivo inmediato recomendado:** push + deploy al homelab (sin eso, ni (A) ni (B) llegan al uso real), seguido de la verificación en producción.
- **Notas de proceso:** commits de esta sesión sin línea de co-autor (regla de `CLAUDE.md`); `.agents/skills/*` (salvo `orquestador/`, `trabajador/`) y `skills-lock.json` quedan ignorados por `.gitignore` (paquete de skills de video ajeno al proyecto).

---

## [2026-09-30 12:50] — Cierre de sesión: Creación de infraestructura de roles Orquestador / Trabajador y memoria unificada
- **Resultado:** Hecho
- **Estado del repo:** Rama `master` sincronizada con `origin/master` (376 tests backend / 184 frontend en verde).
- **Notas creadas/tocadas:**
  - [[PROMPT-MAESTRO-TRABAJADOR]]: Nueva infraestructura para sesiones técnicas ejecutoras en SGR (Modo Cavernícola, tests de regresión obligatorios, regla de 3 intentos y commits atómicos directos).
  - [[PROMPT-MAESTRO-ORQUESTADOR]]: Rol de Tech Lead de SGR con debate de Alta Densidad de Señal y tickets compactos.
  - `Cerebro/Handoff.md`: Creación de la cadena de custodia viva unificada (reemplazando los handoffs dispersos por fecha).
  - Punteros de slash commands en `.claude/commands/`, `.agents/skills/`, `.opencode/commands/` y `AGENTS.md`.

### Pendientes activos (Arrastre):
- [ ] [DEPLOY / HOMELAB] Deploy pendiente al Homelab (`192.168.137.10:8765`): incluye Jarvis, auditorías de Finanzas/Agenda/Hábitos y fix de `serie_id` (seguir procedimiento en `HOMELAB.md`).
- [ ] [BOT / UX] Corregir gap en bot de Telegram (`project/mybot/finanzas_handlers.py:940`: `extra_str` omitido en `reply_text`).
- [ ] [FRONTEND] Evaluar exploraciones de rediseño frontend en `Front-CLAUDE/` y `Front-GPT/`.
- [ ] [REFACTOR / LIMPIEZA] Limpieza de imports huérfanos señalados por pyflakes en `project/app/main.py:29-31` y variables muertas en `crud.py`.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md` para tachar ítems resueltos por las últimas auditorías.

- **Próximo objetivo inmediato recomendado:** Deploy al homelab siguiendo `HOMELAB.md` o corrección del gap en `finanzas_handlers.py`.
- **Decisiones / Alertas:** La suite de tests corre contra checkout limpio: `python -m pytest project/tests` (376 passed) + `npm test` en frontend.

---

## [2026-09-27] — Auditoría de Handoff anterior y fix de serie_id (Resumen histórico heredado)
- **Resultado:** Hecho, commit `4b2b728`
- **Qué se hizo:** Fix de import `agenda_detener_serie` en `project/app/main.py:122` + test de regresión `test_detener_serie_valida_tipo_y_existencia` en `project/tests/test_agenda_routes.py:258`. Barrido estático con `pyflakes` (0 nombres indefinidos restantes).
- **Estado verificado:** 376 backend passed, 0 skip + 184 frontend passed + `npm run build` limpio.
