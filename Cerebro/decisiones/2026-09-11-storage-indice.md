# El índice nuevo vive en un archivo SQLite separado (`vault_index.db`)

## Decisión

El índice que arma el poller de `D:\Boveda` vive en `project/database/vault_index.db`, un archivo
separado — no en tablas nuevas dentro de `app.db`.

## Por qué

Consecuencia directa de [2026-09-11-schema-indice.md](2026-09-11-schema-indice.md): si el schema ya
es descartable/exploratorio, el almacenamiento también debería serlo — un archivo que se borra y se
reconstruye sin pensar, en vez de tablas mezcladas en el mismo archivo que tiene datos reales
(`fin_movimientos`, `agenda_eventos`, `hojas`). Menos fricción para iterar, cero riesgo de tocar por
accidente datos reales durante la experimentación. Mismo patrón que ya usa el proyecto:
`jarvis.db` está separado de `app.db` por la misma razón (subsistema distinto, ciclo de vida
distinto), y ChromaDB vive en su propia carpeta como índice reconstruible.

Si en la sesión de integración real conviene un solo archivo, mover tablas de un SQLite a otro es
mecánico y barato — no hace falta pagar ese costo ahora.

## Alternativa descartada

Tablas nuevas con nombre distinto dentro de `app.db` — más "cerca" de cómo se conectaría después,
pero ese argumento de cercanía es el mismo que se descartó para el schema: no reduce trabajo real
más adelante, solo da una sensación de estar más avanzado.
