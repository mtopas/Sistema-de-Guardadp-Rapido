import { useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, CreditCard, Flame, Plus, Receipt, StickyNote, Target, Trash2,
} from 'lucide-react'
import { Button, Card, CardHead, Chip, Empty, IconButton, Input, Progress, Stat } from '../../ui/primitives'
import { Donut, StackBar } from '../../ui/charts'
import { useFin } from '../../store/fin'
import {
  acumuladoCajon, colorFor, cuotasActivas, dolarDe, fmtARS, fmtPct, fmtUSD, isAjuste, isTransferencia,
  movMes, porCategoria, totalesMes,
} from '../../lib/fin'
import { fmtDate, monthLabel } from '../../lib/dates'

export function Dashboard() {
  const { movs, categorias, config, mes, openMov } = useFin()
  const dolar = dolarDe(config)

  const delMes = useMemo(
    () => movs.filter((m) => movMes(m) === mes && !isTransferencia(m) && !isAjuste(m)),
    [movs, mes],
  )
  const t = useMemo(() => totalesMes(movs, mes, dolar), [movs, mes, dolar])
  const gastos = useMemo(() => porCategoria(movs, { tipo: 'expense', mes, dolar }), [movs, mes, dolar])
  const ingresos = useMemo(() => porCategoria(movs, { tipo: 'income', mes, dolar }), [movs, mes, dolar])

  const conColor = (arr) => arr.map((x) => ({ ...x, color: colorFor(x.name, categorias) }))

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ingresos" value={t.ingresos} format={(v) => fmtARS(v)} sub={monthLabel(mes)} tone="good" icon={ArrowUpRight} />
        <Stat
          label="Gastos"
          value={t.gastos}
          format={(v) => fmtARS(v)}
          sub={`${delMes.filter((m) => m.tipo === 'expense').length} movimientos`}
          tone="bad"
          icon={ArrowDownRight}
        />
        <Stat
          label="Balance"
          value={t.balance}
          format={(v) => fmtARS(v, { signo: true })}
          sub={t.balance >= 0 ? 'Superávit del mes' : 'Déficit del mes'}
          tone={t.balance >= 0 ? 'good' : 'bad'}
          icon={Receipt}
        />
        <Stat
          label="Tasa de ahorro"
          value={Math.round(t.tasa)}
          format={(v) => `${v}%`}
          sub="del ingreso queda libre"
          tone={t.tasa >= 20 ? 'good' : t.tasa >= 0 ? 'warn' : 'bad'}
          icon={Target}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <DonutCard title="Gastos por categoría" data={conColor(gastos)} total={t.gastos} vacio="Sin gastos este mes." />
        <DonutCard title="Ingresos por categoría" data={conColor(ingresos)} total={t.ingresos} vacio="Sin ingresos este mes." />
      </div>

      <MovimientosCard movs={delMes} onEdit={(m) => openMov({ mov: m })} />

      <div className="grid gap-3 xl:grid-cols-2">
        <CuotasCard />
        <NotasCard />
      </div>
    </div>
  )
}

