# Fotos: frontend y bot usan convenciones distintas de `contenido`/`apuntes` — se detectan las dos, el archivo queda unificado

## Contexto (hallazgo durante la implementación, no estaba documentado)

Al implementar la escritura de hojas tipo `foto` se encontró que **dos convenciones
distintas conviven hoy** en el `POST /hojas` real, ninguna documentada con precisión en
`Boveda.md` (que decía "contenido = URL de /uploads/"):

- **Frontend** (`CaptureModal.jsx`): `contenido` = URL de `/uploads/…`; `apuntes` no se manda.
- **Bot** (`mybot/bot.py`, `handle_photo`/`STEP_PHOTO_TITLE`): `contenido` = título/caption;
  `apuntes` trae un `<img src="URL ABSOLUTA de /uploads/…">` como primera etiqueta.

La única pieza de la UI que realmente pinta la foto es `RightPanel.jsx`: extrae el `<img>`
líder de `apuntes` con una regex (`photoImgHtml`) y lo separa del resto para TipTap. Las fotos
creadas por el frontend, al no mandar `apuntes`, **nunca se mostraban** en `RightPanel` — gap
preexistente, no introducido por esta sesión.

## Decisión

`crear_hoja`/`actualizar_hoja` (`app/db/crud.py`) detectan el archivo subido mirando tanto
`contenido` como `apuntes` (`_extraer_upload_filename`). En el `.md`, la foto queda **siempre**
como imagen Markdown al principio del cuerpo (`![título](_adjuntos/archivo.ext)`),
independientemente de qué cliente la creó. Al leer (`GET /hojas`, tanto en la respuesta
inmediata de create/update como en `app/vault/sync.py` al resincronizar desde el archivo),
`apuntes` se reconstruye **siempre** con el `<img>` líder (URL absoluta a `/adjuntos/…`, mismo
estilo inline que ya usa el bot) — `app/vault/markdown.py::construir_apuntes_html_foto()`, una
sola implementación compartida entre el path de escritura y el de sincronización para no
divergir.

Efecto secundario deseado: las fotos capturadas por el frontend ahora **sí** se van a ver en
`RightPanel` (antes no se veían) — no es una regresión, cierra el gap preexistente sin haber
sido pedido explícitamente, consecuencia directa de unificar el formato en el archivo.

## Por qué

El contrato de la API debía quedar idéntico para ambos clientes sin tocarlos — pero el
*archivo* en disco sí necesitaba una representación única y coherente (no puede haber dos
formatos de frontmatter/cuerpo según quién creó la nota, o un resync futuro no sabría cuál
aplicar). Detectar ambas convenciones en la entrada y unificar en la salida/archivo resuelve
esto sin pedirle nada nuevo a `bot.py` ni al frontend.

## Nota técnica relacionada (mismo hallazgo)

PyYAML interpreta valores tipo `2026-09-11T14:31:18-03:00` sin comillas como `datetime`
nativo al parsear el frontmatter, no como string. `str(datetime)` pierde la `T` (usa espacio),
lo que iba a degradar el formato ISO8601 documentado en los README del vault en cuanto un
archivo se releyera y reescribiera. Fix: `app/vault/parser.py::_iso_str()` usa
`.isoformat()` en vez de `str()` para estos campos al parsear.
