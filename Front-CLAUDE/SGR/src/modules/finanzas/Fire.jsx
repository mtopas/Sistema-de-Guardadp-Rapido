import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Flame, LineChart as LineIcon, Table2, Settings2, Rocket, CalendarCheck, Target, Crosshair, Save } from 'lucide-react'
import { useFin } from '../../store/fin'
import { toast } from '../../store/ui'
import { Panel, Kpi, AnimatedNumber, Field, Switch } from '../../components/ui'
import { LineChart, Ring } from '../../components/charts'
import { dolarDe, fmtUSD, fireUSDPorMes } from '../../lib/fin'
import { monthLabel, shiftMonth, toISOMonth, monthDiff, MESES_CORTO, parseDate } from '../../lib/dates'

export function useFirePlan() {
  const { movs, config, fireFilas } = useFin()
  const dolar = dolarDe(config)
  return useMemo(() => {
    const meta = Number(config.fire_meta_usd || 0)
    const aporte0 = Number(config.fire_aporte_inicial || 0)
    const saldo0 = Number(config.fire_saldo_inicial || 0)
    const rent = Number(config.fire_rentabilidad_anual || 0)
    const aum = Number(config.fire_aumento_aporte || 0)
    const inicio = config.fire_inicio_mes || toISOMonth()
    const hoy = toISOMonth()
    const rm = Math.pow(1 + rent / 100, 1 / 12) - 1
    const movsUSD = fireUSDPorMes(movs, dolar)
    const idxHoy = monthDiff(inicio, hoy)
    const rows = []
    let sPlan = saldo0
    let sReal = saldo0
    let fireIdx = null
    let fireIdxPlan = null
    const maxN = 12 * 60
    for (let i = 0; i < maxN; i++) {
      const mes = shiftMonth(inicio, i)
      const aportePlan = aporte0 * Math.pow(1 + aum / 100, i)
      sPlan = sPlan * (1 + rm) + aportePlan
      const pasado = i <= idxHoy
      const override = fireFilas[mes]
      const mov = movsUSD[mes] || 0
      const ahorrado = pasado ? (override != null ? override : mov) : null
      sReal = sReal * (1 + rm) + (pasado ? ahorrado : aportePlan)
      rows.push({ i, mes, aportePlan, sPlan, pasado, override, mov, ahorrado, sReal, dif: pasado ? ahorrado - aportePlan : null })
      if (meta && fireIdx == null && sReal >= meta) fireIdx = i
      if (meta && fireIdxPlan == null && sPlan >= meta) fireIdxPlan = i
      if (meta && fireIdx == null && i > Math.max(idxHoy, 0) + 240) break
      if (i > Math.max(idxHoy + 24, 36) && (!meta || (fireIdx != null && fireIdxPlan != null && i > Math.max(fireIdx, fireIdxPlan) + 6))) break
    }
    const actual = rows[Math.max(0, Math.min(rows.length - 1, idxHoy))]
    return { rows, meta, fireIdx, fireIdxPlan, idxHoy, actual, inicio, rent, aum, dolar }
  }, [movs, config, fireFilas, dolar])
}

