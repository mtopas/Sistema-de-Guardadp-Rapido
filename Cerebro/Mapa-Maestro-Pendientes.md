# Mapa Maestro de Pendientes — SGR / Jarvis

**Actualizado:** 2026-10-07
**Propósito:** inventario consolidado de pendientes, planes, roadmaps e ideas futuras vigentes.

Este documento no reemplaza la cadena de custodia operativa: [Cerebro/Handoff.md](Handoff.md)
sigue registrando el cambio más reciente de cada sesión. El mapa reúne el inventario completo y
deduplicado para planificar.

## Regla de lectura y mantenimiento

- Leer este mapa al iniciar toda planificación relevante.
- Actualizarlo al cerrar cada trabajo que resuelva, cree, descarte o repriorice un pendiente.
- Mantener el Handoff actualizado en el mismo cierre; el Handoff tiene prioridad operativa y el
  mapa tiene prioridad como inventario consolidado.
- Estados usados: **decidido** (dirección definida, ejecución o verificación pendiente),
  **por diseñar** (falta resolver diseño), **diferido** (postergado explícitamente) e **idea**
  (posibilidad sin compromiso).
- Prioridad: P0 urgente, P1 alta, P2 media, P3 baja/no urgente. Si la fuente no asigna prioridad,
  se indica **sin prioridad asignada**.

### Jerarquía aplicada

1. Estado real y decisiones recientes: [estado-actual.md](estado-actual.md) y
   [decisiones-implementacion.md](decisiones-implementacion.md).
2. Cadena operativa: [Handoff.md](Handoff.md), tomando como vigente el bloque más reciente por
   fecha.
3. Roadmaps y documentos de diseño: [PROXIMAMENTE.md](PROXIMAMENTE.md), los roadmaps de módulos,
   [PLAN-OLLAMA.md](../PLAN-OLLAMA.md) y los planes de Jarvis.

Los roadmaps dentro de `project/` siguen siendo fuentes de detalle por módulo. En esta sesión no
se modifican porque fueron declarados fuera de alcance; este archivo es el índice consolidado que
los enlaza.

## 1. Ahora / pendientes de trabajos previos

### Verificaciones, decisiones y operaciones inmediatas

- **Pruebas reales del título por IA y del flujo de captura por Telegram** — **resuelto**, P1;
  verificadas por el usuario el 2026-10-07: la nota con link conserva una descripción útil como
  título, la edición manual no se pisa, el bot obtiene título desde metadata cuando alcanza y el
  texto claro se guarda en el cuerpo con título IA. Fuente: [Handoff.md](Handoff.md), sesión
  2026-10-07; [estado-actual.md](estado-actual.md).
- **Pruebas manuales post-deploy de Ahorro** — **resuelto**, P1; el usuario confirmó el 2026-10-07
  que Bonos/Cedears muestran valores y que aparece el diálogo de confirmación antes de borrar. El
  resto de la tanda ya estaba validado. Fuente: [Handoff.md](Handoff.md), sesiones 2026-10-02,
  2026-10-06 y 2026-10-07.
- **Push de commits locales** — **resuelto**, P1; el usuario confirmó el push el 2026-10-07. Fuente:
  [Handoff.md](Handoff.md), sesión 2026-10-07.
- **Borrar la nota de feedback #1 y hacer smoke test** — **decidido**, P2; es una escritura sobre
  datos reales y la debe ejecutar el usuario o un ticket autorizado. Dependencia: confirmación del
  usuario. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-06.
- **Limpiar el bundle JavaScript viejo del homelab** — **diferido**, P3; el `index.html` ya apunta
  al bundle nuevo y el archivo es inofensivo. Dependencia: acceso al host y limpieza segura del
  directorio `dist/assets`. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-06.
- **Quitar `HOMELAB_HOST=` del `.env` del homelab** — **diferido**, P3; variable inerte, solo si
  se quiere eliminar ruido. Dependencia: edición controlada del `.env` y `docker-compose up -d
  --no-build`; no usar `restart`. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-02.
- **Importación mensual de operaciones** — **decidido**, P2; ejecutar el flujo documentado con
  `--excluir-tickers TZX26` y luego actualizar precios con el MEP vigente. Dependencia: disponer de
  los tres CSV del mes y revisar el dry-run antes de aplicar. Fuente: [Handoff.md](Handoff.md),
  sesión 2026-10-06; [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).

