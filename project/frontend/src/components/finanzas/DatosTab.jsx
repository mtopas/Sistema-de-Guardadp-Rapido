import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Trash2, X, Copy } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, isTransferencia, filtrarMovimientos } from '../../data/finanzas'
import { buildFinCategoriaColorByName, getFinCategoriaColor } from '../../data/finCategoriaColors'
import { API_URL } from '../../config'

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
  zIndex: 2,
}

// Porcentajes → ocupan todo el ancho del panel (antes: px fijos ~820px pegados a la izquierda)
const COL_WIDTHS = ['10%', '9%', '11%', '6%', '12%', '12%', '32%', '6%', '2%']

function ColGroup() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  )
}

const TABLE_STYLE = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
}

export default function DatosTab() {
  const lang      = useStore(s => s.lang)
  const movAll           = useStore(s => s.finMovimientosAll)
  const finCategorias    = useStore(s => s.finCategorias)
  const finCuentas       = useStore(s => s.finCuentas)
  const updateMov        = useStore(s => s.updateFinMovimiento)
  const deleteMov        = useStore(s => s.deleteFinMovimiento)
  const setFinSyncPaused = useStore(s => s.setFinSyncPaused)

  const catColorByName = useMemo(
    () => buildFinCategoriaColorByName(finCategorias),
    [finCategorias],
  )

  const [filtros, setFiltros] = useState({ categoria: '', cuenta: '', tipo: '', desde: '', hasta: '' })
  const setFiltro = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))
  const limpiarFiltros = () => setFiltros({ categoria: '', cuenta: '', tipo: '', desde: '', hasta: '' })
  const hayFiltrosActivos = Object.values(filtros).some(Boolean)

  // ── Duplicados (GET /fin/movimientos/duplicados) ───────────────────────────
  const [duplicados, setDuplicados] = useState(null) // null = nunca buscado; [] = buscado, sin resultados
  const [buscandoDuplicados, setBuscandoDuplicados] = useState(false)

  const buscarDuplicados = useCallback(async () => {
    setBuscandoDuplicados(true)
    try {
      const res = await fetch(`${API_URL}/fin/movimientos/duplicados`)
      if (!res.ok) throw new Error('not ok')
      const data = await res.json()
      setDuplicados(Array.isArray(data) ? data : [])
    } catch {
      setDuplicados([])
    } finally {
      setBuscandoDuplicados(false)
    }
  }, [])

  const cerrarDuplicados = () => setDuplicados(null)

  const rows = useMemo(() =>
    filtrarMovimientos(movAll, filtros)
      .slice()
      .sort((a, b) => {
        const ts = v => { const d = new Date(v ?? 0); return isNaN(d) ? 0 : d.getTime() }
        return ts(b.date ?? b.fecha) - ts(a.date ?? a.fecha)
      }),
    [movAll, filtros]
  )

  const [editing, setEditing] = useState(null) // { id, field }
  const [editVal, setEditVal] = useState('')
  const debounceRef = useRef(null)

  useEffect(() => {
    setFinSyncPaused(!!editing)
    return () => setFinSyncPaused(false)
  }, [editing, setFinSyncPaused])

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
    const catColor = field === 'cat' && val
      ? getFinCategoriaColor(catColorByName, String(val), 0)
      : null
    return (
      <td
        style={{ ...TD, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => startEdit(mov, field)}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
          {catColor && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catColor }} aria-hidden />
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: val ? 'var(--text)' : 'var(--subtext)' }} className="truncate">
            {String(val) || '—'}
          </span>
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
        {fmtARS(Math.abs(raw))}
      </td>
    )
  }

  const SelectCell = ({ mov, field, options, tabIdx = 0 }) => {
    const val      = getVal(mov, field)
    const isIncome = val === 'income'
    return (
      <td style={TD}>
        <select
          value={val}
          tabIndex={tabIdx}
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

  const DeleteCell = ({ mov, tabIdx = 0 }) => (
    <td style={{ ...TD, textAlign: 'center' }}>
      <button
        tabIndex={tabIdx}
        onClick={() => deleteMov(mov.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', padding: 4, lineHeight: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
        aria-label="Eliminar movimiento"
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

  const parentRef = useRef(null)
  const VIRTUAL_THRESHOLD = 150
  const useVirtual = rows.length > VIRTUAL_THRESHOLD

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 15,
  })
  const virtualItems = useVirtual ? virtualizer.getVirtualItems() : []

  useLayoutEffect(() => {
    if (useVirtual && rows.length > 0) virtualizer.measure()
  }, [rows.length, useVirtual, virtualizer])

  const totalSize     = useVirtual ? virtualizer.getTotalSize() : 0
  const paddingTop    = useVirtual && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0
  const paddingBottom = useVirtual && virtualItems.length > 0
    ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? totalSize)
    : 0
  // Si el viewport colapsa (solo maxHeight), el virtualizer devuelve 0 ítems → tabla vacía
  const renderPlain = !useVirtual || virtualItems.length === 0

  const selectStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 12,
    padding: '5px 8px',
    minWidth: 0,
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex flex-wrap items-end gap-2.5 px-3 py-2.5 rounded-xl border"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{t(lang, 'datosFiltroCategoria')}</label>
          <select style={selectStyle} value={filtros.categoria} onChange={e => setFiltro('categoria', e.target.value)}>
            <option value="">{t(lang, 'datosFiltroTodas')}</option>
            {finCategorias.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{t(lang, 'datosFiltroCuenta')}</label>
          <select style={selectStyle} value={filtros.cuenta} onChange={e => setFiltro('cuenta', e.target.value)}>
            <option value="">{t(lang, 'datosFiltroTodas')}</option>
            {finCuentas.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{t(lang, 'datosFiltroTipo')}</label>
          <select style={selectStyle} value={filtros.tipo} onChange={e => setFiltro('tipo', e.target.value)}>
            <option value="">{t(lang, 'datosFiltroTodos')}</option>
            <option value="income">{t(lang, 'tipoIngreso')}</option>
            <option value="expense">{t(lang, 'tipoGasto')}</option>
            <option value="transferencia">{t(lang, 'tipoTransferencia')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{t(lang, 'datosFiltroDesde')}</label>
          <input type="date" style={selectStyle} value={filtros.desde} onChange={e => setFiltro('desde', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{t(lang, 'datosFiltroHasta')}</label>
          <input type="date" style={selectStyle} value={filtros.hasta} onChange={e => setFiltro('hasta', e.target.value)} />
        </div>
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="flex items-center gap-1 text-[11px] px-2.5 py-[7px] rounded-lg border"
            style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
          >
            <X size={11} /> {t(lang, 'datosFiltroLimpiar')}
          </button>
        )}
        <button
          type="button"
          onClick={buscarDuplicados}
          disabled={buscandoDuplicados}
          className="flex items-center gap-1 text-[11px] px-2.5 py-[7px] rounded-lg border"
          style={{ borderColor: 'var(--border)', color: 'var(--subtext)', opacity: buscandoDuplicados ? 0.6 : 1 }}
        >
          <Copy size={11} /> {buscandoDuplicados ? t(lang, 'datosDuplicadosBtnCargando') : t(lang, 'datosDuplicadosBtn')}
        </button>
        <div className="text-[11px] ml-auto" style={{ color: 'var(--subtext)' }}>
          {rows.length} {t(lang, 'datosFiltroResultados')}
        </div>
      </div>

      {duplicados !== null && (
        <div
          className="flex flex-col gap-2 px-3 py-2.5 rounded-xl border"
          style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>
                {t(lang, 'datosDuplicadosTitulo')} {duplicados.length > 0 ? `(${duplicados.length})` : ''}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--subtext)' }}>
                {t(lang, 'datosDuplicadosDesc')}
              </span>
            </div>
            <button
              type="button"
              onClick={cerrarDuplicados}
              className="flex items-center gap-1 text-[11px] px-2.5 py-[7px] rounded-lg border"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
            >
              <X size={11} /> {t(lang, 'datosDuplicadosCerrar')}
            </button>
          </div>

          {duplicados.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'datosDuplicadosNinguno')}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {duplicados.map(mov => {
                const tipo  = getVal(mov, 'tipo')
                const color = tipo === 'income' ? '#22c55e' : '#ef4444'
                return (
                  <div
                    key={mov.id}
                    className="flex items-center gap-3 text-[11px] px-2 py-1.5 rounded-lg"
                    style={{ background: 'color-mix(in oklch, var(--subtext) 8%, transparent)' }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{fmtFecha(getVal(mov, 'fecha'))}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color, whiteSpace: 'nowrap' }}>{fmtARS(Math.abs(getVal(mov, 'monto')))}</span>
                    <span className="truncate" style={{ color: 'var(--subtext)' }}>{getVal(mov, 'cat') || '—'}</span>
                    <span className="truncate flex-1">{getVal(mov, 'desc') || '—'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        deleteMov(mov.id)
                        setDuplicados(d => (d || []).filter(m => m.id !== mov.id))
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--subtext)', padding: 4, lineHeight: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
                      aria-label="Eliminar movimiento duplicado"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="panel-strong" style={{ width: '100%', overflow: 'hidden' }}>
      <div
        ref={parentRef}
        style={{
          width: '100%',
          overflow: 'auto',
          height: 'calc(100vh - 280px)',
          minHeight: 200,
        }}
        className="panel-scroll"
      >
        <table style={TABLE_STYLE}>
          <ColGroup />
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--subtext)' }}>
                  {t(lang, 'sinMovimientos')}
                </td>
              </tr>
            )}
            {!renderPlain && paddingTop > 0 && (
              <tr><td colSpan={9} style={{ height: paddingTop, padding: 0 }} /></tr>
            )}
            {(renderPlain ? rows.map((mov, index) => ({ mov, index, size: 34 })) : virtualItems.map(vr => ({
              mov: rows[vr.index],
              index: vr.index,
              size: vr.size,
            }))).map(({ mov, index, size }) => {
              const xfer = isTransferencia(mov)
              const isEditingRow = editing?.id === mov.id
              return (
                <tr
                  key={mov.id}
                  data-index={index}
                  style={{
                    height: size,
                    borderBottom: '1px solid var(--border)',
                    background: xfer
                      ? 'color-mix(in oklch, var(--subtext) 8%, transparent)'
                      : index % 2 === 0
                        ? 'transparent'
                        : 'color-mix(in oklch, var(--surface) 35%, transparent)',
                    opacity: xfer ? 0.85 : 1,
                  }}
                >
                  <FechaCell  mov={mov} />
                  <SelectCell mov={mov} field="tipo"   options={tipoOptions}   tabIdx={isEditingRow ? 0 : -1} />
                  <NumberCell mov={mov} />
                  <SelectCell mov={mov} field="moneda" options={monedaOptions} tabIdx={isEditingRow ? 0 : -1} />
                  <TextCell   mov={mov} field="method" />
                  <TextCell   mov={mov} field="cat"    />
                  <TextCell   mov={mov} field="desc"   />
                  <TextCell   mov={mov} field="cuotas" />
                  <DeleteCell mov={mov} tabIdx={isEditingRow ? 0 : -1} />
                </tr>
              )
            })}
            {!renderPlain && paddingBottom > 0 && (
              <tr><td colSpan={9} style={{ height: paddingBottom, padding: 0 }} /></tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
