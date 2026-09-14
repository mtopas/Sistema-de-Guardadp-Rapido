# `dev-start.ps1` extiende el sandbox a `D:\Boveda` (copia liviana, sin `_adjuntos/`)

## Decisión

`scripts/dev-start.ps1` ahora copia, además de `app.db` → `app.db.dev`, la estructura de
`D:\Boveda` (carpetas + `.md`, con `robocopy *.md /E`) a `database\boveda.dev\`, seteando
`VAULT_ROOT` a esa copia para la sesión dev. **No copia el contenido de `_adjuntos/`**
(~765MB del vault real, casi todo binarios) — la carpeta sandbox `_adjuntos/` queda vacía,
lista para recibir fotos nuevas capturadas durante la prueba. Limpieza automática al salir
(`finally`), mismo patrón que ya tenía `app.db.dev`.

`app/config.py` gana `VAULT_ROOT` con el mismo patrón de override por variable de entorno que
ya usa `DB_PATH`.

## Por qué

Milestone 2 conecta `crud.py` para que escriba/mueva/borre archivos reales del vault —
probar eso contra el sandbox de solo `app.db` hubiera significado tocar `D:\Boveda` real
durante cada prueba. `dev-start.ps1` es el mecanismo de aislamiento ya resuelto del proyecto;
extenderlo con el mismo patrón (copiar al arrancar, limpiar al salir) es la opción consistente
en vez de inventar un mecanismo nuevo.

Excluir `_adjuntos/` de la copia es puramente de rendimiento: copiar 765MB en cada arranque de
sandbox lo haría lento; las pruebas de CRUD de notas no dependen del contenido real de los
adjuntos, solo de que la carpeta exista para recibir archivos nuevos.

## Alternativa descartada

Vault de prueba sintético (notas armadas a mano, no una copia real). Se descartó porque no
hubiera validado casos reales como nombres de carpeta repetidos bajo padres distintos
(`Facultad` en Áreas y en Recursos) ni el formato real de frontmatter ya migrado.
