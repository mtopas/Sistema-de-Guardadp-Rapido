# Handoff General — 2026-09-19

Continuación directa de `GENERAL_HANDOFF_2026-09-18.md`. Sesión larga, foco en Agenda (Bóveda
vacía real, Horario Facultad, canvas de listas de Tareas), un bug real recurrente de Jarvis
(loop de huecos de entidad), y herramientas de desarrollo (`seed_demo.py`).

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Diagnóstico + fix: Bóveda aparecía vacía en el homelab** — verificado, commiteado y
  desplegado (`79787a3`).
  → No era un lock de SQLite (hipótesis inicial descartada con evidencia) sino un
  `UNIQUE constraint failed: hojas.ruta` real: `jarvis/vault/index_writer.py` reescribe las
  fichas de entidad/proyecto sin campo `id:` en el frontmatter, así que
  `app/vault/parser.py::assign_missing_id()` le asignaba un UUID random en cada regeneración,
  chocando contra la fila vieja indexada con el UUID anterior. Fix de dos partes: `id:` estable
  en `index_writer.py` (reusa `entity_id`/`project_id`) + `sincronizar_vault()` blindado con
  try/except por nota (antes, una sola nota en este estado tumbaba TODA la sincronización).
  Usuario confirmó visualmente que la Bóveda volvió a verse bien.
- **Investigación + implementación (fork, worktree aislado): Horario Facultad** — verificado,
  commiteado y desplegado (`f9d6277`, mergeado con canvas en `e597154`).
  → Limpieza de las 4 materias de datos de prueba de `seed_demo.py` que habían quedado en el
  `app.db` real; bloque de Facultad en HOY ahora clickeable (menú: "Eliminar por este día" =
  excepción puntual por fecha en tabla nueva `agenda_horario_facultad_excepciones`, sin tocar
  el horario semanal — y "Editar horarios de facultad"); indicador de Facultad en la grilla
  mensual (antes solo se veía en Mes→Semana); color por materia (columna nueva, picker
  reusando la paleta de Listas de Tareas); modal +30% y fix de un overflow real de CSS; layout
  de Mes rediseñado (se sacó el `MiniCalendar` redundante del panel izquierdo, el panel derecho
  de "próximos eventos" pasó de columna lateral a franja debajo del calendario). **Pendiente:
  el usuario nunca confirmó visualmente este layout nuevo de Mes** (a diferencia del fix de
  Bóveda, que sí confirmó) — ninguna de las dos sesiones pudo verificar en navegador real
  (Chrome deshabilitado en esas sesiones).
- **Investigación + implementación (fork, worktree aislado): vista canvas de listas en Tareas**
  — verificado, commiteado y desplegado (`97b2a7f`, mergeado en `e597154`, un conflicto chico
  en `TareasTab.jsx` resuelto a mano por el orquestador).
  → Toggle Lista/Canvas, tarjetas por lista con pin (columna `pinned` nueva en `agenda_listas`),
  quick-add por tarjeta, "Sin fecha" como tarjeta de solo lectura (sin pin, sin quick-add, es un
  filtro virtual no una lista real). Decisiones tomadas por el worker sin poder preguntar
  (worktree en background) documentadas explícitas en su reporte, revisadas y aceptadas por el
  orquestador. **Mismo pendiente que arriba: sin confirmación visual del usuario todavía.**
