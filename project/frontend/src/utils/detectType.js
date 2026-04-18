/**
 * Auto-detects whether a string is a URL (link) or plain text.
 * Returns 'link' | 'texto'
 */
export function detectType(text) {
  const trimmed = text.trim()
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'link'
  } catch (_) {}
  return 'texto'
}
