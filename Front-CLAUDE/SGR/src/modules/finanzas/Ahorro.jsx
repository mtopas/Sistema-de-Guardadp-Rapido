import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PieChart, Target, Briefcase, Receipt, Plus, Pencil, Trash2, AlertTriangle, TrendingUp, ChevronDown, Flame, Filter } from 'lucide-react'
import { useFin } from '../../store/fin'
import { Panel, Modal, Field, Seg, ConfirmButton, Empty, Kpi, AnimatedNumber , useBusy } from '../../components/ui'
import { Donut, Legend, Ring } from '../../components/charts'
import {
  dolarDe, acumuladoCajon, colorFor, fmtARS, fmtUSD, fmtMoney, valorInstrumentoUSD, costoInstrumentoUSD, TIPOS_INSTRUMENTO,
  interesPlazoFijo, fireUSDPorMes,
} from '../../lib/fin'
import { fmtDate, toISODate, monthLabel, parseDate } from '../../lib/dates'

function useReparto() {
  const { movs, objetivos, instrumentos, config, categorias } = useFin()
  const dolar = dolarDe(config)
  return useMemo(() => {
    const cajones = [{ name: 'FIRE', value: acumuladoCajon(movs, 'FIRE', dolar) }]
    objetivos.forEach((o) => cajones.push({ name: o.nombre, value: acumuladoCajon(movs, o.nombre, dolar), objetivo: o }))
    const totalCajones = cajones.reduce((a, c) => a + c.value, 0)
    const costoInv = instrumentos.reduce((a, i) => a + (dolar ? costoInstrumentoUSD(i, dolar) * dolar : 0), 0)
    const liquido = totalCajones - costoInv
    const data = cajones.map((c) => ({ ...c, color: colorFor(c.name, categorias) }))
    const legacy = movs.filter((m) => (m.categoria_nombre || '').toLowerCase() === 'ahorro').length
    return { cajones: data, totalCajones, costoInv, liquido, legacy, dolar }
  }, [movs, objetivos, instrumentos, config, categorias]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function AhorroCenter() {
  const r = useReparto()
  const { instrumentos, config } = useFin()
  const dolar = dolarDe(config)
  const valorPort = instrumentos.reduce((a, i) => a + valorInstrumentoUSD(i, dolar), 0)
  const costoPort = instrumentos.reduce((a, i) => a + costoInstrumentoUSD(i, dolar), 0)
  const pieData = [...r.cajones.filter((c) => c.value > 0)]

  return (
    <>
      {r.legacy > 0 && (
        <motion.div className="glass card row" style={{ borderColor: 'rgba(255,184,0,.5)' }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <AlertTriangle size={18} style={{ color: 'var(--amber)' }} />
          <span className="small">Hay <b>{r.legacy}</b> movimientos con la categoría legacy <b>Ahorro</b>. Reasignalos a <b>FIRE</b> o a un objetivo desde la pestaña Datos.</span>
        </motion.div>
      )}
      <div className="kpis">
        <Kpi i={0} label="Total en cajones" value={<AnimatedNumber value={r.totalCajones} format={(v) => fmtARS(v, { compact: true })} />} sub={dolar ? `≈ ${fmtUSD(r.totalCajones / dolar, { compact: true })}` : ''} color="#ffb800" />
        <Kpi i={1} label="Invertido (costo)" value={<AnimatedNumber value={costoPort} format={(v) => fmtUSD(v, { compact: true })} />} sub={`${instrumentos.length} instrumentos`} color="#9d4bff" />
        <Kpi i={2} label="Valor portafolio" value={<AnimatedNumber value={valorPort} format={(v) => fmtUSD(v, { compact: true })} />} sub={costoPort ? `${valorPort >= costoPort ? '▲' : '▼'} ${(((valorPort - costoPort) / costoPort) * 100).toFixed(1)}% P&L` : ' '} color="#2effa8" />
        <Kpi i={3} label="Líquido sin invertir" value={<span className={r.liquido < 0 ? 'neg' : ''}><AnimatedNumber value={r.liquido} format={(v) => fmtARS(v, { compact: true })} /></span>} sub="cajones − costo instrumentos" color="#00f0ff" />
      </div>

      <Panel title="Reparto por cajón" icon={PieChart}>
        {pieData.length === 0 ? (
          <Empty title="Todavía no hay ahorro asignado">Registrá gastos con la categoría <b>FIRE</b> o con el nombre de un objetivo.</Empty>
        ) : (
          <div className="row wrap" style={{ gap: 22 }}>
            <Donut data={pieData} size={200} thickness={26} format={(v) => fmtARS(v, { compact: true })} center={<div><div className="tiny upper dim">cajones</div><div className="display" style={{ fontWeight: 700, fontSize: 14 }}>{fmtARS(r.totalCajones, { compact: true })}</div></div>} />
            <div className="grow" style={{ minWidth: 240 }}>
              <Legend data={pieData} format={(v) => fmtARS(v, { compact: true })} max={10} />
              <div className="hr" />
              <div className="row small"><span className="grow muted">− Costo de instrumentos</span><span className="mono">{fmtARS(r.costoInv, { compact: true })}</span></div>
              <div className="row small" style={{ marginTop: 4 }}><b className="grow">= Líquido sin invertir</b><b className={`mono ${r.liquido < 0 ? 'neg' : 'pos'}`}>{fmtARS(r.liquido, { compact: true })}</b></div>
            </div>
          </div>
        )}
      </Panel>

      <Objetivos />
      <Portafolio />
      <Ledger />
    </>
  )
}

function Objetivos() {
  const { objetivos, movs, config, categorias, borrarObjetivo } = useFin()
  const dolar = dolarDe(config)
  const [modal, setModal] = useState(null)
  return (
    <Panel title="Objetivos" icon={Target} actions={<button className="btn xs" onClick={() => setModal({})}><Plus size={13} /> Objetivo</button>}>
      {objetivos.length === 0 && <div className="small dim">Sin objetivos.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {objetivos.map((o, i) => {
          const acum = acumuladoCajon(movs, o.nombre, dolar, { moneda: o.moneda })
          const pct = o.meta ? acum / o.meta : 0
          const col = colorFor(o.nombre, categorias)
          const lim = parseDate(o.fecha_limite)
          const meses = lim ? Math.max(0, (lim.getFullYear() - new Date().getFullYear()) * 12 + lim.getMonth() - new Date().getMonth()) : null
          const falta = Math.max(0, (o.meta || 0) - acum)
          return (
            <motion.div key={o.id} className="glass neon-edge" style={{ padding: 14, borderRadius: 18 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ y: -3 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Ring value={pct} size={58} stroke={6} color={col} color2={col}>
                  <span className="mono small" style={{ fontWeight: 700 }}>{Math.round(pct * 100)}%</span>
                </Ring>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }} className="ellipsis">{o.nombre}</div>
                  <div className="mono small">{fmtMoney(acum, o.moneda, { compact: true })} <span className="dim">/ {fmtMoney(o.meta, o.moneda, { compact: true })}</span></div>
                  {o.fecha_limite && <div className="tiny dim">límite {fmtDate(o.fecha_limite, { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                </div>
                <div className="col gap4">
                  <button className="iconbtn sm" onClick={() => setModal({ obj: o })}><Pencil size={12} /></button>
                  <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={() => borrarObjetivo(o.id)} icon={<Trash2 size={12} />} />
                </div>
              </div>
              {(o.cuota_mensual || (meses && falta)) && (
                <div className="tiny muted" style={{ marginTop: 8 }}>
                  {o.cuota_mensual ? <>cuota plan {fmtMoney(o.cuota_mensual, o.moneda, { compact: true })}/mes</> : null}
                  {meses && falta ? <> · necesitás {fmtMoney(falta / Math.max(1, meses), o.moneda, { compact: true })}/mes</> : null}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
      <ObjetivoModal data={modal} onClose={() => setModal(null)} />
    </Panel>
  )
}

function ObjetivoModal({ data, onClose }) {
  const { crearObjetivo, editarObjetivo } = useFin()
  const o = data?.obj
  const [f, setF] = useState({})
  useEffect(() => {
    if (!data) return
    setF(o ? { nombre: o.nombre, meta: o.meta, moneda: o.moneda, fecha_limite: o.fecha_limite || '', cuota_mensual: o.cuota_mensual ?? '' } : { nombre: '', meta: '', moneda: 'ARS', fecha_limite: '', cuota_mensual: '' })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, saving] = useBusy(async () => {
    if (!f.nombre?.trim() || !Number(f.meta)) return
    const body = { meta: Number(f.meta), moneda: f.moneda, fecha_limite: f.fecha_limite || null, cuota_mensual: f.cuota_mensual === '' ? null : Number(f.cuota_mensual) }
    const ok = o ? await editarObjetivo(o.id, body) : await crearObjetivo({ nombre: f.nombre.trim(), ...body })
    if (ok) onClose()
  })
  return (
    <Modal open={!!data} onClose={onClose} title={o ? `Objetivo · ${o.nombre}` : 'Nuevo objetivo'} icon={Target} onSubmit={save}
      footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
      <Field label="Nombre (crea una categoría homónima)"><input autoFocus className="input" disabled={!!o} value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
      {o && <div className="tiny dim">El nombre no se puede cambiar: está vinculado a su categoría.</div>}
      <div className="grid2">
        <Field label="Meta"><input type="number" className="input mono" value={f.meta ?? ''} onChange={(e) => setF({ ...f, meta: e.target.value })} /></Field>
        <Field label="Moneda"><Seg id="obj-mon" value={f.moneda} onChange={(v) => setF({ ...f, moneda: v })} options={['ARS', 'USD']} /></Field>
        <Field label="Fecha límite"><input type="date" className="input" value={f.fecha_limite || ''} onChange={(e) => setF({ ...f, fecha_limite: e.target.value })} /></Field>
        <Field label="Cuota mensual"><input type="number" className="input mono" value={f.cuota_mensual ?? ''} onChange={(e) => setF({ ...f, cuota_mensual: e.target.value })} /></Field>
      </div>
      <div className="small dim">Para aportar: registrá un <b>gasto</b> con la categoría “{f.nombre || 'objetivo'}”. Un ingreso en esa categoría resta (retiro).</div>
    </Modal>
  )
}

function Portafolio() {
  const { instrumentos, config, editarInstrumento, borrarInstrumento, transacciones } = useFin()
  const dolar = dolarDe(config)
  const [modal, setModal] = useState(null)
  const [txModal, setTxModal] = useState(null)
  const [open, setOpen] = useState({})
  return (
    <Panel title="Portafolio" icon={Briefcase} actions={<><button className="btn xs" onClick={() => setTxModal({})}><Receipt size={13} /> Operación</button><button className="btn xs" onClick={() => setModal({})}><Plus size={13} /> Instrumento</button></>}>
      {instrumentos.length === 0 ? (
        <Empty icon={Briefcase} title="Sin inversiones">Registrá una compra (se crea el instrumento automáticamente) o cargá un plazo fijo.</Empty>
      ) : (
        <div className="list">
          {instrumentos.map((i, k) => {
            const valor = valorInstrumentoUSD(i, dolar)
            const costo = costoInstrumentoUSD(i, dolar)
            const pl = costo ? ((valor - costo) / costo) * 100 : 0
            const txs = transacciones.filter((t) => t.instrumento_id === i.id)
            const isPF = i.tipo === 'plazo_fijo'
            return (
              <motion.div key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.03 }} className="glass" style={{ borderRadius: 14, padding: '4px 4px' }}>
                <div className="li" onClick={() => setOpen({ ...open, [i.id]: !open[i.id] })}>
                  <motion.span animate={{ rotate: open[i.id] ? 180 : 0 }} style={{ display: 'grid' }}><ChevronDown size={14} className="dim" /></motion.span>
                  <span className="chip" style={{ fontSize: 10 }}>{TIPOS_INSTRUMENTO.find((t) => t.id === i.tipo)?.label || i.tipo}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 600 }}>{i.ticker ? <span className="mono" style={{ color: 'var(--a1)' }}>{i.ticker} </span> : null}{i.nombre}</div>
                    <div className="tiny dim">{isPF ? `${i.entidad || ''} · TNA ${i.tna}% · vence ${fmtDate(i.fecha_vencimiento)}` : `${i.cantidad} u. · PPC ${i.cantidad ? fmtUSD(costo / i.cantidad) : '—'}`}</div>
                  </div>
                  {!isPF && (
                    <input
                      className="input sm mono hide-sm"
                      title="Precio actual (USD)"
                      style={{ width: 96, textAlign: 'right' }}
                      defaultValue={i.precio_actual ?? ''}
                      key={`${i.id}-${i.precio_actual}`}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { const v = e.target.value.replace(',', '.'); if (v !== String(i.precio_actual ?? '')) editarInstrumento(i.id, { precio_actual: v === '' ? null : Number(v) }) }}
                      placeholder="precio"
                    />
                  )}
                  <div style={{ textAlign: 'right', width: 110 }}>
                    <div className="mono small">{fmtUSD(valor)}</div>
                    <div className={`mono tiny ${pl >= 0 ? 'pos' : 'neg'}`}>{isPF ? `+${fmtARS(interesPlazoFijo(i), { compact: true })}` : `${pl >= 0 ? '+' : ''}${pl.toFixed(1)}%`}</div>
                  </div>
                </div>
                <AnimatePresence>
                  {open[i.id] && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '4px 12px 12px' }}>
                        {txs.length > 0 && (
                          <table className="tbl" style={{ marginBottom: 8 }}>
                            <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Total</th></tr></thead>
                            <tbody>
                              {txs.map((t) => (
                                <tr key={t.id}><td className="small">{fmtDate(t.fecha)}</td><td className="small">{t.tipo}</td><td className="num">{t.cantidad}</td><td className="num">{fmtMoney(t.precio, t.moneda)}</td><td className="num">{fmtMoney(t.monto_total, t.moneda)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div className="row">
                          {!isPF && <button className="btn xs" onClick={() => setTxModal({ inst: i })}><Plus size={12} /> Compra/venta</button>}
                          <button className="btn xs" onClick={() => setModal({ inst: i })}><Pencil size={12} /> Editar</button>
                          <span className="grow" />
                          <ConfirmButton className="btn xs danger" onConfirm={() => borrarInstrumento(i.id)} icon={<Trash2 size={12} />}>Eliminar</ConfirmButton>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
      <InstrumentoModal data={modal} onClose={() => setModal(null)} />
      <TxModal data={txModal} onClose={() => setTxModal(null)} />
    </Panel>
  )
}

function InstrumentoModal({ data, onClose }) {
  const { crearInstrumento, editarInstrumento } = useFin()
  const inst = data?.inst
  const [f, setF] = useState({})
  useEffect(() => {
    if (!data) return
    setF(inst ? { ...inst } : { tipo: 'plazo_fijo', nombre: '', ticker: '', entidad: '', capital_ars: '', tna: '', fecha_inicio: toISODate(), fecha_vencimiento: '', precio_actual: '', sociedad: '' })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const isPF = f.tipo === 'plazo_fijo'
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const [save, saving] = useBusy(async () => {
    if (!f.nombre?.trim()) return
    const common = { nombre: f.nombre.trim(), sociedad: f.sociedad || null, precio_actual: num(f.precio_actual), entidad: f.entidad || null, capital_ars: num(f.capital_ars), tna: num(f.tna), fecha_inicio: f.fecha_inicio || null, fecha_vencimiento: f.fecha_vencimiento || null }
    let ok
    if (inst) {
      const body = { ...common }
      if (!inst.has_transactions) body.ticker = f.ticker || null
      ok = await editarInstrumento(inst.id, body)
    } else ok = await crearInstrumento({ tipo: f.tipo, ticker: f.ticker || null, ...common })
    if (ok) onClose()
  })
  return (
    <Modal open={!!data} onClose={onClose} title={inst ? 'Editar instrumento' : 'Nuevo instrumento'} icon={Briefcase} onSubmit={save}
      footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
      {!inst && (
        <Field label="Tipo">
          <select className="select" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPOS_INSTRUMENTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
      )}
      <div className="grid2">
        <Field label="Nombre"><input autoFocus className="input" value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        {isPF ? (
          <Field label="Entidad"><input className="input" value={f.entidad || ''} onChange={(e) => setF({ ...f, entidad: e.target.value })} /></Field>
        ) : (
          <Field label="Ticker"><input className="input mono" disabled={inst?.has_transactions} value={f.ticker || ''} onChange={(e) => setF({ ...f, ticker: e.target.value.toUpperCase() })} /></Field>
        )}
      </div>
      {isPF ? (
        <div className="grid2">
          <Field label="Capital (ARS)"><input type="number" className="input mono" value={f.capital_ars ?? ''} onChange={(e) => setF({ ...f, capital_ars: e.target.value })} /></Field>
          <Field label="TNA %"><input type="number" className="input mono" value={f.tna ?? ''} onChange={(e) => setF({ ...f, tna: e.target.value })} /></Field>
          <Field label="Inicio"><input type="date" className="input" value={f.fecha_inicio || ''} onChange={(e) => setF({ ...f, fecha_inicio: e.target.value })} /></Field>
          <Field label="Vencimiento"><input type="date" className="input" value={f.fecha_vencimiento || ''} onChange={(e) => setF({ ...f, fecha_vencimiento: e.target.value })} /></Field>
        </div>
      ) : (
        <div className="grid2">
          <Field label="Precio actual (USD)"><input type="number" className="input mono" value={f.precio_actual ?? ''} onChange={(e) => setF({ ...f, precio_actual: e.target.value })} /></Field>
          <Field label="Sociedad / emisor"><input className="input" value={f.sociedad || ''} onChange={(e) => setF({ ...f, sociedad: e.target.value })} /></Field>
        </div>
      )}
      {!isPF && <div className="small dim">Cantidad y costo se calculan desde las operaciones (ledger). Registrá compras y ventas con “Operación”.</div>}
    </Modal>
  )
}

function TxModal({ data, onClose }) {
  const { crearTransaccion, editarTransaccion, config } = useFin()
  const inst = data?.inst
  const tx = data?.tx
  const [f, setF] = useState({})
  useEffect(() => {
    if (!data) return
    if (tx) setF({ ...tx, instrumento_tipo: tx.tipo_instrumento, ticker: tx.ticker, nombre: tx.nombre_instrumento })
    else setF({ tipo: 'compra', instrumento_tipo: inst?.tipo || 'acciones', ticker: inst?.ticker || '', nombre: inst?.nombre || '', fecha: toISODate(), cantidad: '', precio: '', moneda: 'USD', tipo_cambio: config.dolar_mep || '', nota: '' })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, saving] = useBusy(async () => {
    if (!Number(f.cantidad) || !Number(f.precio)) return
    const base = { tipo: f.tipo, fecha: f.fecha, cantidad: Number(f.cantidad), precio: Number(f.precio), moneda: f.moneda, tipo_cambio: f.moneda === 'ARS' && f.tipo_cambio ? Number(f.tipo_cambio) : null, nota: f.nota || null }
    let ok
    if (tx) ok = await editarTransaccion(tx.id, base)
    else {
      if (!f.ticker?.trim() || !f.nombre?.trim()) return
      ok = await crearTransaccion({ ...base, instrumento_tipo: f.instrumento_tipo, ticker: f.ticker.trim().toUpperCase(), nombre: f.nombre.trim() })
    }
    if (ok) onClose()
  })
  const total = Number(f.cantidad || 0) * Number(f.precio || 0)
  return (
    <Modal open={!!data} onClose={onClose} title={tx ? 'Editar operación' : 'Registrar operación'} icon={Receipt} onSubmit={save}
      footer={<><span className="grow mono small">Total {fmtMoney(total, f.moneda)}</span><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <Seg id="tx-tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={[{ id: 'compra', label: 'Compra' }, { id: 'venta', label: 'Venta' }]} />
        <Seg id="tx-mon" value={f.moneda} onChange={(v) => setF({ ...f, moneda: v })} options={['USD', 'ARS']} />
      </div>
      {!tx && (
        <div className="grid3">
          <Field label="Tipo">
            <select className="select" value={f.instrumento_tipo} disabled={!!inst} onChange={(e) => setF({ ...f, instrumento_tipo: e.target.value })}>
              {TIPOS_INSTRUMENTO.filter((t) => t.id !== 'plazo_fijo').map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Ticker"><input autoFocus className="input mono" disabled={!!inst} value={f.ticker || ''} onChange={(e) => setF({ ...f, ticker: e.target.value.toUpperCase() })} /></Field>
          <Field label="Nombre"><input className="input" disabled={!!inst} value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        </div>
      )}
      {tx && <div className="chip">{tx.ticker} · {tx.nombre_instrumento}</div>}
      <div className="grid3">
        <Field label="Fecha"><input type="date" className="input" value={f.fecha || ''} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Field>
        <Field label="Cantidad"><input type="number" step="any" className="input mono" value={f.cantidad ?? ''} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></Field>
        <Field label={`Precio (${f.moneda})`}><input type="number" step="any" className="input mono" value={f.precio ?? ''} onChange={(e) => setF({ ...f, precio: e.target.value })} /></Field>
      </div>
      {f.moneda === 'ARS' && <Field label="Tipo de cambio usado"><input type="number" className="input mono" value={f.tipo_cambio ?? ''} onChange={(e) => setF({ ...f, tipo_cambio: e.target.value })} /></Field>}
      <Field label="Nota"><input className="input" value={f.nota || ''} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Field>
      {!tx && <div className="small dim">Si el ticker ya existe, la operación se suma a ese instrumento.</div>}
    </Modal>
  )
}

function Ledger() {
  const { transacciones, borrarTransaccion } = useFin()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const list = transacciones.filter((t) => !q || (t.ticker || '').toLowerCase().includes(q.toLowerCase()) || (t.nombre_instrumento || '').toLowerCase().includes(q.toLowerCase()))
  if (!transacciones.length) return null
  return (
    <Panel title="Ledger de operaciones" icon={Receipt} actions={<div className="row gap4"><Filter size={13} className="dim" /><input className="input sm" style={{ width: 130 }} placeholder="ticker…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
      <div style={{ overflowX: 'auto', maxHeight: 420 }}>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Ticker</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">Precio</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td className="small">{fmtDate(t.fecha, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                <td className="mono small" style={{ color: 'var(--a1)' }}>{t.ticker}</td>
                <td><span className="chip" style={{ fontSize: 10, color: t.tipo === 'compra' ? 'var(--mint)' : 'var(--red)' }}>{t.tipo}</span></td>
                <td className="num">{t.cantidad}</td>
                <td className="num">{fmtMoney(t.precio, t.moneda)}</td>
                <td className="num">{fmtMoney(t.monto_total, t.moneda)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="iconbtn sm" onClick={() => setEdit({ tx: t })}><Pencil size={12} /></button>
                  <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={() => borrarTransaccion(t.id)} icon={<Trash2 size={12} />} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TxModal data={edit} onClose={() => setEdit(null)} />
    </Panel>
  )
}

export function AhorroRight() {
  const r = useReparto()
  const { movs, mes, config } = useFin()
  const dolar = dolarDe(config)
  const fireMes = fireUSDPorMes(movs, dolar)[mes] || 0
  const fireAcum = r.cajones.find((c) => c.name === 'FIRE')?.value || 0
  return (
    <>
      <Panel title="Cajón FIRE" icon={Flame}>
        <div className="hero-num tnum" style={{ color: 'var(--amber)' }}>{fmtARS(fireAcum, { compact: true })}</div>
        <div className="small muted">{dolar ? `≈ ${fmtUSD(fireAcum / dolar)}` : ''}</div>
        <div className="hr" />
        <div className="row small"><span className="grow muted">Aporte {monthLabel(mes)}</span><b className="mono">{fmtUSD(fireMes)}</b></div>
      </Panel>
      <Panel title="Cómo funciona" icon={TrendingUp}>
        <div className="small muted" style={{ lineHeight: 1.6 }}>
          Cada cajón acumula los movimientos de su categoría: un <b>gasto</b> suma (apartás plata) y un <b>ingreso</b> resta (retirás).<br />
          <b>FIRE</b> alimenta el plan de independencia. Cada <b>objetivo</b> tiene su categoría con el mismo nombre.
        </div>
      </Panel>
    </>
  )
}
