/** Lee el CSV que exporta /fin/export/csv, incluidas comas y saltos de línea entre comillas. */
export function parseFinCsv(text) {
  const rows = []
  let cell = '', row = [], quoted = false
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else cell += char
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar')
  row.push(cell)
  if (row.some(x => x !== '')) rows.push(row)
  if (!rows.length) return []
  const headers = rows.shift().map(x => x.trim().toLowerCase())
  for (const required of ['fecha', 'tipo', 'monto', 'descripcion']) {
    if (!headers.includes(required)) throw new Error(`Falta columna ${required}`)
  }
  return rows.map((values, index) => {
    const raw = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    const monto = Number(raw.monto)
    if (!raw.fecha || !['income', 'expense'].includes(raw.tipo) || !Number.isFinite(monto) || monto === 0) {
      throw new Error(`Fila ${index + 2} inválida`)
    }
    return {
      fecha: raw.fecha, tipo: raw.tipo, monto,
      descripcion: raw.descripcion,
      moneda: raw.moneda || 'ARS',
      categoria_nombre: raw.categoria_nombre || raw.categoria || null,
      cuenta_nombre: raw.cuenta_nombre || raw.cuenta || null,
      cuotas: raw.cuotas ? Number(raw.cuotas) : null,
      nota: raw.nota || null,
    }
  })
}
