import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Database, Filter, Download, Upload, Copy, Trash2, Tag, X, Palette, Lock, Plus, BarChart3, Eye, EyeOff } from 'lucide-react'
import { useFin } from '../../store/fin'
import { toast } from '../../store/ui'
import { Panel, Modal, Field, Seg, ConfirmButton, Empty, Swatches, useDebounced } from '../../components/ui'
import { colorFor, fmtARS, fmtMoney, isTransferencia, csvEscape, parseCSV, dolarDe, toARS, RESERVADAS } from '../../lib/fin'
import { fmtDate } from '../../lib/dates'

export function DatosCenter() {
  const { movs, cuentas, categorias, editarMov, borrarMov, borrarMovsBulk, editarMovsBulk, importarCSV, duplicados, openMov } = useFin()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 200)
  const [f, setF] = useState({ cat: '', cuenta: '', tipo: 'todos', desde: '', hasta: '' })
  const [sel, setSel] = useState(new Set())
  const [limit, setLimit] = useState(200)
  const [bulkCat, setBulkCat] = useState('')
  const [imp, setImp] = useState(null)
  const [dups, setDups] = useState(null)
  const fileRef = useRef(null)

  const list = useMemo(() => {
    const s = dq.trim().toLowerCase()
    return movs.filter((m) => {
      if (f.tipo === 'transfer' ? !isTransferencia(m) : f.tipo !== 'todos' && (m.tipo !== f.tipo || isTransferencia(m))) return false
      if (f.cat && (m.categoria_nombre || '') !== f.cat) return false
      if (f.cuenta && String(m.cuenta_id) !== f.cuenta) return false
      const d = (m.fecha || '').slice(0, 10)
      if (f.desde && d < f.desde) return false
      if (f.hasta && d > f.hasta) return false
      if (s && ![m.descripcion, m.categoria_nombre, m.cuenta_nombre, m.nota].some((x) => (x || '').toLowerCase().includes(s))) return false
      return true
    })
  }, [movs, f, dq])

  const allSel = list.length > 0 && list.slice(0, limit).every((m) => sel.has(m.id))
  const toggleAll = () => setSel(allSel ? new Set() : new Set(list.slice(0, limit).map((m) => m.id)))
  const toggle = (id) => {
    const n = new Set(sel)
    n.has(id) ? n.delete(id) : n.add(id)
    setSel(n)
  }
  const catNames = categorias.filter((c) => !c.oculta).map((c) => c.name).sort()

  const exportCSV = () => {
    const head = ['fecha', 'tipo', 'monto', 'moneda', 'descripcion', 'categoria', 'cuenta', 'cuotas', 'nota']
    const rows = list.map((m) => [m.fecha, m.tipo, m.monto, m.moneda, m.descripcion, m.categoria_nombre, m.cuenta_nombre, m.cuotas, m.nota].map(csvEscape).join(','))
    const blob = new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    toast(`${list.length} movimientos exportados`)
  }

  const onFile = async (file) => {
    if (!file) return
    const text = (await file.text()).replace(/^﻿/, '')
    const rows = parseCSV(text)
    if (rows.length < 2) return toast('El CSV está vacío', 'warn')
    const head = rows[0].map((h) => h.trim().toLowerCase())
    const idx = (k) => head.indexOf(k)
    const filas = rows.slice(1).map((r) => ({
      fecha: r[idx('fecha')]?.trim(),
      tipo: r[idx('tipo')]?.trim(),
      monto: Number(String(r[idx('monto')] || '').replace(',', '.')),
      moneda: (r[idx('moneda')] || 'ARS').trim() || 'ARS',
      descripcion: r[idx('descripcion')] ?? '',
      categoria_nombre: (r[idx('categoria')] || '').trim() || null,
      cuenta_nombre: (r[idx('cuenta')] || '').trim() || null,
      cuotas: r[idx('cuotas')] ? Number(r[idx('cuotas')]) : null,
      nota: (r[idx('nota')] || '').trim() || null,
    }))
    const invalid = filas.filter((x) => !x.fecha || !x.tipo || !x.monto).length
    setImp({ filas, invalid, name: file.name })
  }

  const buscarDups = async () => {
    try { setDups(await duplicados()) } catch (e) { toast(e.message, 'error') }
  }

  return (
    <>
      <Panel title="Filtros" icon={Filter} actions={
        <div className="row gap4">
          <button className="btn xs" onClick={exportCSV}><Download size={12} /> CSV</button>
          <button className="btn xs" onClick={() => fileRef.current?.click()}><Upload size={12} /> Importar</button>
          <button className="btn xs" onClick={buscarDups}><Copy size={12} /> Duplicados</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <input className="input sm" placeholder="Buscar texto…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select sm" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
            <option value="">Todas las categorías</option>
            {catNames.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="select sm" value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}>
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" className="input sm" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} title="Desde" />
          <input type="date" className="input sm" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} title="Hasta" />
        </div>
        <div className="row wrap" style={{ marginTop: 10 }}>
          <Seg id="datos-tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={[{ id: 'todos', label: 'Todos' }, { id: 'income', label: 'Ingresos' }, { id: 'expense', label: 'Gastos' }, { id: 'transfer', label: 'Transferencias' }]} />
          <span className="grow" />
          <span className="small muted mono">{list.length} movimientos</span>
          {(q || f.cat || f.cuenta || f.desde || f.hasta || f.tipo !== 'todos') && <button className="btn xs ghost" onClick={() => { setQ(''); setF({ cat: '', cuenta: '', tipo: 'todos', desde: '', hasta: '' }) }}><X size={12} /> Limpiar</button>}
        </div>
      </Panel>

      <AnimatePresence>
        {sel.size > 0 && (
          <motion.div className="glass card row wrap" style={{ position: 'sticky', top: 0, zIndex: 5, borderColor: 'rgba(var(--a1-rgb),.6)' }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <b>{sel.size} seleccionados</b>
            <span className="grow" />
            <select className="select sm" style={{ width: 180 }} value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
              <option value="">Cambiar categoría a…</option>
              {catNames.map((c) => <option key={c}>{c}</option>)}
            </select>
            <button className="btn sm" disabled={!bulkCat} onClick={async () => { await editarMovsBulk([...sel].map((id) => ({ id, categoria_nombre: bulkCat }))); setSel(new Set()); setBulkCat('') }}><Tag size={13} /> Aplicar</button>
            <ConfirmButton onConfirm={async () => { await borrarMovsBulk([...sel]); setSel(new Set()) }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>
            <button className="iconbtn sm" onClick={() => setSel(new Set())}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel title="Histórico" icon={Database}>
        {list.length === 0 ? (
          <Empty icon={Database} title="Sin movimientos para estos filtros" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th style={{ width: 30 }}><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" className="num">Monto</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((m) => (
                  <Row key={m.id} m={m} sel={sel.has(m.id)} onSel={() => toggle(m.id)} cuentas={cuentas} catNames={catNames} categorias={categorias} editar={editarMov} borrar={borrarMov} open={() => openMov({ mov: m })} />
                ))}
              </tbody>
            </table>
            {list.length > limit && <div className="center" style={{ padding: 12 }}><button className="btn sm" onClick={() => setLimit(limit + 300)}>Mostrar más ({list.length - limit} restantes)</button></div>}
          </div>
        )}
      </Panel>

      <Modal open={!!imp} onClose={() => setImp(null)} title={`Importar ${imp?.name || ''}`} icon={Upload}
        footer={<><span className="grow small dim">Se importa todo o nada.</span><button className="btn ghost" onClick={() => setImp(null)}>Cancelar</button><button className="btn primary" disabled={imp?.invalid > 0} onClick={async () => { if (await importarCSV(imp.filas)) setImp(null) }}>Importar {imp?.filas.length}</button></>}>
        {imp && (
          <>
            {imp.invalid > 0 && <div className="small neg">{imp.invalid} filas sin fecha, tipo o monto. Columnas esperadas: fecha, tipo, monto, moneda, descripcion, categoria, cuenta, cuotas, nota.</div>}
            <div style={{ maxHeight: 340, overflow: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th className="num">Monto</th></tr></thead>
                <tbody>{imp.filas.slice(0, 100).map((r, i) => <tr key={i}><td className="small">{r.fecha}</td><td className="small">{r.tipo}</td><td className="small">{r.descripcion}</td><td className="small">{r.categoria_nombre}</td><td className="num">{fmtMoney(r.monto, r.moneda)}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!dups} onClose={() => setDups(null)} title="Posibles duplicados" icon={Copy}>
        {dups && (dups.length === 0 ? <Empty title="No se encontraron duplicados ✦" /> : (
          <div className="list">
            {dups.map((g, i) => {
              const items = Array.isArray(g) ? g : g.movimientos || g.items || [g]
              return (
                <div key={i} className="glass" style={{ padding: 10, borderRadius: 12 }}>
                  {items.map((m) => (
                    <div key={m.id} className="row small">
                      <span className="grow ellipsis">{fmtDate(m.fecha)} · {m.descripcion} · <span className="mono">{fmtMoney(m.monto, m.moneda)}</span></span>
                      <ConfirmButton className="btn xs danger" confirmText="✓" onConfirm={() => { borrarMov(m.id); setDups((d) => d.map((x) => (x === g ? (Array.isArray(x) ? x.filter((y) => y.id !== m.id) : x) : x))) }} icon={<Trash2 size={11} />} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </Modal>
    </>
  )
}

function Row({ m, sel, onSel, cuentas, catNames, categorias, editar, borrar, open }) {
  const col = colorFor(m.categoria_nombre || '', categorias)
  const upd = (patch) => editar(m.id, patch)
  const transfer = isTransferencia(m)
  return (
    <tr style={sel ? { background: 'rgba(var(--a1-rgb), .12)' } : undefined} className={m._pending ? 'pending' : ''}>
      <td><input type="checkbox" checked={sel} onChange={onSel} /></td>
      <td style={{ width: 130 }}>
        <input type="date" className="cell mono small" defaultValue={(m.fecha || '').slice(0, 10)} key={m.fecha} onBlur={(e) => e.target.value && e.target.value !== m.fecha.slice(0, 10) && upd({ fecha: e.target.value })} />
      </td>
      <td style={{ minWidth: 180 }}>
        <input className="cell" defaultValue={m.descripcion} key={m.descripcion} onBlur={(e) => e.target.value !== m.descripcion && upd({ descripcion: e.target.value })} />
      </td>
      <td style={{ minWidth: 140 }}>
        {transfer ? <span className="chip" style={{ fontSize: 10 }}>⇄ transferencia</span> : (
          <div className="row gap4">
            <span className="dot" style={{ background: col, color: col, width: 7, height: 7 }} />
            <select className="cell small" value={m.categoria_nombre || ''} onChange={(e) => upd({ categoria_nombre: e.target.value || null })}>
              <option value="">—</option>
              {!catNames.includes(m.categoria_nombre) && m.categoria_nombre && <option>{m.categoria_nombre}</option>}
              {catNames.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
      </td>
      <td style={{ minWidth: 120 }}>
        <select className="cell small" value={m.cuenta_id || ''} onChange={(e) => upd({ cuenta_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">—</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td style={{ minWidth: 100 }}>
        {transfer ? <span className="small dim">{m.monto >= 0 ? 'salida' : 'entrada'}</span> : (
          <select className="cell small" value={m.tipo} onChange={(e) => upd({ tipo: e.target.value })} style={{ color: m.tipo === 'income' ? 'var(--mint)' : 'var(--orange)' }}>
            <option value="income">ingreso</option>
            <option value="expense">gasto</option>
          </select>
        )}
      </td>
      <td className="num" style={{ minWidth: 160 }}>
        <div className="row gap4" style={{ justifyContent: 'flex-end' }}>
          <input className="cell mono" style={{ textAlign: 'right', width: 110 }} defaultValue={m.monto} key={m.monto} onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v && v !== m.monto) upd({ monto: v }) }} />
          <span className="tiny dim">{m.moneda}</span>
        </div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="iconbtn sm" onClick={open} title="Abrir"><Eye size={12} /></button>
        <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={() => borrar(m.id)} icon={<Trash2 size={12} />} />
      </td>
    </tr>
  )
}

export function DatosRight() {
  const { movs, categorias, config, crearCategoria, editarCategoria, borrarCategoria } = useFin()
  const dolar = dolarDe(config)
  const [nueva, setNueva] = useState({ nombre: '', tipo: 'expense' })
  const [edit, setEdit] = useState(null)
  const [ocultas, setOcultas] = useState(false)
  const stats = useMemo(() => {
    let ing = 0, gas = 0
    const meses = new Set()
    for (const m of movs) {
      if (isTransferencia(m) || (m.categoria_nombre || '').toLowerCase() === 'ajuste') continue
      meses.add((m.fecha || '').slice(0, 7))
      if (m.tipo === 'income') ing += toARS(m, dolar)
      else if (m.tipo === 'expense') gas += toARS(m, dolar)
    }
    const first = movs.length ? movs[movs.length - 1].fecha : null
    return { ing, gas, meses: meses.size, first }
  }, [movs, dolar])
  const usage = useMemo(() => {
    const u = new Map()
    movs.forEach((m) => m.categoria_nombre && u.set(m.categoria_nombre, (u.get(m.categoria_nombre) || 0) + 1))
    return u
  }, [movs])
  const reservada = (c) => RESERVADAS.includes(c.name.trim().toLowerCase()) || !!c.objetivo_id
  const list = categorias.filter((c) => ocultas || !c.oculta).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <Panel title="Histórico" icon={BarChart3}>
        <div className="grid2">
          <div><div className="tiny upper dim">Movimientos</div><div className="display" style={{ fontWeight: 700, fontSize: 20 }}>{movs.length}</div></div>
          <div><div className="tiny upper dim">Meses</div><div className="display" style={{ fontWeight: 700, fontSize: 20 }}>{stats.meses}</div></div>
          <div><div className="tiny upper dim">Ingresos</div><div className="mono small pos">{fmtARS(stats.ing, { compact: true })}</div></div>
          <div><div className="tiny upper dim">Gastos</div><div className="mono small neg">{fmtARS(stats.gas, { compact: true })}</div></div>
        </div>
        {stats.first && <div className="tiny dim" style={{ marginTop: 8 }}>desde {fmtDate(stats.first, { month: 'long', year: 'numeric' })}</div>}
      </Panel>
      <Panel title="Categorías" icon={Palette} actions={<button className="iconbtn sm" title={ocultas ? 'Ocultar ocultas' : 'Ver ocultas'} onClick={() => setOcultas(!ocultas)}>{ocultas ? <EyeOff size={14} /> : <Eye size={14} />}</button>}>
        <form className="row gap4" onSubmit={async (e) => { e.preventDefault(); if (!nueva.nombre.trim()) return; if (await crearCategoria({ nombre: nueva.nombre.trim(), tipo: nueva.tipo, color: colorFor(nueva.nombre.trim()) })) setNueva({ ...nueva, nombre: '' }) }}>
          <input className="input sm" placeholder="Nueva categoría" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          <select className="select sm" style={{ width: 92 }} value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })}>
            <option value="expense">gasto</option><option value="income">ingreso</option><option value="both">ambos</option>
          </select>
          <button className="iconbtn" type="submit"><Plus size={15} /></button>
        </form>
        <div className="list" style={{ marginTop: 8 }}>
          {list.map((c) => {
            const col = colorFor(c.name, categorias)
            return (
              <div key={c.id} className={`li ${c.oculta ? 'pending' : ''}`} onClick={() => setEdit(c)}>
                <span className="dot" style={{ background: col, color: col }} />
                <span className="grow ellipsis small">{c.name}</span>
                {reservada(c) && <Lock size={11} className="dim" />}
                <span className="tiny dim">{c.tipo === 'both' ? 'ambos' : c.tipo === 'income' ? 'ing' : 'gasto'}</span>
                <span className="mono tiny dim" style={{ width: 26, textAlign: 'right' }}>{usage.get(c.name) || 0}</span>
              </div>
            )
          })}
        </div>
      </Panel>
      <CategoriaFinModal cat={edit} reservada={edit && reservada(edit)} usos={edit ? usage.get(edit.name) || 0 : 0} onClose={() => setEdit(null)} editar={editarCategoria} borrar={borrarCategoria} />
    </>
  )
}

function CategoriaFinModal({ cat, reservada, usos, onClose, editar, borrar }) {
  const [f, setF] = useState(null)
  const cur = f && cat && f.id === cat.id ? f : cat ? { id: cat.id, nombre: cat.name, tipo: cat.tipo, color: cat.color || colorFor(cat.name) } : null
  const save = async () => {
    const body = { color: cur.color, tipo: cur.tipo }
    if (!reservada && cur.nombre.trim() !== cat.name) body.nombre = cur.nombre.trim()
    if (await editar(cat.id, body)) { setF(null); onClose() }
  }
  return (
    <Modal open={!!cat} onClose={() => { setF(null); onClose() }} title="Categoría" icon={Palette} onSubmit={save}
      footer={<>
        {!reservada && <ConfirmButton onConfirm={async () => { await borrar(cat.id); onClose() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      {cur && (
        <>
          <Field label="Nombre"><input className="input" disabled={reservada} value={cur.nombre} onChange={(e) => setF({ ...cur, nombre: e.target.value })} /></Field>
          {reservada && <div className="small dim"><Lock size={11} /> Categoría de sistema u objetivo: el nombre está protegido.</div>}
          <Field label="Tipo"><Seg id="catfin-tipo" value={cur.tipo} onChange={(v) => setF({ ...cur, tipo: v })} options={[{ id: 'expense', label: 'Gasto' }, { id: 'income', label: 'Ingreso' }, { id: 'both', label: 'Ambos' }]} /></Field>
          <Field label="Color"><Swatches value={cur.color} onChange={(color) => setF({ ...cur, color })} /></Field>
          <div className="small dim">{usos} movimientos usan esta categoría.</div>
        </>
      )}
    </Modal>
  )
}
