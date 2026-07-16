# Rol

Sos un estratega de producto + arquitecto de software senior con experiencia en:
- apps personales offline-first / second brain / finanzas personales
- producto indie → producto profesional (calidad, DX, empaquetado, confianza)
- monetización ética de software local (licencias, open-core, services)
- auditoría de arquitectura full-stack (FastAPI + React + SQLite)

Tu tarea NO es reescribir el código. Tu tarea es producir un **informe accionable** sobre cómo llevar el proyecto SGR al siguiente nivel: profesional, confiable, diferenciado y de alto valor percibido.

# Contexto del proyecto (SGR)

**SGR** (Sistema de Guardado Rápido) es una app **local, full-stack, en español**, offline-first, con cuatro módulos:

| Módulo | Rol |
|--------|-----|
| **Bóveda** | Captura texto/link/foto en categorías jerárquicas; grafo D3 o lista; TipTap |
| **Finanzas** | Movimientos, dashboard mensual, Anual, FIRE, Ahorro, Datos; dólar MEP |
| **Agenda** | Calendario, HOY + time blocking, tareas, revisión semanal, horario facultad |
| **Hábitos** | Grilla mensual, progreso (heatmap/stats), historial, rachas |

**Stack actual**
- Backend: FastAPI, Pydantic, uvicorn, SQLite (`init_db()` al arrancar)
- Frontend: React 18, Vite, React Router, Zustand (un solo store), Tailwind + CSS vars / temas
- Bot Telegram (única pieza “online”) que llama al mismo REST local
- Empaquetado Windows con PyInstaller (`.exe`); datos en `database/` + `uploads/`
- Homelab Docker (API + bot) con sync homelab ↔ Windows (pull al abrir / push al cerrar)
- Licencia: MIT + Commons Clause (uso personal libre; comercial con permiso)

**Arquitectura actual (importante)**
```
Componente → useStore.js → fetch → app/main.py → app/db/crud.py → SQLite
```
- Backend plano: rutas concentradas en `main.py`; SQL en `crud.py`; `routes/` y `services/` existen pero no se usan
- Sin React Query; mutaciones optimistas + fallback offline
- Dual schema parcial en Finanzas (`type/amount` vs `tipo/monto`) con `normalizeMovimiento()`
- Sync entre dos SQLite (Windows vs homelab) — fuente canónica en homelab

**Documentación del repo a leer si tenés acceso**
- `CLAUDE.md`, `HOMELAB.md`
- `project/README.md`
- `project/Finanzas.md`, `project/Finanzas-Roadmap.md`
- `project/Boveda.md`, `project/Boveda-Roadmap.md`
- `project/Agenda.md`, `project/Agenda-Roadmap.md`
- `project/Habitos.md`, `project/Habitos-Roadmap.md`
- `project/Bot.md`, `project/BUILD.md`, `project/SYNC-WINDOWS.md`

Si NO tenés el repo, pedí al usuario esos archivos o trabajá solo con este brief y marcá supuestos explícitamente.

# Objetivo del informe

Responder con profundidad:

1. ¿Qué es SGR hoy (estado real, no aspiracional)?
2. ¿Qué lo hace potencialmente valioso vs Notion / Obsidian / YNAB / Habitica / Google Calendar + Excel?
3. ¿Qué deficiencias técnicas, de producto y de “packaging” impiden que se sienta profesional?
4. ¿Cómo convertirlo en un producto de alto valor (personal flagship y/o producto compartible)?
5. ¿Qué roadmap priorizado maximiza impacto con el menor riesgo?

Definí “profesional y de alto valor” en estos ejes (evaluá cada uno):
- **Confiabilidad**: datos, sync, backups, migraciones, cero pérdida
- **Calidad de producto**: UX cohesiva, onboarding, polish, accesibilidad
- **Arquitectura manteníble**: límites de módulo, tests, observabilidad
- **Distribución**: instalador, updates, DX del `.exe` y homelab
- **Diferenciación**: tesis de producto clara (no “otro todo-en-uno”)
- **Valor percibido / monetización**: para el autor y, si aplica, para terceros sin romper Commons Clause
- **Riesgo**: deuda crítica, sync dual-DB, monolito de store/backend plano

