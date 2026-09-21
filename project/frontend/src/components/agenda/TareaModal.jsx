import { useState, useCallback } from 'react'
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

export default function TareaModal({ tarea, defaultListaId, defaultFecha, onClose }) {
  const lang              = useStore(s => s.lang)
  const agendaListas      = useStore(s => s.agendaListas)
  const addAgendaTarea    = useStore(s => s.addAgendaTarea)
  const updateAgendaTarea = useStore(s => s.updateAgendaTarea)
  const deleteAgendaTarea = useStore(s => s.deleteAgendaTarea)
  const showToast         = useStore(s => s.showToast)

  const [titulo, setTitulo]           = useState(tarea?.titulo || '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion || '')
  const [fecha, setFecha]             = useState(tarea?.fecha_opcional || defaultFecha || '')
  const [hora, setHora]               = useState(tarea?.hora_opcional || '')
  const [duracion, setDuracion]       = useState(tarea?.duracion_estimada || '')
  const [listaId, setListaId]         = useState(tarea?.lista_id || defaultListaId || agendaListas[0]?.id || null)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Recurrencia (2026-09-21) -- solo se ofrece al CREAR una tarea nueva, no al
  // editar una ya existente (no soportamos convertir una tarea en recurrente
  // después ni editar "esta ocurrencia vs toda la serie", ver
  // Cerebro/PROXIMAMENTE.md). Mismo shape de regla que EventoModal.jsx.
  const [seRepite, setSeRepite]           = useState(false)
  const [recFrecuencia, setRecFrecuencia] = useState('semanal')
  const [recDias, setRecDias]             = useState([])
  const [recHasta, setRecHasta]           = useState('')

  const toggleDia = (i) => setRecDias(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])

  const handleSave = useCallback(async () => {
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
    // Recurrencia: solo aplica al crear (!tarea) y solo si hay fecha (no hay
    // desde dónde contar las ocurrencias sin una fecha inicial).
    if (!tarea && seRepite && fecha) {
      payload.se_repite = true
      payload.regla_repeticion = JSON.stringify({ frecuencia: recFrecuencia, dias: recDias, hasta: recHasta || null })
    }
    if (tarea) {
      // El store ya muestra su propio toast de error si el PATCH falla
      // (2026-09-21) -- solo festejamos acá si de verdad se guardó, para no
      // pisar ese aviso con un "actualizada" falso.
      const ok = await updateAgendaTarea(tarea.id, payload)
      if (ok) showToast(t(lang, 'agendaTareaActualizada'))
    } else {
      const { ok } = await addAgendaTarea(payload)
      if (ok) showToast(t(lang, 'agendaTareaCreada'))
    }
    setSaving(false)
    onClose()
  }, [titulo, descripcion, fecha, hora, duracion, listaId, tarea, seRepite, recFrecuencia, recDias, recHasta, addAgendaTarea, updateAgendaTarea, showToast, onClose])

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    deleteAgendaTarea(tarea.id)
    onClose()
  }

  const deleteBtn = tarea ? (
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
  ) : undefined

  return (
    <AgendaModalShell
      title={tarea ? t(lang, 'agendaEditarTarea') : t(lang, 'agendaTareaNueva')}
      onClose={onClose}
      onSave={titulo.trim() ? handleSave : undefined}
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

        {/* Recurrencia -- solo al crear una tarea nueva, y solo tiene sentido
            con fecha elegida (no hay desde dónde contar las ocurrencias). */}
        {!tarea && fecha && (
          <>
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
          </>
        )}

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
    </AgendaModalShell>
  )
}
