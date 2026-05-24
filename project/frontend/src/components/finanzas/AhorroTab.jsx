import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD } from '../../data/finanzas'

const TIPOS = [
  { id: 'acciones',   labelKey: 'tipoAcciones' },
  { id: 'fci',        labelKey: 'tipoFCI'      },
  { id: 'plazo_fijo', labelKey: 'tipoPlazoFijo'},
  { id: 'ons',        labelKey: 'tipoONs'      },
  { id: 'crypto',     labelKey: 'tipoCrypto'   },
  { id: 'otros',      labelKey: 'tipoOtros'    },
]

const TH = {
  padding: '5px 8px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--subtext)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--surface)',
}
const TD = { padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)' }

function calcIntereses(inst) {
  if (!inst.fecha_inicio || !inst.fecha_vencimiento || !inst.tna || !inst.capital_ars) return 0
  const dias = Math.max(0, (new Date(inst.fecha_vencimiento) - new Date(inst.fecha_inicio)) / 86400000)
  return inst.capital_ars * (inst.tna / 100) * (dias / 365)
}

function pnl(inst) {
  if (inst.costo_usd == null || inst.precio_actual == null) return null
  const costoTotal = inst.costo_usd   // total purchase cost in USD
  const valorActual = (inst.cantidad ?? 0) * inst.precio_actual
  const diff = valorActual - costoTotal
  const pct  = costoTotal > 0 ? (diff / costoTotal) * 100 : 0
  return { diff, pct }
}

