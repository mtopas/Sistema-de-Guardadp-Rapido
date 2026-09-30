import { useEffect, useMemo, useState } from 'react'
import { Flame, RotateCcw, Rocket, Save, Sparkles } from 'lucide-react'
import { Button, Card, CardHead, Field, Input, Stat, cx } from '../../ui/primitives'
import { AreaLine } from '../../ui/charts'
import { useFin } from '../../store/fin'
import { cajonPorMes, dolarDe, fmtPct, fmtUSD, proyeccionFire } from '../../lib/fin'
import { monthDiff, monthLabelShort, shiftMonth, toISOMonth } from '../../lib/dates'

/**
 * Plan FIRE: la proyección se calcula en el cliente (README: "cálculo pesado en
 * cliente; persistir solo excepciones") y solo los overrides por mes viven en
 * `fin_fire_filas`. El aporte real de cada mes sale de la categoría `FIRE`.
 */
export function Fire() {
  const { movs, config, fireFilas, setFireOverride } = useFin()
  const dolar = dolarDe(config)

  const reales = useMemo(() => cajonPorMes(movs, 'FIRE', dolar, 'USD'), [movs, dolar])
  const mesesConAporte = Object.keys(reales).sort()
  const desde = Number(config.fire_desde_mes) ? String(config.fire_desde_mes) : mesesConAporte[0] || toISOMonth()
  const horizonte = Number(config.fire_meses || 0) || 120

  const rows = useMemo(
    () =>
      proyeccionFire({
        desde,
        meses: horizonte,
        inicial: Number(config.fire_inicial || 0),
        aporteBase: Number(config.fire_aporte || 0),
        aumentoPct: Number(config.fire_aumento_pct || 0),
        rentaAnual: Number(config.fire_rentabilidad || 0),
        overrides: fireFilas,
        reales,
      }),
    [desde, horizonte, config, fireFilas, reales],
  )

  const meta = Number(config.fire_meta || 0)
  const hoyMes = toISOMonth()
  const actual = rows.find((r) => r.mes === hoyMes) || rows.filter((r) => r.mes <= hoyMes).slice(-1)[0]
  const saldoHoy = actual?.saldo ?? 0
  const alcanza = meta > 0 ? rows.find((r) => r.saldo >= meta) : null
  const aportadoTotal = Object.values(reales).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cajón FIRE hoy" value={fmtUSD(saldoHoy)} sub="proyección + aportes reales" animate={false} icon={Flame} tone="good" />
        <Stat label="Aportado (histórico)" value={fmtUSD(aportadoTotal)} sub="categoría FIRE" animate={false} />
        <Stat label="Meta" value={meta ? fmtUSD(meta) : '—'} sub={meta ? fmtPct(meta ? (saldoHoy / meta) * 100 : 0) + ' alcanzado' : 'Definila abajo'} animate={false} tone="warn" />
        <Stat
          label="Independencia"
          value={alcanza ? monthLabelShort(alcanza.mes) : '—'}
          sub={alcanza ? `en ${monthDiff(hoyMes, alcanza.mes)} meses` : meta ? 'fuera del horizonte' : 'sin meta cargada'}
          animate={false}
          icon={Rocket}
        />
      </div>

      <Card spot>
        <CardHead title="Curva del patrimonio" sub={`${horizonte} meses desde ${monthLabelShort(desde)} · USD`} icon={Sparkles} />
        <div className="px-4 pb-4">
          <AreaLine
            data={rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 26)) === 0).map((r) => ({
              label: r.mes.endsWith('-01') ? r.mes.slice(0, 4) : '',
              full: monthLabelShort(r.mes),
              value: r.saldo,
            }))}
            height={200}
            color="var(--accent)"
            format={(v) => fmtUSD(v, { compact: true })}
          />
        </div>
      </Card>

      <Card>
        <CardHead
          title="Plan mensual"
          sub="El valor aportado es editable: se guarda como override en fin_fire_filas"
        />
        <div className="scroll max-h-[480px] px-1 pb-2">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num">Plan</th>
                <th className="num">Aportado</th>
                <th className="num">Interés</th>
                <th className="num">Saldo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mes} className={cx(r.mes === hoyMes && 'font-semibold')} style={r.mes === hoyMes ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : undefined}>
                  <td className="whitespace-nowrap">
                    {monthLabelShort(r.mes)}
                    {r.mes === hoyMes && <span className="ml-1.5 chip text-[9px]">hoy</span>}
                  </td>
                  <td className="num text-txt-sub">{fmtUSD(r.plan)}</td>
                  <td className="num p-0">
                    <input
                      className="mono w-full bg-transparent px-2 py-1.5 text-right text-[12.5px] outline-none transition-colors focus:bg-elev"
                      style={{ color: r.esOverride ? 'var(--accent)' : r.esReal ? 'var(--success)' : 'var(--text)' }}
                      value={fireFilas[r.mes] ?? (r.esReal ? Number(r.aportado.toFixed(2)) : '')}
                      placeholder={r.plan ? r.plan.toFixed(0) : '0'}
                      onChange={(e) => setFireOverride(r.mes, e.target.value)}
                      title={r.esOverride ? 'Override manual' : r.esReal ? 'Calculado de los movimientos con categoría FIRE' : 'Valor planificado'}
                    />
                  </td>
                  <td className="num text-txt-mute">{fmtUSD(r.interes)}</td>
                  <td className="num">{fmtUSD(r.saldo, { compact: true })}</td>
                  <td className="num">
                    {r.esOverride && (
                      <button className="icon-btn h-6 w-6" title="Quitar override" onClick={() => setFireOverride(r.mes, '')}>
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-[10.5px] text-txt-mute">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />real (movimientos FIRE)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />override manual</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'var(--text)' }} />plan</span>
        </div>
      </Card>
    </div>
  )
}

