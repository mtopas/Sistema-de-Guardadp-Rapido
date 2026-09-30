import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Scale, Percent, PieChart, List, CreditCard, StickyNote, Target, Flame, X, Plus, ShieldCheck, Activity, Trash2 } from 'lucide-react'
import { useFin } from '../../store/fin'
import { Panel, Kpi, Empty, Seg, AnimatedNumber } from '../../components/ui'
import { Donut, Legend, Bars } from '../../components/charts'
import {
  dolarDe, totalesMes, porCategoria, colorFor, fmtARS, fmtUSD, fmtMoney, fmtPct, isTransferencia, cuotasActivas,
  acumuladoCajon, fireUSDPorMes, movMes,
} from '../../lib/fin'
import { daysInMonth, fmtDate, monthLabel, relativeTime, shiftMonth } from '../../lib/dates'

export function DashboardCenter() {
  const { movs, mes, config, categorias, openMov } = useFin()
  const dolar = dolarDe(config)
  const tot = useMemo(() => totalesMes(movs, mes, dolar), [movs, mes, dolar])
  const prev = useMemo(() => totalesMes(movs, shiftMonth(mes, -1), dolar), [movs, mes, dolar])
  const [catSel, setCatSel] = useState({ tipo: null, name: null })
  const [lista, setLista] = useState('expense')

  const gastos = useMemo(() => porCategoria(movs, { tipo: 'expense', mes, dolar }).map((d) => ({ ...d, color: colorFor(d.name, categorias) })), [movs, mes, dolar, categorias])
  const ingresos = useMemo(() => porCategoria(movs, { tipo: 'income', mes, dolar }).map((d) => ({ ...d, color: colorFor(d.name, categorias) })), [movs, mes, dolar, categorias])

  const delta = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null)
  const dG = delta(tot.gastos, prev.gastos)
  const dI = delta(tot.ingresos, prev.ingresos)

  // Gasto por día del mes
  const diario = useMemo(() => {
    const [y, m] = mes.split('-').map(Number)
    const n = daysInMonth(y, m - 1)
    const arr = Array.from({ length: n }, (_, i) => ({ label: String(i + 1), full: `${i + 1} ${monthLabel(mes)}`, gasto: 0, ingreso: 0 }))
    for (const mv of movs) {
      if (movMes(mv) !== mes || isTransferencia(mv) || (mv.categoria_nombre || '').toLowerCase() === 'ajuste') continue
      const d = Number((mv.fecha || '').slice(8, 10)) - 1
      if (!arr[d]) continue
      const v = mv.moneda === 'USD' ? (dolar ? mv.monto * dolar : 0) : mv.monto
      if (mv.tipo === 'expense') arr[d].gasto += v
      else if (mv.tipo === 'income') arr[d].ingreso += v
    }
    return arr
  }, [movs, mes, dolar])

  const movsMes = useMemo(() => movs.filter((m) => movMes(m) === mes && !isTransferencia(m)), [movs, mes])
  const listaFiltrada = movsMes.filter((m) => m.tipo === lista && (!catSel.name || catSel.tipo !== lista || (m.categoria_nombre || 'Sin categoría') === catSel.name))
  const hoy = new Date()
  const todayIdx = mes === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}` ? hoy.getDate() - 1 : null

  return (
    <>
      <div className="kpis">
        <Kpi i={0} label="Ingresos" value={<AnimatedNumber value={tot.ingresos} format={(v) => fmtARS(v)} />} sub={dI != null ? `${dI >= 0 ? '▲' : '▼'} ${Math.abs(dI).toFixed(0)}% vs mes anterior` : 'sin mes anterior'} color="#2effa8" icon={TrendingUp} />
        <Kpi i={1} label="Gastos" value={<AnimatedNumber value={tot.gastos} format={(v) => fmtARS(v)} />} sub={dG != null ? `${dG >= 0 ? '▲' : '▼'} ${Math.abs(dG).toFixed(0)}% vs mes anterior` : 'sin mes anterior'} color="#ff6b2c" icon={TrendingDown} />
        <Kpi i={2} label="Balance" value={<span className={tot.balance >= 0 ? 'pos' : 'neg'}><AnimatedNumber value={tot.balance} format={(v) => fmtARS(v)} /></span>} sub={dolar ? `≈ ${fmtUSD(tot.balance / dolar)}` : ' '} color="#ffb800" icon={Scale} />
        <Kpi i={3} label="Tasa de ahorro" value={<AnimatedNumber value={tot.tasa} format={(v) => fmtPct(v)} />} sub={`objetivo ${config.tasa_ahorro_objetivo ?? 0}%`} color="#ff2e97" icon={Percent} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {[
          { t: 'Gastos por categoría', tipo: 'expense', data: gastos, icon: PieChart },
          { t: 'Ingresos por categoría', tipo: 'income', data: ingresos, icon: PieChart },
        ].map((c) => (
          <Panel key={c.tipo} title={c.t} icon={c.icon} actions={catSel.tipo === c.tipo && catSel.name ? <button className="chip click on" onClick={() => setCatSel({ tipo: null, name: null })}>{catSel.name} <X size={11} /></button> : null}>
            {c.data.length === 0 ? (
              <Empty title="Sin datos este mes" />
            ) : (
              <div className="row" style={{ alignItems: 'center', gap: 16 }}>
                <Donut
                  data={c.data}
                  size={170}
                  thickness={22}
                  format={(v) => fmtARS(v, { compact: true })}
                  selected={catSel.tipo === c.tipo ? catSel.name : null}
                  onSelect={(name) => { setCatSel({ tipo: c.tipo, name }); setLista(c.tipo) }}
                  center={<div><div className="tiny upper dim">total</div><div className="display tnum" style={{ fontSize: 14, fontWeight: 600 }}>{fmtARS(c.data.reduce((a, d) => a + d.value, 0), { compact: true })}</div></div>}
                />
                <div className="grow">
                  <Legend data={c.data} format={(v) => fmtARS(v, { compact: true })} selected={catSel.tipo === c.tipo ? catSel.name : null} onSelect={(name) => { setCatSel({ tipo: c.tipo, name }); setLista(c.tipo) }} max={6} />
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>

      <Panel title="Pulso diario" icon={Activity}>
        <Bars
          data={diario}
          height={150}
          highlight={todayIdx}
          format={(v) => fmtARS(v, { compact: true })}
          series={[{ key: 'gasto', label: 'Gasto', color: '#ff6b2c' }, { key: 'ingreso', label: 'Ingreso', color: '#2effa8' }]}
        />
      </Panel>

      <Panel
        title="Movimientos del mes"
        icon={List}
        actions={<><Seg id="dash-lista" value={lista} onChange={setLista} options={[{ id: 'expense', label: 'Gastos' }, { id: 'income', label: 'Ingresos' }]} /><button className="iconbtn sm" onClick={() => openMov({ preset: { tipo: lista } })}><Plus size={15} /></button></>}
      >
        {listaFiltrada.length === 0 ? (
          <Empty title="Nada registrado">Tocá <kbd>N</kbd> para cargar un movimiento.</Empty>
        ) : (
          <MovList movs={listaFiltrada} categorias={categorias} onClick={(m) => openMov({ mov: m })} />
        )}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <CuotasCard />
        <NotasCard />
      </div>
    </>
  )
}

export function MovList({ movs, categorias, onClick, max = 60 }) {
  return (
    <div className="list">
      {movs.slice(0, max).map((m, i) => {
        const col = colorFor(m.categoria_nombre || 'Sin categoría', categorias)
        return (
          <motion.div key={m.id} className={`li ${m._pending ? 'pending' : ''}`} onClick={() => onClick(m)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }}>
            <span className="center" style={{ width: 34, height: 34, borderRadius: 11, background: `${col}22`, color: col, boxShadow: `0 0 14px -6px ${col}`, flexShrink: 0, fontWeight: 700, fontSize: 13 }}>
              {m.icono || (m.categoria_nombre || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis small" style={{ fontWeight: 600 }}>{m.descripcion || m.categoria_nombre || 'Movimiento'}</div>
              <div className="tiny dim ellipsis">{fmtDate(m.fecha)} · {m.categoria_nombre || 'sin categoría'}{m.cuenta_nombre ? ` · ${m.cuenta_nombre}` : ''}{m.cuotas > 1 ? ` · ${m.cuotas} cuotas` : ''}</div>
            </div>
            <span className={`mono small tnum ${m.tipo === 'income' ? 'pos' : m.tipo === 'expense' ? 'neg' : ''}`}>
              {m.tipo === 'income' ? '+' : m.tipo === 'expense' ? '−' : '⇄'}{fmtMoney(Math.abs(m.monto), m.moneda)}
            </span>
          </motion.div>
        )
      })}
      {movs.length > max && <div className="tiny dim" style={{ padding: 8 }}>+{movs.length - max} más — ver en la pestaña Datos</div>}
    </div>
  )
}

function CuotasCard() {
  const { movs, mes } = useFin()
  const list = useMemo(() => cuotasActivas(movs, mes), [movs, mes])
  const totMes = list.reduce((a, c) => a + (c.mov.moneda === 'USD' ? 0 : c.cuota), 0)
  return (
    <Panel title="Cuotas activas" icon={CreditCard} actions={list.length ? <span className="mono small">{fmtARS(totMes, { compact: true })}/mes</span> : null}>
      {list.length === 0 ? (
        <div className="small dim">Sin compras en cuotas vigentes.</div>
      ) : (
        <div className="list">
          {list.map((c) => (
            <div key={c.mov.id} className="li" style={{ cursor: 'default' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small ellipsis" style={{ fontWeight: 600 }}>{c.mov.descripcion || c.mov.categoria_nombre}</div>
                <div className="bar thin" style={{ marginTop: 5 }}><i style={{ width: `${(c.actual / c.n) * 100}%` }} /></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono small">{fmtMoney(c.cuota, c.mov.moneda)}</div>
                <div className="tiny dim">{c.actual}/{c.n} · fin {monthLabel(c.fin).slice(0, 3)} {c.fin.slice(2, 4)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function NotasCard() {
  const { notas, crearNota, borrarNota } = useFin()
  const [t, setT] = useState('')
  return (
    <Panel title="Notas" icon={StickyNote}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { crearNota(t.trim()); setT('') } }}>
        <input className="input sm" placeholder="Anotar algo…" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="iconbtn" type="submit"><Plus size={15} /></button>
      </form>
      <div className="list" style={{ marginTop: 8 }}>
        {notas.map((n) => (
          <motion.div key={n.id} className="li" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <span style={{ color: 'var(--a1)' }}>✦</span>
            <span className="grow small">{n.contenido}</span>
            <span className="tiny dim">{relativeTime(n.fecha)}</span>
            <span className="li-actions"><button className="iconbtn sm danger" onClick={() => borrarNota(n.id)}><Trash2 size={12} /></button></span>
          </motion.div>
        ))}
        {notas.length === 0 && <div className="small dim">Sin notas.</div>}
      </div>
    </Panel>
  )
}

export function DashboardRight() {
  const { movs, mes, config, objetivos, categorias } = useFin()
  const dolar = dolarDe(config)
  const fireMes = useMemo(() => fireUSDPorMes(movs, dolar)[mes] || 0, [movs, dolar, mes])
  const gastos = useMemo(() => porCategoria(movs, { tipo: 'expense', mes, dolar }), [movs, mes, dolar])
  const fondo = objetivos.find((o) => /emergencia/i.test(o.nombre))
  const fondoAcum = fondo ? acumuladoCajon(movs, fondo.nombre, dolar, { moneda: fondo.moneda }) : 0
  const max = Math.max(1, ...gastos.map((g) => g.value))

  return (
    <>
      <Panel title="FIRE del mes" icon={Flame}>
        <div className="hero-num tnum" style={{ color: fireMes >= 0 ? 'var(--amber)' : 'var(--red)', textShadow: '0 0 24px rgba(255,184,0,.45)' }}>
          <AnimatedNumber value={fireMes} format={(v) => fmtUSD(v)} />
        </div>
        <div className="small muted">aportado este mes (cat. FIRE)</div>
      </Panel>
      {fondo && (
        <Panel title="Fondo de emergencia" icon={ShieldCheck}>
          <div className="row">
            <div className="grow">
              <div className="display tnum" style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(fondoAcum, fondo.moneda)}</div>
              <div className="small dim">{fondo.meta ? `meta ${fmtMoney(fondo.meta, fondo.moneda)}` : 'definí una meta en Ahorro'}</div>
            </div>
          </div>
          {fondo.meta > 0 && <div className="bar" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, (fondoAcum / fondo.meta) * 100)}%` }} /></div>}
        </Panel>
      )}
      <Panel title="Objetivos" icon={Target}>
        {objetivos.filter((o) => o !== fondo).length === 0 && <div className="small dim">Creá objetivos en la pestaña Ahorro.</div>}
        <div className="col" style={{ gap: 12 }}>
          {objetivos.filter((o) => o !== fondo).map((o) => {
            const acum = acumuladoCajon(movs, o.nombre, dolar, { moneda: o.moneda })
            const pct = o.meta ? Math.min(100, (acum / o.meta) * 100) : 0
            const col = colorFor(o.nombre, categorias)
            return (
              <div key={o.id}>
                <div className="row small"><span className="dot" style={{ background: col, color: col }} /><span className="grow ellipsis">{o.nombre}</span><b className="mono">{pct.toFixed(0)}%</b></div>
                <div className="bar thin" style={{ marginTop: 5 }}><i style={{ width: `${pct}%`, background: col, boxShadow: `0 0 10px ${col}` }} /></div>
                <div className="tiny dim" style={{ marginTop: 3 }}>{fmtMoney(acum, o.moneda, { compact: true })} de {fmtMoney(o.meta, o.moneda, { compact: true })}</div>
              </div>
            )
          })}
        </div>
      </Panel>
      <Panel title="Top gastos" icon={TrendingDown}>
        <div className="col" style={{ gap: 9 }}>
          {gastos.slice(0, 7).map((g, i) => {
            const col = colorFor(g.name, categorias)
            return (
              <div key={g.name}>
                <div className="row small"><span className="grow ellipsis">{g.name}</span><span className="mono">{fmtARS(g.value, { compact: true })}</span></div>
                <div className="bar thin" style={{ marginTop: 4 }}>
                  <motion.i initial={{ width: 0 }} animate={{ width: `${(g.value / max) * 100}%` }} transition={{ delay: i * 0.06, duration: 0.8 }} style={{ background: col, boxShadow: `0 0 10px ${col}` }} />
                </div>
              </div>
            )
          })}
          {gastos.length === 0 && <div className="small dim">Sin gastos en {monthLabel(mes)}.</div>}
        </div>
      </Panel>
    </>
  )
}
