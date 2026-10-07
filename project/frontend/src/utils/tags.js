/** Extract unique lowercase #tags from hoja content + apuntes */
export function extractTags(content, apuntes) {
  const text = [
    content || '',
    (apuntes || '').replace(/<[^>]*>/g, ' '),
  ].join(' ')
  const matches = text.match(/#([a-zA-Z]\w*)/g) || []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

/** Tags propios persistidos + hashtags legacy, sin duplicados. */
export function getHojaTags(hoja) {
  const source = Array.isArray(hoja?.tags)
    ? hoja.tags
    : extractTags(hoja?.contenido, hoja?.apuntes)
  return [...new Set(source.map(tag => String(tag).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))]
}

export function removeTag(tags, tag) {
  const target = String(tag || '').replace(/^#/, '').toLowerCase()
  return (Array.isArray(tags) ? tags : []).filter(item => (
    String(item).replace(/^#/, '').toLowerCase() !== target
  ))
}
