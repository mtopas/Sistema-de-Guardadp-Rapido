import { useState, useEffect } from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

const DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  outline: 'none',
}

function HorarioRow({ hf, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg panel-strong">
      <span className="text-[12px] w-16 shrink-0" style={{ color: 'var(--subtext)' }}>{DIAS_ES[hf.dia_semana]}</span>
      <span className="mono text-[11.5px] w-24 shrink-0" style={{ color: 'var(--text-2)' }}>
        {hf.hora_inicio} – {hf.hora_fin}
      </span>
      <span className="flex-1 text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{hf.materia}</span>
      {hf.descripcion && (
        <span className="text-[11px] truncate max-w-[100px]" style={{ color: 'var(--mute)' }}>{hf.descripcion}</span>
      )}
      <button
        className="icon-btn shrink-0"
        style={{ width: 22, height: 22, color: 'var(--mute)' }}
        onClick={() => onDelete(hf.id)}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

export default function HorarioFacultadModal({ onClose }) {
  const lang                     = useStore(s => s.lang)
  const agendaHorarioFacultad    = useStore(s => s.agendaHorarioFacultad)
  const addAgendaHorarioFacultad = useStore(s => s.addAgendaHorarioFacultad)
  const deleteAgendaHorarioFacultad = useStore(s => s.deleteAgendaHorarioFacultad)

  const [form, setForm] = useState({
    dia_semana: 0, hora_inicio: '09:00', hora_fin: '11:00', materia: '', descripcion: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleAdd = async () => {
    if (!form.materia.trim()) return
    setSaving(true)
    await addAgendaHorarioFacultad({ ...form, materia: form.materia.trim(), descripcion: form.descripcion.trim() || null })
    setForm(f => ({ ...f, materia: '', descripcion: '' }))
    setSaving(false)
  }

  const sorted = [...agendaHorarioFacultad].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl p-6"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold serif italic">{t(lang, 'agendaFacultad')}</h2>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose}><X size={14} /></button>
        </div>

        {/* Add form */}
        <div className="panel-strong rounded-xl p-4 mb-5">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaDiaSemana')}</div>
              <select
                style={inputStyle}
                value={form.dia_semana}
                onChange={e => setForm(f => ({ ...f, dia_semana: parseInt(e.target.value) }))}
              >
                {DIAS_ES.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaMateria')}</div>
              <input
                style={inputStyle}
                value={form.materia}
                onChange={e => setForm(f => ({ ...f, materia: e.target.value }))}
                placeholder="Ej: Álgebra II"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaHoraInicio')}</div>
              <input type="time" style={inputStyle} value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaHoraFin')}</div>
              <input type="time" style={inputStyle} value={form.hora_fin} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaAula')}</div>
              <input
                style={inputStyle}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Aula 3"
              />
            </div>
          </div>
          <button
            className="btn flex items-center gap-1.5 text-[12px]"
            disabled={!form.materia.trim() || saving}
            onClick={handleAdd}
          >
            <Plus size={12} /> {t(lang, 'agendaNuevaMateria')}
          </button>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2">
          {sorted.length === 0 ? (
            <div className="text-[12px] italic text-center py-4" style={{ color: 'var(--subtext)' }}>
              Sin materias cargadas
            </div>
          ) : (
            sorted.map(hf => (
              <HorarioRow key={hf.id} hf={hf} onDelete={deleteAgendaHorarioFacultad} />
            ))
          )}
        </div>

        <div className="flex justify-end mt-5">
          <button
            className="px-4 py-2 rounded-xl text-[13px] font-medium"
            style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)' }}
            onClick={onClose}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
