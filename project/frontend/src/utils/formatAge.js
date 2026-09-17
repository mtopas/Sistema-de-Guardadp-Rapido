// Formato único de "edad relativa" para timestamps ISO UTC de Jarvis — reemplaza
// las implementaciones antes repartidas e inconsistentes entre JarvisInboxTab,
// JarvisEntitiesPanel y JarvisContextPanel.

const _NOW_THRESHOLD_S = 5
const _SECOND_S = 1
const _MINUTE_S = 60
const _HOUR_S = 3600
const _DAY_S = 86400

// Timestamps de Jarvis vienen en dos formatos válidos según quién los generó:
// naive + "Z" a mano (ej. datetime.utcnow().isoformat() + "Z") o con offset explícito
// (ej. datetime.now(timezone.utc).isoformat() -> "...+00:00", ver
// jarvis/worker/processor.py::_set_status()). Agregarle "Z" a un string que ya
// termina en un offset numérico (`+00:00Z`) da una fecha inválida -> NaN -> "NaNd".
const _HAS_TZ = /(Z|[+-]\d{2}:\d{2})$/

export function formatAge(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(_HAS_TZ.test(iso) ? iso : `${iso}Z`).getTime()
  const s = Math.max(0, Math.round(diffMs / 1000))

  if (s < _NOW_THRESHOLD_S) return 'ahora'
  if (s < _MINUTE_S) return `${Math.round(s / _SECOND_S)}s`
  if (s < _HOUR_S) return `${Math.round(s / _MINUTE_S)}m`
  if (s < _DAY_S) return `${Math.round(s / _HOUR_S)}h`
  return `${Math.round(s / _DAY_S)}d`
}
