import { useState, useCallback } from 'react'
import { Copy } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
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

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function EventoModal({ defaultFecha, defaultHora, evento, onClose }) {
  const lang               = useStore(s => s.lang)
  const agendaCalendarios  = useStore(s => s.agendaCalendarios)
  const addAgendaEvento    = useStore(s => s.addAgendaEvento)
  const updateAgendaEvento = useStore(s => s.updateAgendaEvento)
  const deleteAgendaEvento = useStore(s => s.deleteAgendaEvento)
  const showToast          = useStore(s => s.showToast)

  const [titulo, setTitulo]           = useState(evento?.titulo || '')
  const [descripcion, setDescripcion] = useState(evento?.descripcion || '')
  const [fechaInicio, setFechaInicio] = useState(evento?.fecha_inicio?.slice(0, 10) || defaultFecha || '')
  const [horaInicio, setHoraInicio]   = useState(evento?.fecha_inicio?.slice(11, 16) || defaultHora || '')
  const [fechaFin, setFechaFin]       = useState(evento?.fecha_fin?.slice(0, 10) || '')
  const [horaFin, setHoraFin]         = useState(evento?.fecha_fin?.slice(11, 16) || '')
  const [todoElDia, setTodoElDia]     = useState(evento?.todo_el_dia ?? false)
  const [seRepite, setSeRepite]       = useState(evento?.se_repite ?? false)
  const [calId, setCalId]             = useState(evento?.calendario_id || agendaCalendarios[0]?.id || null)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Recurrence state (parsed from regla_repeticion JSON)
  const initRec = evento?.regla_repeticion ? (typeof evento.regla_repeticion === 'string' ? JSON.parse(evento.regla_repeticion) : evento.regla_repeticion) : {}
  const [recFrecuencia, setRecFrecuencia] = useState(initRec.frecuencia || 'semanal')
  const [recDias, setRecDias]             = useState(initRec.dias || [])
  const [recHasta, setRecHasta]           = useState(initRec.hasta || '')

  const toggleDia = (i) => setRecDias(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])

  const handleSave = useCallback(async () => {
    if (!titulo.trim() || !fechaInicio) return
    setSaving(true)
    const fechaInicioFull = todoElDia ? fechaInicio : `${fechaInicio}T${horaInicio || '00:00'}:00`
    const fechaFinFull    = fechaFin
      ? (todoElDia ? fechaFin : `${fechaFin}T${horaFin || '00:00'}:00`)
      : null
    const reglaRep = seRepite
      ? JSON.stringify({ frecuencia: recFrecuencia, dias: recDias, hasta: recHasta || null })
      : null
    const payload = {
      titulo: titulo.trim(), descripcion: descripcion.trim() || null,
      fecha_inicio: fechaInicioFull, fecha_fin: fechaFinFull,
      todo_el_dia: todoElDia, se_repite: seRepite,
      regla_repeticion: reglaRep,
      calendario_id: calId,
    }
    if (evento) {
      await updateAgendaEvento(evento.id, payload)
      showToast(t(lang, 'agendaEventoActualizado'))
    } else {
      await addAgendaEvento(payload)
      showToast(t(lang, 'agendaEventoCreado'))
    }
    setSaving(false)
    onClose()
  }, [titulo, descripcion, fechaInicio, horaInicio, fechaFin, horaFin, todoElDia, seRepite, recFrecuencia, recDias, recHasta, calId, evento, addAgendaEvento, updateAgendaEvento, showToast, lang, onClose])

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteAgendaEvento(evento.id)
    onClose()
  }

  const handleDuplicate = useCallback(async () => {
    const fechaInicioFull = todoElDia ? fechaInicio : `${fechaInicio}T${horaInicio || '00:00'}:00`
    const fechaFinFull    = fechaFin ? (todoElDia ? fechaFin : `${fechaFin}T${horaFin || '00:00'}:00`) : null
    await addAgendaEvento({
      titulo: `${titulo.trim()} (copia)`, descripcion: descripcion.trim() || null,
      fecha_inicio: fechaInicioFull, fecha_fin: fechaFinFull,
      todo_el_dia: todoElDia, se_repite: false, regla_repeticion: null, calendario_id: calId,
    })
    showToast(t(lang, 'agendaDuplicado'))
    onClose()
  }, [titulo, descripcion, fechaInicio, horaInicio, fechaFin, horaFin, todoElDia, calId, addAgendaEvento, showToast, lang, onClose])

  const deleteBtn = evento ? (
    <div className="flex items-center gap-2">
      <button
        className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--subtext)'; e.currentTarget.style.borderColor = 'var(--border)' }}
        onClick={handleDuplicate}
      >
        <Copy size={12} /> {t(lang, 'agendaDuplicar')}
      </button>
      <button
        className="text-[12px] px-3 py-1.5 rounded-lg border transition-colors"
        style={{
          borderColor: confirmDelete ? '#ef4444' : 'var(--border)',
          color: confirmDelete ? '#ef4444' : 'var(--subtext)',
          background: confirmDelete ? 'color-mix(in oklch, #ef4444 10%, transparent)' : 'transparent',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
        onMouseLeave={e => {
          if (!confirmDelete) {
            e.currentTarget.style.color = 'var(--subtext)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }
        }}
        onClick={handleDelete}
      >
        {confirmDelete ? t(lang, 'agendaEliminarSi') : t(lang, 'agendaEliminar')}
      </button>
    </div>
  ) : undefined

  const canSave = titulo.trim() && fechaInicio

  return (
    <AgendaModalShell
      title={evento ? t(lang, 'agendaEditarEvento') : t(lang, 'agendaEventoNuevo')}
      onClose={onClose}
      onSave={canSave ? handleSave : undefined}
      saving={saving}
      deleteBtn={deleteBtn}
    >
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
          style={{ ...inputStyle, resize: 'none', height: 72 }}
          placeholder={t(lang, 'agendaDescripcion')}
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div
            className="w-9 h-5 rounded-full relative transition-colors"
            style={{ background: todoElDia ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={() => setTodoElDia(v => !v)}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
              style={{ left: todoElDia ? '18px' : '2px', background: todoElDia ? 'white' : 'var(--subtext)' }}
            />
          </div>
          <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>{t(lang, 'agendaTodoElDia')}</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaFechaInicio')}</div>
            <input type="date" style={inputStyle} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          {!todoElDia && (
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaHoraLabel')}</div>
              <input type="time" style={inputStyle} value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaFechaFin')}</div>
            <input type="date" style={inputStyle} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
          {!todoElDia && (
            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaHoraFinLabel')}</div>
              <input type="time" style={inputStyle} value={horaFin} onChange={e => setHoraFin(e.target.value)} />
            </div>
          )}
        </div>

        {/* Recurrence */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div
            className="w-9 h-5 rounded-full relative transition-colors"
            style={{ background: seRepite ? 'var(--accent)' : 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={() => setSeRepite(v => !v)}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
              style={{ left: seRepite ? '18px' : '2px', background: seRepite ? 'white' : 'var(--subtext)' }}
            />
          </div>
          <span className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>{t(lang, 'agendaSeRepite')}</span>
        </label>

        {seRepite && (
          <div className="panel-strong rounded-xl p-3 flex flex-col gap-3">
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaRepeticionFrecuencia')}</div>
              <div className="flex gap-2">
                {[
                  ['diario', t(lang, 'agendaRepeticionDiario')],
                  ['semanal', t(lang, 'agendaRepeticionSemanal')],
                  ['mensual', t(lang, 'agendaRepeticionMensual')],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className="px-2.5 py-1 rounded-lg border text-[11.5px] transition-all"
                    style={{
                      borderColor: recFrecuencia === v ? 'var(--accent)' : 'var(--border)',
                      background: recFrecuencia === v ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
                      color: recFrecuencia === v ? 'var(--text)' : 'var(--subtext)',
                    }}
                    onClick={() => setRecFrecuencia(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {recFrecuencia === 'semanal' && (
              <div>
                <div className="text-[11px] mb-1.5" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaRepeticionDias')}</div>
                <div className="flex gap-1.5">
                  {DIAS_SEMANA.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-7 h-7 rounded-full text-[11px] font-medium transition-all border"
                      style={{
                        borderColor: recDias.includes(i) ? 'var(--accent)' : 'var(--border)',
                        background: recDias.includes(i) ? 'var(--accent)' : 'transparent',
                        color: recDias.includes(i) ? 'white' : 'var(--subtext)',
                      }}
                      onClick={() => toggleDia(i)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaRepeticionHasta')}</div>
              <input type="date" style={inputStyle} value={recHasta} onChange={e => setRecHasta(e.target.value)} />
            </div>
          </div>
        )}

        {agendaCalendarios.length > 0 && (
          <div>
            <div className="text-[11px] mb-1" style={{ color: 'var(--subtext)' }}>{t(lang, 'agendaCalendario')}</div>
            <div className="flex flex-wrap gap-2">
              {agendaCalendarios.map(cal => (
                <button
                  key={cal.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] transition-all"
                  style={{
                    borderColor: calId === cal.id ? cal.color : 'var(--border)',
                    background: calId === cal.id ? `color-mix(in oklch, ${cal.color} 15%, transparent)` : 'transparent',
                    color: 'var(--text)',
                  }}
                  onClick={() => setCalId(cal.id)}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: cal.color }} />
                  {cal.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AgendaModalShell>
  )
}
