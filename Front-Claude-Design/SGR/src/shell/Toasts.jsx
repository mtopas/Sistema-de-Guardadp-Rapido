import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useUI } from '../store/ui'

const KIND = {
  ok: { icon: CheckCircle2, color: 'var(--success)' },
  warn: { icon: AlertTriangle, color: 'var(--warning)' },
  error: { icon: XCircle, color: 'var(--danger)' },
  info: { icon: Info, color: 'var(--info)' },
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const drop = useUI((s) => s.dropToast)
  if (!toasts.length) return null
  return createPortal(
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(370px,calc(100vw-40px))] flex-col gap-2">
      {toasts.map((t) => {
        const k = KIND[t.kind] || KIND.ok
        return (
          <div
            key={t.id}
            className="panel pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 a-right"
            style={{ boxShadow: `0 20px 44px -20px #000, 0 0 0 1px color-mix(in srgb, ${k.color} 26%, transparent)` }}
          >
            <k.icon size={16} style={{ color: k.color }} className="mt-px shrink-0" />
            <p className="flex-1 text-[12.5px] leading-snug text-txt-2">{t.msg}</p>
            <button className="icon-btn h-6 w-6 shrink-0" onClick={() => drop(t.id)} aria-label="Cerrar">
              <X size={12} />
            </button>
            <span
              className="absolute bottom-0 left-0 h-[2px] rounded-full"
              style={{ background: k.color, animation: 'growX 3.6s linear both', width: '100%', transformOrigin: 'left' }}
            />
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
