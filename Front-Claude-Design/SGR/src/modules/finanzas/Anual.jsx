import { useMemo } from 'react'
import { BarChart3, Percent, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardHead, Empty, Input, Stat } from '../../ui/primitives'
import { AreaLine, GroupedBars } from '../../ui/charts'
import { useFin } from '../../store/fin'
import { colorFor, dolarDe, fmtARS, fmtPct, porCategoria, totalesMes } from '../../lib/fin'
import { MESES_C, pad } from '../../lib/dates'

export function Anual() {
  const { movs, categorias, config, anio, inflacion } = useFin()
  const dolar = dolarDe(config)

  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => `${anio}-${pad(i + 1)}`), [anio])

  const filas = useMemo(
    () => meses.map((mes, i) => ({ mes, label: MESES_C[i], ...totalesMes(movs, mes, dolar) })),
    [meses, movs, dolar],
  )

  const anual = useMemo(() => {
    const ingresos = filas.reduce((a, f) => a + f.ingresos, 0)
    const gastos = filas.reduce((a, f) => a + f.gastos, 0)
    const conDatos = filas.filter((f) => f.n > 0)
    return {
      ingresos,
      gastos,
      balance: ingresos - gastos,
      tasa: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0,
      mesesConDatos: conDatos.length,
      mejor: [...conDatos].sort((a, b) => b.balance - a.balance)[0],
      peor: [...conDatos].sort((a, b) => a.balance - b.balance)[0],
    }
  }, [filas])

  // Ajuste real: cada mes se lleva a pesos del último mes del año usando la inflación cargada.
  const reales = useMemo(() => {
    let factor = 1
    const acum = []
    for (let i = filas.length - 1; i >= 0; i--) {
      acum[i] = factor
      const infl = Number(inflacion[filas[i].mes] || 0) / 100
      factor *= 1 + infl
    }
    return filas.map((f, i) => ({ ...f, realBalance: f.balance * acum[i], factor: acum[i] }))
  }, [filas, inflacion])

  const porCat = useMemo(
    () => porCategoria(movs, { tipo: 'expense', desde: meses[0], hasta: meses[11], dolar }),
    [movs, meses, dolar],
  )

  const inflAcum = useMemo(
    () => meses.reduce((a, m) => a * (1 + Number(inflacion[m] || 0) / 100), 1),
    [meses, inflacion],
  )

  if (anual.mesesConDatos === 0) {
    return (
      <Card>
        <CardHead title={`Año ${anio}`} />
        <Empty icon={BarChart3} title="Sin movimientos en este año" body="Cambiá de año en el selector de arriba o cargá movimientos." />
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ingresos del año" value={anual.ingresos} format={(v) => fmtARS(v, { compact: true })} tone="good" icon={TrendingUp} />
        <Stat label="Gastos del año" value={anual.gastos} format={(v) => fmtARS(v, { compact: true })} tone="bad" icon={TrendingDown} />
        <Stat label="Balance" value={anual.balance} format={(v) => fmtARS(v, { compact: true, signo: true })} tone={anual.balance >= 0 ? 'good' : 'bad'} />
        <Stat
          label="Tasa de ahorro"
          value={Math.round(anual.tasa)}
          format={(v) => `${v}%`}
          sub={`${anual.mesesConDatos} meses con datos`}
          tone={anual.tasa >= 20 ? 'good' : 'warn'}
        />
      </div>

      <Card spot>
        <CardHead title="Ingresos vs gastos" sub={`Mes a mes · ${anio}`} icon={BarChart3} />
        <div className="px-4 pb-4">
          <GroupedBars
            data={filas.map((f) => ({ label: f.label, full: `${f.label} ${anio}`, ingresos: f.ingresos, gastos: f.gastos }))}
            series={[
              { key: 'ingresos', label: 'Ingresos', color: 'var(--income)' },
              { key: 'gastos', label: 'Gastos', color: 'var(--expense)' },
            ]}
            height={180}
            format={(v) => fmtARS(v, { compact: true })}
          />
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHead title="Balance nominal" sub="Acumulado mes a mes" />
          <div className="px-4 pb-4">
            <AreaLine
              data={filas.map((f) => ({ label: f.label, value: f.balance }))}
              height={165}
              color="var(--accent)"
              zeroLine
              format={(v) => fmtARS(v, { compact: true })}
            />
          </div>
        </Card>
        <Card>
          <CardHead
            title="Balance en pesos de hoy"
            sub={inflAcum > 1 ? `Inflación cargada del año: ${fmtPct((inflAcum - 1) * 100)}` : 'Cargá la inflación mensual en el panel derecho'}
          />
          <div className="px-4 pb-4">
            <AreaLine
              data={reales.map((f) => ({ label: f.label, value: f.realBalance }))}
              height={165}
              color="var(--b2)"
              zeroLine
              format={(v) => fmtARS(v, { compact: true })}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHead title="Detalle por mes" sub="Nominal y ajustado por inflación" />
        <div className="scroll max-h-[420px] px-1 pb-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num">Ingresos</th>
                <th className="num">Gastos</th>
                <th className="num">Balance</th>
                <th className="num">Tasa</th>
                <th className="num">Balance real</th>
                <th className="num">Infl. %</th>
              </tr>
            </thead>
            <tbody>
              {reales.map((f) => (
                <tr key={f.mes} style={{ opacity: f.n ? 1 : 0.45 }}>
                  <td className="whitespace-nowrap">{f.label}</td>
                  <td className="num" style={{ color: 'var(--income)' }}>{f.ingresos ? fmtARS(f.ingresos, { compact: true }) : '—'}</td>
                  <td className="num" style={{ color: 'var(--expense)' }}>{f.gastos ? fmtARS(f.gastos, { compact: true }) : '—'}</td>
                  <td className="num font-semibold" style={{ color: f.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {f.n ? fmtARS(f.balance, { compact: true }) : '—'}
                  </td>
                  <td className="num">{f.ingresos ? fmtPct(f.tasa, 0) : '—'}</td>
                  <td className="num">{f.n ? fmtARS(f.realBalance, { compact: true }) : '—'}</td>
                  <td className="num text-txt-sub">{inflacion[f.mes] != null ? fmtPct(inflacion[f.mes]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHead title="Gasto por categoría en el año" sub={`${porCat.length} categorías`} />
        <div className="grid gap-2 px-3.5 pb-3.5 sm:grid-cols-2">
          {porCat.slice(0, 12).map((c, i) => {
            const color = colorFor(c.name, categorias)
            const pct = anual.gastos ? (c.value / anual.gastos) * 100 : 0
            return (
              <div key={c.name} className="surface flex items-center gap-2.5 px-2.5 py-2 a-up" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate1 text-[12px]">{c.name}</span>
                  <span className="mono block text-[10px] text-txt-mute">{fmtPct(pct)} del gasto anual</span>
                </span>
                <span className="mono tnum shrink-0 text-[12px]">{fmtARS(c.value, { compact: true })}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

export function AnualRight() {
  const { movs, config, anio, inflacion, setInflacion } = useFin()
  const dolar = dolarDe(config)
  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => `${anio}-${pad(i + 1)}`), [anio])
  const filas = useMemo(() => meses.map((m, i) => ({ mes: m, label: MESES_C[i], ...totalesMes(movs, m, dolar) })), [meses, movs, dolar])
  const conDatos = filas.filter((f) => f.n > 0)
  const mejor = [...conDatos].sort((a, b) => b.balance - a.balance)[0]
  const peor = [...conDatos].sort((a, b) => a.balance - b.balance)[0]
  const prevTot = useMemo(() => {
    const prev = Array.from({ length: 12 }, (_, i) => `${anio - 1}-${pad(i + 1)}`)
    const r = prev.map((m) => totalesMes(movs, m, dolar))
    return { ingresos: r.reduce((a, x) => a + x.ingresos, 0), gastos: r.reduce((a, x) => a + x.gastos, 0) }
  }, [movs, anio, dolar])
  const tot = { ingresos: conDatos.reduce((a, f) => a + f.ingresos, 0), gastos: conDatos.reduce((a, f) => a + f.gastos, 0) }
  const varIng = prevTot.ingresos ? ((tot.ingresos - prevTot.ingresos) / prevTot.ingresos) * 100 : null
  const varGas = prevTot.gastos ? ((tot.gastos - prevTot.gastos) / prevTot.gastos) * 100 : null

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead title="Destacados" />
        <div className="space-y-2 px-3.5 pb-3.5">
          {mejor ? (
            <div className="surface px-3 py-2.5">
              <div className="label">Mejor mes</div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{mejor.label}</span>
                <span className="mono tnum text-[13px] font-semibold" style={{ color: 'var(--success)' }}>{fmtARS(mejor.balance, { compact: true })}</span>
              </div>
            </div>
          ) : null}
          {peor && peor !== mejor ? (
            <div className="surface px-3 py-2.5">
              <div className="label">Peor mes</div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{peor.label}</span>
                <span className="mono tnum text-[13px] font-semibold" style={{ color: 'var(--danger)' }}>{fmtARS(peor.balance, { compact: true })}</span>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHead title={`Contra ${anio - 1}`} sub="Variación nominal" />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <Stat label="Ingresos" value={fmtARS(tot.ingresos, { compact: true })} animate={false} delta={varIng} tone="good" />
          <Stat label="Gastos" value={fmtARS(tot.gastos, { compact: true })} animate={false} delta={varGas} tone="bad" />
        </div>
        {(varIng == null && varGas == null) && (
          <p className="px-3.5 pb-3.5 text-[10.5px] text-txt-mute">Sin datos del año anterior para comparar.</p>
        )}
      </Card>

      <Card>
        <CardHead title="Inflación mensual" sub="Se usa para el balance en pesos de hoy" icon={Percent} />
        <div className="scroll max-h-[340px] space-y-1 px-3 pb-3">
          {meses.map((m, i) => (
            <div key={m} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-[11.5px] text-txt-sub">{MESES_C[i]}</span>
              <Input
                className="mono h-8 flex-1 text-right text-[12px]"
                value={inflacion[m] ?? ''}
                placeholder="—"
                inputMode="decimal"
                onChange={(e) => setInflacion(m, e.target.value)}
              />
              <span className="w-3 shrink-0 text-[11px] text-txt-mute">%</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
