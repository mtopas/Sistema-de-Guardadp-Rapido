import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X, BookOpen } from 'lucide-react'
import { API_URL } from '../../config'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import {
  fmtARS, fmtUSD, acumuladoPorCategoriaNombre, CATEGORIA_FIRE,
} from '../../data/finanzas'

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
        <th key={k} scope="col" style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function FCIHeader({ lang }) {
  return (
    <tr>
      {['colSociedad','instrNombre','colCantidad','colPrecioActual','colValor',''].map(k => (
        <th key={k} scope="col" style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function PlazoFijoHeader({ lang }) {
  return (
    <tr>
      {['colEntidad','colCapital','colTNA','colInicio','colVencimiento','colIntereses','colCapitalTotal',''].map(k => (
        <th key={k} scope="col" style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function OtrosHeader({ lang }) {
  return (
    <tr>
      {['instrNombre','colValor',''].map(k => (
        <th key={k} scope="col" style={TH}>{k ? t(lang, k) : ''}</th>
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

// ── Ledger de transacciones por instrumento ───────────────────────────────────

function LedgerSection({ instrumentos, lang }) {
  const [selId, setSelId]         = useState(null)
  const [trans, setTrans]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ tipo: 'compra', fecha: new Date().toISOString().slice(0,10), cantidad: '', precio: '', nota: '' })

  const flatInst = useMemo(() => instrumentos.flatMap(g => g), [instrumentos])

  const fetchTrans = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos/${id}/transacciones`)
      if (res.ok) setTrans(await res.json())
    } catch { /* noop */ }
    setLoading(false)
  }, [])

  const handleSelect = (id) => { setSelId(id); fetchTrans(id); setShowForm(false) }

  const handleAdd = async () => {
    if (!selId || !form.cantidad || !form.precio) return
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos/${selId}/transacciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: form.tipo, fecha: form.fecha, cantidad: parseFloat(form.cantidad), precio: parseFloat(form.precio), nota: form.nota || null }),
      })
      if (res.ok) { await fetchTrans(selId); setShowForm(false) }
    } catch { /* noop */ }
  }

  const handleDelete = async (transId) => {
    try {
      await fetch(`${API_URL}/fin/transacciones/${transId}`, { method: 'DELETE' })
      setTrans(t => t.filter(x => x.id !== transId))
    } catch { /* noop */ }
  }

  const selInst = flatInst.find(i => i.id === selId)

  const TH2 = { ...TH, fontSize: 10 }
  const TD2 = { ...TD, fontSize: 11 }

  return (
    <div className="panel-strong overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-4 py-3 border-b text-left"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)', border: 'none' }}
        onClick={() => setSelId(p => p ? null : flatInst[0]?.id ?? null)}
      >
        <BookOpen size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Ledger — Transacciones por instrumento</span>
      </button>

      {selId !== undefined && (
        <div className="p-4 flex flex-col gap-3">
          {/* Instrument selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {flatInst.map(i => (
              <button
                key={i.id}
                type="button"
                onClick={() => handleSelect(i.id)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                style={{
                  borderColor: selId === i.id ? 'var(--accent)' : 'var(--border)',
                  background: selId === i.id ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
                  color: selId === i.id ? 'var(--accent)' : 'var(--subtext)',
                }}
              >
                {i.ticker ?? i.nombre}
              </button>
            ))}
          </div>

          {selInst && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>{selInst.nombre}</span>
                <button
                  type="button"
                  onClick={() => setShowForm(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={11} /> Nueva
                </button>
              </div>

              {showForm && (
                <div className="flex flex-wrap gap-2 p-3 rounded-xl border" style={{ borderColor: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 5%, transparent)' }}>
                  {[
                    { label: 'Tipo', el: <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}>
                      <option value="compra">Compra</option><option value="venta">Venta</option></select> },
                    { label: 'Fecha', el: <input type="date" value={form.fecha} onChange={e => setForm(f => ({...f, fecha: e.target.value}))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, outline:'none' }} /> },
                    { label: 'Cantidad', el: <input type="number" placeholder="0" value={form.cantidad} onChange={e => setForm(f => ({...f, cantidad: e.target.value}))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 80, outline:'none' }} /> },
                    { label: 'Precio', el: <input type="number" placeholder="0" value={form.precio} onChange={e => setForm(f => ({...f, precio: e.target.value}))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 80, outline:'none' }} /> },
                    { label: 'Nota', el: <input type="text" placeholder="opcional" value={form.nota} onChange={e => setForm(f => ({...f, nota: e.target.value}))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 120, outline:'none' }} /> },
                  ].map(({ label, el }) => (
                    <label key={label} className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>{label}</span>
                      {el}
                    </label>
                  ))}
                  <div className="flex items-end gap-1">
                    <button type="button" onClick={handleAdd} className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}><Check size={11} /></button>
                    <button type="button" onClick={() => setShowForm(false)} className="px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'var(--bg)', color: 'var(--subtext)', border: '1px solid var(--border)', cursor: 'pointer' }}><X size={11} /></button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="text-[11px] py-2" style={{ color: 'var(--subtext)' }}>Cargando…</div>
              ) : trans.length === 0 ? (
                <div className="text-[11px] py-2" style={{ color: 'var(--subtext)' }}>Sin transacciones registradas.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['Fecha','Tipo','Cantidad','Precio','Total','Nota',''].map(h => (
                          <th key={h} scope="col" style={TH2}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trans.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={TD2}>{tx.fecha?.slice(0,10)}</td>
                          <td style={{ ...TD2, color: tx.tipo === 'compra' ? 'var(--income)' : 'var(--expense)', fontWeight: 600 }}>{tx.tipo}</td>
                          <td style={TD2}>{tx.cantidad}</td>
                          <td style={TD2}>{fmtARS(tx.precio)}</td>
                          <td style={{ ...TD2, fontWeight: 600 }}>{fmtARS(tx.monto_total)}</td>
                          <td style={{ ...TD2, color: 'var(--subtext)' }}>{tx.nota || '—'}</td>
                          <td style={TD2}>
                            <button type="button" onClick={() => handleDelete(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', lineHeight: 0, padding: 2 }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
                            ><Trash2 size={11} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function RepartoPanel({ lang, segments, liquido }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.val), 0)
  if (!segments.length && liquido === 0) return null
  const COLORS = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#ec4899', '#64748b']
  return (
    <div className="panel-strong p-4">
      <div className="label mb-2">{lang === 'en' ? 'Allocation' : 'Reparto del ahorro'}</div>
      {total > 0 && (
        <div className="flex rounded-full overflow-hidden h-2.5 gap-px mb-3" style={{ background: 'var(--surface)' }}>
          {segments.filter(s => s.val > 0).map((s, i) => (
            <div
              key={s.key}
              title={`${s.label}: ${fmtARS(s.val)}`}
              style={{
                width: `${(s.val / total) * 100}%`,
                background: COLORS[i % COLORS.length],
                minWidth: s.val > 0 ? 4 : 0,
              }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {segments.map(s => (
          <div key={s.key} className="flex justify-between text-[12px]">
            <span style={{ color: 'var(--subtext)' }}>{s.label}</span>
            <span className="mono tnum font-medium" style={{ color: 'var(--text)' }}>{fmtARS(s.val)}</span>
          </div>
        ))}
        <div className="flex justify-between text-[12px] pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <span style={{ color: 'var(--subtext)' }}>{lang === 'en' ? 'Uninvested cash' : 'Líquido sin invertir'}</span>
          <span
            className="mono tnum font-semibold"
            style={{ color: liquido >= 0 ? 'var(--warning)' : 'var(--expense)' }}
          >
            {fmtARS(liquido)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function AhorroTab() {
  const lang            = useStore(s => s.lang)
  const finInstrumentos = useStore(s => s.finInstrumentos)
  const fetchInst       = useStore(s => s.fetchFinInstrumentos)
  const addInst         = useStore(s => s.addFinInstrumento)
  const finConfig       = useStore(s => s.finConfig)
  const finMovimientosAll = useStore(s => s.finMovimientosAll)
  const fetchAll        = useStore(s => s.fetchFinMovimientosAll)
  const finObjetivos    = useStore(s => s.finObjetivos)
  const fetchObj        = useStore(s => s.fetchFinObjetivos)

  useEffect(() => { fetchInst(); fetchAll(); fetchObj() }, [])

  const dolar = finConfig?.dolar_mep ?? finConfig?.dolar_oficial ?? finConfig?.dolar_default ?? 1245

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

  const costoTotalInstrumentos = useMemo(() => {
    return finInstrumentos.reduce((sum, i) => {
      if (i.tipo === 'plazo_fijo') return sum + (i.capital_ars ?? 0)
      return sum + (i.costo_usd ?? 0) * dolar
    }, 0)
  }, [finInstrumentos, dolar])

  const reparto = useMemo(() => {
    const fire = acumuladoPorCategoriaNombre(finMovimientosAll, CATEGORIA_FIRE)
    const objetivos = (finObjetivos || []).map(o => ({
      key: `obj-${o.id}`,
      label: o.nombre,
      val: acumuladoPorCategoriaNombre(finMovimientosAll, o.nombre),
    }))
    const segments = [
      { key: 'fire', label: CATEGORIA_FIRE, val: fire },
      ...objetivos,
    ]
    const cajones = fire + objetivos.reduce((s, o) => s + o.val, 0)
    const liquido = cajones - costoTotalInstrumentos
    return { segments, liquido, cajones }
  }, [finMovimientosAll, finObjetivos, costoTotalInstrumentos, lang])

  const legacyAhorroCount = useMemo(() => (
    finMovimientosAll.filter(m =>
      (m.cat ?? m.categoria_nombre ?? '').trim().toLowerCase() === 'ahorro'
    ).length
  ), [finMovimientosAll])

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
      {legacyAhorroCount > 0 && (
        <div
          className="rounded-xl border px-4 py-3 text-[12px]"
          style={{
            borderColor: 'color-mix(in oklch, var(--warning) 40%, var(--border))',
            background: 'color-mix(in oklch, var(--warning) 8%, transparent)',
            color: 'var(--text)',
          }}
        >
          Hay {legacyAhorroCount} movimiento(s) con categoría <strong>Ahorro</strong> (modelo anterior).
          Reasignalos a <strong>FIRE</strong> o a la categoría del objetivo correspondiente en Datos.
        </div>
      )}
      <RepartoPanel lang={lang} segments={reparto.segments} liquido={reparto.liquido} />
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
          {reparto.liquido !== 0 && (
            <>
              <div className="opacity-30 text-[20px]">·</div>
              <div>
                <div className="text-[10px] uppercase tracking-wide mono mb-0.5" style={{ color: 'var(--subtext)' }}>
                  {t(lang, 'ahorroLiquido')}
                </div>
                <div
                  className="serif italic text-[18px] font-semibold tnum"
                  style={{ color: reparto.liquido >= 0 ? 'var(--warning)' : 'var(--expense)' }}
                >
                  {fmtARS(reparto.liquido)}
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

      {/* Ledger de transacciones */}
      {finInstrumentos.length > 0 && (
        <LedgerSection instrumentos={finInstrumentos} lang={lang} />
      )}
    </div>
  )
}
