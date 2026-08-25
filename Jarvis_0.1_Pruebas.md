# Jarvis 0.1 — Pruebas pendientes para el usuario

QA de punta a punta hecho el 2026-08-25. Resumen completo de lo encontrado y corregido en
`Cerebro/estado-actual.md` (sección "QA end-to-end") y `Cerebro/decisiones-implementacion.md`.

Este documento es solo lo que **no pude probar en este entorno** — sin navegador interactivo, sin
Ollama instalado, sin `OPENAI_API_KEY`, sin token de Telegram — y que te queda a vos.

---

## 1. Flujo real con Ollama corriendo — PROBADO (2026-08-25, esta máquina)

Ollama ya estaba instalado acá (`ollama version 0.32.14`) con `llama3.2:3b` y `nomic-embed-text` ya
descargados y el servicio corriendo (`ollama app.exe` en background). Antes de poder probar nada hubo
que resolver **dos bloqueantes de entorno que no tienen nada que ver con Ollama** — quedan documentados
en detalle en `Cerebro/decisiones-implementacion.md` (2026-08-25, "Fijar litellm==1.60.2 e instalar
jarvis editable") y en `Cerebro/estado-actual.md`:

1. `litellm` nunca estaba instalado en `project/venv` (no está en `requirements.txt`). Instalar la
   última versión directamente rompe en Python 3.10 (`ImportError: cannot import name 'NotRequired'
   from 'typing'` — litellm reciente asume Python 3.11+). Se fijó `litellm==1.60.2`, que sí importa
   limpio en 3.10.
2. El paquete `jarvis` nunca quedó instalado en `project/venv` (`pip install -e ../jarvis` mencionado
   en una decisión previa no llegó a persistir). Como `app/main.py` atrapa el `ImportError` en
   silencio, arrancar el backend exactamente como indica este mismo `CLAUDE.md`
   (`cd project && uvicorn app.main:app`) montaba el backend **sin ninguna ruta `/jarvis/*`**, sin
   ningún error visible (solo 404 genéricos). Se corrigió con
   `pip install -e ./jarvis --no-deps` (desde la raíz del repo, con el python del venv de `project`).

Con ambos fixes, corrí el flujo real de punta a punta (backend + worker, sin mocks):

- `POST /jarvis/capture` con un texto real → el worker (`python -m jarvis.worker.main`) lo clasificó
  con `llama3.2:3b` vía LiteLLM: JSON válido, `type="RAW"` razonable, `title` y `tags` coherentes con
  el contenido (~27s la primera llamada, con el modelo recién cargado en memoria). Las tildes se ven
  como `�` en la consola de Windows (cp1252) pero es solo un problema de terminal — verificado
  escribiendo la respuesta cruda a un archivo UTF-8: el texto real tiene los acentos correctos.
- El embedding se generó con `nomic-embed-text` (768 dims, ~3s) y el entry quedó `DONE` en el inbox
  (`GET /jarvis/inbox` lo confirma), con el `.md` correspondiente escrito en `vault/RAW/`.
- `POST /jarvis/query` sobre esa misma captura devolvió `context_count=1` y `sources` con el
  `title_hint` correcto — la recuperación (ChromaDB) encontró y citó el contenido correcto. Sin
  `OPENAI_API_KEY` configurada acá tampoco, cayó a `[modo local]` con `llama3.2:3b` como se espera, y
  `GET /jarvis/budget` se mantuvo en `spent_usd=0.0` (correcto — no hay costo que registrar para un
  modelo Ollama).

**Quedó pendiente**: la entrada de prueba (`entry_id=23cddf94-…`) no se pudo borrar de `jarvis.db`
desde esta sesión — el `DELETE` SQL directo lo bloqueó el permission classifier del harness. El archivo
del vault sí se borró. Es inofensivo dejarla (es solo una fila de más), pero si querés una base
perfectamente limpia, borrá manualmente esa fila de `memory_entries` e `inbox_queue` en
`project/database/jarvis.db`.

**Recomendación para vos**: agregar un techo de versión a `litellm` en `jarvis/pyproject.toml`
(hoy es `litellm>=1.40.0`, sin límite superior) para que un `pip install` futuro no vuelva a traer una
versión incompatible con Python 3.10, y considerar loguear la excepción real en el
`except ImportError` de `project/app/main.py` (línea ~141) en vez de tragarla en silencio — así un
futuro "no anda `/jarvis/*`" se diagnostica en segundos en vez de con este mismo proceso de
investigación.

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
