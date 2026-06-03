/** Título visible de una hoja (sin URLs embebidas en el texto). */
export function getHojaDisplayTitle(hoja) {
  if (!hoja?.contenido) return ''
  const stripped = hoja.contenido.replace(/https?:\/\/\S+/g, '').trim()
  return stripped.slice(0, 200) || hoja.contenido.slice(0, 200)
}
