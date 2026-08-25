# Jarvis 0.1 — Pruebas pendientes para el usuario

QA de punta a punta hecho el 2026-08-25. Resumen completo de lo encontrado y corregido en
`Cerebro/estado-actual.md` (sección "QA end-to-end") y `Cerebro/decisiones-implementacion.md`.

Este documento es solo lo que **no pude probar en este entorno** — sin navegador interactivo, sin
Ollama instalado, sin `OPENAI_API_KEY`, sin token de Telegram — y que te queda a vos.

---

## 2. Consulta con OPENAI_API_KEY configurada

Con la key puesta en `.env`, confirmá que `/jarvis/query` responde con el modelo externo real
(`openai/gpt-4o-mini` por defecto) y que el costo se refleja en `GET /jarvis/budget`
(`spent_usd` > 0 después de una consulta). El fallback a modo local sin key ya quedó confirmado en
vivo en §1b — esto es solo para probar el camino "con key" que todavía no se ejerció.

---

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

---

## 5. Migración real de la Bóveda

El script está verificado en dry-run (dos veces, contra el backup real de tus datos,
`project/database/app.db.bak` — 10/10 hojas, resultado idéntico ambas veces, sin tocar nada). La
migración **real** (`python -m jarvis.cli.migrate_boveda`, sin `--dry-run`) todavía no se corrió nunca
sobre tu `jarvis.db` real — la corrés vos cuando decidas, según la instrucción original de la tarea.

---

## 6. Estado de la base de datos después de este QA

`project/database/jarvis.db` existe ahora por primera vez con el schema real (antes de esta sesión no
existía; toda la verificación previa de S1-S5 usaba paths de scratch aislados). Quedó completamente
vacía (sin entradas de prueba) después de la limpieza post-QA — es tu base real, lista para el primer
uso genuino.
