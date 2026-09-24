# Tests E2E con Playwright

Suite de tests end-to-end para SGR usando Playwright. Verifica flujos completos desde el navegador, API y base de datos.

## Requisitos

- Backend de SGR levantado localmente
- Frontend corriendo o disponible para Playwright
- Puertos de desarrollo libres (default: 8765 para API, 5173 para frontend)

## Setup

### 1. Instalar Playwright (si no está ya instalado)

```bash
cd project/frontend
npm install -D @playwright/test
npx playwright install
```

### 2. Levantar backend en sandbox

El script `project/start-e2e-backend.py` levanta el backend con DB/vault temporales:

```bash
cd project
python start-e2e-backend.py [--port 8765] [--keep-data]
```

Esto imprimirá las variables de entorno necesarias:
```
export TEST_API_URL=http://127.0.0.1:8765
export TEST_VAULT_ROOT=/tmp/sgr-e2e-.../vault
```

### 3. Levantar frontend

En otra terminal:

```bash
cd project/frontend
npm run dev
```

Frontend se abrirá en http://127.0.0.1:5173 y llamará al API en http://127.0.0.1:8765 (configurable en `src/config.js`).

### 4. Ejecutar tests E2E

```bash
cd project/frontend

# Correr todos los tests
npx playwright test

# Correr un test específico
npx playwright test 02-agenda

# Modo UI (interactivo)
npx playwright test --ui

# Modo headed (ver el navegador)
npx playwright test --headed
```

## Estructura de tests

### Flujos implementados (✓) y pendientes (→)

- **✓ Flujo (2)**: Tarea creada en web → aparece en `/hoy` → callback la completa
  - Archivo: `02-agenda-task-flow.test.ts`
  - Cobertura: creación de tarea, verificación en UI y backend, marcado como completado

- **✓ Flujo (4)**: Nota en Bóveda → Markdown+SQLite+búsqueda consistentes
  - Archivo: `04-boveda-markdown-flow.test.ts`
  - Cobertura: creación de nota, persisten cia en DB/vault, búsqueda funcional

### Flujos diferidos (stretch goals)

- → **Flujo (1)**: Telegram registra gasto → aparece en web
  - Bloqueador: automatizar bot de Telegram sin mock es complejo
  - Requeriría: mock de Telegram o acceso controlado al bot real

- → **Flujo (3)**: Hábito marcado en web → Telegram lo refleja
  - Bloqueador: reciprocidad web→bot (verificar que cambios en web se propaguen a Telegram en tiempo real)

- → **Flujo (5)**: Jarvis responde citando fuente válida
  - Bloqueador: requ iere Ollama corriendo + dataset de RAG sembrado
  - Requeriría: fixture que seedee embeddings + respuestas verificables

## Notas de desarrollo

- **Timeouts**: Los tests tienen timeout de 30s por defecto. Aumentar si la máquina es lenta.
- **Env vars**: Los tests usan `TEST_API_URL` y `TEST_VAULT_ROOT` del environment. Si no están seteadas, usan defaults (localhost:8765, `project/database/test-vault`).
- **Selectores**: Usar clases CSS stables (ej. `topbar-cta`) antes que texto (ej. `text=Guardar`), para evitar roturas por cambios de idioma o UI.
- **Tolerancia**: Los tests permiten que la UI no tenga siempre indicadores visuales perfectos — se verifican acciones en backend en lugar de solo checks visuales.

## Troubleshooting

### Backend no responde
```bash
curl http://127.0.0.1:8765/hojas/
```

Si devuelve error, verificar que `start-e2e-backend.py` esté corriendo y que no haya conflictos de puerto.

### Tests cuelgan esperando elementos
- Aumentar timeout: `test.use({ timeout: 60000 })`
- Verificar que el selector sea correcto: ejecutar test con `--headed` para verlo en vivo
- Revisar console.log de Playwright: `npx playwright test --debug`

### DB/vault no se crea
- Verificar permisos de escritura en `/tmp` o ruta de `VAULT_ROOT`
- Si usas `--keep-data`, los archivos se guardan para debugging

## Roadmap

- [ ] Tests para Finanzas (crear movimiento, verificar dashboard)
- [ ] Tests para Hábitos (crear hábito, registrar completitud)
- [ ] Mock de Telegram para flujos (1) y (3)
- [ ] Fixtures compartidas para setup/teardown de DB
- [ ] CI integration (GitHub Actions)
- [ ] Visual regression tests (Percy, Chromatic)
