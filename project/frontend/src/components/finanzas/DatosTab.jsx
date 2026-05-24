import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { isTransferencia } from '../../data/finanzas'

// Normalize field access across mock (type/amount/date/cat/desc/method) and API schemas
function getVal(mov, field) {
  switch (field) {
    case 'tipo':   return mov.type   ?? mov.tipo             ?? 'expense'
    case 'monto':  return mov.amount ?? mov.monto            ?? 0
    case 'fecha':  return mov.date   ?? mov.fecha            ?? ''
    case 'cat':    return mov.cat    ?? mov.categoria_nombre ?? ''
    case 'desc':   return mov.desc   ?? mov.descripcion      ?? ''
    case 'method': return mov.method ?? mov.metodo ?? mov.cuenta_nombre ?? ''
    case 'moneda': return mov.moneda ?? 'ARS'
    case 'cuotas': return mov.cuotas ?? ''
    default:       return ''
  }
}

// Build the patch key using whatever key the movement already uses
function patchKey(mov, field) {
  switch (field) {
    case 'tipo':   return mov.type   !== undefined ? 'type'   : 'tipo'
    case 'monto':  return mov.amount !== undefined ? 'amount' : 'monto'
    case 'fecha':  return mov.date   !== undefined ? 'date'   : 'fecha'
    case 'cat':    return mov.cat    !== undefined ? 'cat'    : 'categoria_nombre'
    case 'desc':   return mov.desc   !== undefined ? 'desc'   : 'descripcion'
    case 'method': return mov.method !== undefined ? 'method' : mov.metodo !== undefined ? 'metodo' : 'cuenta_nombre'
    default:       return field
  }
}