### Tickets pequeños desbloqueados

- **Autoetiquetado conservador de hojas con IA** — **implementado, deploy pendiente**, P1; tags
  JSON propios con fallback para `#hashtags`, chips removibles y autoetiquetado en background solo
  con confianza explícita >= 0.8. Conserva tags existentes, no reprocesa historial y todos los
  consumidores visuales usan `getHojaTags()`. Dependencia: deploy y prueba real con Ollama.
  Fuente: commits `ce66321` y `75c8dc2`; [Handoff.md](Handoff.md), sesión 2026-10-07.
- **Transparencia de Proyectos en Jarvis** — **resuelto**, P1; `GET /jarvis/projects/vault` lee
  `01 - Proyectos` con frontmatter, contenido y procedencia, y el frontend informa carga, vacío,
  fuente no disponible o desactualizada. `memory_projects` sigue separado y sin edición manual.
  Homelab desplegado y confirmado: CIFS → `/mnt/boveda` → `/app/boveda`, watchdog cada 60 s.
  Fuente: [Handoff.md](Handoff.md), T7/#4, sesión 2026-10-07.
- **Carga manual de tiempo en pantalla en Hábitos** — **diferido**, P3; semana lunes-domingo,
  siete totales diarios, top cinco apps, horas semanales y métricas total/promedio/mejor/peor día;
  falta decidir si habrá meta diaria. Diferido por decisión del usuario. Dependencia: definición
  de meta y modelo de datos de la pantalla. Fuente: [Handoff.md](Handoff.md), T8/#14,
  conversación 2026-10-07.
- **Latencia de la sugerencia de categoría** — **decidido**, P2; evaluar precalentamiento de
  Ollama (`keep_alive`) y/o mensaje de espera más claro. Dependencia: no cambiar timeouts sin
  medir de nuevo en homelab. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-06.
- **Umbral de sugerencia de categoría** — **por diseñar**, P2; revisar si el umbral compartido de
  aproximadamente 400 caracteres deja demasiadas notas rápidas sin sugerencia. Dependencia:
  observar uso real y separar, si corresponde, el umbral del triaje de Inbox. Fuente:
  [Handoff.md](Handoff.md), sesiones 2026-10-02/06.
- **Alerta financiera móvil por residuo de punto flotante** — **implementado, deploy pendiente**,
  P2; `/mobile/hoy` redondea cada saldo a dos decimales antes de evaluar y devolver la alerta:
  `-1.8189894035458565e-11` no alerta y `-0.01` sí. No se modifican saldos ni movimientos
  persistidos. Fuente: commit `735ac13`, sesión 2026-10-07.
- **Jarvis debe leer Agenda en vivo** — **implementado, deploy pendiente**, P1; consulta
  `agenda.list_events` bajo demanda y omite RAG/memoria. Solo se activa con marcador de Agenda o
  “qué tengo hoy/mañana/esta semana”; una pregunta genérica no dispara la tool. Dependencia:
  deploy y prueba real contra la Agenda. Fuente: commits `d619160` y `58995a3`; [Handoff.md](Handoff.md), T4/#3.

### Gaps documentados que siguen abiertos

- **Tests de regresión para escritura del vault de Bóveda** — **decidido**, P2; agregar cobertura
  aislada para frontmatter, preservación de identidad y sincronización antes de volver a tocar esa
  zona sensible. Dependencia: fixture de vault temporal. Fuente: [estado-actual.md](estado-actual.md),
  cierre de auditoría de Bóveda 2026-09-25.
- **Indexación semántica con frontmatter roto o colisión `UNIQUE`** — **por diseñar**, P2;
  reproducir y determinar causa raíz antes de corregir. Dependencia: fixture que reproduzca la
  nota de `Jarvis/Entidades` y el camino de sync. Fuente: [estado-actual.md](estado-actual.md),
  hallazgos nuevos del cierre de auditoría de Bóveda.
