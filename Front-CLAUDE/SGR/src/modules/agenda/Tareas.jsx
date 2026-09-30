import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { Inbox, List, LayoutGrid, Plus, Pin, PinOff, Trash2, Pencil, ListChecks, AlertTriangle, CheckCircle2, Layers, Repeat, Clock } from 'lucide-react'
import { useAgenda } from '../../store/agenda'
import { Panel, Seg, Check, Empty, ConfirmButton, Swatches, Modal, Field } from '../../components/ui'
import { toISODate, addDays, fmtDate } from '../../lib/dates'

const useTareasUI = create((set) => ({ lista: 'todas', filtro: 'pendientes', vista: 'lista', set: (p) => set(p) }))

function filtrar(tareas, lista, filtro) {
  return tareas
    .filter((t) => {
      if (filtro === 'pendientes' && t.completada) return false
      if (filtro === 'completadas' && !t.completada) return false
      if (lista === 'todas') return true
      if (lista === 'inbox') return !t.fecha_opcional
      if (lista === 'sinlista') return !t.lista_id
      return t.lista_id === lista
    })
    .sort((a, b) => Number(a.completada) - Number(b.completada) || (a.fecha_opcional || '9999').localeCompare(b.fecha_opcional || '9999'))
}

export default function TareasView() {
  const { tareas, listas, crearTarea, toggleTarea, openTarea, editarLista } = useAgenda()
  const ui = useTareasUI()
  const setUI = ui.set
  const [txt, setTxt] = useState('')
  const list = useMemo(() => filtrar(tareas, ui.lista, ui.filtro), [tareas, ui.lista, ui.filtro])
  const counts = useMemo(() => {
    const c = { todas: 0, inbox: 0, sinlista: 0 }
    for (const t of tareas) {
      if (t.completada) continue
      c.todas++
      if (!t.fecha_opcional) c.inbox++
      if (!t.lista_id) c.sinlista++
      c[t.lista_id] = (c[t.lista_id] || 0) + 1
    }
    return c
  }, [tareas])

  const add = (e) => {
    e.preventDefault()
    if (!txt.trim()) return
    const lista_id = typeof ui.lista === 'number' ? ui.lista : null
    crearTarea({ titulo: txt.trim(), lista_id, fecha_opcional: ui.lista === 'inbox' ? null : toISODate() })
    setTxt('')
  }

  const selectors = [
    { id: 'todas', label: 'Todas', icon: Layers, color: 'var(--a1)' },
    { id: 'inbox', label: 'Sin fecha', icon: Inbox, color: 'var(--a3)' },
    ...listas.map((l) => ({ id: l.id, label: l.nombre, color: l.color, pinned: l.pinned })),
  ]

  return (
    <div className="col" style={{ flex: 1, minHeight: 0, gap: 12 }}>
      <div className="row wrap">
        <Seg id="t-vista" value={ui.vista} onChange={(v) => setUI({ vista: v })} options={[{ id: 'lista', label: '☰ Lista' }, { id: 'canvas', label: '▦ Canvas' }]} />
        <Seg id="t-filtro" value={ui.filtro} onChange={(v) => setUI({ filtro: v })} options={[{ id: 'pendientes', label: 'Pendientes' }, { id: 'completadas', label: 'Hechas' }, { id: 'todas', label: 'Todas' }]} />
      </div>
      {ui.vista === 'lista' ? (
        <div className="glass tareas-split" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(170px, 220px) 1fr', borderRadius: 22, overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid var(--line)', padding: 10, overflowY: 'auto' }} className="list">
            {selectors.map((s) => (
              <div key={s.id} className={`li ${ui.lista === s.id ? 'on' : ''}`} onClick={() => setUI({ lista: s.id })}>
                {s.icon ? <s.icon size={14} style={{ color: s.color }} /> : <span className="dot" style={{ background: s.color, color: s.color }} />}
                <span className="grow ellipsis small">{s.label}</span>
                {s.pinned && <Pin size={10} className="dim" />}
                <span className="tiny mono dim">{counts[s.id] || 0}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <form onSubmit={add} style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
              <input className="input" placeholder="+ Agregar tarea (Enter)" value={txt} onChange={(e) => setTxt(e.target.value)} />
            </form>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {list.length === 0 ? <Empty icon={ListChecks} title="Sin tareas acá" /> : (
                <div className="list">
                  <AnimatePresence initial={false}>
                    {list.map((t) => <TareaRow key={t.id} t={t} onToggle={() => toggleTarea(t)} onOpen={() => openTarea({ tarea: t })} />)}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, alignContent: 'start', paddingBottom: 20 }}>
          {[...listas].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).map((l, i) => (
            <CanvasCard key={l.id} i={i} title={l.nombre} color={l.color} pinned={l.pinned} tareas={filtrar(tareas, l.id, ui.filtro)} onPin={() => editarLista(l.id, { pinned: !l.pinned })} onAdd={(titulo) => crearTarea({ titulo, lista_id: l.id, fecha_opcional: toISODate() })} />
          ))}
          <CanvasCard i={listas.length} title="Sin fecha" color="#00f0ff" tareas={filtrar(tareas, 'inbox', ui.filtro)} readOnly />
          {counts.sinlista > 0 && <CanvasCard i={listas.length + 1} title="Sin lista" color="#8b93b8" tareas={filtrar(tareas, 'sinlista', ui.filtro)} onAdd={(titulo) => crearTarea({ titulo, fecha_opcional: toISODate() })} />}
        </div>
      )}
    </div>
  )
}

