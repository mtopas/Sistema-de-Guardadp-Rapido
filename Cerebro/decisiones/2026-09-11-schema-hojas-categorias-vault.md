# `categorias`/`hojas` se extienden con columnas de vínculo al vault, en vez de reemplazarse por el schema exploratorio de Milestone 1

## Decisión

`categorias` gana `ruta TEXT UNIQUE` (carpeta relativa dentro de `D:\Boveda`) y
`estructural INTEGER NOT NULL DEFAULT 0`; la constraint `UNIQUE` sobre `nombre` se retira
(reconstrucción de tabla, mismo patrón ya usado para `agenda_eventos` en `database.py`).
`hojas` gana `vault_id TEXT UNIQUE` (el `id` uuid4 del frontmatter), `ruta TEXT UNIQUE` y
`mtime REAL` (para saltar notas sin cambios en cada sync, igual que Milestone 1).
`hojas.id` (INTEGER PK autoincrement) **no cambia** — sigue siendo el id que ya usan
frontend y bot en las URLs; es un índice/caché sobre el archivo real, no la fuente de verdad.

`project/database/vault_index.db`/`vault_notas` (Milestone 1) queda **retirado** como
mecanismo de sincronización en vivo — su lógica de parseo se extrajo a
`app/vault/parser.py` (reusada tanto por `scripts/vault_indexer.py`, que sigue funcionando
como CLI de auditoría manual independiente de la API, como por la sincronización nueva en
`app/vault/sync.py`).

## Por qué

`categorias.nombre` con `UNIQUE` global no soporta el árbol real: carpetas como `Facultad`,
`Carrera Profesional`, `Desarrollo Personal`, `Salud` existen tanto bajo `02 - Areas/` como
bajo `03 - Recursos/` — insertar las dos violaría la constraint vieja. `ruta` sí es única de
verdad (es una carpeta real).

Milestone 1 dejó deliberadamente el schema de `vault_notas` como descartable/exploratorio,
precisamente para esta sesión ("Cerebro/decisiones/2026-09-11-schema-indice.md"). Con la
integración real delante, extender `hojas`/`categorias` in-place (en vez de mantener un
índice paralelo con id propio) evita traducir entre dos sistemas de ids y deja `hojas.id`
estable para frontend/bot, que es el requisito duro de esta sesión (contrato de API
idéntico).

## Alternativa descartada

Mantener `vault_notas` como el índice real y hacer que `crud.py` le pegue a esa tabla en vez
de a `hojas`/`categorias`. Se descartó porque el contrato HTTP expone ids enteros estables de
`hojas`/`categorias` desde siempre — meter una tabla con id propio (uuid) en el medio hubiera
significado mantener una tabla de mapeo id↔uuid extra, sin beneficio real.
