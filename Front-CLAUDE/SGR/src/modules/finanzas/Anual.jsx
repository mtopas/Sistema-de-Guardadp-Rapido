import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Table2, ChevronLeft, ChevronRight, Trophy, TrendingDown, GitCompare, PieChart, Percent } from 'lucide-react'
import { useFin } from '../../store/fin'
import { Panel, Kpi, Seg, AnimatedNumber } from '../../components/ui'
import { Bars, Donut, Legend } from '../../components/charts'
import { dolarDe, totalesMes, porCategoria, colorFor, fmtARS, fmtUSD, fmtPct } from '../../lib/fin'
import { MESES, MESES_CORTO } from '../../lib/dates'

function useAnual(year) {
  const { movs, config, inflacion } = useFin()
  const dolar = dolarDe(config)
  return useMemo(() => {
    const meses = MESES.map((_, i) => {
      const k = `${year}-${String(i + 1).padStart(2, '0')}`
      return { k, i, ...totalesMes(movs, k, dolar), infl: inflacion[k] }
    })
    // Deflactor: expresa cada mes en pesos del último mes con dato del año
    const factor = meses.map((m, i) => {
      let f = 1
      for (let j = i + 1; j < 12; j++) if (meses[j].infl != null) f *= 1 + meses[j].infl / 100
      return f
    })
    const inflAcum = meses.reduce((a, m) => (m.infl != null ? a * (1 + m.infl / 100) : a), 1)
    const ing = meses.reduce((a, m) => a + m.ingresos, 0)
    const gas = meses.reduce((a, m) => a + m.gastos, 0)
    return { meses, factor, ing, gas, bal: ing - gas, tasa: ing ? ((ing - gas) / ing) * 100 : 0, inflAcum: (inflAcum - 1) * 100, dolar }
  }, [movs, dolar, inflacion, year])
}

