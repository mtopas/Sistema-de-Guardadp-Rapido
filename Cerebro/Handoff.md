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

## [2026-10-07, sesión 10 — mapa maestro de pendientes]

- **Resultado:** Hecho. Se creó `Cerebro/Mapa-Maestro-Pendientes.md` como inventario consolidado y
  deduplicado de pendientes, roadmaps, planes e ideas vigentes.
- **Regla nueva:** el Mapa Maestro se lee al iniciar toda planificación relevante y se actualiza al
  cerrar cualquier trabajo que resuelva, cree, descarte o repriorice un pendiente. Este Handoff
  sigue siendo la cadena de custodia operativa y debe reflejar los cambios recientes; el mapa es el
  inventario consolidado.
- **Fuentes revisadas:** Handoff vigente, estado actual, decisiones de implementación, PROXIMAMENTE,
  triaje de feedback, PLAN-OLLAMA, roadmaps de Bóveda/Agenda/Finanzas/Hábitos y planes de Jarvis.
- **Criterio aplicado:** no se copiaron funcionalidades resueltas ni el `.exe`/sync retirado; se
  deduplicaron T6/T7/T8, Agenda en vivo, notificaciones y Jarvis-Agenda. Los roadmaps dentro de
  `project/` siguen siendo fuentes de detalle y no se modificaron por estar fuera del alcance.

### Pendientes activos (arrastre consolidado)

- [ ] [VERIF / USUARIO] Ejecutar las cuatro pruebas reales del título por IA y captura de Telegram;
  además hacer hard refresh y revisar Ahorro, Ajustes, nota larga/link, categorías, listas y
  movimientos sin descripción.
- [ ] [PUSH / USUARIO] Pushear los commits locales posteriores a esta sesión.
- [ ] [LIMPIEZA] Borrar la nota de feedback #1 con smoke test; limpiar, cuando convenga, el bundle
  JavaScript viejo del homelab y la variable inerte `HOMELAB_HOST=`.
- [ ] [T6/T7/T8] Implementar o planificar autoetiquetado conservador, transparencia de Proyectos
  con `D:\Boveda` y carga manual de tiempo en pantalla; falta definir meta diaria en T8.
- [ ] [JARVIS — AGENDA EN VIVO] Decidir y cablear `agenda.list_events` al chat; resolver también
  el tratamiento de tareas pendientes sin duplicar estado en memoria.
- [ ] [BÓVEDA] Evaluar latencia/umbral de sugerencia de categoría y agregar tests de regresión para
  escritura de vault; investigar colisión `UNIQUE` de indexación semántica.
- [ ] [UI] Resolver botones de hoja inaccesibles en mobile/tablet, batch de Hábitos con valores
  inválidos y la limpieza menor de claves i18n muertas.
- [ ] [FINANZAS] Diseñar ganancia realizada en ventas, migración legacy `Ahorro`, ledger >2000,
  alertas y el flujo mensual del importador.
- [ ] [OPERACIÓN] Auditar el backlog de PROXIMAMENTE contra el código, evaluar canal desktop/router
  de Telegram, certeza de memoria, variantes frontend y video promo.
- [ ] [FUTURO] Mantener el resto del inventario por módulo y por plataforma en el Mapa Maestro; no
  abrir tickets de ideas diferidas sin prioridad o decisión explícita.

---

