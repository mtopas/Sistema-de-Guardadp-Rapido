function parseFinNum(v, fallback) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/** Formulario del panel derecho → objeto numérico (preview o guardado). */
export function parseFireForm(form, { forSave = false } = {}) {
  const metaEdad = parseInt(form?.fire_meta_edad, 10)
  const out = {
    fire_aumento_aporte:     parseFinNum(form?.fire_aumento_aporte, 1.20),
    fire_rentabilidad_anual: parseFinNum(form?.fire_rentabilidad_anual, 6.00),
    fire_fecha_nacimiento:   form?.fire_fecha_nacimiento ?? '',
    fire_aporte_inicial:     parseFinNum(form?.fire_aporte_inicial, 0),
    fire_saldo_inicial:      parseFinNum(form?.fire_saldo_inicial, 0),
    fire_meta_usd:           parseFinNum(form?.fire_meta_usd, 500000),
  }
  if (forSave || (form?.fire_inicio_mes ?? '').trim()) {
    out.fire_inicio_mes = (form?.fire_inicio_mes ?? '').trim()
  }
  if (!isNaN(metaEdad) && metaEdad > 0) {
    out.fire_meta_edad = metaEdad
  } else if (forSave) {
    out.fire_meta_edad = ''
  }
  return out
}

/** Config de la API → strings del formulario (sin mezclar preview). */
export function fireFormFromConfig(cfg = {}) {
  const str = (v, def = '') => (v === null || v === undefined || v === '' ? def : String(v))
  return {
    fire_aumento_aporte:     str(cfg.fire_aumento_aporte, '1.20'),
    fire_rentabilidad_anual: str(cfg.fire_rentabilidad_anual, '6.00'),
    fire_fecha_nacimiento:   str(cfg.fire_fecha_nacimiento, ''),
    fire_aporte_inicial:     str(cfg.fire_aporte_inicial, '0'),
    fire_saldo_inicial:      str(cfg.fire_saldo_inicial, '0'),
    fire_inicio_mes:         str(cfg.fire_inicio_mes, ''),
    fire_meta_usd:           str(cfg.fire_meta_usd, '500000'),
    fire_meta_edad:          cfg.fire_meta_edad != null && cfg.fire_meta_edad !== ''
      ? String(cfg.fire_meta_edad)
      : '',
  }
}

export function mergeFireCfg(finConfig, preview) {
  if (!preview) return finConfig ?? {}
  return { ...(finConfig ?? {}), ...preview }
}

/** True si el form difiere de lo persistido en finConfig (preview justificado). */
export function fireFormDirty(form, finConfig) {
  if (!finConfig || !Object.keys(finConfig).length) return false
  const saved = fireFormFromConfig(finConfig)
  return Object.keys(saved).some(k => String(form[k] ?? '') !== String(saved[k] ?? ''))
}
