import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import JarvisProposalBanner from './JarvisProposalBanner'
import { JARVIS_POLL_MS } from '../../utils/jarvisPalette'

// Montado globalmente en App.jsx (mismo patrón que AgendaNotificationWatcher)
// -- la captura pasiva se dispara por INACTIVIDAD de la conversación, así que
// el usuario típicamente ya no está en /jarvis cuando la propuesta aparece.
// Antes de esto, fetchJarvisProposals()/fetchJarvisAuditProposals() solo se
// llamaban desde JarvisScreen.jsx: si el usuario no volvía a esa pantalla
// dentro de la ventana de expiración, nunca la veía. Ver auditoría
// 2026-09-24 en Cerebro/estado-actual.md.
export default function JarvisProposalWatcher() {
  const location = useLocation()
  const isJarvis = location.pathname.startsWith('/jarvis')

  const { fetchJarvisProposals, fetchJarvisAuditProposals } = useStore(
    useShallow(s => ({
      fetchJarvisProposals:      s.fetchJarvisProposals,
      fetchJarvisAuditProposals: s.fetchJarvisAuditProposals,
    }))
  )

  useEffect(() => {
    fetchJarvisProposals()
    fetchJarvisAuditProposals()
    const id = setInterval(() => {
      fetchJarvisProposals()
      fetchJarvisAuditProposals()
    }, JARVIS_POLL_MS)
    return () => clearInterval(id)
  }, [fetchJarvisProposals, fetchJarvisAuditProposals])

  // En /jarvis, JarvisScreen ya renderiza el banner inline bajo el SubBar --
  // no duplicarlo acá, solo aportar el polling.
  if (isJarvis) return null

  return (
    <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto w-full md:w-auto">
        <JarvisProposalBanner />
      </div>
    </div>
  )
}