# Restricciones

- Sé concreto: nada de frases genéricas tipo “mejorar la UX” sin ejemplo y criterio de done.
- Priorizá realidad del stack actual; no propongas reescribir a otro framework salvo justificación fuerte (ROI).
- Respetá la identidad offline-first; el bot Telegram es la excepción online.
- Distinguí: **must-have profesional** vs **nice-to-have** vs **futuro lejano**.
- Separá recomendaciones **para uso personal elite** vs **para producto publicable**.
- Cuando propongas refactors (partir `main.py`/`crud.py`/`useStore.js`, React Query, etc.), indicá esfuerzo relativo (S/M/L) e impacto (alto/medio/bajo).
- Incluí métricas de éxito verificables (ej. “sync sin pérdida en 20 ciclos open/close”, “tests de reglas FIRE/objetivos”, “instalador one-click”).
- Si falta información, listá preguntas abiertas; no inventes features inexistentes como si ya estuvieran hechas.

# Formato de entrega (OBLIGATORIO)

Devolvé **un único archivo Markdown** llamado:

`SGR-Informe-Siguiente-Nivel.md`

El contenido del archivo debe seguir exactamente esta estructura:

```md
# SGR — Informe: camino al siguiente nivel

## 1. Executive summary (máx. 12 líneas)
Veredicto + 3 palancas de mayor ROI.

## 2. Diagnóstico del estado actual
### 2.1 Fortalezas reales
### 2.2 Debilidades / deuda
### 2.3 Riesgos críticos (datos, sync, mantenimiento)
### 2.4 Posicionamiento vs alternativas

## 3. Tesis de producto de alto valor
Qué debería ser SGR en una frase + anti-metas (qué NO debería convertirse).

## 4. Norte profesional (definición de “listo”)
Checklist de calidad profesional (producto, ingeniería, distribución, confianza).

## 5. Plan por horizontes
### 5.1 Horizonte 0 — Estabilizar (2–4 semanas)
### 5.2 Horizonte 1 — Producto confiable (1–2 meses)
### 5.3 Horizonte 2 — Alto valor / diferenciación (2–4 meses)
### 5.4 Horizonte 3 — Escala opcional (solo si se publica)

Para cada ítem: problema → acción → esfuerzo (S/M/L) → impacto → Definition of Done.

## 6. Roadmap técnico priorizado
Arquitectura, testing, sync/backups, build/release, observabilidad, i18n/temas, módulos.

## 7. Roadmap de producto/UX priorizado
Onboarding, cohesión entre módulos, momentos “wow”, reducción de fricción diaria.

## 8. Matriz de priorización
Tabla: iniciativa | impacto | esfuerzo | riesgo | prioridad (P0/P1/P2).

## 9. Quick wins (10 o menos)
Cambios chicos con percepción grande de calidad.

## 10. Lo que conviene NO hacer ahora
Trampas de scope / rewrites prematuras.

## 11. Preguntas abiertas para el dueño del proyecto
Decisiones de producto que solo el autor puede cerrar.

## 12. Plan de 30 días (semana a semana)
Secuencia ejecutable empezando mañana.
```

# Criterios de calidad del informe

- Específico al dominio SGR (Bóveda/Finanzas/Agenda/Hábitos/Bot/Sync), no un ensayo genérico de “mejores prácticas”.
- Priorización brutal: máximo 5 iniciativas P0.
- Lenguaje claro en español, tono directo, sin relleno.
- Si el usuario te da roadmaps existentes (`*-Roadmap.md`), **integrálos y reconcílialos** (no los ignores ni los dupliques sin criterio).

# Output

Escribí / guardá el archivo `SGR-Informe-Siguiente-Nivel.md` completo con el informe.
No respondas solo con un resumen en el chat: el entregable principal es ese `.md`.
