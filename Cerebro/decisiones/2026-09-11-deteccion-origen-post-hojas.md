# `origen: app | telegram` se infiere del header `Origin`, comparado contra la lista de CORS ya declarada

## Decisión

`main.py` define `FRONTEND_ORIGINS` (antes un literal inline en `CORSMiddleware`) y lo reusa
en `_detectar_origen(request)`: si el header `Origin` de la request coincide con
`FRONTEND_ORIGINS` **o** con el propio origen de la request (`scheme://netloc`, para el `.exe`
empaquetado donde frontend y API comparten host), el `origen` escrito en el frontmatter es
`app`; si no (falta o no matchea), es `telegram`. `python-requests` (el bot) no manda `Origin`
por defecto; el `fetch` del navegador sí.

## Por qué

`POST /hojas` no puede ganar un campo `origen` explícito sin tocar `bot.py` y el frontend
(fuera de alcance — el contrato de la API queda idéntico). El header `Origin` ya es una señal
que el navegador manda solo (no hace falta que ningún cliente la agregue a propósito), y
compararlo contra la misma lista que ya usa `CORSMiddleware` reusa una fuente de verdad
existente ("qué orígenes confía este backend") en vez de inventar una regla nueva implícita
(refinamiento pedido explícitamente al revisar la propuesta original de comparar solo
presencia/ausencia del header).

El caso del `.exe` empaquetado (`BUILD.md`: frontend y API sirven desde el mismo origen
`http://127.0.0.1:8765`) se cubre agregando el propio origen de la request como "conocido" —
si no, esas capturas quedarían mal clasificadas como `telegram` por estar fuera de los puertos
de dev de Vite.

## Alternativa descartada

`User-Agent`: `python-requests` manda un UA por defecto reconocible, pero es más frágil (deja
de servir si el bot cambia de librería HTTP algún día) y no reusa ninguna fuente de verdad ya
existente en el backend, a diferencia de la lista de orígenes CORS.
