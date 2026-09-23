import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_ORDER, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'
import JarvisSourceModal from './JarvisSourceModal'

// Pantalla "browse" (pieza F) — navegar/filtrar toda la memoria sin pasar por
// el chat, equivalente a como Bóveda tiene su árbol de categorías en
// LeftPanel. Depende del catálogo de tags (pieza A) para el filtro por tag y
// se beneficia de la búsqueda léxica (pieza E) para el filtro de texto, vía
// el mismo GET /jarvis/browse que ya las combina en el backend.

const PAGE_SIZE = 25

const inputStyle = {
  background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)',
  color: '#eef2ff', borderRadius: 8,
}

const AUDIT_STATUS_COLORS = {
  PENDING: '#7dd3fc', ACCEPTED: '#4ade80', REJECTED: 'rgba(200,214,255,0.4)', EXPIRED: '#fbbf24',
  RESOLVED_WITH_NEW_INFO: '#c084fc',
}
const AUDIT_ACTION_LABELS = {
  create: 'CREAR', clarify: 'ACLARAR', flag_contradiction: 'CONTRADICCIÓN', flag_connection: 'CONEXIÓN',
  merge: 'FUSIONAR', edit: 'CORREGIR', delete: 'ELIMINAR', retag: 'RETAGEAR',
  open_question: 'PREGUNTA ABIERTA',
}

