import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Settings, ChevronDown, ChevronUp, CalendarClock, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { fmtARS, fmtUSD, fmtDolarQuote, isTransferencia } from '../../data/finanzas'
import { BRANCH_COLORS } from '../../utils/themes'

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
  const fetchDolarCotizacion = useStore(s => s.fetchDolarCotizacion)
  const createFinCuenta       = useStore(s => s.createFinCuenta)
  const editFinCuentaMeta     = useStore(s => s.editFinCuentaMeta)
  const deleteFinCuenta       = useStore(s => s.deleteFinCuenta)
  const recalcularFinSaldos   = useStore(s => s.recalcularFinSaldos)
  const showToast             = useStore(s => s.showToast)
  const agendaTareas       = useStore(s => s.agendaTareas)

  const [configOpen, setConfigOpen] = useState(false)
  const [refreshState, setRefreshState] = useState('idle')
  const [recalcState, setRecalcState] = useState('idle')

  const EMPTY_CUENTA = { nombre: '', tipo: 'wallet', color: BRANCH_COLORS[0], initials: '', saldo_ars: '', saldo_usd: '' }
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_CUENTA)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_CUENTA)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Normalise cuentas to grouped format (API may return flat or grouped)
  const cuentas = useMemo(() => {
    if (!finCuentas || finCuentas.length === 0) return []
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

  const dolarMEP         = finConfig?.dolar_mep            ?? null
  const dolarOficialComp = finConfig?.dolar_oficial_compra  ?? null
  const dolarRate        = finConfig?.dolar_oficial         ?? null

  const tareasFinancieras = useMemo(() =>
    agendaTareas.filter(t => !t.completada && FIN_KEYWORDS.test(t.titulo)).slice(0, 6),
    [agendaTareas]
  )

  const handleRefreshDolar = async () => {
    if (refreshState === 'fetching') return
    setRefreshState('fetching')
    try {
      await fetchDolarCotizacion()
      setRefreshState('ok')
    } catch {
      setRefreshState('err')
    } finally {
      setTimeout(() => setRefreshState('idle'), 2500)
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
          <span>MEP {(dolarMEP ?? dolarRate) != null ? `${fmtDolarQuote(dolarMEP ?? dolarRate)} ARS` : '—'}</span>
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
              {fmtARS(ingresosMes)}
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
              {fmtARS(gastosMes)}
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
            {/* Cotización dólar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label">Cotización</span>
                <button
                  type="button"
                  onClick={handleRefreshDolar}
                  disabled={refreshState === 'fetching'}
                  className="text-[10.5px] flex items-center gap-1 transition-colors"
                  style={{
                    color: refreshState === 'ok'  ? 'var(--success, #22c55e)'
                         : refreshState === 'err' ? '#ef4444'
                         : 'var(--accent)',
                    opacity: refreshState === 'fetching' ? 0.6 : 1,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  {refreshState === 'fetching' ? '…'
                   : refreshState === 'ok'     ? '✓'
                   : refreshState === 'err'    ? '✗'
                   : '↻'} Actualizar
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--subtext)' }}>MEP <span className="opacity-60 text-[9px]">(FIRE)</span></span>
                  <span className="text-[12px] font-semibold mono tnum" style={{ color: 'var(--text)' }}>
                    {fmtDolarQuote(dolarMEP)}
                  </span>
                </div>
                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-[11px]" style={{ color: 'var(--subtext)' }}>Oficial compra</span>
                  <span className="text-[12px] font-semibold mono tnum" style={{ color: 'var(--text)' }}>
                    {fmtDolarQuote(dolarOficialComp)}
                  </span>
                </div>
                {finConfig?.dolar_actualizado_at && (
                  <div className="text-[10px] text-right" style={{ color: 'var(--subtext)' }}>
                    {(() => {
                      const diff = Date.now() - new Date(finConfig.dolar_actualizado_at).getTime()
                      const mins = Math.floor(diff / 60000)
                      if (mins < 1) return 'Actualizado ahora'
                      if (mins < 60) return `Hace ${mins}m`
                      const hs = Math.floor(mins / 60)
                      if (hs < 24) return `Hace ${hs}h`
                      return `Hace ${Math.floor(hs / 24)}d`
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Cuentas + saldos (derivados de movimientos) */}
            <div>
              <div className="label mb-1">{t(lang, 'finSaldosCuenta')}</div>
              <p className="text-[10px] mb-2 leading-snug" style={{ color: 'var(--subtext)' }}>
                Los saldos se calculan desde tus movimientos. Para corregir, cargá un ingreso o gasto (categoría Ajuste).
              </p>
              <div className="flex flex-col gap-2">
                {cuentas.flatMap(g => g.items ?? []).map(cuenta => {
                  const hasUSD = (cuenta.usd ?? 0) > 0
                  const isEditing = editId === cuenta.id
                  const isDeleting = deleteConfirm === cuenta.id

                  const inputStyle = { borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text)' }

                  const startEdit = () => {
                    setEditForm({ nombre: cuenta.name, tipo: cuenta.tipo ?? 'wallet', color: cuenta.color ?? BRANCH_COLORS[0], initials: cuenta.initials ?? '' })
                    setEditId(cuenta.id)
                    setDeleteConfirm(null)
                  }

                  const handleMetaSave = () => {
                    if (!editForm.nombre.trim()) return
                    editFinCuentaMeta(cuenta.id, editForm.nombre.trim(), editForm.tipo, editForm.color, editForm.initials.slice(0, 3).toUpperCase())
                    setEditId(null)
                  }

                  return (
                    <div key={cuenta.id} className="flex flex-col gap-1 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Header row */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-5 h-5 rounded shrink-0 grid place-items-center text-[8px] font-bold text-white"
                          style={{ background: cuenta.color ?? 'var(--accent)' }}
                        >
                          {cuenta.initials?.[0] ?? '?'}
                        </div>
                        <span className="text-[11.5px] font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                          {cuenta.name}
                        </span>
                        <span className="text-[10px] mono tnum shrink-0 mr-1" style={{ color: 'var(--subtext)' }}>
                          {fmtARS(cuenta.ars ?? 0)}
                          {hasUSD ? ` · ${fmtUSD(cuenta.usd ?? 0)}` : ''}
                        </span>
                        <button type="button" onClick={startEdit} title="Editar"
                          className="shrink-0 p-0.5 rounded transition-colors"
                          style={{ color: isEditing ? 'var(--accent)' : 'var(--subtext)' }}>
                          <Pencil size={11} />
                        </button>
                        {!isDeleting
                          ? <button type="button" onClick={() => { setDeleteConfirm(cuenta.id); setEditId(null) }} title="Eliminar"
                              className="shrink-0 p-0.5 rounded transition-colors" style={{ color: 'var(--subtext)' }}>
                              <Trash2 size={11} />
                            </button>
                          : <span className="flex items-center gap-1 text-[10px]" style={{ color: '#ef4444' }}>
                              <button type="button" onClick={() => { deleteFinCuenta(cuenta.id); setDeleteConfirm(null) }}
                                className="font-semibold">¿Sí?</button>
                              <button type="button" onClick={() => setDeleteConfirm(null)}>
                                <X size={10} />
                              </button>
                            </span>
                        }
                      </div>

                      {/* Inline meta-edit form */}
                      {isEditing && (
                        <div className="flex flex-col gap-1.5 mt-1 p-2 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                          <input
                            type="text"
                            value={editForm.nombre}
                            onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))}
                            placeholder="Nombre"
                            className="min-w-0 w-full px-2 py-1 rounded-lg border outline-none text-[11px]"
                            style={inputStyle}
                            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          />
                          <div className="flex gap-1.5">
                            <select
                              value={editForm.tipo}
                              onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value }))}
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg border outline-none text-[11px]"
                              style={inputStyle}
                            >
                              <option value="wallet">Wallet</option>
                              <option value="bank">Banco</option>
                              <option value="cash">Efectivo</option>
                            </select>
                            <input
                              type="text"
                              value={editForm.initials}
                              onChange={e => setEditForm(p => ({ ...p, initials: e.target.value.slice(0, 3).toUpperCase() }))}
                              placeholder="ABC"
                              maxLength={3}
                              className="w-14 px-2 py-1 rounded-lg border outline-none text-[11px] mono text-center"
                              style={inputStyle}
                              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {BRANCH_COLORS.map(c => (
                              <button key={c} type="button" onClick={() => setEditForm(p => ({ ...p, color: c }))}
                                className="w-5 h-5 rounded-md transition-all"
                                style={{ background: c, outline: editForm.color === c ? '2px solid var(--text)' : 'none', outlineOffset: 1 }}
                              />
                            ))}
                          </div>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={handleMetaSave}
                              className="flex-1 py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
                              style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}>
                              <Check size={11} /> Guardar
                            </button>
                            <button type="button" onClick={() => setEditId(null)}
                              className="px-2 py-1 rounded-lg text-[11px]"
                              style={{ background: 'var(--surface)', color: 'var(--subtext)', border: '1px solid var(--border)' }}>
                              <X size={11} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                disabled={recalcState === 'loading'}
                onClick={async () => {
                  setRecalcState('loading')
                  const ok = await recalcularFinSaldos()
                  setRecalcState(ok ? 'ok' : 'err')
                  showToast(ok ? 'Saldos recalculados desde movimientos' : 'No se pudo recalcular', ok ? 'success' : 'error')
                  setTimeout(() => setRecalcState('idle'), 2000)
                }}
                className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--subtext)', background: 'transparent' }}
              >
                {recalcState === 'loading' ? 'Recalculando…' : 'Recalcular saldos desde movimientos'}
              </button>

              {/* Nueva cuenta */}
              <button type="button" onClick={() => { setNewOpen(v => !v); setNewForm(EMPTY_CUENTA) }}
                className="mt-2 flex items-center gap-1.5 text-[11px] w-full py-1 rounded-lg transition-colors"
                style={{ color: 'var(--accent)' }}>
                <Plus size={12} /> Nueva cuenta
              </button>

              {newOpen && (
                <div className="mt-1 flex flex-col gap-1.5 p-2 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <input type="text" value={newForm.nombre}
                    onChange={e => setNewForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Nombre"
                    className="min-w-0 w-full px-2 py-1 rounded-lg border outline-none text-[11px]"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                  <div className="flex gap-1.5">
                    <select value={newForm.tipo}
                      onChange={e => setNewForm(p => ({ ...p, tipo: e.target.value }))}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg border outline-none text-[11px]"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="wallet">Wallet</option>
                      <option value="bank">Banco</option>
                      <option value="cash">Efectivo</option>
                    </select>
                    <input type="text" value={newForm.initials}
                      onChange={e => setNewForm(p => ({ ...p, initials: e.target.value.slice(0, 3).toUpperCase() }))}
                      placeholder="ABC" maxLength={3}
                      className="w-14 px-2 py-1 rounded-lg border outline-none text-[11px] mono text-center"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {BRANCH_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setNewForm(p => ({ ...p, color: c }))}
                        className="w-5 h-5 rounded-md transition-all"
                        style={{ background: c, outline: newForm.color === c ? '2px solid var(--text)' : 'none', outlineOffset: 1 }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--subtext)' }}>Saldo inicial (opcional, crea movimientos)</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      value={newForm.saldo_ars}
                      onChange={e => setNewForm(p => ({ ...p, saldo_ars: e.target.value }))}
                      placeholder="ARS 0"
                      className="min-w-0 w-full px-2 py-1 rounded-lg border outline-none text-[11px] mono tnum"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <input
                      type="number"
                      value={newForm.saldo_usd}
                      onChange={e => setNewForm(p => ({ ...p, saldo_usd: e.target.value }))}
                      placeholder="USD 0"
                      className="min-w-0 w-full px-2 py-1 rounded-lg border outline-none text-[11px] mono tnum"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button"
                      disabled={!newForm.nombre.trim()}
                      onClick={() => {
                        if (!newForm.nombre.trim()) return
                        const ars = parseFloat(String(newForm.saldo_ars).replace(',', '.'))
                        const usd = parseFloat(String(newForm.saldo_usd).replace(',', '.'))
                        createFinCuenta(
                          newForm.nombre.trim(),
                          newForm.tipo,
                          newForm.color,
                          newForm.initials.slice(0, 3).toUpperCase() || newForm.nombre.slice(0, 2).toUpperCase(),
                          isNaN(ars) ? 0 : ars,
                          isNaN(usd) ? 0 : usd,
                        )
                        setNewOpen(false)
                        setNewForm(EMPTY_CUENTA)
                      }}
                      className="flex-1 py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1"
                      style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none', opacity: newForm.nombre.trim() ? 1 : 0.4 }}>
                      <Check size={11} /> Crear
                    </button>
                    <button type="button" onClick={() => setNewOpen(false)}
                      className="px-2 py-1 rounded-lg text-[11px]"
                      style={{ background: 'var(--surface)', color: 'var(--subtext)', border: '1px solid var(--border)' }}>
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
