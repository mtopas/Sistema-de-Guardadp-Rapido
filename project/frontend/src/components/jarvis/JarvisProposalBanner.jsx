import { useState } from 'react'
import { Brain, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { MEMORY_TYPE_COLORS, rgba } from '../../utils/jarvisPalette'

// Captura pasiva por inactividad (pieza C) + auditoría proactiva de memoria
// (jarvis.audit.service, ver Cerebro/decisiones-implementacion.md 2026-08-31)
// comparten el mismo banner -- decisión resuelta con el usuario: un solo
// banner, no uno separado por tipo de propuesta. Visible en cualquier tab de
// /jarvis (no solo el chat) porque ninguna de las dos está atada a la
// pestaña que el usuario tiene abierta ahora mismo.
const ASK_COLOR = MEMORY_TYPE_COLORS.DECISION

const AUDIT_ACTION_LABELS = {
  create: 'CREAR',
  clarify: 'ACLARAR',
  flag_contradiction: 'CONTRADICCIÓN',
  flag_connection: 'CONEXIÓN',
  merge: 'FUSIONAR',
  edit: 'CORREGIR',
  delete: 'ELIMINAR',
  retag: 'RETAGEAR',
}

export default function JarvisProposalBanner() {
  const {
    jarvisProposals, acceptJarvisProposal, rejectJarvisProposal,
    jarvisAuditProposals, acceptJarvisAuditProposal, rejectJarvisAuditProposal,
    showToast,
  } = useStore(
    useShallow(s => ({
      jarvisProposals:            s.jarvisProposals,
      acceptJarvisProposal:       s.acceptJarvisProposal,
      rejectJarvisProposal:       s.rejectJarvisProposal,
      jarvisAuditProposals:       s.jarvisAuditProposals,
      acceptJarvisAuditProposal:  s.acceptJarvisAuditProposal,
      rejectJarvisAuditProposal:  s.rejectJarvisAuditProposal,
      showToast:                  s.showToast,
    }))
  )
  const [answering, setAnswering] = useState(null) // proposal id en curso
  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [clarifyText, setClarifyText] = useState('')

  const combined = [
    ...jarvisProposals.map(p => ({ ...p, kind: 'capture' })),
    ...jarvisAuditProposals.map(p => ({ ...p, kind: 'audit' })),
  ].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  if (combined.length === 0) return null
  const proposal = combined[0]
  const isAudit = proposal.kind === 'audit'
  const busy = answering === proposal.id

  function resetLocal() {
    setAnswering(null)
    setClarifyOpen(false)
    setClarifyText('')
  }

  async function handleAccept(withClarification) {
    setAnswering(proposal.id)
    const result = isAudit
      ? await acceptJarvisAuditProposal(proposal.id, withClarification || null)
      : await acceptJarvisProposal(proposal.id, withClarification || null)
    resetLocal()
    showToast(result?.entry_id ? 'Guardado en el cerebro' : (result ? 'Confirmado' : 'No se pudo aplicar'), result ? 'success' : 'error')
  }

  async function handleReject() {
    setAnswering(proposal.id)
    const ok = isAudit ? await rejectJarvisAuditProposal(proposal.id) : await rejectJarvisProposal(proposal.id)
    resetLocal()
    if (ok) showToast('Descartado', 'success')
  }

  const isClarify = isAudit && ['clarify', 'open_question'].includes(proposal.action_type)
  const badgeLabel = isAudit ? (AUDIT_ACTION_LABELS[proposal.action_type] || 'AUDITORÍA') : 'PROPUESTA DE CAPTURA'

  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 9, padding: '13px 16px', borderRadius: '4px 14px 14px 14px',
          background: rgba(ASK_COLOR, 0.07), border: `1px solid ${rgba(ASK_COLOR, 0.28)}`,
          fontFamily: "'Space Grotesk', sans-serif", maxWidth: 620,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain size={13} style={{ color: ASK_COLOR }} />
            <span className="jv-mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: ASK_COLOR }}>
              {badgeLabel}
            </span>
          </div>
          {combined.length > 1 && (
            <span className="jv-mono" style={{ fontSize: 9.5, color: 'var(--jv-mute)' }}>
              +{combined.length - 1} más
            </span>
          )}
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: '#f2ecdd', whiteSpace: 'pre-line' }}>{proposal.question}</p>
        {!isAudit && (
          <p className="text-[12.5px] leading-relaxed" style={{ color: 'rgba(220,228,255,0.6)', fontStyle: 'italic' }}>
            {proposal.content}
          </p>
        )}

        {clarifyOpen ? (
          <div className="flex flex-col gap-2">
            <input
              value={clarifyText}
              onChange={e => setClarifyText(e.target.value)}
              placeholder={isClarify ? 'Escribí la respuesta...' : 'Escribí la aclaración...'}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
              style={{ background: 'rgba(150,170,255,0.06)', border: '1px solid rgba(150,170,255,0.14)', color: '#eef2ff' }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setClarifyOpen(false); setClarifyText('') }}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[12px]"
                style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAccept(clarifyText.trim())}
                disabled={busy || !clarifyText.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ background: 'linear-gradient(120deg,#7dd3fc,#a78bfa)', color: '#06070f' }}
              >
                {isClarify ? 'Responder' : 'Guardar con aclaración'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2 flex-wrap">
            <button
              onClick={handleReject}
              disabled={busy}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              title="Descartar"
              style={{ color: 'rgba(200,214,255,0.5)', background: 'rgba(150,170,255,0.06)' }}
            >
              <X size={13} />
            </button>
            {!isClarify && !isAudit && (
              <button
                onClick={() => setClarifyOpen(true)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-[12px]"
                style={{ color: 'rgba(200,214,255,0.6)', background: 'rgba(150,170,255,0.06)' }}
              >
                Aclarar
              </button>
            )}
            {isClarify ? (
              <button
                onClick={() => setClarifyOpen(true)}
                disabled={busy}
                className="px-4 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ background: 'linear-gradient(120deg,#7dd3fc,#a78bfa)', color: '#06070f' }}
              >
                Responder
              </button>
            ) : (
              <button
                onClick={() => handleAccept(null)}
                disabled={busy}
                className="px-4 py-1.5 rounded-lg text-[12px] font-medium"
                style={{ background: 'linear-gradient(120deg,#7dd3fc,#a78bfa)', color: '#06070f' }}
              >
                {busy ? (isAudit ? 'Confirmando…' : 'Guardando…') : (isAudit ? 'Confirmar' : 'Guardar')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
