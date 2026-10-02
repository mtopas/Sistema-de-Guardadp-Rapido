// Helpers de captura de hojas de Bóveda: modelo "un solo campo de cuerpo".
//
// Decisión de producto 2026-10-02 (#12 + #13): la captura rápida de texto
// escribe el CUERPO en `apuntes`; el título (`contenido`) se AUTOGENERA de la
// primera línea no vacía del cuerpo. El título queda editable después en
// DetailScreen. La seguridad como nombre de archivo y las colisiones las
// resuelve el backend (app/vault/writer.py: sanitize_nombre /
// nombre_archivo_unico); acá solo producimos un título legible y no vacío.

const _URL_RE = /https?:\/\/[^\s<>"')\]]+/

/** Primera línea no vacía del cuerpo, sin marcadores Markdown de apertura. */
function _primeraLinea(cuerpo) {
  const texto = String(cuerpo ?? '').replace(/\r/g, '')
  for (const linea of texto.split('\n')) {
    const t = linea.trim()
    if (t) {
      return t
        .replace(/^#{1,6}\s+/, '')   // encabezados
        .replace(/^>\s+/, '')        // citas
        .replace(/^[-*+]\s+/, '')    // viñetas
        .replace(/^\d+[.)]\s+/, '')  // listas numeradas
        .trim()
    }
  }
  return ''
}

/** Dominio sin "www." de una URL, o la URL cruda si no parsea. */
function _dominio(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host || url
  } catch {
    return url
  }
}

/**
 * Título autogenerado a partir del cuerpo de una nota.
 * - Usa la primera línea no vacía (sin markdown de apertura).
 * - Si esa línea es solo un link, deriva el dominio.
 * - Si tiene texto + link, descarta la URL cruda y conserva el texto.
 * - Nunca devuelve vacío (fallback "Sin título").
 * - Trunca a `maxLen` caracteres.
 */
export function tituloDesdeCuerpo(cuerpo, maxLen = 80) {
  const linea = _primeraLinea(cuerpo)
  if (!linea) return 'Sin título'

  let titulo
  if (new RegExp(`^${_URL_RE.source}$`).test(linea)) {
    titulo = _dominio(linea)
  } else {
    titulo = linea.replace(new RegExp(_URL_RE.source, 'g'), '').replace(/\s+/g, ' ').trim()
    if (!titulo) {
      const m = linea.match(_URL_RE)
      titulo = m ? _dominio(m[0]) : ''
    }
  }

  titulo = titulo.trim()
  if (!titulo) return 'Sin título'
  return titulo.length > maxLen ? titulo.slice(0, maxLen).trim() : titulo
}

/**
 * Convierte el texto plano del textarea de captura a HTML simple para `apuntes`
 * (el backend lo normaliza a Markdown y TipTap lo re-renderiza igual). Separa
 * párrafos por línea en blanco; dentro de un párrafo, los saltos simples van a
 * <br>. Escapa el HTML del usuario.
 */
export function textoPlanoAHtml(texto) {
  const t = String(texto ?? '').replace(/\r/g, '').trim()
  if (!t) return ''
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return t
    .split(/\n{2,}/)
    .map((par) => '<p>' + par.split('\n').map(esc).join('<br>') + '</p>')
    .join('')
}

/**
 * Primer link http(s) que aparezca en CUALQUIER parte del cuerpo (texto o HTML).
 * Devuelve null si no hay. Base de la preview de link (#10): la preview cuelga
 * del primer link del cuerpo, no del título.
 */
export function primerLinkEnCuerpo(cuerpo) {
  if (!cuerpo) return null
  const m = String(cuerpo).match(_URL_RE)
  if (!m) return null
  return m[0].replace(/[.,;:]+$/, '')
}
