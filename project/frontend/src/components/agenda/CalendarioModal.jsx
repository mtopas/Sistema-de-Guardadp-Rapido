import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { AGENDA_COLORS } from '../../utils/agendaColors'
import AgendaModalShell from './AgendaModalShell'

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  width: '100%',
  outline: 'none',
}

export default function CalendarioModal({ calendario, onClose }) {
  const lang                    = useStore(s => s.lang)
  const agendaCalendarios       = useStore(s => s.agendaCalendarios)
  const addAgendaCalendario     = useStore(s => s.addAgendaCalendario)
  const updateAgendaCalendario  = useStore(s => s.updateAgendaCalendario)
  const deleteAgendaCalendario  = useStore(s => s.deleteAgendaCalendario)
  const reasignarEventosAgendaCalendario = useStore(s => s.reasignarEventosAgendaCalendario)
  const showToast                = useStore(s => s.showToast)

  const [nombre, setNombre]     = useState(calendario?.nombre || '')
  const [color, setColor]       = useState(calendario?.color || AGENDA_COLORS[0])
  const [saving, setSaving]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteMode, setDeleteMode]       = useState('borrar') // 'borrar' | 'mover'

  const otrosCalendarios = agendaCalendarios.filter(c => c.id !== calendario?.id)
  const [destinoId, setDestinoId] = useState(otrosCalendarios[0]?.id ?? null)

  const handleSave = async () => {
    if (!nombre.trim()) return
    setSaving(true)
    if (calendario) {
      await updateAgendaCalendario(calendario.id, { nombre: nombre.trim(), color })
      showToast(t(lang, 'agendaCalendarioActualizado'))
    } else {
      await addAgendaCalendario({ nombre: nombre.trim(), color })
      showToast(t(lang, 'agendaCalendarioCreado'))
    }
    setSaving(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    if (deleteMode === 'mover' && destinoId) {
      await reasignarEventosAgendaCalendario(calendario.id, destinoId)
    }
    await deleteAgendaCalendario(calendario.id)
    showToast(t(lang, 'agendaCalendarioEliminado'))
    onClose()
  }

  const deleteBtn = calendario ? (
    <div className="flex flex-col gap-2 items-start">
      {confirmDelete && otrosCalendarios.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 text-[11.5px]" style={{ color: 'var(--subtext)' }}>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={deleteMode === 'borrar'} onChange={() => setDeleteMode('borrar')} />
            {t(lang, 'agendaCalBorrarEventos')}
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={deleteMode === 'mover'} onChange={() => setDeleteMode('mover')} />
            {t(lang, 'agendaCalMoverEventos')}
          </label>
          {deleteMode === 'mover' && (
            <select
              value={destinoId ?? ''}
              onChange={e => setDestinoId(Number(e.target.value))}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11.5, padding: '2px 6px' }}
            >
              {otrosCalendarios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
        </div>
      )}
      <button
        className="text-[12px] px-3 py-1.5 rounded-lg border transition-colors"
        style={{
          borderColor: confirmDelete ? '#ef4444' : 'var(--border)',
          color: confirmDelete ? '#ef4444' : 'var(--subtext)',
          background: confirmDelete ? 'color-mix(in oklch, #ef4444 10%, transparent)' : 'transparent',
        }}
        onClick={handleDelete}
      >
        {confirmDelete ? t(lang, 'agendaEliminarSi') : t(lang, 'agendaEliminar')}
      </button>
    </div>
  ) : undefined

  return (
    <AgendaModalShell
      title={calendario ? t(lang, 'agendaEditarCalendario') : t(lang, 'agendaCalendarioNuevo')}
      onClose={onClose}
      onSave={nombre.trim() ? handleSave : undefined}
      saving={saving}
      deleteBtn={deleteBtn}
    >
      <div className="flex flex-col gap-3">
        <input
          style={inputStyle}
          placeholder={t(lang, 'agendaListaNombre')}
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          autoFocus
        />
        <div>
          <div className="text-[11px] mb-1.5" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaListaColor')}</div>
          <div className="flex flex-wrap gap-1.5">
            {AGENDA_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className="w-6 h-6 rounded-full transition-transform"
                style={{
                  background: c,
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: 2,
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </div>
    </AgendaModalShell>
  )
}
