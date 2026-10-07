import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore'

const Layout = lazy(() => import('./components/Layout'))
const BrowseScreen = lazy(() => import('./screens/BrowseScreen'))
const CaptureScreen = lazy(() => import('./screens/CaptureScreen'))
const DetailScreen = lazy(() => import('./screens/DetailScreen'))
const FinanzasScreen = lazy(() => import('./screens/FinanzasScreen'))
const AgendaScreen = lazy(() => import('./screens/AgendaScreen'))
const HabitosScreen = lazy(() => import('./screens/HabitosScreen'))
const JarvisScreen = lazy(() => import('./screens/JarvisScreen'))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const MobileHoyScreen = lazy(() => import('./screens/MobileHoyScreen'))

const Toast = lazy(() => import('./components/Toast'))
const TweaksPanel = lazy(() => import('./components/TweaksPanel'))
const CaptureModal = lazy(() => import('./components/CaptureModal'))
const FeedbackModal = lazy(() => import('./components/FeedbackModal'))
const MovementModal = lazy(() => import('./components/finanzas/MovementModal'))
const JarvisCaptureModal = lazy(() => import('./components/jarvis/JarvisCaptureModal'))
const AgendaNotificationWatcher = lazy(() => import('./components/AgendaNotificationWatcher'))
const JarvisProposalWatcher = lazy(() => import('./components/jarvis/JarvisProposalWatcher'))

function LoadingScreen() {
  return <div className="min-h-[100dvh] bg-[#f4f0e5]" />
}

/** Carga por ruta. /mobile queda deliberadamente fuera de este componente. */
function RouteDataLoader() {
  const path = useLocation().pathname

  useEffect(() => {
    const store = useStore.getState()

    if (path === '/' || path === '/capture' || path.startsWith('/hoja/')) {
      const loadVault = async () => {
        await store.fetchHojas()
        await store.fetchCategorias()
      }
      loadVault()
    } else if (path.startsWith('/finanzas')) {
      store.fetchFinMovimientos()
      store.fetchFinMovimientosAll()
      store.fetchFinCuentas()
      store.fetchFinCategorias()
      store.fetchFinConfig()
      store.fetchFinNotas()
      store.fetchFinEmergencia()
    } else if (path.startsWith('/agenda')) {
      store.fetchAgendaCalendarios()
      store.fetchAgendaEventos()
      store.fetchAgendaListas()
      store.fetchAgendaTareas()
      store.fetchAgendaHorarioFacultad()
      store.fetchHabitos()
      const since = new Date()
      since.setDate(since.getDate() - 120)
      const sinceText = since.toISOString().slice(0, 10)
      store.fetchHabitosRegistros(sinceText)
      const syncHabits = () => {
        store.fetchHabitos()
        store.fetchHabitosRegistros(sinceText)
      }
      window.addEventListener('online', syncHabits)
      return () => window.removeEventListener('online', syncHabits)
    } else if (path.startsWith('/habitos')) {
      store.fetchHabitos()
      const since = new Date()
      since.setDate(since.getDate() - 120)
      const sinceText = since.toISOString().slice(0, 10)
      store.fetchHabitosRegistros(sinceText)
      const syncHabits = () => {
        store.fetchHabitos()
        store.fetchHabitosRegistros(sinceText)
      }
      window.addEventListener('online', syncHabits)
      return () => window.removeEventListener('online', syncHabits)
    } else if (path === '/settings') {
      store.fetchFeedback()
      store.fetchProfile()
    }
  }, [path])

  return null
}

function DesktopGlobals() {
  return (
    <Suspense fallback={null}>
      <Toast />
      <TweaksPanel />
      <CaptureModal />
      <FeedbackModal />
      <MovementModal />
      <JarvisCaptureModal />
      <AgendaNotificationWatcher />
      <JarvisProposalWatcher />
    </Suspense>
  )
}

function AppContent() {
  const path = useLocation().pathname

  if (path === '/mobile' || path === '/mobile/') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <MobileHoyScreen />
      </Suspense>
    )
  }

  return (
    <>
      <RouteDataLoader />
      <Suspense fallback={<LoadingScreen />}>
        <Layout>
          <Routes>
            <Route path="/" element={<BrowseScreen />} />
            <Route path="/capture" element={<CaptureScreen />} />
            <Route path="/hoja/:id" element={<DetailScreen />} />
            <Route path="/finanzas" element={<FinanzasScreen />} />
            <Route path="/agenda" element={<AgendaScreen />} />
            <Route path="/habitos" element={<HabitosScreen />} />
            <Route path="/jarvis" element={<JarvisScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </Layout>
      </Suspense>
      <DesktopGlobals />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppContent />
    </BrowserRouter>
  )
}
