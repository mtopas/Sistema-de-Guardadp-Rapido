import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, CalendarRange, Flame, PiggyBank, Database, ChevronLeft, ChevronRight, Plus, Wallet, Landmark, Banknote,
  RefreshCw, DollarSign, Pencil, Trash2, CheckSquare, Calculator, Menu,
} from 'lucide-react'
import { useFin } from '../../store/fin'
import { useAgenda } from '../../store/agenda'
import { Panel, Tabs, Modal, Field, Swatches, Seg, ConfirmButton, AnimatedNumber, Loader , useBusy } from '../../components/ui'
import { dolarDe, fmtARS, fmtUSD, fmtPct, totalesMes, TIPOS_CUENTA } from '../../lib/fin'
import { monthLabel, shiftMonth, toISOMonth, relativeTime, fmtDate } from '../../lib/dates'
import { DashboardCenter, DashboardRight } from './Dashboard'
import { AnualCenter, AnualRight } from './Anual'
import { FireCenter, FireRight } from './Fire'
import { AhorroCenter, AhorroRight } from './Ahorro'
import { DatosCenter, DatosRight } from './Datos'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, C: DashboardCenter, R: DashboardRight, mes: true },
  { id: 'anual', label: 'Anual', icon: CalendarRange, C: AnualCenter, R: AnualRight },
  { id: 'fire', label: 'FIRE', icon: Flame, C: FireCenter, R: FireRight },
  { id: 'ahorro', label: 'Ahorro', icon: PiggyBank, C: AhorroCenter, R: AhorroRight },
  { id: 'datos', label: 'Datos', icon: Database, C: DatosCenter, R: DatosRight },
]