- **Botones de guardar/eliminar inaccesibles en mobile/tablet** — **resuelto**, P2: el panel
  Información ahora se muestra debajo del editor cuando el viewport es menor que `xl`, conserva
  ambos controles en ese panel y agrega espacio inferior para que la navegación móvil no los tape.
  Regresión automatizada: `project/frontend/e2e/05-boveda-detail-responsive.test.ts`, verificada en
  375, 768 y 1440 px. Commit: `487af3a`. Fuente: hallazgos nuevos de la auditoría frontend.
- **Validación silenciosa de valores inválidos en registros batch de Hábitos** — **por diseñar**,
  P2; medir alcance y decidir si rechazar, normalizar o informar cada valor inválido. Dependencia:
  casos reales y contrato API. Fuente: [estado-actual.md](estado-actual.md), hallazgos nuevos.
- **Clave i18n `goalEmergency*` sin consumidores** — **idea**, P3; limpiar solo en una pasada de
  deuda menor, sin prioridad funcional. Dependencia: confirmar que no la usa una pantalla externa.
  Fuente: [estado-actual.md](estado-actual.md), hallazgos nuevos.
- **Propuestas del canal desktop y router de Telegram** — **por diseñar**, P3; hacer que las
  propuestas relevantes también lleguen por Telegram y mejorar el diagnóstico de frases ambiguas.
  Dependencia: definir canal prioritario y dataset de casos. Fuente: [Handoff.md](Handoff.md),
  sesión 2026-10-06.
- **Certeza/estado por entrada de memoria de Jarvis** — **idea**, P3; evaluar en uso real si hace
  falta distinguir regla firme, preferencia, idea y discusión. Dependencia: prueba real y criterio
  de presentación. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-06.
- **Evaluación de `Front-CLAUDE/`, `Front-GPT/` y `Front-Claude-Design/`** — **idea**, P3;
  comparar si aportan algo que deba incorporarse al runtime. Dependencia: objetivo visual concreto
  y revisión de licencia/alcance. Fuente: [Handoff.md](Handoff.md), sesión 2026-10-06.
- **Video promocional** — **idea**, P3; ejecutar el prompt en sandbox, nunca en producción.
  Dependencia: definir si se prioriza y usar la skill de video disponible. Fuente:
  [Handoff.md](Handoff.md), sesión 2026-10-06.

## 2. Futuro

### Móvil web: “Hoy + captura intencional + voz”

- **Shell móvil ultrarrápido** — **resuelto**, P2: ruta explícita `/mobile` con identidad propia,
  centrada en “Hoy” y sin cargar la composición de escritorio. Muestra próximo bloque, hasta tres
  tareas, hábitos pendientes y alertas financieras solo ante saldo negativo. Verificado sin
  overflow en 390, 768 y 1440 px. Fuente: implementación 2026-10-07;
  [MobileHoyScreen.jsx](../project/frontend/src/screens/MobileHoyScreen.jsx).
- **Arranque mínimo y resumen agregado de Hoy** — **resuelto**, P2: `GET /mobile/hoy` entrega el
  payload recortado y `App.jsx` divide pantallas/datos por ruta. `/mobile` no monta `Layout`, modales
  ni watchers globales; su apertura dispara únicamente el resumen. Los catálogos se cargan al
  elegir una acción. Pendiente opcional: medir caché/bundle con uso real. Fuente: implementación
  2026-10-07; [App.jsx](../project/frontend/src/App.jsx).
- **Captura rápida con intención explícita por texto** — **resuelto**, P2: Gasto, Bóveda, Tarea,
  Hábito y Preguntar a Jarvis eligen primero destino y luego texto. Bóveda usa Inbox, Tarea queda
  para hoy y Hábito es diario; las altas muestran confirmación y deshacer mediante sus DELETE
  existentes. Jarvis conserva la respuesta pero no ofrece deshacer. Fuente: implementación
  2026-10-07; [mobileCapture.js](../project/frontend/src/mobile/mobileCapture.js).
- **Modo voz como interfaz, no como dependencia única** — **por diseñar**, P2: botón protagonista
  de pulsar/mantener para hablar dentro de la captura, con fallback inmediato a texto. No hay voz
  investigada, diseñada ni implementada todavía. La primera fase debe poder funcionar sin
  reconocimiento; una fase posterior puede prototipar reconocimiento del navegador con detección
  de capacidad, y la arquitectura objetivo sería grabar audio y transcribirlo en backend/local.
  Dependencias: HTTPS, permiso explícito de micrófono, definición de motor STT, latencia, privacidad
  y compatibilidad móvil. Fuente: propuesta de arquitectura móvil, conversación 2026-10-07;
  [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) y
  [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API).