## [2026-10-02, sesión 8 — triaje de feedback] — 14 notas del usuario verificadas contra el código
- **Resultado:** Hecho (validado: commit `1c983c9` presente, sin trailers de IA; el triaje está en `Cerebro/triaje-feedback-2026-10-02.md`; no reproduje la verificación en código ni en navegador, el trabajador lo hizo solo por código, sin sandbox).
- **Estado del repo:** `master` 2 commits adelante de `origin` (`7a02acc` handoff, `1c983c9` triaje); árbol limpio salvo este handoff.
- **Resultado del triaje (13 notas vigentes; la #1 es un smoke test):** RESUELTAS #2 (edición de título, también en móvil) y #9 (captura de Telegram y evaluador, ya desplegado); PARCIAL #5 (el árbol tiene clic derecho, falta "Últimas hojas"); ABIERTAS #3 (L), #4 (S/L), #6 (M), #7 (S), #8 (S: bug CSS de marcadores de lista en `.ProseMirror`/`.apuntes-preview`), #10 (M), #11 (M), #12 (S-M), #13 (S-M), #14 (L), #15 (S). Hallazgo de fondo: Jarvis no puede leer la agenda en vivo por diseño (la tool `agenda.list_events` existe pero no está cableada al chat; la ingestión solo trae pasado/aceptado).
- **Agrupación propuesta:** T1 pulido de Bóveda (#8, #7, #5) → T2 Finanzas Recientes (#15) → T3 modelo título/cuerpo (#12, #13, #10) → T4 Jarvis lee la agenda en vivo (#3) → T5 recategorización ágil (#11) → T6 tags por IA (#6) → T7 transparencia de Proyectos (#4) → T8 tiempo en pantalla (#14). T1 y T2 no necesitan decisión de producto; T3 a T8 sí (2 alternativas por decisión en el documento).

### Pendientes activos (Arrastre):
- [x] ~~[TICKET T1+T2]~~ — hecho (2026-10-02, validado por git: 4 commits sin trailers de IA): `5adc7fe` (#8 marcadores de lista), `6dc281b` (#7 "Abrir hoja"), `d18a633` (#5 menú en Últimas hojas, helper compartido `utils/hojaMenu.js`), `2774e80` (#15 `etiquetaMovimiento()`). Reportado por el trabajador: 199 passed en frontend (188 + 11), build OK, verificación manual en el sandbox, que se apagó y limpió; no reproduje la suite. **Sin desplegar.** Otras vistas con el mismo guion que #15 (fuera de alcance, sin tocar): `MovimientosTableModal.jsx:394` y el bot `/mes` (`finanzas_handlers.py:664`). `.apuntes-preview` no tiene consumidor vivo (fix por simetría, no verificado visualmente).
- [x] ~~[DEPLOY T1+T2+T3+T5 + bot]~~ — hecho el 2026-10-02/03 y verificado por el orquestador en solo lectura: bundle servido `index-Be8X_mHl.js` = `dist` del host, 3 contenedores UP, `/jarvis/health` con worker vivo y `passive_eval` sano, 20 instrumentos y 186 hojas, backups `app.db.bak-20261002-195552` y `jarvis.db.bak-20261002-195552` presentes, `JARVIS_OLLAMA_TIMEOUT` sin definir (default 120 s). `fin_movimientos` pasó de 19 a 20 desde el deploy (el reporte del trabajador decía 19; coherente con una carga del usuario, no investigado). Reportado por el trabajador y no reproducido por mí: 494 passed backend, 221 frontend; `GET /hojas/{id}/sugerir-categoria` responde en solo lectura con el modelo local.
- [x] ~~[BOT — TÍTULO/CUERPO]~~ — hecho (`e9017b3`, ya pusheado): helper `project/app/hoja_cuerpo.py` (port del frontend) y rama de texto en `_save_draft`; link puro, foto y ubicación sin cambios. Decisión: la regla vive en el bot y NO en `POST /hojas` (para no transformar en silencio el contrato de otros clientes: `/capture` legacy, ingestión de Jarvis). Tests: 22 nuevos.
- [x] ~~[Riesgo latencia de la sugerencia]~~ — medido: 30,9 s en frío y 6,3 s en caliente; el peor caso de 99 s visto en el sandbox cabe en el timeout de Ollama (120 s) y el `fetch` del frontend (`MoverCategoriaInline.jsx:52`) no tiene timeout propio (límite del navegador). Sin cambios de timeouts. Nota: 99 s con 120 s de margen es ajustado si el PC del usuario está cargado.
- [ ] [FEEDBACK DE LA PRUEBA, 2026-10-05] Usuario probó (a)-(e): todo bien. (1) **Listas numeradas**: una prueba mostró toda la nota numerada, pero al repetirla funcionó bien; no reproducible (causa probable, sin confirmar: bundle cacheado por el service worker antes del hard refresh). Sin ticket; si reaparece, hipótesis: `textoPlanoAHtml` guarda el cuerpo como un único párrafo. (2) **Sugerencia de IA**: queda en "Pensando..." bastante tiempo (carga en frío del modelo, ~30 s medidos) y luego funciona: ticket chico para precalentar Ollama (`keep_alive`) y/o mostrar un mensaje de espera claro. (3) **Prueba (f) del bot, sin cerrar**: el texto libre del bot pasa por un router y NO llegó a la captura de notas: un texto con "noviembre" lo tomó como evento de Agenda y "Investigar sitios turísticos... para organizar viaje." lo derivó a la IA (recomendaciones); un mensaje con un link y debajo una frase quedó con el link como título y la frase como cuerpo (probablemente el camino previo de link con comentario del bot, no el de texto nuevo: sin verificar). No hay un comando dedicado a guardar una nota de Bóveda (hay `/rapido`, `/ultimas`, `/buscar`, `/pregunta`, y `/nota` es de Hábitos); para probar la captura de forma determinista hace falta un camino conocido (posiblemente `/rapido`: sin verificar). Tests automáticos de `_save_draft` sí existen y pasan.
- [ ] [PRUEBAS MANUALES / USUARIO] Hard refresh (PWA) y: (a) nota larga con un link en la mitad (título separado del cuerpo y preview); (b) categorizar una hoja de "Sin categorizar" desde el selector inline, con y sin sugerencia (la primera puede tardar ~30 s); (c) clic derecho en "Últimas hojas" y "Abrir hoja"; (d) lista numerada con "1. "; (e) movimiento sin descripción en Recientes muestra la categoría; (f) mandarle una nota de texto al bot (título autogenerado y cuerpo).
- [ ] [PUSH / USUARIO] Solo queda commitear este handoff (el código de los 5 commits ya está en `origin`).
- [x] ~~[DECISIONES DE PRODUCTO]~~ — tomadas por el usuario el 2026-10-02: #12+#13 = opción (b) (un solo campo de cuerpo, título autogenerado; el título sigue editable después); #10 = (a) ampliada (la preview sale del primer link que aparezca en CUALQUIER parte del cuerpo, no solo la primera línea); #11 = (a) picker inline más categorización por IA leyendo el contenido (una nota que es solo un link no se autocategoriza: queda pendiente hasta que tenga descripción o resumen; ya existe el triaje de Inbox de Jarvis con umbrales de edad y de caracteres de contenido: reusarlo); #6 = (b) autoetiquetado, conservador (si la IA no está segura o no hace falta, no agrega) y con tags fáciles de quitar; #14 = (a) carga manual dentro de Hábitos, a semana vencida: top 5 apps con horas semanales y tiempo en pantalla de cada día (el usuario usa iOS y no puede exportar informes); #4 = (a) transparencia, más leer la sección de proyectos de la Bóveda (`01 - Proyectos`).
- [x] ~~[T3 + T5]~~ — hechos (2026-10-02, validados por git: 4 commits `1ce4d86`, `8c807b0`, `24ae058`, `6854646`, sin trailers de IA): captura con cuerpo único y título autogenerado, preview desde el primer link del cuerpo, selector inline de categoría en "Sin categorizar" y sugerencia de IA con modelo LOCAL que reusa el clasificador y el umbral (~400 caracteres) del triaje (`classify_destination_from_content`, `sugerir_destino_para_hoja`; endpoint `GET /hojas/{id}/sugerir-categoria`). Reportado por el trabajador (no reproducido por mí): 472 passed backend, 221 frontend, build OK, verificación manual en sandbox aislado. Fase 6 (DEPLOY) NO hecha: espera OK del usuario. Latencia medida con gemma3:12b: ~99 s la primera llamada (carga del modelo), ~4 s en caliente, instantáneo si es solo link; Ollama caído degrada sin error. Observación del orquestador: no verifiqué que el timeout de Ollama (`JARVIS_OLLAMA_TIMEOUT`) ni el del `fetch` del frontend toleren 99 s en frío; si la primera sugerencia da error en el homelab, es lo primero a revisar (y el `keep-alive` de Ollama).
- [ ] [BOT — TÍTULO/CUERPO] `mybot/bot.py::_finalize_save` + `_post_hoja` mandan todo el texto como `contenido` (título) con cuerpo vacío: el mismo defecto que tenía el CaptureModal. Sin corregir. Ticket chico si se quiere el mismo modelo que la app (reusar la regla de `tituloDesdeCuerpo`, que hoy está solo en el frontend: conviene un helper compartido en backend).
- [ ] [UMBRAL DE SUGERENCIA] Si las notas rápidas quedan casi siempre por debajo de ~400 caracteres, la sugerencia dirá "falta descripción" casi siempre; evaluar bajar el umbral de la sugerencia de la Bóveda (hoy compartido con el triaje a propósito).
- [ ] [TICKETS DESBLOQUEADOS RESTANTES] T6 (autoetiquetado), T7 (Proyectos activos desde la Bóveda; verificar antes que el homelab tiene `D:\Boveda` montada y cuándo se actualiza: el sync de la Bóveda corre al arrancar y al inicio de los GET de Bóveda, por mtime), T8 (tiempo en pantalla en Hábitos; modelo propuesto: semana lunes a domingo, 7 totales diarios, top 5 apps con horas semanales, opcional pickups y notificaciones).
- [ ] [JARVIS — AGENDA EN VIVO (T4/#3)] Cablear `agenda.list_events` al chat; es L, ver el triaje; requiere decisión de diseño (el Tool Registry hoy no tiene loop de tools en el chat).
- [ ] [LIMPIEZA] Borrar la nota #1 del feedback (`DELETE /feedback/1`, smoke test de deploy); es una escritura y la haría el usuario o un ticket.
- [ ] [VERIF / USUARIO] Hard refresh del navegador (PWA), Ahorro (Bonos/Cedears con valores, diálogo del tacho) y que Ajustes no muestre el panel de sync.
- [ ] [OPCIONAL] Quitar `HOMELAB_HOST=` del `.env` del homelab (inerte): editar solo esa línea y `docker-compose up -d --no-build` (no `restart`).
- [ ] [IDEA FINANZAS] Registrar ganancia realizada en las ventas; anotar en `Finanzas-Roadmap.md`.
- [ ] [BACKLOG] Auditar `Cerebro/PROXIMAMENTE.md` ítem por ítem (solo se verificó uno).
- [ ] [DISEÑO — NO URGENTE] Propuestas del canal desktop solo visibles con el navegador abierto; calidad de respuesta del router de Telegram.
- [ ] [IDEA] Certeza/estado por entrada de memoria de Jarvis; evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [VIDEO PROMO] Prompt entregado, pendiente de ejecución (sandbox, nunca producción). Hay una skill `/brag` instalada.
- [ ] [MENSUAL] Importador: `python project/scripts/importar_operaciones.py <ordenes.csv> <tenencias.csv> <mep.csv> --aplicar --excluir-tickers TZX26`, luego `--actualizar-precios <tenencias.csv> --aplicar`.
- [x] ~~[Triaje de feedback]~~ y ~~[movimientos 88→17]~~ — cerrados.
- **Próximo objetivo inmediato recomendado:** ticket T1+T2 (bugs chicos con valor inmediato) y, en paralelo, que el usuario resuelva las decisiones de producto.

---

## [2026-10-06, sesión 9 — título por IA] — Las hojas nuevas se titulan solas (texto + metadata del link)
- **Resultado:** Hecho y verificado en producción (validado por el orquestador: bundle, `/jarvis/health` y conteos coinciden con lo reportado; no pude confirmar el push por un corte de red hacia GitHub en el momento de validar, pero los 5 commits están en el `master` local).
- **Qué se hizo:** `jarvis/captures/titulos.py::generar_titulo` (modelo LOCAL, temp 0, nunca lanza, respeta el Privacy Gateway) lee el cuerpo de la hoja y la metadata del link (si hay) y devuelve un título limpio o, si falta información, una pregunta. Guardar NUNCA espera a la IA: el título provisional (`hoja_cuerpo.py`) aparece al instante y el refinamiento llega después, en segundo plano, sin bloquear. El refinamiento NO pisa un título editado a mano (verificado en sandbox: `{titulo:null}` sin llamar al modelo si ya no coincide con el provisional). El bot, si falta info, pregunta UNA vez y usa la respuesta para titular; sin respuesta/`/cancel` → queda el provisional. Confirmado en código: el PATCH de título nunca renombra el archivo (solo mueve si cambia la categoría), así que no hay riesgo nuevo de colisión de archivos.
- **Probado en sandbox con Ollama real** antes del deploy (pedido explícito del orquestador, porque el round-trip real y el diálogo de aclaración no estaban cubiertos por los tests mockeados): título correcto a partir de texto + metadata del link (caso real: un link de OCR), edición manual respetada, y el flujo pregunta→respuesta→título funcionando de punta a punta. En frío (Ollama >120 s) degrada al provisional sin error, comportamiento esperado y aceptado (no se precalienta el modelo ni se tocan timeouts, a pedido del usuario).
- **Producción:** 3 contenedores UP, bundle `index-CSKwzYuf.js` = dist del host, `/meta` 200 (190 hojas, 23 movimientos, 20 instrumentos, sin pérdida respecto al backup previo), `/jarvis/health` sano. Backups `app.db.bak-pre-tituloia-*` y `jarvis.db.bak-pre-tituloia-*`. 523 passed backend, 225 frontend.
- **Commits:** `b8dc245` (backend + endpoint `POST /hojas/{id}/titulo-ia`), `6432bfe` (app: refinamiento en 2º plano + notas con link a cuerpo único), `877a9a5` (bot: cuerpo único + pregunta de aclaración), `8a8f7af` (docs), `8f4ac35` (nota del deploy). Sin trailers de IA.

### Pendientes activos (Arrastre):
- [ ] [VERIF / USUARIO] Hard refresh (PWA) y las 4 pruebas en uso real: (a) nota con link en la app (título provisional al instante, luego el de IA); (b) editar el título a mano y confirmar que no se pisa; (c) por Telegram, un link sin contexto (debería preguntar); (d) un texto claro por Telegram. Para (c)/(d): usar el menú de categorías o el modo rápido del bot, no texto libre suelto (pasa por el router y puede desviarse a Agenda o a la IA conversacional).
- [ ] [MENOR] Quedó un `index-*.js` viejo huérfano en `~/project/frontend/dist/assets/` del homelab (inofensivo; `index.html` ya apunta al nuevo). Inherente al deploy por `tar`; limpiarlo algún día si molesta.
- [ ] [LIMPIEZA] Borrar la nota #1 del feedback (`DELETE /feedback/1`, smoke test de deploy).
- [ ] [TICKETS DESBLOQUEADOS RESTANTES] T6 (autoetiquetado por IA, conservador, tags fáciles de quitar), T7 (Proyectos activos: transparencia + leer `01 - Proyectos` de la Bóveda; confirmar primero cómo/cuándo el homelab sincroniza `D:\Boveda`), T8 (tiempo en pantalla en Hábitos: carga manual semanal, top 5 apps + horas, total diario, calculado: total/promedio/mejor/peor día y comparación con la semana anterior — falta confirmar con el usuario si quiere meta diaria para comparar).
- [ ] [TICKET CHICO] "Pensando..." de la sugerencia de categoría tarda por la carga en frío del modelo (~30 s medido entonces); no prioritario para el usuario. Si se retoma: precalentar Ollama (`keep_alive`) y/o mensaje de espera más claro.
- [ ] [IDEA FINANZAS] Registrar ganancia realizada en las ventas; anotar en `Finanzas-Roadmap.md`.
- [ ] [BACKLOG] Auditar `Cerebro/PROXIMAMENTE.md` ítem por ítem (solo se verificó uno).
- [ ] [DISEÑO — NO URGENTE] Propuestas del canal desktop solo visibles con el navegador abierto; calidad de respuesta del router de Telegram.
- [ ] [IDEA] Certeza/estado por entrada de memoria de Jarvis; evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [VIDEO PROMO] Prompt entregado, pendiente de ejecución. Hay una skill `/brag` instalada.
- [ ] [MENSUAL] Importador: `python project/scripts/importar_operaciones.py <ordenes.csv> <tenencias.csv> <mep.csv> --aplicar --excluir-tickers TZX26`, luego `--actualizar-precios <tenencias.csv> --aplicar`.
- [x] ~~[T3+T5], [bot título/cuerpo], [riesgo latencia sugerencia], [feedback de la prueba de T1+T2+T3+T5], [título por IA (T4-bis, pedido nuevo del usuario)]~~ — resueltos.
- **Próximo objetivo inmediato recomendado:** que el usuario haga las 4 pruebas de uso real y después decida entre T6, T7 y T8.

---

## [2026-10-02, sesión 7 — retiro del `.exe` y del sync] — Sync homelab↔Windows eliminado
- **Resultado:** Hecho (validado por el orquestador contra git y producción en solo lectura).
- **Contexto:** el usuario confirmó que no usa el `.exe` (solo el homelab por Tailscale). Se cerró también la revisión de hojas: las 14 notas "faltantes" ya estaban en el homelab bajo otros ids; el usuario no rescató ninguna.
- **Estado del repo:** `master` 3 commits adelante de `origin` (`4a5a11f` scripts y docs, `7f98031` endpoints y panel de Ajustes, `9ce7ccb` verificación post-deploy), sin trailers de IA. Eliminados `run_sgr.py`, `sgr.spec` y 5 scripts de sync (siguen en el historial); `SYNC-WINDOWS.md` y `BUILD.md` quedan como históricos; nuevo `project/scripts/dev-config.ps1` (el sandbox `dev-start`/`dev-stop` se conserva); `CLAUDE.md`/`HOMELAB.md`/`README.md` actualizados. Tests: 455 passed backend, 188 frontend.
- **Verificado en producción:** `GET /sync/export` → 404 y `POST /sync/import` → 405 (sin ruta POST; el 405 lo produce el catch-all de la SPA), 3 contenedores UP (el trabajador reportó además `/jarvis/health` sano y conteos de `app.db` iguales antes y después). Backups `~/project/database/app.db.bak-20261002-150258` y `jarvis.db.bak-20261002-150258`. En esta PC no había tareas, procesos ni accesos directos del `.exe`; el watchdog `SGR-Ensure-ICS` no se tocó.
- **Hallazgo a confirmar (orquestador):** `fin_movimientos` bajó de 88 (backup del 2026-09-30 13:34) a 17 en el backup del 2026-10-01 14:43, o sea ANTES del importador y de este deploy; hoy hay 19. Coincide con el momento en que el usuario vació instrumentos y dijo haber borrado "varias cosas a propósito". No lo asumí: queda para que el usuario confirme que la limpieza de movimientos fue deliberada (los 88 siguen en `app.db.bak-20260930-133414`).

### Pendientes activos (Arrastre):
- [ ] [PUSH / USUARIO] Pushear los 3 commits locales y commitear `Cerebro/Handoff.md`.
- [x] ~~[MOVIMIENTOS 88→17]~~ — el usuario confirmó (2026-10-02) que borró él mismo todo en Finanzas a propósito; no hay nada que restaurar (los 88 siguen en `app.db.bak-20260930-133414`).
- [ ] [VERIF / USUARIO] Hard refresh del navegador (PWA) y revisar Ahorro (Bonos/Cedears con valores, diálogo del tacho) y que Ajustes ya no muestre el panel de sync.
- [ ] [OPCIONAL] Quitar `HOMELAB_HOST=` del `.env` del homelab (inerte, ya nadie lo lee): editar solo esa línea y `docker-compose up -d --no-build` (no `restart`).
- [ ] [IDEA FINANZAS] Registrar ganancia realizada en las ventas (hoy la venta descuenta al PPC y el TC de la venta es solo informativo); anotar en `Finanzas-Roadmap.md`.
- [ ] [BACKLOG] Auditar `Cerebro/PROXIMAMENTE.md` ítem por ítem contra el código (solo se verificó uno).
- [ ] [DISEÑO — NO URGENTE] Propuestas del canal desktop solo visibles con el navegador abierto (empujarlas por Telegram); calidad de respuesta del router de Telegram (informe genérico ante una frase).
- [ ] [IDEA] Certeza/estado por entrada de memoria de Jarvis; evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [VIDEO PROMO] Prompt entregado; pendiente de ejecución (sandbox con `seed_demo.py`, nunca producción). Ahora hay una skill `/brag` instalada, evaluar usarla.
- [ ] [MENSUAL] Flujo del importador: `python project/scripts/importar_operaciones.py <ordenes.csv> <tenencias.csv> <mep.csv> --aplicar --excluir-tickers TZX26`, luego `--actualizar-precios <tenencias.csv> --aplicar` (conversión con el MEP vigente, no el de la foto).
- [x] ~~[RESCATE HOJAS], [DEUDA DE SYNC / .exe], [USO DEL .EXE]~~ — resueltos: no hay pérdida de notas y el `.exe` y el sync fueron retirados.
- **Próximo objetivo inmediato recomendado:** confirmar lo de los movimientos y pushear. No quedan pendientes técnicos urgentes.

---

## [2026-10-02, sesión 6 — pendientes técnicos + IBIT] — Limpieza, captura pasiva endurecida, deploy único y restauración de IBIT
- **Resultado:** Hecho (validado por el orquestador contra git y contra el homelab en solo lectura). Suite reproducida por el trabajador con el venv del proyecto: **455 passed** (441 + 8 de `--excluir-tickers` + 6 de captura pasiva), sin skips ni fallos; no la corrí yo.
- **Estado del repo:** `master` 8 commits adelante de `origin`, árbol limpio, sin trailers de IA ni datos personales en el diff: `1412eda` (`--excluir-tickers` en el importador), `77f68be` (captura pasiva ante fallas del evaluador), `40c655e` (HOMELAB: salto de línea del `.env`, `OLLAMA_BASE_URL`, rebuild del frontend), `4a78646` (imports/variables muertas confirmados por pyflakes), `51783fc` (PROXIMAMENTE), `1d00b76` (estado-actual), `c058290` (confirmación al eliminar un activo), `f5637f1` (HOMELAB: `scp -r` anida `dist/dist`). Los seis primeros eran de la misma sesión del trabajador; su resumen intermedio no me llegó y los validé por `git log`/`--stat`. TZX26: 19→18 instrumentos y 35→34 transacciones; backup `app.db.bak-20261001-191501`. PROXIMAMENTE.md: el trabajador tocó UN solo ítem (reconciliación de importaciones CSV, tachado parcial, verificado contra el código); el mensaje del commit `51783fc` sobrevende ("verificados uno por uno"): los ~40 ítems restantes NO se auditaron.
- **Verificado en producción:** 3 contenedores UP; `/jarvis/health` con worker vivo y `passive_eval` sin fallas; 18 instrumentos; TZX26 ausente; CRES y TXAR en cero (historial intacto); IBIT presente (cant 21, precio 5,006137); el bundle servido (`index-NROL1Fux.js`) es el del `dist` del host (imagen reconstruida); `JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES` ya no está en el `.env` ni en el contenedor del worker, o sea que rige el default de 20 minutos.
- **Incidente: IBIT borrado por accidente.** El tacho de Ahorro borraba el instrumento y sus transacciones en cascada con un solo clic. El usuario borró IBIT sin querer; se restauró por API desde el backup `app.db.bak-20261001-191501` (2 compras re-posteadas; ids internos nuevos 44/49/50), sin tocar el resto. Mitigación: `window.confirm` explícito (no cubierto por vitest) en `DeleteCell`.
- **Hallazgo:** el `scp -r project/frontend/dist` documentado **anidaba** el build en `dist/dist/` y el rebuild servía el bundle viejo; el trabajador lo corrigió en producción y en `HOMELAB.md`. Con esto el deploy de Bonos/Cedears en Ahorro quedó efectivo.

### Pendientes activos (Arrastre):
- [ ] [PUSH / USUARIO] Pushear los 8 commits locales.
- [ ] [BACKLOG] Auditar `Cerebro/PROXIMAMENTE.md` ítem por ítem contra el código (solo se verificó uno). Ticket chico de baja prioridad.
- [ ] [VERIF / USUARIO] Hard refresh del navegador para tomar el bundle nuevo (la app es PWA con service worker); abrir Ahorro y confirmar Bonos/Cedears con valores y el diálogo del tacho.
- [x] ~~[RESCATE HOJAS]~~ — cerrado el 2026-10-02: el trabajador comparó por contenido las 14 notas de los grupos A (solo Windows, 6) y B (mismo id/contenido distinto, 8): TODAS ya existen en el homelab bajo otro id (los ids se reasignaron de forma independiente en cada réplica; en varios casos la versión del homelab es más completa). Grupo D (14, solo cambio de categoría) ya está en Basura en el homelab; grupo C (6 solo-homelab) no se pierde. El usuario no eligió ninguna nota. No hay pérdida de contenido. Material de la revisión (gitignored, datos personales): `project/database/backup-incidente-20260930/revision-hojas.html`.
- [ ] [DECISIÓN — DEUDA DE SYNC / USUARIO] El usuario aclaró que usa SGR solo vía el homelab por Tailscale y NO abre el `.exe`. El sync homelab↔Windows (`SYNC-WINDOWS.md`) sobrescribe una réplica con la otra sin merge y reasigna ids de forma independiente: es la causa de la divergencia de `hojas` y un riesgo latente si el `.exe` se abre por error (el push al cerrar podría pisar el homelab). Opciones: (a) retirar el `.exe` y el sync de la PC y deprecar `SYNC-WINDOWS.md` (recomendada si no se usa), o (b) rediseñar el sync con merge por contenido e ids estables. Mientras tanto: NO abrir el `.exe`.
- [ ] [IDEA FINANZAS] Registrar ganancia realizada en las ventas (hoy la venta descuenta al PPC y el TC de la venta es solo informativo); anotar en `Finanzas-Roadmap.md`.
- [ ] [DISEÑO — NO URGENTE] Propuestas del canal desktop solo visibles con el navegador abierto (empujarlas por Telegram); calidad de respuesta del router de Telegram (informe genérico ante una frase).
- [ ] [IDEA] Certeza/estado por entrada de memoria de Jarvis; evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [VIDEO PROMO] Prompt entregado; pendiente de ejecución (sandbox con `seed_demo.py`, nunca producción). Ahora hay una skill `/brag` instalada, evaluar usarla.
- [ ] [MENSUAL] Flujo con tres archivos: `python project/scripts/importar_operaciones.py <ordenes.csv> <tenencias.csv> <mep.csv> --aplicar --excluir-tickers TZX26` y luego `--actualizar-precios <tenencias.csv> --aplicar` (la conversión usa el MEP vigente, no el de la foto).
- [x] ~~[TZX26], [precio_actual], [DEPLOY FRONTEND], [timeout 20 min], [captura pasiva por Telegram], [tests/docs HOMELAB], [imports huérfanos], [plazos fijos Brubank]~~ — resueltos. `PROXIMAMENTE.md`: revisión completa pasa al pendiente [BACKLOG] de arriba.
- **Próximo objetivo inmediato recomendado:** verificar la pantalla de Ahorro (hard refresh) y decidir la deuda de sync (retirar el `.exe` o rediseñar). No quedan pendientes con riesgo de pérdida de datos conocidos.

---

## [2026-10-01, sesión 5 — importador de operaciones] — Carga del ledger desde el broker + fix del parseo del evaluador
- **Resultado:** Hecho con observaciones (validado por el orquestador contra commits, API y backups del homelab).
- **Qué se hizo:** (a) Captura pasiva por Telegram: causa raíz = `json.loads()` fallaba con "Extra data" cuando el modelo devolvía un JSON por cada mensaje; fix con `raw_decode()` (`bfa853c`, +1 test), desplegado por el usuario con `scp` + `docker build` + recreate del worker (la prueba por Telegram sigue sin cerrarse). (b) Importador: `project/scripts/importar_operaciones.py` (CLI, dry-run por defecto, idempotente por `id Orden`, TC MEP histórico real tomado de un CSV de cotizaciones), 35 operaciones ejecutadas cargadas (21 omitidas: depósitos, transferencias, canceladas, rechazadas), 19 instrumentos, 16/16 posiciones concilian con el CSV de tenencias; tipos `bonos` y `cedears` ampliados en backend y frontend. Commits `7afe3e2`, `e7fb8b5`, `4b9d797` (sin datos personales, verificado). 430 tests.
- **Estado del repo:** `master` con commits locales sin pushear (`550e80a`, `bfa853c`, `7afe3e2`, `e7fb8b5`, `4b9d797`); sin commitear: `.gitignore` (patrón del CSV de tenencias, datos personales), `Cerebro/Handoff.md`, `HOMELAB.md`.
- **Hallazgos del orquestador:** (1) **Se perdieron instrumentos NO del broker antes de la importación:** el backup `app.db.bak-20260930-133414` y `app.db.bak.20260930-161452` tienen 15 instrumentos y 8 transacciones (7 acciones/CEDEARs cargadas a mano, 1 ON, **6 plazos fijos UVA de Brubank y 1 FCI "Renta Fija - Viaje Caro"**); el backup previo a la importación (`app.db.bak-20261001-144304`) ya tenía 0 instrumentos y 0 transacciones. Hoy el vivo tiene 19 instrumentos y 35 transacciones, ningún plazo fijo ni FCI. Alguien vació la tabla entre el 30/09 16:14 y el 01/10 14:43; no consta quién ni si fue intencional. (2) Los cambios de frontend (`GlobalLedgerPanel.jsx`, `AhorroTab.jsx`, tipos `bonos`/`cedears`) **no están desplegados**: el Ahorro del homelab puede no mostrar bien las posiciones nuevas. (3) `TZX26` (bono CER vencido) quedó tipado como `cedears` con 205425 nominales; falta decidir canje/vencimiento. (4) El flujo mensual necesita tres archivos (órdenes, tenencias y CSV de MEP), hay fricción. (5) El resumen sugería "sincronizar `app.db` del homelab a Windows": hacerlo SOLO con el pull del `.exe` (jamás `scp` de Windows hacia el homelab), recordando que el pull pisa las hojas solo-Windows (preservadas en `backup-incidente-20260930/`).

### Pendientes activos (Arrastre):
- [x] ~~[PLAZOS FIJOS BRUBANK / FCI]~~ — el usuario confirmó que borró varias cosas a propósito (2026-10-01); no hay nada que restaurar. Siguen en `app.db.bak.20260930-161452` por si hiciera falta.
- [ ] [DEPLOY FRONTEND — BLOQUEA VER EL PORTAFOLIO] El `dist/` nuevo (commit `6f37afa`, secciones Bonos y Cedears en Ahorro) está copiado al host pero el contenedor sigue sirviendo el de la imagen. Reconstruir con `docker build --network=host -t sgr-app:latest -f Dockerfile ..` + `docker-compose up -d --no-build` (NO `docker-compose build`: no aplica `--network=host`, ver `HOMELAB.md`); revisar la sección "Deploy del frontend al homelab" (`.dockerignore` en `~`). Verificar Ahorro con las posiciones nuevas. EVIDENCIA (orquestador, 2026-10-01): el contenedor sirve `index-Bq5QJ3nY.js` (viejo) y el `dist` del host tiene `index-DPySS6hf.js` (nuevo): falta solo reconstruir la imagen; el trabajador lo había atribuido a service worker/render sin comprobarlo. Después del rebuild, hard refresh del navegador.
- [x] ~~[precio_actual]~~ — hecho (`71e59f6`, `--actualizar-precios`): 16 instrumentos actualizados en el homelab (USD por unidad = precio ARS ÷ MEP vigente 1548,10; TZX26, CRES y TXAR sin fila no se tocan); portafolio por API $2.469.480 vs CSV $2.469.476 ARS (dif. $4 por redondeo); 441 tests. Backup `~/project/database/app.db.bak-20261001_*`. Comando mensual: `python project/scripts/importar_operaciones.py --actualizar-precios <MisInstrumentos.csv> --excluir-tickers TZX26 --aplicar`. Observación: la conversión usa el MEP vigente, no el de la fecha de la foto. El `--excluir-tickers TZX26` (agregado 2026-10-01) evita que el bono CER vencido —ya eliminado del homelab— reaparezca en el próximo export; usar el mismo flag en la importación de órdenes.
- [ ] [PRUEBA TELEGRAM / USUARIO] Cerrar la prueba de captura pasiva por Telegram con el fix `raw_decode` ya desplegado: texto sin palabras de compra (el bot derivó dos mensajes a categorías de Bóveda/Agenda); ACTUALIZACIÓN 2026-10-01: el usuario confirmó que la captura por Telegram FUNCIONA (cadena completa validada). Queda solo restaurar `JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES=20` (hoy 3) y recrear el worker; ya no hace falta el ticket de qué handler consume cada texto.
- [ ] [TICKET — MEDIO] Captura pasiva: (a) una evaluación fallida igual marca la conversación como revisada (se pierden mensajes si Ollama está caído); (b) el parseo toma solo el primer veredicto JSON (leer todos y quedarse con el primero positivo).
- [ ] [TZX26] Decidir canje/vencimiento del bono y su tipado.
- [ ] [PUSH / COMMITS / USUARIO] Pushear los 5 commits locales; commitear `.gitignore`, `Cerebro/Handoff.md` y `HOMELAB.md`.
- [ ] [RESCATE HOJAS / USUARIO] Revisar `project/database/backup-incidente-20260930/reporte-rescate-hojas.md`; decidir qué hojas rescatar. Hacerlo ANTES de abrir el `.exe` (su pull pisa la copia local).
- [ ] [USO DEL .EXE / USUARIO] Antes de abrirlo: `curl http://192.168.137.10:8765/meta`; revisar `project/SYNC-WINDOWS.md` ante pull fallido; actualizar el token del bot en el `.env` local.
- [ ] [VERIF UI / USUARIO] Abrir `/finanzas` y `/agenda` del homelab.
- [ ] [DOCS] `HOMELAB.md`: salto de línea final al editar `.env`; `OLLAMA_BASE_URL` con la IP del host (esta línea y la del `scp -r` ya corregida están sin commitear).
- [ ] [HUECO DE SYNC] Las réplicas ya habían divergido en `hojas`: ticket de diseño.
- [ ] [DISEÑO — NO URGENTE] Propuestas del canal desktop solo visibles con el navegador abierto; empujarlas también por Telegram. Calidad de respuesta del router de Telegram (informe genérico ante una frase).
- [ ] [IDEA] Certeza/estado por entrada de memoria de Jarvis; evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [VIDEO PROMO] Prompt entregado al usuario; pendiente de ejecución (sandbox con `seed_demo.py`, nunca en producción).
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md`.
- [x] ~~[Deploy 3 de `550e80a`]~~ — incluido al desplegar `passive.py` de `bfa853c`.
- **Próximo objetivo inmediato recomendado:** aclarar los plazos fijos de Brubank (si fueron borrados sin querer, cuanto antes) y desplegar el frontend.

---

## [2026-09-30, sesión 4 — captura pasiva] — Causa raíz de que no llegara "¿Guardo esto?" y fix de salud del evaluador
- **Resultado:** Hecho con un caveat (el canal Telegram sigue sin probarse). Validado por el orquestador: commit `550e80a` limpio (sin secretos ni menciones de IA), 399 passed.
- **Causa raíz (2 problemas del `.env` del homelab, no de código):** (1) falta de salto de línea al agregar `BOT_ALLOWED_CHAT_IDS` (en el ticket anterior): quedó pegada a `JARVIS_LOCAL_MODEL`, dando el modelo corrupto `gemma3:12bBOT_ALLOWED_CHAT_IDS=...` y dejando esa variable sin definir como tal; (2) `OLLAMA_BASE_URL=http://localhost:11434` es inalcanzable desde Docker (`localhost` es el contenedor); ahora `http://192.168.137.1:11434`. Los `sed` los ejecutó el usuario (el sistema denegó editar el `.env` remoto).
- **Prueba E2E:** mensaje → registro → scan → evaluador (Ollama/gemma3:12b) → propuesta → banner en el frontend. Fue por `/jarvis` (canal `desktop`), donde la propuesta aparece por polling del frontend y no se empuja a Telegram (por diseño). Para la prueba se bajó `JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES` a 3.
- **Bug de código corregido:** `get_eval_health()` leía memoria del backend, no del worker (siempre 0 fallas). Ahora persiste en `jarvis_policies` (`_persist_eval_health()`); test `test_health_lee_de_db_no_de_memoria`. Commit `550e80a`, **sin desplegar**.
- **Objeción del orquestador:** que `/help` responda NO demuestra que la allowlist esté activa: con la variable sin definir el bot acepta a cualquiera y también responde. Durante el lapso del `.env` roto el bot pudo estar abierto. Hay que verificarlo en el log.

### Pendientes activos (Arrastre):
- [ ] [USUARIO — URGENTE] Verificar la allowlist: `ssh mtopas@192.168.137.10 "docker logs project-bot-1 2>&1 | grep -i allowlist"` debe decir "Allowlist activa: 1 chat(s)". Revisar también que cada variable del `.env` del homelab esté en su propia línea (`grep -n "BOT_ALLOWED_CHAT_IDS\|JARVIS_LOCAL_MODEL\|OLLAMA_BASE_URL" ~/project/.env`, sin mostrar tokens).
- [ ] [USUARIO] Restaurar `JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES=20` (hoy en 3 por la prueba) y recrear el worker con `docker-compose up -d --no-build --force-recreate worker` (comando del resumen del trabajador); confirmar con `grep` que quedó en una línea propia.
- [ ] [PRUEBA TELEGRAM / USUARIO] Con el entorno estable: un mensaje claro y guardable por **Telegram** (no por `/jarvis`), esperar el timeout sin escribir y confirmar que la propuesta llega por Telegram. Es el escenario original y sigue sin probarse.
- [ ] [DEPLOY 3] Desplegar `550e80a` (health real del evaluador) con el procedimiento corregido de `HOMELAB.md`, backup previo y conteos antes/después.
- [ ] [PUSH / USUARIO] Pushear `550e80a`; commitear `Cerebro/Handoff.md`.
- [ ] [DOCS] En `HOMELAB.md`: (a) al agregar variables al `.env` verificar salto de línea final (esta causa raíz); (b) `OLLAMA_BASE_URL` debe apuntar a la IP del host (192.168.137.1), nunca a `localhost`.
- [ ] [DISEÑO — NO URGENTE] Las propuestas del canal desktop solo se ven con el navegador abierto; evaluar empujarlas también por Telegram.
- [ ] [RESCATE HOJAS / USUARIO] Revisar `project/database/backup-incidente-20260930/reporte-rescate-hojas.md` y decidir qué hojas rescatar.
- [ ] [USO DEL .EXE / USUARIO] Antes de abrirlo: `curl http://192.168.137.10:8765/meta` responde; revisar `project/SYNC-WINDOWS.md` ante pull fallido; actualizar el token del bot en el `.env` local.
- [ ] [VERIF UI / USUARIO] Abrir `/finanzas` y `/agenda` del homelab.
- [ ] [HUECO DE SYNC] Las réplicas ya habían divergido en `hojas`: ticket de diseño a definir.
- [ ] [PROCESO] Regla 1.5 del trabajador: se deja como norma que el ticket autorice commits explícitamente (así funcionó en las últimas sesiones).
- [ ] [IDEA DE DISEÑO] Certeza/estado por entrada de memoria (regla firme / preferencia / idea / en discusión); evaluar con prueba real.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md`.
- [x] ~~[Ollama / red]~~ y ~~[captura pasiva sin propuestas]~~ — causa raíz hallada y corregida (arriba); falta solo la prueba por Telegram.
- **Próximo objetivo inmediato recomendado:** verificar la allowlist en el log (2 minutos), restaurar el timeout a 20 y hacer la prueba por Telegram.

---

## [2026-09-30, sesión 3 — deploy 2] — Allowlist, deploy de HEAD al homelab y limpiezas
- **Resultado:** PARCIAL (validado por el orquestador; 2 objeciones abajo).
- **Estado del repo:** `master` 2 commits adelante de `origin` (`c6c6a22` README sin rutas absolutas, `08927d6` deja de versionar `Front-GPT/SGR/tests/.ui-bundle.mjs`; sin menciones de IA). `Cerebro/Handoff.md` con cambios sin commitear.
- **Qué se hizo:** (A) `BOT_ALLOWED_CHAT_IDS` **nunca había existido** en el `.env` del homelab (el resumen de la sesión anterior afirmaba haberla agregado: no era cierto); se agregó con el `debug_chat_id` de `jarvis_policies` como valor y el bot reporta "Allowlist activa: 1 chat(s)". Deploy de HEAD (`b2445fa`) con el procedimiento corregido (tar con exclusiones); backups `app.db.bak.20260930-161452` y `jarvis.db.bak.20260930-161452` en `~/project/database/`. Conteos de `app.db` iguales antes y después (agenda_eventos 58, agenda_tareas 9, hojas 180, fin_movimientos 88, feedback 14…). `/jarvis/health`: worker vivo, `passive_eval` presente con `consecutive_failures: 0`. 3 contenedores UP, `/meta` 200, frontend servido. Captura pasiva: 26 mensajes registrados, 6 propuestas, 0 fallas.
- **Hallazgo clave:** Ollama **no es alcanzable** desde el homelab: el adaptador "Ethernet 2" del PC quedó en perfil de red Público y el firewall bloquea la entrada. El evaluador local, la extracción y los embeddings dependen de Ollama: sin él, una propuesta de captura pasiva no puede generarse. Es la hipótesis principal de por qué nunca llegó el mensaje "¿Guardo esto?".
- **Objeciones del orquestador:** (1) El trabajador reportó pytest local `352 passed, 7 failed, 2 errores de colección` y los llamó "pre-existentes", pero 6 de los fallos están en `test_evaluate_for_capture_health.py`, archivo creado hoy que la sesión anterior reportó en verde (398 passed). No es "pre-existente": o es un problema de entorno de esa corrida (2 errores de colección de imports de `jarvis`) o hay una regresión real. Sin resolver. (2) El chequeo de captura pasiva se marcó ✓ con "6 propuestas" sin desglose: no dice de qué origen son ni su estado (PENDING sin `pushed_at` / EXPIRED / etc.), que es justo el dato para saber si las propuestas se crean y no salen.

### Pendientes activos (Arrastre):
- [ ] [OLLAMA / USUARIO] Correr `project\scripts\Ensure-Ics.ps1` como administrador para pasar "Ethernet 2" de Público a Privado y verificar que el watchdog `SGR-Ensure-ICS` sigue activo. Después confirmar que Ollama es alcanzable desde los contenedores del homelab.
- [ ] [BOT / USUARIO] Confirmar que el bot responde desde tu chat (la allowlist usa el `debug_chat_id`; si no era tu chat quedarías fuera) y que ignora un chat no autorizado. Si querés más chats: IDs separados por coma en `BOT_ALLOWED_CHAT_IDS`.
- [ ] [PRUEBA CAPTURA PASIVA / USUARIO] Con Ollama arreglado: un mensaje claro y guardable (una decisión), 25 minutos sin escribir, y ver si llega "¿Guardo esto en tu memoria?". Solo si sigue sin llegar, ticket de investigación a fondo (datos a pedir: desglose de las 6 propuestas por `origin_source`/`status`/`pushed_at`/`created_at`, `last_passive_review_at` de la conversación, logs del worker, `passive_eval`).
- [x] ~~[TESTS ROJOS]~~ — era de entorno: el trabajador corrió pytest con el Python global (sin `litellm`). Con `./project/venv/Scripts/python.exe -m pytest project/tests -q` el usuario obtuvo **398 passed** (2026-09-30). Comando corregido en `PROMPT-MAESTRO-TRABAJADOR.md` (sin commitear). El resumen del trabajador que hablaba de 7 fallos "pre-existentes" era incorrecto.
- [x] ~~[OLLAMA / perfil de red]~~ — el usuario pasó "Ethernet 2" a Privado (Tailscale es un adaptador aparte, ya en Privado, sin cambios). Falta confirmar que el homelab alcanza Ollama (lo dirá la prueba de captura pasiva) y que Ollama escucha en `0.0.0.0`.
- [ ] [PUSH / USUARIO] Pushear `c6c6a22` y `08927d6`; commitear `Cerebro/Handoff.md`.
- [ ] [RESCATE HOJAS / USUARIO] Revisar `project/database/backup-incidente-20260930/reporte-rescate-hojas.md` y decidir qué hojas rescatar (solo-Windows 233, 238, 284, 287, 288, 289; conflictivas 274-282).
- [ ] [USO DEL .EXE / USUARIO] Antes de abrirlo: `curl http://192.168.137.10:8765/meta` responde; revisar `project/SYNC-WINDOWS.md` ante pull fallido. Actualizar el token del bot en el `.env` local de Windows (el token se regeneró).
- [ ] [VERIF UI / USUARIO] Abrir `/finanzas` y `/agenda` del homelab (el trabajador verificó la API, no la pantalla; nota: la API devolvió 28 eventos con el filtro por defecto).
- [ ] [HUECO DE SYNC] Las réplicas ya habían divergido en `hojas`: ticket de diseño a definir.
- [ ] [PROCESO] Regla 1.5 del trabajador vs memoria "no hacer commits": esta sesión sí commiteó porque el ticket lo autorizaba explícitamente. Decidir si se deja como norma del ticket.
- [ ] [IDEA DE DISEÑO] Marcar certeza/estado por entrada de memoria (regla firme / preferencia / idea / en discusión), surgida de una conversación con Jarvis; evaluar con una prueba real antes de implementar.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/` (mergeada el 2026-09-30 desde `claude/busy-thompson-4nkk5c`, commit `e7fa3e0`; además trae un ajuste de contraste de los números de día del calendario de Hábitos: commit `329e978`, en la carpeta nueva).
- [x] ~~[RAMAS]~~ — todas las ramas (2 locales, 5 remotas) mergeadas y borradas el 2026-09-30; queda solo `master`.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes antes del ticket.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md`.
- [x] ~~[SEGURIDAD allowlist], [DEPLOY 2], [limpiezas README/bundle]~~ — resueltos (allowlist pendiente solo de tu confirmación).
- **Próximo objetivo inmediato recomendado:** arreglar Ollama (2 minutos, tuyo), repetir la prueba de captura pasiva y, en paralelo, pasar el ticket de tests rojos.

---

## [2026-09-30, sesión 2 — evaluador/tests/allowlist] — Señal de fallas del evaluador, tests de cableado y allowlist del bot
- **Resultado:** PARCIAL. (B) y (C) hechos y commiteados; (A) allowlist sin efecto. Sesión del trabajador cortada por límite de uso.
- **Estado del repo:** `master` sincronizada con `origin` (el usuario commiteó y pusheó). Commits: `200b1e9` (B), `480f5e0` (C), `b2445fa` ("Extras": 19 archivos de `Front-GPT/SGR`, sin secretos verificados por el orquestador; ya incluye los commits locales anteriores de docs). 398 tests backend en verde (+11).
- **Qué se hizo:**
  - (B) `jarvis/captures/passive.py::evaluate_for_capture()` distingue falla del modelo de veredicto negativo; `get_eval_health()` (contador de fallas consecutivas + último error, en memoria del proceso) se expone en `/jarvis/health` como `passive_eval`. Tests: `test_evaluate_for_capture_health.py` (6).
  - (C) `test_handle_message_register.py` (5): `handle_message()` llama a `register_telegram_message()` para texto libre y no para pasos de Finanzas/Agenda ni respuestas a propuestas.
  - (A) El token de Telegram del homelab se regeneró por BotFather (estaba inválido) y el bot arrancó. `BOT_ALLOWED_CHAT_IDS` se agregó al `.env` del homelab y se aplicó con `up -d --no-build bot worker`, pero el bot **siguió reportando "sin configurar"**: el bot sigue aceptando cualquier chat. Sin diagnosticar (el trabajador se quedó sin cuota). Hipótesis sin verificar: `docker-compose.yml` no pasa la variable al contenedor, `.env` con entrada duplicada, o `env_file` apuntando a otra ruta.
- **Observaciones del orquestador:** (1) el código de B y C **no está desplegado**: `passive_eval` en `/jarvis/health` no existe en producción hasta el próximo deploy (usar el procedimiento corregido de `HOMELAB.md`). (2) `Front-GPT/SGR/README.md:83` contiene rutas absolutas `D:\SGR\...` (regla de repo público); menor. (3) `Front-GPT/SGR/tests/.ui-bundle.mjs` es un bundle generado que ya generó ~7000 líneas de churn en el commit; candidato a `.gitignore` de ese subproyecto. (4) El token regenerado invalida el que quede en el `project/.env` local de Windows: hay que actualizarlo ahí si se usa el bot local (un solo bot activo por token).

### Pendientes activos (Arrastre):
- [ ] [SEGURIDAD — ABIERTO] `BOT_ALLOWED_CHAT_IDS` no toma efecto en el bot del homelab (repo público, el bot acepta cualquier chat). Ticket chico de diagnóstico: revisar `docker-compose.yml` (¿lista la variable en `environment:` del servicio bot?), duplicados en `.env`, `env_file`, y confirmar dentro del contenedor con `docker-compose exec bot env`. Plan de vuelta: quitar la variable y repetir `up -d --no-build bot worker`.
- [ ] [DEPLOY 2 / HOMELAB] Desplegar B (`passive_eval` en `/jarvis/health`) con el procedimiento corregido de `HOMELAB.md` (tar con exclusiones; NO `scp -r`), backup previo de `app.db` y verificación de conteos antes y después. Juntar con el fix de A si implica cambios de código/compose.
- [ ] [VERIF PROD / USUARIO] Resultado de la prueba de captura pasiva (Ollama reiniciado): ¿llegó "¿Guardo esto en tu memoria?"? Una vez desplegado B, mirar `passive_eval` en `/jarvis/health`.
- [ ] [VERIF PROD / USUARIO] Abrir `/finanzas` y `/agenda` en `http://192.168.137.10:8765`.
- [ ] [RESCATE HOJAS / USUARIO] Revisar `project/database/backup-incidente-20260930/reporte-rescate-hojas.md` y decidir qué hojas rescatar (solo-Windows 233, 238, 284, 287, 288, 289; conflictivas 274-282); ticket posterior.
- [ ] [USO DEL .EXE / USUARIO] Antes de abrirlo: `curl http://192.168.137.10:8765/meta` responde; revisar `project/SYNC-WINDOWS.md` ante un pull fallido. Actualizar el token del bot en el `.env` local si corresponde.
- [ ] [HUECO DE SYNC] Las réplicas ya habían divergido en `hojas`: el sync no reconcilia IDs independientes. Ticket de diseño a definir.
- [ ] [PROCESO] Alinear `PROMPT-MAESTRO-TRABAJADOR` (Regla 1.5, commits directos) con la memoria "no hacer commits": el trabajador volvió a no commitear por eso. Decidir cuál gana.
- [ ] [LIMPIEZA MENOR] `Front-GPT/SGR/README.md:83` (rutas absolutas) y `.ui-bundle.mjs` generado versionado.
- [ ] [FRONTEND] Evaluar `Front-CLAUDE/` y `Front-GPT/`; decisión de producto del usuario.
- [ ] [REFACTOR / LIMPIEZA] Imports huérfanos de `project/app/main.py:29-31` y variables muertas en `crud.py`; re-correr pyflakes antes del ticket.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md`.
- [x] ~~[COMMITS], [PUSH], [TEST GAP], [TICKET CANDIDATO evaluador mudo]~~ — resueltos (código de B pendiente de deploy).
- **Próximo objetivo inmediato recomendado:** ticket de diagnóstico de la allowlist (A) junto con el deploy 2, y cerrar la verificación de producción de la captura pasiva.

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
