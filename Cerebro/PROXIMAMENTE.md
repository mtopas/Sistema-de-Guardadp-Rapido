# Próximamente

Ideas anotadas para evaluar/diseñar más adelante — no aprobadas, no implementadas. Formato libre, se promueven a una propuesta formal en `decisiones-implementacion.md` cuando se retoman.

---

## Extender automáticamente la ventana de recurrencia de tareas

**Fecha:** 2026-09-21

**Contexto:** al implementar recurrencia de tareas (`agenda_tareas.se_repite`/`regla_repeticion`/
`serie_id`, ver `Cerebro/estado-actual.md`), se generan las ocurrencias reales de una sola vez
al crear la tarea, dentro de una ventana acotada (diario 60 días, semanal 12 semanas, mensual 12
ocurrencias) — sin ningún job que la extienda con el tiempo. Si una tarea recurrente sigue
activa después de esa ventana, hoy hay que recrearla a mano.

**Sin diseñar**: ¿un paso más en `run_consolidation()`/un job aparte que, para cada `serie_id`
cuya última ocurrencia generada esté por vencer, genere el siguiente lote? ¿O alcanza con que el
usuario la recree cuando se acabe, dado que son recurrencias de uso personal (no builds/cron
crítico)? También queda sin resolver "editar esta ocurrencia vs. toda la serie" (mismo problema
que ya señaló la auditoría externa para eventos, RFC 5545 completo) — hoy cada ocurrencia
generada es una tarea independiente, editarla o borrarla no afecta a sus hermanas ni a la
cabeza, lo cual es simple pero no permite "cambiar el horario de todos los martes de acá en
adelante" en una sola acción.

---

## Auditoría de otro modelo de IA (2026-09-21, catálogo de features) — visión de largo plazo, no una propuesta a implementar

**Fecha:** 2026-09-21

**Contexto:** el usuario le pidió a otro modelo de IA un "catálogo de features y visión de
producto" para evolucionar SGR hacia un asistente tipo JARVIS (Mission Control, memoria
verificable con procedencia, motor de acciones con aprobación/verificación, entidad "Misión"
que cruza todos los módulos, Telegram como bandeja de aprobaciones, Home Assistant como capa
física, modo sombra antes de proactividad real). Documento completo compartido con el
orquestador y resumido en el chat — el archivo original
(`SGR-JARVIS-Catalogo-de-Features-2026-09-21.md`) es visión, no un plan aprobado.

**Por qué queda acá y no como propuesta**: es un documento de dirección a 1-2 años (roadmap de
6 fases, desde "confianza operativa" hasta "JARVIS ambiental" con voz por habitación), no algo
para implementar ahora. El propio documento asume como prerrequisito (Fase 0) cerrar los riesgos
de la auditoría técnica anterior (ver la entrada de arriba, "Roadmap de 90 días").

**Si se retoma en el futuro**: el primer "vertical slice" concreto que proponen —
**"Preparame el día"** (lee Agenda/misiones/hábitos/señales financieras/homelab, prioriza,
propone máximo 3 cambios con diff, pide aprobación, ejecuta solo lo aprobado, verifica, y recién
ahí guarda memoria) — es un buen punto de entrada acotado si algún día se decide perseguir esta
dirección: obliga a resolver memoria con procedencia, separación planificador/ejecutor/
verificador, y una bandeja de aprobaciones real, sin depender de hardware nuevo ni de voz.
Ninguna decisión tomada — queda anotado para cuando el usuario quiera evaluarlo en serio.

---

## Auditoría de otro modelo de IA (2026-09-21) — roadmap de 90 días, mayormente diferido

**Fecha:** 2026-09-21

**Contexto:** el usuario le pidió a otro modelo de IA (no esta sesión) una auditoría integral
de SGR — arquitectura, seguridad, cada módulo, homelab, Telegram — con un roadmap de 90 días.
El archivo original (`SGR-Auditoria-Siguiente-Nivel-2026-09-21.md`, en la raíz del repo, sin
commitear) se borró después de pasar esto acá, a pedido del usuario.

