import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD } from '../../data/finanzas'

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextMes(m) {
  const [y, mo] = m.split('-').map(Number)
  if (mo === 12) return `${y + 1}-01`
  return `${y}-${String(mo + 1).padStart(2, '0')}`
}

function mesLabel(m) {
  const [y, mo] = m.split('-').map(Number)
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[mo - 1]} ${y}`
}

function mesOf(mov) {
  const v = mov.date ?? mov.fecha ?? ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function edadEn(fechaNac, mes) {
  if (!fechaNac) return null
  const [y, mo] = mes.split('-').map(Number)
  const nac = new Date(fechaNac)
  let edad = y - nac.getFullYear()
  const cumpleEsteAnio = new Date(y, nac.getMonth(), nac.getDate())
  if (new Date(y, mo - 1, 1) < cumpleEsteAnio) edad--
  return edad
}

function projectBalance(saldo0, aporte0, aumentoMensual, rentabilidadMensual, meses) {
  let s = saldo0
  let a = aporte0
  for (let i = 0; i < meses; i++) {
    const interes = (s + a) * rentabilidadMensual
    s = s + a + interes
    a = a * (1 + aumentoMensual)
  }
  return s
}

// ── Style constants ───────────────────────────────────────────────────────────

const TH_BASE = {
  padding: '6px 8px',
  textAlign: 'right',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--subtext)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'var(--surface)',
  zIndex: 1,
}
const TH_LEFT = { ...TH_BASE, textAlign: 'left' }
const TD = { padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }
const TD_LEFT = { ...TD, textAlign: 'left' }

// ── Ahorrado editable cell ────────────────────────────────────────────────────

function AhorradoCell({ mes, value, isFuture, lang }) {
  const upsert = useStore(s => s.upsertFinFireFila)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  if (isFuture) return <td style={{ ...TD, color: 'var(--subtext)' }}>—</td>

  const commit = () => {
    const parsed = val.trim() === '' ? null : parseFloat(val.replace(/\./g, '').replace(',', '.'))
    upsert(mes, isNaN(parsed) ? null : parsed)
    setEditing(false)
  }

  if (editing) return (
    <td style={TD}>
      <input
        type="number" autoFocus value={val} onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'right', width: 100 }}
      />
    </td>
  )

  return (
    <td
      style={{ ...TD, cursor: 'text', color: value >= 0 ? 'var(--text)' : '#ef4444' }}
      onClick={() => { setVal(String(Math.round(value))); setEditing(true) }}
      title={t(lang, 'fireOverrideHint')}
    >
      <span style={{ borderBottom: '1px dotted var(--subtext)' }}>
        {value != null ? fmtARS(value) : '—'}
      </span>
    </td>
  )
}

// ── Projection summary row ────────────────────────────────────────────────────

function monthsUntil(fechaNac, edad) {
  const nac  = new Date(fechaNac)
  const hoy  = new Date()
  const cumple = new Date(nac.getFullYear() + edad, nac.getMonth(), nac.getDate())
  const meses = (cumple.getFullYear() - hoy.getFullYear()) * 12 + (cumple.getMonth() - hoy.getMonth())
  return { meses, anio: cumple.getFullYear() }
}

function fmtARSShort(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toLocaleString('es-AR',     { maximumFractionDigits: 0 }) + 'K'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function usdFontSize(n) {
  const len = fmtUSD(n).length
  if (len >= 13) return 9
  if (len >= 11) return 10
  return 12
}

function ProyeccionRow({ lang, saldoHoy, aporteHoy, aumentoMensual, rentabilidadMensual, dolar, fechaNac }) {
  const AGES = [25, 30, 35, 40, 45, 50]

  const proyecciones = useMemo(() => {
    if (!fechaNac) return []
    return AGES
      .map(edad => {
        const { meses, anio } = monthsUntil(fechaNac, edad)
        if (meses <= 0) return null  // ya pasó esa edad
        const saldoFinal = projectBalance(saldoHoy, aporteHoy, aumentoMensual, rentabilidadMensual, meses)
        const saldoUSD   = saldoFinal / dolar
        const retiroUSD  = saldoUSD * 0.04 / 12
        return { edad, anio, meses, saldoUSD, retiroUSD, saldoARS: saldoFinal, retiroARS: retiroUSD * dolar }
      })
      .filter(Boolean)
  }, [saldoHoy, aporteHoy, aumentoMensual, rentabilidadMensual, dolar, fechaNac])

  const colBase = {
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '8px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  }

  if (!fechaNac) {
    return (
      <div className="panel-strong p-5 mb-4">
        <div className="label mb-2">{t(lang, 'fireProyeccion')}</div>
        <p style={{ color: 'var(--subtext)', fontSize: 12 }}>
          Configurá tu fecha de nacimiento en el panel derecho para ver la proyección por edad.
        </p>
      </div>
    )
  }

  const cols = `grid-cols-${proyecciones.length}`

  return (
    <div className="panel-strong p-5 mb-4">
      <div className="label mb-1">{t(lang, 'fireProyeccion')}</div>
      <div className="text-[10px] mono mb-3" style={{ color: 'var(--subtext)' }}>
        Proyectado desde el saldo real de hoy · regla del 4% SWR
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${proyecciones.length}, 1fr)` }}>
        {proyecciones.map(({ edad, anio, saldoUSD, saldoARS, retiroUSD, retiroARS }) => (
          <div key={edad} className="flex flex-col gap-2">
            {/* Edad + año */}
            <div className="flex flex-col items-center gap-0.5">
              <div className="text-[15px] font-bold serif italic" style={{ color: 'var(--text)' }}>{edad}</div>
              <div className="text-[9px] mono" style={{ color: 'var(--subtext)' }}>{anio}</div>
            </div>
            {/* Total acumulado */}
            <div style={{ ...colBase, background: 'color-mix(in oklch, var(--accent) 18%, var(--surface))' }}>
              <div className="text-[9px] mono uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>Total</div>
              <div className="serif italic font-semibold tnum" style={{ fontSize: usdFontSize(saldoUSD), color: '#ffffff', whiteSpace: 'nowrap' }}>
                {fmtUSD(saldoUSD)}
              </div>
              <div className="mono tnum" style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 1, whiteSpace: 'nowrap' }}>
                {fmtARSShort(saldoARS)} ARS
              </div>
            </div>
            {/* Retiro mensual 4% SWR */}
            <div style={{ ...colBase, background: 'color-mix(in oklch, var(--accent) 35%, var(--surface))' }}>
              <div className="text-[9px] mono uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.55)' }}>/mes · 4%</div>
              <div className="serif italic font-semibold tnum" style={{ fontSize: usdFontSize(retiroUSD), color: '#ffffff', whiteSpace: 'nowrap' }}>
                {fmtUSD(retiroUSD)}
              </div>
              <div className="mono tnum" style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 1, whiteSpace: 'nowrap' }}>
                {fmtARSShort(retiroARS)} ARS
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FireTab() {
  const lang           = useStore(s => s.lang)
  const finConfig      = useStore(s => s.finConfig)
  const finFireFilas   = useStore(s => s.finFireFilas)
  const fetchFireFilas = useStore(s => s.fetchFinFireFilas)
  const finMovAll      = useStore(s => s.finMovimientosAll)
  const fetchAll       = useStore(s => s.fetchFinMovimientosAll)
  const finObjetivos   = useStore(s => s.finObjetivos)
  const fetchObj       = useStore(s => s.fetchFinObjetivos)

  useEffect(() => { fetchFireFilas(); fetchAll(); fetchObj() }, [])

  const cfg = finConfig ?? {}
  const aumentoMensual      = (cfg.fire_aumento_aporte    ?? 1.20)  / 100
  const rentabilidadAnual   = (cfg.fire_rentabilidad_anual ?? 6.00)
  const rentabilidadMensual = rentabilidadAnual / 100 / 12
  const aporteInicial       = cfg.fire_aporte_inicial ?? 0
  const saldoInicial        = cfg.fire_saldo_inicial  ?? 0
  const fechaNac            = cfg.fire_fecha_nacimiento ?? ''
  const dolar               = cfg.dolar_mep ?? cfg.dolar_oficial ?? cfg.dolar_default ?? 1245
  const fireMetaEdad        = cfg.fire_meta_edad ? Number(cfg.fire_meta_edad) : null

  const currentMes = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const inicioMes = cfg.fire_inicio_mes || currentMes

  // Compute ahorrado FIRE per month from movimientos (residual after objetivos)
  const objetivoNombres = useMemo(() => new Set(finObjetivos.map(o => o.nombre)), [finObjetivos])

  const ahorroPorMes = useMemo(() => {
    const map = {}
    finMovAll.forEach(m => {
      const cat  = m.cat ?? m.categoria_nombre ?? ''
      const desc = m.desc ?? m.descripcion ?? ''
      if (cat !== 'Ahorro' || objetivoNombres.has(desc)) return
      const mes   = mesOf(m)
      const monto = Math.abs(m.amount ?? m.monto ?? 0)
      map[mes] = (map[mes] ?? 0) + ((m.type ?? m.tipo) === 'expense' ? monto : -monto)
    })
    return map
  }, [finMovAll, objetivoNombres])

  // Generate all rows — always up to fire_meta_edad (default 50) + 1 mes
  const endMes = useMemo(() => {
    const targetEdad = fireMetaEdad ?? 50
    let target = targetEdad * 12  // fallback si no hay fechaNac
    if (fechaNac) {
      const nac = new Date(fechaNac)
      const cumple = new Date(nac.getFullYear() + targetEdad, nac.getMonth(), nac.getDate())
      const hoy = new Date()
      target = Math.max(12, (cumple.getFullYear() - hoy.getFullYear()) * 12 + (cumple.getMonth() - hoy.getMonth()) + 1)
    }
    let m = currentMes
    for (let i = 0; i < target; i++) m = nextMes(m)
    return m
  }, [currentMes, fechaNac, fireMetaEdad])

  const rows = useMemo(() => {
    const result = []
    let prevAporte     = aporteInicial
    let prevFalta      = 0
    let prevSaldoFinal = saldoInicial
    let mes = inicioMes

    while (mes <= endMes) {
      const isPast    = mes < currentMes
      const isCurrent = mes === currentMes
      const isFuture  = mes > currentMes

      const aporte = result.length === 0
        ? aporteInicial
        : prevAporte * (1 + aumentoMensual) + prevFalta

      const inicial = result.length === 0 ? saldoInicial : prevSaldoFinal

      let ahorrado
      if (finFireFilas[mes] !== undefined) {
        ahorrado = finFireFilas[mes]
      } else if (!isFuture) {
        ahorrado = ahorroPorMes[mes] ?? 0
      } else {
        ahorrado = null // projected
      }

      const efectivo   = isFuture ? aporte : (ahorrado ?? aporte)
      const interes    = (inicial + efectivo) * rentabilidadMensual
      const saldoFinal = inicial + efectivo + interes
      const falta      = isFuture ? null : Math.max(0, aporte - (ahorrado ?? 0))

      result.push({
        mes, isPast, isCurrent, isFuture,
        edad: fechaNac ? edadEn(fechaNac, mes) : null,
        aporte, inicial, interes, saldoFinal, ahorrado, falta,
      })

      prevAporte     = aporte
      prevFalta      = falta ?? 0
      prevSaldoFinal = saldoFinal
      mes = nextMes(mes)
    }
    return result
  }, [inicioMes, endMes, currentMes, aporteInicial, saldoInicial, aumentoMensual,
      rentabilidadMensual, finFireFilas, ahorroPorMes, fechaNac])

  // Last real saldo for projection
  const lastRealRow = useMemo(() => {
    const real = rows.filter(r => !r.isFuture)
    return real.length > 0 ? real[real.length - 1] : null
  }, [rows])

  const saldoHoy   = lastRealRow?.saldoFinal ?? saldoInicial
  const aporteHoy  = lastRealRow?.aporte     ?? aporteInicial

  // Scroll to current month on mount
  const currentRef = useRef(null)
  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [rows.length])

  return (
    <div className="flex flex-col">
      <ProyeccionRow
        lang={lang}
        saldoHoy={saldoHoy}
        aporteHoy={aporteHoy}
        aumentoMensual={aumentoMensual}
        rentabilidadMensual={rentabilidadMensual}
        dolar={dolar}
        fechaNac={fechaNac}
      />

      <div className="panel-strong overflow-hidden">
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <thead>
              <tr>
                {fechaNac && <th style={TH_LEFT}>{t(lang,'colEdad')}</th>}
                <th style={TH_LEFT}>{t(lang,'colMes')}</th>
                <th style={TH_BASE}>{t(lang,'colAporte')}</th>
                <th style={TH_BASE}>{t(lang,'colInicial')}</th>
                <th style={TH_BASE}>{t(lang,'colInteres')}</th>
                <th style={TH_BASE}>{t(lang,'colSaldoFinal')}</th>
                <th style={TH_BASE}>{t(lang,'colAhorrado')}</th>
                <th style={TH_BASE}>{t(lang,'colFalta')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isCurrent  = row.isCurrent
                const isFuture   = row.isFuture
                const isMetaEdad = fireMetaEdad != null && row.edad === fireMetaEdad
                const bg = isCurrent
                  ? 'color-mix(in oklch, var(--accent) 12%, transparent)'
                  : isFuture
                    ? 'color-mix(in oklch, var(--surface) 50%, transparent)'
                    : (i % 2 === 0 ? 'transparent' : 'color-mix(in oklch, var(--surface) 30%, transparent)')

                return (
                  <tr
                    key={row.mes}
                    ref={isCurrent ? currentRef : null}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: bg,
                      ...(isMetaEdad && { outline: '2px solid #f59e0b', outlineOffset: '-2px' }),
                    }}
                  >
                    {fechaNac && (
                      <td style={{ ...TD_LEFT, color: isMetaEdad ? '#f59e0b' : 'var(--subtext)', fontWeight: isMetaEdad ? 700 : 400 }}>
                        {row.edad != null ? row.edad : '—'}
                        {isMetaEdad && <span className="ml-1" title="Meta edad FIRE">🎯</span>}
                      </td>
                    )}
                    <td style={{ ...TD_LEFT, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? 'var(--accent)' : isFuture ? 'var(--subtext)' : 'var(--text)' }}>
                      {mesLabel(row.mes)}
                      {isCurrent && <span className="ml-1 text-[9px] uppercase tracking-wide" style={{ color: 'var(--accent)', opacity: 0.8 }}>●</span>}
                    </td>
                    <td style={{ ...TD, color: isFuture ? 'var(--subtext)' : 'var(--text)' }}>{fmtARS(row.aporte)}</td>
                    <td style={{ ...TD, color: isFuture ? 'var(--subtext)' : 'var(--text)' }}>{fmtARS(row.inicial)}</td>
                    <td style={{ ...TD, color: '#22c55e' }}>{fmtARS(row.interes)}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{fmtARS(row.saldoFinal)}</td>
                    <AhorradoCell mes={row.mes} value={row.ahorrado} isFuture={row.isFuture} lang={lang} />
                    <td style={{ ...TD, color: row.falta > 0 ? '#ef4444' : row.falta === 0 ? '#22c55e' : 'var(--subtext)' }}>
                      {row.falta != null ? fmtARS(row.falta) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