function DonutCard({ title, data, total, vacio }) {
  const [sel, setSel] = useState(null)
  if (!data.length) {
    return (
      <Card>
        <CardHead title={title} />
        <Empty title={vacio} body="Los movimientos con categoría Transferencia y Ajuste quedan fuera de estos totales." />
      </Card>
    )
  }
  return (
    <Card spot>
      <CardHead title={title} sub={`${data.length} categoría${data.length === 1 ? '' : 's'}`} />
      <div className="flex flex-col items-center gap-4 px-4 pb-4 sm:flex-row">
        <Donut
          data={data}
          size={156}
          onSlice={(s) => setSel(s.name === sel ? null : s.name)}
          center={
            <div>
              <div className="label">Total</div>
              <div className="mono tnum text-[15px] font-semibold">{fmtARS(total, { compact: true })}</div>
            </div>
          }
        />
        <div className="scroll max-h-[170px] min-w-0 flex-1 space-y-1.5">
          {data.map((d) => (
            <div
              key={d.name}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-150 hover:bg-elev"
              style={sel === d.name ? { background: `color-mix(in srgb, ${d.color} 14%, transparent)` } : undefined}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate1 text-[12px]">{d.name}</span>
              <span className="mono tnum shrink-0 text-[11.5px] text-txt-2">{fmtARS(d.value, { compact: true })}</span>
              <span className="mono shrink-0 text-[10.5px] text-txt-mute">{total ? fmtPct((d.value / total) * 100, 0) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function MovimientosCard({ movs, onEdit }) {
  const { categorias, openMov } = useFin()
  const [filtro, setFiltro] = useState('todos')
  const lista = movs.filter((m) => filtro === 'todos' || m.tipo === filtro)

  return (
    <Card>
      <CardHead
        title="Movimientos del mes"
        sub="Transferencias y ajustes excluidos, igual que en los KPIs"
        icon={Receipt}
        right={
          <>
            <div className="tabs">
              {[['todos', 'Todos'], ['expense', 'Gastos'], ['income', 'Ingresos']].map(([id, label]) => (
                <button key={id} className="tab" data-on={filtro === id} onClick={() => setFiltro(id)}>
                  {filtro === id && <span className="tab-pill" />}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
            <IconButton icon={Plus} label="Nuevo movimiento" onClick={() => openMov()} />
          </>
        }
      />
      {lista.length === 0 ? (
        <Empty
          icon={Receipt}
          title="Nada registrado"
          body="Cargá el primer movimiento del mes y el dashboard se arma solo."
          action={<Button variant="primary" icon={Plus} onClick={() => openMov()}>Nuevo movimiento</Button>}
        />
      ) : (
        <div className="scroll max-h-[360px] px-2 pb-2">
          {lista.map((m) => {
            const color = colorFor(m.categoria_nombre || '', categorias)
            const income = m.tipo === 'income'
            return (
              <button
                key={m.id}
                onClick={() => onEdit(m)}
                className="group flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-all duration-150 hover:bg-elev"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-transform duration-300 ease-spring group-hover:scale-110"
                  style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
                >
                  {income ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate1 text-[12.5px]">{m.descripcion || m.categoria_nombre || 'Movimiento'}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-txt-mute">
                    <span>{fmtDate(m.fecha)}</span>
                    {m.categoria_nombre && <><span>·</span><span style={{ color }}>{m.categoria_nombre}</span></>}
                    {m.cuenta_nombre && <><span>·</span><span>{m.cuenta_nombre}</span></>}
                    {m.cuotas > 1 && <><span>·</span><span>{m.cuotas} cuotas</span></>}
                  </span>
                </span>
                {m._pending && <span className="chip shrink-0 text-[9px]">sin guardar</span>}
                <span
                  className="mono tnum shrink-0 text-[13px] font-semibold"
                  style={{ color: income ? 'var(--income)' : 'var(--expense)' }}
                >
                  {income ? '+' : '−'}{m.moneda === 'USD' ? fmtUSD(Math.abs(m.monto)) : fmtARS(Math.abs(m.monto))}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function CuotasCard() {
  const { movs, mes, categorias, openMov } = useFin()
  const cuotas = useMemo(() => cuotasActivas(movs, mes), [movs, mes])
  if (!cuotas.length) {
    return (
      <Card>
        <CardHead title="Cuotas activas" icon={CreditCard} />
        <Empty title="Sin compras en cuotas" body="Cargá un gasto con más de una cuota y acá vas a ver el avance mes a mes." />
      </Card>
    )
  }
  const totalMes = cuotas.reduce((a, c) => a + (c.moneda === 'USD' ? 0 : c.cuota), 0)
  return (
    <Card>
      <CardHead
        title="Cuotas activas"
        sub={`${fmtARS(totalMes)} comprometidos este mes`}
        icon={CreditCard}
      />
      <div className="scroll max-h-[260px] space-y-2 px-3.5 pb-3.5">
        {cuotas.map((c) => {
          const color = colorFor(c.mov.categoria_nombre || '', categorias)
          const fmt = c.moneda === 'USD' ? fmtUSD : fmtARS
          return (
            <button key={c.mov.id} onClick={() => openMov({ mov: c.mov })} className="w-full text-left">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate1 text-[12px]">{c.mov.descripcion || 'Compra'}</span>
                <span className="mono shrink-0 text-[11px] text-txt-sub">{c.actual}/{c.n}</span>
              </div>
              <Progress value={c.actual} max={c.n} color={color} height={5} />
              <div className="mt-1 flex justify-between text-[10.5px] text-txt-mute">
                <span className="mono">{fmt(c.cuota)} / mes</span>
                <span>restan {fmt(c.restante)} · hasta {c.fin}</span>
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function NotasCard() {
  const { notas, crearNota, borrarNota } = useFin()
  const [txt, setTxt] = useState('')
  return (
    <Card>
      <CardHead title="Notas" sub="Recordatorios pegados al dashboard" icon={StickyNote} />
      <div className="space-y-2 px-3.5 pb-3.5">
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { crearNota(txt.trim()); setTxt('') } }}
        >
          <Input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Pagar la tarjeta el 12…" />
          <Button variant="primary" icon={Plus} type="submit" />
        </form>
        {notas.length === 0 ? (
          <p className="py-3 text-center text-[11.5px] text-txt-mute">Sin notas.</p>
        ) : (
          <div className="scroll max-h-[190px] space-y-1.5">
            {notas.map((n) => (
              <div key={n.id} className="surface group flex items-start gap-2 px-2.5 py-2 a-up">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />
                <p className="min-w-0 flex-1 text-[12px] leading-snug text-txt-2">{n.contenido}</p>
                <IconButton
                  icon={Trash2}
                  size={12}
                  label="Borrar"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => borrarNota(n.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ── Panel derecho del dashboard ──────────────────────────────────── */
export function DashboardRight() {
  const { movs, categorias, objetivos, config, mes } = useFin()
  const dolar = dolarDe(config)
  const gastos = useMemo(() => porCategoria(movs, { tipo: 'expense', mes, dolar }), [movs, mes, dolar])
  const t = useMemo(() => totalesMes(movs, mes, dolar), [movs, mes, dolar])
  const objetivoTasa = Number(config.tasa_ahorro_objetivo || 20)
  const fireMes = useMemo(
    () => movs.filter((m) => movMes(m) === mes).reduce((a, m) => a + (/^fire$/i.test(m.categoria_nombre || '') ? (m.tipo === 'expense' ? 1 : -1) * (m.moneda === 'USD' ? m.monto : dolar ? m.monto / dolar : 0) : 0), 0),
    [movs, mes, dolar],
  )
  const emergencia = objetivos.find((o) => /emergencia/i.test(o.nombre))
  const emergenciaSaldo = emergencia ? acumuladoCajon(movs, emergencia.nombre, dolar, { moneda: 'USD' }) : 0

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead title="Metas del mes" icon={Target} />
        <div className="space-y-3.5 px-3.5 pb-3.5">
          <Progress
            label={`Tasa de ahorro · objetivo ${objetivoTasa}%`}
            value={Math.max(0, t.tasa)}
            max={objetivoTasa || 100}
            color={t.tasa >= objetivoTasa ? 'var(--success)' : 'var(--warning)'}
            showPct
          />
          <div>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="text-txt-sub">Aporte FIRE del mes</span>
              <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>{fmtUSD(fireMes)}</span>
            </div>
            <p className="text-[10.5px] leading-tight text-txt-mute">
              Todo movimiento con categoría <b>FIRE</b> alimenta el plan. El gasto aporta, el ingreso retira.
            </p>
          </div>
          {emergencia && (
            <Progress
              label={`Fondo de emergencia · ${fmtUSD(emergenciaSaldo)}`}
              value={emergenciaSaldo}
              max={Number(emergencia.monto_objetivo || 1)}
              color="var(--info)"
              showPct
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Reparto del gasto" sub={monthLabel(mes)} icon={Flame} />
        <div className="px-3.5 pb-3.5">
          {gastos.length ? (
            <StackBar
              data={gastos.slice(0, 8).map((g) => ({ ...g, color: colorFor(g.name, categorias) }))}
              format={(v) => fmtARS(v, { compact: true })}
            />
          ) : (
            <p className="py-3 text-center text-[11.5px] text-txt-mute">Sin gastos para repartir.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="Top categorías" sub="Del mes en curso" />
        <div className="space-y-2 px-3.5 pb-3.5">
          {gastos.slice(0, 6).map((g, i) => (
            <div key={g.name} className="a-up" style={{ animationDelay: `${i * 60}ms` }}>
              <Progress
                label={g.name}
                value={g.value}
                max={gastos[0]?.value || 1}
                color={colorFor(g.name, categorias)}
                height={5}
              />
              <div className="mono mt-0.5 text-right text-[10px] text-txt-mute">{fmtARS(g.value)}</div>
            </div>
          ))}
          {!gastos.length && <p className="py-3 text-center text-[11.5px] text-txt-mute">Nada por ahora.</p>}
        </div>
      </Card>
    </div>
  )
}