**Criterio de decisión (del orquestador, discutido con el usuario)**: el roadmap está escrito
con la vara de "esto va a ser un producto o va a tener equipo" — CI completo, harness de
evaluación de Jarvis con métricas F1/MRR, migrar montos a centavos, adoptar RFC 5545 para
recurrencia, arquitectura de `domain_events`/outbox unificada, Playwright E2E, etc. SGR es un
proyecto de un solo desarrollador para uso personal (ver convenciones de Git en `CLAUDE.md`:
"no hace falta esa ceremonia en un repo de un solo desarrollador"). El costo de ese nivel de
rigor no se justifica hoy porque el único usuario es quien también detecta y arregla los
problemas reales sobre la marcha (like esta misma sesión). **4 ítems baratos y de valor real sí
se extrajeron y se mandaron a implementar aparte** (ver `Cerebro/decisiones-implementacion.md`,
entrada `2026-09-21 — 4 ítems baratos de la auditoría externa`, o el handoff de la sesión que
los implemente) — el resto queda anotado acá, sin implementar, para retomar si el contexto
cambia (más usuarios, exposición pública, etc.).

**Aplicado aparte, NO en esta lista de diferidos:** allowlist de Telegram global, offline
honesto (rollback + aviso visible en vez de "guardado" falso), timezone explícita en jobs de
Telegram, `SGR_SYNC_TOKEN` obligatorio.

### Diferido — riesgo de pérdida de datos en el sync
- Reemplazar el sync "archivo completo, el que escribe último gana" (`.exe` ↔ homelab) por algo
  con precondición de versión: `GET /sync/version` con `revision` monotónico, el pull guarda
  `base_revision`, el push manda `If-Match`, `409` si la revisión remota cambió.
- Alternativa de fondo (más trabajo): outbox local con `operation_id`/idempotencia en vez de
  sincronizar el `.sqlite` completo — el `.exe` deja de tener su propia copia de la DB y pasa a
  ser un cliente más de la API vía Tailscale.

### Diferido — seguridad
- `/preview?url=` es una superficie SSRF (sigue redirects, puede pegarle a URLs internas/LAN).
- `/upload` no aplica `MAX_IMAGE_SIZE_MB` en la práctica ni verifica el contenido real del
  archivo.
- `DetailScreen.jsx` usa `dangerouslySetInnerHTML` sobre `hoja.apuntes` sin sanitizador
  visible — riesgo de XSS almacenado si algún día entra HTML no confiable (hoy el único
  "atacante" posible sería el propio usuario, pero si Telegram se abre a más gente esto importa).
  Necesitaría una librería de sanitización (allowlist de tags) + probar que TipTap sigue
  renderizando bien.
- Headers de seguridad ausentes (CSP, `X-Content-Type-Options`, `Referrer-Policy`).
- Bind de FastAPI a localhost + Tailscale Serve como proxy HTTPS, en vez de exponer `:8765`
  directo por IP Tailscale (evita depender de que nadie más entre al tailnet).

