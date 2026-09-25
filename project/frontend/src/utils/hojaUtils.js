import { API_URL } from '../config'

/** Título visible de una hoja (sin URLs embebidas en el texto). */
export function getHojaDisplayTitle(hoja) {
  if (!hoja?.contenido) return ''
  const stripped = hoja.contenido.replace(/https?:\/\/\S+/g, '').trim()
  return stripped.slice(0, 200) || hoja.contenido.slice(0, 200)
}

export function getHojaImageUrl(hoja) {
  if (hoja?.tipo !== 'foto') return null
  const src = hoja.apuntes?.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
  if (!src) return hoja.contenido?.startsWith('/adjuntos/') ? API_URL + hoja.contenido : null
  const attachment = src.match(/\/adjuntos\/[^"'?\s]+/)
  return attachment ? API_URL + attachment[0] : src.startsWith('/') ? API_URL + src : src
}

export function getHojaEditableApuntes(hoja) {
  if (!hoja?.apuntes) return ''
  return hoja.tipo === 'foto'
    ? hoja.apuntes.replace(/^\s*<img\b[^>]*\/?>/i, '')
    : hoja.apuntes
}
