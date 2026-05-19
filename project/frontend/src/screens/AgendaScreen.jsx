import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useStore } from '../store/useStore'
import TopBar from '../components/TopBar'
import AgendaTabs from '../components/agenda/AgendaTabs'
import HoyTab from '../components/agenda/HoyTab'
import MesTab from '../components/agenda/MesTab'
import TareasTab from '../components/agenda/TareasTab'
import RevisionTab from '../components/agenda/RevisionTab'
import EventoModal from '../components/agenda/EventoModal'
import HorarioFacultadModal from '../components/agenda/HorarioFacultadModal'

export default function AgendaScreen() {
  const agendaEventoOpen  = useStore(s => s.agendaEventoOpen)
  const closeAgendaEvento = useStore(s => s.closeAgendaEvento)

  const [tab, setTab]             = useState('hoy')
  const [facultadOpen, setFacultadOpen] = useState(false)

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar />

      {/* Tabs bar */}
      <div
        className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <AgendaTabs active={tab} onChange={setTab} />

        <button
          className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--subtext)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.color = '#059669' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--subtext)' }}
          onClick={() => setFacultadOpen(true)}
        >
          <GraduationCap size={13} />
          Facultad
        </button>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {tab === 'hoy'      && <HoyTab />}
        {tab === 'mes'      && <MesTab />}
        {tab === 'tareas'   && <TareasTab />}
        {tab === 'revision' && <RevisionTab />}
      </div>

      {agendaEventoOpen && <EventoModal onClose={closeAgendaEvento} />}
      {facultadOpen     && <HorarioFacultadModal onClose={() => setFacultadOpen(false)} />}
    </div>
  )
}