### Diferido — "offline falso" más allá del parche rápido ya aplicado
- Outbox real en IndexedDB (`operation_id`, payload, reintentos, estado, pantalla "cambios
  pendientes") — lo aplicado ahora es el parche mínimo (rollback + error visible), no esto.
- `Idempotency-Key` en el servidor para que un reintento no duplique un movimiento/registro.

### Diferido — sin red de seguridad automatizada
- Sin tests de proyecto ni de Jarvis, sin CI. Suite mínima sugerida: pytest backend (CRUD,
  migraciones, transferencias, recurrencia, hábitos, sync), Vitest + Playwright frontend, tests
  de handlers de Telegram, dataset dorado de routing/retrieval para Jarvis.
- 5 flujos E2E propuestos como primer set: Telegram registra gasto → aparece en web; tarea
  creada en web → aparece en `/hoy` → callback la completa; hábito en web → Telegram lo
  refleja; nota en Bóveda → Markdown+SQLite+búsqueda consistentes; Jarvis responde citando
  fuente válida.

### Diferido — privacidad/tamaño del repo
- `project/database/` tiene ~112 archivos versionados en git (SQLite, Chroma, datasets
  viejos) — mismo tema que venimos parchando ad-hoc dejando `app.db.bak` afuera de cada commit
  esta sesión, pero sin una limpieza de fondo del historial. Si algún día se quiere hacer
  público el repo, hace falta inventariar qué hay ahí, sacarlo del tracking, y evaluar
  reescribir historial con `git-filter-repo` (borrar el archivo en el último commit NO lo saca
  del historial).
- Backups 3-2-1 reales (hoy son manuales, timestamped, sin rotación) + restore drill
  verificado periódicamente.

### Diferido — plataforma web
- `App.jsx` carga los 5 módulos al montar, aunque el usuario solo abra uno — lazy-load por
  ruta pendiente (hoy solo Bóveda/Detalle lo tienen).
- Bundle principal ~722kB minificado (198kB gzip), warning de Vite por chunk >500kB — separar
  D3/TipTap/Jarvis en chunks explícitos.
- Store único de casi 1.700 líneas mezclando caché, mutaciones, fallback offline, UI y dominio
  — separar por módulo (`modules/boveda/api.js`+`store.js`, etc.) de forma incremental, no
  big-bang.
- PWA sigue llamándose "Bóveda — Sistema de Guardado Rápido" en el manifest.
- Permiso de notificaciones se pide al montar `TopBar`, no tras una acción del usuario (MDN
  recomienda pedirlo tras interacción).
- Accesibilidad sin auditar (focus visible, navegación por teclado, contraste) — sugiere
  Playwright + axe.

### Diferido — Bóveda
- Tres representaciones de conocimiento conviviendo sin regla clara: Markdown en `D:\Boveda`,
  índice `categorias/hojas` en `app.db`, y DOS colecciones semánticas separadas
  (`app/semantic.py` de SGR y `jarvis_memory` de Jarvis) — un buscador híbrido único
  (FTS5 + embedding + recencia) resolvería inconsistencias entre `/buscar`, `/pregunta` y `/jq`.
  Versión chica de este problema (de `Testeos-Ollama.md`, 2026-06-07, verificado que sigue
  igual el 2026-09-24): `/pregunta` del bot (RAG) y `/buscar` (keyword) son mecanismos
  totalmente independientes — si el RAG no encuentra nada, `/pregunta` no cae a `/buscar` como
  fallback, aunque el contenido sí exista por texto exacto.
- Cada `GET` de Bóveda puede recorrer el vault completo (`rglob`) — mover la indexación a un
  watcher/poller fuera del request, con tabla de estado (`archivo, hash, mtime, último error`).
- Historial de notas aprovechando que la Bóveda ya tiene Git propio (diff, restaurar versión) —
  en vez de inventar una tabla `hojas_revisiones` nueva.
- Bandeja de entrada explícita para `00 - Sin categorizar` con acciones rápidas (archivar,
  unir duplicados, convertir en proyecto/persona) — parcialmente cubierto ya por el triage
  automático de Jarvis, pero sin UI web dedicada.
- Links internos estables por `vault_id` en vez de ID autoincremental del índice.
- **De `AGREGAR-CORREGIR.txt` (2026-06-20, migrado al borrar ese archivo):**
  - Click derecho en una categoría hoy expande la categoría Y abre una hoja asociada al mismo
    tiempo — comportamiento confuso, debería ser una sola acción a la vez.
  - Breve descripción/preview debajo del título de cada hoja en el listado de una categoría
    (hoy solo se ve el título como link).
  - Más utilidades/interactividad en el grafo de la Bóveda (más allá del zoom/pan ya evaluado
    como quick win en el informe de julio).
  - Al crear una hoja tipo link, usar como título el que se extrae de la metadata del link
    (hoy existe algo de extracción de preview en `POST /hojas` — sin confirmar si ya se usa
    como título real de la hoja o solo para la vista previa).

### Diferido — Finanzas
- Montos como `REAL`/float — migrar a enteros (centavos) para evitar error de redondeo
  acumulado. Esfuerzo grande (toca todo el módulo), no se justifica sin evidencia real de que
  ya está pasando.
- `transfer_group_id` con ambos lados de una transferencia en una sola transacción SQL, en vez
  de dos movimientos independientes vinculados solo por convención.
- Reconciliación de importaciones CSV: staging antes de confirmar, matching, detección de
  duplicados con score.
- Presupuesto mensual por categoría, gastos recurrentes como entidades (no inferidos por
  texto), forecast 30/60/90 días.
- Reglas de clasificación personales entrenables antes de recurrir al LLM en cada captura.
- **De `Testeos-Ollama.md` (2026-06-07, migrado al borrar ese archivo — los otros hallazgos ya
  se arreglaron, ver `Cerebro/estado-actual.md` 2026-09-24):** `/objetivo` en el bot muestra
  "ahorrado" negativo como una barra de progreso confusa (más de 10 bloques de retroceso) en
  vez de algo tipo "Retiros netos: $X" — verificado que sigue así el 2026-09-24.
- ~~**Cuadro de filtros en la tab Datos**~~ **Implementado, 2026-09-24** (sesión
  "ArreglosFront-Finanzas/Agenda") — `filtrarMovimientos()` en `data/finanzas.js` + UI en
  `DatosTab.jsx` (categoría, cuenta, tipo, rango de fechas). Ver `Cerebro/estado-actual.md`.
- **De `AGREGAR-CORREGIR.txt` (2026-06-20, migrado al borrar ese archivo):**
  - "Indicadores del mes" en el Dashboard (grilla de 4 KPIs: gasto promedio diario, categoría
    top, tasa de ahorro, días sin gastar) — al usuario le sigue pareciendo poco útil/feo
    visualmente (confirmado 2026-09-24), sin definir todavía qué lo reemplazaría. No se tocó:
    decisión de diseño pendiente, no un bug.

### Diferido — Agenda
- Recurrencia con JSON propio en vez de RFC 5545 (`RRULE`/`EXDATE`/`RECURRENCE-ID`) — el
  patrón de excepciones de Facultad (implementado 19/09) es un antecedente parcial, pero
  generalizarlo a RFC 5545 es un cambio de fondo.
- Notificaciones fragmentadas entre polling web y jobs del bot — tabla `scheduled_notifications`
  + outbox de entrega unificada, con reintentos y dead-letter visible.
- De "plan" a "ejecución real": botón iniciar/finalizar bloque, tiempo real vs. planificado en
  la Revisión semanal.
- Vínculos reales entre módulos (tarea "Pagar tarjeta" ligada a una obligación financiera
  concreta, evento ligado a una nota por `vault_id`).
- ~~**Crear/editar/borrar calendario desde la UI**~~ **Implementado, 2026-09-24** (sesión
  "ArreglosFront-Finanzas/Agenda") — `CalendarioModal.jsx` + `PATCH
  /agenda/calendarios/{id}/reasignar-eventos` para el caso "mover eventos al borrar". Ver
  `Cerebro/estado-actual.md`.
- **De `AGREGAR-CORREGIR.txt` (2026-06-20, migrado al borrar ese archivo):**
  - Horario Facultad: los campos "Aula / descripción" y "Materia" se salen de su contenedor
    (overflow CSS) — sin verificar si sigue así.
  - Poder elegir un color por materia en Horario Facultad.
  - ~~Si cambiás el calendario de un evento ya creado, el color en la vista no se
    actualiza.~~ **Arreglado, 2026-09-24** — `updateAgendaEvento` en el store no recalculaba
    `calendario_color`/`calendario_nombre` al cambiar `calendario_id`.
  - Vista mensual: se ven 6 semanas en vez de 5 (aparece una semana entera del mes siguiente
    de más) — sin verificar si sigue así.
  - Rueda del mouse para desplazarse de mes en la vista mensual.
  - Poder elegir un color propio por evento, distinto (opcional) del color del calendario.
  - Resaltado más visible del día de hoy en la vista mensual (ej. círculo).
  - "Próximos eventos" debería ordenarse del más cercano al más lejano.
  - ~~El tick/check del calendario no está centrado (CSS, cosmético).~~ **Arreglado,
    2026-09-24.**
  - Bot `/dia <fecha>`: reporte de que devolvía "Sin eventos"/"Sin tareas" con una fecha
    explícita aunque había datos reales — sin verificar si sigue. Pedido de cambiar el formato:
    `/dia dd` busca ese día en el mes actual, `/dia dd-mm-aaaa` para otras fechas.

### Diferido — Hábitos
- Motor de hábitos único en backend (`is_scheduled`, streak, stats) — hoy la lógica está
  duplicada entre frontend/backend/bot.
- Versionar la programación (`habit_schedule_versions` con `effective_from/to`) para que editar
  la frecuencia hoy no reinterprete el historial pasado con la regla nueva.
- Más tipos de hábito además de binario/parcial: conteo, duración, rango (ánimo 1-5), objetivo
  semanal.
- Pausas/excepciones explícitas (vacaciones, "saltar con razón" distinto de fallar).

### Diferido — Jarvis
- Evaluation harness real: dataset versionado (routing, RAG con fuentes esperadas,
  same_fact/contradiction, privacidad, propuestas), métricas (F1, recall@5/MRR, groundedness,
  tasa de aceptación de propuestas, latencia, costo) — hoy la validación es manual, sesión por
  sesión, contra datos reales. Es la pieza más grande y la que más tardaría en pagarse sola,
  pero también la que más se nota que falta cuando algo se rompe silenciosamente.
- Citas a nivel de afirmación (no solo "estas son las fuentes" sino qué fragmento respalda qué
  frase puntual), con "no lo sé" explícito si no hay evidencia suficiente.
- Brief diario y revisión semanal cross-módulo (agenda + hábitos + finanzas + Bóveda por
  clasificar) — el LLM redacta sobre un JSON agregado determinístico, no calcula totales él
  mismo. Mismo concepto que "Fase 6" de `PLAN-NEXTLEVEL.md` (2026-06, migrado acá al borrar ese
  archivo): `GET /resumen/semanal?desde=&hasta=` agregando Agenda (`/agenda/revision`) +
  Finanzas (`/fin/movimientos/resumen`) + Hábitos (registros/rachas 7 días) + Bóveda (hojas de
  la semana); comando `/semana` en el bot; sección con botón "Regenerar" en `RevisionTab`.
- Panel de calidad/operación (salud de Ollama, backlog de jobs, cobertura de embeddings,
  presupuesto, última consolidación).
- Dividir `audit/service.py` y `consolidation.py` (ya grandes) por caso de uso: mantenimiento,
  no funcionalidad nueva.

### Diferido — Homelab
- Red directa (gabinete al router/switch, sin depender de ICS de Windows) — la mitigación
  actual (watchdogs) funciona pero sigue siendo un parche sobre una topología frágil.
- Health checks reales (`/health/live`, `/health/ready`, `/health/deps`) + `depends_on:
  condition: service_healthy` en el compose (hoy Docker solo espera a que el contenedor esté
  *corriendo*, no a que la app esté lista).
- Estado del bot (`chat_id.json`, `checkin_config.json`, etc.) vive en archivos dentro de un
  mount read-only (`./mybot:/app/mybot:ro`) — los errores de escritura se silencian, cambios de
  `/checkin`/`/notif_*` podrían no persistir en Docker. Mover a `app.db`/`jarvis.db`.
- Deploy reproducible: Dockerfile multi-stage (Node adentro, no depender de un `dist/`
  buildeado a mano localmente), build context explícito, tag por commit SHA — hoy el proceso es
  literalmente `scp`/`tar` manual cada vez (documentado en `HOMELAB.md`, funciona pero es 100%
  manual).
- Observabilidad mínima: logs estructurados, rotación, alguna señal tipo Uptime Kuma.

### Diferido — Infraestructura / distribución para terceros

**Fecha:** 2026-09-24 (migrado de `PLAN-NEXTLEVEL.md` — "Fase 2", mayo 2026 — al borrar ese
archivo por estar mayormente superado; esta fase seguía sin implementar)

Distinto del punto de "Deploy reproducible" de Homelab de arriba (ese es sobre *tu* homelab
real): esto es sobre que un tercero pueda correr SGR sin tocar nada a mano —
`git clone` → `cp .env.example .env` (editar token) → `docker-compose up -d` → sistema
funcionando. Requiere `Dockerfile` para backend (FastAPI+uvicorn), frontend (multi-stage:
build Vite → nginx sirviendo `dist/`) y bot (Python); `docker-compose.yml` con los 3 servicios
+ perfil opcional `ollama`; volúmenes para `database/`/`uploads/` fuera de los containers;
`README.md` raíz orientado al instalador (3 comandos, screenshot, badge de licencia). Solo
tiene sentido si en algún momento se decide priorizar distribución a terceros — hoy nadie más
corre SGR.

### Diferido — Notificaciones unificadas

**Fecha:** 2026-09-24 (migrado de `PLAN-NEXTLEVEL.md` — "Fase 3", mayo 2026 — al borrar ese
archivo por estar mayormente superado; esta fase seguía sin implementar)

Es la idea que más se repite en los documentos de auditoría externa de esta semana (aparece
también en el roadmap de 90 días diferido más abajo) — sistema de alertas cross-módulo
entregado por dos canales: campana web en TopBar y mensajes Telegram. Diseño propuesto:

- Tabla unificada `notificaciones_pendientes(id, modulo, ref_id, tipo, fire_at, canal,
  enviado, payload_json)`.
- `POST /notificaciones/evaluar` regenera alertas de Finanzas e inserta recordatorios de
  hábitos/agenda; scheduler como servicio Docker o `lifespan` FastAPI (`asyncio.sleep(60)`).
- Entrega Telegram: job del bot que consulta `GET /notificaciones/pendientes?canal=telegram`
  cada minuto, con inline keyboards ✅ Hecho / 🕐 Posponer / 📖 Abrir en web.
- Campana web: `GET /notificaciones/pendientes?canal=web`, store con `notificaciones[]` +
  `fetchNotificaciones()` + `marcarLeida(id)`, toggles por canal en `/settings`.
- Cubriría: recordatorios de hojas (Bóveda), alertas financieras (Finanzas), eventos/tareas/
  revisión (Agenda), hábito con hora + racha en riesgo (Hábitos) — hoy la única "campana" real
  es un badge sin handler en Finanzas.

### No conviene hacer (según la auditoría, y coincide con el criterio de esta sesión)
Migrar a PostgreSQL, microservicios, sync bidireccional de SQLite completo, más agentes
autónomos antes de medir Jarvis, actualizar todas las libs (React/Tailwind/Zustand) de una,
habilitar Tailscale Funnel, tratar Chroma como fuente de verdad respaldable.

---

## Ingestión de Agenda: que Jarvis también vea tareas pendientes a corto plazo, no solo completadas

**Fecha:** 2026-09-19

**Contexto:** el usuario preguntó por qué el reporte diario mostraba "1 tareas completadas
revisadas" cuando hay otras tareas sin completar en su Agenda. Se investigó y confirmó (ver
`Cerebro/decisiones-implementacion.md`, entrada `2026-09-19`) que **no es un bug** —
`run_agenda_ingestion()` (`jarvis/ingestion/agenda.py`) excluye tareas pendientes a propósito
desde el diseño original del 03/09: solo ingiere hechos ya cerrados (eventos pasados, tareas
completadas), nunca el to-do abierto, que vive en Agenda misma.

