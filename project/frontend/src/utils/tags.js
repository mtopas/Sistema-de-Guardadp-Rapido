/** Extract unique lowercase #tags from hoja content + apuntes */
export function extractTags(content, apuntes) {
  const text = [
    content || '',
    (apuntes || '').replace(/<[^>]*>/g, ' '),
  ].join(' ')
  const matches = text.match(/#([a-zA-Z]\w*)/g) || []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}