- **Límites de producto móvil** — **decidido**, P2: no escuchar en segundo plano, no usar voz como
  única vía, no forzar paridad visual con escritorio y no delegar la selección de módulo al LLM si
  el usuario ya eligió una acción. Escritorio conserva exploración/edición profunda; móvil prioriza
  presencia diaria, captura y consulta puntual. Dependencias: validar el flujo con uso real antes
  de abrir implementación de STT. Fuente: propuesta de arquitectura móvil, conversación 2026-10-07.
- **Decisiones del diseño móvil** — **resuelto para el slice de texto**, P2: la acción abre la hoja
  de captura; Bóveda rápida va a Inbox; Finanzas solo aparece por saldo negativo; el producto vive
  primero en la ruta explícita `/mobile`. La interacción de grabación sigue sin decidir y pertenece
  al spike de voz posterior. Fuente: decisión de implementación 2026-10-07.
- **Ícono PWA oficial y entrada instalada en móvil** — **resuelto**, P2: SVG reutilizable con
  fondo Disco 90s y degradé Eclipse solar, PNG 180/192/512, favicon y `apple-touch-icon`. El
  manifest usa `id` y `start_url` `/mobile`; una instalación standalone desde `/` se redirige a
  móvil sin cambiar Safari normal. Verificado manualmente en iPhone tras reinstalar el acceso.
  Fuente: commits `0f517fb`, `6cf9a05`, `8dd3cb2`, `6ab88b5`, sesión 2026-10-07.

### Bóveda

Fuente primaria de detalle: [project/Boveda-Roadmap.md](../project/Boveda-Roadmap.md). Los grupos
consolidan ítems repetidos del roadmap y de [PROXIMAMENTE.md](PROXIMAMENTE.md).

- **Grafo y conocimiento conectado** — **idea**, P3: modo solo-rama, layout por tags, navegación
  por teclado, tags como enlaces y grafo por `[[wikilinks]]` con backlinks/preview. Dependencias:
  decidir modelo de tags y enlaces estables por `vault_id`. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Mover y buscar mejor** — **por diseñar**, P2: drag & drop de hojas entre categorías,
  resaltado dentro de apuntes, buscador híbrido compartido (FTS5 + embeddings + recencia) y una
  bandeja web de `00 - Sin categorizar` con acciones rápidas. Dependencias: decidir contrato de
  búsqueda y si la bandeja complementa al triaje de Jarvis. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Editor TipTap enriquecido** — **idea**, P3: resaltar `#tag` inline, pegar URL como card
  embed, experiencia WYSIWYG con Markdown nativo y selector de color coherente en todas las rutas.
  Dependencias: no romper el modelo actual de cuerpo único. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Captura y responsive** — **por diseñar**, P2: recordatorios en CaptureModal, drag & drop de
  imágenes, share target, layout adaptable, detalle full-screen móvil, panel contextual Ctrl+M y
  Ctrl+K. Dependencias: notificaciones y revisión visual móvil. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md).
- **Menú contextual completo** — **por diseñar**, P2: acciones para categorías, hojas y nota
  abierta (renombrar, eliminar con aviso, copiar, duplicar, exportar, abrir links, recordatorios).
  Dependencias: definir soft delete/papelera e historial. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md).
- **Rendimiento y backend de Bóveda** — **diferido**, P2: paginación, cache de previews, FTS5,
  indexación fuera del request con watcher/poller y tabla de estado. Dependencias: medir volumen
  real del vault y elegir fuente de verdad de búsqueda. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Rendimiento de frontend** — **diferido**, P2: `fetchHojas` lazy por ruta, selectores Zustand
  finos y `useDeferredValue` para búsqueda/highlight. Dependencia: medir re-render y carga inicial.
  Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md).
- **Notificaciones de hojas** — **por diseñar**, P2: fecha/hora, tabla de pendientes, scheduler,
  campana web y teclado de Telegram. Dependencias: diseño de notificaciones unificadas. Fuente:
  [Boveda-Roadmap.md](../project/Boveda-Roadmap.md).
