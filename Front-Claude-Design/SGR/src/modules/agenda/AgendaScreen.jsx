import { useEffect } from 'react'
import { CalendarClock, CalendarDays, ClipboardCheck, GraduationCap, ListPlus, Plus } from 'lucide-react'
import { Button, SkeletonList, Tabs, ThreeCol } from '../../ui/primitives'
import { Hoy, HoyLeft } from './Hoy'
import { Mes, MesLeft, MesRight } from './Mes'
import { Tareas, TareasLeft, TareasRight } from './Tareas'
import { Revision } from './Revision'
import { CalendarioModal, EventoModal, FacultadModal, ListaModal, TareaModal } from './modals'
import { useAgenda } from '../../store/agenda'
import { useHabitos } from '../../store/habitos'
import { addMonths, toISODate } from '../../lib/dates'

const TABS = [
  { id: 'hoy', label: 'HOY', icon: CalendarClock },
  { id: 'mes', label: 'Mes', icon: CalendarDays },
  { id: 'tareas', label: 'Tareas', icon: ListPlus },
  { id: 'revision', label: 'Revisión', icon: ClipboardCheck },
]

export default function AgendaScreen() {
  const { loaded, tab, setTab, dia, fetchBase, ensureRange, openEvento, openTarea, openFacultad } = useAgenda()
  const habitosLoaded = useHabitos((s) => s.loaded)
  const fetchHabitos = useHabitos((s) => s.fetchAll)

  useEffect(() => {
    if (!loaded) fetchBase()
    // Hábitos se integran en HOY, así que se cargan también desde acá.
    if (!habitosLoaded) fetchHabitos()
    ensureRange(toISODate(addMonths(new Date(), -1)), toISODate(addMonths(new Date(), 3)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cols = {
    hoy: { left: <HoyLeft />, center: <Hoy />, right: null },
    mes: { left: <MesLeft />, center: <Mes />, right: <MesRight /> },
    tareas: { left: <TareasLeft />, center: <Tareas />, right: <TareasRight /> },
    revision: { left: null, center: <Revision />, right: null },
  }[tab]

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2.5">
        <Tabs value={tab} onChange={setTab} items={TABS} />
        <Button size="sm" icon={GraduationCap} onClick={openFacultad}>Facultad</Button>
        <div className="ml-auto flex gap-2">
          <Button icon={ListPlus} onClick={() => openTarea({ fecha: tab === 'hoy' ? dia : undefined })}>Tarea</Button>
          <Button variant="primary" icon={Plus} onClick={() => openEvento({ fecha: dia })}>Evento</Button>
        </div>
      </div>

      {!loaded ? (
        <div className="px-4"><SkeletonList rows={8} h={58} /></div>
      ) : (
        <ThreeCol left={cols.left} center={cols.center} right={cols.right} />
      )}

      <EventoModal />
      <TareaModal />
      <CalendarioModal />
      <ListaModal />
      <FacultadModal />
    </>
  )
}
