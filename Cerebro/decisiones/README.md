# Decisiones tácticas — fusión Jarvis + Bóveda sobre D:\Boveda

Decisiones puntuales tomadas durante la implementación, una por archivo, para no repreguntarlas
entre sesiones. La decisión de arquitectura grande (la fusión completa) sigue en
`Cerebro/decisiones-implementacion.md` — acá solo lo táctico de cada etapa.

Formato de cada nota: `## Decisión` / `## Por qué` / `## Alternativa descartada` (si aplica).

## Índice

### Milestone 1 — indexador de D:\Boveda

- [2026-09-11-schema-indice.md](2026-09-11-schema-indice.md) — el índice nuevo no reemplaza a `hojas`/`categorias` todavía (Opción B)
- [2026-09-11-storage-indice.md](2026-09-11-storage-indice.md) — el índice nuevo vive en un archivo SQLite separado (`vault_index.db`)
- [2026-09-11-categorias-viejas-boveda.md](2026-09-11-categorias-viejas-boveda.md) — las categorías viejas de Bóveda se reemplazan por el árbol PARA (no conviven)

### Milestone 2 — conectar crud.py a D:\Boveda

- [2026-09-11-schema-hojas-categorias-vault.md](2026-09-11-schema-hojas-categorias-vault.md) — `categorias`/`hojas` se extienden con columnas de vínculo al vault (`vault_notas` de Milestone 1 queda retirado)
- [2026-09-11-sandbox-vault-dev-start.md](2026-09-11-sandbox-vault-dev-start.md) — `dev-start.ps1` extiende el sandbox a `D:\Boveda` (copia liviana, sin `_adjuntos/`)
- [2026-09-11-borrado-soft-basura.md](2026-09-11-borrado-soft-basura.md) — `DELETE` mueve a `05 - Basura/` en vez de borrar de verdad; carpetas estructurales nunca se borran
- [2026-09-11-deteccion-origen-post-hojas.md](2026-09-11-deteccion-origen-post-hojas.md) — `origen: app | telegram` se infiere del header `Origin`, comparado contra la lista de CORS
- [2026-09-11-fotos-dos-convenciones-unificadas-en-archivo.md](2026-09-11-fotos-dos-convenciones-unificadas-en-archivo.md) — frontend y bot usan convenciones distintas de contenido/apuntes para fotos; se unifican en el archivo

### Milestone 3 — fusión Jarvis (writer.py/index_writer.py) con D:\Boveda

- [2026-09-11-jarvis-authorship-columna-nueva.md](2026-09-11-jarvis-authorship-columna-nueva.md) — `memory_entries.authorship` nueva (corrige la resolución original "sin campo nuevo", no era viable con el flujo real de 2 pasos captura→procesamiento)
- [2026-09-11-jarvis-contenido-usuario-a-sin-categorizar.md](2026-09-11-jarvis-contenido-usuario-a-sin-categorizar.md) — contenido de usuario capturado por Jarvis entra siempre por `00 - Sin categorizar/`
- [2026-09-11-jarvis-archive-superseded-y-forget.md](2026-09-11-jarvis-archive-superseded-y-forget.md) — `valid_to` sigue inmediato; solo el movimiento físico a Archivo/Basura se gatea (o no, en el caso de forget_entry, que ya tenía su confirmación)

### Preparación de infraestructura (checkpoint final, nada ejecutado todavía)

- [2026-09-11-share-smb-boveda-homelab.md](2026-09-11-share-smb-boveda-homelab.md) — diseño y scripts del share SMB Windows↔homelab, con 2 riesgos abiertos para decidir antes de aplicar

### Verificación post-deploy (2026-09-15)

- [2026-09-15-agenda-authorship-ya-correcto.md](2026-09-15-agenda-authorship-ya-correcto.md) — `accept_proposal()` no seteaba `authorship` explícito para Agenda, pero el default de `capture_raw()` ya era el correcto; sin cambios de código
