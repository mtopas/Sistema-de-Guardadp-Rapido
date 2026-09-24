# Changelog

Registro de cambios relevantes de SGR. Formato libre — no sigue estrictamente
[Keep a Changelog], pero se inspira en él: fecha + qué cambió y por qué importa,
no un diff línea por línea (eso ya lo muestra `git log`).

La versión activa vive en `project/app/config.py::SGR_VERSION` (override opcional
por env var `SGR_VERSION`) y se expone en `FastAPI(version=...)` — visible en
Settings → Información y en `GET /settings/status`.

## [0.1.0] - 2026-09-24

- Arranca el versionado real de SGR: antes `FastAPI()` no declaraba `version=`, así que
  Settings → Información mostraba el default genérico de FastAPI (`0.1.0` sin relación
  al proyecto) en vez de una versión propia. Ahora `SGR_VERSION` en `app/config.py`
  es la fuente de verdad y se propaga a `app.version` (`GET /settings/status`,
  `GET /openapi.json`).
- No hay convención previa de versionado semántico estricto en este repo de un solo
  desarrollador; se arranca en `0.1.0` como punto de partida razonable, sin implicar
  que todo lo construido hasta ahora (Bóveda, Finanzas, Agenda, Hábitos, Jarvis fase 0)
  quepa en un "0.1.0" literal — es simplemente donde arranca el contador.
- A partir de acá: bump manual de `SGR_VERSION` en cambios que ameriten una entrada
  nueva acá (releases del `.exe`, migraciones de schema, cambios de comportamiento
  visibles). Cambios chicos de housekeeping no requieren bump ni entrada.
