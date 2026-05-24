import { CheckCircle, AlertCircle } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function Toast() {
  const toast = useStore(s => s.toast)
  if (!toast) return null

  const isError = toast.type === 'error'
  return (
    <div
      className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in pointer-events-none"
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium whitespace-nowrap ${
        isError
          ? 'bg-red-950/95 text-red-100 border border-red-800'
          : 'bg-app-surface/95 text-app-text border border-app-border'
      }`}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {isError
          ? <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
          : <CheckCircle size={15} className="text-app-accent flex-shrink-0" />
        }
        {toast.message}
      </div>
    </div>
  )
}
