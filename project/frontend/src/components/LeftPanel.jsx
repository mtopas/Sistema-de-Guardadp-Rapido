import { useState } from 'react'
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'
import { t } from '../utils/i18n'
import { getLeafIcon } from '../utils/leafIcons'
import ScrollArea from './ScrollArea'

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

// ── Note card ─────────────────────────────────────────────────────────────────
function NoteCard({ hoja, dotColor, onClick }) {
  const tags     = extractTags(hoja.contenido, hoja.apuntes)
  const title    = hoja.contenido.replace(/https?:\/\/\S+/g, '').trim().slice(0, 80) || hoja.contenido.slice(0, 80)
  const color    = dotColor || 'var(--accent)'
  const LeafIcon = getLeafIcon(hoja.icono, hoja.tipo)

  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-xl px-2.5 py-1.5 flex flex-col gap-1 transition-all duration-150"
      style={{
        background: 'transparent',
      }}
      onMouseEnter={e => e.currentTarget.style.background = color + '12'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Compact row — icon + title */}
      <div className="flex items-center gap-2.5 min-w-0 w-full">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '22' }}
        >
          <LeafIcon size={14} style={{ color }} />
        </div>
        <p className="text-[13px] font-medium leading-snug truncate flex-1" style={{ color: 'var(--text)' }}>
          {title || '—'}
        </p>
      </div>

      {/* Tags — hidden, reveal on hover */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap overflow-hidden pl-[38px]
                        max-h-0 opacity-0
                        group-hover:max-h-24 group-hover:opacity-100
                        transition-all duration-200 ease-out">
          {tags.slice(0, 6).map(tag => (
            <span key={tag}
              className="text-[10.5px] px-1.5 py-0.5 rounded-full"
              style={{ background: color + '18', color }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// ── Category tree item (flat, ClaudeDesign style) ─────────────────────────────
function CategoryItem({ cat, allCats, hojas, color, depth = 0, onNoteClick }) {
  const [open, setOpen] = useState(false)
  const catHojas    = hojas.filter(h => h.categoria_id === cat.id)
  const subcats     = allCats.filter(c => c.padre_id === cat.id)
  const hasChildren = subcats.length > 0
  const count       = catHojas.length

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="group w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg transition-colors duration-150"
        style={{
          paddingLeft: 6 + depth * 12,
          background: open ? `color-mix(in oklch, ${color} 10%, transparent)` : 'transparent',
          borderLeft: open ? `2px solid ${color}` : '2px solid transparent',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 60%, transparent)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        {/* Chevron de expandir/cerrar */}
        <span className="w-4 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--subtext)' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Dot del color de la rama */}
        <span className="flex items-center justify-center flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, opacity: 0.9 }} />
        </span>

        {/* Nombre (con emoji si existe) */}
        <span
          className="flex-1 text-[14px] text-left truncate"
          style={{ color: open ? 'var(--text)' : 'var(--text-2)' }}
        >
          {cat.icono ? `${cat.icono} ` : ''}{cat.nombre}
        </span>

        {/* Contador */}
        {count > 0 && (
          <span
            className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{
              background: 'color-mix(in oklch, var(--surface) 70%, transparent)',
              color: 'var(--subtext)',
              minWidth: 18,
              textAlign: 'center',
            }}
          >
            {count}
          </span>
        )}
      </button>

      {/* Contenido (subcategorías + hojas) */}
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {hasChildren && subcats.map(sub => (
            <CategoryItem
              key={sub.id}
              cat={sub}
              allCats={allCats}
              hojas={hojas}
              color={color}
              depth={depth + 1}
              onNoteClick={onNoteClick}
            />
          ))}
          {catHojas.length > 0 && (
            <div className="space-y-0.5" style={{ paddingLeft: 6 + (depth + 1) * 12 }}>
              {catHojas.map(h => (
                <NoteCard key={h.id} hoja={h} dotColor={color} onClick={() => onNoteClick(h.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compat: el LeftPanel principal aún usa el nombre <CategoryDropdown>; aliaseamos.
function CategoryDropdown({ cat, allCats, hojas, color, onNoteClick }) {
  return (
    <CategoryItem
      cat={cat}
      allCats={allCats}
      hojas={hojas}
      color={color}
      depth={0}
      onNoteClick={onNoteClick}
    />
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LeftPanel({ onOpenHoja, searchQuery = '' }) {
  const hojas      = useStore(s => s.hojas)
  const categorias = useStore(s => s.categorias)
  const lang       = useStore(s => s.lang)

  const [expanded, setExpanded] = useState(false)

  // Color map
  const rootCats = categorias.filter(c => !c.padre_id)
  const colorMap = {}
  rootCats.forEach((c, i) => { colorMap[c.id] = BRANCH_COLORS[i % BRANCH_COLORS.length] })
  categorias.filter(c => c.padre_id).forEach(c => {
    colorMap[c.id] = colorMap[c.padre_id] || 'var(--accent)'
  })

  // Filter hojas by searchQuery
  const filteredHojas = searchQuery
    ? hojas.filter(h =>
        h.contenido.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.categoria_nombre?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : hojas

  const panelWidth = expanded ? '50vw' : '300px'

  return (
    <div
      className="absolute left-0 top-0 h-full z-20 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width: panelWidth,
        background: 'transparent',
        // Borde derecho como fade vertical (suave), no una línea dura
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 1px), black 100%)',
        boxShadow: 'inset -1px 0 0 0 color-mix(in oklch, var(--border) 60%, transparent)',
      }}
    >
      {/* Header — label estilo ClaudeDesign + botón expand donde iría "+ Nueva" */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold" style={{ color: 'var(--subtext)' }}>
          Árbol
        </span>
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

      {/* Dropdown list */}
      <ScrollArea className="flex-1" contentClassName="px-2 pb-3 space-y-0.5">
        {rootCats.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'noHojas')}
          </p>
        )}
        {rootCats.map(cat => (
          <CategoryDropdown
            key={cat.id}
            cat={cat}
            allCats={categorias}
            hojas={filteredHojas}
            color={colorMap[cat.id]}
            onNoteClick={(id) => onOpenHoja?.(id)}
          />
        ))}
      </ScrollArea>
    </div>
  )
}
