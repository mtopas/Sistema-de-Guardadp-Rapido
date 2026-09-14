# `archive_superseded`: el `valid_to` sigue siendo inmediato; solo el MOVIMIENTO DEL ARCHIVO se gatea

## Decisión

`_resolve_pair()` (same_fact) y `_mark_stale_by_age()` siguen marcando `valid_to` en SQL de forma
inmediata, sin gating — comportamiento ya probado, sin cambios. Lo nuevo: después de marcar,
proponen (`jarvis_audit_proposals`, `action_type='archive_superseded'`, décimo valor del CHECK) mover
el `.md` a `04 - Archivo/`. Si se acepta, recién ahí se mueve el archivo físico.

`forget_entry()` (el usuario ya pidió "olvidar" explícitamente, incluido `delete` de auditoría ya
aceptado) NO pasa por esta propuesta nueva — la confirmación humana ya existió. Mueve directo:
`05 - Basura/` si `authorship='user'` (es tu contenido), o borra directo el archivo si
`authorship='jarvis_synthesis'` (síntesis de Jarvis en `Boveda/Jarvis/`, reconstruible, no
"tu contenido" para conservar en una papelera).

## Por qué

El addendum de `decisiones-implementacion.md` ya distinguía los 3 disparadores de `valid_to`
(same_fact, stale, forget) y decía que solo los dos primeros ameritan la propuesta nueva. No se
tocó el comportamiento YA probado de marcar `valid_to` inmediato (sería un cambio de alcance mayor,
no pedido, y arriesgaría romper el gating de re-detección/re-penalización que `consolidation.py` ya
tiene bien resuelto) — se agregó únicamente el paso de la propuesta de archivado encima.

## Verificado (scratch, dataset de `seed_test.py`, nunca contra `jarvis.db`/`D:\Boveda` reales)

Corrida completa de `run_consolidation()`: 3 entradas marcadas obsoletas (same_fact) → exactamente
3 propuestas `archive_superseded` PENDING creadas, una por entrada, ninguna aplicada sola. Aceptar
una movió el `.md` real de `00 - Sin categorizar/` a `04 - Archivo/` (confirmado en disco, sin
duplicado). `forget_entry()` sobre una entrada de usuario movió su `.md` a `05 - Basura/`
(confirmado en disco). `accept_proposal('create')` para el hueco de entidad "José" creó una entrada
con `authorship='jarvis_synthesis'`; procesada por el worker, el `.md` cayó en
`Jarvis/Sintesis/` con el frontmatter rico completo (`confidence`/`origin_trust`/`valid_from`/
`valid_to`/`source_id`), y la ficha canónica se sincronizó en `Jarvis/Entidades/` con wikilink real
desde la entrada.

## Impacto

`jarvis/worker/consolidation.py` (`_propose_archive()` nueva, llamada desde `_resolve_pair()` y
`_mark_stale_by_age()`), `jarvis/audit/service.py` (`_apply_archive_superseded()`,
`propose_archive_superseded()`, rama nueva en `accept_proposal()`/`_resolve_with_new_info()`),
`jarvis/vault/writer.py` (`move_entry_file()` nueva, usada por ambos caminos), `jarvis/db/schema.py`
+ `database.py` (décimo `action_type`, migración `_migrate_audit_proposals_archive_superseded()`).
