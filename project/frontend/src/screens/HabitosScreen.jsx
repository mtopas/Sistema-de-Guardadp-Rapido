import { lazy, Suspense, useState } from 'react'
import { PanelRight } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import TopBar from '../components/TopBar'
import HabitosTabs from '../components/habitos/HabitosTabs'
import HabitosLeftPanel from '../components/habitos/HabitosLeftPanel'
import HoyTab from '../components/habitos/HoyTab'
import HabitosDrawer from '../components/habitos/HabitosDrawer'
import NuevoHabitoModal from '../components/habitos/NuevoHabitoModal'
import { useHabitoContextMenu } from '../components/habitos/useHabitoContextMenu'

// Code-split tabs that are not default
const ProgresoTab  = lazy(() => import('../components/habitos/ProgresoTab'))
const HistorialTab = lazy(() => import('../components/habitos/HistorialTab'))

function TabFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )
}

export default function HabitosScreen() {
  const { habitoModalOpen, closeHabitoModal } = useStore(
    useShallow(s => ({ habitoModalOpen: s.habitoModalOpen, closeHabitoModal: s.closeHabitoModal }))
  )

  const [tab, setTab]               = useState('hoy')
  const [selectedId, setSelectedId] = useState(null)
  const [editingHabito, setEditing] = useState(null)
  const [localModalOpen, setLocal]  = useState(false)
  const [hoyInitialDate, setHoyInitialDate] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { openContextMenu, contextMenuLayer } = useHabitoContextMenu({ selectedId, setSelectedId })

  function handleHeatmapClick(year, month) {
    setHoyInitialDate(new Date(year, month, 1))
    setTab('hoy')
  }

  const modalOpen = habitoModalOpen || localModalOpen

  function handleEdit(habito) { setEditing(habito); setLocal(true) }
  function handleNew()        { setEditing(null);   setLocal(true) }
  function handleCloseModal() { closeHabitoModal(); setLocal(false); setEditing(null) }

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar />

      <div
        className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <HabitosTabs active={tab} onChange={setTab} />
        {/* Drawer button — only on < xl when a habit is selected */}
        {selectedId && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="icon-btn xl:hidden"
            aria-label="Ver detalle del hábito"
            title="Ver detalle"
          >
            <PanelRight size={16} />
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <HabitosLeftPanel
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onNew={handleNew}
          onHabitoContextMenu={openContextMenu}
        />

        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          {tab === 'hoy' && (
            <div id="habitos-tabpanel-hoy" role="tabpanel" className="contents">
              <HoyTab
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                onEdit={handleEdit}
                initialDate={hoyInitialDate}
                onHabitoContextMenu={openContextMenu}
              />
            </div>
          )}
          {tab === 'progreso' && (
            <div id="habitos-tabpanel-progreso" role="tabpanel" className="contents">
              <Suspense fallback={<TabFallback />}>
                <ProgresoTab
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onEdit={handleEdit}
                  onHeatmapClick={handleHeatmapClick}
                  onHabitoContextMenu={openContextMenu}
                />
              </Suspense>
            </div>
          )}
          {tab === 'historial' && (
            <div id="habitos-tabpanel-historial" role="tabpanel" className="contents">
              <Suspense fallback={<TabFallback />}>
                <HistorialTab
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onEdit={handleEdit}
                  onHabitoContextMenu={openContextMenu}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <NuevoHabitoModal habito={editingHabito} onClose={handleCloseModal} />
      )}

      {drawerOpen && selectedId && (
        <HabitosDrawer
          selectedId={selectedId}
          onEdit={handleEdit}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {contextMenuLayer}
    </div>
  )
}
