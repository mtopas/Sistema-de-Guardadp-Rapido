import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, DollarSign, PiggyBank, Plus, RefreshCw, Scale, Wallet } from 'lucide-react'
import { Button, Card, CardHead, IconButton, Stat } from '../../ui/primitives'
import { Gauge } from '../../ui/charts'
import { useFin } from '../../store/fin'
import { dolarDe, fmtARS, fmtUSD, grupoCuenta, totalesMes } from '../../lib/fin'
import { monthLabel, relTime } from '../../lib/dates'

export function FinanzasLeftPanel() {
  const { cuentas, movs, config, mes, busy, openCuenta, actualizarDolar, recalcularSaldos } = useFin()
  const dolar = dolarDe(config)
  const t = useMemo(() => totalesMes(movs, mes, dolar), [movs, mes, dolar])

  const grupos = useMemo(() => {
    const m = new Map()
    for (const c of cuentas) {
      const g = grupoCuenta(c)
      if (!m.has(g)) m.set(g, [])
      m.get(g).push(c)
    }
    return [...m.entries()]
  }, [cuentas])

  const totalARS = cuentas.reduce((a, c) => a + Number(c.ars || 0), 0)
  const totalUSD = cuentas.reduce((a, c) => a + Number(c.usd || 0), 0)
  const patrimonio = totalARS + (dolar ? totalUSD * dolar : 0)

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title="Patrimonio líquido"
          sub={dolar ? `Consolidado al MEP $${Number(dolar).toLocaleString('es-AR')}` : 'Cargá la cotización para consolidar USD'}
          icon={Scale}
          right={<IconButton icon={RefreshCw} label="Recalcular saldos desde movimientos" onClick={recalcularSaldos} />}
        />
        <div className="px-3.5 pb-3.5">
          <div className="grad-text mono tnum text-[25px] font-bold leading-none">{fmtARS(patrimonio, { compact: true })}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-txt-sub">
            <span className="mono">{fmtARS(totalARS)}</span>
            <span className="mono">{fmtUSD(totalUSD)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title={monthLabel(mes)} sub={`${t.n} movimiento${t.n === 1 ? '' : 's'} sin transferencias`} />
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <Stat label="Ingresos" value={fmtARS(t.ingresos, { compact: true })} tone="good" icon={ArrowUpRight} animate={false} />
          <Stat label="Gastos" value={fmtARS(t.gastos, { compact: true })} tone="bad" icon={ArrowDownRight} animate={false} />
        </div>
        <div className="flex items-center gap-3 px-3.5 pb-3.5">
          <Gauge
            value={Math.max(0, t.tasa)}
            max={100}
            size={104}
            label={`${Math.round(t.tasa)}%`}
            sub="tasa de ahorro"
            color={t.tasa >= 20 ? 'var(--success)' : t.tasa >= 0 ? 'var(--warning)' : 'var(--danger)'}
          />
          <div className="min-w-0 flex-1">
            <div className="label">Balance</div>
            <div
              className="mono tnum text-[17px] font-semibold"
              style={{ color: t.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}
            >
              {fmtARS(t.balance, { compact: true, signo: true })}
            </div>
            <p className="mt-1 text-[10.5px] leading-tight text-txt-mute">
              {t.balance >= 0 ? 'Cerrás el mes en verde.' : 'Estás gastando más de lo que entra.'}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Cuentas"
          sub={`${cuentas.length} cargada${cuentas.length === 1 ? '' : 's'}`}
          icon={Wallet}
          right={<IconButton icon={Plus} label="Nueva cuenta" onClick={() => openCuenta({})} />}
        />
        <div className="space-y-3 px-3 pb-3">
          {grupos.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11.5px] text-txt-mute">Sin cuentas todavía.</p>
          ) : (
            grupos.map(([grupo, lista]) => {
              const sub = lista.reduce((a, c) => a + Number(c.ars || 0) + (dolar ? Number(c.usd || 0) * dolar : 0), 0)
              return (
                <div key={grupo}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="label">{grupo}</span>
                    <span className="mono text-[10.5px] text-txt-sub">{fmtARS(sub, { compact: true })}</span>
                  </div>
                  <div className="space-y-1">
                    {lista.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openCuenta({ cuenta: c })}
                        className="surface flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-all duration-200 ease-swift hover:-translate-y-px hover:bg-elev"
                      >
                        <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: c.color || 'var(--accent)' }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate1 text-[12.5px]">{c.nombre}</span>
                          {Number(c.usd || 0) !== 0 && (
                            <span className="mono block text-[10px] text-txt-mute">{fmtUSD(c.usd)}</span>
                          )}
                        </span>
                        <span className="mono tnum shrink-0 text-[12px]">{fmtARS(c.ars, { compact: true })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Dólar"
          sub={config.dolar_actualizado_at ? `Actualizado ${relTime(config.dolar_actualizado_at)}` : 'Sin cotización cargada'}
          icon={DollarSign}
        />
        <div className="space-y-2 px-3.5 pb-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="surface px-2.5 py-2">
              <div className="label">MEP</div>
              <div className="mono tnum text-[15px] font-semibold" style={{ color: 'var(--accent)' }}>
                {config.dolar_mep ? `$${Number(config.dolar_mep).toLocaleString('es-AR')}` : '—'}
              </div>
            </div>
            <div className="surface px-2.5 py-2">
              <div className="label">Oficial</div>
              <div className="mono tnum text-[15px] font-semibold">
                {config.dolar_oficial_compra ? `$${Number(config.dolar_oficial_compra).toLocaleString('es-AR')}` : '—'}
              </div>
            </div>
          </div>
          <Button size="sm" icon={RefreshCw} className="w-full" loading={busy} onClick={actualizarDolar}>
            Actualizar cotización
          </Button>
          {!dolar && (
            <p className="text-[10.5px] leading-tight" style={{ color: 'var(--warning)' }}>
              Sin MEP no se pueden sumar montos en ARS y USD: los totales mixtos quedan incompletos.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