**Pedido nuevo del usuario**: quiere que Jarvis también tenga visibilidad de sus **tareas a corto
plazo** (pendientes, no completadas) — no necesariamente para "recordarlas como hecho" igual que
una tarea cerrada, sino para que el asistente sepa qué tiene por delante al conversar/responder
(ej. si le preguntás "¿qué tengo pendiente esta semana?" o si el contexto de una respuesta debería
tener en cuenta que hay un parcial por rendir).

**Sin diseñar todavía — preguntas a resolver cuando se retome:**
1. ¿Esto es una ingestión más (con su propia propuesta de captura, como las completadas) o algo
   más liviano tipo "contexto de solo lectura" que el retriever consulte en vivo sin pasar por
   `jarvis_capture_proposals` ni `memory_entries` (evitar duplicar el estado — la tarea YA vive en
   Agenda, ¿hace falta una copia en la memoria de Jarvis?)?
2. Si se guarda como memoria: ¿qué pasa cuando la tarea se completa o se borra después? Necesitaría
   algún mecanismo de actualización/expiración que hoy no existe para este tipo de contenido
   (`agenda_eventos`/`agenda_tareas` sí tienen estado vivo en `app.db`; una copia en `memory_entries`
   quedaría desactualizada sola).
3. Ventana de "corto plazo" — ¿cuántos días hacia adelante? `JARVIS_AGENDA_INGESTION_WINDOW_DAYS`
   (hoy 7 días, hacia atrás) es el precedente más cercano, pero es para lo ya pasado, no para lo que
   viene.
