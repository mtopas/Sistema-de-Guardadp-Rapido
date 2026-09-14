# `DELETE /hojas/{id}` y `DELETE /categorias/{id}?forzar=true` mueven a `05 - Basura/` en vez de borrar de verdad

## Decisión

`DELETE /hojas/{id}` mueve el `.md` a `05 - Basura/` (soft-delete) en vez de borrarlo. La fila
de `hojas` se actualiza (`ruta`, `categoria_id` → la de Basura) en vez de eliminarse — la hoja
sigue existiendo, ahora bajo la categoría Basura, recuperable moviéndola a otra categoría
desde la app.

`DELETE /categorias/{id}?forzar=true` sobre una carpeta con notas: cada nota se mueve a
`05 - Basura/` (mismo criterio) y la carpeta, ya vacía, se borra. **Excepción dura**: las
carpetas estructurales del árbol PARA (las 6 raíces `00`–`05` y los dominios fijos de
`02 - Areas/`/`03 - Recursos/`: `Facultad`, `Carrera Profesional`, `Salud`,
`Desarrollo Personal`) nunca se borran por esta vía, con o sin `forzar=true` — se marcan
`estructural=1` en `categorias` y el endpoint devuelve 409. Renombrar/mover una categoría
estructural también queda bloqueado en `PATCH /categorias/{id}` — si no, renombrar por
ejemplo `02 - Areas` le haría perder la protección de borrado en el próximo sync (que
reconoce las carpetas fijas por nombre).

## Por qué

El propio `D:\Boveda\05 - Basura\README.md` ya documentaba la intención: "candidatos a
borrar, con demora antes de eliminarlos de verdad". Con hojas como archivos reales, un
`DELETE` de verdad es irreversible de una forma que la UI actual (confirmación simple, sin
undo) no comunica bien. Mover a Basura es coherente con la convención que el propio vault ya
define, y barato de implementar (mismo `shutil.move` que ya usa el cambio de categoría).

Bloquear el borrado de carpetas estructurales evita que un `forzar=true` accidental (o un
futuro bug de UI) borre por ejemplo `02 - Areas` completo.

## Alternativa descartada

Mantener el borrado real de siempre. Se descartó por el riesgo de pérdida irreversible de
contenido real (antes eran filas de SQLite fáciles de recrear a mano si hacía falta; ahora son
archivos con contenido escrito por el usuario).
