import { useCallback, useMemo, useState } from 'react'
import { Compass, FileText, FolderTree, Link2, List, Network, Search, Tags } from 'lucide-react'
import { useStore } from '../store/useStore'
import { buildCategoriaColorMap } from '../utils/categoriaColors'
import { extractTags } from '../utils/tags'
import { getHojaDisplayTitle } from '../utils/hojaUtils'
import { getLeafIcon } from '../utils/leafIcons'
import NetworkGraph from './NetworkGraph'
import AgendaContextMenu from './agenda/AgendaContextMenu'
import EditHojaModal from './EditHojaModal'
import DeleteHojaModal from './DeleteHojaModal'

function localDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function Metric({ Icon, label, value, detail, color }) {
  return (
    <div className="min-w-0 border px-3 py-3" style={{ background: 'color-mix(in oklch, var(--surface) 82%, transparent)', borderColor: 'var(--border)', borderRadius: 8 }}>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 grid place-items-center shrink-0" style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, color, borderRadius: 7 }}>
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[19px] leading-none font-semibold tnum" style={{ color: 'var(--text)' }}>{value}</div>
          <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--subtext)' }}>{label}</div>
        </div>
      </div>
      {detail && <div className="text-[10px] mt-2 truncate" style={{ color }}>{detail}</div>}
    </div>
  )
}

function HojaRow({ hoja, color, active, onOpen, onContextMenu }) {
  const Icon = getLeafIcon(hoja.icono, hoja.tipo)
  const tags = extractTags(hoja.contenido, hoja.apuntes)
  const title = getHojaDisplayTitle(hoja) || 'Sin título'

  return (
    <button
      type="button"
      onClick={() => onOpen(hoja.id)}
      onContextMenu={e => onContextMenu?.(e, hoja)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left border transition-colors"
      style={{
        background: active ? `color-mix(in oklch, ${color} 12%, var(--surface))` : 'color-mix(in oklch, var(--surface) 74%, transparent)',
        borderColor: active ? color : 'var(--border)',
        borderRadius: 8,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `color-mix(in oklch, ${color} 8%, var(--surface))` } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'color-mix(in oklch, var(--surface) 74%, transparent)' } }}
    >
      <span className="w-8 h-8 grid place-items-center shrink-0" style={{ background: `color-mix(in oklch, ${color} 18%, transparent)`, color, borderRadius: 7 }}>
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{title}</span>
        <span className="block text-[10.5px] mt-0.5 truncate" style={{ color: 'var(--subtext)' }}>
          {hoja.tipo}{tags.length ? ` · #${tags.slice(0, 2).join(' #')}` : ''}
        </span>
      </span>
    </button>
  )
}

