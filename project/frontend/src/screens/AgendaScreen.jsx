import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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

const VALID_TABS = ['hoy', 'mes', 'tareas', 'revision']

export default function AgendaScreen() {
  const agendaEventoOpen    = useStore(s => s.agendaEventoOpen)
  const closeAgendaEvento   = useStore(s => s.closeAgendaEvento)
  const setAgendaActiveTab  = useStore(s => s.setAgendaActiveTab)

  const location  = useLocation()
  const navigate  = useNavigate()
  const params    = new URLSearchParams(location.search)
  const tabParam  = params.get('tab')
  const initTab   = VALID_TABS.includes(tabParam) ? tabParam : 'hoy'

  const [tab, setTab] = useState(initTab)
  const [facultadOpen, setFacultadOpen] = useState(false)

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setAgendaActiveTab(newTab)
    const sp = new URLSearchParams(location.search)
    sp.set('tab', newTab)
    navigate(`/agenda?${sp.toString()}`, { replace: true })
  }

  // Sync tab if URL changes externally
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const t = p.get('tab')
    if (VALID_TABS.includes(t) && t !== tab) setTab(t)
  }, [location.search])

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar />
      <div
        className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <AgendaTabs active={tab} onChange={handleTabChange} />
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

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {tab === 'hoy'      && <div id="agenda-tab-hoy"      className="contents"><HoyTab /></div>}
        {tab === 'mes'      && <div id="agenda-tab-mes"      className="contents"><MesTab /></div>}
        {tab === 'tareas'   && <div id="agenda-tab-tareas"   className="contents"><TareasTab /></div>}
        {tab === 'revision' && <div id="agenda-tab-revision" className="contents"><RevisionTab /></div>}
      </div>

      {agendaEventoOpen && <EventoModal onClose={closeAgendaEvento} />}
      {facultadOpen     && <HorarioFacultadModal onClose={() => setFacultadOpen(false)} />}
    </div>
  )
}
