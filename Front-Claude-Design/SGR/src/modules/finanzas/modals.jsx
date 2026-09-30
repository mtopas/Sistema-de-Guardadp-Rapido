import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight, Banknote, Coins, CreditCard, Target, TrendingUp, Wallet,
} from 'lucide-react'
import {
  Button, ColorPicker, Field, Input, Modal, Select, Switch, Textarea, cx,
} from '../../ui/primitives'
import { useFin } from '../../store/fin'
import {
  TIPOS_CUENTA, TIPOS_INSTRUMENTO, dolarDe, fmtARS, fmtUSD, isReservada, nameOf, parseMonto,
} from '../../lib/fin'
import { toISODate } from '../../lib/dates'
import { toast } from '../../store/ui'

/* ═══ Movimiento ═════════════════════════════════════════════════════ */
export function MovimientoModal() {
  const data = useFin((s) => s.movModal)
  const close = useFin((s) => s.closeMov)
  const { cuentas, categorias, config, crearMov, editarMov, borrarMov, transferir } = useFin()
  const open = !!data
  const mov = data?.mov
  const editando = !!mov?.id && mov.id > 0

  const [modo, setModo] = useState('expense') // expense | income | transfer
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [fecha, setFecha] = useState(toISODate())
  const [desc, setDesc] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [cat, setCat] = useState('')
  const [cuotas, setCuotas] = useState('')
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const p = mov || data?.preset || {}
    setModo(p.tipo || 'expense')
    setMonto(p.monto != null ? String(Math.abs(p.monto)) : '')
    setMoneda(p.moneda || 'ARS')
    setFecha(p.fecha || toISODate())
    setDesc(p.descripcion || '')
    setCuentaId(String(p.cuenta_id ?? cuentas[0]?.id ?? ''))
    setDestinoId('')
    setCat(p.categoria_nombre || '')
    setCuotas(p.cuotas ? String(p.cuotas) : '')
    setNota(p.nota || '')
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const dolar = dolarDe(config)
  const catsVisibles = useMemo(
    () =>
      categorias
        .filter((c) => !c.oculta)
        .filter((c) => {
          const t = String(c.tipo || 'both').toLowerCase()
          if (modo === 'transfer') return true
          if (t === 'both' || !t) return true
          return modo === 'income' ? t.startsWith('ingres') || t === 'income' : t.startsWith('gast') || t === 'expense'
        })
        .map((c) => nameOf(c))
        .sort((a, b) => a.localeCompare(b, 'es')),
    [categorias, modo],
  )

  const guardar = async () => {
    const m = parseMonto(monto)
    if (!Number.isFinite(m) || m <= 0) { toast('El monto tiene que ser mayor a cero', 'warn'); return }
    if (!cuentaId) { toast('Elegí una cuenta', 'warn'); return }
    setBusy(true)
    let ok
    if (modo === 'transfer' && !editando) {
      if (!destinoId || destinoId === cuentaId) { setBusy(false); toast('Elegí una cuenta destino distinta', 'warn'); return }
      ok = await transferir({ origen: Number(cuentaId), destino: Number(destinoId), monto: m, moneda, fecha, descripcion: desc })
    } else {
      const body = {
        tipo: modo,
        monto: m,
        moneda,
        fecha,
        descripcion: desc.trim(),
        cuenta_id: Number(cuentaId),
      }
      if (cat) body.categoria_nombre = cat
      if (cuotas && Number(cuotas) > 1) body.cuotas = Number(cuotas)
      if (nota.trim()) body.nota = nota.trim()
      ok = editando ? await editarMov(mov.id, body) : await crearMov(body)
    }
    setBusy(false)
    if (ok) close()
  }

  const equiv = () => {
    const m = parseMonto(monto)
    if (!Number.isFinite(m) || !dolar) return null
    return moneda === 'ARS' ? `≈ ${fmtUSD(m / dolar)}` : `≈ ${fmtARS(m * dolar)}`
  }

  const MODOS = [
    { id: 'expense', label: 'Gasto', icon: CreditCard, color: 'var(--expense)' },
    { id: 'income', label: 'Ingreso', icon: Banknote, color: 'var(--income)' },
    { id: 'transfer', label: 'Transferencia', icon: ArrowLeftRight, color: 'var(--info)' },
  ]

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
      sub={modo === 'transfer' ? 'Se crean dos movimientos: salida y entrada. No cuentan como ingreso ni gasto.' : undefined}
      icon={Coins}
      width={580}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarMov(mov.id); close() }}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Registrar'}</Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') guardar() }}>
        <div className="grid grid-cols-3 gap-2">
          {MODOS.map((m) => {
            const on = modo === m.id
            const bloqueado = editando && m.id === 'transfer' && modo !== 'transfer'
            return (
              <button
                key={m.id}
                type="button"
                disabled={bloqueado}
                onClick={() => setModo(m.id)}
                className="surface flex items-center justify-center gap-2 py-2.5 text-[12.5px] font-medium transition-all duration-200 ease-swift hover:-translate-y-0.5 disabled:opacity-40"
                style={{
                  boxShadow: on ? `inset 0 0 0 1.5px ${m.color}, 0 10px 22px -14px ${m.color}` : 'inset 0 0 0 1px var(--border)',
                  color: on ? m.color : 'var(--text-2)',
                }}
              >
                <m.icon size={14} /> {m.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-[1fr,96px] gap-3">
          <Field label="Monto" required hint={equiv()}>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0,00"
              autoFocus
              inputMode="decimal"
              className="mono text-[17px] font-semibold"
            />
          </Field>
          <Field label="Moneda">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value)} options={['ARS', 'USD']} />
          </Field>
        </div>

        <Field label="Descripción">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Supermercado, sueldo, aporte FIRE…" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" required>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label={modo === 'transfer' && !editando ? 'Cuenta origen' : 'Cuenta'} required>
            <Select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              placeholder="— Elegir —"
              options={cuentas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </Field>
        </div>

        {modo === 'transfer' && !editando ? (
          <Field label="Cuenta destino" required>
            <Select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              placeholder="— Elegir —"
              options={cuentas.filter((c) => String(c.id) !== String(cuentaId)).map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr,110px]">
            <Field
              label="Categoría"
              hint={
                /^fire$/i.test(cat)
                  ? 'Este movimiento alimenta el cajón FIRE.'
                  : categorias.some((c) => nameOf(c).toLowerCase() === cat.toLowerCase() && c.objetivo_id)
                    ? 'Este movimiento aporta al objetivo homónimo.'
                    : 'Si escribís una categoría nueva, el backend la crea.'
              }
            >
              <Input
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                list="fin-cats"
                placeholder="Comida, FIRE, Transferencia…"
              />
              <datalist id="fin-cats">
                {catsVisibles.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            {modo === 'expense' && (
              <Field label="Cuotas" hint="El monto es el total.">
                <Input value={cuotas} onChange={(e) => setCuotas(e.target.value)} type="number" min="1" placeholder="1" />
              </Field>
            )}
          </div>
        )}

        {modo !== 'transfer' && (
          <Field label="Nota">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Opcional" />
          </Field>
        )}
      </div>
    </Modal>
  )
}

/* ═══ Cuenta ═════════════════════════════════════════════════════════ */
export function CuentaModal() {
  const data = useFin((s) => s.cuentaModal)
  const close = useFin((s) => s.closeCuenta)
  const { crearCuenta, editarCuenta, borrarCuenta, ajustarSaldo } = useFin()
  const open = !!data
  const c = data?.cuenta
  const editando = !!c?.id

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('bank')
  const [color, setColor] = useState('#8b5cf6')
  const [ars, setArs] = useState('')
  const [usd, setUsd] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(c?.nombre || '')
    setTipo(c?.tipo || 'bank')
    setColor(c?.color || '#8b5cf6')
    setArs(c ? String(c.ars ?? 0) : '')
    setUsd(c ? String(c.usd ?? 0) : '')
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!nombre.trim()) return
    setBusy(true)
    if (editando) {
      await editarCuenta(c.id, { nombre: nombre.trim(), name: nombre.trim(), tipo, color })
      const a = parseMonto(ars)
      const u = parseMonto(usd)
      if ((Number.isFinite(a) && a !== Number(c.ars || 0)) || (Number.isFinite(u) && u !== Number(c.usd || 0))) {
        await ajustarSaldo(c, Number.isFinite(a) ? a : c.ars, Number.isFinite(u) ? u : c.usd)
      }
    } else {
      const body = { nombre: nombre.trim(), name: nombre.trim(), tipo, color }
      const a = parseMonto(ars)
      const u = parseMonto(usd)
      if (Number.isFinite(a) && a !== 0) body.saldo_ars = a
      if (Number.isFinite(u) && u !== 0) body.saldo_usd = u
      await crearCuenta(body)
    }
    setBusy(false)
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Cuenta: ${c?.nombre}` : 'Nueva cuenta'}
      sub="Los saldos se derivan de los movimientos: fijarlos crea un movimiento de categoría Ajuste."
      icon={Wallet}
      width={500}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarCuenta(c.id); close() }}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Mercado Pago, Galicia, Efectivo…" />
        </Field>
        <Field label="Tipo">
          <div className="tabs">
            {TIPOS_CUENTA.map((t) => (
              <button key={t.id} type="button" className="tab flex-1" data-on={tipo === t.id} onClick={() => setTipo(t.id)}>
                {tipo === t.id && <span className="tab-pill" />}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saldo ARS" hint={editando ? 'Se ajusta con un movimiento' : 'Saldo inicial'}>
            <Input value={ars} onChange={(e) => setArs(e.target.value)} inputMode="decimal" className="mono" placeholder="0" />
          </Field>
          <Field label="Saldo USD">
            <Input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal" className="mono" placeholder="0" />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  )
}

/* ═══ Objetivo ═══════════════════════════════════════════════════════ */
export function ObjetivoModal() {
  const data = useFin((s) => s.objetivoModal)
  const close = useFin((s) => s.closeObjetivo)
  const { crearObjetivo, editarObjetivo, borrarObjetivo, categorias } = useFin()
  const open = !!data
  const o = data?.objetivo
  const editando = !!o?.id

  const [nombre, setNombre] = useState('')
  const [meta, setMeta] = useState('')
  const [fecha, setFecha] = useState('')
  const [color, setColor] = useState('#10b981')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(o?.nombre || '')
    setMeta(o?.monto_objetivo != null ? String(o.monto_objetivo) : '')
    setFecha(o?.fecha_objetivo || '')
    setColor(o?.color || '#10b981')
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const choca = !editando && categorias.some((c) => nameOf(c).toLowerCase() === nombre.trim().toLowerCase())

  const guardar = async () => {
    const m = parseMonto(meta)
    if (!nombre.trim()) return
    if (!Number.isFinite(m) || m <= 0) { toast('La meta tiene que ser mayor a cero', 'warn'); return }
    setBusy(true)
    const body = { monto_objetivo: m, color }
    if (fecha) body.fecha_objetivo = fecha
    const ok = editando ? await editarObjetivo(o.id, body) : await crearObjetivo({ ...body, nombre: nombre.trim() })
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Objetivo: ${o?.nombre}` : 'Nuevo objetivo de ahorro'}
      sub="Cada objetivo crea una categoría homónima: los gastos con esa categoría suman al cajón y los ingresos restan."
      icon={Target}
      width={500}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarObjetivo(o.id); close() }}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Nombre"
          required
          error={choca ? 'Ya existe una categoría con ese nombre.' : undefined}
          hint={editando ? 'El nombre no se puede cambiar: la categoría homónima lo fija.' : undefined}
        >
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={editando} autoFocus placeholder="Viaje, Auto, Fondo de emergencia…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meta (USD)" required>
            <Input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="decimal" className="mono" placeholder="5000" />
          </Field>
          <Field label="Fecha objetivo">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  )
}

