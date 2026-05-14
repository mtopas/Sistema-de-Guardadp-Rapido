import { useNavigate, useLocation } from 'react-router-dom'
import { Home, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import FAB from './FAB'
import ScrollArea from './ScrollArea'

export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const path     = location.pathname

  // Full-screen modules (Bóveda, Finanzas) own their layout and hide the Bóveda sidebar.
  const isBrowse         = path === '/'
  const isFinanzas       = path.startsWith('/finanzas')
  const hideSidebar      = isBrowse || isFinanzas
  const managesOwnLayout = isBrowse || isFinanzas

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg text-app-text">

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
