import { useState } from 'react'
import { useStore } from '../store/useStore'
import { t } from '../utils/i18n'
import TopBar              from '../components/TopBar'
import FinanzasLeftPanel   from '../components/finanzas/FinanzasLeftPanel'
import FinanzasRightPanel  from '../components/finanzas/FinanzasRightPanel'
import DashboardTabs       from '../components/finanzas/DashboardTabs'
import DonutCard           from '../components/finanzas/CategoryDonutCard'
import MovimientosListCard from '../components/finanzas/MovimientosCard'
import CuotasCard          from '../components/finanzas/CuotasCard'
import NotasCard           from '../components/finanzas/NotasCard'
import IncomeExpenseCard   from '../components/finanzas/IncomeExpenseCard'
import SubscriptionsCard   from '../components/finanzas/SubscriptionsCard'
import KPIsCard            from '../components/finanzas/KPIsCard'
import FireProjectionCard  from '../components/finanzas/FireProjectionCard'

function Placeholder() {
  const lang = useStore(s => s.lang)
  return (
    <div className="panel-strong p-10 grid place-items-center" style={{ minHeight: 280 }}>
      <div className="text-center">
        <div className="label mb-2">{t(lang, 'soonAvailable')}</div>
        <div className="serif italic text-[20px] font-semibold gradient-text">
          {t(lang, 'soonAvailable')}…
        </div>
      </div>
    </div>
  )
}

export default function FinanzasScreen() {
  const [tab, setTab]                 = useState('dashboard')
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="hidden md:block h-full">
          <FinanzasLeftPanel />
        </div>

        {/* Center content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4 md:px-6 py-5 panel-scroll">
          <DashboardTabs active={tab} onChange={setTab} />

          {tab === 'dashboard' ? (
            <div className="flex flex-col gap-4">
              {/* Row 1: Two donuts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="anim-card-in" style={{ '--i': 0 }}><DonutCard type="income" /></div>
                <div className="anim-card-in" style={{ '--i': 1 }}><DonutCard type="expense" /></div>
              </div>

              {/* Row 2: Income + Expense movement cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="anim-card-in" style={{ '--i': 2 }}><MovimientosListCard type="income" /></div>
                <div className="anim-card-in" style={{ '--i': 3 }}><MovimientosListCard type="expense" /></div>
              </div>

              {/* Row 3: Cuotas */}
              <div className="anim-card-in" style={{ '--i': 4 }}><CuotasCard /></div>

              {/* Row 4: Notas */}
              <div className="anim-card-in" style={{ '--i': 5 }}><NotasCard /></div>
            </div>
          ) : tab === 'anual' ? (
            <div className="flex flex-col gap-4">
              <div className="anim-card-in" style={{ '--i': 0 }}><IncomeExpenseCard /></div>
              <div className="anim-card-in" style={{ '--i': 1 }}><KPIsCard /></div>
            </div>
          ) : tab === 'fire' ? (
            <div className="anim-card-in" style={{ '--i': 0 }}><FireProjectionCard /></div>
          ) : tab === 'ahorro' ? (
            <div className="flex flex-col gap-4">
              <div className="anim-card-in" style={{ '--i': 0 }}><KPIsCard /></div>
              <div className="anim-card-in" style={{ '--i': 1 }}><SubscriptionsCard /></div>
            </div>
          ) : (
            <div className="anim-card-in"><Placeholder /></div>
          )}

          <div className="h-12" />
        </div>

        {/* Right panel */}
        {tab === 'dashboard' && (
          <div className="hidden xl:block h-full">
            <FinanzasRightPanel />
          </div>
        )}
      </div>
    </div>
  )
}