4. Relación con el retriever (`jarvis/retriever/`) — si la idea final es "que el asistente lo sepa
   al responder" más que "que quede en la memoria persistente", tal vez la solución correcta ni
   siquiera pase por ingestión sino por sumar una consulta en vivo a `agenda_tareas`/`agenda_eventos`
   como contexto adicional del chat, sin tocar `memory_entries` para nada.

---

## Pendiente real tras el deploy de la fusión Bóveda-Jarvis (2026-09-15)

Ninguno de estos ítems está implementado. Se registran acá para no perderlos — vivían solo en
la conversación que armó/desplegó `D:\Boveda`. Promover a `decisiones-implementacion.md` cuando
se retome cada uno.

1. ~~**Jarvis no ingiere el contenido ya existente de `D:\Boveda` en su propia memoria.**~~
   **Implementado y corrido contra el homelab real, 2026-09-15** — `jarvis/cli/backfill_vault_content.py`,
   74 notas reales indexadas, confirmado con una consulta real a Jarvis citando fuentes reales.
   Ver `Cerebro/estado-actual.md`. Sigue sin resolver la pregunta de fondo: no se decidió si
   `mybot/assistant.py::_gather_boveda()` (RAG de SGR) y el RAG propio de Jarvis
   (`jarvis/retriever/`) deberían unificarse, mantenerse separados a propósito, o preferir uno sobre
   el otro según el tipo de pregunta — hoy conviven sin ninguna regla que los distinga.
