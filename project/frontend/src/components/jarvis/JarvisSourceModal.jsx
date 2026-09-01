import { useEffect, useState } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_ORDER, rgba } from '../../utils/jarvisPalette'
import { formatAge } from '../../utils/formatAge'

// Fuente clickeable (Mejoras_Jarvis.md punto 2 — "que me lleven a la fuente").
// No hay una pantalla de detalle de entrada de memoria en SGR (Bóveda tiene
// /hoja/:id, pero memory_entries de Jarvis no es lo mismo); en vez de navegar
// a una ruta nueva, se abre acá el registro completo de esa entrada
// (contenido, tipo, cuándo, de dónde) — mismo patrón de modal ya usado por
// JarvisCaptureModal.
//
// Editar/olvidar (pieza B): este modal ya es el lugar donde el usuario ve el
// detalle completo de una entrada, así que es el lugar natural para agregar
// las dos acciones que faltaban (no había forma de corregir/borrar algo mal
// guardado sin tocar la DB a mano) -- ver PATCH/DELETE /jarvis/entries/{id}.

function parseTags(entry) {
  if (!entry?.tags) return []
  try {
    const parsed = JSON.parse(entry.tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function JarvisSourceModal({ entryId, onClose }) {
  const { fetchJarvisEntry, editJarvisEntry, forgetJarvisEntry, showToast } = useStore(
    useShallow(s => ({
      fetchJarvisEntry:  s.fetchJarvisEntry,
      editJarvisEntry:   s.editJarvisEntry,
      forgetJarvisEntry: s.forgetJarvisEntry,
      showToast:         s.showToast,
    }))
  )
  const [entry, setEntry] = useState(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [draftType, setDraftType] = useState('RAW')
  const [draftTags, setDraftTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEntry(null)
    setError(false)
    setEditing(false)
    setConfirmForget(false)
    fetchJarvisEntry(entryId).then(data => {
      if (cancelled) return
      if (data) setEntry(data)
      else setError(true)
    })
    return () => { cancelled = true }
  }, [entryId, fetchJarvisEntry])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  function startEdit() {
    setDraftContent(entry.content_processed || entry.content_raw || '')
    setDraftType(entry.type)
    setDraftTags(parseTags(entry).join(', '))
    setEditing(true)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const tags = draftTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    const updated = await editJarvisEntry(entryId, { content: draftContent.trim(), type: draftType, tags })
    setSaving(false)
    if (updated) {
      setEntry(updated)
      setEditing(false)
      showToast('Entrada corregida', 'success')
    } else {
      showToast('No se pudo corregir la entrada', 'error')
    }
  }

  async function handleForget() {
    if (saving) return
    setSaving(true)
    const ok = await forgetJarvisEntry(entryId)
    setSaving(false)
    if (ok) {
      showToast('Entrada olvidada', 'success')
      onClose()
    } else {
      showToast('No se pudo olvidar la entrada', 'error')
    }
  }

  const color = MEMORY_TYPE_COLORS[entry?.type] || MEMORY_TYPE_COLORS.RAW

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#0a0d1a', border: '1px solid rgba(150,170,255,0.14)', fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(150,170,255,0.14)' }}
        >
          <div className="flex items-center gap-2">
            {entry && (
              <>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="jv-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color }}>{entry.type}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {entry && !editing && (
              <>
                <button
                  onClick={startEdit}
                  title="Corregir"
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'rgba(200,214,255,0.5)' }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirmForget(true)}
                  title="Olvidar"
                  className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'rgba(200,214,255,0.5)' }}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: 'rgba(200,214,255,0.5)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {error && (
            <div style={{ fontSize: 13, color: 'var(--jv-mute)' }}>
              No se pudo cargar la fuente — puede haber sido consolidada o eliminada.
            </div>
          )}
          {!error && !entry && (
            <div style={{ fontSize: 13, color: 'var(--jv-mute)' }}>Cargando…</div>
          )}

          {entry && confirmForget && (
            <div
              style={{
                display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 16px', borderRadius: '4px 12px 12px 12px',
                background: rgba(MEMORY_TYPE_COLORS.PEOPLE, 0.08), border: `1px solid ${rgba(MEMORY_TYPE_COLORS.PEOPLE, 0.28)}`,
              }}
            >
              <p className="text-[13px] leading-relaxed" style={{ color: '#f2ecdd' }}>
                ¿Olvidar esta entrada? Deja de aparecer en búsquedas y consultas, pero queda
                el registro (nunca se borra físicamente).
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmForget(false)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[12px]"
                  style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleForget}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                  style={{ color: '#06070f', background: MEMORY_TYPE_COLORS.PEOPLE }}
                >
                  {saving ? 'Olvidando…' : 'Olvidar'}
                </button>
              </div>
            </div>
          )}

          {entry && editing && (
            <>
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                rows={6}
                autoFocus
                className="w-full rounded-xl px-4 py-3 text-[13px] leading-relaxed resize-none outline-none"
                style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)' }}>TIPO</span>
                <select
                  value={draftType}
                  onChange={e => setDraftType(e.target.value)}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                  style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
                >
                  {MEMORY_TYPE_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="jv-mono" style={{ fontSize: 10, color: 'var(--jv-mute)' }}>TAGS (separados por coma)</span>
                <input
                  value={draftTags}
                  onChange={e => setDraftTags(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
                  style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-[13px]"
                  style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !draftContent.trim()}
                  className="px-5 py-2 rounded-xl text-[13px] font-medium"
                  style={{
                    background: draftContent.trim() && !saving ? 'linear-gradient(120deg,#7dd3fc,#a78bfa)' : 'rgba(150,170,255,0.16)',
                    color: draftContent.trim() && !saving ? '#06070f' : 'rgba(200,214,255,0.5)',
                  }}
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </>
          )}

          {entry && !editing && !confirmForget && (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: '#e9eeff', whiteSpace: 'pre-wrap' }}>
                {entry.content_processed || entry.content_raw}
              </div>
              {parseTags(entry).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {parseTags(entry).map(tag => (
                    <span
                      key={tag}
                      className="jv-mono"
                      style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 999,
                        background: 'rgba(150,170,255,0.08)', color: 'rgba(200,214,255,0.7)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 10, borderTop: '1px solid rgba(150,170,255,0.1)' }}>
                <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)' }}>
                  REGISTRADO {formatAge(entry.recorded_at)}
                </div>
                <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)' }}>
                  ORIGEN {entry.source}
                </div>
                {entry.vault_path && (
                  <div className="jv-mono" style={{ fontSize: 10.5, color: 'var(--jv-mute)' }}>
                    VAULT {entry.vault_path}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
