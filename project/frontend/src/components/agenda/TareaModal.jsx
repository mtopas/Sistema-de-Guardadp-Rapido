import { useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

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

export default function TareaModal({ tarea, defaultListaId, defaultFecha, onClose }) {
  const lang            = useStore(s => s.lang)
  const agendaListas    = useStore(s => s.agendaListas)
  const addAgendaTarea  = useStore(s => s.addAgendaTarea)
  const updateAgendaTarea = useStore(s => s.updateAgendaTarea)
  const deleteAgendaTarea = useStore(s => s.deleteAgendaTarea)

  const [titulo, setTitulo]           = useState(tarea?.titulo || '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion || '')
  const [fecha, setFecha]             = useState(tarea?.fecha_opcional || defaultFecha || '')
  const [hora, setHora]               = useState(tarea?.hora_opcional || '')
  const [duracion, setDuracion]       = useState(tarea?.duracion_estimada || '')
  const [listaId, setListaId]         = useState(tarea?.lista_id || defaultListaId || agendaListas[0]?.id || null)
  const [saving, setSaving]           = useState(false)

  const handleSave = async () => {
    if (!titulo.trim()) return
    setSaving(true)
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      fecha_opcional: fecha || null,
      hora_opcional: hora || null,
      duracion_estimada: duracion ? parseInt(duracion, 10) : null,
      lista_id: listaId,
    }
    if (tarea) {
      await updateAgendaTarea(tarea.id, payload)
    } else {
      await addAgendaTarea(payload)
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl p-6"
        style={{ background: 'var(--panel-bg)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-semibold serif italic">
            {tarea ? 'Editar tarea' : t(lang, 'agendaTareaNueva')}
          </h2>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <input
            style={inputStyle}
            placeholder={t(lang, 'agendaTitulo')}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            autoFocus
          />

          <textarea
            style={{ ...inputStyle, resize: 'none', height: 64 }}
            placeholder={t(lang, 'agendaDescripcion')}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaFechaOpcional')}</div>
              <input type="date" style={inputStyle} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaHoraOpcional')}</div>
              <input type="time" style={inputStyle} value={hora} onChange={e => setHora(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaDuracion')}</div>
            <input
              type="number"
              style={inputStyle}
              placeholder="30"
              value={duracion}
              onChange={e => setDuracion(e.target.value)}
              min={5} max={480}
              onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Lista selector */}
          {agendaListas.length > 0 && (
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaLista')}</div>
              <div className="flex flex-wrap gap-2">
                {agendaListas.map(lista => (
                  <button
                    key={lista.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] transition-all"
                    style={{
                      borderColor: listaId === lista.id ? lista.color : 'var(--border)',
                      background: listaId === lista.id ? `color-mix(in oklch, ${lista.color} 15%, transparent)` : 'transparent',
                      color: 'var(--text)',
                    }}
                    onClick={() => setListaId(lista.id)}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: lista.color }} />
                    {lista.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-5">
          {tarea ? (
            <button
              className="text-[12px] px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
              onClick={() => { deleteAgendaTarea(tarea.id); onClose() }}
            >
              {t(lang, 'agendaEliminar')}
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-xl text-[13px] border"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
              onClick={onClose}
            >
              {t(lang, 'agendaCancelar')}
            </button>
            <button
              className="px-4 py-2 rounded-xl text-[13px] font-medium"
              style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', opacity: !titulo.trim() ? 0.5 : 1 }}
              disabled={!titulo.trim() || saving}
              onClick={handleSave}
            >
              {saving ? 'Guardando…' : t(lang, 'agendaGuardar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