2. **Triage automático del Inbox** — el worker sugiriendo por Telegram dónde archivar lo que queda
   en `00 - Sin categorizar/`. Se diseñó y se aprobó en la conversación original, nunca entró en el
   alcance de ningún milestone implementado.
3. **Editor de SGR sigue produciendo HTML, no Markdown nativo.** Milestone 2 solo agregó la
   conversión HTML↔Markdown en el backend (`app/vault/markdown.py`) para que el archivo en disco
   quede limpio; el editor TipTap del frontend nunca se tocó (estaba explícitamente fuera de
   alcance). La experiencia "Typora-style" (WYSIWYG rindiendo Markdown real en vivo) que se discutió
   no está implementada en la UI.
4. **Política de limpieza de `05 - Basura/` sin cerrar** — ¿se vacía sola por antigüedad, o la
   revisás vos a mano? Quedó abierto más de una vez en la conversación, nunca se decidió.
5. **Agenda de SGR queda explícitamente fuera de esta fusión** — nunca se migró a archivo, sigue
   con `crud.py`/SQLite sin cambios. Es el módulo más complejo (recurrencia, time-blocking, ICS),
   pospuesto a propósito hasta que Bóveda+Jarvis funcionen bien en el día a día.
6. **Grafo/relaciones al estilo Obsidian en SGR** — extender `NetworkGraph.jsx` con aristas por
   `[[wikilinks]]` reales (no solo jerarquía de categorías), backlinks, hover preview. Deferred
   desde el principio del diseño, a propósito — ítem de roadmap propio, no bloqueante.