- **Ciclo de vida y portabilidad** — **idea**, P3: papelera, duplicado, historial, métricas,
  export JSON/ZIP e import desde Notion/Obsidian/Markdown. Dependencias: política de retención y
  formato de exportación. Fuente: [Boveda-Roadmap.md](../project/Boveda-Roadmap.md).

### Jarvis

- **Agenda y contexto vivo** — **implementado, deploy pendiente**, P1: consulta directa read-only
  con `agenda.list_events`, sin duplicar eventos en `memory_entries`; la ventana por defecto es
  siete días y la explícita sale de la pregunta. El detector requiere marcador de Agenda o la
  excepción temporal “qué tengo hoy/mañana/esta semana”. Dependencia: deploy y prueba real.
  Fuente: commits `d619160` y `58995a3`; [Handoff.md](Handoff.md), T4.
- **Revisión semanal de calidad de Jarvis** — **decidido**, P2: primera fase local y sin UI,
  con telemetría técnica mínima por consulta, agregado determinístico semanal y snapshot
  reproducible. Medirá volumen por día/canal/ruta, latencia, uso de contexto y errores o fallos
  de tools; no copiará texto de mensajes al registro analítico ni invocará un LLM. El período se
  calcula en `America/Argentina/Buenos_Aires`. El análisis semántico local de casos seleccionados,
  feedback explícito y medición cross-módulo quedan para fases posteriores. Dependencia: definir e
  implementar el contrato del reporte, luego observar una semana real antes de automatizar su
  generación. Fuente: decisión de producto 2026-10-07.
- **Autoetiquetado inteligente de Bóveda (T6)** — **implementado, deploy pendiente**, P1: tags
  conservadores y removibles, sin alta si la IA no tiene confianza explícita >= 0.8. T7 ya está
  desplegado; T6 requiere deploy y validación real con Ollama. Fuente: commits `ce66321` y
  `75c8dc2`; [Handoff.md](Handoff.md), sesión 2026-10-07.
- **Memoria conversacional de sesión** — **decidido**, P2: contexto por `chat_id`, últimos cuatro
  turnos, limpieza por diez minutos o `/nuevo`, sin mezclar comandos de captura. Dependencia:
  validar con las 30 frases de uso real. Fuente: [PLAN-OLLAMA.md](../PLAN-OLLAMA.md), Capa 5.
- **Calibración formal del router/RAG** — **por diseñar**, P2: correr y conservar resultados de
  las 30 frases, incluyendo ambiguos y citas de Bóveda. Dependencias: Ollama disponible, dataset
  aislado y criterios de aceptación. Fuente: [PLAN-OLLAMA.md](../PLAN-OLLAMA.md), Testing/Roadmap.
- **Endpoint de Debug completo** — **diferido**, P3: decidir entre tabla de eventos o lectura de
  logs para exponer el stream; el panel actual usa datos disponibles y declara el límite. Fuente:
  [PLAN-IMPLEMENTACION-BACKEND.md](<../ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION-BACKEND.md>), Fase B5;
  [PLAN-IMPLEMENTACION.md](<../ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION.md>), Fase 6.
- **QA visual y operativo del rediseño de Jarvis** — **decidido**, P2: confirmar contraste en seis
  temas, captura con/sin aclaración, tabs, entidades, polling y ausencia de memory leak del canvas.
  Dependencia: sesión manual con DevTools y Ollama. Fuente: [PLAN-IMPLEMENTACION.md](<../ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION.md>), Fase 7.
- **Cierre QA del plan backend** — **decidido**, P2: confirmar contra entorno real que los endpoints
  B1-B4, health y configuración documentada conservan comportamiento; dejar tabla final de fases
  listas versus opcionales. Dependencia: DB de scratch, Ollama y worker real. Fuente:
  [PLAN-IMPLEMENTACION-BACKEND.md](<../ClaudeDesign - Jarvis/PLAN-IMPLEMENTACION-BACKEND.md>), Fase B7.
- **Evaluation harness** — **diferido**, P3: dataset versionado, F1/recall@5/MRR, groundedness,
  aceptación, latencia y costo. Dependencia: priorización de Jarvis y fixtures estables. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Jarvis".