export function FireRight() {
  const { config, guardarConfig } = useFin()
  const [f, setF] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setF({
      fire_meta: config.fire_meta ?? '',
      fire_inicial: config.fire_inicial ?? '',
      fire_aporte: config.fire_aporte ?? '',
      fire_aumento_pct: config.fire_aumento_pct ?? '',
      fire_rentabilidad: config.fire_rentabilidad ?? '',
      fire_meses: config.fire_meses ?? 120,
      fire_desde_mes: config.fire_desde_mes ?? '',
      fire_retiro_pct: config.fire_retiro_pct ?? 4,
    })
    setDirty(false)
  }, [config])

  const set = (k, v) => { setF((o) => ({ ...o, [k]: v })); setDirty(true) }

  const guardar = async () => {
    setBusy(true)
    const body = {}
    for (const [k, v] of Object.entries(f)) body[k] = v === '' ? null : k === 'fire_desde_mes' ? v : Number(v)
    await guardarConfig(body)
    setBusy(false)
    setDirty(false)
  }

  const meta = Number(f.fire_meta || 0)
  const retiro = Number(f.fire_retiro_pct || 4)
  const rentaMensual = meta * (retiro / 100) / 12

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title="Parámetros del plan"
          sub="Se guardan en fin_config"
          icon={Flame}
          right={dirty ? <Button size="sm" variant="primary" icon={Save} loading={busy} onClick={guardar}>Guardar</Button> : <span className="text-[10.5px] text-txt-mute">al día</span>}
        />
        <div className="space-y-3 px-3.5 pb-3.5">
          <Field label="Meta FIRE (USD)" hint="Patrimonio objetivo">
            <Input className="mono" value={f.fire_meta ?? ''} onChange={(e) => set('fire_meta', e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Capital inicial (USD)">
            <Input className="mono" value={f.fire_inicial ?? ''} onChange={(e) => set('fire_inicial', e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Aporte mensual base (USD)">
            <Input className="mono" value={f.fire_aporte ?? ''} onChange={(e) => set('fire_aporte', e.target.value)} inputMode="decimal" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Aumento aporte %/mes">
              <Input className="mono" value={f.fire_aumento_pct ?? ''} onChange={(e) => set('fire_aumento_pct', e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Rentabilidad %/año">
              <Input className="mono" value={f.fire_rentabilidad ?? ''} onChange={(e) => set('fire_rentabilidad', e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meses a proyectar">
              <Input className="mono" value={f.fire_meses ?? ''} onChange={(e) => set('fire_meses', e.target.value)} type="number" min="12" max="600" />
            </Field>
            <Field label="Arranca en">
              <Input type="month" value={f.fire_desde_mes ?? ''} onChange={(e) => set('fire_desde_mes', e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Regla de retiro" sub="Cuánto podrías sacar por mes al llegar a la meta" />
        <div className="space-y-3 px-3.5 pb-3.5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[11.5px]">
              <span className="text-txt-sub">Tasa de retiro anual</span>
              <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>{retiro}%</span>
            </div>
            <input
              type="range"
              min="2" max="8" step="0.25"
              value={retiro}
              onChange={(e) => set('fire_retiro_pct', e.target.value)}
              className="w-full"
            />
          </div>
          <div className="surface px-3 py-2.5 text-center">
            <div className="label">Renta mensual estimada</div>
            <div className="grad-text mono tnum mt-1 text-[21px] font-bold">{fmtUSD(rentaMensual)}</div>
            <p className="mt-1 text-[10.5px] text-txt-mute">
              Con {fmtUSD(meta)} al {retiro}% anual. La regla clásica es 4%.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