7. ~~**Fixes de empaquetado del `.exe`**~~ **Confirmado y recompilado desde `master`, 2026-09-15**
   — build limpio sin el error de `tiktoken_ext` (la causa real era compilar con el Python global en
   vez de `project/venv`, no un bug del propio fix).
8. ~~**Merge de `feature/boveda-jarvis-fusion` a `master`**~~ **Hecho, 2026-09-15** — fast-forward,
   sin conflictos, pusheado a `origin/master`.

---

## Vault centralizado (Obsidian) como fuente de lectura para Jarvis

**Estado: implementado y desplegado (2026-09-15)** — ver `Cerebro/decisiones-implementacion.md`
(entrada `2026-09-11 — PROPUESTA APROBADA...`) y `Cerebro/decisiones/`. La idea de abajo (2026-09-07)
es el borrador original que se promovió a diseño formal; queda como referencia histórica de cómo
arrancó, no como estado real actual — para eso, ver la entrada de `decisiones-implementacion.md`.

**Fecha:** 2026-09-07

**Idea:** el usuario quiere un "cerebro"/bóveda centralizada en Markdown que junte proyectos, memorias, contenidos, cursos, etc. de todos sus proyectos (no solo SGR), curada a mano en Obsidian (links, wikilinks, grafo). Quiere que Jarvis pueda leer ese contenido. Más adelante, la Bóveda del propio SGR también debería poder acceder a lo mismo.

