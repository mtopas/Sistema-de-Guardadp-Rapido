# Pruebas manuales de Jarvis — checklist para el usuario

No existía un documento así — lo que había en el repo es otra cosa (ver
"Documentos viejos" al final). Este es nuevo, armado el 2026-08-31.

## Por qué este documento existe

Las dos últimas sesiones probaron Jarvis a fondo (dataset sembrado con
embeddings reales, `run_consolidation()`, tags, entidades, Explorar,
corregir/olvidar, captura pasiva) **a nivel API + Ollama directo**, sin pasar
por el navegador ni por Telegram — este entorno no tiene acceso a
`claude-in-chrome` (mismo motivo de siempre, documentado en
`Cerebro/estado-actual.md`: SSH remoto, la extensión no conecta) ni puede
escribirle mensajes reales al bot de Telegram. Todo lo que sigue es lo que
**falta confirmar con ojos humanos** — la lógica de atrás ya está verificada.

**Estado en vivo ahora mismo:** backend, worker y bot están corriendo contra
el dataset de prueba (no tus datos reales — ver el backup en
`project/database/backup-testseed-20260831-140324/`), con todos los fixes de
ambas sesiones aplicados. Podés probar ya mismo en `http://127.0.0.1:5173/jarvis`
y por Telegram.

---

## Antes de empezar

| Servicio | Cómo confirmar que está corriendo |
|----------|-------------------------------------|
| API Jarvis | `curl http://127.0.0.1:8765/jarvis/health` → `{"worker_alive":true}` |
| Frontend | `http://127.0.0.1:5173/jarvis` (si no corre: `cd project/frontend && npm run dev`) |
| Bot Telegram | Mandale `/start` o `/jdebug` — debería responder |

Si alguno no responde, avisame y lo reviso antes de que sigas.

---

## A) Pantalla `/jarvis` en el navegador

### A1 — Tab Cerebro (chat)