export function AnualCenter() {
  const year = useFin((s) => s.anualYear ?? new Date().getFullYear())
  const setYear = (y) => useFin.setState({ anualYear: y })
  const { setInflacion, categorias, movs, config } = useFin()
  const [real, setReal] = useState('nominal')
  const a = useAnual(year)
  const dolar = dolarDe(config)
  const data = a.meses.map((m) => {
    const f = real === 'real' ? a.factor[m.i] : 1
    return { label: MESES_CORTO[m.i], full: `${MESES[m.i]} ${year}`, ingresos: m.ingresos * f, gastos: m.gastos * f }
  })
  const cats = useMemo(() => porCategoria(movs, { tipo: 'expense', desde: `${year}-01`, hasta: `${year}-12`, dolar }).map((d) => ({ ...d, color: colorFor(d.name, categorias) })), [movs, year, dolar, categorias])

  return (
    <>
      <div className="row">
        <div className="row gap4 glass" style={{ padding: 4, borderRadius: 14 }}>
          <button className="iconbtn sm" onClick={() => setYear(year - 1)}><ChevronLeft size={16} /></button>
          <span className="display" style={{ minWidth: 70, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{year}</span>
          <button className="iconbtn sm" onClick={() => setYear(year + 1)}><ChevronRight size={16} /></button>
        </div>
        <span className="grow" />
        <Seg id="anual-real" value={real} onChange={setReal} options={[{ id: 'nominal', label: 'Nominal' }, { id: 'real', label: 'Real (ajustado)' }]} />
      </div>
      <div className="kpis">
        <Kpi i={0} label="Ingresos del año" value={<AnimatedNumber value={a.ing} format={(v) => fmtARS(v, { compact: true })} />} sub={dolar ? `≈ ${fmtUSD(a.ing / dolar, { compact: true })}` : ''} color="#2effa8" />
        <Kpi i={1} label="Gastos del año" value={<AnimatedNumber value={a.gas} format={(v) => fmtARS(v, { compact: true })} />} sub={dolar ? `≈ ${fmtUSD(a.gas / dolar, { compact: true })}` : ''} color="#ff6b2c" />
        <Kpi i={2} label="Ahorro neto" value={<span className={a.bal >= 0 ? 'pos' : 'neg'}><AnimatedNumber value={a.bal} format={(v) => fmtARS(v, { compact: true })} /></span>} sub={`tasa ${fmtPct(a.tasa)}`} color="#ffb800" />
        <Kpi i={3} label="Inflación acumulada" value={<AnimatedNumber value={a.inflAcum} format={(v) => fmtPct(v)} />} sub="según meses cargados" color="#ff2e97" icon={Percent} />
      </div>
      <Panel title={`Flujo mensual · ${real === 'real' ? 'pesos constantes' : 'nominal'}`} icon={BarChart3}>
        <Bars data={data} height={230} format={(v) => fmtARS(v, { compact: true })} series={[{ key: 'ingresos', label: 'Ingresos', color: '#2effa8' }, { key: 'gastos', label: 'Gastos', color: '#ff6b2c' }]} highlight={year === new Date().getFullYear() ? new Date().getMonth() : null} />
      </Panel>
      <Panel title="Mes a mes" icon={Table2}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col" className="num">Ingresos</th>
                <th scope="col" className="num">Gastos</th>
                <th scope="col" className="num">Balance</th>
                <th scope="col" className="num">Ahorro</th>
                <th scope="col" className="num">Inflación %</th>
              </tr>
            </thead>
            <tbody>
              {a.meses.map((m) => (
                <motion.tr key={m.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: m.i * 0.025 }}>
                  <td>{MESES[m.i]}</td>
                  <td className="num pos">{m.ingresos ? fmtARS(m.ingresos) : '—'}</td>
                  <td className="num neg">{m.gastos ? fmtARS(m.gastos) : '—'}</td>
                  <td className={`num ${m.balance >= 0 ? '' : 'neg'}`}>{m.ingresos || m.gastos ? fmtARS(m.balance) : '—'}</td>
                  <td className="num">{m.ingresos ? fmtPct(m.tasa) : '—'}</td>
                  <td className="num" style={{ width: 110 }}>
                    <input
                      className="cell mono"
                      style={{ textAlign: 'right' }}
                      defaultValue={m.infl ?? ''}
                      key={`${m.k}-${m.infl}`}
                      placeholder="—"
                      onBlur={(e) => {
                        const v = e.target.value.replace(',', '.').trim()
                        if (v === String(m.infl ?? '')) return
                        setInflacion(m.k, v === '' ? '' : Number(v))
                      }}
                    />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={`Gastos ${year} por categoría`} icon={PieChart}>
        {cats.length === 0 ? <div className="small dim">Sin gastos registrados en {year}.</div> : (
          <div className="row wrap" style={{ gap: 20 }}>
            <Donut data={cats} size={200} thickness={26} format={(v) => fmtARS(v, { compact: true })} center={<div className="display" style={{ fontWeight: 800 }}>{year}</div>} />
            <div className="grow" style={{ minWidth: 240 }}><Legend data={cats} format={(v) => fmtARS(v, { compact: true })} max={10} /></div>
          </div>
        )}
      </Panel>
    </>
  )
}

export function AnualRight() {
  const year = useFin((s) => s.anualYear ?? new Date().getFullYear())
  const a = useAnual(year)
  const b = useAnual(year - 1)
  const conDatos = a.meses.filter((m) => m.ingresos || m.gastos)
  const mejor = [...conDatos].sort((x, y) => y.balance - x.balance)[0]
  const peor = [...conDatos].sort((x, y) => y.gastos - x.gastos)[0]
  const d = (x, y) => (y ? ((x - y) / Math.abs(y)) * 100 : null)
  const rows = [
    { l: 'Ingresos', a: a.ing, b: b.ing },
    { l: 'Gastos', a: a.gas, b: b.gas, inv: true },
    { l: 'Ahorro', a: a.bal, b: b.bal },
  ]
  return (
    <>
      <Panel title="Highlights" icon={Trophy}>
        {!conDatos.length && <div className="small dim">Sin datos en {year}.</div>}
        {mejor && (
          <div className="li" style={{ cursor: 'default' }}>
            <Trophy size={16} style={{ color: 'var(--amber)' }} />
            <div className="grow"><div className="tiny upper dim">Mejor balance</div><b>{MESES[mejor.i]}</b></div>
            <span className="mono pos">{fmtARS(mejor.balance, { compact: true })}</span>
          </div>
        )}
        {peor && (
          <div className="li" style={{ cursor: 'default' }}>
            <TrendingDown size={16} style={{ color: 'var(--orange)' }} />
            <div className="grow"><div className="tiny upper dim">Mayor gasto</div><b>{MESES[peor.i]}</b></div>
            <span className="mono neg">{fmtARS(peor.gastos, { compact: true })}</span>
          </div>
        )}
        {conDatos.length > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            Promedio mensual de gasto: <b className="mono">{fmtARS(a.gas / conDatos.length, { compact: true })}</b>
          </div>
        )}
      </Panel>
      <Panel title={`${year} vs ${year - 1}`} icon={GitCompare}>
        <div className="col" style={{ gap: 12 }}>
          {rows.map((r) => {
            const pct = d(r.a, r.b)
            const good = pct == null ? null : r.inv ? pct <= 0 : pct >= 0
            return (
              <div key={r.l}>
                <div className="row small"><span className="grow muted">{r.l}</span>{pct != null && <b className="mono" style={{ color: good ? 'var(--mint)' : 'var(--red)' }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%</b>}</div>
                <div className="row mono small"><span className="grow">{fmtARS(r.a, { compact: true })}</span><span className="dim">{fmtARS(r.b, { compact: true })}</span></div>
              </div>
            )
          })}
        </div>
        <div className="tiny dim" style={{ marginTop: 10 }}>Comparación nominal. Cargá la inflación mensual para ver valores reales.</div>
      </Panel>
    </>
  )
}
