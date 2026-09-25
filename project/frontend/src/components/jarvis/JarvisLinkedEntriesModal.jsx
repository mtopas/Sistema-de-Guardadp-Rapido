import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { API_URL } from '../../config'
import { formatAge } from '../../utils/formatAge'
import JarvisSourceModal from './JarvisSourceModal'

export default function JarvisLinkedEntriesModal({ title, kind, name, onClose, onAsk, onChanged }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sourceId, setSourceId] = useState(null)
  const [refresh, setRefresh] = useState(0)

  function handleEntryChanged() {
    setRefresh(n => n + 1)
    onChanged?.()
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetch(`${API_URL}/jarvis/${kind}/${encodeURIComponent(name)}`, { signal: controller.signal })
      .then(res => { if (res.status === 404) return []; if (!res.ok) throw new Error('No se pudieron cargar las entradas'); return res.json() })
      .then(data => { setEntries(data); setLoading(false) })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false) } })
    return () => controller.abort()
  }, [kind, name, refresh])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-xl rounded-2xl" style={{ maxHeight: '80vh', overflow: 'auto', background: '#0a0d1a', border: '1px solid rgba(150,170,255,0.2)', padding: 22 }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 16 }}>
          <div>
            <div className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)', letterSpacing: '0.12em' }}>MEMORIAS VINCULADAS</div>
            <div style={{ fontSize: 20, color: '#eef2ff', marginTop: 4 }}>{title}</div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: 'var(--jv-mute)' }}><X size={18} /></button>
        </div>
        {loading && <div style={{ color: 'var(--jv-mute)' }}>Cargando entradas…</div>}
        {error && <div style={{ color: '#f87171' }}>No se pudieron cargar las entradas.</div>}
        {!loading && !error && entries.length === 0 && <div style={{ color: 'var(--jv-mute)' }}>No hay entradas vigentes vinculadas.</div>}
        {!loading && !error && entries.map(entry => (
          <button key={entry.id} onClick={() => setSourceId(entry.id)} className="w-full text-left"
            style={{ display: 'block', padding: '11px 12px', marginBottom: 7, color: '#e9eeff', background: 'rgba(150,170,255,0.05)', border: '1px solid rgba(150,170,255,0.12)', borderRadius: 10 }}>
            <div style={{ fontSize: 13 }}>{entry.content_processed || entry.content_raw}</div>
            <div className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)', marginTop: 5 }}>{entry.type} · {formatAge(entry.recorded_at)}</div>
          </button>
        ))}
        {onAsk && <button onClick={onAsk} style={{ color: '#7dd3fc', fontSize: 12, marginTop: 10 }}>Preguntar a Jarvis sobre {name}</button>}
      </div>
      {sourceId && <JarvisSourceModal entryId={sourceId} onClose={() => setSourceId(null)} onForgotten={handleEntryChanged} onEdited={handleEntryChanged} />}
    </div>
  )
}