function fmtFecha(str) {
  if (!str) return '—'
  const d = new Date(str)
  return isNaN(d) ? str : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ── Add instrument form ───────────────────────────────────────────────────────

function AddForm({ tipo, onSave, onCancel, lang }) {
  const isPF    = tipo === 'plazo_fijo'
  const isFCI   = tipo === 'fci'
  const isOtros = tipo === 'otros'

  const [f, setF] = useState({
    ticker: '', sociedad: '', nombre: '', cantidad: '', costo_usd: '', tipo_cambio: '',
    precio_actual: '', entidad: '', capital_ars: '', tna: '', fecha_inicio: '', fecha_vencimiento: '',
  })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const inp = (placeholder, key, type = 'text') => (
    <input
      type={type}
      placeholder={placeholder}
      value={f[key]}
      onChange={e => set(key, e.target.value)}
      style={{
        background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
        borderRadius: 8, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
        outline: 'none', width: '100%',
      }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )

  const handleSave = () => {
    const payload = { tipo, nombre: f.nombre || f.ticker || '?' }
    if (!isPF) {
      payload.ticker        = isFCI ? null : (f.ticker || null)
      payload.sociedad      = isFCI ? (f.sociedad || null) : null
      payload.cantidad      = parseFloat(f.cantidad)  || 0
      payload.costo_usd     = parseFloat(f.costo_usd) || null
      payload.tipo_cambio   = parseFloat(f.tipo_cambio) || null
      payload.precio_actual = parseFloat(f.precio_actual) || null
    }
    if (isPF) {
      payload.entidad           = f.entidad || null
      payload.capital_ars       = parseFloat(f.capital_ars) || null
      payload.tna               = parseFloat(f.tna) || null
      payload.fecha_inicio      = f.fecha_inicio || null
      payload.fecha_vencimiento = f.fecha_vencimiento || null
    }
    onSave(payload)
  }

  return (
    <tr style={{ background: 'color-mix(in oklch, var(--accent) 5%, transparent)' }}>
      <td colSpan={99} style={{ ...TD, padding: '8px 10px' }}>
        <div className="flex flex-wrap gap-2 items-end">
          {!isPF && !isOtros && !isFCI && <div className="flex flex-col gap-0.5" style={{ width: 80 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrTicker')}</span>{inp('AAPL','ticker')}</div>}
          {isFCI && <div className="flex flex-col gap-0.5" style={{ width: 130 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrSociedad')}</span>{inp('Pionero','sociedad')}</div>}
          <div className="flex flex-col gap-0.5" style={{ width: 140 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrNombre')}</span>{inp(t(lang,'instrNombre'),'nombre')}</div>
          {!isPF && <div className="flex flex-col gap-0.5" style={{ width: 90 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCantidad')}</span>{inp('0','cantidad','number')}</div>}
          {!isPF && <div className="flex flex-col gap-0.5" style={{ width: 100 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCosto')}</span>{inp('0','costo_usd','number')}</div>}
          {!isPF && <div className="flex flex-col gap-0.5" style={{ width: 90 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrPrecio')}</span>{inp('0','precio_actual','number')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 120 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrEntidad')}</span>{inp('Banco','entidad')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCapital')}</span>{inp('0','capital_ars','number')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 70 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrTNA')}</span>{inp('97.5','tna','number')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrInicio')}</span>{inp('2026-05-01','fecha_inicio','date')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrVenc')}</span>{inp('2026-06-30','fecha_vencimiento','date')}</div>}
          <button onClick={handleSave} style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            <Check size={13} />
          </button>
          <button onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtext)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Precio editable inline ────────────────────────────────────────────────────

function PrecioCell({ inst, lang }) {
  const updateInst = useStore(s => s.updateFinInstrumento)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const commit = () => {
    const n = parseFloat(val)
    if (!isNaN(n)) updateInst(inst.id, { precio_actual: n })
    setEditing(false)
  }

  if (editing) return (
    <td style={TD}>
      <input
        type="number" autoFocus value={val} onChange={e => setVal(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, width: 80 }}
      />
    </td>
  )

  return (
    <td style={{ ...TD, cursor: 'text' }} onClick={() => { setVal(String(inst.precio_actual ?? '')); setEditing(true) }}>
      <span style={{ color: 'var(--accent)', textDecoration: 'underline dotted' }}>
        {inst.precio_actual != null ? fmtUSD(inst.precio_actual) : '—'}
      </span>
    </td>
  )
}

// ── Instrument rows by type ───────────────────────────────────────────────────

function AccionesRows({ items, lang }) {
  return items.map(inst => {
    const valor  = (inst.cantidad ?? 0) * (inst.precio_actual ?? 0)
    const pl     = pnl(inst)
    const plColor = pl == null ? 'var(--text)' : pl.diff >= 0 ? 'var(--success)' : '#ef4444'
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ ...TD, fontWeight: 700 }}>{inst.ticker ?? '—'}</td>
        <td style={TD}>{inst.nombre}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{(inst.cantidad ?? 0).toLocaleString('es-AR')}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{inst.costo_usd != null && inst.cantidad > 0 ? fmtUSD(inst.costo_usd / inst.cantidad) : '—'}</td>
        <PrecioCell inst={inst} lang={lang} />
        <td style={{ ...TD, textAlign: 'right' }}>{fmtUSD(valor)}</td>
        <td style={{ ...TD, textAlign: 'right', color: plColor }}>
          {pl != null ? `${pl.diff >= 0 ? '+' : ''}${fmtUSD(pl.diff)} (${pl.pct >= 0 ? '+' : ''}${pl.pct.toFixed(1)}%)` : '—'}
        </td>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function FCIRows({ items, lang }) {
  return items.map(inst => {
    const valor = (inst.cantidad ?? 0) * (inst.precio_actual ?? 0)
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ ...TD, color: 'var(--subtext)' }}>{inst.sociedad ?? '—'}</td>
        <td style={TD}>{inst.nombre}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{(inst.cantidad ?? 0).toLocaleString('es-AR')}</td>
        <PrecioCell inst={inst} lang={lang} />
        <td style={{ ...TD, textAlign: 'right' }}>{fmtUSD(valor)}</td>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function PlazoFijoRows({ items }) {
  return items.map(inst => {
    const intereses = calcIntereses(inst)
    const total     = (inst.capital_ars ?? 0) + intereses
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={TD}>{inst.entidad ?? '—'}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{fmtARS(inst.capital_ars ?? 0)}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{inst.tna != null ? `${inst.tna}%` : '—'}</td>
        <td style={TD}>{fmtFecha(inst.fecha_inicio)}</td>
        <td style={TD}>{fmtFecha(inst.fecha_vencimiento)}</td>
        <td style={{ ...TD, textAlign: 'right', color: 'var(--success)' }}>{fmtARS(intereses)}</td>
        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{fmtARS(total)}</td>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function OtrosRows({ items }) {
  return items.map(inst => {
    const valor = (inst.cantidad > 0 ? inst.cantidad : 1) * (inst.precio_actual ?? inst.costo_usd ?? 0)
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={TD}>{inst.nombre}</td>
        <td style={{ ...TD, textAlign: 'right' }}>{fmtUSD(valor)}</td>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function DeleteCell({ id }) {
  const del = useStore(s => s.deleteFinInstrumento)
  return (
    <td style={{ ...TD, textAlign: 'center' }}>
      <button
        onClick={() => del(id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', padding: 2, lineHeight: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
      ><Trash2 size={12} /></button>
    </td>
  )
}

// ── Type-specific table headers ───────────────────────────────────────────────

function AccionesHeader({ lang }) {
  return (
    <tr>
      {['colTicker','instrNombre','colCantidad','colPPP','colPrecioActual','colValor','colPnL',''].map(k => (
        <th key={k} style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function FCIHeader({ lang }) {
  return (
    <tr>
      {['colSociedad','instrNombre','colCantidad','colPrecioActual','colValor',''].map(k => (
        <th key={k} style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function PlazoFijoHeader({ lang }) {
  return (
    <tr>
      {['colEntidad','colCapital','colTNA','colInicio','colVencimiento','colIntereses','colCapitalTotal',''].map(k => (
        <th key={k} style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function OtrosHeader({ lang }) {
  return (
    <tr>
      {['instrNombre','colValor',''].map(k => (
        <th key={k} style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

// ── Mini distribution bar chart ───────────────────────────────────────────────

function DistribBar({ items, dolar }) {
  const data = useMemo(() => {
    const totals = {}
    items.forEach(i => {
      let val = 0
      if (i.tipo === 'plazo_fijo') val = (i.capital_ars ?? 0) + calcIntereses(i)
      else val = ((i.cantidad ?? 0) * (i.precio_actual ?? 0)) * dolar
      totals[i.tipo] = (totals[i.tipo] ?? 0) + val
    })
    const total = Object.values(totals).reduce((a, b) => a + b, 0)
    return Object.entries(totals).map(([tipo, val]) => ({
      tipo,
      val,
      pct: total > 0 ? (val / total) * 100 : 0,
    }))
  }, [items, dolar])

  const COLORS = {
    acciones: 'var(--accent)', fci: 'var(--success)', plazo_fijo: 'var(--warning)',
    ons: '#8b5cf6', crypto: '#ec4899', otros: 'var(--subtext)',
  }

  if (!data.length) return null

  return (
    <div className="mt-4 mb-1">
      <div className="flex rounded-full overflow-hidden h-2.5 gap-px" style={{ background: 'var(--surface)' }}>
        {data.filter(d => d.pct > 0.5).map(d => (
          <div key={d.tipo} style={{ width: `${d.pct}%`, background: COLORS[d.tipo] ?? 'var(--accent)', transition: 'width .3s' }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.map(d => (
          <div key={d.tipo} className="flex items-center gap-1.5">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[d.tipo] ?? 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: 'var(--subtext)', fontFamily: 'var(--font-mono)' }}>
              {d.tipo} {d.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Instrument accordion section ──────────────────────────────────────────────

function TipoSection({ tipo, items, lang, addInstrumento }) {
  const hasItems = items.length > 0
  const [open, setOpen]     = useState(hasItems)
  const [adding, setAdding] = useState(false)

  const handleSave = async (payload) => {
    await addInstrumento(payload)
    setAdding(false)
  }

  const isPF    = tipo === 'plazo_fijo'
  const isFCI   = tipo === 'fci'
  const isOtros = tipo === 'otros'
  const isStock = ['acciones', 'ons', 'crypto'].includes(tipo)

  const renderHeader = () => {
    if (isStock)  return <AccionesHeader lang={lang} />
    if (isFCI)    return <FCIHeader lang={lang} />
    if (isPF)     return <PlazoFijoHeader lang={lang} />
    return <OtrosHeader lang={lang} />
  }

  const renderRows = () => {
    if (isStock)  return <AccionesRows items={items} lang={lang} />
    if (isFCI)    return <FCIRows items={items} lang={lang} />
    if (isPF)     return <PlazoFijoRows items={items} />
    return <OtrosRows items={items} />
  }

  const labelKey = TIPOS.find(t => t.id === tipo)?.labelKey ?? tipo

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-2.5 transition-colors"
        style={{ background: open ? 'var(--surface)' : 'transparent', cursor: 'pointer', border: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
        onMouseLeave={e => (e.currentTarget.style.background = open ? 'var(--surface)' : 'transparent')}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} style={{ color: 'var(--subtext)' }} /> : <ChevronRight size={14} style={{ color: 'var(--subtext)' }} />}
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t(lang, labelKey)}</span>
          {hasItems && (
            <span className="text-[10.5px] mono" style={{ color: 'var(--subtext)' }}>({items.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(true); setAdding(true) }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors"
          style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
        >
          <Plus size={11} /> {t(lang, 'addInstrumento')}
        </button>
      </button>

      {/* Table */}
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <thead>{renderHeader()}</thead>
            <tbody>
              {adding && <AddForm tipo={tipo} onSave={handleSave} onCancel={() => setAdding(false)} lang={lang} />}
              {renderRows()}
              {items.length === 0 && !adding && (
                <tr><td colSpan={9} style={{ padding: '16px 12px', color: 'var(--subtext)', fontSize: 12, textAlign: 'center' }}>
                  {t(lang, 'ahorroSinInstrumentos')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AhorroTab() {
  const lang            = useStore(s => s.lang)
  const finInstrumentos = useStore(s => s.finInstrumentos)
  const fetchInst       = useStore(s => s.fetchFinInstrumentos)
  const addInst         = useStore(s => s.addFinInstrumento)
  const finConfig       = useStore(s => s.finConfig)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const fetchAll        = useStore(s => s.fetchFinMovimientosAll)

  useEffect(() => { fetchInst(); fetchAll() }, [])

  const dolar = finConfig?.dolar_oficial ?? 1245

  const { totalUSD, totalARS, totalARS_PF } = useMemo(() => {
    let usd  = 0
    let arsPF = 0
    finInstrumentos.forEach(i => {
      if (i.tipo === 'plazo_fijo') {
        arsPF += (i.capital_ars ?? 0) + calcIntereses(i)
      } else {
        usd += (i.cantidad ?? 0) * (i.precio_actual ?? 0)
      }
    })
    return {
      totalUSD:    usd,
      totalARS_PF: arsPF,
      totalARS:    arsPF + usd * dolar,
    }
  }, [finInstrumentos, dolar])

  const totalAhorroBruto = useMemo(() => {
    return finMovimientosAll
      .filter(m => (m.cat ?? m.categoria_nombre ?? '') === 'Ahorro')
      .reduce((sum, m) => {
        const monto = Math.abs(m.amount ?? m.monto ?? 0)
        return sum + ((m.type ?? m.tipo) === 'expense' ? monto : -monto)
      }, 0)
  }, [finMovimientosAll])

  const costoTotalInstrumentos = useMemo(() => {
    return finInstrumentos.reduce((sum, i) => {
      if (i.tipo === 'plazo_fijo') return sum + (i.capital_ars ?? 0)
      return sum + (i.costo_usd ?? 0) * dolar
    }, 0)
  }, [finInstrumentos, dolar])

  const liquidoSinInvertir = totalAhorroBruto - costoTotalInstrumentos

  const byTipo = useMemo(() => {
    const map = {}
    TIPOS.forEach(({ id }) => { map[id] = [] })
    finInstrumentos.forEach(i => {
      if (map[i.tipo]) map[i.tipo].push(i)
    })
    return map
  }, [finInstrumentos])

  return (
    <div className="flex flex-col gap-4">
      {/* Header totals */}
      <div className="panel-strong p-5">
        <div className="label mb-1">{t(lang, 'ahorroTotalPortfolio')}</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wide mono mb-0.5" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'ahorroARS')}
            </div>
            <div className="serif italic text-[28px] font-semibold tnum leading-none gradient-text">
              {fmtARS(totalARS)}
            </div>
          </div>
          <div className="opacity-30 text-[20px]">·</div>
          <div>
            <div className="text-[10px] uppercase tracking-wide mono mb-0.5" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'ahorroUSD')}
            </div>
            <div className="serif italic text-[22px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtUSD(totalUSD + totalARS_PF / dolar)}
            </div>
          </div>
          {liquidoSinInvertir > 0 && (
            <>
              <div className="opacity-30 text-[20px]">·</div>
              <div>
                <div className="text-[10px] uppercase tracking-wide mono mb-0.5" style={{ color: 'var(--subtext)' }}>
                  {t(lang, 'ahorroLiquido')}
                </div>
                <div className="serif italic text-[18px] font-semibold tnum" style={{ color: 'var(--warning)' }}>
                  {fmtARS(liquidoSinInvertir)}
                </div>
              </div>
            </>
          )}
        </div>
        <DistribBar items={finInstrumentos} dolar={dolar} />
      </div>

      {/* Accordion by instrument type */}
      {TIPOS.map(({ id }) => (
        <TipoSection
          key={id}
          tipo={id}
          items={byTipo[id] ?? []}
          lang={lang}
          addInstrumento={addInst}
        />
      ))}
    </div>
  )
}
