import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BovedaWorkspace from '../components/BovedaWorkspace'
import LeftPanel from '../components/LeftPanel'
import RightPanel from '../components/RightPanel'
import TopBar from '../components/TopBar'

function BovedaLayout({ compact = false }) {
  const navigate = useNavigate()
  const [selectedHojaId, setSelectedHojaId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const openHoja = id => {
    if (compact) navigate(`/hoja/${id}`)
    else setSelectedHojaId(id)
  }

  return (
    <div className="flex flex-col w-full h-full" style={{ background: 'var(--bg)' }}>
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      {compact ? (
        <main className="flex-1 min-h-0 overflow-hidden">
          <BovedaWorkspace searchQuery={searchQuery} selectedHojaId={selectedHojaId} onOpenHoja={openHoja} />
        </main>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[248px_minmax(0,1fr)_344px]">
          <LeftPanel
            searchQuery={searchQuery}
            onOpenHoja={openHoja}
            onHojaDeleted={id => { if (selectedHojaId === id) setSelectedHojaId(null) }}
          />
          <main className="min-w-0 min-h-0 overflow-hidden">
            <BovedaWorkspace
              searchQuery={searchQuery}
              selectedHojaId={selectedHojaId}
              onOpenHoja={openHoja}
              onHojaDeleted={id => { if (selectedHojaId === id) setSelectedHojaId(null) }}
            />
          </main>
          <RightPanel selectedHojaId={selectedHojaId} onSelectHoja={setSelectedHojaId} />
        </div>
      )}
    </div>
  )
}

export default function BrowseScreen() {
  return (
    <>
      <div className="hidden xl:block w-full h-full"><BovedaLayout /></div>
      <div className="xl:hidden flex flex-col h-full"><BovedaLayout compact /></div>
    </>
  )
}
