import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import FAB from './FAB'
import ScrollArea from './ScrollArea'
import { useStore } from '../store/useStore'

const ARCOIRIS_ACCENTS = {
  '/':         { accent: '#7c3aed', light: '#a78bfa', deep: '#6d28d9' },
  '/finanzas': { accent: '#d97706', light: '#fbbf24', deep: '#b45309' },
  '/agenda':   { accent: '#2563eb', light: '#60a5fa', deep: '#1d4ed8' },
  '/habitos':  { accent: '#059669', light: '#34d399', deep: '#047857' },
}

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const path     = location.pathname
  const theme    = useStore(s => s.theme)

  useEffect(() => {
    if (theme !== 'arcoiris') return
    const key = Object.keys(ARCOIRIS_ACCENTS).find(k => path.startsWith(k)) || '/'
    const { accent, light, deep } = ARCOIRIS_ACCENTS[key]
    const root = document.documentElement
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-light', light)
    root.style.setProperty('--accent-deep', deep)
  }, [path, theme])

  // Full-screen modules (Bóveda, Finanzas) own their layout and hide the Bóveda sidebar.
  const isBrowse         = path === '/'
  const isFinanzas       = path.startsWith('/finanzas')
  const isAgenda         = path.startsWith('/agenda')
  const isHabitos        = path.startsWith('/habitos')
  const hideSidebar      = isBrowse || isFinanzas || isAgenda || isHabitos
  const managesOwnLayout = isBrowse || isFinanzas || isAgenda || isHabitos

  return (
    <div className="flex h-screen overflow-hidden text-app-text">

      {/* Desktop sidebar — only on Bóveda sub-pages (capture, hoja, settings) */}
      {!hideSidebar && (
        <div className="hidden md:flex flex-shrink-0">
          <Sidebar />
        </div>
      )}

      {/* Main content */}
      {managesOwnLayout ? (
        <main className="flex-1 overflow-hidden">{children}</main>
      ) : (
        <ScrollArea className="flex-1" contentClassName="pb-20 md:pb-0">
          {children}
        </ScrollArea>
      )}

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around h-16 z-40 border-t border-app-border"
        style={{ backgroundColor: 'var(--surface)', backdropFilter: 'blur(12px)' }}
      >
        <button
          onClick={() => navigate('/')}
          className={`flex flex-col items-center justify-center w-16 h-full transition-colors duration-150 ${
            path === '/' ? 'text-app-accent' : 'text-app-subtext'
          }`}
        >
          <Home size={22} />
        </button>

        {/* FAB spacer */}
        <div className="w-16" />

        <button
          onClick={() => navigate('/settings')}
          className={`flex flex-col items-center justify-center w-16 h-full transition-colors duration-150 ${
            path === '/settings' ? 'text-app-accent' : 'text-app-subtext'
          }`}
        >
          <Settings size={22} />
        </button>
      </nav>

      {/* Mobile FAB */}
      <div className="md:hidden">
        <FAB />
      </div>
    </div>
  )
}
