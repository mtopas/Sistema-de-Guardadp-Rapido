import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import Toast from './components/Toast'
import TweaksPanel from './components/TweaksPanel'
import CaptureModal from './components/CaptureModal'
import MovementModal from './components/finanzas/MovementModal'
import BrowseScreen   from './screens/BrowseScreen'
import CaptureScreen  from './screens/CaptureScreen'
import DetailScreen   from './screens/DetailScreen'
import SettingsScreen from './screens/SettingsScreen'
import FinanzasScreen from './screens/FinanzasScreen'

export default function App() {
  const fetchCategorias      = useStore(s => s.fetchCategorias)
  const fetchHojas           = useStore(s => s.fetchHojas)
  const fetchFinMovimientos  = useStore(s => s.fetchFinMovimientos)
  const fetchFinCuentas      = useStore(s => s.fetchFinCuentas)
  const fetchFinCategorias   = useStore(s => s.fetchFinCategorias)
  const fetchFinConfig       = useStore(s => s.fetchFinConfig)
  const fetchFinNotas        = useStore(s => s.fetchFinNotas)
  const fetchFinEmergencia   = useStore(s => s.fetchFinEmergencia)

  useEffect(() => {
    fetchCategorias()
    fetchHojas()
    fetchFinMovimientos()
    fetchFinCuentas()
    fetchFinCategorias()
    fetchFinConfig()
    fetchFinNotas()
    fetchFinEmergencia()
  }, [])

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Layout>
        <Routes>
          <Route path="/"          element={<BrowseScreen />}  />
          <Route path="/capture"   element={<CaptureScreen />} />
          <Route path="/hoja/:id"  element={<DetailScreen />}  />
          <Route path="/finanzas"  element={<FinanzasScreen />} />
          <Route path="/settings"  element={<SettingsScreen />} />
        </Routes>
      </Layout>
      <Toast />
      <TweaksPanel />
      <CaptureModal />
      <MovementModal />
    </BrowserRouter>
  )
}
