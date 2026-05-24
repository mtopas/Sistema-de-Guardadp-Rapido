import { lazy, Suspense, useEffect, useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import FinanzasMobileDrawer from '../components/finanzas/FinanzasMobileDrawer'
import TopBar              from '../components/TopBar'
import FinanzasLeftPanel   from '../components/finanzas/FinanzasLeftPanel'
import FinanzasRightPanel  from '../components/finanzas/FinanzasRightPanel'
import DashboardTabs       from '../components/finanzas/DashboardTabs'
import DonutCard           from '../components/finanzas/CategoryDonutCard'
import MovimientosListCard from '../components/finanzas/MovimientosCard'
import CuotasCard          from '../components/finanzas/CuotasCard'
import NotasCard           from '../components/finanzas/NotasCard'

// Code-split the heavier tabs
const AnualTab        = lazy(() => import('../components/finanzas/AnualTab'))
const AnualRightPanel = lazy(() => import('../components/finanzas/AnualRightPanel'))
const FireTab         = lazy(() => import('../components/finanzas/FireTab'))
const FireRightPanel  = lazy(() => import('../components/finanzas/FireRightPanel'))
const AhorroTab       = lazy(() => import('../components/finanzas/AhorroTab'))
const AhorroRightPanel = lazy(() => import('../components/finanzas/AhorroRightPanel'))
const DatosTab        = lazy(() => import('../components/finanzas/DatosTab'))
const DatosRightPanel = lazy(() => import('../components/finanzas/DatosRightPanel'))

function TabFallback() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )
}

export default function FinanzasScreen() {
  const setFinActiveTab         = useStore(s => s.setFinActiveTab)
  const fetchFinMovimientosAll  = useStore(s => s.fetchFinMovimientosAll)

  const [tab, setTab]               = useState('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileDrawer, setMobileDrawer] = useState(false)

  // Sync to store so other components (Ctrl+M, atajos) can read it
  const handleTabChange = (t) => { setTab(t); setFinActiveTab(t) }

  // Prefetch full history on mount (lazy loading was causing delay on first Datos/Anual visit)
  useEffect(() => { fetchFinMovimientosAll() }, [])

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="flex flex-1 min-h-0">
        {/* Left panel — hidden on mobile, visible md+ */}
        <div className="hidden md:block h-full">
          <FinanzasLeftPanel />
        </div>

        {/* Center content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4 md:px-6 py-5 panel-scroll">
          {/* Mobile: resumen button */}
          <button
            onClick={() => setMobileDrawer(true)}
            className="md:hidden mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-[12.5px] font-medium w-full"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          >
            <BarChart2 size={14} style={{ color: 'var(--accent)' }} />
            Ver resumen y cuentas
          </button>

          <DashboardTabs
            active={tab}
            onChange={handleTabChange}
            hideSelector={tab === 'datos' || tab === 'ahorro' || tab === 'fire'}
            yearOnly={tab === 'anual'}
          />

          {tab === 'dashboard' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="anim-card-in" style={{ '--i': 0 }}><DonutCard type="income" /></div>
                <div className="anim-card-in" style={{ '--i': 1 }}><DonutCard type="expense" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="anim-card-in" style={{ '--i': 2 }}><MovimientosListCard type="income" /></div>
                <div className="anim-card-in" style={{ '--i': 3 }}><MovimientosListCard type="expense" /></div>
              </div>
              <div className="anim-card-in" style={{ '--i': 4 }}><CuotasCard /></div>
              <div className="anim-card-in" style={{ '--i': 5 }}><NotasCard /></div>
            </div>
          )}

          {tab === 'anual' && (
            <Suspense fallback={<TabFallback />}>
              <div className="anim-card-in"><AnualTab /></div>
            </Suspense>
          )}
          {tab === 'fire' && (
            <Suspense fallback={<TabFallback />}>
              <div className="anim-card-in" style={{ '--i': 0 }}><FireTab /></div>
            </Suspense>
          )}
          {tab === 'ahorro' && (
            <Suspense fallback={<TabFallback />}>
              <div className="anim-card-in" style={{ '--i': 0 }}><AhorroTab /></div>
            </Suspense>
          )}
          {tab === 'datos' && (
            <Suspense fallback={<TabFallback />}>
              <div className="anim-card-in"><DatosTab /></div>
            </Suspense>
          )}

          <div className="h-12" />
        </div>

        {/* Right panels */}
        {tab === 'dashboard' && (
          <div className="hidden xl:block h-full"><FinanzasRightPanel /></div>
        )}
        {tab === 'anual' && (
          <Suspense fallback={null}>
            <div className="hidden xl:block h-full"><AnualRightPanel /></div>
          </Suspense>
        )}
        {tab === 'datos' && (
          <Suspense fallback={null}>
            <div className="hidden xl:block h-full"><DatosRightPanel /></div>
          </Suspense>
        )}
        {tab === 'ahorro' && (
          <Suspense fallback={null}>
            <div className="hidden xl:block h-full"><AhorroRightPanel /></div>
          </Suspense>
        )}
        {tab === 'fire' && (
          <Suspense fallback={null}>
            <div className="hidden xl:block h-full"><FireRightPanel /></div>
          </Suspense>
        )}
      </div>

      {mobileDrawer && (
        <FinanzasMobileDrawer onClose={() => setMobileDrawer(false)} />
      )}
    </div>
  )
}
