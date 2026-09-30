import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Background from './components/Background'
import { Sidebar, TopBar } from './app/Shell'
import CommandPalette from './app/CommandPalette'
import CaptureModal from './app/CaptureModal'
import { Toasts, Loader } from './components/ui'
import { moduleFor, hexToRgb } from './app/modules'
import { useUI } from './store/ui'
import { useBoveda } from './store/boveda'
import { useFin } from './store/fin'
import { useAgenda } from './store/agenda'
import { useHabitos } from './store/habitos'
import MovementModal from './modules/finanzas/MovementModal'
import { EventoModal, TareaModal } from './modules/agenda/Modals'
import HabitoModal from './modules/habitos/HabitoModal'

const Boveda = lazy(() => import('./modules/boveda/BovedaScreen'))
const HojaScreen = lazy(() => import('./modules/boveda/HojaScreen'))
const Finanzas = lazy(() => import('./modules/finanzas/FinanzasScreen'))
const Agenda = lazy(() => import('./modules/agenda/AgendaScreen'))
const Habitos = lazy(() => import('./modules/habitos/HabitosScreen'))
const Jarvis = lazy(() => import('./modules/jarvis/JarvisScreen'))
const Settings = lazy(() => import('./modules/settings/SettingsScreen'))

export default function App() {
  const loc = useLocation()
  const mod = moduleFor(loc.pathname)
  const prefs = useUI((s) => s.prefs)

  // Acento del módulo → variables CSS globales (transición suave vía background de los blobs)
  useEffect(() => {
    const r = document.documentElement
    const [a1, a2, a3] = mod.colors
    r.style.setProperty('--a1', a1)
    r.style.setProperty('--a2', a2)
    r.style.setProperty('--a3', a3)
    r.style.setProperty('--a1-rgb', hexToRgb(a1))
    r.style.setProperty('--a2-rgb', hexToRgb(a2))
    r.style.setProperty('--on-accent', mod.onAccent || '#fff')
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', a1)
  }, [mod])

  useEffect(() => {
    document.documentElement.dataset.palette = prefs.palette
    document.documentElement.dataset.effects = prefs.effects
  }, [prefs.palette, prefs.effects])

  // Carga inicial de todos los módulos (el TopBar/palette/campana los usan globalmente)
  useEffect(() => {
    useUI.getState().fetchProfile()
    useBoveda.getState().fetchAll()
    useBoveda.getState().fetchRecientes()
    useFin.getState().fetchAll()
    useAgenda.getState().fetchBase()
    useHabitos.getState().fetchAll()
    const onOnline = () => useUI.getState().setOnline(true)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // Reintento periódico cuando se detecta que la API no responde
  const online = useUI((s) => s.online)
  useEffect(() => {
    if (online) return
    const t = setInterval(async () => {
      await useUI.getState().fetchProfile()
      if (useUI.getState().online) {
        useBoveda.getState().fetchAll()
        useFin.getState().fetchAll()
        useAgenda.getState().fetchBase()
        useHabitos.getState().fetchAll()
      }
    }, 15000)
    return () => clearInterval(t)
  }, [online])

  // Atajos globales
  useEffect(() => {
    const h = (e) => {
      const ui = useUI.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setPalette(!ui.palette)
        return
      }
      const anyModal = ui.capture || ui.palette || document.querySelector('.modal')
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !anyModal) {
        e.preventDefault()
        ui.openCapture()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <>
      <Background accent={mod.colors} />
      <div className="nx-app">
        <Sidebar />
        <main className="nx-main">
          <TopBar />
          <div className="nx-body">
            <AnimatePresence mode="wait">
              <motion.div
                key={mod.id + (loc.pathname.startsWith('/hoja') ? '-hoja' : '')}
                className="nx-page"
                initial={{ opacity: 0, y: 18, scale: 0.985, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, scale: 0.99, filter: 'blur(6px)' }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              >
                <Suspense fallback={<div className="center" style={{ flex: 1 }}><Loader label="Iniciando módulo" /></div>}>
                  <Routes location={loc}>
                    <Route path="/" element={<Boveda />} />
                    <Route path="/hoja/:id" element={<HojaScreen />} />
                    <Route path="/finanzas" element={<Finanzas />} />
                    <Route path="/agenda" element={<Agenda />} />
                    <Route path="/habitos" element={<Habitos />} />
                    <Route path="/jarvis" element={<Jarvis />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Boveda />} />
                  </Routes>
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
      <CaptureModal />
      <CommandPalette />
      <MovementModal />
      <EventoModal />
      <TareaModal />
      <HabitoModal />
      <Toasts />
    </>
  )
}