export default function JarvisBrowsePanel() {
  const {
    jarvisTags, jarvisProjects, jarvisBrowseResults, fetchJarvisTags, fetchJarvisBrowse,
    jarvisAuditHistory, jarvisIsolatedEntries, fetchJarvisAuditHistory, fetchJarvisIsolatedEntries,
  } = useStore(
    useShallow(s => ({
      jarvisTags:                 s.jarvisTags,
      jarvisProjects:             s.jarvisProjects,
      jarvisBrowseResults:        s.jarvisBrowseResults,
      fetchJarvisTags:            s.fetchJarvisTags,
      fetchJarvisBrowse:          s.fetchJarvisBrowse,
      jarvisAuditHistory:         s.jarvisAuditHistory,
      jarvisIsolatedEntries:      s.jarvisIsolatedEntries,
      fetchJarvisAuditHistory:    s.fetchJarvisAuditHistory,
      fetchJarvisIsolatedEntries: s.fetchJarvisIsolatedEntries,
    }))
  )

  // "Memoria" (comportamiento original, default) vs "Auditoría" -- historial
  // de jarvis_audit_proposals + hueco tipo B (entrada aislada). Decisión
  // resuelta con el usuario: filtro dentro de Explorar, no pantalla aparte.
  const [view, setView] = useState('memoria')

  const [type, setType] = useState('')
  const [tag, setTag] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [openSourceId, setOpenSourceId] = useState(null)

  useEffect(() => { fetchJarvisTags() }, [fetchJarvisTags])

  useEffect(() => {
    if (view !== 'auditoria') return
    fetchJarvisAuditHistory()
    fetchJarvisIsolatedEntries()
  }, [view, fetchJarvisAuditHistory, fetchJarvisIsolatedEntries])

  function refetchBrowse() {
    fetchJarvisBrowse({
      type: type || undefined,
      tag: tag || undefined,
      project_id: projectId || undefined,
      date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
  }

  useEffect(() => {
    refetchBrowse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tag, projectId, dateFrom, dateTo, q, page, fetchJarvisBrowse])

  // El modal de "olvidar" (JarvisSourceModal) hace un DELETE contra el backend
  // pero no toca ningún estado del store -- sin este refetch, la entrada
  // olvidada seguía apareciendo en la lista hasta el próximo cambio de filtro
  // (el usuario reportó esto: "pongo para olvidar una entrada y no desaparece
  // del panel"). Refresca la lista que esté visible según la vista actual.
  function handleEntryForgotten() {
    if (view === 'auditoria') {
      fetchJarvisAuditHistory()
      fetchJarvisIsolatedEntries()
    } else {
      refetchBrowse()
    }
  }

  useEffect(() => { setPage(0) }, [type, tag, projectId, dateFrom, dateTo, q])

  const { total, items } = jarvisBrowseResults
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  function clearFilters() {
    setType(''); setTag(''); setProjectId(''); setDateFrom(''); setDateTo(''); setQ('')
  }
  const hasFilters = type || tag || projectId || dateFrom || dateTo || q

  return (
    <div className="h-full flex flex-col" style={{ padding: '16px 20px', overflow: 'hidden' }}>
      <div className="flex items-center gap-1" style={{ paddingBottom: 12, flex: 'none' }}>
        {[['memoria', 'Memoria'], ['auditoria', 'Auditoría']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="text-[12px] px-3 py-1.5 rounded-lg"
            style={
              view === key
                ? { background: 'rgba(150,170,255,0.14)', color: '#eef2ff' }
                : { color: 'rgba(200,214,255,0.5)', background: 'transparent' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'memoria' && (<>
      <div className="flex flex-wrap items-center gap-2" style={{ paddingBottom: 12, flex: 'none' }}>
        <div className="flex items-center gap-2 flex-1" style={{ minWidth: 200, ...inputStyle, padding: '0 10px' }}>
          <Search size={13} style={{ color: 'var(--jv-mute)' }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar en el contenido..."
            className="flex-1 py-2 text-[13px] outline-none bg-transparent"
            style={{ color: '#eef2ff' }}
          />
        </div>
        <select value={type} onChange={e => setType(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={inputStyle}>
          <option value="">Todos los tipos</option>
          {MEMORY_TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={tag} onChange={e => setTag(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={inputStyle}>
          <option value="">Todos los tags</option>
          {jarvisTags.map(t => <option key={t.tag_id} value={t.name}>#{t.name} ({t.memory_count})</option>)}
        </select>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={inputStyle}>
          <option value="">Todos los proyectos</option>
          {jarvisProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={inputStyle} />
        <span style={{ color: 'var(--jv-mute)', fontSize: 12 }}>–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-[12px] py-2 px-2.5 outline-none" style={inputStyle} />
        {hasFilters && (
          <button onClick={clearFilters} className="text-[12px] px-2.5 py-2" style={{ color: 'rgba(200,214,255,0.5)' }}>
            Limpiar
          </button>
        )}
      </div>

      <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)', paddingBottom: 8, flex: 'none' }}>
        {total} entrada{total === 1 ? '' : 's'}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        {items.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '20px 4px' }}>
            {hasFilters ? 'Nada coincide con estos filtros.' : 'Sin memoria guardada todavía.'}
          </div>
        )}
        {items.map(entry => {
          const color = MEMORY_TYPE_COLORS[entry.type] || MEMORY_TYPE_COLORS.RAW
          const text = entry.content_processed || entry.content_raw || ''
          return (
            <div
              key={entry.id}
              onClick={() => setOpenSourceId(entry.id)}
              className="cursor-pointer"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                borderRadius: 10, background: 'rgba(150,170,255,0.04)', border: '1px solid rgba(150,170,255,0.08)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(150,170,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(150,170,255,0.04)'}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, marginTop: 5, flex: 'none', boxShadow: `0 0 6px ${color}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#e9eeff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {text}
                </div>
                <div className="jv-mono" style={{ fontSize: 9.5, color: 'var(--jv-mute)', marginTop: 4 }}>
                  {entry.type} · {formatAge(entry.recorded_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {maxPage > 0 && (
        <div className="flex items-center justify-center gap-3" style={{ paddingTop: 12, flex: 'none' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[12px] px-3 py-1.5 rounded-lg"
            style={{ ...inputStyle, opacity: page === 0 ? 0.4 : 1 }}
          >
            Anterior
          </button>
          <span className="jv-mono" style={{ fontSize: 11, color: 'var(--jv-mute)' }}>{page + 1} / {maxPage + 1}</span>
          <button
            onClick={() => setPage(p => Math.min(maxPage, p + 1))}
            disabled={page >= maxPage}
            className="text-[12px] px-3 py-1.5 rounded-lg"
            style={{ ...inputStyle, opacity: page >= maxPage ? 0.4 : 1 }}
          >
            Siguiente
          </button>
        </div>
      )}
      </>)}

      {view === 'auditoria' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)', paddingBottom: 8 }}>
              HISTORIAL DE PROPUESTAS · {jarvisAuditHistory.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jarvisAuditHistory.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '8px 4px' }}>
                  Todavía no corrió ninguna auditoría.
                </div>
              )}
              {jarvisAuditHistory.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    borderRadius: 10, background: 'rgba(150,170,255,0.04)', border: '1px solid rgba(150,170,255,0.08)',
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: AUDIT_STATUS_COLORS[p.status] || '#888', marginTop: 5, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#e9eeff', whiteSpace: 'pre-line' }}>{p.question}</div>
                    <div className="jv-mono" style={{ fontSize: 9.5, color: 'var(--jv-mute)', marginTop: 4 }}>
                      {AUDIT_ACTION_LABELS[p.action_type] || p.action_type} · {p.status} · {formatAge(p.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)', paddingBottom: 8 }}>
              ENTRADAS AISLADAS (sin entidad ni proyecto) · {jarvisIsolatedEntries.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jarvisIsolatedEntries.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--jv-mute)', padding: '8px 4px' }}>
                  Ninguna entrada vigente está sin vincular.
                </div>
              )}
              {jarvisIsolatedEntries.map(entry => {
                const color = MEMORY_TYPE_COLORS[entry.type] || MEMORY_TYPE_COLORS.RAW
                const text = entry.content_processed || entry.content_raw || ''
                return (
                  <div
                    key={entry.id}
                    onClick={() => setOpenSourceId(entry.id)}
                    className="cursor-pointer"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                      borderRadius: 10, background: 'rgba(150,170,255,0.04)', border: '1px solid rgba(150,170,255,0.08)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(150,170,255,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(150,170,255,0.04)'}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, marginTop: 5, flex: 'none', boxShadow: `0 0 6px ${color}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e9eeff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {text}
                      </div>
                      <div className="jv-mono" style={{ fontSize: 9.5, color: 'var(--jv-mute)', marginTop: 4 }}>
                        {entry.type} · {formatAge(entry.recorded_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {openSourceId && (
        <JarvisSourceModal
          entryId={openSourceId}
          onClose={() => setOpenSourceId(null)}
          onForgotten={handleEntryForgotten}
        />
      )}
    </div>
  )
}
