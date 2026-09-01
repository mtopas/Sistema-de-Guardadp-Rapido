import { useEffect } from 'react'
import '../styles/jarvis.css'
import TopBar from '../components/TopBar'
import JarvisNeuralBackground from '../components/jarvis/JarvisNeuralBackground'
import JarvisSubBar from '../components/jarvis/JarvisSubBar'
import JarvisLeftPanel from '../components/jarvis/JarvisLeftPanel'
import JarvisContextPanel from '../components/jarvis/JarvisContextPanel'
import JarvisChat from '../components/jarvis/JarvisChat'
import JarvisBrowsePanel from '../components/jarvis/JarvisBrowsePanel'
import JarvisInboxTab from '../components/jarvis/JarvisInboxTab'
import JarvisEntitiesPanel from '../components/jarvis/JarvisEntitiesPanel'
import JarvisDebugPanel from '../components/jarvis/JarvisDebugPanel'
import JarvisProposalBanner from '../components/jarvis/JarvisProposalBanner'
import { useStore } from '../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { JARVIS_LEFT_WIDTH, JARVIS_RIGHT_WIDTH, JARVIS_POLL_MS } from '../utils/jarvisPalette'

export default function JarvisScreen() {
  const { jarvisTab,
          fetchJarvisTypeCounts, fetchJarvisProjects, fetchJarvisInbox, fetchJarvisBudget,
          fetchJarvisEntities, fetchJarvisHealth, fetchJarvisEvents, fetchJarvisChats,
          fetchJarvisProposals, fetchJarvisAuditProposals } = useStore(
    useShallow(s => ({
      jarvisTab:                  s.jarvisTab,
      fetchJarvisTypeCounts:      s.fetchJarvisTypeCounts,
      fetchJarvisProjects:        s.fetchJarvisProjects,
      fetchJarvisInbox:           s.fetchJarvisInbox,
      fetchJarvisBudget:          s.fetchJarvisBudget,
      fetchJarvisEntities:        s.fetchJarvisEntities,
      fetchJarvisHealth:          s.fetchJarvisHealth,
      fetchJarvisEvents:          s.fetchJarvisEvents,
      fetchJarvisChats:           s.fetchJarvisChats,
      fetchJarvisProposals:       s.fetchJarvisProposals,
      fetchJarvisAuditProposals:  s.fetchJarvisAuditProposals,
    }))
  )

  useEffect(() => {
    document.body.dataset.jarvis = '1'
    return () => { delete document.body.dataset.jarvis }
  }, [])

  useEffect(() => {
    fetchJarvisTypeCounts()
    fetchJarvisProjects()
    fetchJarvisInbox()
    fetchJarvisBudget()
    fetchJarvisEntities()
    fetchJarvisHealth()
    fetchJarvisEvents()
    fetchJarvisChats()
    fetchJarvisProposals()
    fetchJarvisAuditProposals()
    const id = setInterval(() => {
      fetchJarvisTypeCounts()
      fetchJarvisInbox()
      fetchJarvisBudget()
      fetchJarvisEntities()
      fetchJarvisHealth()
      fetchJarvisEvents()
      fetchJarvisProposals()
      fetchJarvisAuditProposals()
    }, JARVIS_POLL_MS)
    return () => clearInterval(id)
  }, [fetchJarvisTypeCounts, fetchJarvisProjects, fetchJarvisInbox, fetchJarvisBudget, fetchJarvisEntities, fetchJarvisHealth, fetchJarvisEvents, fetchJarvisChats, fetchJarvisProposals, fetchJarvisAuditProposals])

  return (
    <div
      className="jv-root"
      style={{ display: 'flex', flexDirection: 'column', '--jv-left-w': `${JARVIS_LEFT_WIDTH}px`, '--jv-right-w': `${JARVIS_RIGHT_WIDTH}px` }}
    >
      <JarvisNeuralBackground />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <TopBar />
        <JarvisSubBar />
        <JarvisProposalBanner />

        {/* Body: 1 columna en mobile, 2 desde md (agrega panel izq), 3 desde xl (agrega panel der) —
            mismo patrón responsive que FinanzasScreen.jsx (hidden md:block / hidden xl:block). */}
        <div
          className="grid grid-cols-1 md:grid-cols-[var(--jv-left-w)_minmax(0,1fr)] xl:grid-cols-[var(--jv-left-w)_minmax(0,1fr)_var(--jv-right-w)]"
          style={{ minHeight: 0, flex: 1 }}
        >
          <div className="hidden md:block h-full"><JarvisLeftPanel /></div>

          <div style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {jarvisTab === 'chat' && <JarvisChat />}
            {jarvisTab === 'browse' && <JarvisBrowsePanel />}
            {jarvisTab === 'inbox' && <JarvisInboxTab />}
            {jarvisTab === 'entities' && <JarvisEntitiesPanel />}
            {jarvisTab === 'debug' && <JarvisDebugPanel />}
          </div>

          <div className="hidden xl:block h-full"><JarvisContextPanel /></div>
        </div>
      </div>
    </div>
  )
}