function fmtFecha(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

const INPUT = {
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

const TD = { padding: '4px 8px', verticalAlign: 'middle' }

const TH = {
  padding: '6px 8px',
  textAlign: 'left',
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

export default function DatosTab() {
  const lang      = useStore(s => s.lang)
  const movAll    = useStore(s => s.finMovimientosAll)
  const fetchAll  = useStore(s => s.fetchFinMovimientosAll)
  const updateMov = useStore(s => s.updateFinMovimiento)
  const deleteMov = useStore(s => s.deleteFinMovimiento)

  useEffect(() => { fetchAll() }, [])

  const rows = useMemo(() =>
    movAll
      .filter(m => !isTransferencia(m))
      .slice()
      .sort((a, b) => {
        const ts = v => { const d = new Date(v ?? 0); return isNaN(d) ? 0 : d.getTime() }
        return ts(a.date ?? a.fecha) - ts(b.date ?? b.fecha)
      }),
    [movAll]
  )

  const [editing, setEditing] = useState(null) // { id, field }
  const [editVal, setEditVal] = useState('')
  const debounceRef = useRef(null)

  const startEdit = (mov, field) => {
    const raw = getVal(mov, field)
    setEditing({ id: mov.id, field })
    setEditVal(field === 'monto' ? String(Math.abs(raw)) : String(raw))
  }

  const commit = useCallback(async (mov) => {
    if (!editing || editing.id !== mov.id) return
    const { field } = editing
    let value = editVal
    if (field === 'monto')  value = Number(editVal) || 0
    if (field === 'cuotas') value = editVal === '' ? '' : (Number(editVal) || '')
    // Debounce rapid PATCH calls by 300ms
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateMov(mov.id, { [patchKey(mov, field)]: value })
    }, 300)
    setEditing(null)
  }, [editing, editVal, updateMov])

  const commitDirect = useCallback((mov, field, value) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateMov(mov.id, { [patchKey(mov, field)]: value })
    }, 300)
  }, [updateMov])

  const onKeyDown = (e, mov) => {
    if (e.key === 'Enter')  commit(mov)
    if (e.key === 'Escape') setEditing(null)
  }

  // ── cell renderers ────────────────────────────────────────────────────────

  const FechaCell = ({ mov }) => {
    const isEditing = editing?.id === mov.id && editing?.field === 'fecha'
    const raw = getVal(mov, 'fecha')
    if (isEditing) {
      return (
        <td style={TD}>
          <input
            type="text"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit(mov)}
            onKeyDown={e => onKeyDown(e, mov)}
            style={INPUT}
            autoFocus
          />
        </td>
      )
    }
    return (
      <td
        style={{ ...TD, cursor: 'text', whiteSpace: 'nowrap' }}
        onClick={() => startEdit(mov, 'fecha')}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {fmtFecha(raw)}
        </span>
      </td>
    )
  }

  const TextCell = ({ mov, field }) => {
    const isEditing = editing?.id === mov.id && editing?.field === field
    const val = getVal(mov, field)
    if (isEditing) {
      return (
        <td style={TD}>
          <input
            type="text"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit(mov)}
            onKeyDown={e => onKeyDown(e, mov)}
            style={INPUT}
            autoFocus
          />
        </td>
      )
    }
    return (
      <td
        style={{ ...TD, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => startEdit(mov, field)}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: val ? 'var(--text)' : 'var(--subtext)' }}>
          {String(val) || '—'}
        </span>
      </td>
    )
  }

  const NumberCell = ({ mov }) => {
    const isEditing = editing?.id === mov.id && editing?.field === 'monto'
    const raw   = getVal(mov, 'monto')
    const tipo  = getVal(mov, 'tipo')
    const color = tipo === 'income' ? '#22c55e' : '#ef4444'
    if (isEditing) {
      return (
        <td style={{ ...TD, textAlign: 'right' }}>
          <input
            type="number"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commit(mov)}
            onKeyDown={e => onKeyDown(e, mov)}
            style={{ ...INPUT, color, textAlign: 'right' }}
            autoFocus
          />
        </td>
      )
    }
    return (
      <td
        style={{ ...TD, cursor: 'text', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color }}
        onClick={() => startEdit(mov, 'monto')}
      >
        {Math.abs(raw).toLocaleString('es-AR')}
      </td>
    )
  }

  const SelectCell = ({ mov, field, options }) => {
    const val      = getVal(mov, field)
    const isIncome = val === 'income'
    return (
      <td style={TD}>
        <select
          value={val}
          onChange={e => commitDirect(mov, field, e.target.value)}
          style={{
            ...INPUT,
            width: 'auto',
            cursor: 'pointer',
            color: field === 'tipo'
              ? (isIncome ? '#22c55e' : '#ef4444')
              : 'var(--text)',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  const DeleteCell = ({ mov }) => (
    <td style={{ ...TD, textAlign: 'center' }}>
      <button
        onClick={() => deleteMov(mov.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', padding: 4, lineHeight: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
      >
        <Trash2 size={13} />
      </button>
    </td>
  )

  const tipoOptions = [
    { value: 'income',  label: t(lang, 'tipoIngreso') },
    { value: 'expense', label: t(lang, 'tipoGasto')   },
  ]
  const monedaOptions = [
    { value: 'ARS', label: 'ARS' },
    { value: 'USD', label: 'USD' },
  ]

  return (
    <div
      className="panel-strong"
      style={{ overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 820 }}>
        <colgroup>
          <col style={{ width: 110 }} />  {/* fecha */}
          <col style={{ width: 95  }} />  {/* tipo */}
          <col style={{ width: 105 }} />  {/* monto */}
          <col style={{ width: 68  }} />  {/* moneda */}
          <col style={{ width: 120 }} />  {/* método */}
          <col style={{ width: 130 }} />  {/* categoría */}
          <col />                         {/* descripción — toma el resto */}
          <col style={{ width: 68  }} />  {/* cuotas */}
          <col style={{ width: 36  }} />  {/* delete */}
        </colgroup>
        <caption className="sr-only">Historial de movimientos</caption>
        <thead>
          <tr>
            <th scope="col" style={TH}>{t(lang, 'colFecha')}</th>
            <th scope="col" style={TH}>{t(lang, 'colTipo')}</th>
            <th scope="col" style={{ ...TH, textAlign: 'right' }}>{t(lang, 'colMonto')}</th>
            <th scope="col" style={TH}>{t(lang, 'colMoneda')}</th>
            <th scope="col" style={TH}>{t(lang, 'colMetodo')}</th>
            <th scope="col" style={TH}>{t(lang, 'colCategoria')}</th>
            <th scope="col" style={TH}>{t(lang, 'colDesc')}</th>
            <th scope="col" style={TH}>{t(lang, 'colCuotas')}</th>
            <th scope="col" style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((mov, i) => (
            <tr
              key={mov.id}
              style={{
                borderBottom: '1px solid var(--border)',
                background: i % 2 === 0
                  ? 'transparent'
                  : 'color-mix(in oklch, var(--surface) 35%, transparent)',
              }}
            >
              <FechaCell  mov={mov} />
              <SelectCell mov={mov} field="tipo"   options={tipoOptions}   />
              <NumberCell mov={mov} />
              <SelectCell mov={mov} field="moneda" options={monedaOptions} />
              <TextCell   mov={mov} field="method" />
              <TextCell   mov={mov} field="cat"    />
              <TextCell   mov={mov} field="desc"   />
              <TextCell   mov={mov} field="cuotas" />
              <DeleteCell mov={mov} />
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--subtext)' }}>
                {t(lang, 'sinMovimientos')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
