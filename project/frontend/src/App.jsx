import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store/useStore'
import Layout from './components/Layout'
import Toast from './components/Toast'
import TweaksPanel from './components/TweaksPanel'
import CaptureModal from './components/CaptureModal'
import BrowseScreen  from './screens/BrowseScreen'
import CaptureScreen from './screens/CaptureScreen'
import DetailScreen  from './screens/DetailScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const fetchCategorias = useStore(s => s.fetchCategorias)
  const fetchHojas      = useStore(s => s.fetchHojas)

  useEffect(() => {
    fetchCategorias()
    fetchHojas()
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
          <Route path="/settings"  element={<SettingsScreen />} />
        </Routes>
      </Layout>
      <Toast />
      <TweaksPanel />
      <CaptureModal />
    </BrowserRouter>
  )
}
