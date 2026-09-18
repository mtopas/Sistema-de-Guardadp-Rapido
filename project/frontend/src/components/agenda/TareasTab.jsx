import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle, Edit2, X, Inbox, List, LayoutGrid, Pin, PinOff } from 'lucide-react'

const INBOX_ID = '__inbox__'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { AGENDA_COLORS as COLORS } from '../../utils/agendaColors'
import MiniCalendar from './MiniCalendar'
import TareaModal from './TareaModal'

function ListaItem({ lista, isSelected, onClick, onDelete, onRename, onTogglePin }) {
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
      <div className={`flex items-center gap-0.5 ${lista.pinned ? '' : 'opacity-0 group-hover:opacity-100'}`}>
        <button className="icon-btn" style={{ width: 18, height: 18, color: lista.pinned ? 'var(--accent)' : 'var(--mute)' }}
          onClick={e => { e.stopPropagation(); onTogglePin(lista.id, !lista.pinned) }}>
          {lista.pinned ? <Pin size={10} /> : <PinOff size={10} />}
        </button>
        <button className="icon-btn opacity-0 group-hover:opacity-100" style={{ width: 18, height: 18 }}
          onClick={e => { e.stopPropagation(); setEditing(true) }}>
          <Edit2 size={10} />
        </button>
        <button className="icon-btn opacity-0 group-hover:opacity-100" style={{ width: 18, height: 18, color: 'var(--mute)' }}
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
  const addAgendaTarea    = useStore(s => s.addAgendaTarea)

  const today = new Date()
  const [year, setYear]       = useState(today.getFullYear())
  const [month, setMonth]     = useState(today.getMonth())
  const [selectedListaId, setSelectedListaId] = useState(INBOX_ID)
  const [filtro, setFiltro]   = useState('pendientes') // 'pendientes' | 'completadas' | 'todas'
  const [newListaNombre, setNewListaNombre] = useState('')
  const [addingLista, setAddingLista]       = useState(false)
  const [selectedColor, setSelectedColor]   = useState(COLORS[0])
  const [newTareaOpen, setNewTareaOpen]     = useState(false)
  const [editTarea, setEditTarea]           = useState(null)
  const [viewMode, setViewMode]             = useState('lista') // 'lista' | 'canvas'

  const goMonth = (dir) => {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const tareasLista = agendaTareas
    .filter(t => selectedListaId === INBOX_ID ? !t.fecha_opcional : t.lista_id === selectedListaId)
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

  // Mini calendar event dots (inbox has no dates to show)
  const miniEventDays = {}
  if (selectedListaId !== INBOX_ID) {
    agendaTareas.filter(t => t.lista_id === selectedListaId && t.fecha_opcional).forEach(t => {
      const [y, m, d] = t.fecha_opcional.split('-').map(Number)
      if (y === year && m - 1 === month) {
        if (!miniEventDays[d]) miniEventDays[d] = []
        miniEventDays[d].push(t.lista_color)
      }
    })
  }
  const inboxCount = agendaTareas.filter(t => !t.fecha_opcional && !t.completada).length

  const viewToggle = (
    <div className="flex items-center gap-1 p-1 rounded-xl border shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {[['lista', List, 'agendaVistaLista'], ['canvas', LayoutGrid, 'agendaVistaCanvas']].map(([v, Icon, key]) => (
        <button
          key={v}
          className="px-2.5 py-1 rounded-lg text-[11.5px] flex items-center gap-1.5 transition-all"
          style={{
            background: viewMode === v ? 'var(--bg)' : 'transparent',
            color: viewMode === v ? 'var(--text)' : 'var(--subtext)',
          }}
          onClick={() => setViewMode(v)}
        >
          <Icon size={12} /> {t(lang, key)}
        </button>
      ))}
    </div>
  )

  if (viewMode === 'canvas') {
    return (
      <>
        <TareasCanvas
          lang={lang}
          agendaListas={agendaListas}
          agendaTareas={agendaTareas}
          viewToggle={viewToggle}
          updateAgendaLista={updateAgendaLista}
          updateAgendaTarea={updateAgendaTarea}
          deleteAgendaTarea={deleteAgendaTarea}
          addAgendaTarea={addAgendaTarea}
          onOpenTarea={setEditTarea}
        />
        {editTarea && (
          <TareaModal
            tarea={editTarea}
            onClose={() => setEditTarea(null)}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="px-4 pt-3">{viewToggle}</div>
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
          {/* Inbox virtual entry */}
          <div
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer ${selectedListaId === INBOX_ID ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]'}`}
            onClick={() => setSelectedListaId(INBOX_ID)}
          >
            <Inbox size={13} style={{ color: 'var(--subtext)', flexShrink: 0 }} />
            <span className="flex-1 text-[12.5px]" style={{ color: selectedListaId === INBOX_ID ? 'var(--text)' : 'var(--text-2)' }}>
              {t(lang, 'agendaInbox')}
            </span>
            {inboxCount > 0 && (
              <span className="mono text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--subtext)' }}>
                {inboxCount}
              </span>
            )}
          </div>
          {agendaListas.map(lista => (
            <ListaItem
              key={lista.id}
              lista={lista}
              isSelected={lista.id === selectedListaId}
              onClick={() => setSelectedListaId(lista.id)}
              onDelete={id => {
                if (selectedListaId === id) setSelectedListaId(INBOX_ID)
                deleteAgendaLista(id)
              }}
              onRename={(id, nombre) => updateAgendaLista(id, { nombre })}
              onTogglePin={(id, pinned) => updateAgendaLista(id, { pinned })}
            />
          ))}
        </div>
      </aside>

      {/* Center: task list */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            {selectedListaId === INBOX_ID ? (
              <>
                <Inbox size={15} style={{ color: 'var(--subtext)' }} />
                <h2 className="text-[16px] font-semibold serif italic">{t(lang, 'agendaInbox')}</h2>
              </>
            ) : agendaListas.find(l => l.id === selectedListaId) && (
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
              {t(lang, 'agendaSeleccionaLista')}
            </div>
          ) : tareasLista.length === 0 ? (
            <div className="text-[13px] italic text-center mt-12" style={{ color: 'var(--subtext)' }}>
              {filtro === 'pendientes' ? t(lang, 'agendaSinTareasPendientes') : t(lang, 'agendaSinTareasFiltro')}
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
              <div className="label">{t(lang, 'agendaDetalle')}</div>
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
              <Trash2 size={12} /> {t(lang, 'agendaEliminarTarea')}
            </button>
          </div>
        ) : (
          <div className="text-[12px] italic mt-8 text-center" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'agendaClickTarea')}
          </div>
        )}
      </aside>

      {newTareaOpen && (
        <TareaModal
          defaultListaId={selectedListaId === INBOX_ID ? null : selectedListaId}
          onClose={() => setNewTareaOpen(false)}
        />
      )}
      </div>
    </div>
  )
}

function TareasCanvas({
  lang, agendaListas, agendaTareas, viewToggle,
  updateAgendaLista, updateAgendaTarea, deleteAgendaTarea, addAgendaTarea, onOpenTarea,
}) {
  const pinnedListas = agendaListas.filter(l => l.pinned)
  const otrasListas  = agendaListas.filter(l => !l.pinned)
  const sinFechaTareas = agendaTareas.filter(t => !t.fecha_opcional && !t.completada)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto panel-scroll p-4">
      <div className="mb-4">{viewToggle}</div>

      {pinnedListas.length > 0 && (
        <div className="mb-5">
          <div className="label mb-2 px-1">{t(lang, 'agendaPineadas')}</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {pinnedListas.map(lista => (
              <ListaCard
                key={lista.id}
                lista={lista}
                tareas={agendaTareas.filter(t => t.lista_id === lista.id && !t.completada)}
                onTogglePin={() => updateAgendaLista(lista.id, { pinned: false })}
                onToggleTarea={tarea => updateAgendaTarea(tarea.id, { completada: !tarea.completada })}
                onDeleteTarea={deleteAgendaTarea}
                onOpenTarea={onOpenTarea}
                onAddTarea={titulo => addAgendaTarea({ titulo, lista_id: lista.id })}
                lang={lang}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="label mb-2 px-1">{pinnedListas.length > 0 ? t(lang, 'agendaOtrasListas') : t(lang, 'agendaGestionarListas')}</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {otrasListas.map(lista => (
            <ListaCard
              key={lista.id}
              lista={lista}
              tareas={agendaTareas.filter(t => t.lista_id === lista.id && !t.completada)}
              onTogglePin={() => updateAgendaLista(lista.id, { pinned: true })}
              onToggleTarea={tarea => updateAgendaTarea(tarea.id, { completada: !tarea.completada })}
              onDeleteTarea={deleteAgendaTarea}
              onOpenTarea={onOpenTarea}
              onAddTarea={titulo => addAgendaTarea({ titulo, lista_id: lista.id })}
              lang={lang}
            />
          ))}
          {/* "Sin fecha" -- filtro virtual entre listas, no una lista real: sin color propio,
              sin pin (no hay fila de agenda_listas para persistirlo) y sin quick-add (no hay
              un lista_id natural para una tarea creada desde acá, ver reporte de cierre). */}
          <div className="panel-strong rounded-xl p-3 flex flex-col" style={{ maxHeight: 320 }}>
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <Inbox size={13} style={{ color: 'var(--subtext)' }} />
              <span className="text-[13px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
                {t(lang, 'agendaSinFecha')}
              </span>
              <span className="mono text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--subtext)' }}>
                {sinFechaTareas.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto panel-scroll flex flex-col gap-0.5">
              {sinFechaTareas.length === 0 ? (
                <div className="text-[12px] italic text-center mt-4" style={{ color: 'var(--subtext)' }}>
                  {t(lang, 'agendaSinTareasPendientes')}
                </div>
              ) : sinFechaTareas.map(tarea => (
                <TareaRow
                  key={tarea.id}
                  tarea={tarea}
                  onToggle={tt => updateAgendaTarea(tt.id, { completada: !tt.completada })}
                  onDelete={deleteAgendaTarea}
                  onClick={() => onOpenTarea(tarea)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListaCard({ lista, tareas, onTogglePin, onToggleTarea, onDeleteTarea, onOpenTarea, onAddTarea, lang }) {
  const [nuevoTitulo, setNuevoTitulo] = useState('')

  const submit = () => {
    if (!nuevoTitulo.trim()) return
    onAddTarea(nuevoTitulo.trim())
    setNuevoTitulo('')
  }

  return (
    <div className="panel-strong rounded-xl p-3 flex flex-col" style={{ maxHeight: 320, borderTop: `3px solid ${lista.color}` }}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lista.color }} />
        <span className="text-[13px] font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
          {lista.nombre}
        </span>
        {tareas.length > 0 && (
          <span className="mono text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface)', color: 'var(--subtext)' }}>
            {tareas.length}
          </span>
        )}
        <button className="icon-btn" style={{ width: 18, height: 18, color: lista.pinned ? 'var(--accent)' : 'var(--mute)' }}
          onClick={onTogglePin} title={t(lang, lista.pinned ? 'agendaDespinear' : 'agendaPinear')}>
          {lista.pinned ? <Pin size={11} /> : <PinOff size={11} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto panel-scroll flex flex-col gap-0.5">
        {tareas.length === 0 ? (
          <div className="text-[12px] italic text-center mt-4" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'agendaSinTareasPendientes')}
          </div>
        ) : tareas.map(tarea => (
          <TareaRow
            key={tarea.id}
            tarea={tarea}
            onToggle={onToggleTarea}
            onDelete={onDeleteTarea}
            onClick={() => onOpenTarea(tarea)}
          />
        ))}
      </div>
      <input
        className="mt-2 shrink-0 w-full bg-transparent outline-none text-[12px] border-t pt-2"
        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        placeholder={t(lang, 'agendaTareaRapida')}
        value={nuevoTitulo}
        onChange={e => setNuevoTitulo(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
    </div>
  )
}
