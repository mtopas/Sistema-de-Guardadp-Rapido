import { useState, useMemo, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Check, X, BookOpen } from 'lucide-react'
import { API_URL } from '../../config'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import {
  fmtARS, fmtUSD, fmtCantidad, acumuladoPorCategoriaNombre, CATEGORIA_FIRE,
} from '../../data/finanzas'

const TIPOS = [
  { id: 'acciones',       labelKey: 'tipoAcciones'     },
  { id: 'fci',            labelKey: 'tipoFCI'          },
  { id: 'plazo_fijo',     labelKey: 'tipoPlazoFijo'    },
  { id: 'plazo_fijo_uva', labelKey: 'tipoPlazoFijoUVA' },
  { id: 'ons',            labelKey: 'tipoONs'          },
  { id: 'crypto',         labelKey: 'tipoCrypto'       },
  { id: 'otros',          labelKey: 'tipoOtros'        },
]

const TH = {
  padding: '5px 8px',
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--subtext)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--surface)',
}
const TD = { padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', verticalAlign: 'middle' }

const INST_INPUT = {
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  width: '100%',
  padding: 0,
  minWidth: 0,
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysISO(iso, days) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isValidDateISO(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
  const [y, mo, da] = str.split('-').map(Number)
  if (y < 1900 || y > 2100) return false
  const d = new Date(y, mo - 1, da)
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da
}

function calcIntereses(inst) {
  if (!inst.fecha_inicio || !inst.fecha_vencimiento || !inst.tna || !inst.capital_ars) return 0
  const inicio = inst.fecha_inicio.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const venc   = inst.fecha_vencimiento.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!inicio || !venc) return 0
  const d0 = new Date(Number(inicio[1]), Number(inicio[2]) - 1, Number(inicio[3]))
  const d1 = new Date(Number(venc[1]), Number(venc[2]) - 1, Number(venc[3]))
  const dias = Math.max(0, (d1 - d0) / 86400000)
  return inst.capital_ars * (inst.tna / 100) * (dias / 365)
}

/** Precio de la UVA al colocar: guardado en precio_actual, o monto ÷ UVAs. */
function calcPrecioUvaColocacion(inst) {
  const stored = Number(inst.precio_actual)
  if (Number.isFinite(stored) && stored > 0) return stored
  const monto = Number(inst.capital_ars)
  const uvas = Number(inst.cantidad)
  if (!Number.isFinite(monto) || !Number.isFinite(uvas) || uvas <= 0) return null
  return monto / uvas
}

/** Valor estimado hoy = cantidad de UVAs × cotización UVA actual. */
function calcValorUvaHoy(inst, uvaHoy) {
  const uvas = Number(inst.cantidad)
  if (!Number.isFinite(uvas) || uvas <= 0 || !uvaHoy || uvaHoy <= 0) return null
  return uvas * uvaHoy
}

function sumValorUvaHoy(items, uvaHoy) {
  if (!uvaHoy || uvaHoy <= 0 || !items.length) return null
  let sum = 0
  let count = 0
  for (const inst of items) {
    const v = calcValorUvaHoy(inst, uvaHoy)
    if (v != null) { sum += v; count++ }
  }
  return count > 0 ? sum : null
}

function valorInstrumentoARS(inst) {
  if (inst.tipo === 'plazo_fijo') return (inst.capital_ars ?? 0) + calcIntereses(inst)
  if (inst.tipo === 'plazo_fijo_uva') return inst.capital_ars ?? 0
  return 0
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
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const d = new Date(str)
  return isNaN(d.getTime()) ? str : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Valor para `<input type="date">` (YYYY-MM-DD), sin depender del timezone. */
function dateToInputIso(str) {
  if (!str) return ''
  const iso = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = String(str).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`
  }
  return ''
}

// ── Add instrument form ───────────────────────────────────────────────────────

function AddForm({ tipo, onSave, onCancel, lang }) {
  const isPF     = tipo === 'plazo_fijo'
  const isPFUVA  = tipo === 'plazo_fijo_uva'
  const isFCI    = tipo === 'fci'
  const isOtros  = tipo === 'otros'
  const isPFTipo = isPF || isPFUVA

  const defaultInicio = todayISO()
  const [f, setF] = useState({
    ticker: '', sociedad: '', nombre: '', cantidad: '', costo_usd: '', tipo_cambio: '',
    precio_actual: '', entidad: '', capital_ars: '', tna: '', precio_uva: '',
    fecha_inicio: defaultInicio,
    fecha_vencimiento: addDaysISO(defaultInicio, 30),
  })
  const [dateError, setDateError] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const precioUvaPreview = useMemo(() => {
    const manual = parseFloat(f.precio_uva)
    if (manual > 0) return manual
    const monto = parseFloat(f.capital_ars)
    const uvas = parseFloat(f.cantidad)
    if (!monto || !uvas || uvas <= 0) return null
    return monto / uvas
  }, [f.precio_uva, f.capital_ars, f.cantidad])

  const inp = (placeholder, key, type = 'text') => (
    <input
      type={type}
      placeholder={type === 'date' ? undefined : placeholder}
      value={f[key]}
      onChange={e => { setDateError(''); set(key, e.target.value) }}
      style={{
        background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
        borderRadius: 8, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
        outline: 'none', width: '100%',
        minWidth: type === 'date' ? 130 : undefined,
      }}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    />
  )

  const handleSave = () => {
    if (isPFTipo) {
      if (!isValidDateISO(f.fecha_inicio) || !isValidDateISO(f.fecha_vencimiento)) {
        setDateError(lang === 'en' ? 'Invalid date — use the calendar picker' : 'Fecha inválida — usá el selector de calendario')
        return
      }
      if (f.fecha_vencimiento < f.fecha_inicio) {
        setDateError(lang === 'en' ? 'Maturity must be after start date' : 'El vencimiento debe ser posterior al inicio')
        return
      }
    }
    const payload = { tipo, nombre: f.nombre || f.ticker || '?' }
    if (!isPFTipo) {
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
    if (isPFUVA) {
      const monto = parseFloat(f.capital_ars)
      const uvas = parseFloat(f.cantidad)
      const precioUva = parseFloat(f.precio_uva) || (monto && uvas > 0 ? monto / uvas : null)
      if (!monto || !uvas || uvas <= 0 || !precioUva || !f.fecha_inicio || !f.fecha_vencimiento) return
      payload.nombre            = f.entidad || t(lang, 'tipoPlazoFijoUVA')
      payload.entidad           = f.entidad || null
      payload.capital_ars       = monto
      payload.cantidad          = uvas
      payload.precio_actual     = precioUva
      payload.fecha_inicio      = f.fecha_inicio
      payload.fecha_vencimiento = f.fecha_vencimiento
    }
    onSave(payload)
  }

  return (
    <tr style={{ background: 'color-mix(in oklch, var(--accent) 5%, transparent)' }}>
      <td colSpan={99} style={{ ...TD, padding: '8px 10px' }}>
        <div className="flex flex-wrap gap-2 items-end">
          {!isPFTipo && !isOtros && !isFCI && <div className="flex flex-col gap-0.5" style={{ width: 80 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrTicker')}</span>{inp('AAPL','ticker')}</div>}
          {isFCI && <div className="flex flex-col gap-0.5" style={{ width: 130 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrSociedad')}</span>{inp('Pionero','sociedad')}</div>}
          {!isPFUVA && <div className="flex flex-col gap-0.5" style={{ width: 140 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrNombre')}</span>{inp(t(lang,'instrNombre'),'nombre')}</div>}
          {!isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 90 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCantidad')}</span>{inp('0','cantidad','number')}</div>}
          {!isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 100 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCosto')}</span>{inp('0','costo_usd','number')}</div>}
          {!isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 90 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrPrecio')}</span>{inp('0','precio_actual','number')}</div>}
          {isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 120 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrEntidad')}</span>{inp('Banco','entidad')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrCapital')}</span>{inp('0','capital_ars','number')}</div>}
          {isPF && <div className="flex flex-col gap-0.5" style={{ width: 70 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrTNA')}</span>{inp('97.5','tna','number')}</div>}
          {isPFUVA && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrMontoColocado')}</span>{inp('0','capital_ars','number')}</div>}
          {isPFUVA && <div className="flex flex-col gap-0.5" style={{ width: 100 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrUVAs')}</span>{inp('0','cantidad','number')}</div>}
          {isPFUVA && <div className="flex flex-col gap-0.5" style={{ width: 110 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrPrecioUva')}</span>{inp('0','precio_uva','number')}</div>}
          {isPFUVA && precioUvaPreview != null && (
            <div className="flex flex-col gap-0.5 justify-end" style={{ minWidth: 100 }}>
              <span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'colPrecioUva')}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: 'var(--accent)', padding: '4px 0' }}>{fmtARS(precioUvaPreview)}</span>
            </div>
          )}
          {isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 136 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrInicio')}</span>{inp('','fecha_inicio','date')}</div>}
          {isPFTipo && <div className="flex flex-col gap-0.5" style={{ width: 136 }}><span style={{ fontSize: 10, color: 'var(--subtext)' }}>{t(lang,'instrVenc')}</span>{inp('','fecha_vencimiento','date')}</div>}
          {dateError && (
            <span style={{ fontSize: 11, color: '#ef4444', alignSelf: 'center' }}>{dateError}</span>
          )}
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

// ── Inline edit cells (mismo patrón que DatosTab) ─────────────────────────────

function InstTextCell({ inst, field, display, getEditValue, tdStyle = {} }) {
  const updateInst = useStore(s => s.updateFinInstrumento)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const shown = display ?? inst[field]

  const commit = () => {
    const trimmed = val.trim()
    const prev = String(getEditValue ? getEditValue(inst) : inst[field] ?? '').trim()
    if (trimmed !== prev) updateInst(inst.id, { [field]: trimmed || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <td style={{ ...TD, ...tdStyle }}>
        <input
          type="text"
          value={val}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={INST_INPUT}
        />
      </td>
    )
  }

  return (
    <td
      style={{ ...TD, cursor: 'text', ...tdStyle }}
      onClick={() => { setVal(String(getEditValue ? getEditValue(inst) : inst[field] ?? '')); setEditing(true) }}
    >
      <span style={{ color: shown ? 'var(--text)' : 'var(--subtext)' }}>{shown || '—'}</span>
    </td>
  )
}

function InstNumberCell({
  inst, field, display, tdStyle = {}, inputStyle = {}, patchTransform,
}) {
  const updateInst = useStore(s => s.updateFinInstrumento)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const commit = () => {
    const n = parseFloat(String(val).replace(',', '.'))
    if (!Number.isFinite(n)) { setEditing(false); return }
    const patch = patchTransform ? patchTransform(n, inst) : { [field]: n }
    updateInst(inst.id, patch)
    setEditing(false)
  }

  if (editing) {
    return (
      <td style={{ ...TD, ...tdStyle }}>
        <input
          type="number"
          step="any"
          value={val}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{ ...INST_INPUT, ...inputStyle }}
        />
      </td>
    )
  }

  return (
    <td
      style={{ ...TD, cursor: 'text', ...tdStyle }}
      onClick={() => { setVal(String(inst[field] ?? '')); setEditing(true) }}
    >
      <span style={{ color: display != null && display !== '—' ? 'var(--text)' : 'var(--subtext)' }}>
        {display ?? '—'}
      </span>
    </td>
  )
}

function InstDerivedNumberCell({ inst, getValue, display, patchTransform, tdStyle = {}, inputStyle = {} }) {
  const updateInst = useStore(s => s.updateFinInstrumento)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')

  const commit = () => {
    const n = parseFloat(String(val).replace(',', '.'))
    if (!Number.isFinite(n)) { setEditing(false); return }
    updateInst(inst.id, patchTransform(n, inst))
    setEditing(false)
  }

  if (editing) {
    return (
      <td style={{ ...TD, ...tdStyle }}>
        <input
          type="number"
          step="any"
          value={val}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{ ...INST_INPUT, ...inputStyle }}
        />
      </td>
    )
  }

  return (
    <td
      style={{ ...TD, cursor: 'text', ...tdStyle }}
      onClick={() => { setVal(String(getValue(inst) ?? '')); setEditing(true) }}
    >
      <span style={{ color: display !== '—' ? 'var(--text)' : 'var(--subtext)' }}>{display}</span>
    </td>
  )
}

function InstDateCell({ inst, field, tdStyle = {} }) {
  const updateInst = useStore(s => s.updateFinInstrumento)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const storedIso = dateToInputIso(inst[field])

  const startEdit = () => {
    setVal(storedIso)
    setEditing(true)
  }

  const commit = () => {
    const next = val || storedIso
    if (next && next !== storedIso) updateInst(inst.id, { [field]: next })
    setEditing(false)
  }

  const cancel = () => {
    setVal('')
    setEditing(false)
  }

  if (editing) {
    const inputVal = val || storedIso
    return (
      <td style={{ ...TD, ...tdStyle }}>
        <input
          type="date"
          value={inputVal}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          style={{ ...INST_INPUT, minWidth: 120 }}
        />
      </td>
    )
  }

  return (
    <td
      style={{ ...TD, cursor: 'text', ...tdStyle }}
      onClick={startEdit}
    >
      {fmtFecha(inst[field])}
    </td>
  )
}

function InstReadOnlyCell({ children, tdStyle = {} }) {
  return <td style={{ ...TD, ...tdStyle }}>{children}</td>
}

// ── Instrument rows by type ───────────────────────────────────────────────────

function AccionesRows({ items }) {
  return items.map(inst => {
    const valor   = (inst.cantidad ?? 0) * (inst.precio_actual ?? 0)
    const pl      = pnl(inst)
    const plColor = pl == null ? 'var(--text)' : pl.diff >= 0 ? 'var(--success)' : '#ef4444'
    const ppp     = inst.costo_usd != null && inst.cantidad > 0 ? inst.costo_usd / inst.cantidad : null
    const locked  = !!inst.has_transactions
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        {locked
          ? <InstReadOnlyCell tdStyle={{ fontWeight: 700 }}>{inst.ticker ?? '—'}</InstReadOnlyCell>
          : <InstTextCell inst={inst} field="ticker" tdStyle={{ fontWeight: 700 }} />
        }
        <InstTextCell inst={inst} field="nombre" />
        {locked
          ? <InstReadOnlyCell tdStyle={{ textAlign: 'right' }}>{fmtCantidad(inst.cantidad ?? 0)}</InstReadOnlyCell>
          : <InstNumberCell
              inst={inst}
              field="cantidad"
              display={fmtCantidad(inst.cantidad ?? 0)}
              tdStyle={{ textAlign: 'right' }}
              inputStyle={{ textAlign: 'right' }}
            />
        }
        {locked
          ? <InstReadOnlyCell tdStyle={{ textAlign: 'right' }}>{ppp != null ? fmtUSD(ppp) : '—'}</InstReadOnlyCell>
          : <InstDerivedNumberCell
              inst={inst}
              getValue={i => (i.costo_usd != null && i.cantidad > 0 ? i.costo_usd / i.cantidad : '')}
              display={ppp != null ? fmtUSD(ppp) : '—'}
              patchTransform={(n, i) => ({ costo_usd: n * (i.cantidad || 0) })}
              tdStyle={{ textAlign: 'right' }}
              inputStyle={{ textAlign: 'right' }}
            />
        }
        <InstNumberCell
          inst={inst}
          field="precio_actual"
          display={inst.precio_actual != null ? fmtUSD(inst.precio_actual) : '—'}
          tdStyle={{ textAlign: 'right', color: 'var(--accent)' }}
          inputStyle={{ textAlign: 'right', color: 'var(--accent)' }}
        />
        <InstReadOnlyCell tdStyle={{ textAlign: 'right' }}>{fmtUSD(valor)}</InstReadOnlyCell>
        <InstReadOnlyCell tdStyle={{ textAlign: 'right', color: plColor }}>
          {pl != null ? `${pl.diff >= 0 ? '+' : ''}${fmtUSD(pl.diff)} (${pl.pct >= 0 ? '+' : ''}${pl.pct.toFixed(1)}%)` : '—'}
        </InstReadOnlyCell>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function FCIRows({ items }) {
  return items.map(inst => {
    const valor = (inst.cantidad ?? 0) * (inst.precio_actual ?? 0)
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <InstTextCell inst={inst} field="sociedad" tdStyle={{ color: 'var(--subtext)' }} />
        <InstTextCell inst={inst} field="nombre" />
        <InstNumberCell
          inst={inst}
          field="cantidad"
          display={fmtCantidad(inst.cantidad ?? 0)}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
        <InstNumberCell
          inst={inst}
          field="precio_actual"
          display={inst.precio_actual != null ? fmtUSD(inst.precio_actual) : '—'}
          tdStyle={{ textAlign: 'right', color: 'var(--accent)' }}
          inputStyle={{ textAlign: 'right', color: 'var(--accent)' }}
        />
        <InstReadOnlyCell tdStyle={{ textAlign: 'right' }}>{fmtUSD(valor)}</InstReadOnlyCell>
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
        <InstTextCell inst={inst} field="entidad" />
        <InstNumberCell
          inst={inst}
          field="capital_ars"
          display={fmtARS(inst.capital_ars ?? 0)}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
        <InstNumberCell
          inst={inst}
          field="tna"
          display={inst.tna != null ? `${inst.tna}%` : '—'}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
        <InstDateCell inst={inst} field="fecha_inicio" />
        <InstDateCell inst={inst} field="fecha_vencimiento" />
        <InstReadOnlyCell tdStyle={{ textAlign: 'right', color: 'var(--success)' }}>{fmtARS(intereses)}</InstReadOnlyCell>
        <InstReadOnlyCell tdStyle={{ textAlign: 'right', fontWeight: 600 }}>{fmtARS(total)}</InstReadOnlyCell>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function PlazoFijoUVARows({ items, uvaHoy }) {
  return items.map(inst => {
    const precioUva = calcPrecioUvaColocacion(inst)
    const valorHoy  = calcValorUvaHoy(inst, uvaHoy)
    const colocado  = inst.capital_ars ?? 0
    const diff      = valorHoy != null ? valorHoy - colocado : null
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <InstTextCell
          inst={inst}
          field="entidad"
          display={inst.entidad ?? inst.nombre}
          getEditValue={i => i.entidad ?? i.nombre ?? ''}
        />
        <InstNumberCell
          inst={inst}
          field="capital_ars"
          display={fmtARS(colocado)}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
        <InstNumberCell
          inst={inst}
          field="cantidad"
          display={fmtCantidad(inst.cantidad ?? 0)}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
        <InstNumberCell
          inst={inst}
          field="precio_actual"
          display={precioUva != null ? fmtARS(precioUva) : '—'}
          tdStyle={{ textAlign: 'right', color: 'var(--accent)' }}
          inputStyle={{ textAlign: 'right', color: 'var(--accent)' }}
        />
        <InstDateCell inst={inst} field="fecha_inicio" />
        <InstDateCell inst={inst} field="fecha_vencimiento" />
        <InstReadOnlyCell tdStyle={{ textAlign: 'right' }}>
          {valorHoy != null ? (
            <div className="flex flex-col items-end gap-0.5">
              <span style={{ fontWeight: 600 }}>{fmtARS(valorHoy)}</span>
              {diff != null && (
                <span style={{ fontSize: 10, color: diff >= 0 ? 'var(--success)' : '#ef4444' }}>
                  {diff >= 0 ? '+' : ''}{fmtARS(diff)}
                </span>
              )}
            </div>
          ) : '—'}
        </InstReadOnlyCell>
        <DeleteCell id={inst.id} />
      </tr>
    )
  })
}

function OtrosRows({ items }) {
  return items.map(inst => {
    const qty   = inst.cantidad > 0 ? inst.cantidad : 1
    const unit  = inst.precio_actual ?? inst.costo_usd ?? 0
    const valor = qty * unit
    return (
      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
        <InstTextCell inst={inst} field="nombre" />
        <InstDerivedNumberCell
          inst={inst}
          getValue={i => {
            const q = i.cantidad > 0 ? i.cantidad : 1
            return (i.precio_actual ?? i.costo_usd ?? 0) * q
          }}
          display={fmtUSD(valor)}
          patchTransform={(total, i) => {
            const q = i.cantidad > 0 ? i.cantidad : 1
            const unit = total / q
            return { precio_actual: unit, costo_usd: total }
          }}
          tdStyle={{ textAlign: 'right' }}
          inputStyle={{ textAlign: 'right' }}
        />
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

function PlazoFijoUVAHeader({ lang }) {
  return (
    <tr>
      {['colEntidad','colMontoColocado','colUVAs','colPrecioUva','colInicio','colVencimiento','colValorHoy',''].map(k => (
        <th key={k} scope="col" style={TH}>{k ? t(lang, k) : ''}</th>
      ))}
    </tr>
  )
}

function UvaHoyBar({ lang }) {
  const finConfig       = useStore(s => s.finConfig)
  const updateFinConfig = useStore(s => s.updateFinConfig)
  const [val, setVal]   = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setVal(finConfig?.uva_valor ?? '')
  }, [finConfig?.uva_valor])

  const commit = async () => {
    const raw = String(val).trim().replace(',', '.')
    if (!raw) return
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) return
    await updateFinConfig('uva_valor', String(n))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-2 border-b"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, #0d9488 6%, transparent)' }}
    >
      <span className="text-[11px] font-medium" style={{ color: 'var(--text)' }}>{t(lang, 'uvaHoyLabel')}</span>
      <input
        type="number"
        step="0.01"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        placeholder="1680.50"
        style={{
          background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
          borderRadius: 8, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
          outline: 'none', width: 110,
        }}
      />
      <span className="text-[10px]" style={{ color: 'var(--subtext)' }}>{t(lang, 'uvaHoyHint')}</span>
      {saved && <span className="text-[10px]" style={{ color: 'var(--success)' }}>✓</span>}
    </div>
  )
}

function UvaValorHoyTotal({ total, lang }) {
  return (
    <div
      className="flex justify-end items-baseline gap-2 px-4 pt-2 pb-0.5"
      style={{ paddingRight: 44 }}
    >
      <span
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--mute)',
        }}
      >
        {t(lang, 'colTotal')}
      </span>
      <span className="mono tnum" style={{ fontSize: 13, color: 'var(--subtext)' }}>
        {fmtARS(total)}
      </span>
    </div>
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
      if (i.tipo === 'plazo_fijo' || i.tipo === 'plazo_fijo_uva') val = valorInstrumentoARS(i)
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
    plazo_fijo_uva: '#0d9488', ons: '#8b5cf6', crypto: '#ec4899', otros: 'var(--subtext)',
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
  const finConfig           = useStore(s => s.finConfig)
  const uvaHoy              = parseFloat(finConfig?.uva_valor) || null

  const handleSave = async (payload) => {
    await addInstrumento(payload)
    setAdding(false)
  }

  const isPF     = tipo === 'plazo_fijo'
  const isPFUVA  = tipo === 'plazo_fijo_uva'
  const isFCI    = tipo === 'fci'
  const isOtros  = tipo === 'otros'
  const isStock  = ['acciones', 'ons', 'crypto'].includes(tipo)

  const totalValorHoy = useMemo(
    () => (isPFUVA ? sumValorUvaHoy(items, uvaHoy) : null),
    [isPFUVA, items, uvaHoy],
  )

  const renderHeader = () => {
    if (isStock)   return <AccionesHeader lang={lang} />
    if (isFCI)     return <FCIHeader lang={lang} />
    if (isPF)      return <PlazoFijoHeader lang={lang} />
    if (isPFUVA)   return <PlazoFijoUVAHeader lang={lang} />
    return <OtrosHeader lang={lang} />
  }

  const renderRows = () => {
    if (isStock)   return <AccionesRows items={items} />
    if (isFCI)     return <FCIRows items={items} />
    if (isPF)      return <PlazoFijoRows items={items} />
    if (isPFUVA)   return <PlazoFijoUVARows items={items} uvaHoy={uvaHoy} />
    return <OtrosRows items={items} />
  }

  const labelKey = TIPOS.find(t => t.id === tipo)?.labelKey ?? tipo

  return (
    <div>
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
        <>
          {isPFUVA && <UvaHoyBar lang={lang} />}
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
        </>
      )}
      </div>
      {open && isPFUVA && totalValorHoy != null && (
        <UvaValorHoyTotal total={totalValorHoy} lang={lang} />
      )}
    </div>
  )
}

// ── Ledger (entidad bancaria vs ticker) ───────────────────────────────────────

const LEDGER_ENTITY_TYPES = new Set(['plazo_fijo', 'plazo_fijo_uva'])

function isLedgerEntityGrouped(inst) {
  return LEDGER_ENTITY_TYPES.has(inst.tipo)
}

function isLedgerTradable(inst) {
  return !isLedgerEntityGrouped(inst)
}

function ledgerEntidadKey(inst, lang) {
  const e = (inst.entidad ?? '').trim()
  if (e) return e
  const n = (inst.nombre ?? '').trim()
  return n || t(lang, 'ledgerSinEntidad')
}

function ledgerIndividualLabel(inst) {
  if (['acciones', 'ons', 'crypto'].includes(inst.tipo)) {
    return (inst.ticker ?? '').trim() || (inst.nombre ?? '').trim() || '?'
  }
  if (inst.tipo === 'fci') {
    const n = (inst.nombre ?? '').trim()
    const s = (inst.sociedad ?? '').trim()
    if (s && n) return `${s} · ${n}`
    return n || s || '?'
  }
  return (inst.nombre ?? '').trim() || (inst.ticker ?? '').trim() || '?'
}

function ledgerSubLabel(inst, lang) {
  if (inst.tipo === 'plazo_fijo_uva') {
    return `${t(lang, 'tipoPlazoFijoUVA')} · ${fmtARS(inst.capital_ars ?? 0)} · ${fmtFecha(inst.fecha_vencimiento)}`
  }
  if (inst.tipo === 'plazo_fijo') {
    const tna = inst.tna != null ? ` · TNA ${inst.tna}%` : ''
    return `${t(lang, 'tipoPlazoFijo')} · ${fmtARS(inst.capital_ars ?? 0)}${tna} · ${fmtFecha(inst.fecha_vencimiento)}`
  }
  return ledgerIndividualLabel(inst)
}

function ledgerChipStyle(active) {
  return {
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--subtext)',
  }
}

function ColocacionDetail({ inst, lang }) {
  const finConfig = useStore(s => s.finConfig)
  const uvaHoy = parseFloat(finConfig?.uva_valor) || null

  const rows = useMemo(() => {
    if (inst.tipo === 'plazo_fijo') {
      const intereses = calcIntereses(inst)
      const total = (inst.capital_ars ?? 0) + intereses
      return [
        [t(lang, 'colCapital'), fmtARS(inst.capital_ars ?? 0)],
        ...(inst.tna != null ? [[t(lang, 'colTNA'), `${inst.tna}%`]] : []),
        [t(lang, 'colInicio'), fmtFecha(inst.fecha_inicio)],
        [t(lang, 'colVencimiento'), fmtFecha(inst.fecha_vencimiento)],
        [t(lang, 'colIntereses'), fmtARS(intereses)],
        [t(lang, 'colCapitalTotal'), fmtARS(total)],
      ]
    }
    if (inst.tipo === 'plazo_fijo_uva') {
      const valorHoy = calcValorUvaHoy(inst, uvaHoy)
      return [
        [t(lang, 'colMontoColocado'), fmtARS(inst.capital_ars ?? 0)],
        [t(lang, 'colUVAs'), fmtCantidad(inst.cantidad ?? 0)],
        [t(lang, 'colPrecioUva'), fmtARS(calcPrecioUvaColocacion(inst) ?? 0)],
        [t(lang, 'colInicio'), fmtFecha(inst.fecha_inicio)],
        [t(lang, 'colVencimiento'), fmtFecha(inst.fecha_vencimiento)],
        ...(valorHoy != null ? [[t(lang, 'colValorHoy'), fmtARS(valorHoy)]] : []),
      ]
    }
    return []
  }, [inst, lang, uvaHoy])

  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2.5"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--accent) 4%, transparent)' }}
    >
      <p className="text-[11px] leading-snug" style={{ color: 'var(--subtext)' }}>
        {t(lang, 'ledgerColocacionNote')}
      </p>
      <dl className="grid gap-1.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[10px] uppercase tracking-wider pr-3" style={{ color: 'var(--subtext)' }}>{label}</dt>
            <dd className="text-[12px] mono tnum font-medium m-0" style={{ color: 'var(--text)' }}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function LedgerTradablePanel({ inst, lang, trans, loading, showForm, setShowForm, form, setForm, onAdd, onDelete, formError }) {
  const TH2 = { ...TH, fontSize: 10 }
  const TD2 = { ...TD, fontSize: 11 }
  const title = ledgerIndividualLabel(inst)

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[12px] font-medium" style={{ color: 'var(--text)' }}>{title}</span>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={11} /> {t(lang, 'ledgerNewTx')}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl border" style={{ borderColor: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 5%, transparent)' }}>
          {[
            { label: t(lang, 'ledgerTxTipo'), el: (
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}>
                <option value="compra">{t(lang, 'ledgerTxCompra')}</option>
                <option value="venta">{t(lang, 'ledgerTxVenta')}</option>
              </select>
            ) },
            { label: t(lang, 'ledgerTxFecha'), el: (
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, outline: 'none' }} />
            ) },
            { label: t(lang, 'ledgerTxCantidad'), el: (
              <input type="number" placeholder="0" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 80, outline: 'none' }} />
            ) },
            { label: t(lang, 'ledgerTxPrecio'), el: (
              <input type="number" placeholder="0" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 80, outline: 'none' }} />
            ) },
            { label: t(lang, 'ledgerTxMoneda'), el: (
              <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11 }}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            ) },
            ...(form.moneda === 'ARS' ? [{ label: t(lang, 'ledgerTxTipoCambio'), el: (
              <input type="number" placeholder="0" value={form.tipo_cambio} onChange={e => setForm(f => ({ ...f, tipo_cambio: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 80, outline: 'none' }} />
            ) }] : []),
            { label: t(lang, 'ledgerTxNota'), el: (
              <input type="text" placeholder="…" value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '3px 6px', fontSize: 11, width: 120, outline: 'none' }} />
            ) },
          ].map(({ label, el }) => (
            <label key={label} className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>{label}</span>
              {el}
            </label>
          ))}
          <div className="flex items-end gap-1">
            <button type="button" onClick={onAdd} className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}><Check size={11} /></button>
            <button type="button" onClick={() => setShowForm(false)} className="px-2.5 py-1 rounded-lg text-[11px]" style={{ background: 'var(--bg)', color: 'var(--subtext)', border: '1px solid var(--border)', cursor: 'pointer' }}><X size={11} /></button>
          </div>
          {formError && (
            <div className="w-full text-[11px] mt-1" style={{ color: '#ef4444' }}>{formError}</div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-[11px] py-2" style={{ color: 'var(--subtext)' }}>{t(lang, 'ledgerLoading')}</div>
      ) : trans.length === 0 ? (
        <div className="text-[11px] py-2" style={{ color: 'var(--subtext)' }}>{t(lang, 'ledgerNoTrans')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr>
                {[t(lang, 'ledgerTxFecha'), t(lang, 'ledgerTxTipo'), t(lang, 'ledgerTxCantidad'), t(lang, 'ledgerTxPrecio'), t(lang, 'ledgerTxTotal'), t(lang, 'ledgerTxNota'), ''].map(h => (
                  <th key={h || 'act'} scope="col" style={TH2}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trans.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={TD2}>{tx.fecha?.slice(0, 10)}</td>
                  <td style={{ ...TD2, color: tx.tipo === 'compra' ? 'var(--income)' : 'var(--expense)', fontWeight: 600 }}>
                    {tx.tipo === 'compra' ? t(lang, 'ledgerTxCompra') : t(lang, 'ledgerTxVenta')}
                  </td>
                  <td style={TD2}>{tx.cantidad}</td>
                  <td style={TD2}>{fmtARS(tx.precio)}</td>
                  <td style={{ ...TD2, fontWeight: 600 }}>{fmtARS(tx.monto_total)}</td>
                  <td style={{ ...TD2, color: 'var(--subtext)' }}>{tx.nota || '—'}</td>
                  <td style={TD2}>
                    <button type="button" onClick={() => onDelete(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', lineHeight: 0, padding: 2 }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)' }}
                    ><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function LedgerSection({ instrumentos, lang }) {
  const [selEntity, setSelEntity] = useState(null)
  const [selId, setSelId]         = useState(null)
  const [trans, setTrans]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const [formError, setFormError] = useState(null)
  const [form, setForm]           = useState({
    tipo: 'compra',
    fecha: todayISO(),
    cantidad: '',
    precio: '',
    nota: '',
    moneda: 'ARS',
    tipo_cambio: '',
  })

  const addFinTransaccion    = useStore(s => s.addFinTransaccion)
  const deleteFinTransaccion = useStore(s => s.deleteFinTransaccion)

  const { entityGroups, individualChips } = useMemo(() => {
    const groups = new Map()
    const individuals = []
    for (const inst of instrumentos) {
      if (isLedgerEntityGrouped(inst)) {
        const key = ledgerEntidadKey(inst, lang)
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(inst)
      } else {
        individuals.push(inst)
      }
    }
    for (const items of groups.values()) {
      items.sort((a, b) => String(a.fecha_vencimiento ?? '').localeCompare(String(b.fecha_vencimiento ?? '')))
    }
    const labelCounts = {}
    for (const inst of individuals) {
      const base = ledgerIndividualLabel(inst)
      labelCounts[base] = (labelCounts[base] || 0) + 1
    }
    const chips = individuals
      .map(inst => {
        const base = ledgerIndividualLabel(inst)
        const label = labelCounts[base] > 1 && inst.nombre && inst.nombre !== base
          ? `${base} · ${inst.nombre}`
          : base
        return { inst, label }
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    return {
      entityGroups: [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })),
      individualChips: chips,
    }
  }, [instrumentos, lang])

  const entityItems = useMemo(() => {
    if (!selEntity) return []
    return entityGroups.find(([key]) => key === selEntity)?.[1] ?? []
  }, [entityGroups, selEntity])

  const selInst = useMemo(
    () => instrumentos.find(i => i.id === selId) ?? null,
    [instrumentos, selId],
  )

  const fetchTrans = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/fin/instrumentos/${id}/transacciones`)
      if (res.ok) setTrans(await res.json())
      else setTrans([])
    } catch {
      setTrans([])
    }
    setLoading(false)
  }, [])

  const selectInstrument = useCallback((inst, entityKey) => {
    if (!inst) return
    setSelId(inst.id)
    setSelEntity(entityKey ?? null)
    setShowForm(false)
    if (isLedgerTradable(inst)) fetchTrans(inst.id)
    else setTrans([])
  }, [fetchTrans])

  const handleSelectEntity = (key) => {
    const items = entityGroups.find(([k]) => k === key)?.[1] ?? []
    setSelEntity(key)
    if (items[0]) selectInstrument(items[0], key)
    else { setSelId(null); setTrans([]) }
  }

  const handleSelectIndividual = (inst) => {
    selectInstrument(inst, null)
  }

  const handleAdd = async () => {
    if (!selId || !form.cantidad || !form.precio) return
    setFormError(null)
    try {
      const payload = {
        tipo:        form.tipo,
        fecha:       form.fecha,
        cantidad:    parseFloat(form.cantidad),
        precio:      parseFloat(form.precio),
        nota:        form.nota || null,
        moneda:      form.moneda,
        tipo_cambio: form.moneda === 'ARS' && form.tipo_cambio ? parseFloat(form.tipo_cambio) : null,
      }
      await addFinTransaccion(selId, payload)
      await fetchTrans(selId)
      setShowForm(false)
    } catch (err) {
      setFormError(err?.message ?? t(lang, 'ledgerVentaExcede'))
    }
  }

  const handleDelete = async (transId) => {
    await deleteFinTransaccion(transId)
    setTrans(prev => prev.filter(x => x.id !== transId))
  }

  const entityChipActive = (key) => selEntity === key
  const individualChipActive = (id) => selId === id && selEntity == null

  return (
    <div className="panel-strong overflow-hidden">
      <div
        className="flex items-center gap-2 w-full px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <BookOpen size={14} style={{ color: 'var(--accent)' }} />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t(lang, 'ledgerTitle')}</span>
          <span className="text-[10px] truncate" style={{ color: 'var(--subtext)' }}>{t(lang, 'ledgerSubtitle')}</span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {entityGroups.map(([key, items]) => (
              <button
                key={`ent-${key}`}
                type="button"
                onClick={() => handleSelectEntity(key)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                style={ledgerChipStyle(entityChipActive(key))}
              >
                {key}
                <span className="opacity-60 ml-1">({items.length})</span>
              </button>
            ))}
            {individualChips.map(({ inst, label }) => (
              <button
                key={`inst-${inst.id}`}
                type="button"
                onClick={() => handleSelectIndividual(inst)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all"
                style={ledgerChipStyle(individualChipActive(inst.id))}
              >
                {label}
              </button>
            ))}
          </div>

          {selInst && (
            <>
              {selEntity && entityItems.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--subtext)' }}>{selEntity}</span>
                  <div className="flex flex-col gap-1">
                    {entityItems.map(inst => (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => selectInstrument(inst, selEntity)}
                        className="text-left px-3 py-2 rounded-lg border text-[11px] transition-all"
                        style={{
                          ...ledgerChipStyle(selId === inst.id),
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {ledgerSubLabel(inst, lang)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isLedgerEntityGrouped(selInst) ? (
                <ColocacionDetail inst={selInst} lang={lang} />
              ) : (
                <LedgerTradablePanel
                  inst={selInst}
                  lang={lang}
                  trans={trans}
                  loading={loading}
                  showForm={showForm}
                  setShowForm={setShowForm}
                  form={form}
                  setForm={setForm}
                  onAdd={handleAdd}
                  onDelete={handleDelete}
                  formError={formError}
                />
              )}
            </>
          )}
      </div>
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
      if (i.tipo === 'plazo_fijo' || i.tipo === 'plazo_fijo_uva') {
        arsPF += valorInstrumentoARS(i)
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
      if (i.tipo === 'plazo_fijo' || i.tipo === 'plazo_fijo_uva') return sum + (i.capital_ars ?? 0)
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
          Reasignalos a <strong>FIRE</strong> o al nombre del objetivo (categoría o descripción del movimiento).
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
