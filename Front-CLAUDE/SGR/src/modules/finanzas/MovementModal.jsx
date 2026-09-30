import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Receipt, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Trash2, Plus } from 'lucide-react'
import { Modal, Field, Seg, ConfirmButton } from '../../components/ui'
import { useFin } from '../../store/fin'
import { toast } from '../../store/ui'
import { colorFor, fmtMoney, isTransferencia, parseMonto } from '../../lib/fin'
import { toISODate } from '../../lib/dates'

const LS_CUENTA = 'sgr-nexus-lastcuenta'

export default function MovementModal() {
  const modal = useFin((s) => s.movModal)
  const close = useFin((s) => s.closeMov)
  const { cuentas, categorias, movs, crearMov, editarMov, borrarMov, transferir } = useFin()
  const editing = modal?.mov
  const [f, setF] = useState(null)
  const [newCat, setNewCat] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!modal) return
    let lastCuenta = null
    try { lastCuenta = Number(localStorage.getItem(LS_CUENTA)) || null } catch { /* noop */ }
    if (editing) {
      setF({
        tipo: isTransferencia(editing) ? 'transfer' : editing.tipo,
        monto: String(Math.abs(editing.monto)),
        moneda: editing.moneda || 'ARS',
        fecha: (editing.fecha || '').slice(0, 10),
        descripcion: editing.descripcion || '',
        cuenta_id: editing.cuenta_id || '',
        destino: '',
        categoria_nombre: editing.categoria_nombre || '',
        cuotas: editing.cuotas || '',
        nota: editing.nota || '',
      })
    } else {
      setF({
        tipo: 'expense', monto: '', moneda: 'ARS', fecha: toISODate(), descripcion: '', destino: '',
        cuenta_id: lastCuenta && cuentas.some((c) => c.id === lastCuenta) ? lastCuenta : cuentas[0]?.id || '',
        categoria_nombre: '', cuotas: '', nota: '', ...(modal.preset || {}),
      })
    }
    setNewCat('')
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps

  const catsTipo = useMemo(() => {
    if (!f) return []
    return categorias
      .filter((c) => !c.oculta && c.name.toLowerCase() !== 'transferencia')
      .filter((c) => c.tipo === 'both' || c.tipo === f.tipo)
      .sort((a, b) => usage(movs, b.name) - usage(movs, a.name))
  }, [categorias, f?.tipo, movs]) // eslint-disable-line react-hooks/exhaustive-deps

  const plantillas = useMemo(() => {
    if (!f || editing) return []
    const seen = new Set()
    const out = []
    for (const m of movs) {
      if (m.tipo !== f.tipo || !m.descripcion || isTransferencia(m)) continue
      const k = m.descripcion.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(m)
      if (out.length >= 6) break
    }
    return out
  }, [movs, f?.tipo, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!f) return <Modal open={false} />

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const accent = f.tipo === 'income' ? '#2effa8' : f.tipo === 'transfer' ? '#00c2ff' : '#ff6b2c'

  const save = async () => {
    if (busy) return
    const monto = parseMonto(f.monto)
    if (!monto || monto <= 0) return toast('Ingresá un monto válido', 'warn')
    if (!f.fecha) return toast('Falta la fecha', 'warn')
    setBusy(true)
    try { if (f.cuenta_id) localStorage.setItem(LS_CUENTA, String(f.cuenta_id)) } catch { /* noop */ }
    let ok
    if (f.tipo === 'transfer' && !editing) {
      if (!f.cuenta_id || !f.destino || Number(f.cuenta_id) === Number(f.destino)) {
        setBusy(false)
        return toast('Elegí cuenta de origen y destino distintas', 'warn')
      }
      ok = await transferir({ origen: Number(f.cuenta_id), destino: Number(f.destino), monto, moneda: f.moneda, fecha: f.fecha, descripcion: f.descripcion })
    } else {
      const body = {
        tipo: f.tipo,
        monto: f.tipo === 'transfer' && editing ? Math.sign(editing.monto || 1) * monto : monto,
        moneda: f.moneda,
        fecha: f.fecha,
        descripcion: f.descripcion.trim(),
        cuenta_id: f.cuenta_id ? Number(f.cuenta_id) : null,
        categoria_nombre: f.tipo === 'transfer' ? null : f.categoria_nombre || null,
        cuotas: f.tipo === 'expense' && Number(f.cuotas) > 1 ? Number(f.cuotas) : null,
        nota: f.nota.trim() || null,
      }
      if (editing) {
        if (editing.fecha && editing.fecha.slice(0, 10) === f.fecha) body.fecha = editing.fecha
        ok = await editarMov(editing.id, body)
      } else ok = await crearMov(body)
    }
    setBusy(false)
    if (ok) {
      toast(editing ? 'Movimiento actualizado' : f.tipo === 'transfer' ? 'Transferencia registrada' : 'Movimiento registrado')
      close()
    }
  }

  return (
    <Modal
      open={!!modal}
      onClose={close}
      title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}
      icon={Receipt}
      onSubmit={save}
      footer={
        <>
          {editing && <ConfirmButton onConfirm={() => { borrarMov(editing.id); close() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
          <span className="grow small dim hide-sm"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> guarda</span>
          <button className="btn ghost" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <Seg
          id="mov-tipo"
          value={f.tipo}
          onChange={(v) => set('tipo', v)}
          options={[
            { id: 'expense', label: <span className="row gap4"><ArrowUpRight size={14} /> Gasto</span> },
            { id: 'income', label: <span className="row gap4"><ArrowDownLeft size={14} /> Ingreso</span> },
            { id: 'transfer', label: <span className="row gap4"><ArrowLeftRight size={14} /> Transferencia</span> },
          ]}
        />
        <Seg id="mov-moneda" value={f.moneda} onChange={(v) => set('moneda', v)} options={['ARS', 'USD']} />
      </div>

      <motion.div className="row" animate={{ borderColor: accent }} style={{ border: '1px solid', borderRadius: 18, padding: '6px 16px', background: 'rgba(0,0,0,.3)', boxShadow: `0 0 34px -14px ${accent}` }}>
        <span className="display" style={{ fontSize: 26, color: accent }}>{f.moneda === 'USD' ? 'US$' : '$'}</span>
        <input
          autoFocus
          inputMode="decimal"
          className="display tnum"
          placeholder="0"
          value={f.monto}
          onChange={(e) => set('monto', e.target.value.replace(/[^\d.,]/g, ''))}
          style={{ flex: 1, fontSize: 34, fontWeight: 700, background: 'transparent', border: 0, outline: 'none', padding: '6px 0', minWidth: 0 }}
        />
      </motion.div>

      <Field label="Descripción">
        <input className="input" value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder={f.tipo === 'income' ? 'Sueldo, venta…' : f.tipo === 'transfer' ? 'Retiro, pase a USD…' : 'Supermercado, alquiler…'} />
      </Field>
      {plantillas.length > 0 && (
        <div className="row wrap gap6">
          {plantillas.map((p) => (
            <button key={p.id} className="chip click" onClick={() => setF((x) => ({ ...x, descripcion: p.descripcion, categoria_nombre: p.categoria_nombre || x.categoria_nombre, cuenta_id: p.cuenta_id || x.cuenta_id, monto: x.monto || String(p.monto), moneda: p.moneda }))}>
              ↺ {p.descripcion} <span className="dim mono">{fmtMoney(p.monto, p.moneda, { compact: true })}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid2">
        <Field label="Fecha"><input type="date" className="input" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></Field>
        <Field label={f.tipo === 'transfer' ? 'Desde' : 'Cuenta'}>
          <select className="select" value={f.cuenta_id} onChange={(e) => set('cuenta_id', e.target.value)}>
            <option value="">— Sin cuenta —</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      {f.tipo === 'transfer' && !editing && (
        <Field label="Hacia">
          <select className="select" value={f.destino} onChange={(e) => set('destino', e.target.value)}>
            <option value="">— Elegí cuenta destino —</option>
            {cuentas.filter((c) => String(c.id) !== String(f.cuenta_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      {f.tipo !== 'transfer' && (
        <Field label="Categoría">
          <div className="row wrap gap6">
            {catsTipo.map((c) => {
              const col = colorFor(c.name, categorias)
              const on = f.categoria_nombre.toLowerCase() === c.name.toLowerCase()
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  className="chip click"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => set('categoria_nombre', on ? '' : c.name)}
                  style={on ? { background: `${col}33`, borderColor: col, color: '#fff', boxShadow: `0 0 14px -4px ${col}` } : undefined}
                >
                  <span className="dot" style={{ background: col, color: col, width: 7, height: 7 }} />
                  {c.name}
                  {c.objetivo_id ? <span className="tiny dim">obj</span> : null}
                </motion.button>
              )
            })}
            <span className="row gap4">
              <input className="input sm" style={{ width: 140 }} placeholder="Nueva categoría" value={newCat} onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) { e.preventDefault(); set('categoria_nombre', newCat.trim()); setNewCat('') } }} />
              {newCat.trim() && <button className="iconbtn sm" onClick={() => { set('categoria_nombre', newCat.trim()); setNewCat('') }}><Plus size={14} /></button>}
            </span>
          </div>
          {f.categoria_nombre && !catsTipo.some((c) => c.name.toLowerCase() === f.categoria_nombre.toLowerCase()) && (
            <div className="small" style={{ color: 'var(--a3)' }}>Se creará la categoría “{f.categoria_nombre}”.</div>
          )}
        </Field>
      )}

      <div className="grid2">
        {f.tipo === 'expense' && (
          <Field label="Cuotas">
            <input type="number" min="1" max="60" className="input" value={f.cuotas} onChange={(e) => set('cuotas', e.target.value)} placeholder="1" />
          </Field>
        )}
        <Field label="Nota" style={f.tipo !== 'expense' ? { gridColumn: '1 / -1' } : undefined}>
          <input className="input" value={f.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
      {f.tipo === 'expense' && Number(f.cuotas) > 1 && Number(f.monto) > 0 && (
        <div className="small muted">{f.cuotas} cuotas de <b className="mono">{fmtMoney(parseMonto(f.monto) / Number(f.cuotas), f.moneda)}</b></div>
      )}
    </Modal>
  )
}

function usage(movs, name) {
  let n = 0
  for (let i = 0; i < movs.length && i < 400; i++) if (movs[i].categoria_nombre === name) n++
  return n
}