- **Investigación + fix: loop de re-propuesta de "hueco de entidad" (Jarvis)** — verificado,
  commiteado y desplegado (`c2bf929`, doc en `c8ad900`).
  → Bug real y recurrente: aceptar una propuesta `create` de hueco de entidad (caso real:
  Robert Kiyosaki) nunca marcaba la entrada resultante como `PEOPLE`/`subject` — quedaba
  `SEMANTIC`/`mentioned` vía clasificación genérica, así que `_detect_entity_gaps()` nunca
  consideraba el hueco resuelto y lo volvía a proponer cada corrida diaria, generando una
  entrada duplicada y un mensaje de Telegram nuevo cada ~24hs indefinidamente. Fix: columnas
  `pinned_type`/`pinned_subject_entity_id` en `memory_entries` para que `_apply_create()` fuerce
  el tipo/relación correctos sin depender del LLM. Limpieza en el homelab real (con backup):
  propuesta duplicada rechazada, entrada original de Kiyosaki backfilleada. Confirmado que era
  la única entidad afectada.
  → **De paso, mismo pedido del usuario**: reporte diario de consolidación rediseñado — pasa de
  varios mensajes largos (llegó a 37 en un caso real, documentado el 17/09) a un resumen de
  **una sola tanda, máximo 9 líneas**; las preguntas de sí/no de esa corrida ahora se mandan
  DESPUÉS del resumen, no antes (alcance confirmado explícitamente con el usuario: solo aplica
  a la corrida diaria, el resto del día Jarvis sigue preguntando en el momento como siempre).
  → Investigado sin cambios de código: "¿la ingestión de Agenda leyó las tareas pendientes?" —
  confirmado que es diseño a propósito (solo ingiere tareas ya completadas, nunca el to-do
  abierto). Idea anotada en `Cerebro/PROXIMAMENTE.md` (commit `5b05794`) para que Jarvis vea
  también tareas a corto plazo en el futuro — sin diseñar, con las preguntas abiertas
  explícitas (¿ingestión nueva o consulta en vivo sin duplicar estado? ¿cómo manejar que la
  tarea cambie/se complete después?).
- **Investigación + reescritura completa: `project/seed_demo.py`** — verificado, commiteado y
  pusheado (`e213916`). Es una herramienta de desarrollo, **nunca se despliega al homelab**.
  → Hallazgo grande no anticipado: todo el archivo (615 líneas) estaba envuelto en un único
  docstring sin cerrar — el script no hacía absolutamente nada al correrlo, sin error ni
  output, hace quién sabe cuánto tiempo. Reescrito como módulo ejecutable real. `DB_PATH`/
  `VAULT_ROOT` ahora respetan las variables de entorno (antes `DB_PATH` estaba hardcodeado);
  `VAULT_ROOT` se niega a arrancar si no está seteada explícitamente (asimetría a propósito:
  `DB_PATH` sí conserva su default a la DB real, uso legítimo ya documentado). `seed_boveda()`
  reescrito de cero — insertaba filas SQL directo en `categorias`/`hojas`, que desde la fusión
  Bóveda-Jarvis son un índice que se reconstruye solo desde archivos reales; ahora escribe
  notas `.md` reales con el mismo helper que usa `POST /hojas`, verificado que sobreviven un
  sync real. Finanzas: sacado el modelo legacy "Ahorro"/"Emergencia" genérico, alineado al
  modelo real de objetivos+categoría homónima+`FIRE`. Bug de orden de FK en `clear_all()`
  encontrado y corregido (nunca se había detectado porque el script nunca corrió de verdad).
- **Instalación de Tailscale + acceso remoto al homelab** (sesión anterior, 17/09) — ya cerrado,
  sin novedades esta sesión salvo una pregunta informativa del usuario (confirmado que también
  puede abrir `http://100.117.86.117:8765` desde su PC, no solo la laptop, porque ya está en el
  mismo tailnet).
- **Prompt para otra IA: implementar un tema nuevo de colores** — entregado, sin código propio
  de esta sesión. Investigado `frontend/src/utils/themes.js`/`tailwind.config.js` para dar
  reglas exactas (estructura de `THEMES`, `OPTIONAL_THEME_VARS`, que agregar una entrada alcanza
  sin tocar otros archivos).
- **Prompt para otra IA: correr `seed_demo.py` sin tocar datos reales** — entregado dos veces
  (versión vieja con copia de carpeta completa, antes del fix; versión corta con
  `DB_PATH`/`VAULT_ROOT` después del fix de arriba).

## Pendiente / bloqueado