- [ ] Entrá a `/jarvis`, tab **Cerebro**. Deberías ver una lista de chats
      existentes en la parte superior — hay 5 (algunos son de mis pruebas,
      con títulos tipo "test sin conversation_id" o "dale, gracias, después
      lo reviso" — podés borrarlos si molestan, no son tus datos).
- [ ] Creá un chat nuevo y preguntá: **"¿Quién es Martín Suárez?"**
      Esperado: respuesta en lenguaje natural (no una lista con viñetas ni
      cita textual), mencionando que es compañero de trabajo, especialista
      en Docker/Linux, y que va a liderar la migración del worker — con 3
      fuentes citadas abajo (chips clickeables).
- [ ] Clickeá una de esas fuentes → debería abrir un modal con el contenido
      completo de esa entrada (`JarvisSourceModal`).
- [ ] Preguntá **"¿Qué pasó con el código ERR-4471-XK?"** — esto prueba el
      fix del bug de ranking del 28/08: antes, esta pregunta completa no
      traía la fuente correcta entre las citadas (aunque la respuesta la
      acertaba). Ahora la fuente RAW sobre el error debería aparecer primero
      en la lista de fuentes, no solo mencionada en el texto.
- [ ] Fijate que las respuestas se vean con **markdown renderizado** (negrita
      real, no `**así**` literal) y que el historial muestre timestamps
      relativos si volvés a un chat viejo.

### A2 — Tab Explorar

- [ ] Filtrá por tipo `DECISION` → esperás **4** resultados.
- [ ] Filtrá por tag `equipo` → esperás **5** resultados (Martín Suárez
      aparece en varias).
- [ ] Filtrá por proyecto `Jarvis` → esperás **5** resultados.
- [ ] Poné una fecha de rango "hoy" (`date_from`/`date_to` de hoy) — esto
      prueba el fix del 28/08 del filtro de fecha (antes, una fecha sin hora
      en `date_to` excluía todo el día). Debería traer resultados, no 0.
- [ ] Buscá texto libre `Quetzalcoatl` → esperás exactamente **1** resultado
      (el proyecto del asistente de voz).
- [ ] El total general sin filtros debería ser **16** (quedaron 20 entradas
      creadas en total; 2 las superseded automáticamente la consolidación —
      la cadena de "seguimos con SQLite" — y 2 más las olvidé/edité yo
      probando: "café" olvidado, "Madrid" editado a "Barcelona").

### A3 — Tab Entidades

- [ ] Deberías ver **3** entidades: `Martín Suárez` (persona, 3 memorias,
      tipos DECISION/PEOPLE/SEMANTIC — cruza tipos, esto prueba que la
      vinculación de entidades funciona entre tipos distintos), y `Jarvis`/
      `SQLite` (organizaciones, detectadas automáticamente al capturar un
      mensaje nuevo durante las pruebas — confirmá que el extractor de
      entidades también reconoce organizaciones, no solo personas).
- [ ] Clickear en `Martín Suárez` debería traer sus 3 entradas.

### A4 — Corregir / Olvidar

- [ ] Abrí cualquier entrada desde Explorar o desde una fuente citada en el
      chat. Deberías ver botones de lápiz (corregir) y tacho (olvidar) en el
      header del modal.
- [ ] Probá corregir el contenido de una entrada de prueba (no hace falta
      una real) y confirmá que el cambio se refleja al instante.
- [ ] Probá "olvidar" otra — con confirmación inline antes de ejecutar — y
      confirmá que desaparece de Explorar sin recargar la página.

### A5 — Inbox y Debug

- [ ] Tab Inbox: debería mostrar las entradas procesadas (`DONE`) sin
      ninguna en estado `ERROR`.
- [ ] Tab Debug: el indicador de salud del worker debería estar en verde
      (`worker_alive: true`, confirmado por API recién). El presupuesto de
      hoy debería mostrar ~$0.008 gastados de $1.00 (modelo `gpt-5.4-mini`,
      rol "razonamiento").

### A6 — Banner de propuesta (captura pasiva)

Esto es lo más difícil de probar manualmente porque depende de tiempo real
sin actividad (`JARVIS_PASSIVE_CAPTURE_INACTIVITY_MINUTES=20` por default):

- [ ] Escribí en el chat algo con sustancia real, ej.: *"Che, decidimos que
      el próximo sprint arrancamos el lunes que viene."* — y **dejá de
      interactuar** con `/jarvis` (cualquier pestaña) 20+ minutos.
- [ ] Pasado ese tiempo (el worker escanea en cada vuelta ociosa del loop,
      cada 5s), debería aparecer un banner arriba de cualquier tab
      (`JarvisProposalBanner`) preguntando si guardar eso como memoria.
- [ ] Probá las 3 acciones: Guardar, Aclarar (con texto extra), Descartar.
- **Atajo si no querés esperar 20 minutos:** avisame y te lo disparo manual
  con `scan_and_propose(now=...)` como hice en las sesiones de testing — no
  es lo mismo que el flujo real end-to-end con el worker corriendo solo,
  pero confirma que la propuesta se genera bien.

---

## B) Telegram

### B1 — Captura y aviso de "listo"

- [ ] Mandale al bot algo con `/j`: *"Decidimos posponer el viaje a marzo
      porque todavía no salió la aprobación de las vacaciones."*
- [ ] Esperá el aviso "✅ Listo — guardado como DECISION" — este aviso
      dependía del fix del 28/08 (`load_dotenv()` en `config.py`): antes,
      corriendo el worker como proceso separado en Windows, este push
      **nunca llegaba** porque `TELEGRAM_BOT_TOKEN` no estaba disponible en
      ese proceso. Si no te llega el aviso, es una regresión real — avisame.

### B2 — `/jdebugon` y `/jdebug`

- [ ] `/jdebugon` para prender modo debug, después mandá otra captura con
      `/j` — deberías recibir un mensaje de debug con tipo detectado,
      confianza, entidades. Mismo fix que B1 lo afectaba.
- [ ] `/jdebug` (sin el `on`) — snapshot puntual: última entrada procesada,
      cola pendiente, presupuesto, si el modelo externo está activo.

### B3 — Consulta por Telegram

- [ ] `/jq ¿Quién es Martín Suárez?` (o el comando que uses para consulta) —
      mismo criterio que A1, en lenguaje natural.

### B4 — Propuesta pasiva por Telegram

- [ ] Igual que A6 pero por chat de Telegram — la diferencia es que acá el
      worker te empuja el mensaje directo (push activo), no hace falta que
      abras nada. Respondé "sí"/"no"/con una aclaración en texto libre.

---

## Qué NO hace falta que verifiques (ya confirmado con Ollama real, sin mocks)

- Consolidación: same_fact (cadena real de 3 entradas sobre SQLite) y
  contradicción (par "100% remoto" / "100% presencial", ambas bajaron
  confidence a 0.5 y quedó logueado el conflicto) — ambos caminos probados
  y funcionando.
- Reuso del catálogo de tags (sin inventar sinónimos) y creación de tags
  nuevos para conceptos genuinamente nuevos.
- Filtros de Explorar (tag/tipo/proyecto/texto/fecha) contra la API
  directamente.
- Corregir (regenera embedding + reescribe el vault) y olvidar (soft-delete,
  desaparece de retrieval/tags/entidades/Explorar) contra la API.
- El bug de ranking del retriever (Fase E) — 7 preguntas de prueba,
  incluyendo las 2 de término raro, todas traen ahora la fuente correcta en
  el puesto #1.
- `channel_id` único por conversación nueva (ya no hay riesgo de reenganchar
  con la conversación de otro caller).
- El worker arranca limpio contra DB vacía o contra la sembrada, sin
  excepciones; heartbeat sobrevive su propia escritura (el bug del
  auto-borrado del 31/08 ya está resuelto y confirmado).

---

## Cosas que vas a ver y que son a propósito, no bugs

- Dos entradas ("Soy 100% remoto..." / "Soy 100% presencial...") con
  confidence baja (0.25) — es el par de contradicción sembrado a propósito
  para probar ese camino. Quedan así hasta que las edites/olvides a mano
  (por diseño: el sistema nunca resuelve una contradicción solo).
- Algunas entradas más viejas no aparecen en Explorar/consultas — son las
  que la consolidación marcó `superseded` (cadena de "seguimos con SQLite" y
  el par de migración de hosting) — desaparecen a propósito, no están
  borradas (siguen en el vault y en Chroma, recuperables si hiciera falta).
- Vas a ver chats con títulos raros tipo "test sin conversation_id" en la
  lista de chats del navegador — son míos, de probar el fix del `channel_id`.
  Borralos si molestan.

---

## Documentos viejos

Busqué si ya existía algo así antes de armar este documento:

- **`Testeos-Ollama.md`** (raíz del repo) — existe, pero es de **otra parte
  del sistema completamente distinta**: pruebas del bot de Telegram de SGR
  (Finanzas/Bóveda vía `intent_router.py`/`assistant.py`), nada que ver con
  Jarvis. No lo toqué — sigue siendo válido para lo suyo.
- **`Cerebro/como-explotar-jarvis.md`** — sí es de Jarvis, pero es una guía
  de referencia técnica ("cómo forzar cada camino de código, cómo leer
  `jarvis.db` a mano"), no una lista de pruebas con resultado esperado/
  estado, y está fechada 2026-08-26 — antes de todo el paquete A-F
  (catálogo de tags, editar/olvidar, captura pasiva, consolidación
  extendida, búsqueda híbrida, Explorar) y de los 3 fixes de esta semana.
  Bastante desactualizada, pero tampoco es "el documento de pruebas" que
  pediste — no la borré porque no estoy seguro de que sea la que tenías en
  mente. Decime si la querés eliminar o si preferís que la actualice en vez
  de borrarla.
