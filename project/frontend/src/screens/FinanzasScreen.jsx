import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
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

const TAB_ORDER = ['dashboard', 'anual', 'fire', 'ahorro', 'datos']
/** Sincroniza movimientos del bot sin F5; pausado si estás editando */
const FIN_POLL_MS = 10000

function isFormFieldFocused() {
  const tag = document.activeElement?.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

export default function FinanzasScreen() {
  const setFinActiveTab         = useStore(s => s.setFinActiveTab)
  const clearFinFirePreview     = useStore(s => s.clearFinFirePreview)
  const fetchFinMovimientos     = useStore(s => s.fetchFinMovimientos)
  const fetchFinMovimientosAll  = useStore(s => s.fetchFinMovimientosAll)
  const fetchFinCuentas           = useStore(s => s.fetchFinCuentas)
  const fetchFinCategorias        = useStore(s => s.fetchFinCategorias)
  const openMovement            = useStore(s => s.openMovement)
  const selectedMes             = useStore(s => s.selectedMes)
  const setSelectedMes          = useStore(s => s.setSelectedMes)

  const [tab, setTab]               = useState('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [filterCats, setFilterCats] = useState({ income: null, expense: null })
  const searchRef = useRef(null)

  const setFilterCat = (type, cat) => setFilterCats(prev => ({ ...prev, [type]: cat }))

  // Sync to store so other components (Ctrl+M, atajos) can read it
  const handleTabChange = (t) => {
    if (tab === 'fire' && t !== 'fire') clearFinFirePreview()
    setTab(t)
    setFinActiveTab(t)
  }

  // Refrescar al entrar / poll (no corre si editás o hay foco en un campo)
  const refreshFinData = useCallback(() => {
    if (useStore.getState().finSyncPaused || isFormFieldFocused()) return
    fetchFinMovimientos(selectedMes)
    fetchFinMovimientosAll()
    fetchFinCuentas()
    fetchFinCategorias()
  }, [selectedMes, fetchFinMovimientos, fetchFinMovimientosAll, fetchFinCuentas, fetchFinCategorias])

  // Carga inicial + polling mientras Finanzas está visible (bot, otra ventana, etc.)
  useEffect(() => {
    let intervalId = null

    const stopPoll = () => {
      if (intervalId != null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const startPoll = () => {
      stopPoll()
      if (!useStore.getState().finSyncPaused) {
        fetchFinMovimientos(selectedMes)
        fetchFinMovimientosAll()
        fetchFinCuentas()
        fetchFinCategorias()
      }
      intervalId = setInterval(refreshFinData, FIN_POLL_MS)
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') startPoll()
      else stopPoll()
    }

    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      stopPoll()
    }
  }, [refreshFinData])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Skip if focus is on an input/select/textarea
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openMovement() }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      if (['1','2','3','4','5'].includes(e.key)) { e.preventDefault(); handleTabChange(TAB_ORDER[Number(e.key) - 1]) }
      if (e.key === 'ArrowLeft' && tab === 'dashboard') {
        e.preventDefault()
        const [y, m] = selectedMes.split('-').map(Number)
        const prev = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`
        setSelectedMes(prev)
      }
      if (e.key === 'ArrowRight' && tab === 'dashboard') {
        e.preventDefault()
        const [y, m] = selectedMes.split('-').map(Number)
        const next = m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`
        setSelectedMes(next)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab, selectedMes])

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} searchInputRef={searchRef} />

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
                <div className="anim-card-in" style={{ '--i': 0 }}>
                  <DonutCard type="income" activeCat={filterCats.income} onFilterCat={cat => setFilterCat('income', cat)} />
                </div>
                <div className="anim-card-in" style={{ '--i': 1 }}>
                  <DonutCard type="expense" activeCat={filterCats.expense} onFilterCat={cat => setFilterCat('expense', cat)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="anim-card-in" style={{ '--i': 2 }}>
                  <MovimientosListCard type="income" filterCat={filterCats.income} />
                </div>
                <div className="anim-card-in" style={{ '--i': 3 }}>
                  <MovimientosListCard type="expense" filterCat={filterCats.expense} />
                </div>
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

          {/* Bottom padding for mobile tab bar */}
          <div className="h-16 md:h-12" />
        </div>

        {/* Right panels — visible xl+, bottom sheet lg */}
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

      {/* Bottom sheet panel derecho — lg only (entre md y xl) */}
      <div className="hidden lg:block xl:hidden">
        <Suspense fallback={null}>
          <div
            className="fixed bottom-14 right-4 z-40 w-72 panel-strong anim-card-in overflow-y-auto panel-scroll"
            style={{ maxHeight: '40vh', background: 'var(--surface)', boxShadow: '0 -4px 24px rgba(0,0,0,0.18)' }}
          >
            {tab === 'dashboard' && <FinanzasRightPanel />}
            {tab === 'anual'     && <AnualRightPanel />}
            {tab === 'datos'     && <DatosRightPanel />}
            {tab === 'ahorro'    && <AhorroRightPanel />}
            {tab === 'fire'      && <FireRightPanel />}
          </div>
        </Suspense>
      </div>

      {/* Mobile tabs chip bar — visible < md */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 py-2 border-t"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {TAB_ORDER.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTabChange(t)}
            className="flex-1 py-1.5 mx-0.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--subtext)',
            }}
          >
            {['Dash','Anual','FIRE','Ahorro','Datos'][i]}
          </button>
        ))}
      </div>

      {mobileDrawer && (
        <FinanzasMobileDrawer onClose={() => setMobileDrawer(false)} />
      )}
    </div>
  )
}
