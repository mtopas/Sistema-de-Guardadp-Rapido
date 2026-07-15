import { useState, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2, Plus, FolderPlus, ChevronsUpDown } from 'lucide-react'
import { useStore } from '../store/useStore'
import { extractTags } from '../utils/tags'
import { buildCategoriaColorMap } from '../utils/categoriaColors'
import { t } from '../utils/i18n'
import { getLeafIcon } from '../utils/leafIcons'
import ScrollArea from './ScrollArea'
import AgendaContextMenu from './agenda/AgendaContextMenu'
import EditCategoriaModal from './EditCategoriaModal'
import EditHojaModal from './EditHojaModal'
import DeleteHojaModal from './DeleteHojaModal'
import DeleteCategoriaModal from './DeleteCategoriaModal'
import { getHojaDisplayTitle } from '../utils/hojaUtils'

const LS_TREE_KEY = 'sgr-boveda-tree-open'

function loadOpenState() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_TREE_KEY) || '[]')) }
  catch { return new Set() }
}
function saveOpenState(set_) {
  localStorage.setItem(LS_TREE_KEY, JSON.stringify([...set_]))
}

function relativeDate(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'ahora'
  if (hours <  1) return `${mins}m`
  if (days  <  1) return `${hours}h`
  if (days  < 30) return `${days}d`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// Highlight matching text in a string
function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'color-mix(in oklch, var(--accent) 30%, transparent)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── Note card ─────────────────────────────────────────────────────────────────
function NoteCard({ hoja, dotColor, onClick, onContextMenu, query }) {
  const tags     = extractTags(hoja.contenido, hoja.apuntes)
  const title    = getHojaDisplayTitle(hoja).slice(0, 80)
  const color    = dotColor || 'var(--accent)'
  const LeafIcon = getLeafIcon(hoja.icono, hoja.tipo)

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={e => onContextMenu?.(e, hoja)}
      className="group w-full text-left rounded-xl px-2.5 py-1.5 flex flex-col gap-1 transition-all duration-150"
      style={{ background: 'transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = color + '12'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div className="flex items-center gap-2.5 min-w-0 w-full">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '22' }}
        >
          <LeafIcon size={14} style={{ color }} />
        </div>
        <p className="text-[13px] font-medium leading-snug truncate flex-1" style={{ color: 'var(--text)' }}>
          <Highlight text={title || '—'} query={query} />
        </p>
      </div>
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap overflow-hidden pl-[38px]
                        max-h-0 opacity-0
                        group-hover:max-h-24 group-hover:opacity-100
                        transition-all duration-200 ease-out">
          {tags.slice(0, 6).map(tag => (
            <span key={tag} className="text-[10.5px] px-1.5 py-0.5 rounded-full"
              style={{ background: color + '18', color }}>
              #{tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// ── Category tree item ────────────────────────────────────────────────────────
function CategoryItem({
  cat, allCats, hojas, color, colorMap, depth = 0, onNoteClick,
  openState, toggleOpen, query, onAddHoja,
  onContextMenu, onHojaContextMenu, subcatFormForId, onSubcatFormClose,
}) {
  const crearCategoria = useStore(s => s.crearCategoria)

  const catHojas    = hojas.filter(h => h.categoria_id === cat.id)
  const subcats     = allCats.filter(c => c.padre_id === cat.id)
  const hasChildren = subcats.length > 0
  const count       = catHojas.length
  const open        = openState.has(cat.id)

  const [addingSubcatLocal, setAddingSubcatLocal] = useState(false)
  const [subcatName, setSubcatName]               = useState('')
  const showSubcatForm = addingSubcatLocal || subcatFormForId === cat.id

  const closeSubcatForm = () => {
    setAddingSubcatLocal(false)
    setSubcatName('')
    onSubcatFormClose?.()
  }

  const handleAddSubcat = async () => {
    const nombre = subcatName.trim()
    if (!nombre) return
    await crearCategoria(nombre, cat.id)
    closeSubcatForm()
    if (!open) toggleOpen(cat.id)
  }

  return (
    <div>
      <div
        className="group flex items-center gap-0 rounded-lg transition-colors duration-150"
        style={{
          paddingLeft: 6 + depth * 12,
          background: open ? `color-mix(in oklch, ${color} 10%, transparent)` : 'transparent',
          borderLeft: open ? `2px solid ${color}` : '2px solid transparent',
        }}
        onContextMenu={e => onContextMenu?.(e, cat)}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 60%, transparent)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        {/* Toggle button */}
        <button
          className="flex items-center gap-2 py-1.5 pr-1 flex-1 min-w-0 text-left"
          onClick={() => toggleOpen(cat.id)}
        >
          <span className="w-4 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--subtext)' }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="flex items-center justify-center flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, opacity: 0.9 }} />
          </span>
          <span className="flex-1 text-[14px] text-left truncate"
            style={{ color: open ? 'var(--text)' : 'var(--text-2)' }}>
            <Highlight text={`${cat.icono ? cat.icono + ' ' : ''}${cat.nombre}`} query={query} />
          </span>
          {count > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ background: 'color-mix(in oklch, var(--surface) 70%, transparent)', color: 'var(--subtext)', minWidth: 18, textAlign: 'center' }}>
              {count}
            </span>
          )}
        </button>

        {/* Action buttons — shown on hover */}
        <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            title="Nueva hoja aquí"
            onClick={() => onAddHoja(cat.id)}
            className="w-5 h-5 rounded grid place-items-center transition-colors"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.background = 'transparent' }}
          >
            <Plus size={11} />
          </button>
          <button
            title="Nueva subcategoría"
            onClick={() => { setAddingSubcatLocal(true); if (!open) toggleOpen(cat.id) }}
            className="w-5 h-5 rounded grid place-items-center transition-colors"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.background = 'transparent' }}
          >
            <FolderPlus size={11} />
          </button>
        </div>
      </div>

      {/* Subcategory creation form */}
      {showSubcatForm && (
        <div className="flex gap-1 mt-0.5" style={{ paddingLeft: 6 + (depth + 1) * 12 }}>
          <input
            autoFocus
            type="text"
            value={subcatName}
            onChange={e => setSubcatName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddSubcat()
              if (e.key === 'Escape') closeSubcatForm()
            }}
            placeholder="Nombre de subcategoría…"
            className="flex-1 text-[12px] px-2 py-1 rounded-lg border outline-none bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <button onClick={handleAddSubcat} className="px-2 py-1 rounded-lg text-[11px] font-medium"
            style={{ background: 'var(--accent)', color: 'white' }}>
            +
          </button>
        </div>
      )}

      {/* Children */}
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {hasChildren && subcats.map(sub => (
            <CategoryItem
              key={sub.id}
              cat={sub} allCats={allCats} hojas={hojas}
              color={colorMap[sub.id] || color}
              colorMap={colorMap}
              depth={depth + 1} onNoteClick={onNoteClick}
              openState={openState} toggleOpen={toggleOpen}
              query={query} onAddHoja={onAddHoja}
              onContextMenu={onContextMenu}
              onHojaContextMenu={onHojaContextMenu}
              subcatFormForId={subcatFormForId}
              onSubcatFormClose={onSubcatFormClose}
            />
          ))}
          {catHojas.length > 0 && (
            <div className="space-y-0.5" style={{ paddingLeft: 6 + (depth + 1) * 12 }}>
              {catHojas.map(h => (
                <NoteCard key={h.id} hoja={h} dotColor={color}
                  onClick={() => onNoteClick(h.id)}
                  onContextMenu={onHojaContextMenu}
                  query={query} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LeftPanel({ onOpenHoja, onHojaDeleted, searchQuery = '' }) {
  const hojas           = useStore(s => s.hojas)
  const categorias      = useStore(s => s.categorias)
  const lang            = useStore(s => s.lang)
  const openCaptureWith = useStore(s => s.openCaptureWith)

  const [expanded, setExpanded] = useState(false)
  const [openState, setOpenState] = useState(() => loadOpenState())
  const [contextMenu, setContextMenu] = useState(null)
  const [hojaMenu, setHojaMenu] = useState(null)
  const [editCat, setEditCat] = useState(null)
  const [editHoja, setEditHoja] = useState(null)
  const [deleteHoja, setDeleteHoja] = useState(null)
  const [deleteCat, setDeleteCat] = useState(null)
  const [subcatFormFor, setSubcatFormFor] = useState(null)

  const toggleOpen = useCallback((catId) => {
    setOpenState(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId); else next.add(catId)
      saveOpenState(next)
      return next
    })
  }, [])

  const rootCats = useMemo(() => categorias.filter(c => !c.padre_id), [categorias])

  const colorMap = useMemo(() => buildCategoriaColorMap(categorias), [categorias])

  const openContextMenu = useCallback((e, cat) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, cat })
  }, [])

  const buildContextItems = useCallback((cat) => [
    {
      label: 'Crear Hoja',
      onClick: () => openCaptureWith(cat.id),
    },
    {
      label: 'Crear Subcategoría',
      onClick: () => {
        setSubcatFormFor(cat.id)
        setOpenState(prev => {
          if (prev.has(cat.id)) return prev
          const next = new Set(prev)
          next.add(cat.id)
          saveOpenState(next)
          return next
        })
      },
    },
    {
      label: 'Editar Categoría',
      onClick: () => setEditCat(cat),
    },
    {
      label: t(lang, 'bovedaDeleteCatMenu'),
      danger: true,
      onClick: () => setDeleteCat(cat),
    },
  ], [openCaptureWith, lang])

  const openHojaContextMenu = useCallback((e, hoja) => {
    e.preventDefault()
    e.stopPropagation()
    setHojaMenu({ x: e.clientX, y: e.clientY, hoja })
  }, [])

  const buildHojaContextItems = useCallback((hoja) => [
    { label: 'Editar Hoja', onClick: () => setEditHoja(hoja) },
    {
      label: 'Eliminar Hoja',
      danger: true,
      onClick: () => setDeleteHoja(hoja),
    },
  ], [])

  const filteredHojas = useMemo(() =>
    searchQuery
      ? hojas.filter(h =>
          h.contenido.toLowerCase().includes(searchQuery.toLowerCase()) ||
          h.categoria_nombre?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : hojas,
    [hojas, searchQuery]
  )

  const allIds = useMemo(() => new Set(categorias.map(c => c.id)), [categorias])
  const allOpen = allIds.size > 0 && [...allIds].every(id => openState.has(id))

  const handleExpandAll = () => {
    if (allOpen) {
      setOpenState(new Set())
      saveOpenState(new Set())
    } else {
      setOpenState(new Set(allIds))
      saveOpenState(new Set(allIds))
    }
  }

  const handleAddHoja = (categoriaId) => {
    openCaptureWith(categoriaId)
  }

  const panelWidth = expanded ? '50vw' : '300px'

  return (
    <div
      className="absolute left-0 top-0 h-full z-20 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width: panelWidth,
        background: 'transparent',
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 1px), black 100%)',
        boxShadow: 'inset -1px 0 0 0 color-mix(in oklch, var(--border) 60%, transparent)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold" style={{ color: 'var(--subtext)' }}>
          Árbol
        </span>
        <div className="flex items-center gap-1">
          {/* Expandir/colapsar todo */}
          <button
            onClick={handleExpandAll}
            aria-label={allOpen ? 'Colapsar todo' : 'Expandir todo'}
            title={allOpen ? 'Colapsar todo' : 'Expandir todo'}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors flex-shrink-0"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 70%, transparent)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.background = 'transparent' }}
          >
            <ChevronsUpDown size={12} />
          </button>
          {/* Agrandar/reducir panel */}
          <button
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Reducir panel' : 'Agrandar panel'}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors flex-shrink-0"
            style={{ color: 'var(--subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 70%, transparent)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.background = 'transparent' }}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1" contentClassName="px-2 pb-3 space-y-0.5">
        {rootCats.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'noHojas')}
          </p>
        )}
        {rootCats.map(cat => (
          <CategoryItem
            key={cat.id}
            cat={cat}
            allCats={categorias}
            hojas={filteredHojas}
            color={colorMap[cat.id]}
            colorMap={colorMap}
            onNoteClick={(id) => onOpenHoja?.(id)}
            openState={openState}
            toggleOpen={toggleOpen}
            query={searchQuery}
            onAddHoja={handleAddHoja}
            onContextMenu={openContextMenu}
            onHojaContextMenu={openHojaContextMenu}
            subcatFormForId={subcatFormFor}
            onSubcatFormClose={() => setSubcatFormFor(null)}
          />
        ))}
      </ScrollArea>

      {hojaMenu && (
        <AgendaContextMenu
          x={hojaMenu.x}
          y={hojaMenu.y}
          items={buildHojaContextItems(hojaMenu.hoja)}
          onClose={() => setHojaMenu(null)}
        />
      )}

      {contextMenu && (
        <AgendaContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.cat)}
          onClose={() => setContextMenu(null)}
        />
      )}

      <EditCategoriaModal
        cat={editCat}
        color={editCat ? colorMap[editCat.id] : null}
        onClose={() => setEditCat(null)}
      />

      <EditHojaModal
        hoja={editHoja}
        onClose={() => setEditHoja(null)}
      />

      <DeleteHojaModal
        hoja={deleteHoja}
        onClose={() => setDeleteHoja(null)}
        onDeleted={(id) => onHojaDeleted?.(id)}
      />

      <DeleteCategoriaModal
        cat={deleteCat}
        hojaCount={deleteCat ? hojas.filter(h => h.categoria_id === deleteCat.id).length : 0}
        subcatCount={deleteCat ? categorias.filter(c => c.padre_id === deleteCat.id).length : 0}
        onClose={() => setDeleteCat(null)}
      />
    </div>
  )
}
