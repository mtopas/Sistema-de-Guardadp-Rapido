import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle, ChevronDown, ChevronRight, Edit2, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import MiniCalendar from './MiniCalendar'
import TareaModal from './TareaModal'

const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#ec4899', '#0891b2', '#65a30d']

function ListaItem({ lista, isSelected, onClick, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [nombre, setNombre]   = useState(lista.nombre)

  const save = () => {
    if (nombre.trim() && nombre !== lista.nombre) onRename(lista.id, nombre.trim())
    setEditing(false)
  }

  return (
    <div
      className={`group flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer ${isSelected ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]'}`}
      onClick={onClick}
    >
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lista.color }} />
      {editing ? (
        <input
          className="flex-1 bg-transparent outline-none text-[12.5px] border-b"
          style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          autoFocus
        />
      ) : (
        <span className="flex-1 text-[12.5px] truncate" style={{ color: isSelected ? 'var(--text)' : 'var(--text-2)' }}>
          {lista.nombre}
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button className="icon-btn" style={{ width: 18, height: 18 }}
          onClick={e => { e.stopPropagation(); setEditing(true) }}>
          <Edit2 size={10} />
        </button>
        <button className="icon-btn" style={{ width: 18, height: 18, color: 'var(--mute)' }}
          onClick={e => { e.stopPropagation(); onDelete(lista.id) }}>
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  )
}

function TareaRow({ tarea, onToggle, onDelete, onClick }) {
  return (
    <div
      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg hover:bg-[var(--surface)] cursor-pointer transition-colors"
      onClick={onClick}
    >
      <button
        className="mt-0.5 shrink-0"
        style={{ color: tarea.completada ? 'var(--accent)' : 'var(--mute)' }}
        onClick={e => { e.stopPropagation(); onToggle(tarea) }}
      >
        {tarea.completada ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-medium"
          style={{
            color: 'var(--text)',
            textDecoration: tarea.completada ? 'line-through' : 'none',
            opacity: tarea.completada ? 0.5 : 1,
          }}
        >
          {tarea.titulo}
        </div>
        {tarea.descripcion && (
          <div className="text-[11.5px] mt-0.5 line-clamp-1" style={{ color: 'var(--subtext)' }}>
            {tarea.descripcion}
          </div>
        )}
        {tarea.fecha_opcional && (
          <div className="mono text-[10.5px] mt-0.5" style={{ color: 'var(--subtext)' }}>
            {new Date(tarea.fecha_opcional + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
            {tarea.hora_opcional && ` · ${tarea.hora_opcional}`}
          </div>
        )}
      </div>
      <button
        className="icon-btn opacity-0 group-hover:opacity-100 mt-0.5 shrink-0"
        style={{ width: 22, height: 22, color: 'var(--mute)' }}
        onClick={e => { e.stopPropagation(); onDelete(tarea.id) }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export default function TareasTab() {
  const lang              = useStore(s => s.lang)
  const agendaListas      = useStore(s => s.agendaListas)
  const agendaTareas      = useStore(s => s.agendaTareas)
  const addAgendaLista    = useStore(s => s.addAgendaLista)
  const updateAgendaLista = useStore(s => s.updateAgendaLista)
  const deleteAgendaLista = useStore(s => s.deleteAgendaLista)
  const updateAgendaTarea = useStore(s => s.updateAgendaTarea)
  const deleteAgendaTarea = useStore(s => s.deleteAgendaTarea)

  const today = new Date()
  const [year, setYear]       = useState(today.getFullYear())
  const [month, setMonth]     = useState(today.getMonth())
  const [selectedListaId, setSelectedListaId] = useState(agendaListas[0]?.id ?? null)
  const [filtro, setFiltro]   = useState('pendientes') // 'pendientes' | 'completadas' | 'todas'
  const [newListaNombre, setNewListaNombre] = useState('')
  const [addingLista, setAddingLista]       = useState(false)
  const [selectedColor, setSelectedColor]   = useState(COLORS[0])
  const [newTareaOpen, setNewTareaOpen]     = useState(false)
  const [editTarea, setEditTarea]           = useState(null)

  const goMonth = (dir) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const tareasLista = agendaTareas
    .filter(t => t.lista_id === selectedListaId)
    .filter(t => {
      if (filtro === 'pendientes') return !t.completada
      if (filtro === 'completadas') return t.completada
      return true
    })

  const handleCreateLista = async () => {
    if (!newListaNombre.trim()) return
    const data = await addAgendaLista({ nombre: newListaNombre.trim(), color: selectedColor })
    setSelectedListaId(data.id)
    setNewListaNombre('')
    setAddingLista(false)
  }

  // Mini calendar event dots
  const miniEventDays = {}
  agendaTareas.filter(t => t.lista_id === selectedListaId && t.fecha_opcional).forEach(t => {
    const [y, m, d] = t.fecha_opcional.split('-').map(Number)
    if (y === year && m - 1 === month) {
      if (!miniEventDays[d]) miniEventDays[d] = []
      miniEventDays[d].push(t.lista_color)
    }
  })

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel: lists */}
      <aside className="w-[260px] shrink-0 flex flex-col h-full overflow-y-auto panel-scroll border-r p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="panel-strong p-3 mb-4">
          <MiniCalendar year={year} month={month} onMonthChange={goMonth} eventDays={miniEventDays} />
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <div className="label">{t(lang, 'agendaGestionarListas')}</div>
          <button
            className="text-[10.5px] flex items-center gap-1"
            style={{ color: 'var(--accent)' }}
            onClick={() => setAddingLista(true)}
          >
            <Plus size={11} /> {t(lang, 'agendaNuevaLista')}
          </button>
        </div>

        {addingLista && (
          <div className="panel-strong rounded-xl p-3 mb-3">
            <input
              className="w-full bg-transparent outline-none text-[12.5px] border-b mb-2 pb-1"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              placeholder={t(lang, 'agendaListaNombre')}
              value={newListaNombre}
              onChange={e => setNewListaNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateLista() }}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  className="w-5 h-5 rounded-full transition-transform"
                  style={{
                    background: c,
                    outline: selectedColor === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                    transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn flex-1 text-[11px]" onClick={handleCreateLista}>{t(lang, 'agendaGuardar')}</button>
              <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setAddingLista(false)}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          {agendaListas.map(lista => (
            <ListaItem
              key={lista.id}
              lista={lista}
              isSelected={lista.id === selectedListaId}
              onClick={() => setSelectedListaId(lista.id)}
              onDelete={id => {
                if (selectedListaId === id) setSelectedListaId(agendaListas.find(l => l.id !== id)?.id ?? null)
                deleteAgendaLista(id)
              }}
              onRename={(id, nombre) => updateAgendaLista(id, { nombre })}
            />
          ))}
        </div>
      </aside>

      {/* Center: task list */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            {agendaListas.find(l => l.id === selectedListaId) && (
              <>
                <span className="w-3 h-3 rounded-full" style={{ background: agendaListas.find(l => l.id === selectedListaId)?.color }} />
                <h2 className="text-[16px] font-semibold serif italic">
                  {agendaListas.find(l => l.id === selectedListaId)?.nombre}
                </h2>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              {[['pendientes', t(lang, 'agendaPendientes')], ['completadas', t(lang, 'agendaCompletadas')], ['todas', t(lang, 'agendaTodas')]].map(([v, label]) => (
                <button
                  key={v}
                  className="px-2.5 py-1 rounded-lg text-[11.5px] transition-all"
                  style={{
                    background: filtro === v ? 'var(--bg)' : 'transparent',
                    color: filtro === v ? 'var(--text)' : 'var(--subtext)',
                  }}
                  onClick={() => setFiltro(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn flex items-center gap-1.5 text-[12.5px]"
              onClick={() => setNewTareaOpen(true)}
              disabled={!selectedListaId}
            >
              <Plus size={13} /> {t(lang, 'agendaTareaNueva')}
            </button>
          </div>
        </div>

        {/* Tasks */}
        <div className="flex-1 overflow-y-auto panel-scroll px-4 py-3">
          {!selectedListaId ? (
            <div className="text-[13px] italic text-center mt-12" style={{ color: 'var(--subtext)' }}>
              Seleccioná una lista
            </div>
          ) : tareasLista.length === 0 ? (
            <div className="text-[13px] italic text-center mt-12" style={{ color: 'var(--subtext)' }}>
              {filtro === 'pendientes' ? 'Sin tareas pendientes' : 'Sin tareas en este filtro'}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {tareasLista.map(tarea => (
                <TareaRow
                  key={tarea.id}
                  tarea={tarea}
                  onToggle={t => updateAgendaTarea(t.id, { completada: !t.completada })}
                  onDelete={deleteAgendaTarea}
                  onClick={() => setEditTarea(tarea)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: tarea detail */}
      <aside className="hidden xl:flex flex-col w-[280px] shrink-0 h-full overflow-y-auto panel-scroll border-l p-4" style={{ borderColor: 'var(--border)' }}>
        {editTarea ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="label">Detalle</div>
              <button className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => setEditTarea(null)}>
                <X size={12} />
              </button>
            </div>
            <div className="panel-strong p-3 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <button
                  style={{ color: editTarea.completada ? 'var(--accent)' : 'var(--mute)' }}
                  onClick={() => {
                    const upd = { completada: !editTarea.completada }
                    updateAgendaTarea(editTarea.id, upd)
                    setEditTarea(t => ({ ...t, ...upd }))
                  }}
                >
                  {editTarea.completada ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <span className="text-[14px] font-semibold">{editTarea.titulo}</span>
              </div>
              {editTarea.descripcion && (
                <p className="text-[12.5px] mb-3" style={{ color: 'var(--text-2)' }}>{editTarea.descripcion}</p>
              )}
              {editTarea.fecha_opcional && (
                <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--subtext)' }}>
                  <span>📅</span>
                  <span className="mono">{editTarea.fecha_opcional}
                    {editTarea.hora_opcional && ` · ${editTarea.hora_opcional}`}
                  </span>
                </div>
              )}
              {editTarea.duracion_estimada && (
                <div className="mono text-[11px] mt-1.5" style={{ color: 'var(--mute)' }}>
                  ⏱ {editTarea.duracion_estimada} min
                </div>
              )}
            </div>
            <button
              className="mt-3 flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-colors w-full justify-center"
              style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
              onClick={() => { deleteAgendaTarea(editTarea.id); setEditTarea(null) }}
            >
              <Trash2 size={12} /> Eliminar tarea
            </button>
          </div>
        ) : (
          <div className="text-[12px] italic mt-8 text-center" style={{ color: 'var(--subtext)' }}>
            Hacé clic en una tarea para ver el detalle
          </div>
        )}
      </aside>

      {newTareaOpen && (
        <TareaModal
          defaultListaId={selectedListaId}
          onClose={() => setNewTareaOpen(false)}
        />
      )}
    </div>
  )
}