**Contexto relevante ya existente:**
- Jarvis ya tiene su propio vault interno (`jarvis/vault/`, `JARVIS_VAULT_PATH`) que el sistema **escribe** (una nota `.md` por `memory_entry`, con wikilinks reales a entidades/proyectos vía `jarvis/vault/index_writer.py`). Ese vault es una proyección de `jarvis.db`, no la fuente de verdad.
- En la sesión "Jarvis 0.2→0.3" (2026-09-03) se armó la propuesta de Ingestión Automática y se descartó explícitamente "documentos/archivos locales" como fuente para esa primera iteración, dejando anotado que "el alcance de lectura no está acotado todavía, necesita su propia sub-propuesta" (ver `Cerebro/estado-actual.md`, sesión 0.2→0.3). **Esta idea es esa sub-propuesta.**

**Dirección de diseño discutida (sin comprometer nada todavía):**
- Vault centralizado del usuario = fuente de **lectura**, separada físicamente del vault interno que Jarvis ya escribe — nunca escribir directo ahí, para no pisar la curación manual del usuario.
- Mismo patrón que la ingestión de Agenda (0.3): Jarvis lee, arma propuestas en `jarvis_capture_proposals` (o similar), el usuario aprueba/rechaza por Telegram/desktop — nunca escritura directa a `memory_entries`.
- Contenido leído del vault personal pasa por el mismo gateway de PII (`jarvis/privacy/gateway.py`) antes de tocar un LLM externo — un vault de años puede tener cualquier cosa, no hay razón para tratarlo distinto a otras fuentes.
- Trade-off reconocido: lectura pasiva + aprobación humana es seguro pero no da absorción en tiempo real; cada nota nueva se propone, no se integra sola.

**Pendiente de decidir cuando se retome:**
1. Dónde vive físicamente el vault centralizado — ¿reemplaza/es el vault personal actual del usuario en Obsidian, o es una carpeta nueva separada que Jarvis apunta vía config (`JARVIS_EXTERNAL_VAULT_PATH` o similar)?
2. Alcance de lectura inicial: ¿todo el vault desde el día uno, o se arranca acotado (una subcarpeta, un tipo de nota) como se hizo con Agenda arrancando por una sola fuente?
3. Cómo evitar duplicar/pisar el propio vault interno de Jarvis si en algún punto conviven en la misma carpeta raíz de Obsidian (hoy son conceptualmente distintos: uno lo escribe el sistema, el otro lo escribe el usuario).
4. Integración con la Bóveda de SGR (módulo `/` del frontend) — consumidor futuro del mismo store, diseño explícitamente diferido a después de que la pieza de Jarvis exista.
