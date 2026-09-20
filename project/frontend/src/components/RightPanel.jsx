import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Calendar, FileText, Image as ImageIcon, Link as LinkIcon, Pencil, Tag } from 'lucide-react'
import { useStore } from '../store/useStore'
import { buildCategoriaColorMap } from '../utils/categoriaColors'
import { extractTags } from '../utils/tags'
import { getLeafIcon } from '../utils/leafIcons'
import { getHojaDisplayTitle } from '../utils/hojaUtils'
import EditHojaModal from './EditHojaModal'

function relativeDate(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'Ahora'
  if (hours < 24) return `Hace ${hours} h`
  if (days < 7) return `Hace ${days} d`
  return new Date(value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function plainText(value) {
  return (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function NoteType({ tipo, color }) {
  const Icon = tipo === 'link' ? LinkIcon : tipo === 'foto' ? ImageIcon : FileText
  return <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color }}><Icon size={11} />{tipo || 'texto'}</span>
}

export default function RightPanel({ selectedHojaId, onSelectHoja }) {
  const navigate = useNavigate()
  const hojas = useStore(s => s.hojas)
  const categorias = useStore(s => s.categorias)
  const [editHoja, setEditHoja] = useState(null)

  const colorMap = useMemo(() => buildCategoriaColorMap(categorias), [categorias])
  const latestHojas = useMemo(() => [...hojas]
    .sort((a, b) => new Date(b.fecha_actualizado || b.fecha) - new Date(a.fecha_actualizado || a.fecha))
    .slice(0, 7), [hojas])
  const selected = useMemo(() => hojas.find(hoja => hoja.id === selectedHojaId) || null, [hojas, selectedHojaId])
  const selectedColor = selected ? (colorMap[selected.categoria_id] || 'var(--accent)') : 'var(--accent)'
  const selectedTags = selected ? extractTags(selected.contenido, selected.apuntes) : []
  const LeafIcon = selected ? getLeafIcon(selected.icono, selected.tipo) : FileText

  return (
    <aside className="h-full min-h-0 flex flex-col overflow-hidden border-l" style={{ background: 'var(--sidebar)', borderColor: 'var(--border)' }}>
      <section className="flex-[0_1_48%] min-h-0 flex flex-col border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'var(--subtext)' }}>Últimas hojas</h2>
          <button type="button" onClick={() => onSelectHoja?.(null)} className="text-[11px] font-medium inline-flex items-center gap-1" style={{ color: 'var(--accent)' }}>Ver todas <ArrowRight size={12} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-3 pb-3 space-y-1">
          {latestHojas.length === 0 ? <p className="px-2 py-6 text-xs" style={{ color: 'var(--subtext)' }}>Todavía no hay hojas.</p> : latestHojas.map(hoja => {
            const color = colorMap[hoja.categoria_id] || 'var(--accent)'
            const Icon = getLeafIcon(hoja.icono, hoja.tipo)
            const active = hoja.id === selectedHojaId
            return (
              <button key={hoja.id} type="button" onClick={() => onSelectHoja?.(hoja.id)} className="w-full min-h-[58px] px-2.5 py-2 text-left flex items-center gap-2.5 border transition-colors" style={{ background: active ? `color-mix(in oklch, ${color} 12%, var(--surface))` : 'var(--surface)', borderColor: active ? color : 'color-mix(in oklch, var(--border) 80%, transparent)', borderRadius: 8 }}>
                <span className="w-8 h-8 flex items-center justify-center flex-none" style={{ color, background: `color-mix(in oklch, ${color} 15%, transparent)`, borderRadius: 7 }}><Icon size={15} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium" style={{ color: 'var(--text)' }}>{getHojaDisplayTitle(hoja)}</span><span className="mt-0.5 flex items-center justify-between gap-2 text-[10px]" style={{ color: 'var(--subtext)' }}><NoteType tipo={hoja.tipo} color={color} /> <span>{relativeDate(hoja.fecha_actualizado || hoja.fecha)}</span></span></span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-4 pb-2"><h2 className="text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color: 'var(--subtext)' }}>Vista previa</h2></div>
        {selected ? (
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <div className="flex items-start gap-3 mb-4"><span className="w-10 h-10 flex items-center justify-center flex-none" style={{ color: selectedColor, background: `color-mix(in oklch, ${selectedColor} 16%, transparent)`, borderRadius: 8 }}><LeafIcon size={19} /></span><div className="min-w-0 flex-1"><h3 className="text-sm leading-snug font-semibold" style={{ color: 'var(--text)' }}>{getHojaDisplayTitle(selected)}</h3><p className="mt-1 text-[11px]" style={{ color: 'var(--subtext)' }}>{selected.categoria_nombre || 'Sin categoría'}</p></div></div>
            <p className="text-xs leading-relaxed line-clamp-6" style={{ color: 'var(--text-2)' }}>{plainText(selected.apuntes) || 'Esta hoja todavía no tiene contenido adicional.'}</p>
            {selected.link_url && <a href={selected.link_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-xs" style={{ color: selectedColor }}><LinkIcon size={13} />{selected.link_url}</a>}
            <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}><p className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--subtext)' }}><Calendar size={13} />Actualizada {relativeDate(selected.fecha_actualizado || selected.fecha)}</p>{selectedTags.length > 0 && <div className="flex items-start gap-2"><Tag size={13} className="mt-0.5 flex-none" style={{ color: 'var(--subtext)' }} /><div className="flex flex-wrap gap-1">{selectedTags.slice(0, 6).map(tag => <span key={tag} className="px-1.5 py-0.5 text-[10px] border" style={{ color: 'var(--text-2)', borderColor: 'var(--border)', borderRadius: 5 }}>{tag}</span>)}</div></div>}</div>
            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => navigate(`/hoja/${selected.id}`)} className="h-9 text-xs font-semibold" style={{ color: 'var(--cta-text)', background: 'var(--cta-bg)', borderRadius: 7 }}>Abrir hoja</button><button type="button" onClick={() => setEditHoja(selected)} className="h-9 text-xs font-medium border inline-flex items-center justify-center gap-1.5" style={{ color: 'var(--text-2)', borderColor: 'var(--border)', borderRadius: 7 }}><Pencil size={13} />Editar</button></div>
          </div>
        ) : <div className="px-4 py-6 text-xs leading-relaxed" style={{ color: 'var(--subtext)' }}>Seleccioná una hoja para revisar su contenido y abrirla en el editor.</div>}
      </section>
      <EditHojaModal hoja={editHoja} onClose={() => setEditHoja(null)} />
    </aside>
  )
}
