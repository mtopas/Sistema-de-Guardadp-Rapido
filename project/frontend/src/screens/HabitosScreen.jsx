import { useState } from 'react'
import { useStore } from '../store/useStore'
import TopBar from '../components/TopBar'
import HabitosTabs from '../components/habitos/HabitosTabs'
import HabitosLeftPanel from '../components/habitos/HabitosLeftPanel'
import HoyTab from '../components/habitos/HoyTab'
import ProgresoTab from '../components/habitos/ProgresoTab'
import HistorialTab from '../components/habitos/HistorialTab'
import NuevoHabitoModal from '../components/habitos/NuevoHabitoModal'

export default function HabitosScreen() {
  const habitoModalOpen  = useStore(s => s.habitoModalOpen)
  const closeHabitoModal = useStore(s => s.closeHabitoModal)

  const [tab, setTab]               = useState('hoy')
  const [selectedId, setSelectedId] = useState(null)
  const [editingHabito, setEditing] = useState(null)
  const [localModalOpen, setLocal]  = useState(false)

  // Modal can be triggered by TopBar CTA (habitoModalOpen) or by "Editar" in right panel
  const modalOpen = habitoModalOpen || localModalOpen

  function handleEdit(habito) {
    setEditing(habito)
    setLocal(true)
  }

  function handleNew() {
    setEditing(null)
    setLocal(true)
  }

  function handleCloseModal() {
    closeHabitoModal()
    setLocal(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col w-full h-full">
      <TopBar />

      {/* Tabs bar */}
      <div
        className="flex items-center px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg)' }}
      >
        <HabitosTabs active={tab} onChange={setTab} />
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel — always visible */}
        <HabitosLeftPanel
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onNew={handleNew}
        />

        {/* Center + Right panel — delegated to each tab */}
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          {tab === 'hoy'       && <HoyTab       selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleEdit} />}
          {tab === 'progreso'  && <ProgresoTab  selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleEdit} />}
          {tab === 'historial' && <HistorialTab selectedId={selectedId} setSelectedId={setSelectedId} onEdit={handleEdit} />}
        </div>
      </div>

      {modalOpen && (
        <NuevoHabitoModal habito={editingHabito} onClose={handleCloseModal} />
      )}
    </div>
  )
}
