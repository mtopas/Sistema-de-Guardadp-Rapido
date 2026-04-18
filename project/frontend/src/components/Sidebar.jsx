import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Settings, ChevronRight, ChevronDown } from 'lucide-react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'

function CategoryNode({ cat, depth, categorias, counts }) {
  const kids = categorias.filter(c => c.padre_id === cat.id)
  const [open, setOpen] = useState(false)
  const count = counts[cat.id] || 0

  return (
    <div>
      <button
        onClick={() => kids.length && setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 py-1.5 rounded-lg transition-colors duration-150 text-xs group"
        style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: '8px', color: 'var(--subtext)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
      >
        <span className="flex-shrink-0 w-3.5 flex items-center justify-center opacity-60">
          {kids.length > 0 ? (open ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
        </span>
        <span className="truncate flex-1 text-left">{cat.icono ? `${cat.icono} ` : ''}{cat.nombre}</span>
        {count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
            style={{ background: 'var(--surface)', color: 'var(--subtext)' }}>
            {count}
          </span>
        )}
      </button>
      {open && kids.map(k => (
        <CategoryNode key={k.id} cat={k} depth={depth + 1} categorias={categorias} counts={counts} />
      ))}
    </div>
  )
}

export default function Sidebar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const categorias = useStore(s => s.categorias)
  const hojas      = useStore(s => s.hojas)
  const lang       = useStore(s => s.lang)
  const roots      = categorias.filter(c => !c.padre_id)

  // Count hojas per category (including subcategories is complex; just direct for now)
  const counts = hojas.reduce((acc, h) => {
    acc[h.categoria_id] = (acc[h.categoria_id] || 0) + 1
    return acc
  }, {})

  const navBtn = (path, Icon, key) => {
    const active = location.pathname === path
    return (
      <button
        onClick={() => navigate(path)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-150"
        style={active
          ? { color: 'var(--accent-light)', background: 'linear-gradient(90deg,rgba(139,92,246,.18),rgba(236,72,153,.06))', borderLeft: '2px solid var(--accent-light)' }
          : { color: 'var(--subtext)' }
        }
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--subtext)' }}
      >
        <Icon size={15} />
        {t(lang, key)}
      </button>
    )
  }

  return (
    <aside className="w-56 h-full flex flex-col border-r" style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}>
      {/* Logo */}
      <div className="px-4 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span
          className="gradient-text font-bold text-xl tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          hoja
        </span>
      </div>

      {/* Nav */}
      <div className="px-2 pt-2 space-y-0.5 flex-shrink-0">
        {navBtn('/', Home, 'browse')}
      </div>

      {/* Category tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
        <p className="text-[9.5px] tracking-widest uppercase px-2 py-2 mt-1"
          style={{ color: 'rgba(196,181,253,0.5)', letterSpacing: '0.12em' }}>
          {t(lang, 'categories')}
        </p>
        {roots.map(c => (
          <CategoryNode key={c.id} cat={c} depth={0} categorias={categorias} counts={counts} />
        ))}
        <div className="h-px mx-2 my-2" style={{ background: 'var(--border)' }} />
        <button
          className="w-full text-center py-2 text-[11px] rounded-lg border border-dashed transition-all duration-150"
          style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--subtext)' }}
          onClick={() => navigate('/capture')}
        >
          {t(lang, 'newCategory')}
        </button>
      </div>

      {/* Bottom */}
      <div className="px-2 py-2 border-t flex-shrink-0 space-y-0.5" style={{ borderColor: 'var(--border)' }}>
        {navBtn('/settings', Settings, 'settings')}
        <button
          onClick={() => navigate('/capture')}
          className="gradient-bg w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-150 mt-1"
          style={{ boxShadow: '0 4px 16px rgba(139,92,246,0.35)', letterSpacing: '0.04em' }}
        >
          + {t(lang, 'capture')}
        </button>
      </div>
    </aside>
  )
}
