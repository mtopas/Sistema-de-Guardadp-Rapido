import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD } from '../../data/finanzas'
import { buildCategories } from './CategoryDonutCard'

// Sorting: 3-click cycle — asc → desc → default (fecha desc)
function useColumnSort() {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(null) // 'asc' | 'desc' | null

  const handleSort = (col) => {
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      // reset
      setSortCol(null)
      setSortDir(null)
    }
  }

  return { sortCol, sortDir, handleSort }
}

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ArrowUpDown size={11} style={{ opacity: 0.3 }} />
  if (sortDir === 'asc')  return <ArrowUp   size={11} style={{ color: 'var(--accent)' }} />
  if (sortDir === 'desc') return <ArrowDown size={11} style={{ color: 'var(--accent)' }} />
  return <ArrowUpDown size={11} style={{ opacity: 0.3 }} />
}

export default function MovimientosTableModal({ open, onClose, type = 'expense' }) {
  const lang = useStore(s => s.lang)
  const finMovimientos = useStore(s => s.finMovimientos)
  const catColors = useMemo(() => {
    const { cats } = buildCategories(finMovimientos, type)
    return Object.fromEntries(cats.map(c => [c.name, c.color]))
  }, [finMovimientos, type])

  const { sortCol, sortDir, handleSort } = useColumnSort()
  const [filterCat, setFilterCat] = useState('__all__')

  // ESC to close
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Reset filter when closed
  useEffect(() => {
    if (!open) setFilterCat('__all__')
  }, [open])

  const filtered = useMemo(() => {
    return finMovimientos.filter(m => (m.type ?? m.tipo) === type)
  }, [finMovimientos, type])

  const categories = useMemo(() => {
    const set = new Set(filtered.map(m => m.cat ?? m.categoria_nombre ?? ''))
    return [...set].filter(Boolean).sort()
  }, [filtered])

  const rows = useMemo(() => {
    let base = filterCat === '__all__'
      ? [...filtered]
      : filtered.filter(m => (m.cat ?? m.categoria_nombre ?? '') === filterCat)

    if (!sortCol) {
      // default: fecha desc
      base.sort((a, b) => {
        const da = new Date(a.fecha ?? a.date ?? 0)
        const db = new Date(b.fecha ?? b.date ?? 0)
        return db - da
      })
    } else {
      base.sort((a, b) => {
        let va, vb
        if (sortCol === 'fecha') {
          va = new Date(a.fecha ?? a.date ?? 0)
          vb = new Date(b.fecha ?? b.date ?? 0)
        } else if (sortCol === 'monto') {
          va = Math.abs(a.amount ?? a.monto ?? 0)
          vb = Math.abs(b.amount ?? b.monto ?? 0)
        } else if (sortCol === 'desc') {
          va = (a.desc ?? a.descripcion ?? '').toLowerCase()
          vb = (b.desc ?? b.descripcion ?? '').toLowerCase()
        } else if (sortCol === 'cat') {
          va = (a.cat ?? a.categoria_nombre ?? '').toLowerCase()
          vb = (b.cat ?? b.categoria_nombre ?? '').toLowerCase()
        } else if (sortCol === 'method') {
          va = (a.method ?? a.cuenta_nombre ?? '').toLowerCase()
          vb = (b.method ?? b.cuenta_nombre ?? '').toLowerCase()
        } else {
          va = 0; vb = 0
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1  : -1
        return 0
      })
    }

    return base
  }, [filtered, sortCol, sortDir, filterCat])

  if (!open) return null

  const isIncome = type === 'income'
  const title = isIncome ? t(lang, 'allIncomes') : t(lang, 'allExpenses')
  const accentVar = isIncome ? 'var(--income)' : 'var(--expense)'

  const thStyle = {
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--subtext)',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'var(--surface)',
  }

  const tdStyle = {
    padding: '9px 10px',
    fontSize: 12.5,
    color: 'var(--text)',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center px-4"
      style={{
        background: 'color-mix(in oklch, var(--bg) 70%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
    >
      <div
        className="panel-strong w-full max-w-[780px] anim-card-in flex flex-col"
        style={{ maxHeight: '88vh', background: 'var(--surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl grid place-items-center shrink-0"
              style={{
                background: `color-mix(in oklch, ${accentVar} 15%, transparent)`,
                color: accentVar,
              }}
            >
              {isIncome ? <ArrowDown size={14} strokeWidth={2.5} /> : <ArrowUp size={14} strokeWidth={2.5} />}
            </div>
            <div>
              <div className="label">{isIncome ? t(lang, 'incomeMovements') : t(lang, 'expenseMovements')}</div>
              <div className="serif italic text-[17px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {title}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn-fin" aria-label="Cerrar">
            <X size={14} />
          </button>
        </div>

        {/* Filter bar */}
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
        >
          <span className="label shrink-0">{t(lang, 'filterByCategory')}</span>
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-1.5 rounded-xl border outline-none text-[12px]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minWidth: 140,
            }}
          >
            <option value="__all__">{t(lang, 'allCategories')}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--subtext)' }}>
            {rows.length} movimiento{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-y-auto panel-scroll flex-1">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  { col: 'fecha',  label: t(lang, 'colFecha')    },
                  { col: 'desc',   label: t(lang, 'colDesc')     },
                  { col: 'cat',    label: t(lang, 'colCategoria') },
                  { col: 'method', label: t(lang, 'colMetodo')   },
                  { col: 'monto',  label: t(lang, 'colMonto')    },
                ].map(({ col, label }) => (
                  <th
                    key={col}
                    style={{ ...thStyle, textAlign: col === 'monto' ? 'right' : 'left' }}
                    onClick={() => handleSort(col)}
                  >
                    <span className="flex items-center gap-1" style={{ justifyContent: col === 'monto' ? 'flex-end' : 'flex-start' }}>
                      {label}
                      <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const monto  = m.amount ?? m.monto ?? 0
                const desc   = m.desc ?? m.descripcion ?? ''
                const cat    = m.cat ?? m.categoria_nombre ?? '—'
                const method = m.method ?? m.cuenta_nombre ?? '—'
                const icon   = m.icon ?? m.icono ?? (isIncome ? '💰' : '💸')
                const date   = m.date ?? (m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '')

                return (
                  <tr
                    key={m.id}
                    style={{ transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...tdStyle, color: 'var(--subtext)', fontSize: 11.5 }} className="mono">
                      {date}
                    </td>
                    <td style={tdStyle}>
                      <span className="flex items-center gap-2">
                        <span style={{ fontSize: 14 }} aria-hidden>{icon}</span>
                        <span className="truncate" style={{ maxWidth: 180 }}>{desc}</span>
                        {m.audit && (
                          <span
                            className="chip"
                            style={{
                              padding: '1px 5px',
                              fontSize: 9.5,
                              color: 'var(--warning)',
                              background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
                              borderColor: 'color-mix(in oklch, var(--warning) 30%, transparent)',
                            }}
                          >
                            {t(lang, 'auditFlag')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {(() => {
                        const color = catColors[cat]
                        return color
                          ? <span className="chip" style={{ fontSize: 11, color, background: `color-mix(in oklch, ${color} 15%, transparent)`, borderColor: `color-mix(in oklch, ${color} 35%, transparent)` }}>{cat}</span>
                          : <span className="chip" style={{ fontSize: 11 }}>{cat}</span>
                      })()}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--subtext)', fontSize: 11.5 }}>
                      {method}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                      <span
                        className="tnum"
                        style={{ color: isIncome ? 'var(--income)' : 'var(--expense)' }}
                      >
                        {isIncome ? '+' : '−'}{m.currency === 'USD' ? fmtUSD(Math.abs(monto)) : fmtARS(Math.abs(monto))}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--subtext)', padding: '32px' }}>
                    {t(lang, 'noResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  )
}
