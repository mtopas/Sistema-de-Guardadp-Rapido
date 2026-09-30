import { useEffect } from 'react'
import {
  BarChart3, ChevronLeft, ChevronRight, Database, Flame, LayoutDashboard, PiggyBank, Plus,
} from 'lucide-react'
import { Button, IconButton, SkeletonList, Tabs, ThreeCol } from '../../ui/primitives'
import { FinanzasLeftPanel } from './LeftPanel'
import { Dashboard, DashboardRight } from './Dashboard'
import { Anual, AnualRight } from './Anual'
import { Fire, FireRight } from './Fire'
import { Ahorro, AhorroRight } from './Ahorro'
import { Datos, DatosRight } from './Datos'
import { CuentaModal, InstrumentoModal, MovimientoModal, ObjetivoModal, TransaccionModal } from './modals'
import { useFin } from '../../store/fin'
import { monthLabel, shiftMonth, toISOMonth } from '../../lib/dates'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'anual', label: 'Anual', icon: BarChart3 },
  { id: 'fire', label: 'FIRE', icon: Flame },
  { id: 'ahorro', label: 'Ahorro', icon: PiggyBank },
  { id: 'datos', label: 'Datos', icon: Database },
]

export default function FinanzasScreen() {
  const { loaded, tab, setTab, mes, setMes, anio, setAnio, fetchAll, openMov } = useFin()

  useEffect(() => { if (!loaded) fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const centro = { dashboard: <Dashboard />, anual: <Anual />, fire: <Fire />, ahorro: <Ahorro />, datos: <Datos /> }[tab]
  const derecha = { dashboard: <DashboardRight />, anual: <AnualRight />, fire: <FireRight />, ahorro: <AhorroRight />, datos: <DatosRight /> }[tab]

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-2.5">
        <Tabs value={tab} onChange={setTab} items={TABS} />

        {tab === 'dashboard' && (
          <div className="flex items-center gap-1 rounded-xl border border-line px-1 py-0.5" style={{ background: 'color-mix(in srgb, var(--elev) 50%, transparent)' }}>
            <IconButton icon={ChevronLeft} label="Mes anterior" onClick={() => setMes(shiftMonth(mes, -1))} />
            <button
              className="mono min-w-[122px] text-center text-[12.5px] font-medium"
              onClick={() => setMes(toISOMonth())}
              title="Volver al mes actual"
            >
              {monthLabel(mes)}
            </button>
            <IconButton icon={ChevronRight} label="Mes siguiente" onClick={() => setMes(shiftMonth(mes, 1))} />
          </div>
        )}

        {tab === 'anual' && (
          <div className="flex items-center gap-1 rounded-xl border border-line px-1 py-0.5" style={{ background: 'color-mix(in srgb, var(--elev) 50%, transparent)' }}>
            <IconButton icon={ChevronLeft} label="Año anterior" onClick={() => setAnio(anio - 1)} />
            <span className="mono min-w-[58px] text-center text-[12.5px] font-medium">{anio}</span>
            <IconButton icon={ChevronRight} label="Año siguiente" onClick={() => setAnio(anio + 1)} />
          </div>
        )}

        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => openMov()}>Movimiento</Button>
      </div>

      {!loaded ? (
        <div className="px-4"><SkeletonList rows={8} h={58} /></div>
      ) : (
        <ThreeCol left={<FinanzasLeftPanel />} center={centro} right={derecha} />
      )}

      <MovimientoModal />
      <CuentaModal />
      <ObjetivoModal />
      <InstrumentoModal />
      <TransaccionModal />
    </>
  )
}
