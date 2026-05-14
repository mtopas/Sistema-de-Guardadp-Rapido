import { Plus } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function FAB() {
  const captureOpen = useStore(s => s.captureOpen)
  const openCapture = useStore(s => s.openCapture)
  const closeCapture = useStore(s => s.closeCapture)
  const isCapture = captureOpen

  return (
    <button
      onClick={() => (isCapture ? closeCapture() : openCapture())}
      aria-label={isCapture ? 'Cerrar' : 'Nueva hoja'}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center z-50 transition-all duration-150 active:scale-95 hover:brightness-110"
      style={{
        backgroundColor: 'var(--accent)',
        boxShadow: 'var(--shadow-soft), 0 4px 12px rgba(0,0,0,0.4)',
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