export default function FinanzasScreen() {
  const { tab, setTab, mes, setMes, loaded, openMov } = useFin()
  const [drawer, setDrawer] = useState(false)
  const t = TABS.find((x) => x.id === tab) || TABS[0]

  useEffect(() => {
    const h = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openMov({}) }
      const i = Number(e.key)
      if (i >= 1 && i <= 5) setTab(TABS[i - 1].id)
      if (t.mes && e.key === 'ArrowLeft') setMes(shiftMonth(mes, -1))
      if (t.mes && e.key === 'ArrowRight') setMes(shiftMonth(mes, 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mes, t, openMov, setMes, setTab])

  return (
    <div className="mod">
      <aside className="mod-col hide-sm-left">
        <FinLeft />
      </aside>
      <section className="mod-center">
        <div className="mod-bar">
          <button className="iconbtn show-sm" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          <Tabs id="fin" value={tab} onChange={setTab} tabs={TABS} />
          <span className="grow" />
          {t.mes && (
            <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
              <button className="iconbtn sm" onClick={() => setMes(shiftMonth(mes, -1))}><ChevronLeft size={16} /></button>
              <AnimatePresence mode="wait">
                <motion.span key={mes} className="display" style={{ minWidth: 150, textAlign: 'center', fontSize: 13, fontWeight: 600 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {monthLabel(mes)}
                </motion.span>
              </AnimatePresence>
              <button className="iconbtn sm" onClick={() => setMes(shiftMonth(mes, 1))}><ChevronRight size={16} /></button>
              {mes !== toISOMonth() && <button className="btn xs" onClick={() => setMes(toISOMonth())}>Hoy</button>}
            </div>
          )}
          <button className="btn primary sm" onClick={() => openMov({})} title="Nuevo movimiento (N)"><Plus size={15} /> Movimiento</button>
        </div>
        {!loaded ? (
          <div className="glass center" style={{ flex: 1 }}><Loader label="Cargando finanzas" /></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="mod-scroll" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
              <t.C />
            </motion.div>
          </AnimatePresence>
        )}
      </section>
      <aside className="mod-col mod-right">
        {loaded && (
          <AnimatePresence mode="wait">
            <motion.div key={tab} className="col" style={{ gap: 14 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <t.R />
            </motion.div>
          </AnimatePresence>
        )}
      </aside>
      <Modal open={drawer} onClose={() => setDrawer(false)} title="Resumen" icon={Wallet}>
        <FinLeft />
      </Modal>
      <style>{`@media (max-width: 860px) { .hide-sm-left { display: none !important; } }`}</style>
    </div>
  )
}

const GRUPO_ICON = { wallet: Wallet, bank: Landmark, cash: Banknote }

function FinLeft() {
  const { cuentas, movs, config, mes, actualizarDolar, recalcularSaldos } = useFin()
  const dolar = dolarDe(config)
  const [cuentaModal, setCuentaModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const tot = useMemo(() => totalesMes(movs, mes, dolar), [movs, mes, dolar])
  const patrimonioARS = cuentas.reduce((a, c) => a + Number(c.ars || 0) + (dolar ? Number(c.usd || 0) * dolar : 0), 0)
  const totalUSD = cuentas.reduce((a, c) => a + Number(c.usd || 0), 0)
  const objetivo = Number(config.tasa_ahorro_objetivo || 0)

  return (
    <>
      <Panel title="Patrimonio líquido" icon={Wallet} actions={<button className="iconbtn sm" title="Nueva cuenta" onClick={() => setCuentaModal({})}><Plus size={15} /></button>}>
        <div className="hero-num grad-text tnum"><AnimatedNumber value={patrimonioARS} format={(v) => fmtARS(v)} /></div>
        <div className="small muted mono" style={{ marginTop: 2 }}>{fmtUSD(totalUSD)} en dólares {dolar ? `· ≈ ${fmtUSD(patrimonioARS / dolar)}` : ''}</div>
        <div className="hr" />
        {TIPOS_CUENTA.map((t) => {
          const list = cuentas.filter((c) => (c.tipo || 'wallet') === t.id)
          if (!list.length) return null
          const I = GRUPO_ICON[t.id]
          return (
            <div key={t.id} style={{ marginBottom: 8 }}>
              <div className="tiny upper dim row gap6" style={{ margin: '4px 0' }}><I size={12} /> {t.grupo}</div>
              <div className="list">
                {list.map((c, i) => (
                  <motion.div key={c.id} className="li" onClick={() => setCuentaModal({ cuenta: c })} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <span className="center mono" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 11, fontWeight: 700, background: `${c.color || '#ffb800'}26`, color: c.color || '#ffb800', boxShadow: `0 0 14px -6px ${c.color || '#ffb800'}`, flexShrink: 0 }}>
                      {c.initials || c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="grow ellipsis small">{c.name}</span>
                    <span style={{ textAlign: 'right' }}>
                      <div className={`mono small tnum ${c.ars < 0 ? 'neg' : ''}`}>{fmtARS(c.ars)}</div>
                      {Number(c.usd) !== 0 && <div className={`mono tiny tnum ${c.usd < 0 ? 'neg' : 'muted'}`}>{fmtUSD(c.usd)}</div>}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          )
        })}
        {cuentas.length === 0 && <div className="small dim">Creá tu primera cuenta para empezar.</div>}
        <button className="btn xs ghost" style={{ marginTop: 4 }} disabled={busy} onClick={async () => { setBusy(true); await recalcularSaldos(); setBusy(false) }}>
          <Calculator size={12} /> Recalcular saldos
        </button>
      </Panel>

      <Panel title={monthLabel(mes)} icon={CalendarRange}>
        <div className="grid2" style={{ gap: 10 }}>
          <div><div className="tiny upper dim">Ingresos</div><div className="mono pos tnum">{fmtARS(tot.ingresos, { compact: true })}</div></div>
          <div><div className="tiny upper dim">Gastos</div><div className="mono neg tnum">{fmtARS(tot.gastos, { compact: true })}</div></div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="tiny upper dim grow">Tasa de ahorro</span>
          <b className="mono" style={{ color: tot.tasa >= objetivo ? 'var(--mint)' : 'var(--amber)' }}>{fmtPct(tot.tasa)}</b>
        </div>
        <div className="bar" style={{ marginTop: 6 }}>
          <i style={{ width: `${Math.max(0, Math.min(100, tot.tasa))}%` }} />
          {objetivo > 0 && <span style={{ position: 'absolute', left: `${Math.min(100, objetivo)}%`, top: -2, bottom: -2, width: 2, background: '#fff', boxShadow: '0 0 6px #fff' }} title={`Objetivo ${objetivo}%`} />}
        </div>
        {objetivo > 0 && <div className="tiny dim" style={{ marginTop: 4 }}>objetivo {objetivo}%</div>}
      </Panel>

      <Panel title="Dólar" icon={DollarSign} actions={<button className="iconbtn sm" title="Actualizar cotización" onClick={async () => { setBusy(true); await actualizarDolar(); setBusy(false) }}><RefreshCw size={14} className={busy ? 'spin' : ''} /></button>}>
        <div className="grid2">
          <div>
            <div className="tiny upper dim">MEP</div>
            <div className="display tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--amber)', textShadow: '0 0 18px rgba(255,184,0,.5)' }}>{config.dolar_mep ? `$${Number(config.dolar_mep).toLocaleString('es-AR')}` : '—'}</div>
          </div>
          <div>
            <div className="tiny upper dim">Oficial compra</div>
            <div className="display tnum" style={{ fontSize: 18, fontWeight: 600 }}>{config.dolar_oficial_compra ? `$${Number(config.dolar_oficial_compra).toLocaleString('es-AR')}` : '—'}</div>
          </div>
        </div>
        {config.dolar_actualizado_at && <div className="tiny dim" style={{ marginTop: 6 }}>actualizado {relativeTime(config.dolar_actualizado_at)}</div>}
      </Panel>

      <TareasFinancieras />
      <CuentaModal data={cuentaModal} onClose={() => setCuentaModal(null)} />
    </>
  )
}

const KEYWORDS = /pag(ar|o)|cuota|venc|factur|tarjeta|impuesto|expensa|alquiler|transfer|abonar|deuda|sueldo|cobrar/i

function TareasFinancieras() {
  const tareas = useAgenda((s) => s.tareas)
  const toggle = useAgenda((s) => s.toggleTarea)
  const nav = useNavigate()
  const list = tareas.filter((t) => !t.completada && KEYWORDS.test(t.titulo)).slice(0, 6)
  if (!list.length) return null
  return (
    <Panel title="Pendientes con plata" icon={CheckSquare} actions={<button className="btn xs ghost" onClick={() => nav('/agenda')}>Agenda</button>}>
      <div className="list">
        {list.map((t) => (
          <div key={t.id} className="li" onClick={() => toggle(t)}>
            <span className="check" />
            <span className="grow ellipsis small">{t.titulo}</span>
            {t.fecha_opcional && <span className="tiny dim">{fmtDate(t.fecha_opcional)}</span>}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function CuentaModal({ data, onClose }) {
  const { crearCuenta, editarCuenta, borrarCuenta, ajustarSaldo } = useFin()
  const c = data?.cuenta
  const [f, setF] = useState({})
  useEffect(() => {
    if (!data) return
    setF(c
      ? { nombre: c.name, tipo: c.tipo || 'wallet', color: c.color || '#ffb800', initials: c.initials || '', ars: c.ars, usd: c.usd }
      : { nombre: '', tipo: 'bank', color: '#ffb800', initials: '', ars: '', usd: '' })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, saving] = useBusy(async () => {
    if (!f.nombre?.trim()) return
    if (c) {
      await editarCuenta(c.id, { nombre: f.nombre.trim(), tipo: f.tipo, color: f.color, initials: f.initials || null })
      if (Number(f.ars) !== Number(c.ars) || Number(f.usd) !== Number(c.usd)) await ajustarSaldo(c, Number(f.ars || 0), Number(f.usd || 0))
    } else {
      await crearCuenta({ nombre: f.nombre.trim(), tipo: f.tipo, color: f.color, initials: f.initials || null, saldo_ars: Number(f.ars || 0), saldo_usd: Number(f.usd || 0) })
    }
    onClose()
  })
  return (
    <Modal open={!!data} onClose={onClose} title={c ? `Cuenta · ${c.name}` : 'Nueva cuenta'} icon={Landmark} onSubmit={save}
      footer={<>
        {c && <ConfirmButton onConfirm={async () => { await borrarCuenta(c.id); onClose() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}
    >
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Nombre" className="grow"><input autoFocus className="input" value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        <Field label="Sigla"><input className="input" style={{ width: 80 }} maxLength={3} value={f.initials || ''} onChange={(e) => setF({ ...f, initials: e.target.value.toUpperCase() })} /></Field>
      </div>
      <Field label="Tipo"><Seg id="cta-tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={TIPOS_CUENTA.map((t) => ({ id: t.id, label: t.label }))} /></Field>
      <Field label="Color"><Swatches value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
      <div className="grid2">
        <Field label={c ? 'Saldo ARS real' : 'Saldo inicial ARS'}><input type="number" className="input mono" value={f.ars ?? ''} onChange={(e) => setF({ ...f, ars: e.target.value })} /></Field>
        <Field label={c ? 'Saldo USD real' : 'Saldo inicial USD'}><input type="number" className="input mono" value={f.usd ?? ''} onChange={(e) => setF({ ...f, usd: e.target.value })} /></Field>
      </div>
      <div className="small dim">
        {c ? 'Los saldos se derivan de los movimientos: si cambiás el saldo se registra un movimiento de categoría “Ajuste” por la diferencia.' : 'El saldo inicial se registra como un movimiento de “Ajuste”.'}
      </div>
    </Modal>
  )
}

