import { useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD } from '../../data/finanzas'
import { buildCategories } from './CategoryDonutCard'
import CardHeader from './CardHeader'
import MovimientosTableModal from './MovimientosTableModal'

export default function MovimientosListCard({ type = 'expense', filterCat = null }) {
  const lang = useStore(s => s.lang)
  const finMovimientos = useStore(s => s.finMovimientos)
  const finCategorias  = useStore(s => s.finCategorias)
  const [modalOpen, setModalOpen] = useState(false)

  const catColors = useMemo(() => {
    const { cats } = buildCategories(finMovimientos, type, finCategorias)
    return Object.fromEntries(cats.map(c => [c.name, c.color]))
  }, [finMovimientos, type, finCategorias])

  const items = useMemo(() => {
    let base = finMovimientos.filter(m => (m.type ?? m.tipo) === type)
    if (filterCat) base = base.filter(m => (m.cat ?? m.categoria_nombre ?? '') === filterCat)
    return base.slice(0, filterCat ? 8 : 4)
  }, [finMovimientos, type, filterCat])

  const title = type === 'income' ? t(lang, 'incomeMovements') : t(lang, 'expenseMovements')

  return (
    <>
      <div className="panel-strong p-5 h-full">
        <CardHeader
          title={title}
          subtitle={t(lang, 'recent')}
          action={
            <button className="btn-ghost" type="button" onClick={() => setModalOpen(true)}>
              {t(lang, 'viewAll')}
            </button>
          }
        />

        <div className="flex flex-col">
          {items.length === 0 && (
            <div className="text-[12px] py-4 text-center" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'noResults')}
            </div>
          )}
          {items.map((m, i) => {
            const monto  = m.amount ?? m.monto ?? 0
            const desc   = m.desc ?? m.descripcion ?? ''
            const cat    = m.cat ?? m.categoria_nombre ?? ''
            const method = m.method ?? m.cuenta_nombre ?? ''
            const date   = m.date ?? (m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '')
            const icon   = m.icon ?? m.icono ?? (type === 'income' ? '💰' : '💸')
            const isIncome = type === 'income'
            const catColor = catColors[cat] ?? null

            return (
              <div
                key={m.id}
                className="flex items-center gap-3 py-2.5"
                style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: catColor ?? 'var(--border)' }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
                    {icon} {desc}
                  </div>
                  <div className="text-[10.5px] flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--subtext)' }}>
                    <span>{cat}</span>
                    {method && (
                      <>
                        <span className="opacity-50">·</span>
                        <span className="chip" style={{ padding: '1px 6px', fontSize: 10 }}>{method}</span>
                      </>
                    )}
                    {m.audit && (
                      <span
                        className="chip"
                        style={{
                          padding: '1px 6px', fontSize: 10,
                          color: 'var(--warning)',
                          background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
                          borderColor: 'color-mix(in oklch, var(--warning) 30%, transparent)',
                        }}
                      >
                        {t(lang, 'auditFlag')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-[13px] font-semibold tnum"
                    style={{ color: isIncome ? 'var(--income)' : 'var(--expense)' }}
                  >
                    {isIncome ? '+' : '−'}{m.currency === 'USD' ? fmtUSD(Math.abs(monto)) : fmtARS(Math.abs(monto))}
                  </div>
                  <div className="text-[10px] mono mt-0.5" style={{ color: 'var(--subtext)' }}>
                    {date}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <MovimientosTableModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        type={type}
      />
    </>
  )
}
