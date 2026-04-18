import { useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'

export default function FAB() {
  const navigate = useNavigate()
  const location = useLocation()
  const isCapture = location.pathname === '/capture'

  return (
    <button
      onClick={() => navigate(isCapture ? '/' : '/capture')}
      aria-label={isCapture ? 'Cerrar' : 'Nueva hoja'}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center z-50 transition-all duration-150 active:scale-95 hover:brightness-110"
      style={{
        backgroundColor: 'var(--accent)',
        boxShadow: '0 0 24px var(--accent)55, 0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      <Plus
        size={26}
        color="white"
        strokeWidth={2.5}
        style={{
          transform: isCapture ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      />
    </button>
  )
}