export default function BovedaWorkspace({ onOpenHoja, onHojaDeleted, searchQuery = '', selectedHojaId = null }) {
  const hojas = useStore(s => s.hojas)
  const categorias = useStore(s => s.categorias)
  const [view, setView] = useState('grafo')
  const [selectedTag, setSelectedTag] = useState(null)
  const [query, setQuery] = useState('')
  const [hojaMenu, setHojaMenu] = useState(null)
  const [editHoja, setEditHoja] = useState(null)
  const [deleteHoja, setDeleteHoja] = useState(null)

  const openHojaContextMenu = useCallback((e, hoja) => {
    e.preventDefault()
    e.stopPropagation()
    setHojaMenu({ x: e.clientX, y: e.clientY, hoja })
  }, [])

  const buildHojaContextItems = useCallback((hoja) => [
    { label: 'Editar Hoja', onClick: () => setEditHoja(hoja) },
    { label: 'Eliminar Hoja', danger: true, onClick: () => setDeleteHoja(hoja) },
  ], [])

  const colorMap = useMemo(() => buildCategoriaColorMap(categorias), [categorias])
  const today = localDate(new Date())
  const tags = useMemo(() => {
    const counts = new Map()
    hojas.forEach(hoja => extractTags(hoja.contenido, hoja.apuntes).forEach(tag => {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }))
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [hojas])

  const filteredHojas = useMemo(() => {
    const terms = [searchQuery, query].map(q => q.trim().toLowerCase()).filter(Boolean)
    return hojas
      .filter(hoja => {
        const hojaTags = extractTags(hoja.contenido, hoja.apuntes)
        const matchingTag = !selectedTag || hojaTags.includes(selectedTag)
        const matchingQuery = terms.every(term => [hoja.contenido, hoja.apuntes, hoja.categoria_nombre, ...hojaTags]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(term)))
        return matchingTag && matchingQuery
      })
      .sort((a, b) => new Date(b.fecha_actualizado || b.fecha) - new Date(a.fecha_actualizado || a.fecha))
  }, [hojas, selectedTag, query, searchQuery])

  const updatedToday = hojas.filter(hoja => localDate(hoja.fecha_actualizado || hoja.fecha) === today).length
  const links = hojas.filter(hoja => hoja.tipo === 'link').length
  const actions = [
    ['grafo', 'Grafo', Network],
    ['lista', 'Lista', List],
    ['explorar', 'Explorador', Compass],
  ]

  return (
    <section className="h-full min-w-0 min-h-0 flex flex-col gap-3 p-3 lg:p-4" style={{ background: 'var(--bg)' }}>
      <div className="grid grid-cols-2 2xl:grid-cols-4 gap-2.5 shrink-0">
        <Metric Icon={FileText} label="Hojas en total" value={hojas.length} detail={updatedToday ? `${updatedToday} actualizadas hoy` : null} color="var(--accent)" />
        <Metric Icon={FolderTree} label="Categorías" value={categorias.length} detail={categorias.filter(c => !c.padre_id).length ? `${categorias.filter(c => !c.padre_id).length} principales` : null} color="var(--accent-alt, var(--accent-light))" />
        <Metric Icon={Network} label="Etiquetas activas" value={tags.length} detail={tags.length ? `${tags[0][0]} es la más usada` : null} color="var(--success)" />
        <Metric Icon={Link2} label="Enlaces guardados" value={links} detail={hojas.length ? `${Math.round((links / hojas.length) * 100)}% de la Bóveda` : null} color="var(--warning)" />
      </div>

      <div className="min-h-0 flex-1 flex flex-col border overflow-hidden" style={{ background: 'color-mix(in oklch, var(--surface) 46%, transparent)', borderColor: 'var(--border)', borderRadius: 8 }}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--panel-bg) 75%, transparent)' }}>
          <div className="flex items-center gap-1 p-1 border" style={{ borderColor: 'var(--border)', background: 'var(--bg)', borderRadius: 7 }}>
            {actions.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] font-medium transition-colors"
                style={{
                  borderRadius: 5,
                  color: view === id ? 'var(--accent-light)' : 'var(--subtext)',
                  background: view === id ? 'color-mix(in oklch, var(--accent) 17%, transparent)' : 'transparent',
                }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          {view !== 'grafo' && (
            <label className="ml-auto min-w-[180px] max-w-[300px] flex items-center gap-2 px-2.5 py-1.5 border" style={{ borderColor: 'var(--border)', background: 'var(--bg)', borderRadius: 7 }}>
              <Search size={13} style={{ color: 'var(--subtext)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en esta vista" className="min-w-0 flex-1 bg-transparent outline-none text-[11.5px]" style={{ color: 'var(--text)' }} />
            </label>
          )}
        </div>

        {view === 'grafo' && (
          <div className="min-h-0 flex-1 relative">
            <NetworkGraph onOpenHoja={onOpenHoja} hojasFiltradas={filteredHojas} />
          </div>
        )}

        {view === 'lista' && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
            {filteredHojas.length ? filteredHojas.map(hoja => (
              <HojaRow key={hoja.id} hoja={hoja} color={colorMap[hoja.categoria_id] || 'var(--accent)'} active={hoja.id === selectedHojaId} onOpen={onOpenHoja} onContextMenu={openHojaContextMenu} />
            )) : <p className="py-12 text-center text-[12px]" style={{ color: 'var(--subtext)' }}>No hay hojas que coincidan con esta búsqueda.</p>}
          </div>
        )}

        {view === 'explorar' && (
          <div className="min-h-0 flex-1 grid lg:grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
            <div className="border-b lg:border-b-0 lg:border-r p-3 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--subtext)' }}><Tags size={12} /> Etiquetas</div>
              <button type="button" onClick={() => setSelectedTag(null)} className="w-full flex justify-between px-2 py-1.5 text-left text-[11.5px]" style={{ color: selectedTag ? 'var(--subtext)' : 'var(--accent-light)', background: selectedTag ? 'transparent' : 'color-mix(in oklch, var(--accent) 12%, transparent)', borderRadius: 5 }}>
                Todas <span>{hojas.length}</span>
              </button>
              {tags.map(([tag, count]) => (
                <button key={tag} type="button" onClick={() => setSelectedTag(tag)} className="w-full flex justify-between px-2 py-1.5 mt-0.5 text-left text-[11.5px]" style={{ color: selectedTag === tag ? 'var(--accent-light)' : 'var(--text-2)', background: selectedTag === tag ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent', borderRadius: 5 }}>
                  <span className="truncate">#{tag}</span><span className="ml-3 tnum" style={{ color: 'var(--subtext)' }}>{count}</span>
                </button>
              ))}
            </div>
            <div className="min-h-0 overflow-y-auto p-3 space-y-2">
              {filteredHojas.length ? filteredHojas.map(hoja => (
                <HojaRow key={hoja.id} hoja={hoja} color={colorMap[hoja.categoria_id] || 'var(--accent)'} active={hoja.id === selectedHojaId} onOpen={onOpenHoja} onContextMenu={openHojaContextMenu} />
              )) : <p className="py-12 text-center text-[12px]" style={{ color: 'var(--subtext)' }}>No hay hojas para esta etiqueta.</p>}
            </div>
          </div>
        )}
      </div>

      {hojaMenu && (
        <AgendaContextMenu
          x={hojaMenu.x}
          y={hojaMenu.y}
          items={buildHojaContextItems(hojaMenu.hoja)}
          onClose={() => setHojaMenu(null)}
        />
      )}

      <EditHojaModal hoja={editHoja} onClose={() => setEditHoja(null)} />

      <DeleteHojaModal
        hoja={deleteHoja}
        onClose={() => setDeleteHoja(null)}
        onDeleted={id => onHojaDeleted?.(id)}
      />
    </section>
  )
}
