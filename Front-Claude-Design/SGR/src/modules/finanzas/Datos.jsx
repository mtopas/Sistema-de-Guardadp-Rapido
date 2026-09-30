import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy, Database, Download, Layers, Pencil, Plus, Search, Trash2, Upload, X,
} from 'lucide-react'
import {
  Button, Card, CardHead, Checkbox, Chip, ColorPicker, Confirm, Empty, Field, IconButton,
  Input, Modal, SearchInput, Select, Stat, cx,
} from '../../ui/primitives'
import { useFin } from '../../store/fin'
import {
  colorFor, csvEscape, dolarDe, downloadFile, fmtARS, fmtUSD, isReservada, isAjuste,
  isTransferencia, nameOf, parseCSV, parseMonto, toCSV,
} from '../../lib/fin'
import { fmtDate, toISODate } from '../../lib/dates'
import { toast } from '../../store/ui'

export function Datos() {
  const { movs, categorias, cuentas, config, editarMov, borrarMovsBulk, editarMovsBulk, importarCSV, duplicados } = useFin()
  const dolar = dolarDe(config)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [cat, setCat] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [bulk, setBulk] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [dups, setDups] = useState(null)
  const fileRef = useRef(null)

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return movs.filter((m) => {
      if (t && !`${m.descripcion} ${m.categoria_nombre || ''} ${m.cuenta_nombre || ''}`.toLowerCase().includes(t)) return false
      if (tipo && m.tipo !== tipo) return false
      if (cat && String(m.categoria_nombre || '') !== cat) return false
      if (cuenta && String(m.cuenta_id) !== String(cuenta)) return false
      if (desde && String(m.fecha) < desde) return false
      if (hasta && String(m.fecha) > hasta) return false
      return true
    })
  }, [movs, q, tipo, cat, cuenta, desde, hasta])

  const totales = useMemo(() => {
    let ingresos = 0
    let gastos = 0
    for (const m of filtrados) {
      if (isTransferencia(m) || isAjuste(m)) continue
      const v = m.moneda === 'USD' ? (dolar ? m.monto * dolar : 0) : m.monto
      if (m.tipo === 'income') ingresos += v
      else gastos += v
    }
    return { ingresos, gastos, balance: ingresos - gastos, n: filtrados.length }
  }, [filtrados, dolar])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todos = filtrados.length > 0 && filtrados.every((m) => sel.has(m.id))

  const exportar = () => {
    const csv = toCSV(filtrados, [
      { label: 'fecha', get: (m) => m.fecha },
      { label: 'tipo', get: (m) => m.tipo },
      { label: 'monto', get: (m) => m.monto },
      { label: 'moneda', get: (m) => m.moneda },
      { label: 'descripcion', get: (m) => m.descripcion },
      { label: 'categoria', get: (m) => m.categoria_nombre || '' },
      { label: 'cuenta', get: (m) => m.cuenta_nombre || '' },
      { label: 'cuotas', get: (m) => m.cuotas || '' },
    ])
    downloadFile(`sgr-movimientos-${toISODate()}.csv`, csv)
    toast(`${filtrados.length} filas exportadas`)
  }

  const importar = async (file) => {
    if (!file) return
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length < 2) { toast('El CSV no tiene filas de datos', 'warn'); return }
    const head = rows[0].map((h) => h.trim().toLowerCase())
    const idx = (n) => head.indexOf(n)
    const filas = rows.slice(1).map((r) => ({
      fecha: r[idx('fecha')] || toISODate(),
      tipo: (r[idx('tipo')] || 'expense').trim(),
      monto: parseMonto(r[idx('monto')]),
      moneda: (r[idx('moneda')] || 'ARS').toUpperCase(),
      descripcion: r[idx('descripcion')] || '',
      categoria_nombre: r[idx('categoria')] || null,
      cuenta_nombre: r[idx('cuenta')] || null,
      cuotas: r[idx('cuotas')] ? Number(r[idx('cuotas')]) : null,
    })).filter((f) => Number.isFinite(f.monto))
    if (!filas.length) { toast('No se reconoció ninguna fila válida', 'warn'); return }
    await importarCSV(filas)
  }

  return (
    <div className="space-y-3">
      <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Filas filtradas" value={totales.n} sub={`de ${movs.length} en total`} icon={Database} />
        <Stat label="Ingresos" value={fmtARS(totales.ingresos, { compact: true })} animate={false} tone="good" />
        <Stat label="Gastos" value={fmtARS(totales.gastos, { compact: true })} animate={false} tone="bad" />
        <Stat label="Balance" value={fmtARS(totales.balance, { compact: true })} animate={false} tone={totales.balance >= 0 ? 'good' : 'bad'} />
      </div>

      <Card>
        <CardHead
          title="Histórico de movimientos"
          sub="Editable en la tabla · selección múltiple para acciones masivas"
          icon={Database}
          right={
            <>
              <Button size="sm" icon={Copy} onClick={async () => { const d = await duplicados(); setDups(Array.isArray(d) ? d : d?.duplicados || []) }}>
                Duplicados
              </Button>
              <Button size="sm" icon={Download} onClick={exportar}>CSV</Button>
              <Button size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>Importar</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => importar(e.target.files?.[0])} />
            </>
          }
        />

        <div className="grid gap-2 border-b border-line px-3.5 pb-3 sm:grid-cols-2 xl:grid-cols-6">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar…" className="xl:col-span-2" />
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Todo tipo" options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }, { value: 'transfer', label: 'Transferencias' }]} />
          <Select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            placeholder="Toda categoría"
            options={[...new Set(movs.map((m) => m.categoria_nombre).filter(Boolean))].sort().map((c) => ({ value: c, label: c }))}
          />
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} title="Desde" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} title="Hasta" />
        </div>

        {sel.size > 0 && (
          <div
            className="flex items-center gap-2 border-b border-line px-3.5 py-2 a-down"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
          >
            <span className="text-[12px] font-medium">{sel.size} seleccionado{sel.size === 1 ? '' : 's'}</span>
            <Button size="sm" icon={Pencil} onClick={() => setBulk({ ids: [...sel] })}>Cambiar categoría</Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>Eliminar</Button>
            <IconButton icon={X} label="Limpiar" className="ml-auto" onClick={() => setSel(new Set())} />
          </div>
        )}

        {filtrados.length === 0 ? (
          <Empty icon={Search} title="Sin resultados" body="Ajustá los filtros o importá un CSV con tu histórico." />
        ) : (
          <div className="scroll max-h-[540px] px-1 pb-2">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <Checkbox
                      checked={todos}
                      onChange={(v) => setSel(v ? new Set(filtrados.map((m) => m.id)) : new Set())}
                    />
                  </th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Cuenta</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 600).map((m) => {
                  const color = colorFor(m.categoria_nombre || '', categorias)
                  return (
                    <tr key={m.id} style={sel.has(m.id) ? { background: 'color-mix(in srgb, var(--accent) 9%, transparent)' } : undefined}>
                      <td><Checkbox checked={sel.has(m.id)} onChange={() => toggle(m.id)} /></td>
                      <td className="p-0">
                        <input
                          type="date"
                          className="mono w-[128px] bg-transparent px-2 py-1.5 text-[11.5px] outline-none focus:bg-elev"
                          value={m.fecha || ''}
                          onChange={(e) => editarMov(m.id, { fecha: e.target.value })}
                        />
                      </td>
                      <td className="p-0">
                        <input
                          className="w-full min-w-[150px] bg-transparent px-2 py-1.5 text-[12.5px] outline-none focus:bg-elev"
                          defaultValue={m.descripcion || ''}
                          onBlur={(e) => e.target.value !== (m.descripcion || '') && editarMov(m.id, { descripcion: e.target.value })}
                        />
                      </td>
                      <td className="p-0">
                        <input
                          className="w-full min-w-[110px] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:bg-elev"
                          style={{ color }}
                          defaultValue={m.categoria_nombre || ''}
                          list="datos-cats"
                          onBlur={(e) => e.target.value !== (m.categoria_nombre || '') && editarMov(m.id, { categoria_nombre: e.target.value || null })}
                        />
                      </td>
                      <td className="text-[11.5px] text-txt-sub">{m.cuenta_nombre || '—'}</td>
                      <td className="num p-0">
                        <input
                          className="mono w-[110px] bg-transparent px-2 py-1.5 text-right text-[12.5px] font-semibold outline-none focus:bg-elev"
                          style={{ color: m.tipo === 'income' ? 'var(--income)' : m.tipo === 'transfer' ? 'var(--info)' : 'var(--expense)' }}
                          defaultValue={m.monto}
                          onBlur={(e) => {
                            const v = parseMonto(e.target.value)
                            if (Number.isFinite(v) && v !== m.monto) editarMov(m.id, { monto: v })
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="datos-cats">
              {categorias.map((c) => <option key={c.id} value={nameOf(c)} />)}
            </datalist>
            {filtrados.length > 600 && (
              <p className="py-2 text-center text-[11px] text-txt-mute">
                Mostrando las primeras 600 de {filtrados.length}. Acotá el rango de fechas para ver el resto.
              </p>
            )}
          </div>
        )}
      </Card>

      <BulkCategoriaModal
        open={!!bulk}
        ids={bulk?.ids || []}
        onClose={() => setBulk(null)}
        onSave={async (categoria_nombre) => {
          await editarMovsBulk(bulk.ids.map((id) => ({ id, categoria_nombre })))
          setSel(new Set())
        }}
      />

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Eliminar ${sel.size} movimientos`}
        body="Se borran del histórico y los saldos de las cuentas se recalculan. No hay deshacer."
        onConfirm={async () => { await borrarMovsBulk([...sel]); setSel(new Set()) }}
      />

      <Modal open={!!dups} onClose={() => setDups(null)} title="Posibles duplicados" icon={Copy} width={620}>
        {!dups?.length ? (
          <p className="py-6 text-center text-[13px] text-txt-sub">No se detectaron duplicados.</p>
        ) : (
          <div className="space-y-2">
            {dups.map((d, i) => (
              <div key={i} className="surface px-3 py-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <span className="truncate1">{d.descripcion || d.desc || 'Movimiento'}</span>
                  <span className="mono shrink-0">{fmtARS(d.monto ?? d.amount ?? 0)}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-txt-mute">
                  {fmtDate(d.fecha)} · {d.veces ? `${d.veces} repeticiones` : 'repetido'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function BulkCategoriaModal({ open, ids, onClose, onSave }) {
  const { categorias } = useFin()
  const [cat, setCat] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cambiar categoría de ${ids.length} movimientos`}
      icon={Layers}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => { setBusy(true); await onSave(cat || null); setBusy(false); onClose() }}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <Field label="Nueva categoría" hint="Dejalo vacío para quitar la categoría.">
        <Input value={cat} onChange={(e) => setCat(e.target.value)} list="bulk-cats" autoFocus placeholder="Comida, FIRE…" />
        <datalist id="bulk-cats">
          {categorias.map((c) => <option key={c.id} value={nameOf(c)} />)}
        </datalist>
      </Field>
    </Modal>
  )
}