- **Citas por afirmación y respuestas con “no lo sé”** — **diferido**, P3; exige asociar cada
  afirmación con un fragmento y umbral de evidencia. Dependencia: diseño de contrato de fuentes.
  Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Jarvis".
- **Brief diario y revisión semanal cross-módulo** — **idea**, P3: JSON determinístico de Agenda,
  Hábitos, Finanzas y Bóveda, comando `/semana` y regeneración en Revisión. Dependencia: definir
  métricas y período. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Jarvis".
- **Panel de calidad y operación** — **idea**, P3: salud de Ollama, backlog, embeddings,
  presupuesto y última consolidación. Dependencia: decidir qué métricas son accionables. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Jarvis".
- **Separar mantenimiento y consolidación** — **diferido**, P3; dividir módulos grandes por caso
  de uso sin cambiar funcionalidad. Dependencia: evidencia de que el tamaño impide operar. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Jarvis".
- **Investigación de patrones externos** — **por diseñar**, P3: decidir si abrir ola 2 del
  laboratorio (Khoj, OVOS, Home Assistant) y si convertir en ADR alguno de los patrones de ola 1:
  capability floor, progressive discovery, approval surface, autonomía graduada o recall gate.
  Dependencia: necesidad concreta y revisión de licencias. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md),
  laboratorio Jarvis-Research.
- **Spike Agent Router / Model Router / Policy Engine** — **idea**, P3; validar si el Tool Registry
  y el policy store actuales alcanzan antes de agregar una capa Agent Router. Dependencia: Jarvis
  con más de un flujo/agente real. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), ADR-005.

### Agenda

Fuente primaria de detalle: [project/Agenda-Roadmap.md](../project/Agenda-Roadmap.md).

- **UX y menú contextual** — **idea**, P3: colapsar HOY en móvil y agregar acciones por slot,
  bloque, hábito, día, lista y calendario. Dependencias: definir acciones destructivas y navegación.
  Fuente: [Agenda-Roadmap.md](../project/Agenda-Roadmap.md).
- **Validaciones y datos enriquecidos** — **por diseñar**, P2: validar `fecha_inicio < fecha_fin`,
  adjuntos y ubicación/enlace de Meet. Dependencias: contrato API y almacenamiento de uploads.
  Fuente: [Agenda-Roadmap.md](../project/Agenda-Roadmap.md).
- **Notificaciones de Agenda** — **diferido**, P2: tabla de recordatorios, reglas por tipo,
  store, Settings y scheduler. Se consolida con las notificaciones cross-módulo. Dependencias:
  canal, anticipación y outbox. Fuente: [Agenda-Roadmap.md](../project/Agenda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Vínculos reales entre módulos** — **por diseñar**, P2: Bóveda↔Agenda por `hoja_id` y
  Finanzas↔Agenda por `movimiento_id`, además de planificar vs ejecución real. Dependencias:
  decidir cardinalidad, borrado y navegación. Fuente: [Agenda-Roadmap.md](../project/Agenda-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Agenda de largo plazo** — **idea**, P3: plantillas de semana, modo focus, alto contraste y
  semana como tab independiente. Dependencia: uso real y priorización. Fuente:
  [Agenda-Roadmap.md](../project/Agenda-Roadmap.md).
- **Recurrencia estándar** — **diferido**, P3: evaluar RFC 5545 (`RRULE`/`EXDATE`/
  `RECURRENCE-ID`) frente al modelo actual materializado. Dependencia: necesidad de excepciones y
  edición de series. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Agenda".

### Finanzas

Fuente primaria de detalle: [project/Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).

- **Ganancia realizada en ventas** — **por diseñar**, P2: registrar resultado realizado; hoy la
  venta descuenta PPC y el TC es informativo. Dependencia: definir moneda, costo y momento de
  reconocimiento. Fuente: [Handoff.md](Handoff.md); [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).
- **Migración y ledger** — **decidido**, P2: reasignar categoría legacy `Ahorro` a `FIRE`/objetivo;
  editar hora y paginar tabla global cuando supere 2000 operaciones. Dependencia: confirmación del
  usuario para la migración y volumen real. Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).
- **Bot y categorías** — **por diseñar**, P2: `/alertas`, fusionar categorías y job opcional de
  migración automática de `Ahorro`. Dependencia: modelo de alertas y resolución de conflictos.
  Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).