function TareaRow({ t, onToggle, onOpen }) {
  const hoy = toISODate()
  const vencida = !t.completada && t.fecha_opcional && t.fecha_opcional < hoy
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={`li ${t._pending ? 'pending' : ''}`} onClick={onOpen}>
      <Check on={t.completada} onClick={onToggle} color={t.lista_color} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className={`small ellipsis ${t.completada ? 'strike' : ''}`} style={{ fontWeight: 600 }}>{t.titulo}</div>
        {t.descripcion && <div className="tiny dim ellipsis">{t.descripcion}</div>}
      </div>
      {(t.serie_id || t.se_repite) && <Repeat size={12} className="dim" />}
      {t.hora_bloque && <span className="tiny mono row gap4" style={{ color: 'var(--a3)' }}><Clock size={11} />{t.hora_bloque}</span>}
      {t.lista_nombre && <span className="chip" style={{ fontSize: 10, borderColor: `${t.lista_color}66` }}><span className="dot" style={{ background: t.lista_color, color: t.lista_color, width: 6, height: 6 }} />{t.lista_nombre}</span>}
      <span className="tiny mono" style={{ width: 54, textAlign: 'right', color: vencida ? 'var(--red)' : t.fecha_opcional === hoy ? 'var(--amber)' : 'var(--dim)' }}>
        {t.fecha_opcional ? (t.fecha_opcional === hoy ? 'hoy' : fmtDate(t.fecha_opcional)) : '—'}
      </span>
    </motion.div>
  )
}

