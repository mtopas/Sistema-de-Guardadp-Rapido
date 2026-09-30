import { useMemo, useState } from 'react'
import {
  Briefcase, Coins, Droplet, Flame, PiggyBank, Plus, Target, TrendingUp, Wallet,
} from 'lucide-react'
import { Button, Card, CardHead, Chip, Empty, IconButton, Progress, SearchInput, Stat } from '../../ui/primitives'
import { Rings, StackBar } from '../../ui/charts'
import { useFin } from '../../store/fin'
import {
  TIPOS_INSTRUMENTO, acumuladoCajon, costoInstrumentoUSD, dolarDe, fmtARS, fmtPct, fmtUSD,
  hashColor, interesPlazoFijo, valorInstrumentoUSD,
} from '../../lib/fin'
import { fmtDate } from '../../lib/dates'

/**
 * Tab Ahorro. El reparto sale de los cajones (categoría FIRE + una categoría
 * por objetivo) menos el costo de los instrumentos: lo que queda es "líquido
 * sin invertir".
 */
export function Ahorro() {
  const { movs, objetivos, instrumentos, transacciones, config, openInstrumento, openTx, openObjetivo } = useFin()
  const dolar = dolarDe(config)
  const [q, setQ] = useState('')

  const cajones = useMemo(() => {
    const fire = acumuladoCajon(movs, 'FIRE', dolar, { moneda: 'USD' })
    const objs = objetivos.map((o) => ({
      objetivo: o,
      nombre: o.nombre,
      color: o.color || hashColor(o.nombre),
      saldo: acumuladoCajon(movs, o.nombre, dolar, { moneda: 'USD' }),
      meta: Number(o.monto_objetivo || 0),
    }))
    return { fire, objs, total: fire + objs.reduce((a, o) => a + o.saldo, 0) }
  }, [movs, objetivos, dolar])

  const cartera = useMemo(() => {
    const costo = instrumentos.reduce((a, i) => a + costoInstrumentoUSD(i, dolar), 0)
    const valor = instrumentos.reduce((a, i) => a + valorInstrumentoUSD(i, dolar), 0)
    return { costo, valor, pnl: valor - costo, pnlPct: costo ? ((valor - costo) / costo) * 100 : 0 }
  }, [instrumentos, dolar])

  const liquido = cajones.total - cartera.costo

  const reparto = [
    { name: 'FIRE', value: Math.max(0, cajones.fire), color: 'var(--accent)' },
    ...cajones.objs.filter((o) => o.saldo > 0).map((o) => ({ name: o.nombre, value: o.saldo, color: o.color })),
    { name: 'Líquido sin invertir', value: Math.max(0, liquido), color: 'var(--b2)' },
  ]

  const ledger = useMemo(() => {
    const t = q.trim().toLowerCase()
    const byId = new Map(instrumentos.map((i) => [i.id, i]))
    return transacciones
      .map((x) => ({ ...x, inst: byId.get(x.instrumento_id) }))
      .filter((x) => !t || `${x.ticker || ''} ${x.inst?.nombre || ''} ${x.nota || ''}`.toLowerCase().includes(t))
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
  }, [transacciones, instrumentos, q])

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total en cajones" value={fmtUSD(cajones.total)} sub="FIRE + objetivos" animate={false} icon={PiggyBank} tone="good" />
        <Stat label="Invertido (costo)" value={fmtUSD(cartera.costo)} sub={`${instrumentos.length} instrumentos`} animate={false} icon={Briefcase} />
        <Stat
          label="Valor de cartera"
          value={fmtUSD(cartera.valor)}
          sub={`${cartera.pnl >= 0 ? '+' : ''}${fmtUSD(cartera.pnl)} de resultado`}
          animate={false}
          icon={TrendingUp}
          tone={cartera.pnl >= 0 ? 'good' : 'bad'}
          delta={cartera.costo ? cartera.pnlPct : null}
        />
        <Stat
          label="Líquido sin invertir"
          value={fmtUSD(liquido)}
          sub="cajones − costo de instrumentos"
          animate={false}
          icon={Droplet}
          tone={liquido >= 0 ? 'warn' : 'bad'}
        />
      </div>

      <Card spot>
        <CardHead title="Reparto del ahorro" sub="Todo en USD al MEP" icon={Coins} />
        <div className="px-4 pb-4">
          {reparto.some((r) => r.value > 0) ? (
            <StackBar data={reparto} height={14} format={(v) => fmtUSD(v, { compact: true })} />
          ) : (
            <p className="py-4 text-center text-[12px] text-txt-mute">
              Sin aportes registrados. Cargá un gasto con categoría <b>FIRE</b> o con el nombre de un objetivo.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Portafolio"
          sub="Cantidad y costo se recalculan desde el ledger (PPC ponderado)"
          icon={Briefcase}
          right={
            <>
              <Button size="sm" icon={Plus} onClick={() => openTx({})}>Operación</Button>
              <IconButton icon={Plus} label="Nuevo instrumento" onClick={() => openInstrumento({})} />
            </>
          }
        />
        {instrumentos.length === 0 ? (
          <Empty
            icon={Briefcase}
            title="Sin instrumentos"
            body="Creá un instrumento (acción, FCI, plazo fijo, cripto…) y después registrá las compras en el ledger."
            action={<Button variant="primary" icon={Plus} onClick={() => openInstrumento({})}>Nuevo instrumento</Button>}
          />
        ) : (
          <div className="scroll max-h-[330px] px-1 pb-2">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo USD</th>
                  <th className="num">Valor USD</th>
                  <th className="num">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {instrumentos.map((i) => {
                  const costo = costoInstrumentoUSD(i, dolar)
                  const valor = valorInstrumentoUSD(i, dolar)
                  const pnl = valor - costo
                  const tipo = TIPOS_INSTRUMENTO.find((t) => t.id === i.tipo)?.label || i.tipo
                  return (
                    <tr key={i.id} className="cursor-pointer" onClick={() => openInstrumento({ instrumento: i })}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-1 rounded-full" style={{ background: hashColor(i.ticker || i.nombre) }} />
                          <div className="min-w-0">
                            <div className="truncate1 text-[12.5px]">{i.nombre}</div>
                            {i.ticker && <div className="mono text-[10px] text-txt-mute">{i.ticker}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="text-[11.5px] text-txt-sub">{tipo}</td>
                      <td className="num">
                        {i.tipo === 'plazo_fijo'
                          ? fmtARS(Number(i.capital_ars || 0), { compact: true })
                          : Number(i.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                      </td>
                      <td className="num">{fmtUSD(costo)}</td>
                      <td className="num">{fmtUSD(valor)}</td>
                      <td className="num font-semibold" style={{ color: pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
                        {i.tipo === 'plazo_fijo' && (
                          <span className="ml-1 block text-[9.5px] font-normal text-txt-mute">
                            interés {fmtARS(interesPlazoFijo(i), { compact: true })}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHead
          title="Ledger de operaciones"
          sub="Fuente de verdad del portafolio"
          icon={Coins}
          right={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Filtrar por ticker…" className="w-40" />
              <IconButton icon={Plus} label="Nueva operación" onClick={() => openTx({})} />
            </>
          }
        />
        {ledger.length === 0 ? (
          <Empty title="Sin operaciones" body="Registrá compras y ventas: cada movimiento recalcula la posición." />
        ) : (
          <div className="scroll max-h-[340px] px-1 pb-2">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Instrumento</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Precio</th>
                  <th className="num">Total</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((x) => {
                  const venta = String(x.tipo).toLowerCase() === 'venta'
                  return (
                    <tr key={x.id} className="cursor-pointer" onClick={() => openTx({ tx: x })}>
                      <td className="mono whitespace-nowrap text-[11.5px]">{fmtDate(x.fecha)}</td>
                      <td className="truncate1 text-[12px]">{x.inst?.nombre || x.ticker || '—'}</td>
                      <td>
                        <Chip color={venta ? 'var(--danger)' : 'var(--success)'}>{venta ? 'Venta' : 'Compra'}</Chip>
                      </td>
                      <td className="num">{Number(x.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 4 })}</td>
                      <td className="num">{x.moneda === 'ARS' ? fmtARS(x.precio) : fmtUSD(x.precio)}</td>
                      <td className="num font-semibold">{x.moneda === 'ARS' ? fmtARS(x.monto_total) : fmtUSD(x.monto_total)}</td>
                      <td className="truncate1 max-w-[140px] text-[11px] text-txt-mute">{x.nota || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export function AhorroRight() {
  const { movs, objetivos, config, mes, openObjetivo } = useFin()
  const dolar = dolarDe(config)

  const objs = useMemo(
    () =>
      objetivos.map((o) => {
        const saldo = acumuladoCajon(movs, o.nombre, dolar, { moneda: 'USD' })
        const meta = Number(o.monto_objetivo || 0)
        return {
          ...o,
          saldo,
          meta,
          pct: meta ? Math.min(1, saldo / meta) : 0,
          color: o.color || hashColor(o.nombre),
        }
      }),
    [objetivos, movs, dolar],
  )

  const fireMes = useMemo(
    () => acumuladoCajon(movs.filter((m) => String(m.fecha).slice(0, 7) === mes), 'FIRE', dolar, { moneda: 'USD' }),
    [movs, mes, dolar],
  )
  const fireTotal = useMemo(() => acumuladoCajon(movs, 'FIRE', dolar, { moneda: 'USD' }), [movs, dolar])

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead title="Cajón FIRE" icon={Flame} />
        <div className="flex items-center gap-3 px-3.5 pb-3.5">
          <div className="min-w-0 flex-1">
            <div className="label">Acumulado</div>
            <div className="grad-text mono tnum text-[22px] font-bold leading-none">{fmtUSD(fireTotal)}</div>
            <div className="mt-2 text-[11px] text-txt-sub">
              Este mes: <b className="mono" style={{ color: fireMes >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtUSD(fireMes)}</b>
            </div>
          </div>
          {Number(config.fire_meta) > 0 && (
            <Rings
              items={[{ name: 'FIRE', pct: fireTotal / Number(config.fire_meta), color: 'var(--accent)' }]}
              size={80}
              thickness={8}
              center={<span className="mono text-[12px] font-bold">{fmtPct((fireTotal / Number(config.fire_meta)) * 100, 0)}</span>}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Objetivos"
          sub={`${objetivos.length} activo${objetivos.length === 1 ? '' : 's'}`}
          icon={Target}
          right={<IconButton icon={Plus} label="Nuevo objetivo" onClick={() => openObjetivo({})} />}
        />
        {objs.length === 0 ? (
          <Empty
            title="Sin objetivos"
            body="Creá uno y el backend agrega su categoría homónima para asignarle movimientos."
            action={<Button size="sm" variant="primary" icon={Plus} onClick={() => openObjetivo({})}>Nuevo objetivo</Button>}
          />
        ) : (
          <>
            <div className="grid place-items-center pb-1">
              <Rings
                items={objs.slice(0, 5)}
                size={148}
                center={
                  <div>
                    <div className="label">Cajones</div>
                    <div className="mono tnum text-[14px] font-semibold">
                      {fmtUSD(objs.reduce((a, o) => a + o.saldo, 0), { compact: true })}
                    </div>
                  </div>
                }
              />
            </div>
            <div className="space-y-2.5 px-3.5 pb-3.5">
              {objs.map((o, i) => (
                <button
                  key={o.id}
                  className="w-full text-left a-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => openObjetivo({ objetivo: o })}
                >
                  <Progress
                    label={o.nombre}
                    value={o.saldo}
                    max={o.meta || 1}
                    color={o.color}
                    height={6}
                    showPct
                  />
                  <div className="mt-0.5 flex justify-between text-[10.5px] text-txt-mute">
                    <span className="mono">{fmtUSD(o.saldo)} / {fmtUSD(o.meta)}</span>
                    {o.fecha_objetivo && <span>para {fmtDate(o.fecha_objetivo, { month: 'short', year: '2-digit' })}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHead title="Cómo se asigna" icon={Wallet} />
        <ul className="space-y-1.5 px-3.5 pb-3.5 text-[11.5px] leading-relaxed text-txt-sub">
          <li>· Un <b>gasto</b> con la categoría del cajón <b>suma</b> al cajón.</li>
          <li>· Un <b>ingreso</b> con esa categoría <b>resta</b> (retiro): el cajón puede quedar negativo.</li>
          <li>· Si el movimiento no tiene categoría, alcanza con que la <b>descripción</b> sea igual al nombre del objetivo o «FIRE».</li>
          <li>· Las <b>transferencias</b> nunca entran en estos totales.</li>
        </ul>
      </Card>
    </div>
  )
}
