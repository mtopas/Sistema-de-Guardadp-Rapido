import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ArrowDown, ArrowUp, Calendar as CalIcon } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtARS } from '../../data/finanzas'

const CURRENCIES = [
  { id: 'ARS', label: 'ARS', symbol: '$'   },
  { id: 'USD', label: 'USD', symbol: 'US$' },
]

// Default icon per type — keeps the movement card row visually consistent.
const DEFAULT_ICON = { income: '💰', expense: '💸' }

function nowLocalIso() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function MovementModal() {
  const open          = useStore(s => s.movementOpen)
  const close         = useStore(s => s.closeMovement)
  const addMov        = useStore(s => s.addFinMovimiento)
  const showT         = useStore(s => s.showToast)
  const lang          = useStore(s => s.lang)
  const finCuentas    = useStore(s => s.finCuentas)
  const finCategorias = useStore(s => s.finCategorias)

  const cuentas = useMemo(() => {
    if (!finCuentas || finCuentas.length === 0) return FINANZAS.cuentas.flatMap(g => g.items)
    if (finCuentas[0]?.items) return finCuentas.flatMap(g => g.items)
    return finCuentas
  }, [finCuentas])

  const categorias = useMemo(() => {
    if (!finCategorias || finCategorias.length === 0) return FINANZAS.categorias
    return finCategorias
  }, [finCategorias])

  const [tipo,        setTipo]        = useState('expense')
  const [monto,       setMonto]       = useState('')
  const [moneda,      setMoneda]      = useState('ARS')
  const [fecha,       setFecha]       = useState(nowLocalIso())
  const [descripcion, setDescripcion] = useState('')
  const [cuentaId,    setCuentaId]    = useState(cuentas[0]?.id ?? null)
  const [categoria,   setCategoria]   = useState(categorias[0]?.name ?? '')
  const [cuotas,      setCuotas]      = useState('')
  const [nota,        setNota]        = useState('')
  const [audit,       setAudit]       = useState(false)
  const [saving,      setSaving]      = useState(false)

  const montoRef = useRef(null)

  // Reset whenever (re)opened.
  useEffect(() => {
    if (!open) return
    setTipo('expense')
    setMonto('')
    setMoneda('ARS')
    setFecha(nowLocalIso())
    setDescripcion('')
    setCuentaId(cuentas[0]?.id ?? null)
    setCategoria(categorias[0]?.name ?? '')
    setCuotas('')
    setNota('')
    setAudit(false)
    setTimeout(() => montoRef.current?.focus(), 30)
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, close])

  if (!open) return null

  const cuentaSel  = cuentas.find(c => c.id === cuentaId)
  const isIncome   = tipo === 'income'
  const accentVar  = isIncome ? 'var(--income)' : 'var(--expense)'
  const montoNum   = parseFloat(monto.replace(',', '.')) || 0
  const cuotasNum  = parseInt(cuotas, 10) || 0
  const valid      = montoNum > 0 && descripcion.trim().length > 0 && cuentaSel

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!valid || saving) return
    setSaving(true)

    const signed = isIncome ? montoNum : -montoNum
    const payload = {
      // API shape
      tipo:             tipo,
      monto:            signed,
      moneda:           moneda,
      fecha:            fecha,
      descripcion:      descripcion.trim(),
      icono:            DEFAULT_ICON[tipo],
      cuenta_nombre:    cuentaSel.name,
      cuenta_id:        cuentaSel.id,
      categoria_nombre: categoria,
      cuotas:           cuotasNum > 1 ? cuotasNum : null,
      nota:             nota.trim() || null,
      audit:            audit || undefined,
      // Legacy shape (used by mock fallback)
      type:     tipo,
      amount:   signed,
      currency: moneda,
      datetime: fecha,
      date:     formatShortDate(fecha),
      desc:     descripcion.trim(),
      icon:     DEFAULT_ICON[tipo],
      method:   cuentaSel.name,
      cuentaId: cuentaSel.id,
      cat:      categoria,
    }

    try {
      addMov(payload)
      showT(t(lang, 'movementSaved') || 'Movimiento guardado')
      close()
    } catch {
      showT('Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(10px)' }}
      onClick={close}
    >
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="panel-strong w-full max-w-[520px] max-h-[92vh] overflow-y-auto panel-scroll anim-card-in"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
              style={{ background: `color-mix(in oklch, ${accentVar} 18%, transparent)`, color: accentVar }}
            >
              {isIncome ? <ArrowDown size={16} strokeWidth={2.5} /> : <ArrowUp size={16} strokeWidth={2.5} />}
            </div>
            <div>
              <div className="label">{t(lang, 'addMovement')}</div>
              <div className="serif italic text-[18px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
                {isIncome ? t(lang, 'incomeLabel') : t(lang, 'expenseLabel')}
              </div>
            </div>
          </div>
          <button type="button" onClick={close} className="icon-btn-fin" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tipo (toggle) */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            {[
              { id: 'expense', label: t(lang, 'expenseLabel'), Icon: ArrowUp,   color: 'var(--expense)' },
              { id: 'income',  label: t(lang, 'incomeLabel'),  Icon: ArrowDown, color: 'var(--income)'  },
            ].map(opt => {
              const active = tipo === opt.id
              const Icon   = opt.Icon
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTipo(opt.id)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12.5px] font-medium transition-all"
                  style={{
                    background: active ? `color-mix(in oklch, ${opt.color} 14%, transparent)` : 'transparent',
                    color:      active ? opt.color : 'var(--subtext)',
                    border:     active ? `1px solid color-mix(in oklch, ${opt.color} 30%, transparent)` : '1px solid transparent',
                  }}
                >
                  <Icon size={13} strokeWidth={2.5} />
                  {opt.label}
                </button>
              )
            })}
          </div>

          {/* Monto + moneda */}
          <div>
            <label className="label block mb-1.5">{t(lang, 'amount')}</label>
            <div
              className="flex items-stretch rounded-xl border overflow-hidden focus-within:border-app-accent"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
            >
              <div className="flex items-center px-3 mono text-[13px]" style={{ color: 'var(--subtext)' }}>
                {CURRENCIES.find(c => c.id === moneda)?.symbol}
              </div>
              <input
                ref={montoRef}
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0"
                className="flex-1 bg-transparent outline-none text-[22px] font-semibold tnum py-2.5"
                style={{ color: accentVar, fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
              />
              <div className="flex p-1 gap-0.5">
                {CURRENCIES.map(c => {
                  const active = c.id === moneda
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setMoneda(c.id)}
                      className="px-2.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{
                        background: active ? 'var(--surface)' : 'transparent',
                        color:      active ? 'var(--text)'    : 'var(--subtext)',
                        border:     active ? '1px solid var(--border)' : '1px solid transparent',
                      }}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="label block mb-1.5">{t(lang, 'description')}</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder={t(lang, 'descriptionPlaceholder')}
              className="w-full px-3 py-2.5 rounded-xl border outline-none text-[13px] transition-colors"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Fecha + cuenta */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5 flex items-center gap-1">
                <CalIcon size={10} /> {t(lang, 'dateTime')}
              </label>
              <input
                type="datetime-local"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px] mono"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              />
            </div>

            <div>
              <label className="label block mb-1.5">{t(lang, 'account')}</label>
              <select
                value={cuentaId ?? ''}
                onChange={e => setCuentaId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px]"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              >
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Categoría + cuotas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">{t(lang, 'category')}</label>
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px]"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              >
                {categorias.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label block mb-1.5">{t(lang, 'installments')}</label>
              <input
                type="number"
                min="0"
                value={cuotas}
                onChange={e => setCuotas(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px] mono tnum"
                style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              />
            </div>
          </div>

          {/* Nota */}
          <div>
            <label className="label block mb-1.5">{t(lang, 'noteOptional')}</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              rows={2}
              placeholder="…"
              className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px] resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            />
          </div>

          {/* Auditar flag */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={audit}
              onChange={e => setAudit(e.target.checked)}
              className="w-4 h-4 rounded accent-app-accent"
              style={{ accentColor: 'var(--warning)' }}
            />
            <span className="text-[12px]" style={{ color: 'var(--subtext)' }}>
              {t(lang, 'markForAudit')}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5 border-t"
          style={{ borderColor: 'var(--border)', background: 'color-mix(in oklch, var(--bg) 30%, transparent)' }}
        >
          <div className="text-[11px] mono tnum" style={{ color: 'var(--subtext)' }}>
            {montoNum > 0 && (
              <>
                <span style={{ color: accentVar }}>
                  {isIncome ? '+' : '−'}{moneda === 'ARS' ? fmtARS(montoNum) : `US$ ${montoNum}`}
                </span>
                {cuotasNum > 1 && <span> · {cuotasNum} cuotas</span>}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="btn-fin" disabled={saving}>
              {t(lang, 'cancel') || 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-50"
              style={{
                background: accentVar,
                color: '#fff',
                boxShadow: `0 6px 18px -8px ${accentVar}`,
              }}
            >
              {saving ? (t(lang, 'saving')) : (t(lang, 'save'))}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