function CanvasCard({ title, color, tareas, onAdd, onPin, pinned, readOnly, i }) {
  const { toggleTarea, openTarea } = useAgenda()
  const [txt, setTxt] = useState('')
  return (
    <motion.div className="glass neon-edge" style={{ borderRadius: 18, padding: 14, borderTop: `3px solid ${color}`, boxShadow: `0 20px 40px -30px ${color}` }} initial={{ opacity: 0, y: 16, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.05 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="dot" style={{ background: color, color }} />
        <b className="grow ellipsis">{title}</b>
        <span className="tiny mono dim">{tareas.length}</span>
        {onPin && <button className="iconbtn sm" onClick={onPin} title={pinned ? 'Desfijar' : 'Fijar arriba'}>{pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>}
      </div>
      <div className="list" style={{ maxHeight: 300, overflowY: 'auto' }}>
        {tareas.slice(0, 40).map((t) => (
          <div key={t.id} className="li" style={{ padding: '6px 6px' }} onClick={() => openTarea({ tarea: t })}>
            <Check on={t.completada} onClick={() => toggleTarea(t)} color={color} size={17} />
            <span className={`grow ellipsis small ${t.completada ? 'strike' : ''}`}>{t.titulo}</span>
            {t.fecha_opcional && <span className="tiny dim">{fmtDate(t.fecha_opcional)}</span>}
          </div>
        ))}
        {tareas.length === 0 && <div className="small dim" style={{ padding: 6 }}>Vacía</div>}
      </div>
      {!readOnly && onAdd && (
        <form onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { onAdd(txt.trim()); setTxt('') } }} style={{ marginTop: 8 }}>
          <input className="input sm" placeholder="+ tarea" value={txt} onChange={(e) => setTxt(e.target.value)} />
        </form>
      )}
    </motion.div>
  )
}

export function TareasRight() {
  const { tareas, listas, crearLista, editarLista, borrarLista } = useAgenda()
  const [edit, setEdit] = useState(null)
  const hoy = toISODate()
  const semana = toISODate(addDays(new Date(), -7))
  const pend = tareas.filter((t) => !t.completada).length
  const venc = tareas.filter((t) => !t.completada && t.fecha_opcional && t.fecha_opcional < hoy).length
  const hechas = tareas.filter((t) => t.completada && (t.fecha_opcional || '') >= semana).length
  return (
    <>
      <Panel title="Estado" icon={ListChecks}>
        <div className="grid3" style={{ gap: 8, textAlign: 'center' }}>
          <div><div className="display" style={{ fontSize: 22, fontWeight: 800 }}>{pend}</div><div className="tiny dim">pendientes</div></div>
          <div><div className="display" style={{ fontSize: 22, fontWeight: 800, color: venc ? 'var(--red)' : undefined }}>{venc}</div><div className="tiny dim row gap4" style={{ justifyContent: 'center' }}><AlertTriangle size={10} />vencidas</div></div>
          <div><div className="display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--mint)' }}>{hechas}</div><div className="tiny dim row gap4" style={{ justifyContent: 'center' }}><CheckCircle2 size={10} />semana</div></div>
        </div>
      </Panel>
      <Panel title="Listas" icon={List} actions={<button className="iconbtn sm" onClick={() => setEdit({})}><Plus size={15} /></button>}>
        <div className="list">
          {listas.map((l) => {
            const n = tareas.filter((t) => t.lista_id === l.id).length
            return (
              <div key={l.id} className="li" onClick={() => setEdit({ lista: l, n })}>
                <span className="dot" style={{ background: l.color, color: l.color }} />
                <span className="grow ellipsis small">{l.nombre}</span>
                {l.pinned && <Pin size={11} className="dim" />}
                <span className="tiny mono dim">{n}</span>
                <span className="li-actions"><Pencil size={12} /></span>
              </div>
            )
          })}
          {listas.length === 0 && <div className="small dim">Sin listas todavía.</div>}
        </div>
      </Panel>
      <ListaModal data={edit} onClose={() => setEdit(null)} crear={crearLista} editar={editarLista} borrar={borrarLista} />
    </>
  )
}

function ListaModal({ data, onClose, crear, editar, borrar }) {
  const l = data?.lista
  const [f, setF] = useState(null)
  const cur = f && f._for === (l?.id ?? 'new') ? f : { _for: l?.id ?? 'new', nombre: l?.nombre || '', color: l?.color || '#4d7cff', pinned: !!l?.pinned }
  const save = async () => {
    if (!cur.nombre.trim()) return
    if (l) await editar(l.id, { nombre: cur.nombre.trim(), color: cur.color, pinned: cur.pinned })
    else await crear({ nombre: cur.nombre.trim(), color: cur.color })
    setF(null)
    onClose()
  }
  return (
    <Modal open={!!data} onClose={() => { setF(null); onClose() }} title={l ? 'Editar lista' : 'Nueva lista'} icon={List} onSubmit={save}
      footer={<>
        {l && <ConfirmButton confirmText={data.n ? `Borra ${data.n} tareas · confirmar` : '¿Seguro?'} onConfirm={async () => { await borrar(l.id); onClose() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <Field label="Nombre"><input autoFocus className="input" value={cur.nombre} onChange={(e) => setF({ ...cur, nombre: e.target.value })} /></Field>
      <Field label="Color"><Swatches value={cur.color} onChange={(color) => setF({ ...cur, color })} /></Field>
      {l && data.n > 0 && <div className="small" style={{ color: 'var(--amber)' }}>Eliminar la lista borra también sus {data.n} tareas.</div>}
    </Modal>
  )
}
