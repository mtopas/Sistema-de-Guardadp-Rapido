import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'

export default function CompletarModal({ habitoId, fecha, existingReg, anchorRect, onClose }) {
  const lang                 = useStore(s => s.lang)
  const upsertHabitoRegistro = useStore(s => s.upsertHabitoRegistro)
  const deleteHabitoRegistro = useStore(s => s.deleteHabitoRegistro)

  const [nota, setNota]     = useState(existingReg?.nota || '')
  const [saving, setSaving] = useState(false)
  const ref = useRef()

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Position near anchor
  const style = {}
  if (anchorRect) {
    style.position = 'fixed'
    style.top = Math.min(anchorRect.bottom + 4, window.innerHeight - 220)
    style.left = Math.min(anchorRect.left, window.innerWidth - 240)
  }

  async function handle(valor) {
    setSaving(true)
    await upsertHabitoRegistro(habitoId, fecha, valor, nota.trim() || null)
    setSaving(false)
    onClose()
  }

  async function handleUndo() {
    if (existingReg) {
      await deleteHabitoRegistro(existingReg.id, habitoId, fecha)
    }
    onClose()
  }

  return (
    <div
      ref={ref}
      className="z-50 w-[220px] rounded-2xl shadow-xl border p-4 flex flex-col gap-3"
      style={{
        ...style,
        background: 'var(--panel-bg)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>
          {t(lang, 'habitosCompletar')}
        </span>
        <button onClick={onClose} className="icon-btn w-6 h-6">
          <X size={13} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={() => handle(1.0)}
          className="flex-1 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-95"
          style={{
            background: existingReg?.valor === 1.0 ? 'var(--success)' : 'color-mix(in oklch, var(--success) 20%, transparent)',
            color: existingReg?.valor === 1.0 ? 'white' : 'var(--success)',
            border: '1px solid color-mix(in oklch, var(--success) 40%, transparent)',
          }}
        >
          {t(lang, 'habitosTotal')}
        </button>
        <button
          disabled={saving}
          onClick={() => handle(0.5)}
          className="flex-1 py-2 rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-95"
          style={{
            background: existingReg?.valor === 0.5 ? 'var(--warning)' : 'color-mix(in oklch, var(--warning) 20%, transparent)',
            color: existingReg?.valor === 0.5 ? 'white' : 'var(--warning)',
            border: '1px solid color-mix(in oklch, var(--warning) 40%, transparent)',
          }}
        >
          {t(lang, 'habitosParcial')}
        </button>
      </div>

      <input
        type="text"
        value={nota}
        onChange={e => setNota(e.target.value)}
        placeholder={t(lang, 'habitosNota')}
        className="w-full text-[12px] px-3 py-2 rounded-xl border outline-none bg-transparent"
        style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      />

      {existingReg && (
        <button
          onClick={handleUndo}
          className="text-[11px] text-center transition-colors"
          style={{ color: 'var(--subtext)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--subtext)'}
        >
          Desmarcar
        </button>
      )}
    </div>
  )
}