/* ═══ Instrumento ════════════════════════════════════════════════════ */
export function InstrumentoModal() {
  const data = useFin((s) => s.instrumentoModal)
  const close = useFin((s) => s.closeInstrumento)
  const { crearInstrumento, editarInstrumento, borrarInstrumento } = useFin()
  const open = !!data
  const it = data?.instrumento
  const editando = !!it?.id
  const conLedger = !!it?.has_transactions

  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))

  useEffect(() => {
    if (!open) return
    setF({
      nombre: it?.nombre || '',
      ticker: it?.ticker || '',
      tipo: it?.tipo || 'acciones',
      precio_actual: it?.precio_actual ?? '',
      capital_ars: it?.capital_ars ?? '',
      tna: it?.tna ?? '',
      fecha_inicio: it?.fecha_inicio || toISODate(),
      fecha_vencimiento: it?.fecha_vencimiento || '',
      cantidad: it?.cantidad ?? '',
      costo_usd: it?.costo_usd ?? '',
      nota: it?.nota || '',
    })
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const esPF = f.tipo === 'plazo_fijo'

  const guardar = async () => {
    if (!f.nombre?.trim()) return
    setBusy(true)
    const body = { nombre: f.nombre.trim(), tipo: f.tipo, nota: f.nota || null }
    if (!conLedger) body.ticker = (f.ticker || '').trim().toUpperCase() || null
    if (esPF) {
      body.capital_ars = num(f.capital_ars)
      body.tna = num(f.tna)
      body.fecha_inicio = f.fecha_inicio || null
      body.fecha_vencimiento = f.fecha_vencimiento || null
    } else {
      body.precio_actual = num(f.precio_actual)
      if (!conLedger) {
        if (num(f.cantidad) != null) body.cantidad = num(f.cantidad)
        if (num(f.costo_usd) != null) body.costo_usd = num(f.costo_usd)
      }
    }
    const ok = editando ? await editarInstrumento(it.id, body) : await crearInstrumento(body)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Instrumento: ${it?.nombre}` : 'Nuevo instrumento'}
      sub={conLedger ? 'Tiene operaciones cargadas: cantidad, costo y ticker los recalcula el ledger.' : undefined}
      icon={TrendingUp}
      width={560}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarInstrumento(it.id); close() }}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr,130px]">
          <Field label="Nombre" required>
            <Input value={f.nombre || ''} onChange={(e) => set('nombre', e.target.value)} autoFocus placeholder="Apple, FCI Balanz, Plazo fijo Galicia…" />
          </Field>
          <Field label="Ticker" hint={conLedger ? 'fijado' : undefined}>
            <Input value={f.ticker || ''} onChange={(e) => set('ticker', e.target.value)} disabled={conLedger} className="mono uppercase" placeholder="AAPL" />
          </Field>
        </div>
        <Field label="Tipo">
          <Select value={f.tipo} onChange={(e) => set('tipo', e.target.value)} options={TIPOS_INSTRUMENTO.map((t) => ({ value: t.id, label: t.label }))} />
        </Field>

        {esPF ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Capital ARS">
                <Input value={f.capital_ars ?? ''} onChange={(e) => set('capital_ars', e.target.value)} inputMode="decimal" className="mono" />
              </Field>
              <Field label="TNA %">
                <Input value={f.tna ?? ''} onChange={(e) => set('tna', e.target.value)} inputMode="decimal" className="mono" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio">
                <Input type="date" value={f.fecha_inicio || ''} onChange={(e) => set('fecha_inicio', e.target.value)} />
              </Field>
              <Field label="Vencimiento">
                <Input type="date" value={f.fecha_vencimiento || ''} onChange={(e) => set('fecha_vencimiento', e.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Precio USD">
              <Input value={f.precio_actual ?? ''} onChange={(e) => set('precio_actual', e.target.value)} inputMode="decimal" className="mono" />
            </Field>
            <Field label="Cantidad" hint={conLedger ? 'del ledger' : undefined}>
              <Input value={f.cantidad ?? ''} onChange={(e) => set('cantidad', e.target.value)} disabled={conLedger} inputMode="decimal" className="mono" />
            </Field>
            <Field label="Costo USD" hint={conLedger ? 'del ledger' : undefined}>
              <Input value={f.costo_usd ?? ''} onChange={(e) => set('costo_usd', e.target.value)} disabled={conLedger} inputMode="decimal" className="mono" />
            </Field>
          </div>
        )}

        <Field label="Nota">
          <Textarea value={f.nota || ''} onChange={(e) => set('nota', e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  )
}

/* ═══ Operación del ledger ═══════════════════════════════════════════ */
export function TransaccionModal() {
  const data = useFin((s) => s.txModal)
  const close = useFin((s) => s.closeTx)
  const { instrumentos, config, crearTransaccion, editarTransaccion, borrarTransaccion } = useFin()
  const open = !!data
  const tx = data?.tx
  const editando = !!tx?.id

  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const dolar = dolarDe(config)

  useEffect(() => {
    if (!open) return
    setF({
      instrumento_id: String(tx?.instrumento_id ?? data?.instrumentoId ?? instrumentos[0]?.id ?? ''),
      ticker: tx?.ticker || '',
      tipo: tx?.tipo || 'compra',
      fecha: tx?.fecha || toISODate(),
      cantidad: tx?.cantidad ?? '',
      precio: tx?.precio ?? '',
      monto_total: tx?.monto_total ?? '',
      moneda: tx?.moneda || 'USD',
      tipo_cambio: tx?.tipo_cambio ?? (dolar || ''),
      nota: tx?.nota || '',
    })
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Total sugerido = cantidad × precio, si el usuario no lo escribió a mano.
  const totalCalc = useMemo(() => {
    const c = num(f.cantidad)
    const p = num(f.precio)
    return c != null && p != null ? c * p : null
  }, [f.cantidad, f.precio])

  const guardar = async () => {
    const c = num(f.cantidad)
    const p = num(f.precio)
    if (!f.instrumento_id) { toast('Elegí un instrumento', 'warn'); return }
    if (c == null || c <= 0) { toast('La cantidad tiene que ser mayor a cero', 'warn'); return }
    setBusy(true)
    const body = {
      instrumento_id: Number(f.instrumento_id),
      tipo: f.tipo,
      fecha: f.fecha,
      cantidad: c,
      precio: p ?? 0,
      monto_total: num(f.monto_total) ?? totalCalc ?? 0,
      moneda: f.moneda,
      nota: f.nota || null,
    }
    if (f.moneda === 'ARS') body.tipo_cambio = num(f.tipo_cambio) ?? dolar ?? null
    const ok = editando ? await editarTransaccion(tx.id, body) : await crearTransaccion(body)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? 'Editar operación' : 'Nueva operación'}
      sub="El ledger es la fuente de verdad: cada alta o baja recalcula la posición con precio promedio ponderado."
      icon={TrendingUp}
      width={560}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarTransaccion(tx.id); close() }}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Registrar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr,150px]">
          <Field label="Instrumento" required>
            <Select
              value={f.instrumento_id}
              onChange={(e) => set('instrumento_id', e.target.value)}
              placeholder="— Elegir —"
              options={instrumentos.map((i) => ({ value: i.id, label: `${i.nombre}${i.ticker ? ` · ${i.ticker}` : ''}` }))}
            />
          </Field>
          <Field label="Tipo">
            <div className="tabs">
              {['compra', 'venta'].map((t) => (
                <button key={t} type="button" className="tab flex-1 capitalize" data-on={f.tipo === t} onClick={() => set('tipo', t)}>
                  {f.tipo === t && <span className="tab-pill" />}
                  <span className="relative z-10">{t}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cantidad" required>
            <Input value={f.cantidad ?? ''} onChange={(e) => set('cantidad', e.target.value)} inputMode="decimal" className="mono" autoFocus />
          </Field>
          <Field label="Precio unitario">
            <Input value={f.precio ?? ''} onChange={(e) => set('precio', e.target.value)} inputMode="decimal" className="mono" />
          </Field>
          <Field label="Fecha" required>
            <Input type="date" value={f.fecha || ''} onChange={(e) => set('fecha', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total" hint={totalCalc != null ? `calc. ${totalCalc.toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : undefined}>
            <Input
              value={f.monto_total ?? ''}
              onChange={(e) => set('monto_total', e.target.value)}
              placeholder={totalCalc != null ? String(totalCalc.toFixed(2)) : ''}
              inputMode="decimal"
              className="mono"
            />
          </Field>
          <Field label="Moneda">
            <Select value={f.moneda} onChange={(e) => set('moneda', e.target.value)} options={['USD', 'ARS']} />
          </Field>
          {f.moneda === 'ARS' && (
            <Field label="Tipo de cambio" hint="se guarda con la operación">
              <Input value={f.tipo_cambio ?? ''} onChange={(e) => set('tipo_cambio', e.target.value)} inputMode="decimal" className="mono" />
            </Field>
          )}
        </div>
        <Field label="Nota">
          <Input value={f.nota || ''} onChange={(e) => set('nota', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = parseMonto(v)
  return Number.isFinite(n) ? n : null
}