export function FireCenter() {
  const plan = useFirePlan()
  const setOverride = useFin((s) => s.setFireOverride)
  const [all, setAll] = useState(false)
  const { rows, meta, fireIdx, actual, idxHoy } = plan
  const shown = all ? rows : rows.filter((r) => r.i >= idxHoy - 12 && r.i <= idxHoy + 18)
  const labels = rows.map((r) => `${MESES_CORTO[Number(r.mes.slice(5)) - 1]} ${r.mes.slice(2, 4)}`)
  const pct = meta ? Math.min(1, (actual?.sReal || 0) / meta) : 0
  const fireMes = fireIdx != null ? rows[fireIdx].mes : null

  return (
    <>
      <div className="kpis">
        <Kpi i={0} label="Saldo FIRE hoy" value={<AnimatedNumber value={actual?.sReal || 0} format={(v) => fmtUSD(v, { decimals: 0 })} />} sub={`plan: ${fmtUSD(actual?.sPlan || 0, { decimals: 0 })}`} color="#ffb800" icon={Flame} />
        <Kpi i={1} label="Meta" value={meta ? fmtUSD(meta, { decimals: 0 }) : '—'} sub={meta ? `${(pct * 100).toFixed(1)}% logrado` : 'definila en el panel'} color="#ff2e97" icon={Target} />
        <Kpi i={2} label="Libertad estimada" value={fireMes ? monthLabel(fireMes) : '—'} sub={fireMes ? `en ${Math.max(0, fireIdx - idxHoy)} meses` : 'meta fuera de horizonte'} color="#00f0ff" icon={Rocket} />
        <Kpi i={3} label="Aporte plan del mes" value={fmtUSD(actual?.aportePlan || 0)} sub={`real: ${fmtUSD(actual?.ahorrado || 0)}`} color="#b4ff39" icon={Crosshair} />
      </div>
      <Panel title="Trayectoria" icon={LineIcon}>
        <LineChart
          labels={labels}
          markerIndex={idxHoy}
          format={(v) => fmtUSD(v, { decimals: 0 })}
          series={[
            { label: 'Plan', color: '#9d4bff', values: rows.map((r) => r.sPlan), dashed: true },
            { label: 'Real + proyección', color: '#ffb800', values: rows.map((r) => r.sReal) },
            ...(meta ? [{ label: 'Meta', color: '#ff2e97', values: rows.map(() => meta), dashed: true }] : []),
          ]}
        />
      </Panel>
      <Panel title="Plan mensual (USD)" icon={Table2} actions={<label className="row small muted">Ver todo <Switch on={all} onChange={setAll} /></label>}>
        <div style={{ overflowX: 'auto', maxHeight: 520 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col" className="num">Aporte plan</th>
                <th scope="col" className="num">Movimientos</th>
                <th scope="col" className="num">Override</th>
                <th scope="col" className="num">Diferencia</th>
                <th scope="col" className="num">Saldo plan</th>
                <th scope="col" className="num">Saldo real</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.mes} style={r.i === idxHoy ? { background: 'rgba(255,184,0,.1)', boxShadow: 'inset 3px 0 0 var(--amber)' } : r.i === fireIdx ? { background: 'rgba(255,46,151,.12)' } : undefined}>
                  <td className="mono small">{monthLabel(r.mes)} {r.i === fireIdx && '🔥'}</td>
                  <td className="num">{fmtUSD(r.aportePlan, { decimals: 0 })}</td>
                  <td className="num">{r.pasado ? fmtUSD(r.mov, { decimals: 0 }) : <span className="dim">—</span>}</td>
                  <td className="num" style={{ width: 110 }}>
                    {r.pasado ? (
                      <input
                        className="cell mono"
                        style={{ textAlign: 'right' }}
                        key={`${r.mes}-${r.override}`}
                        defaultValue={r.override ?? ''}
                        placeholder="—"
                        onBlur={(e) => {
                          const v = e.target.value.replace(',', '.').trim()
                          if (v === String(r.override ?? '')) return
                          setOverride(r.mes, v === '' ? '' : Number(v))
                        }}
                      />
                    ) : <span className="dim">—</span>}
                  </td>
                  <td className={`num ${r.dif == null ? 'dim' : r.dif >= 0 ? 'pos' : 'neg'}`}>{r.dif == null ? '—' : fmtUSD(r.dif, { decimals: 0 })}</td>
                  <td className="num muted">{fmtUSD(r.sPlan, { decimals: 0 })}</td>
                  <td className="num" style={{ color: r.pasado ? 'var(--amber)' : 'var(--dim)' }}>{fmtUSD(r.sReal, { decimals: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>“Movimientos” suma la categoría FIRE convertida a USD con el MEP. El override reemplaza ese valor para el mes.</div>
      </Panel>
    </>
  )
}

const FIELDS = [
  { k: 'fire_meta_usd', l: 'Meta (USD)', t: 'number' },
  { k: 'fire_saldo_inicial', l: 'Saldo inicial (USD)', t: 'number' },
  { k: 'fire_aporte_inicial', l: 'Aporte inicial (USD/mes)', t: 'number' },
  { k: 'fire_aumento_aporte', l: 'Aumento del aporte (% mensual)', t: 'number' },
  { k: 'fire_rentabilidad_anual', l: 'Rentabilidad anual (%)', t: 'number' },
  { k: 'fire_inicio_mes', l: 'Mes de inicio', t: 'month' },
  { k: 'fire_fecha_nacimiento', l: 'Fecha de nacimiento', t: 'date' },
]

export function FireRight() {
  const { config, guardarConfig } = useFin()
  const plan = useFirePlan()
  const [f, setF] = useState({})
  useEffect(() => {
    const o = {}
    FIELDS.forEach((x) => (o[x.k] = config[x.k] ?? ''))
    setF(o)
  }, [config])
  const dirty = FIELDS.some((x) => String(f[x.k] ?? '') !== String(config[x.k] ?? ''))
  const save = async () => {
    const body = {}
    FIELDS.forEach((x) => {
      if (String(f[x.k] ?? '') !== String(config[x.k] ?? '')) body[x.k] = x.t === 'number' ? Number(f[x.k] || 0) : f[x.k]
    })
    if (await guardarConfig(body)) toast('Plan FIRE actualizado')
  }
  const pct = plan.meta ? Math.min(1, (plan.actual?.sReal || 0) / plan.meta) : 0
  const nac = parseDate(config.fire_fecha_nacimiento)
  const fireMes = plan.fireIdx != null ? plan.rows[plan.fireIdx].mes : null
  const edad = nac && fireMes ? Math.floor((parseDate(`${fireMes}-01`) - nac) / (365.25 * 86400000)) : null
  return (
    <>
      <Panel title="Progreso" icon={Flame}>
        <div className="row" style={{ gap: 16 }}>
          <Ring value={pct} size={96} stroke={9} color="#ffb800" color2="#ff2e97">
            <div style={{ textAlign: 'center' }}><div className="display" style={{ fontWeight: 800, fontSize: 17 }}>{(pct * 100).toFixed(0)}%</div></div>
          </Ring>
          <div className="col" style={{ gap: 4 }}>
            <div className="small muted">Libertad financiera</div>
            <div className="display" style={{ fontWeight: 600 }}>{fireMes ? monthLabel(fireMes) : 'sin fecha'}</div>
            {edad != null && <div className="small" style={{ color: 'var(--a3)' }}>a los {edad} años</div>}
          </div>
        </div>
      </Panel>
      <Panel title="Parámetros" icon={Settings2}>
        <div className="col" style={{ gap: 10 }}>
          {FIELDS.map((x) => (
            <Field key={x.k} label={x.l}>
              <input type={x.t} className="input sm mono" value={f[x.k] ?? ''} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} step="any" />
            </Field>
          ))}
          <motion.button className="btn primary sm" disabled={!dirty} onClick={save} animate={dirty ? { scale: [1, 1.04, 1] } : {}} transition={{ repeat: dirty ? Infinity : 0, duration: 1.6 }}>
            <Save size={14} /> Guardar plan
          </motion.button>
        </div>
      </Panel>
      <Panel title="Supuestos" icon={CalendarCheck}>
        <div className="small muted" style={{ lineHeight: 1.6 }}>
          Rentabilidad mensual equivalente: <b className="mono">{((Math.pow(1 + plan.rent / 100, 1 / 12) - 1) * 100).toFixed(3)}%</b>.<br />
          El aporte planificado crece <b className="mono">{plan.aum}%</b> por mes desde {monthLabel(plan.inicio)}.<br />
          {plan.dolar ? <>Conversión ARS→USD con MEP <b className="mono">${plan.dolar}</b>.</> : 'Sin cotización: actualizá el dólar para convertir aportes en pesos.'}
        </div>
      </Panel>
    </>
  )
}
