import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Settings, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtARS, fmtUSD, isTransferencia } from '../../data/finanzas'

const FIN_KEYWORDS = /pagar|cuota|vencimiento|cobro|débito|debito|transferir|tarjeta|impuesto|factura|alquiler|servicio|préstamo|prestamo/i

const GROUP_LABEL = { wallets: 'wallets', banks: 'banks', cash: 'cash' }

function AccountRow({ a }) {
  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div
        className="w-7 h-7 rounded-lg grid place-items-center text-[10px] font-semibold tnum text-white shrink-0"
        style={{ background: a.color }}
      >
        {a.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
          {a.name}
        </div>
        <div className="text-[10.5px] mono tnum" style={{ color: 'var(--subtext)' }}>
          {a.ars ? fmtARS(a.ars) : ''}{a.usd ? ` · ${fmtUSD(a.usd)}` : ''}
        </div>
      </div>
    </div>
  )
}

export default function FinanzasLeftPanel() {
  const navigate         = useNavigate()
  const lang             = useStore(s => s.lang)
  const finCuentas       = useStore(s => s.finCuentas)
  const finMovimientos   = useStore(s => s.finMovimientos)
  const finConfig        = useStore(s => s.finConfig)
  const updateFinConfig  = useStore(s => s.updateFinConfig)
  const updateFinCuenta  = useStore(s => s.updateFinCuenta)
  const agendaTareas     = useStore(s => s.agendaTareas)

  const [configOpen, setConfigOpen] = useState(false)
  const [dolarInput, setDolarInput] = useState('')
  // saldoEdits: { [cuenta.id]: { ars: string, usd: string } }
  const [saldoEdits, setSaldoEdits] = useState({})

  // Normalise cuentas to grouped format (API may return flat or grouped)
  const cuentas = useMemo(() => {
    if (!finCuentas || finCuentas.length === 0) return FINANZAS.cuentas
    // If already grouped (array of { group, items })
    if (finCuentas[0]?.items) return finCuentas
    // Flat array — group by tipo
    const groups = {}
    finCuentas.forEach(a => {
      const g = a.tipo ?? a.group ?? 'wallets'
      if (!groups[g]) groups[g] = []
      groups[g].push(a)
    })
    return Object.entries(groups).map(([group, items]) => ({ group, items }))
  }, [finCuentas])

  // Derive ingresos and gastos from real movements (exclude internal transfers)
  const ingresosMes = useMemo(() => {
    return finMovimientos
      .filter(m => (m.type ?? m.tipo) === 'income' && !isTransferencia(m))
      .reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
  }, [finMovimientos])

  const gastosMes = useMemo(() => {
    return finMovimientos
      .filter(m => (m.type ?? m.tipo) === 'expense' && !isTransferencia(m))
      .reduce((a, m) => a + Math.abs(m.amount ?? m.monto ?? 0), 0)
  }, [finMovimientos])

  const tasaAhorro = ingresosMes > 0
    ? Math.round(((ingresosMes - gastosMes) / ingresosMes) * 100)
    : 0

  // Saldo total
  const saldoARS = useMemo(() => {
    return cuentas.flatMap(g => g.items ?? []).reduce((a, c) => a + (c.ars ?? 0), 0)
  }, [cuentas])

  const saldoUSD = useMemo(() => {
    return cuentas.flatMap(g => g.items ?? []).reduce((a, c) => a + (c.usd ?? 0), 0)
  }, [cuentas])

  const dolarRate = finConfig?.dolar_oficial ?? FINANZAS.blueRate

  const tareasFinancieras = useMemo(() =>
    agendaTareas.filter(t => !t.completada && FIN_KEYWORDS.test(t.titulo)).slice(0, 6),
    [agendaTareas]
  )

  const handleDolarUpdate = () => {
    const val = parseFloat(dolarInput)
    if (!isNaN(val) && val > 0) {
      updateFinConfig('dolar_oficial', val)
      setDolarInput('')
    }
  }

  return (
    <aside
      className="w-[300px] shrink-0 h-full overflow-y-auto panel-scroll"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--sidebar)' }}
    >
      <div className="p-4">
        <div className="label mb-2">{t(lang, 'availableBalance')}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] mono" style={{ color: 'var(--subtext)' }}>ARS</span>
          <div
            className="serif italic text-[30px] font-semibold tnum leading-none gradient-text"
            aria-label={`${saldoARS} pesos argentinos`}
          >
            {fmtARS(saldoARS)}
          </div>
        </div>
        <div className="text-[11.5px] mt-1.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--subtext)' }}>
          <span className="mono tnum">≈ {fmtUSD(saldoUSD)}</span>
          <span className="opacity-50">·</span>
          <span>{t(lang, 'finBlue')} {dolarRate} ARS/USD</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: 'color-mix(in oklch, var(--income) 22%, var(--border))',
              background: 'color-mix(in oklch, var(--income) 6%, transparent)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown size={12} style={{ color: 'var(--income)' }} strokeWidth={2.5} />
              <span className="label" style={{ color: 'var(--income)' }}>
                {t(lang, 'incomeLabel')}
              </span>
            </div>
            <div className="text-[15px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtARS(ingresosMes || FINANZAS.ingresosMes)}
            </div>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: 'color-mix(in oklch, var(--expense) 22%, var(--border))',
              background: 'color-mix(in oklch, var(--expense) 6%, transparent)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUp size={12} style={{ color: 'var(--expense)' }} strokeWidth={2.5} />
              <span className="label" style={{ color: 'var(--expense)' }}>
                {t(lang, 'expenseLabel')}
              </span>
            </div>
            <div className="text-[15px] font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtARS(gastosMes || FINANZAS.gastosMes)}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span style={{ color: 'var(--subtext)' }}>{t(lang, 'savingsRate')}</span>
            <span className="font-semibold tnum gradient-text">{tasaAhorro}%</span>
          </div>
          <div
            className="relative h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--surface)' }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, tasaAhorro))}%`, background: 'var(--cta-bg)' }}
            />
          </div>
        </div>

        <hr className="divider" />

        {cuentas.map(group => {
          const items = group.items ?? []
          const total = items.reduce((a, b) => a + (b.ars ?? 0), 0)
          return (
            <div key={group.group} className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="label">{t(lang, GROUP_LABEL[group.group] ?? group.group)}</span>
                <span className="text-[10.5px] mono tnum" style={{ color: 'var(--subtext)' }}>
                  {fmtARS(total)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map(a => <AccountRow key={a.id} a={a} />)}
              </div>
            </div>
          )
        })}

        {/* Agenda cross-module: pending financial tasks */}
        {tareasFinancieras.length > 0 && (
          <>
            <hr className="divider" />
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="label flex items-center gap-1.5">
                  <CalendarClock size={11} />
                  Agenda pendiente
                </div>
                <button
                  onClick={() => navigate('/agenda?tab=tareas')}
                  className="text-[10.5px] transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  Ver todas →
                </button>
              </div>
              {tareasFinancieras.map(tarea => (
                <div
                  key={tarea.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => navigate('/agenda?tab=tareas')}
                  title="Ir a Agenda"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tarea.lista_color || 'var(--accent)' }} />
                  <span className="text-[12px] flex-1 truncate" style={{ color: 'var(--text)' }}>{tarea.titulo}</span>
                  {tarea.fecha_opcional && (
                    <span className="mono text-[10px] shrink-0" style={{ color: 'var(--subtext)' }}>
                      {new Date(tarea.fecha_opcional + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Config toggle */}
        <hr className="divider" />
        <button
          type="button"
          onClick={() => setConfigOpen(v => !v)}
          className="flex items-center gap-2 w-full px-1 py-1 text-[11.5px] transition-colors"
          style={{ color: 'var(--subtext)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtext)')}
        >
          <Settings size={12} />
          <span>{t(lang, 'configTitle')}</span>
          {configOpen
            ? <ChevronUp size={12} className="ml-auto" />
            : <ChevronDown size={12} className="ml-auto" />}
        </button>

        {configOpen && (
          <div
            className="mt-2 flex flex-col gap-3 p-3 rounded-xl border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {/* Dólar rate */}
            <div>
              <label className="label block mb-1.5">{t(lang, 'dolarRate')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={dolarInput}
                  onChange={e => setDolarInput(e.target.value)}
                  placeholder={String(dolarRate)}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border outline-none text-[12px] mono tnum"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button
                  type="button"
                  onClick={handleDolarUpdate}
                  className="btn-fin"
                  style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none', fontWeight: 600 }}
                >
                  {t(lang, 'updateDolar')}
                </button>
              </div>
            </div>

            {/* Account balances */}
            <div>
              <div className="label mb-2">{t(lang, 'finSaldosCuenta')}</div>
              <div className="flex flex-col gap-2">
                {cuentas.flatMap(g => g.items ?? []).map(cuenta => {
                  const edit = saldoEdits[cuenta.id] ?? {}
                  const arsVal = edit.ars ?? ''
                  const usdVal = edit.usd ?? ''
                  const hasUSD = (cuenta.usd ?? 0) > 0 || usdVal !== ''

                  const inputStyle = {
                    borderColor: 'var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                  }

                  const setEdit = (field, val) =>
                    setSaldoEdits(prev => ({
                      ...prev,
                      [cuenta.id]: { ...(prev[cuenta.id] ?? {}), [field]: val },
                    }))

                  const handleSave = () => {
                    const newArs = parseFloat(String(arsVal).replace(',', '.'))
                    const newUsd = parseFloat(String(usdVal).replace(',', '.'))
                    updateFinCuenta(
                      cuenta.id,
                      isNaN(newArs) ? (cuenta.ars ?? 0) : newArs,
                      isNaN(newUsd) ? (cuenta.usd ?? 0) : newUsd,
                    )
                    setSaldoEdits(prev => { const n = { ...prev }; delete n[cuenta.id]; return n })
                  }

                  const dirty = arsVal !== '' || usdVal !== ''

                  return (
                    <div key={cuenta.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-5 h-5 rounded shrink-0 grid place-items-center text-[8px] font-bold text-white"
                          style={{ background: cuenta.color ?? 'var(--accent)' }}
                        >
                          {cuenta.initials?.[0] ?? '?'}
                        </div>
                        <span className="text-[11.5px] font-medium flex-1" style={{ color: 'var(--text)' }}>
                          {cuenta.name}
                        </span>
                        <span className="text-[10px] mono tnum" style={{ color: 'var(--subtext)' }}>
                          {t(lang, 'finActual')}: {fmtARS(cuenta.ars ?? 0)}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          value={arsVal}
                          onChange={e => setEdit('ars', e.target.value)}
                          placeholder={`ARS ${Math.round(cuenta.ars ?? 0)}`}
                          className="flex-1 px-2 py-1 rounded-lg border outline-none text-[11px] mono tnum"
                          style={inputStyle}
                          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                        />
                        {hasUSD && (
                          <input
                            type="number"
                            value={usdVal}
                            onChange={e => setEdit('usd', e.target.value)}
                            placeholder={`USD ${cuenta.usd ?? 0}`}
                            className="w-[72px] px-2 py-1 rounded-lg border outline-none text-[11px] mono tnum"
                            style={inputStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          />
                        )}
                        {dirty && (
                          <button
                            type="button"
                            onClick={handleSave}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold transition-all"
                            style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
                          >
                            OK
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
