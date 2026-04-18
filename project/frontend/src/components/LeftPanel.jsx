import { useState } from 'react'
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'
import { t } from '../utils/i18n'
import { getLeafIcon } from '../utils/leafIcons'

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
      className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3.5 transition-all duration-150 active:scale-[0.99]"
      style={{
        background: 'var(--surface)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 1px ${color}60`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05)'}
    >
      {/* Icon box */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '22' }}
      >
        <LeafIcon size={18} style={{ color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-2 mb-1.5" style={{ color: 'var(--text)' }}>
          {title || '—'}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Primary tag — category type */}
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
            style={{ background: color + '22', color }}
          >
            ● {hoja.tipo ?? 'nota'}
          </span>
          {/* Hashtags */}
          {tags.slice(0, 4).map(tag => (
            <span key={tag}
              className="text-[11px] px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtext)' }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Right — date */}
      <div className="flex-shrink-0 text-[12px] pl-1" style={{ color: 'var(--subtext)' }}>
        {relativeDate(hoja.fecha)}
      </div>
    </button>
  )
}

// ── Dropdown category ─────────────────────────────────────────────────────────
function CategoryDropdown({ cat, subcats, hojas, color, onNoteClick, searchQuery }) {
  const [open, setOpen] = useState(false)

  const catHojas = hojas.filter(h => h.categoria_id === cat.id)
  const count    = catHojas.length

  return (
    <div>
      {/* Category header — acts as the dropdown trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150"
        style={{
          background: open ? color + '15' : 'rgba(255,255,255,0.04)',
          borderColor: open ? color : 'var(--border)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = color
            e.currentTarget.style.background   = color + '10'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background   = 'rgba(255,255,255,0.04)'
          }
        }}
      >
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-sm flex-1 text-left font-medium" style={{ color: 'var(--text)' }}>
          {cat.icono ? `${cat.icono} ` : ''}{cat.nombre}
        </span>
        {count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full mr-1"
            style={{ background: color + '25', color }}>
            {count}
          </span>
        )}
        <ChevronDown
          size={13}
          style={{
            color,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        />
      </button>

      {/* Dropdown content */}
      {open && (
        <div className="mt-1 ml-3 space-y-1.5 border-l pl-3" style={{ borderColor: color + '40' }}>
          {/* Notes directly in this category */}
          {catHojas.length === 0 && subcats.length === 0 && (
            <p className="text-xs py-2 px-1" style={{ color: 'var(--subtext)' }}>Sin notas</p>
          )}
          {catHojas.map(h => (
            <NoteCard key={h.id} hoja={h} dotColor={color} onClick={() => onNoteClick(h.id)} />
          ))}

          {/* Subcategories as nested dropdowns */}
          {subcats.map(sub => (
            <SubcategoryDropdown
              key={sub.id}
              cat={sub}
              hojas={hojas}
              color={color}
              onNoteClick={onNoteClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Subcategory dropdown ──────────────────────────────────────────────────────
function SubcategoryDropdown({ cat, hojas, color, onNoteClick }) {
  const [open, setOpen] = useState(false)
  const catHojas = hojas.filter(h => h.categoria_id === cat.id)
  const count    = catHojas.length

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-150"
        style={{
          background: open ? color + '12' : 'rgba(255,255,255,0.03)',
          borderColor: open ? color + '80' : 'var(--border)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.borderColor = color + '80'
            e.currentTarget.style.background   = color + '0c'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background   = 'rgba(255,255,255,0.03)'
          }
        }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0 opacity-70" style={{ background: color }} />
        <span className="text-xs flex-1 text-left" style={{ color: 'var(--text)' }}>
          {cat.icono ? `${cat.icono} ` : ''}{cat.nombre}
        </span>
        {count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full mr-1"
            style={{ background: color + '20', color }}>
            {count}
          </span>
        )}
        <ChevronDown
          size={11}
          style={{
            color,
            opacity: 0.7,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms',
          }}
        />
      </button>

      {open && (
        <div className="mt-1 ml-2 space-y-1 border-l pl-2.5" style={{ borderColor: color + '30' }}>
          {catHojas.length === 0 && (
            <p className="text-xs py-1.5 px-1" style={{ color: 'var(--subtext)' }}>Sin notas</p>
          )}
          {catHojas.map(h => (
            <NoteCard key={h.id} hoja={h} dotColor={color} onClick={() => onNoteClick(h.id)} />
          ))}
        </div>
      )}
    </div>
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
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(18px)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--subtext)' }}>
          {t(lang, 'categories')}
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1 rounded-lg transition-colors flex-shrink-0"
          style={{ color: 'var(--subtext)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {/* Dropdown list */}
      <div className="flex-1 overflow-y-auto panel-scroll px-3 py-3 space-y-2">
        {rootCats.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'noHojas')}
          </p>
        )}
        {rootCats.map(cat => (
          <CategoryDropdown
            key={cat.id}
            cat={cat}
            subcats={categorias.filter(c => c.padre_id === cat.id)}
            hojas={filteredHojas}
            color={colorMap[cat.id]}
            onNoteClick={(id) => onOpenHoja?.(id)}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  )
}
