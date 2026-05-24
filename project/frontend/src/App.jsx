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
import AgendaScreen   from './screens/AgendaScreen'
import HabitosScreen  from './screens/HabitosScreen'

export default function App() {
  const fetchCategorias           = useStore(s => s.fetchCategorias)
  const fetchHojas                = useStore(s => s.fetchHojas)
  const fetchFinMovimientos       = useStore(s => s.fetchFinMovimientos)
  const fetchFinCuentas           = useStore(s => s.fetchFinCuentas)
  const fetchFinCategorias        = useStore(s => s.fetchFinCategorias)
  const fetchFinConfig            = useStore(s => s.fetchFinConfig)
  const fetchFinNotas             = useStore(s => s.fetchFinNotas)
  const fetchFinEmergencia        = useStore(s => s.fetchFinEmergencia)
  const fetchAgendaCalendarios    = useStore(s => s.fetchAgendaCalendarios)
  const fetchAgendaEventos        = useStore(s => s.fetchAgendaEventos)
  const fetchAgendaListas         = useStore(s => s.fetchAgendaListas)
  const fetchAgendaTareas         = useStore(s => s.fetchAgendaTareas)
  const fetchAgendaHorarioFacultad = useStore(s => s.fetchAgendaHorarioFacultad)
  const fetchHabitos              = useStore(s => s.fetchHabitos)
  const fetchHabitosRegistros     = useStore(s => s.fetchHabitosRegistros)

  useEffect(() => {
    fetchCategorias()
    fetchHojas()
    fetchFinMovimientos()
    fetchFinCuentas()
    fetchFinCategorias()
    fetchFinConfig()
    fetchFinNotas()
    fetchFinEmergencia()
    fetchAgendaCalendarios()
    fetchAgendaEventos()
    fetchAgendaListas()
    fetchAgendaTareas()
    fetchAgendaHorarioFacultad()
    fetchHabitos()
    const desde120 = new Date(); desde120.setDate(desde120.getDate() - 120)
    const desdeStr = desde120.toISOString().slice(0, 10)
    fetchHabitosRegistros(desdeStr)
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
          <Route path="/agenda"    element={<AgendaScreen />}   />
          <Route path="/habitos"   element={<HabitosScreen />}  />
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