/* ── Panel derecho: CRUD de categorías ────────────────────────────── */
export function DatosRight() {
  const { categorias, movs, crearCategoria, editarCategoria, borrarCategoria } = useFin()
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [verOcultas, setVerOcultas] = useState(false)

  const uso = useMemo(() => {
    const m = new Map()
    for (const x of movs) {
      const k = String(x.categoria_nombre || '').toLowerCase()
      if (k) m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [movs])

  const lista = useMemo(
    () =>
      categorias
        .filter((c) => verOcultas || !c.oculta)
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es')),
    [categorias, verOcultas],
  )

  const kpis = useMemo(() => {
    const total = movs.length
    const rango = movs.length
      ? [movs[movs.length - 1]?.fecha, movs[0]?.fecha]
      : [null, null]
    return { total, desde: rango[0], hasta: rango[1] }
  }, [movs])

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead title="El histórico" icon={Database} />
        <div className="grid grid-cols-1 gap-2 px-3 pb-3">
          <Stat label="Movimientos" value={kpis.total} sub={kpis.desde ? `desde ${fmtDate(kpis.desde, { month: 'short', year: 'numeric' })}` : ''} />
          <Stat label="Categorías" value={categorias.length} sub={`${categorias.filter((c) => c.oculta).length} ocultas`} />
        </div>
      </Card>

      <Card>
        <CardHead
          title="Categorías"
          sub="FIRE, Ajuste y Transferencia son del sistema"
          right={
            <>
              <IconButton
                icon={verOcultas ? X : Search}
                label={verOcultas ? 'Ocultar las ocultas' : 'Ver ocultas'}
                active={verOcultas}
                onClick={() => setVerOcultas((v) => !v)}
              />
              <IconButton icon={Plus} label="Nueva categoría" onClick={() => setEdit({})} />
            </>
          }
        />
        <div className="scroll max-h-[54vh] space-y-1 px-2.5 pb-3">
          {lista.map((c) => {
            const nombre = nameOf(c)
            const reservada = isReservada(c)
            const n = uso.get(nombre.toLowerCase()) || 0
            return (
              <div
                key={c.id}
                className="group flex items-center gap-2 rounded-[9px] px-2 py-1.5 transition-colors duration-150 hover:bg-elev"
                style={{ opacity: c.oculta ? 0.5 : 1 }}
              >
                <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: c.color || colorFor(nombre, categorias) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate1 text-[12.5px]">{nombre}</span>
                  <span className="block text-[10px] text-txt-mute">
                    {n} mov. {c.tipo ? `· ${c.tipo}` : ''} {c.objetivo_id ? '· objetivo' : ''} {c.oculta ? '· oculta' : ''}
                  </span>
                </span>
                {reservada ? (
                  <Chip className="shrink-0 text-[9px]" color={c.objetivo_id ? 'var(--info)' : undefined}>
                    {c.objetivo_id ? 'objetivo' : 'sistema'}
                  </Chip>
                ) : (
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton icon={Pencil} size={11} label="Editar" className="h-6 w-6" onClick={() => setEdit(c)} />
                    <IconButton icon={Trash2} size={11} label="Eliminar" className="h-6 w-6" onClick={() => setConfirm(c)} />
                  </div>
                )}
              </div>
            )
          })}
          {!lista.length && <p className="py-4 text-center text-[11.5px] text-txt-mute">Sin categorías.</p>}
        </div>
      </Card>

      <CategoriaFinModal
        open={!!edit}
        cat={edit?.id ? edit : null}
        onClose={() => setEdit(null)}
        onSave={async (body) => (edit?.id ? editarCategoria(edit.id, body) : crearCategoria(body))}
      />

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Eliminar “${nameOf(confirm)}”`}
        body="Los movimientos que la usaban quedan sin categoría."
        onConfirm={() => borrarCategoria(confirm.id)}
      />
    </div>
  )
}

function CategoriaFinModal({ open, cat, onClose, onSave }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('both')
  const [color, setColor] = useState('#8b5cf6')
  const [oculta, setOculta] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(cat ? nameOf(cat) : '')
    setTipo(cat?.tipo || 'both')
    setColor(cat?.color || '#8b5cf6')
    setOculta(!!cat?.oculta)
    setBusy(false)
  }, [open, cat])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cat ? `Categoría: ${nameOf(cat)}` : 'Nueva categoría'}
      icon={Layers}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!nombre.trim()) return
              setBusy(true)
              const ok = await onSave({ nombre: nombre.trim(), name: nombre.trim(), tipo, color, oculta })
              setBusy(false)
              if (ok) onClose()
            }}
          >
            {cat ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Field>
        <Field label="Aplica a">
          <div className="tabs">
            {[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['both', 'Ambos']].map(([id, label]) => (
              <button key={id} type="button" className="tab flex-1" data-on={tipo === id} onClick={() => setTipo(id)}>
                {tipo === id && <span className="tab-pill" />}
                <span className="relative z-10">{label}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Checkbox checked={oculta} onChange={setOculta} label={<span className="text-[12.5px]">Oculta (no aparece en los selectores ni en el bot)</span>} />
      </div>
    </Modal>
  )
}
