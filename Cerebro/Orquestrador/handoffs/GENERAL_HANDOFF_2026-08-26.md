# Handoff — Chat General / Orquestador
**Fecha:** 2026-08-26
**Sesión saliente:** 0d2890ce-cc43-47fe-8e39-b5cf1ae1c43f
**Para:** General-2 (próxima instancia del orquestador)

---

## 1. ESTADO DEL PROYECTO HOY

### SGR (Sistema de Guardado Rápido)
- Funciona. Backend `:8765`, frontend `:5173`, bot Telegram OK.
- Módulos Bóveda, Finanzas, Agenda, Hábitos — estables, sin trabajo activo pendiente.

### Jarvis — COMPLETO hasta 0.2 + features adicionales

| Componente | Estado |
|------------|--------|
| Jarvis 0.1 (5 slices) | COMPLETO, QA hecho |
| 0.2-S1 Consolidación diaria | COMPLETO |
| 0.2-S2 Retrieval coarse-to-fine | COMPLETO |
| 0.2-S3 Entidades PEOPLE | COMPLETO |
| Pre-enqueue clarification (DECISION) | COMPLETO |
| Worker notify telegram | COMPLETO |
| Deploy homelab Docker 24/7 | COMPLETO |
| Rediseño visual | **PARCIAL — VER SECCIÓN 2** |

---

## 2. TRABAJO EN CURSO — REDISEÑO VISUAL JARVIS (PARCIAL)

Esta es la única tarea interrumpida que tiene código a medias en disco.

### Qué existe en disco pero NO está conectado

**Backend (listo, requiere reiniciar uvicorn):**
- `jarvis/api/router.py` — endpoints `GET /jarvis/stats` y `GET /jarvis/projects`

**Frontend — componentes nuevos, sin conectar a JarvisScreen:**
- `project/frontend/src/index.css` — animaciones `jv-*` + clase `.jv-root` dark theme
- `project/frontend/src/components/jarvis/NeuralCanvas.jsx` — canvas animado fondo
- `project/frontend/src/components/jarvis/JarvisLeftPanel.jsx` — panel izq (tipos, proyectos)
- `project/frontend/src/components/jarvis/JarvisRightPanel.jsx` — panel der (en proceso, entidades)
- `project/frontend/src/components/jarvis/JarvisInboxTab.jsx` — tab inbox central
- `project/frontend/src/components/jarvis/JarvisEntitiesTab.jsx` — tab entidades con click→chat
- `project/frontend/src/components/jarvis/JarvisDebugTab.jsx` — tab debug/stats
- `project/frontend/src/store/useStore.js` — jarvisTab, jarvisStats, jarvisEntities, jarvisProjects + acciones fetch

**Store:** buscar `jarvisTab:` en useStore.js — está insertado antes del cierre del store.

### Qué falta para terminar

1. **`JarvisScreen.jsx`** — reescribir completo:
   - `className="jv-root"` en el contenedor raíz
   - `useEffect` que hace `document.body.setAttribute('data-jarvis','1')` al montar y lo remueve al desmontar
   - Canvas de fondo: `<NeuralCanvas />` con `position: absolute, inset: 0, zIndex: 0`
   - Layout 3 columnas: `246px | 1fr | 322px`, los paneles fijos
   - Sub-header con pills de tabs + budget bars + health dot
   - Renderizado condicional por `jarvisTab`: chat | inbox | entities | debug
   - Llamar a `fetchJarvisStats()` y `fetchJarvisProjects()` en el mount

2. **`JarvisChat.jsx`** — rediseñar con el dark theme:
   - Burbujas usuario: gradiente `var(--cta-bg)`, border-radius asimétrico
   - Respuestas Jarvis: surface dark, fuentes con color del tipo de memoria
   - Ask-bubble: ámbar `#fbbf24`
   - Saved-chip: color del tipo con animación `jv-rise`
   - Typing indicator: 3 dots con colores RAW/PROJECT/PEOPLE ciclando
   - Composer: border con efecto sweep rainbow (`animation: jv-sweep 14s linear infinite`)
   - Badge tipo detectado (port de `guessType()` del mockup)

**Referencia de diseño:** `C:\Users\Provincias\Downloads\Jarvis_ segundo cerebro AI personal\Jarvis.dc.html`

**El screen actual funciona sin regresiones** — nada está roto, solo incompleto.

---

## 3. RESTRICCIONES TÉCNICAS CRÍTICAS

Incluir en cualquier prompt worker que toque Jarvis:

```
- Puerto API: 8765 (nunca 8000)
- jarvis/ en minúscula (import falla en Windows con Jarvis/)
- litellm==1.60.2 fijado (Python 3.10 compat)
- numpy<2 en pyproject.toml (CPU homelab: AMD Athlon II X2 2009, SIGILL con numpy>=2)
- Ollama: prefijo ollama_chat/ (no ollama/) para modelos instruct
- Nunca openai.* ni ollama.* directamente — siempre via LiteLLM
- origin_trust nunca sube en derivados
- source_id obligatorio en toda escritura al memory store
- Docker build context = root del repo
```

---

## 4. PRÓXIMOS PASOS RECOMENDADOS

**Inmediato (cuando el usuario quiera):**
- Completar el rediseño visual — crear prompt worker para implementar JarvisScreen.jsx y JarvisChat.jsx
  con el diseño del mockup. Todos los componentes auxiliares ya existen.

**Después (0.3, cuando haya necesidad demostrada):**
- pgvector + PostgreSQL (solo si retrieval falla en escala)
- Graphiti (grafo temporal — el salto de calidad más grande)
- ActivityWatch (contexto de actividad sin captura explícita)

---

## 5. DOCUMENTOS PERSISTENTES A LEER

En orden de prioridad para entender el estado real:

1. `Cerebro/estado-actual.md` — estado completo de todo
2. `CLAUDE.md` — arquitectura y convenciones canónicas
3. `Cerebro/decisiones-implementacion.md` — qué se cambió respecto a la spec y por qué
4. `HOMELAB.md` — infra Docker, sync
5. `jarvis/jarvis-spec.html §15, §25` — solo si hay trabajo de arquitectura Jarvis

---

## 6. MODELOS EN USO (producción homelab)

| Variable .env | Valor | Rol |
|---------------|-------|-----|
| `JARVIS_LOCAL_MODEL` | `ollama_chat/gemma3:12b` | Clasificación, extracción, coarse filter |
| `JARVIS_REASON_MODEL` | `openai/gpt-5.4-mini` | Consolidación, respuestas de calidad |
| Embeddings | `nomic-embed-text` via Ollama | ChromaDB |

Budget activo, OpenAI verificado en producción ($0.0101→$0.0111 en consulta real).

---

## 7. CONTEXTO DE TRABAJO

- Jarvis es personal — no multiusuario, no RBAC hasta que sea un producto.
- El usuario sabe que es el único usuario — no hace falta proteger rutas.
- Preferencia documentada: cuando el usuario pregunta "¿conviene hacer X?", el orquestador responde con 2-3 oraciones + recomendación. NO implementa hasta que el usuario confirme.

---

## 8. CÓMO INICIALIZAR ESTA INSTANCIA

1. Leer este handoff (ya lo estás leyendo).
2. Leer `Cerebro/estado-actual.md` para completar el cuadro.
3. Verificar que el trabajo en curso del punto 2 sigue siendo el más reciente (hacer `git log --oneline -5`).
4. Presentar al usuario: estado comprendido + preguntar si quiere seguir con el rediseño o cambiar de dirección.
