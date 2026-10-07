import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Archive, ArrowUpRight, CalendarDays, CheckSquare2,
  ChevronRight, Clock3, LoaderCircle, Repeat2, RotateCcw, Sparkles,
  WalletCards, X,
} from 'lucide-react'
import { API_URL } from '../config'
import {
  MOBILE_ACTIONS, loadMobileTargets, mobileDestination,
  submitMobileCapture, undoMobileCapture,
} from '../mobile/mobileCapture'

const ACTION_ICONS = {
  gasto: WalletCards,
  boveda: Archive,
  tarea: CheckSquare2,
  habito: Repeat2,
  jarvis: Sparkles,
}

const ACTION_STYLES = {
  gasto: 'bg-[#f1c56b] text-[#20211e]',
  boveda: 'bg-[#d7d1c1] text-[#20211e]',
  tarea: 'bg-[#b9ccff] text-[#18213b]',
  habito: 'bg-[#b9d8b4] text-[#16331d]',
  jarvis: 'bg-[#20211e] text-[#f4f0e5]',
}

function formatLongDate(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  const formatted = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function EmptyLine({ children }) {
  return <p className="py-5 text-sm text-[#77766e]">{children}</p>
}

export default function MobileHoyScreen() {
  const loadedRef = useRef(false)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')
  const [activeAction, setActiveAction] = useState(null)
  const [targets, setTargets] = useState({})
  const [targetLoading, setTargetLoading] = useState(false)
  const [text, setText] = useState('')
  const [fields, setFields] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  const refreshSummary = async () => {
    try {
      setSummaryError('')
      const response = await fetch(`${API_URL}/mobile/hoy`)
      if (!response.ok) throw new Error('No se pudo cargar Hoy')
      setSummary(await response.json())
    } catch {
      setSummaryError('No pude actualizar tu día. Revisá la conexión.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    refreshSummary()
  }, [])

  const action = useMemo(
    () => MOBILE_ACTIONS.find(item => item.id === activeAction),
    [activeAction],
  )

  const openAction = async (id) => {
    setActiveAction(id)
    setTargets({})
    setFields({})
    setText('')
    setFormError('')
    setConfirmation(null)
    setTargetLoading(true)
    try {
      setTargets(await loadMobileTargets(id))
    } catch (error) {
      setFormError(error.message)
    } finally {
      setTargetLoading(false)
    }
  }

  const closeAction = () => {
    if (submitting) return
    setActiveAction(null)
    setConfirmation(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      const result = await submitMobileCapture({ action: activeAction, text, fields, targets, today: summary?.fecha })
      setConfirmation(result)
      if (activeAction !== 'jarvis') refreshSummary()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const undo = async () => {
    if (!confirmation?.undo) return
    setSubmitting(true)
    setFormError('')
    try {
      await undoMobileCapture(confirmation.undo)
      setConfirmation(current => ({ ...current, title: 'Acción deshecha', undo: null, undone: true }))
      refreshSummary()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  const destination = activeAction ? mobileDestination(activeAction, fields, targets) : ''
  const next = summary?.proximo_bloque

  return (
    <div className="min-h-[100dvh] bg-[#d9d5c9] text-[#20211e]" style={{ fontFamily: "'Aptos', 'Segoe UI', sans-serif" }}>
      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[760px] overflow-hidden bg-[#f4f0e5] shadow-[0_0_80px_rgba(32,33,30,.18)]">
        <div className="pointer-events-none absolute right-[-88px] top-[-62px] h-56 w-56 rounded-full border-[34px] border-[#e56b3f]/10" />
        <div className="pointer-events-none absolute left-[-52px] top-[330px] h-32 w-32 rotate-12 border border-[#20211e]/5" />

        <main className="relative px-5 pb-12 pt-6 sm:px-9 sm:pt-9">
          <header className="mb-8 flex items-start justify-between border-b border-[#20211e]/15 pb-5">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[#e1582d]">SGR · Parte diario</p>
              <h1 className="font-serif text-[44px] leading-none tracking-[-0.055em] sm:text-5xl">Hoy</h1>
              <p className="mt-2 text-sm text-[#6f6d65]">{formatLongDate(summary?.fecha)}</p>
            </div>
            <a href="/" className="group flex items-center gap-1 border-b border-[#20211e] pb-1 text-xs font-semibold">
              Escritorio <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </header>

          {summaryError && (
            <div className="mb-5 flex items-center gap-3 border-l-4 border-[#c9482b] bg-[#f5d7cd] px-4 py-3 text-sm">
              <AlertTriangle size={18} /> {summaryError}
            </div>
          )}

          <section aria-labelledby="next-title" className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="next-title" className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#67665f]">Próximo bloque</h2>
              <Clock3 size={16} strokeWidth={1.7} />
            </div>
            <div className="relative overflow-hidden bg-[#20211e] px-5 py-5 text-[#f4f0e5] sm:px-7 sm:py-6">
              <div className="absolute right-0 top-0 h-full w-1.5 bg-[#e1582d]" />
              {loading ? (
                <div className="h-16 animate-pulse bg-white/10" />
              ) : next ? (
                <div className="grid grid-cols-[70px_1fr] items-center gap-4">
                  <p className="font-serif text-3xl tracking-[-0.04em]">{next.hora}</p>
                  <div className="border-l border-white/20 pl-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f1c56b]">{next.tipo}</p>
                    <p className="mt-1 text-lg font-semibold leading-tight">{next.titulo}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-serif text-2xl">Sin bloques pendientes.</p>
                    <p className="mt-1 text-sm text-white/60">El resto del día está despejado.</p>
                  </div>
                  <span className="text-3xl">○</span>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="actions-title" className="mb-9">
            <h2 id="actions-title" className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#67665f]">Captura rápida</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_ACTIONS.map((item) => {
                const Icon = ACTION_ICONS[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openAction(item.id)}
                    className={`${ACTION_STYLES[item.id]} group flex min-h-[94px] flex-col justify-between p-4 text-left transition-transform active:scale-[.98] ${item.id === 'jarvis' ? 'col-span-2 min-h-[80px] flex-row items-center' : ''}`}
                  >
                    <Icon size={21} strokeWidth={1.8} />
                    <span className="flex w-full items-end justify-between gap-2">
                      <span>
                        <span className="block text-[9px] font-bold uppercase tracking-[0.18em] opacity-60">{item.eyebrow}</span>
                        <span className="mt-0.5 block text-[15px] font-bold">{item.label}</span>
                      </span>
                      <ChevronRight size={17} className="transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="grid gap-8 sm:grid-cols-2 sm:gap-x-8">
            <section aria-labelledby="tasks-title">
              <div className="mb-2 flex items-center justify-between border-b border-[#20211e]/20 pb-2">
                <h2 id="tasks-title" className="font-serif text-2xl tracking-[-0.035em]">En foco</h2>
                <span className="text-xs tabular-nums text-[#77766e]">{summary?.tareas?.length || 0}/3</span>
              </div>
              {loading ? <div className="mt-4 h-24 animate-pulse bg-[#e8e3d7]" /> : summary?.tareas?.length ? (
                <ol className="divide-y divide-[#20211e]/10">
                  {summary.tareas.map((task, index) => (
                    <li key={task.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-2 py-3">
                      <span className="font-serif text-lg text-[#aaa79e]">0{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold leading-snug">{task.titulo}</p>
                        <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wider ${task.vencida ? 'text-[#c9482b]' : 'text-[#77766e]'}`}>
                          {task.vencida ? 'Vencida' : task.fecha === summary.fecha ? 'Hoy' : task.fecha || 'Sin fecha'}
                        </p>
                      </div>
                      {task.hora && <span className="text-xs tabular-nums text-[#67665f]">{task.hora}</span>}
                    </li>
                  ))}
                </ol>
              ) : <EmptyLine>No hay tareas pidiendo atención.</EmptyLine>}
            </section>

            <section aria-labelledby="habits-title">
              <div className="mb-2 flex items-center justify-between border-b border-[#20211e]/20 pb-2">
                <h2 id="habits-title" className="font-serif text-2xl tracking-[-0.035em]">Rituales</h2>
                <Repeat2 size={16} />
              </div>
              {loading ? <div className="mt-4 h-24 animate-pulse bg-[#e8e3d7]" /> : summary?.habitos_pendientes?.length ? (
                <ul className="flex flex-wrap gap-2 pt-3">
                  {summary.habitos_pendientes.map(habit => (
                    <li key={habit.id} className="flex items-center gap-2 border border-[#20211e]/15 bg-white/45 px-3 py-2 text-sm font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: habit.color }} />
                      {habit.nombre}
                      {habit.progreso > 0 && <span className="text-[10px] text-[#987326]">½</span>}
                    </li>
                  ))}
                </ul>
              ) : <EmptyLine>Todos los hábitos de hoy están hechos.</EmptyLine>}
            </section>
          </div>

          {!!summary?.alertas_financieras?.length && (
            <section aria-labelledby="alerts-title" className="mt-8 border border-[#c9482b]/35 bg-[#f7dfd6] p-4">
              <h2 id="alerts-title" className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#a33820]">
                <AlertTriangle size={15} /> Excepción financiera
              </h2>
              {summary.alertas_financieras.map(alert => (
                <div key={`${alert.cuenta_id}-${alert.moneda}`} className="flex justify-between gap-3 text-sm">
                  <span>{alert.cuenta} quedó en negativo</span>
                  <strong>{formatMoney(alert.monto, alert.moneda)}</strong>
                </div>
              ))}
            </section>
          )}
        </main>

        {activeAction && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#11120f]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={event => event.target === event.currentTarget && closeAction()}>
            <section role="dialog" aria-modal="true" aria-labelledby="capture-title" className="max-h-[92dvh] w-full max-w-[620px] overflow-y-auto bg-[#fbf8ef] shadow-2xl">
              <div className={`${ACTION_STYLES[activeAction]} flex items-start justify-between px-5 py-4 sm:px-7`}>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-60">{action?.eyebrow}</p>
                  <h2 id="capture-title" className="mt-1 font-serif text-3xl tracking-[-0.04em]">{action?.prompt}</h2>
                </div>
                <button type="button" aria-label="Cerrar" onClick={closeAction} className="p-1"><X size={22} /></button>
              </div>

              {confirmation ? (
                <div className="px-5 py-7 sm:px-7">
                  <div className={`mb-5 border-l-4 ${confirmation.undone ? 'border-[#77766e]' : 'border-[#2f7d48]'} bg-white px-4 py-4`}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#77766e]">Confirmación</p>
                    <p className="mt-1 font-serif text-2xl">{confirmation.title}</p>
                    <p className="mt-1 text-sm text-[#67665f]">{confirmation.detail}</p>
                  </div>
                  {confirmation.answer && (
                    <div className="mb-5 max-h-60 overflow-y-auto border border-[#20211e]/15 bg-[#f0ece1] p-4 text-sm leading-relaxed whitespace-pre-wrap">
                      {confirmation.answer}
                    </div>
                  )}
                  {formError && <p className="mb-4 text-sm font-semibold text-[#b53e24]">{formError}</p>}
                  <div className="flex gap-3">
                    {confirmation.undo && (
                      <button type="button" onClick={undo} disabled={submitting} className="flex flex-1 items-center justify-center gap-2 border border-[#20211e] px-4 py-3 text-sm font-bold disabled:opacity-50">
                        <RotateCcw size={16} /> Deshacer
                      </button>
                    )}
                    <button type="button" onClick={closeAction} className="flex-1 bg-[#20211e] px-4 py-3 text-sm font-bold text-white">Listo</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="px-5 py-6 sm:px-7">
                  <div className="mb-5 border-b border-[#20211e]/15 pb-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#77766e]">Destino confirmado</p>
                    <p data-testid="mobile-destination" className="mt-1 text-sm font-bold">{targetLoading ? 'Buscando destino…' : destination}</p>
                  </div>

                  {activeAction === 'gasto' && (
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <label className="col-span-2 sm:col-span-1">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider">Monto ARS</span>
                        <input name="amount" inputMode="decimal" value={fields.amount || ''} onChange={event => setFields({ ...fields, amount: event.target.value })} placeholder="0,00" className="w-full border border-[#20211e]/25 bg-white px-3 py-3 text-lg outline-none focus:border-[#20211e]" />
                      </label>
                      <label className="col-span-2 sm:col-span-1">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider">Cuenta</span>
                        <select name="account" value={fields.accountId || ''} onChange={event => setFields({ ...fields, accountId: event.target.value })} className="w-full border border-[#20211e]/25 bg-white px-3 py-3 outline-none focus:border-[#20211e]">
                          <option value="">Elegir…</option>
                          {targets.accounts?.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                        </select>
                      </label>
                      <label className="col-span-2">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider">Categoría</span>
                        <select name="category" value={fields.categoryName || ''} onChange={event => setFields({ ...fields, categoryName: event.target.value })} className="w-full border border-[#20211e]/25 bg-white px-3 py-3 outline-none focus:border-[#20211e]">
                          <option value="">Elegir…</option>
                          {targets.categories?.map(category => <option key={category.id} value={category.nombre}>{category.nombre}</option>)}
                        </select>
                      </label>
                    </div>
                  )}

                  {activeAction === 'tarea' && (
                    <label className="mb-4 block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider">Lista opcional</span>
                      <select name="list" value={fields.listId || ''} onChange={event => setFields({ ...fields, listId: event.target.value })} className="w-full border border-[#20211e]/25 bg-white px-3 py-3 outline-none focus:border-[#20211e]">
                        <option value="">Sin lista</option>
                        {targets.lists?.map(list => <option key={list.id} value={list.id}>{list.nombre}</option>)}
                      </select>
                    </label>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider">Texto</span>
                    <textarea autoFocus value={text} onChange={event => setText(event.target.value)} placeholder={action?.placeholder} rows={activeAction === 'jarvis' ? 4 : 3} className="w-full resize-none border border-[#20211e]/25 bg-white px-3 py-3 text-base leading-relaxed outline-none focus:border-[#20211e]" />
                  </label>

                  {formError && <p role="alert" className="mt-3 text-sm font-semibold text-[#b53e24]">{formError}</p>}
                  <button type="submit" disabled={submitting || targetLoading} className="mt-5 flex w-full items-center justify-center gap-2 bg-[#20211e] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50">
                    {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Guardando…</> : <>Confirmar en {action?.label}<ChevronRight size={16} /></>}
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
