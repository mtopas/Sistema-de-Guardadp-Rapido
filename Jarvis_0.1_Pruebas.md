# Jarvis 0.1 — Pruebas pendientes para el usuario

QA de punta a punta hecho el 2026-08-25. Resumen completo de lo encontrado y corregido en
`Cerebro/estado-actual.md` (sección "QA end-to-end") y `Cerebro/decisiones-implementacion.md`.

Este documento es solo lo que **no pude probar en este entorno** — sin navegador interactivo, sin
Ollama instalado, sin `OPENAI_API_KEY`, sin token de Telegram — y que te queda a vos.

---

## 1. Flujo real con Ollama corriendo

Todo lo que depende de Ollama (clasificación, embeddings, respuestas locales de fallback) lo validé
con **mocks** — la lógica de orquestación está probada, pero nunca corrió contra un modelo real. Con
Ollama levantado (`ollama serve` + `ollama pull llama3.2:3b` + `ollama pull nomic-embed-text`):

- Levantá el worker (`python -m jarvis.worker.main`) y capturá algo real (`POST /jarvis/capture` o
  `/j <texto>` en Telegram). Confirmá que:
  - La clasificación real del modelo da un `type`/`title`/`tags` razonables (el prompt está en
    `jarvis/llm/client.py::_CLASSIFY_PROMPT` — nunca se vio una respuesta real de `llama3.2:3b` contra
    él, solo el parseo de JSON con datos mockeados).
  - El embedding se genera y el entry queda `DONE` en el inbox.
- Hacé una consulta (`POST /jarvis/query` o `/jq` en Telegram) sobre eso mismo y confirmá que la
  respuesta cita el contenido correcto.

## 2. Consulta con OPENAI_API_KEY configurada

Con la key puesta en `.env`, confirmá que `/jarvis/query` responde con el modelo externo real
(`openai/gpt-4o-mini` por defecto) y que el costo se refleja en `GET /jarvis/budget`
(`spent_usd` > 0 después de una consulta).

## 3. Frontend interactivo — no hay navegador en este entorno

Todo lo de `/jarvis` en el frontend lo verifiqué por lectura de código + que Vite compila cada
componente sin error, pero **nunca lo abrí en un navegador real**. Con el backend + worker + Ollama
corriendo, en `http://localhost:5173/jarvis`:

- Mandá una pregunta en el chat y confirmá que la respuesta se ve bien, que el indicador de "escribiendo"
  aparece y desaparece en el momento correcto, y que las fuentes colapsables muestran texto real (esto
  lo arreglé — antes mostraban "—" siempre porque leían un campo que el backend no manda; confirmá que
  ahora se ve el `title_hint`).
- Probá el botón **"Capturar"** del TopBar en `/jarvis` — este era el bug más importante que encontré:
  el botón no hacía nada porque el wiring de la acción faltaba en `TopBar.jsx`. Ya está corregido, pero
  confirmá que ahora sí abre el modal de captura.
- Recargá la página (F5) con historial de chat cargado y confirmá que sobrevive (se guarda en
  `localStorage`, no lo pude probar en un browser real).
- Ciclá los módulos con click/click-derecho en el título del TopBar y confirmá el orden
  Bóveda → Finanzas → Agenda → Hábitos → Jarvis → (vuelve a Bóveda), y que en `/jarvis` el título se ve
  en cursiva serif con gradiente como en el resto de los módulos.
- Confirmá que el panel de inbox se actualiza solo cada 15s y que la barra de budget cambia de color
  según ACTIVE/LOW/EXHAUSTED.

## 4. Bot de Telegram real

No hay `TELEGRAM_BOT_TOKEN` configurado en este entorno (`.env` ni siquiera existe todavía — copiá
`project/.env.example` a `project/.env` y completá lo necesario). Con el bot corriendo:

- `/j <texto>` y `/jq <pregunta>` contra un chat real.
- **Posible problema no confirmado**: `cmd_jq` en `jarvis_handlers.py` edita el mensaje de respuesta con
  `parse_mode="Markdown"` usando el texto que devuelve el LLM tal cual. Si el modelo externo genera
  texto con `_`, `*` o `` ` `` sueltos (muy común), Telegram puede rechazar el `edit_text` por Markdown
  mal formado — en ese caso el usuario vería el mensaje de error genérico en vez de la respuesta real.
  No lo pude reproducir sin un bot real. Si pasa, la solución más simple es sacar `parse_mode` de esa
  llamada o escapar el texto para MarkdownV2.

## 5. Migración real de la Bóveda

El script está verificado en dry-run (dos veces, contra el backup real de tus datos,
`project/database/app.db.bak` — 10/10 hojas, resultado idéntico ambas veces, sin tocar nada). La
migración **real** (`python -m jarvis.cli.migrate_boveda`, sin `--dry-run`) todavía no se corrió nunca
sobre tu `jarvis.db` real — la corrés vos cuando decidas, según la instrucción original de la tarea.

## 6. Estado de la base de datos después de este QA

`project/database/jarvis.db` existe ahora por primera vez con el schema real (antes de esta sesión no
existía; toda la verificación previa de S1-S5 usaba paths de scratch aislados). Quedó completamente
vacía (sin entradas de prueba) después de la limpieza post-QA — es tu base real, lista para el primer
uso genuino.
