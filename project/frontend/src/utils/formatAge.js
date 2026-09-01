// Formato único de "edad relativa" para timestamps ISO UTC de Jarvis — reemplaza
// las implementaciones antes repartidas e inconsistentes entre JarvisInboxTab,
// JarvisEntitiesPanel y JarvisContextPanel.

const _NOW_THRESHOLD_S = 5
const _SECOND_S = 1
const _MINUTE_S = 60
const _HOUR_S = 3600
const _DAY_S = 86400

export function formatAge(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso.endsWith('Z') ? iso : `${iso}Z`).getTime()
  const s = Math.max(0, Math.round(diffMs / 1000))

  if (s < _NOW_THRESHOLD_S) return 'ahora'
  if (s < _MINUTE_S) return `${Math.round(s / _SECOND_S)}s`
  if (s < _HOUR_S) return `${Math.round(s / _MINUTE_S)}m`
  if (s < _DAY_S) return `${Math.round(s / _HOUR_S)}h`
  return `${Math.round(s / _DAY_S)}d`
}
