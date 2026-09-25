import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, JARVIS_ENTITY_CARD_MIN, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'
import JarvisLinkedEntriesModal from './JarvisLinkedEntriesModal'

const inputStyle = {
  background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)',
  color: '#eef2ff', borderRadius: 8,
}

function initials(name) {
  return name.slice(0, 2).toUpperCase()
}

export default function JarvisEntitiesPanel() {
  const { jarvisEntities, fetchJarvisEntities, setJarvisTab, jarvisQuery } = useStore(
    useShallow(s => ({
      jarvisEntities: s.jarvisEntities,
      fetchJarvisEntities: s.fetchJarvisEntities,
      setJarvisTab:   s.setJarvisTab,
      jarvisQuery:    s.jarvisQuery,
    }))
  )

  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedEntity, setSelectedEntity] = useState(null)

  const sorted = useMemo(() => {
    const copy = [...jarvisEntities]
    copy.sort((a, b) => {
      const countDiff = (b.memory_count ?? 0) - (a.memory_count ?? 0)
      if (countDiff !== 0) return countDiff
      return (new Date(b.last_seen) - new Date(a.last_seen))
    })
    return copy
  }, [jarvisEntities])

  const filtered = useMemo(() => {
    return sorted.filter(e => {
      const matchesText = e.name.toLowerCase().includes(searchText.toLowerCase())
      const matchesType = !typeFilter || e.entity_type === typeFilter
      return matchesText && matchesType
    })
  }, [sorted, searchText, typeFilter])

  function ask(name) {
    setJarvisTab('chat')
    jarvisQuery(`¿Qué sé sobre ${name}?`)
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '26px 34px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 600 }}>Entidades reconocidas</div>
        <div className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-mute)' }}>
          personas, organizaciones y lugares extraídos de tus capturas
        </div>
      </div>

      {jarvisEntities.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '20px 4px' }}>
          Todavía no se detectó ninguna entidad.
        </div>
      )}

      {jarvisEntities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid rgba(150,170,255,0.1)' }}>
          <div className="flex items-center gap-2 flex-1" style={{ minWidth: 200, ...inputStyle, padding: '0 10px' }}>
            <Search size={13} style={{ color: 'var(--jv-mute)' }} />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar por nombre..."
              className="flex-1 py-2 text-[13px] outline-none bg-transparent"
              style={{ color: '#eef2ff' }}
            />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={{backgroundColor: 'rgba(30,30,50,0.8)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff', borderRadius: 8}}>
            <option value="" style={{backgroundColor: 'rgba(20,20,40,0.95)', color: '#eef2ff'}}>Todas</option>
            <option value="person" style={{backgroundColor: 'rgba(20,20,40,0.95)', color: '#eef2ff'}}>Personas</option>
            <option value="organization" style={{backgroundColor: 'rgba(20,20,40,0.95)', color: '#eef2ff'}}>Organizaciones</option>
            <option value="place" style={{backgroundColor: 'rgba(20,20,40,0.95)', color: '#eef2ff'}}>Lugares</option>
          </select>
        </div>
      )}

      {filtered.length === 0 && jarvisEntities.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '20px 4px' }}>
          Ninguna entidad coincide con el filtro.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${JARVIS_ENTITY_CARD_MIN}px, 1fr))`, gap: 12 }}>
        {filtered.map(e => {
          const color = e.entity_type === 'person' ? MEMORY_TYPE_COLORS.PEOPLE : MEMORY_TYPE_COLORS.PROJECT
          const kind = { person: 'PERSONA', organization: 'ORGANIZACIÓN', place: 'LUGAR' }[e.entity_type] || e.entity_type.toUpperCase()
          return (
            <div
              key={e.name}
              onClick={() => setSelectedEntity(e)}
              style={{
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 11, padding: 16,
                borderRadius: 14, background: 'rgba(10,13,26,0.7)',
                border: `1px solid ${rgba(color, 0.24)}`, transition: 'all .2s',
              }}
              onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-3px)'; ev.currentTarget.style.background = 'rgba(16,20,38,0.85)' }}
              onMouseLeave={ev => { ev.currentTarget.style.transform = 'translateY(0)'; ev.currentTarget.style.background = 'rgba(10,13,26,0.7)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: e.entity_type === 'person' ? '50%' : 8,
                    background: rgba(color, 0.1), border: `1px solid ${color}`,
                    display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color,
                  }}
                  className="jv-mono"
                >
                  {initials(e.name)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#eaeeff' }}>{e.name}</div>
                  <div className="jv-mono" style={{ fontSize: 9.5, letterSpacing: '0.1em', color }}>{kind}</div>
                </div>
              </div>
              {e.notes && (
                <div style={{ fontSize: 12, lineHeight: 1.55, color: 'rgba(214,224,255,0.5)' }}>{e.notes}</div>
              )}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {(e.types || []).map(t => (
                  <div key={t} style={{ width: 5, height: 5, borderRadius: '50%', background: MEMORY_TYPE_COLORS[t] || MEMORY_TYPE_COLORS.RAW }} />
                ))}
                <div className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)', marginLeft: 4 }}>
                  {e.memory_count ?? 0} memorias · visto {formatAge(e.last_seen)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {selectedEntity && <JarvisLinkedEntriesModal
        title={selectedEntity.name} kind="entities" name={selectedEntity.name}
        onClose={() => setSelectedEntity(null)} onAsk={() => { ask(selectedEntity.name); setSelectedEntity(null) }}
        onChanged={fetchJarvisEntities}
      />}
    </div>
  )
}
