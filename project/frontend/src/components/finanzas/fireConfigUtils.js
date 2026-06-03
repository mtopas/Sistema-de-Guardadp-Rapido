/** Valores numéricos del plan FIRE desde formulario o config guardada. */
export function parseFireForm(form) {
  const metaEdad = parseInt(form?.fire_meta_edad, 10)
  const out = {
    fire_aumento_aporte:     parseFloat(form?.fire_aumento_aporte)     || 1.20,
    fire_rentabilidad_anual: parseFloat(form?.fire_rentabilidad_anual) || 6.00,
    fire_fecha_nacimiento:   form?.fire_fecha_nacimiento || '',
    fire_aporte_inicial:     parseFloat(form?.fire_aporte_inicial)     || 0,
    fire_saldo_inicial:      parseFloat(form?.fire_saldo_inicial)      || 0,
    fire_meta_usd:           parseFloat(form?.fire_meta_usd)           || 500000,
  }
  if (form?.fire_inicio_mes) out.fire_inicio_mes = form.fire_inicio_mes
  if (!isNaN(metaEdad) && metaEdad > 0) out.fire_meta_edad = metaEdad
  return out
}

export function mergeFireCfg(finConfig, preview) {
  if (!preview) return finConfig ?? {}
  return { ...(finConfig ?? {}), ...preview }
}
