import { useCallback, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { BRANCH_COLORS } from '../../utils/themes'
import {
  FIN_CAT_TIPO_OPTS,
  finCatTipoLabel,
  isFinCategoriaReservada,
} from '../../data/finCategorias'
import { isTransferencia } from '../../data/finanzas'
import AgendaContextMenu from '../agenda/AgendaContextMenu'
import EditFinCategoriaModal from './EditFinCategoriaModal'
import DeleteFinCategoriaModal from './DeleteFinCategoriaModal'

function countMovsForCat(movAll, catName) {
  return movAll.filter(m => {
    const n = m.categoria_nombre ?? ''
    return n === catName && !isTransferencia(m)
  }).length
}

export default function DatosRightPanel() {
  const lang                = useStore(s => s.lang)
  const finCategorias       = useStore(s => s.finCategorias)
  const finMovimientosAll   = useStore(s => s.finMovimientosAll)
  const createFinCategoria  = useStore(s => s.createFinCategoria)
  const showToast           = useStore(s => s.showToast)

  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState({ nombre: '', tipo: 'expense', color: BRANCH_COLORS[0] })
  const [contextMenu, setContextMenu] = useState(null)
  const [editCat, setEditCat] = useState(null)
  const [deleteCat, setDeleteCat] = useState(null)

  const sorted = useMemo(() => {
    const order = { expense: 0, income: 1, both: 2 }
    return [...(finCategorias || [])].sort((a, b) => {
      const ta = order[a.tipo] ?? 9
      const tb = order[b.tipo] ?? 9
      if (ta !== tb) return ta - tb
      return (a.name || '').localeCompare(b.name || '', 'es')
    })
  }, [finCategorias])

  const openContextMenu = useCallback((e, cat) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, cat })
  }, [])

  const buildContextItems = useCallback((cat) => {
    const reserved = isFinCategoriaReservada(cat)
    const items = [
      {
        label: t(lang, 'finCatEditMenu'),
        onClick: () => setEditCat(cat),
      },
    ]
    if (!reserved) {
      items.push({ separator: true })
      items.push({
        label: t(lang, 'finCatDeleteMenu'),
        danger: true,
        onClick: () => setDeleteCat(cat),
      })
    }
    return items
  }, [lang])

  const handleCreate = async () => {
    const nombre = newForm.nombre.trim()
    if (!nombre) {
      showToast(t(lang, 'finCatNameRequired'), 'error')
      return
    }
    const ok = await createFinCategoria(nombre, newForm.tipo, newForm.color)
    if (ok) {
      setAdding(false)
      setNewForm({ nombre: '', tipo: 'expense', color: BRANCH_COLORS[0] })
    }
  }

  const deleteMovCount = deleteCat ? countMovsForCat(finMovimientosAll, deleteCat.name) : 0

  return (
    <div
      style={{
        width: 280,
        height: '100%',
        borderLeft: '1px solid var(--border)',
        background: 'var(--panel-bg)',
        overflowY: 'auto',
        padding: '16px 12px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="label">{t(lang, 'finCatPanelTitle')}</div>
        <button
          type="button"
          onClick={() => { setAdding(v => !v); setContextMenu(null) }}
          className="flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-lg transition-colors"
          style={{ color: 'var(--accent)', background: 'color-mix(in oklch, var(--accent) 12%, transparent)', border: 'none' }}
        >
          <Plus size={12} /> {t(lang, 'finCatAdd')}
        </button>
      </div>

      <p className="text-[10.5px] leading-snug" style={{ color: 'var(--subtext)' }}>
        {t(lang, 'finCatPanelHintRightClick')}
      </p>

      {adding && (
        <div
          className="rounded-xl border p-2.5 flex flex-col gap-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <input
            type="text"
            value={newForm.nombre}
            onChange={e => setNewForm(p => ({ ...p, nombre: e.target.value }))}
            placeholder={t(lang, 'finCatNamePlaceholder')}
            className="w-full px-2 py-1.5 rounded-lg border outline-none text-[12px] bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            autoFocus
          />
          <select
            value={newForm.tipo}
            onChange={e => setNewForm(p => ({ ...p, tipo: e.target.value }))}
            className="w-full px-2 py-1.5 rounded-lg border outline-none text-[12px]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          >
            {FIN_CAT_TIPO_OPTS.map(o => (
              <option key={o.id} value={o.id}>
                {lang === 'en' ? o.labelEn : o.labelEs}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {BRANCH_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setNewForm(p => ({ ...p, color: c }))}
                className="w-5 h-5 rounded-md"
                style={{
                  background: c,
                  outline: newForm.color === c ? '2px solid var(--text)' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
            >
              {t(lang, 'create')}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-2 py-1.5 rounded-lg text-[11px] border"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {sorted.length === 0 && (
          <p className="text-[12px]" style={{ color: 'var(--subtext)' }}>{t(lang, 'finCatEmpty')}</p>
        )}
        {sorted.map(cat => {
          const reserved = isFinCategoriaReservada(cat)
          const movCount = countMovsForCat(finMovimientosAll, cat.name)
          const dot = cat.color || 'var(--accent)'

          return (
            <div
              key={cat.id}
              role="button"
              tabIndex={0}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-default"
              style={{ background: 'transparent' }}
              onContextMenu={e => openContextMenu(e, cat)}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} />
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
                  {cat.name}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--subtext)' }}>
                  {finCatTipoLabel(cat.tipo, lang)}
                  {movCount > 0 ? ` · ${movCount} mov.` : ''}
                  {reserved ? ` · ${t(lang, 'finCatSystem')}` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <AgendaContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.cat)}
          onClose={() => setContextMenu(null)}
        />
      )}

      <EditFinCategoriaModal cat={editCat} onClose={() => setEditCat(null)} />

      <DeleteFinCategoriaModal
        cat={deleteCat}
        movCount={deleteMovCount}
        onClose={() => setDeleteCat(null)}
      />
    </div>
  )
}
