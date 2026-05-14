import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Link2, FileText, Image } from 'lucide-react'
import { useStore } from '../store/useStore'
import NetworkGraph from '../components/NetworkGraph'
import LeftPanel from '../components/LeftPanel'
import RightPanel from '../components/RightPanel'
import TopBar from '../components/TopBar'
import { t } from '../utils/i18n'

const TYPE_ICON = {
  link:  <Link2    size={13} />,
  texto: <FileText size={13} />,
  foto:  <Image    size={13} />,
}

// ── Mobile list ───────────────────────────────────────────────────────────────
function MobileList() {
  const navigate = useNavigate()
  const hojas    = useStore(s => s.hojas)
  const lang     = useStore(s => s.lang)
  const [query, setQuery] = useState('')

  const filtered = query
    ? hojas.filter(h =>
        h.contenido.toLowerCase().includes(query.toLowerCase()) ||
        h.categoria_nombre.toLowerCase().includes(query.toLowerCase())
      )
    : hojas

  const byCategory = filtered.reduce((acc, h) => {
    const k = h.categoria_nombre
    if (!acc[k]) acc[k] = []
    acc[k].push(h)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 px-4 py-3 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 border transition-colors duration-150"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <Search size={15} style={{ color: 'var(--subtext)', flexShrink: 0 }} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t(lang, 'searchPlaceholder')}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text)' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {Object.keys(byCategory).length === 0 && (
          <p className="text-center text-sm mt-16" style={{ color: 'var(--subtext)' }}>
            {query ? t(lang, 'noResults') : t(lang, 'noHojas')}
          </p>
        )}
        {Object.entries(byCategory).sort(([a],[b]) => a.localeCompare(b)).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--subtext)' }}>
              {cat}
            </h3>
            <div className="space-y-2">
              {items.map(h => (
                <button key={h.id} onClick={() => navigate(`/hoja/${h.id}`)}
                  className="w-full text-left rounded-xl px-4 py-3 border transition-all duration-150 group active:scale-[0.99]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div className="flex items-start gap-2">
                    <span style={{ color: 'var(--subtext)', marginTop: 2, flexShrink: 0 }}>{TYPE_ICON[h.tipo] ?? TYPE_ICON.texto}</span>
                    <p className="flex-1 text-sm line-clamp-2 leading-snug" style={{ color: 'var(--text)' }}>{h.contenido}</p>
                    <ChevronRight size={14} style={{ color: 'var(--border)', flexShrink: 0, marginTop: 2 }} />
                  </div>
                  <p className="text-xs mt-1.5 pl-5" style={{ color: 'var(--subtext)' }}>
                    {new Date(h.fecha).toLocaleDateString('es-AR')}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Desktop full-screen graph with overlay panels ─────────────────────────────
function DesktopGraph() {
  const [openHojaId, setOpenHojaId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="flex flex-col w-full h-full">
      {/* Top bar */}
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      {/* Graph area — panels float on top, graph stays centered in the visible gap */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute top-0 bottom-0" style={{ left: 300, right: 425 }}>
          <NetworkGraph />
        </div>
        <LeftPanel searchQuery={searchQuery} onOpenHoja={(id) => setOpenHojaId(id)} />
        <RightPanel openHojaId={openHojaId} onClose={() => setOpenHojaId(null)} />
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BrowseScreen() {
  return (
    <>
      <div className="hidden md:block w-full h-full">
        <DesktopGraph />
      </div>
      <div className="md:hidden flex flex-col h-full">
        <MobileList />
      </div>
    </>
  )
}