- **Confirmación visual del usuario, Horario Facultad + canvas de listas** — ninguna de las dos
  sesiones que implementaron esto pudo verificar en navegador (Chrome deshabilitado). El
  usuario todavía no dijo si lo probó. Es lo primero a preguntar en la próxima sesión si no lo
  menciona solo.
- **`project/frontend/dist/` sigue trackeado en git** desde el primer commit del repo
  (`.gitignore` solo excluye `project/dist/`, el del `.exe`). Cada build deja diff de ruido.
  Sigue sin resolver, es decisión del usuario si se agrega a `.gitignore`.
- **Diseño sin implementar: "pizarra" de referencia rápida (inspirado en Google Keep)** — sigue
  exactamente igual que en el handoff del 18/09, sin avance. Ver esa entrada para el detalle
  completo (HOY/Tareas ya cubiertos por Agenda; falta diseñar la parte de referencia rápida sin
  fecha, tipo board).
- **Watchdog de Tailscale (`tailscaled`) sin instalar** — mismo pendiente del 17/09, sin avance.
- **`[semantic] backfill omitido: UNIQUE constraint failed: hojas.ruta`** (hallazgo del 18/09) —
  probablemente resuelto como efecto colateral del fix de `index_writer.py`/`sincronizar_vault()`
  de esta sesión (la única causa conocida de colisión de `ruta` era exactamente ese bug), pero
  **no se re-verificó explícitamente que el mensaje dejó de aparecer** — confirmarlo antes de
  darlo por cerrado del todo.
- **Idea anotada, sin diseñar: que Jarvis vea tareas de Agenda a corto plazo (no solo
  completadas)** — ver `Cerebro/PROXIMAMENTE.md`, entrada `2026-09-19`, con las preguntas
  abiertas explícitas.
- **`maybe_ask_open_question()` no reordenado** — decisión consciente de no bloquear el resto
  del batch del reporte corto; si el usuario también lo quiere después del resumen, es un
  cambio chico aparte.
- **`Consolidacion.txt`** en la raíz — se siguió usando activamente esta sesión como evidencia
  real (el reporte de hoy con el loop de Kiyosaki). Puede borrarse cuando el usuario quiera, ya
  no hace falta conservarlo.

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- **Trabajo en paralelo sobre el mismo módulo (Horario Facultad + canvas de listas, ambos
  tocando `TareasTab.jsx`)** se resolvió con una sesión en worktree aislado (`isolation:
  "worktree"` del Agent tool) para la de canvas, mientras la de Facultad trabajaba directo en
  el working directory principal — evita que dos sesiones en paralelo se pisen archivos en vivo.
  El orquestador mergeó ambas ramas a mano al terminar (un conflicto chico, resuelto sin
  drama). Repetir este patrón si vuelve a haber trabajo genuinamente paralelo sobre el mismo
  módulo.
- **Sesiones que tocan solo herramientas de desarrollo (`seed_demo.py`, scripts que nunca se
  despliegan) reciben más margen de decisión** — no hace falta el ida-y-vuelta de "investigá,
  preguntá, esperá aprobación" tan estricto como con código de producción/Jarvis, dado que el
  blast radius es mucho menor (nunca toca datos reales si se usa como está documentado, nunca
  se despliega al homelab).
- **Los agentes en background a veces se cortan por límite de uso de la cuenta** (rate limit,
  resetea a una hora fija) — no es un error del trabajo, se resuelve reanudando el mismo agente
  con `SendMessage` una vez pasado el reset, pidiéndole que confirme su propio estado real
  (`git status`/`git diff`) antes de asumir qué le faltaba, en vez de fiarse de su memoria de la
  conversación cortada.

## Estado del working tree al momento de este handoff

`master`, todo lo de arriba commiteado y pusheado a `origin/master` (`79787a3`..`e213916`,
más los merges intermedios). Sin cambios sin commitear relevantes, salvo el ruido ya conocido
de `app.db.bak` y `Consolidacion.txt` (ninguno de los dos forma parte del repo real).