- **Notificaciones financieras** — **diferido**, P2: `fin_alertas`, evaluación de metas/objetivos/
  cuotas/inflación/FIRE/dólar/saldo, campana web y Telegram. Dependencia: notificaciones unificadas.
  Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md); [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Atajos y offline durable** — **por diseñar**, P2: atajos de Dashboard/Datos/Ahorro/FIRE y
  reemplazo del fallback temporal por outbox IndexedDB + `Idempotency-Key`. Dependencia: decidir
  estado global y contrato de idempotencia. Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Herramientas de análisis** — **idea**, P3: wizard de transferencias, reconciliación CSV genérica
  con score, PDF/PNG, comparación mensual, presupuesto/forecast 30/60/90 y reglas personales de
  clasificación. Dependencia: evidencia de uso y formato de datos. Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md);
  [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Cobertura de helpers financieros** — **idea**, P3: sumar tests específicos para
  `isTransferencia`, contribución FIRE, acumulados y proyección FIRE. Dependencia: fijar casos
  esperados de negocio. Fuente: [Finanzas-Roadmap.md](../project/Finanzas-Roadmap.md).
- **Decisiones financieras de fondo** — **diferido**, P3: migrar `REAL` a centavos, agrupar ambos
  lados de una transferencia y rediseñar los KPIs del Dashboard. Dependencia: evidencia de errores
  reales y decisión de producto. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Finanzas".

### Hábitos

Fuente primaria de detalle: [project/Habitos-Roadmap.md](../project/Habitos-Roadmap.md).

- **Tiempo en pantalla** — **decidido**, P1: carga manual semanal con top cinco apps, horas y
  métricas comparativas. Dependencia: decidir meta diaria. Fuente: [Handoff.md](Handoff.md), T8.
- **Organización y carga** — **idea**, P3: agrupar por categoría, ordenar manualmente, skeleton y
  virtualización de la grilla. El orden manual requiere migración y DnD. Fuente: [Habitos-Roadmap.md](../project/Habitos-Roadmap.md).
- **Grilla, modales y accesibilidad** — **idea**, P3: anillo animado, animación al completar,
  contraste WCAG y context menu. Dependencia: revisión visual. Fuente: [Habitos-Roadmap.md](../project/Habitos-Roadmap.md).
- **Rendimiento e interacción contextual** — **diferido**, P3: selectores finos, preload y Ctrl+M
  contextual. Dependencia: medir re-render y priorizar frente a otras rutas. Fuente: [Habitos-Roadmap.md](../project/Habitos-Roadmap.md).
- **Notificaciones de Hábitos** — **diferido**, P2: recordatorio por hora, resumen nocturno, racha
  en riesgo, momentum negativo y campana. Dependencia: sistema unificado. Fuente:
  [Habitos-Roadmap.md](../project/Habitos-Roadmap.md); [PROXIMAMENTE.md](PROXIMAMENTE.md).
- **Bot de Hábitos** — **idea**, P3: mostrar en `/habitos` los hábitos no programados del día con
  estado informativo. Dependencia: definir si se implementa junto con Agenda o en el módulo propio.
  Fuente: [Habitos-Roadmap.md](../project/Habitos-Roadmap.md).
- **Modelo de hábitos** — **diferido**, P3: motor único backend, versionado de programación, tipos
  de conteo/duración/ánimo/meta semanal y pausas/excepciones. Dependencia: compatibilidad con
  historial existente. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Hábitos".
- **Producto de largo plazo** — **idea**, P3: export/import, vista anual, vacaciones, meta semanal,
  widget PWA, hábito ancla, modo focus y dashboard de consistencia. Dependencia: uso sostenido.
  Fuente: [Habitos-Roadmap.md](../project/Habitos-Roadmap.md).

### Plataforma, homelab, seguridad y datos

- **Migraciones con historial y respaldo** — **diferido**, P2: `schema_version`, backup automático
  pre-migración y registro de cambios. Dependencia: diseñar recuperación y compatibilidad offline.
  Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), triage de informe externo.
- **Red de seguridad automatizada** — **diferido**, P2: CI en cada push y tres E2E faltantes
  (Telegram↔web, Hábitos↔Telegram, Jarvis con fuente válida). Dependencia: decidir si se quiere
  automatización continua para un repo personal. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md),
  "Diferido — sin red de seguridad automatizada".
