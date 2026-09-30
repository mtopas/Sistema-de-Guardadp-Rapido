import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Shell } from './shell/Shell'
import { CommandPalette } from './shell/CommandPalette'
import { TweaksPanel } from './shell/TweaksPanel'
import { Toasts } from './shell/Toasts'
import { CaptureModal } from './modules/boveda/CaptureModal'
import { Spinner } from './ui/primitives'
import { useHotkeys } from './ui/hooks'
import { useUI } from './store/ui'
import { useBoveda } from './store/boveda'
import { MODULES } from './shell/modules'

// Lazy: el grafo, las tablas de Finanzas y la grilla de Hábitos no hacen falta
// hasta que se navega al módulo.
const BovedaScreen = lazy(() => import('./modules/boveda/BovedaScreen'))
const FinanzasScreen = lazy(() => import('./modules/finanzas/FinanzasScreen'))
const AgendaScreen = lazy(() => import('./modules/agenda/AgendaScreen'))
const HabitosScreen = lazy(() => import('./modules/habitos/HabitosScreen'))
const AjustesScreen = lazy(() => import('./modules/ajustes/AjustesScreen'))

export default function App() {
  const bootTheme = useUI((s) => s.bootTheme)
  const togglePalette = useUI((s) => s.togglePalette)
  const toggleTweaks = useUI((s) => s.toggleTweaks)
  const openCaptura = useBoveda((s) => s.openCaptura)
  const nav = useNavigate()

  useEffect(() => { bootTheme() }, [bootTheme])

  useHotkeys(
    {
      'ctrl+k': () => togglePalette(),
      'ctrl+m': () => toggleTweaks(),
      'ctrl+enter': () => openCaptura(),
      'alt+1': () => nav(MODULES[0].path),
      'alt+2': () => nav(MODULES[1].path),
      'alt+3': () => nav(MODULES[2].path),
      'alt+4': () => nav(MODULES[3].path),
      'alt+5': () => nav(MODULES[4].path),
    },
    [togglePalette, toggleTweaks, openCaptura, nav],
  )

  return (
    <Shell>
      <Suspense fallback={<div className="grid flex-1 place-items-center"><Spinner size={26} /></div>}>
        <Routes>
          <Route path="/" element={<BovedaScreen />} />
          <Route path="/finanzas" element={<FinanzasScreen />} />
          <Route path="/agenda" element={<AgendaScreen />} />
          <Route path="/habitos" element={<HabitosScreen />} />
          <Route path="/ajustes" element={<AjustesScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* Globales: disponibles desde cualquier módulo */}
      <CaptureModal />
      <CommandPalette />
      <TweaksPanel />
      <Toasts />
    </Shell>
  )
}
