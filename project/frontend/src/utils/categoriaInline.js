// Helpers puros del selector inline de categoría (#11). Separados del componente
// para poder testearlos sin arrastrar el store (que toca localStorage al cargar).

// Ruta exacta de la categoría inbox (misma que app/vault/sync.py y el triaje de
// Jarvis). Las hojas que caen ahí son las que el selector inline recategoriza.
export const RUTA_SIN_CATEGORIZAR = '00 - Sin categorizar'
export const RUTA_BASURA = '05 - Basura'

/** Etiqueta legible de una categoría a partir de su ruta ("02 - Areas/Salud" -> "Areas / Salud"). */
export function etiquetaCategoria(cat) {
  if (!cat?.ruta) return cat?.nombre || ''
  return cat.ruta
    .split('/')
    .map((seg) => seg.replace(/^\d+\s*-\s*/, '').trim())
    .join(' / ')
}

/** True si la hoja está en "00 - Sin categorizar". */
export function esSinCategorizar(hoja, categorias) {
  const cat = categorias.find((c) => c.id === hoja?.categoria_id)
  return cat?.ruta === RUTA_SIN_CATEGORIZAR
}

/** Destinos válidos para mover (todo menos el inbox y la basura), etiquetados y ordenados. */
export function opcionesDestino(categorias) {
  return categorias
    .filter((c) => c.ruta !== RUTA_SIN_CATEGORIZAR && !(c.ruta || '').startsWith(RUTA_BASURA))
    .map((c) => ({ id: c.id, label: etiquetaCategoria(c) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