- **Offline completo** — **diferido**, P2: outbox IndexedDB, reintentos, pantalla de cambios
  pendientes e `Idempotency-Key` server-side. Dependencia: contrato único por módulo. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — offline falso".
- **Plataforma web** — **diferido**, P2: lazy-load por ruta, dividir bundle, separar store por
  módulo, renombrar manifest PWA y auditar accesibilidad. Dependencia: medición de bundle y
  navegación actual. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — plataforma web".
- **Respaldos y tamaño del repositorio** — **diferido**, P2: inventariar SQLite/Chroma versionados,
  limpiar historial si procede, backups 3-2-1 y restore drill periódico. Dependencia: política de
  retención y confirmación del usuario. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), privacidad/tamaño.
- **Seguridad de superficies web** — **diferido**, P1: SSRF en preview, validación real de
  uploads, sanitización de HTML, headers CSP/X-Content-Type/Referrer y bind local detrás de
  Tailscale Serve. Dependencia: modelo de exposición y pruebas de compatibilidad. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — seguridad".
- **Homelab resiliente** — **diferido**, P2: red directa sin ICS, health checks live/ready/deps,
  estado persistente del bot fuera del mount read-only, deploy reproducible con tags por SHA y
  observabilidad mínima. Dependencia: decidir qué automatización compensa el mantenimiento.
  Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Diferido — Homelab".
- **Deuda de estructura del backend** — **diferido**, P3: reducir el crecimiento de monolitos
  (`main.py`, `crud.py`, `useStore.js`, `agenda_handlers.py`) con una partición que respete la
  decisión vigente de no crear `app/routes/`/`app/services/` por reflejo. Dependencia: criterio de
  partición y evidencia de dolor operativo. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), triage del
  informe externo.
- **Distribución para terceros** — **diferido**, P3: Dockerfiles multi-stage, compose instalable,
  volúmenes y README de instalación. Dependencia: decidir si habrá terceros; hoy nadie más corre
  SGR. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), infraestructura/distribución.
- **Notificaciones unificadas** — **diferido**, P2: tabla común, evaluación, scheduler, entrega
  Telegram y campana web para Bóveda/Finanzas/Agenda/Hábitos. Dependencia: resolver primero los
  modelos específicos y canales. Fuente: [PROXIMAMENTE.md](PROXIMAMENTE.md), "Notificaciones unificadas".

### Investigación y visión

- **Vault externo de Obsidian** — **por diseñar**, P2: decidir ruta física, alcance inicial,
  separación del vault que Jarvis escribe y futura integración con Bóveda SGR; conservar gateway
  de PII y aprobación humana. Dependencia: elección del usuario y estrategia de duplicados. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), "Vault centralizado".
- **“Preparame el día”** — **idea**, P3: vertical slice cross-módulo que propone hasta tres
  cambios, pide aprobación, ejecuta solo lo aprobado, verifica y recién entonces guarda memoria.
  Dependencia: procedencia, planificador/ejecutor/verificador y bandeja de aprobaciones. Fuente:
  [PROXIMAMENTE.md](PROXIMAMENTE.md), catálogo de features.

## Fuentes revisadas y exclusiones

Revisados: [Handoff.md](Handoff.md), [PROXIMAMENTE.md](PROXIMAMENTE.md),
[estado-actual.md](estado-actual.md), [decisiones-implementacion.md](decisiones-implementacion.md),
[triaje-feedback-2026-10-02.md](triaje-feedback-2026-10-02.md), [PLAN-OLLAMA.md](../PLAN-OLLAMA.md),
los cuatro roadmaps de módulos en `project/` y los dos planes de implementación de Jarvis.

No se copian como pendientes: funcionalidades implementadas, decisiones ya resueltas, auditorías
cerradas, el `.exe`/sync retirado el 2026-10-02, el toggle semántico de Bóveda ya implementado,
las fases B0-B4/B6 del plan backend de Jarvis ya implementadas ni el rediseño visual de Jarvis ya
construido. `PLAN-OLLAMA.md` conserva algunos checklists históricos (por ejemplo, el toggle de
búsqueda semántica); el estado actual del código y este mapa prevalecen.
