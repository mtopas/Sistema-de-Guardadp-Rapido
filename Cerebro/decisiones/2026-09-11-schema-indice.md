# El índice nuevo (poller de D:\Boveda) no reemplaza a `hojas`/`categorias` todavía

## Decisión

El schema del índice que arma el poller (Milestone 1) es descartable/exploratorio, con nombres
propios (ej. `vault_notas`), sin pretensión de ser el reemplazo definitivo de `hojas`/`categorias`.
No tiene `categoria_id` — la ruta de carpeta en `D:\Boveda` es la categoría, pero eso no se conecta
todavía a `main.py`/frontend/bot.

## Por qué

Diseñar ahora la tabla "definitiva" que va a usar `crud.py` es adivinar requisitos antes de tener
la integración real delante (paginación, búsqueda, qué necesita el frontend/bot). Es probable que
cuando llegue esa sesión y vea los requisitos reales, la tabla tenga que ajustarse igual — mejor
pagar ese costo de diseño cuando haya un caso de uso concreto, no antes. Mismo criterio ya usado
para las subcategorías de Bóveda ("no diseñar el árbol completo antes de tener contenido real").

En esta etapa el índice no está conectado a nada vivo — la app real sigue leyendo/escribiendo
`hojas`/`categorias` sin cambios, así que no hay dos fuentes de verdad compitiendo en la práctica
todavía, solo dos nombres de tabla coexistiendo hasta la sesión de integración real.

## Alternativa descartada

Opción A: diseñar el índice ya con la forma que `crud.py` necesitará (sin `categoria_id`, pensado
como reemplazo directo). Se descartó por el motivo de arriba — apostar la forma final sin la
integración real delante.
