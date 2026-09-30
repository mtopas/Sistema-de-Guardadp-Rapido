import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FolderTree, ChevronRight, Plus, Pencil, Trash2, Search, Sparkles, RefreshCw, Network, LayoutGrid, List as ListIcon,
  FileText, Link2, Image, Clock, CalendarDays, ChevronsDownUp, ChevronsUpDown, FolderPlus, X, Layers,
} from 'lucide-react'
import { useBoveda, buildTree, descendantIds, isBasura, hojaTitulo, photoFromApuntes } from '../../store/boveda'
import { useUI, toast } from '../../store/ui'
import { useAgenda, eventosDelDia } from '../../store/agenda'
import { Panel, Seg, Empty, Loader, Modal, Field, Swatches, Highlight, useDebounced, Stagger, Item , useBusy } from '../../components/ui'
import { Donut } from '../../components/charts'
import Graph from './Graph'
import HojaDetail, { TIPO_ICON } from './HojaDetail'
import { relativeTime, toISODate, addDays, fmtTime, hasTime } from '../../lib/dates'
import { assetUrl } from '../../lib/api'

const LS_EXP = 'sgr-nexus-tree'
const LS_VIEW = 'sgr-nexus-bview'

export default function BovedaScreen() {
  const { categorias, hojas, loaded, selectedId, select } = useBoveda()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 200)
  const [semantic, setSemantic] = useState(false)
  const [semHits, setSemHits] = useState(null)
  const [semBusy, setSemBusy] = useState(false)
  const [catFilter, setCatFilter] = useState(null)
  const [tipo, setTipo] = useState('todos')
  const [view, setView] = useState(() => { try { return localStorage.getItem(LS_VIEW) || 'grafo' } catch { return 'grafo' } })
  const [catModal, setCatModal] = useState(null)
  const buscarSemantico = useBoveda((s) => s.buscarSemantico)

  useEffect(() => { try { localStorage.setItem(LS_VIEW, view) } catch { /* noop */ } }, [view])

  useEffect(() => {
    if (!semantic || dq.trim().length < 3) { setSemHits(null); return }
    let alive = true
    setSemBusy(true)
    buscarSemantico(dq.trim())
      .then((r) => alive && setSemHits(r))
      .catch((e) => { if (alive) { setSemHits([]); toast(`Búsqueda semántica no disponible: ${e.message}`, 'warn') } })
      .finally(() => alive && setSemBusy(false))
    return () => { alive = false }
  }, [dq, semantic, buscarSemantico])

  const visibles = useMemo(() => hojas.filter((h) => !isBasura({ nombre: h.categoria_nombre })), [hojas])

  const filtered = useMemo(() => {
    let list = visibles
    if (catFilter) {
      const ids = descendantIds(categorias, catFilter)
      list = list.filter((h) => ids.has(h.categoria_id))
    }
    if (tipo !== 'todos') list = list.filter((h) => h.tipo === tipo)
    if (semantic && semHits) {
      const order = new Map(semHits.map((h, i) => [h.id, i]))
      list = list.filter((h) => order.has(h.id)).sort((a, b) => order.get(a.id) - order.get(b.id))
    } else if (dq.trim()) {
      const s = dq.trim().toLowerCase()
      list = list.filter((h) =>
        [h.contenido, h.apuntes, h.link_preview?.title, h.categoria_nombre].some((x) => (x || '').toLowerCase().includes(s)),
      )
    }
    return list
  }, [visibles, catFilter, tipo, dq, semantic, semHits, categorias])

  const matchIds = useMemo(() => {
    if (!dq.trim() && tipo === 'todos' && !catFilter) return null
    return new Set(filtered.map((h) => h.id))
  }, [filtered, dq, tipo, catFilter])

  const selected = hojas.find((h) => h.id === selectedId)

  return (
    <div className="mod">
      {/* ── Izquierda: árbol ── */}
      <aside className="mod-col">
        <Panel title="Explorar" icon={FolderTree} actions={<button className="iconbtn sm" title="Nueva categoría raíz" onClick={() => setCatModal({})}><FolderPlus size={15} /></button>}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--dim)' }} />
            <input className="input" style={{ paddingLeft: 34, paddingRight: 34 }} placeholder={semantic ? 'Buscar por significado…' : 'Filtrar hojas…'} value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="iconbtn sm" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setQ('')}><X size={14} /></button>}
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <button className={`chip click ${semantic ? 'on' : ''}`} onClick={() => setSemantic((v) => !v)} title="Búsqueda semántica (RAG vía Ollama)">
              {semBusy ? <RefreshCw size={12} className="spin" /> : <Sparkles size={12} />} Semántica
            </button>
            <ReindexBtn />
          </div>
          <div className="hr" />
          <Tree categorias={categorias} hojas={visibles} q={dq} catFilter={catFilter} setCatFilter={setCatFilter} onEdit={setCatModal} />
        </Panel>
        <StatsPanel hojas={visibles} />
      </aside>

      {/* ── Centro ── */}
      <section className="mod-center">
        <div className="mod-bar">
          <Seg id="bview" value={view} onChange={setView} options={[{ id: 'grafo', label: '◉ Grafo' }, { id: 'grid', label: '▦ Tarjetas' }, { id: 'lista', label: '☰ Lista' }]} />
          <Seg id="btipo" value={tipo} onChange={setTipo} options={[{ id: 'todos', label: 'Todo' }, { id: 'texto', label: 'Texto' }, { id: 'link', label: 'Links' }, { id: 'foto', label: 'Fotos' }]} />
          {catFilter && (
            <button className="chip click on" onClick={() => setCatFilter(null)}>
              {categorias.find((c) => c.id === catFilter)?.nombre} <X size={12} />
            </button>
          )}
          <span className="grow" />
          <span className="small muted mono">{filtered.length} / {visibles.length}</span>
          <button className="btn primary sm" onClick={() => useUI.getState().openCapture({ tab: 'nota', categoriaId: catFilter || undefined })}><Plus size={15} /> Hoja</button>
        </div>
        {!loaded ? (
          <div className="glass center" style={{ flex: 1 }}><Loader label="Sincronizando bóveda" /></div>
        ) : view === 'grafo' ? (
          <div className="glass" style={{ flex: 1, minHeight: 0, display: 'flex', borderRadius: 22 }}>
            {visibles.length === 0 ? (
              <div className="center" style={{ flex: 1 }}><Empty icon={Network} title="La bóveda está vacía">Capturá tu primera idea con <kbd>Ctrl</kbd>+<kbd>Enter</kbd></Empty></div>
            ) : (
              <Graph categorias={categorias} hojas={visibles} matchIds={matchIds} selectedId={selectedId} onSelect={select} onCategory={(id) => setCatFilter(id)} />
            )}
          </div>
        ) : (
          <div className="mod-scroll">
            {filtered.length === 0 ? (
              <div className="glass"><Empty icon={Search} title="Nada por acá">Probá con otro filtro o búsqueda.</Empty></div>
            ) : view === 'grid' ? (
              <Stagger style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }} delay={0.025}>
                {filtered.slice(0, 300).map((h) => <HojaCard key={h.id} h={h} q={dq} on={h.id === selectedId} onClick={() => select(h.id)} />)}
              </Stagger>
            ) : (
              <Stagger className="glass" style={{ padding: 8 }} delay={0.015}>
                {filtered.slice(0, 500).map((h) => <HojaRow key={h.id} h={h} q={dq} on={h.id === selectedId} onClick={() => select(h.id)} />)}
              </Stagger>
            )}
          </div>
        )}
      </section>

      {/* ── Derecha ── */}
      <aside className="mod-col mod-right">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={`d${selected.id}`} className="glass card neon-edge lit" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
              <HojaDetail hoja={selected} onClose={() => select(null)} />
            </motion.div>
          ) : (
            <motion.div key="overview" className="col" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Recientes />
              <HoyAgenda />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Detalle en pantallas sin panel derecho */}
      <MobileDetail selected={selected} onClose={() => select(null)} />
      <CategoriaModal data={catModal} onClose={() => setCatModal(null)} />
    </div>
  )
}

function MobileDetail({ selected, onClose }) {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 1200)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth <= 1200)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return (
    <Modal open={narrow && !!selected} onClose={onClose} title={selected ? hojaTitulo(selected).slice(0, 40) : ''} icon={FileText}>
      {selected && <HojaDetail hoja={selected} />}
    </Modal>
  )
}

function ReindexBtn() {
  const reindexar = useBoveda((s) => s.reindexar)
  const [busy, setBusy] = useState(false)
  return (
    <button className="btn xs ghost" disabled={busy} onClick={async () => { setBusy(true); await reindexar(); setTimeout(() => setBusy(false), 1500) }} title="Reindexar búsqueda semántica">
      <RefreshCw size={12} className={busy ? 'spin' : ''} /> Reindexar
    </button>
  )
}

function Tree({ categorias, hojas, q, catFilter, setCatFilter, onEdit }) {
  const tree = useMemo(() => buildTree(categorias).filter((c) => !isBasura(c)), [categorias])
  const [exp, setExp] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_EXP) || '{}') } catch { return {} } })
  const counts = useMemo(() => {
    const direct = new Map()
    for (const h of hojas) direct.set(h.categoria_id, (direct.get(h.categoria_id) || 0) + 1)
    const total = new Map()
    const walk = (n) => {
      let t = direct.get(n.id) || 0
      for (const c of n.children) t += walk(c)
      total.set(n.id, t)
      return t
    }
    tree.forEach(walk)
    return total
  }, [tree, hojas])
  const toggle = (id) => {
    const next = { ...exp, [id]: !exp[id] }
    setExp(next)
    try { localStorage.setItem(LS_EXP, JSON.stringify(next)) } catch { /* noop */ }
  }
  const setAll = (v) => {
    const next = {}
    if (v) categorias.forEach((c) => (next[c.id] = true))
    setExp(next)
    try { localStorage.setItem(LS_EXP, JSON.stringify(next)) } catch { /* noop */ }
  }
  const openCapture = useUI((s) => s.openCapture)

  const Node = ({ n }) => {
    const open = !!exp[n.id]
    const on = catFilter === n.id
    return (
      <div>
        <div className={`li ${on ? 'on' : ''}`} style={{ paddingLeft: 6 + n.depth * 14, paddingTop: 6, paddingBottom: 6 }} onClick={() => setCatFilter(on ? null : n.id)}>
          <motion.button
            className="iconbtn sm"
            style={{ width: 20, height: 20, visibility: n.children.length ? 'visible' : 'hidden' }}
            animate={{ rotate: open ? 90 : 0 }}
            onClick={(e) => { e.stopPropagation(); toggle(n.id) }}
          >
            <ChevronRight size={13} />
          </motion.button>
          <span style={{ width: 20, textAlign: 'center', color: n.color || 'var(--a1)' }}>{n.icono || '◆'}</span>
          <span className="grow ellipsis small" style={{ fontWeight: n.depth === 0 ? 600 : 400 }}><Highlight text={n.nombre} q={q} /></span>
          <span className="li-actions">
            <button className="iconbtn sm" title="Nueva hoja aquí" onClick={(e) => { e.stopPropagation(); openCapture({ tab: 'nota', categoriaId: n.id }) }}><Plus size={13} /></button>
            <button className="iconbtn sm" title="Subcategoría" onClick={(e) => { e.stopPropagation(); onEdit({ padre_id: n.id }) }}><FolderPlus size={13} /></button>
            <button className="iconbtn sm" title="Editar" onClick={(e) => { e.stopPropagation(); onEdit({ cat: n }) }}><Pencil size={12} /></button>
          </span>
          <span className="mono tiny dim">{counts.get(n.id) || 0}</span>
        </div>
        <AnimatePresence initial={false}>
          {open && n.children.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              {n.children.map((c) => <Node key={c.id} n={c} />)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="tiny upper dim grow">Categorías</span>
        <button className="iconbtn sm" title="Expandir todo" onClick={() => setAll(true)}><ChevronsUpDown size={13} /></button>
        <button className="iconbtn sm" title="Colapsar todo" onClick={() => setAll(false)}><ChevronsDownUp size={13} /></button>
      </div>
      <div className="list" style={{ gap: 1 }}>
        {tree.map((n) => <Node key={n.id} n={n} />)}
        {tree.length === 0 && <div className="small dim">Sin categorías (¿la API está corriendo?)</div>}
      </div>
    </div>
  )
}

function StatsPanel({ hojas }) {
  const by = { texto: 0, link: 0, foto: 0 }
  hojas.forEach((h) => (by[h.tipo] = (by[h.tipo] || 0) + 1))
  const data = [
    { name: 'Texto', value: by.texto, color: '#9d4bff' },
    { name: 'Links', value: by.link, color: '#00f0ff' },
    { name: 'Fotos', value: by.foto, color: '#ff2e97' },
  ]
  const semana = hojas.filter((h) => (h.fecha || '') >= toISODate(addDays(new Date(), -7))).length
  return (
    <Panel title="Pulso" icon={Layers}>
      <div className="row" style={{ gap: 16 }}>
        <Donut data={data} size={110} thickness={14} format={(v) => v} center={<div><div className="display" style={{ fontSize: 20, fontWeight: 800 }}>{hojas.length}</div><div className="tiny dim">hojas</div></div>} />
        <div className="col" style={{ gap: 6 }}>
          {data.map((d) => (
            <div key={d.name} className="row small"><span className="dot" style={{ background: d.color, color: d.color }} /> {d.name} <b className="mono">{d.value}</b></div>
          ))}
          <div className="small muted">+{semana} esta semana</div>
        </div>
      </div>
    </Panel>
  )
}

function HojaCard({ h, q, on, onClick }) {
  const Icon = TIPO_ICON[h.tipo] || FileText
  const { src } = photoFromApuntes(h.apuntes)
  const img = src ? assetUrl(src) : h.link_preview?.image
  const color = h.color || '#9d4bff'
  const texto = (h.apuntes || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return (
    <Item className={`glass neon-edge ${on ? 'lit' : ''}`} style={{ borderRadius: 18, overflow: 'hidden', cursor: 'pointer' }} onClick={onClick} whileHover={{ y: -4, rotateX: 2, rotateY: -2 }}>
      {img && <img src={img} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} onError={(e) => (e.target.style.display = 'none')} />}
      <div style={{ padding: 14, borderTop: `2px solid ${color}` }}>
        <div className="row tiny upper" style={{ color, gap: 6 }}>
          {h.icono ? <span style={{ fontSize: 13 }}>{h.icono}</span> : <Icon size={12} />}
          <span className="ellipsis grow">{h.categoria_nombre}</span>
          <span className="dim">{relativeTime(h.fecha)}</span>
        </div>
        <div style={{ fontWeight: 600, marginTop: 6, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
          <Highlight text={hojaTitulo(h)} q={q} />
        </div>
        {texto && <div className="small muted" style={{ marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texto}</div>}
        {typeof h.score === 'number' && <div className="tiny" style={{ marginTop: 6, color: 'var(--a3)' }}>similitud {(h.score * 100).toFixed(0)}%</div>}
      </div>
    </Item>
  )
}

function HojaRow({ h, q, on, onClick }) {
  const Icon = TIPO_ICON[h.tipo] || FileText
  const color = h.color || '#9d4bff'
  return (
    <Item className={`li ${on ? 'on' : ''} ${h._pending ? 'pending' : ''}`} onClick={onClick}>
      <span className="center" style={{ width: 30, height: 30, borderRadius: 10, background: `${color}22`, color, flexShrink: 0 }}>{h.icono || <Icon size={14} />}</span>
      <span className="grow ellipsis"><Highlight text={hojaTitulo(h)} q={q} /></span>
      <span className="chip hide-sm" style={{ maxWidth: 160 }}><span className="ellipsis">{h.categoria_nombre}</span></span>
      <span className="small dim mono" style={{ width: 80, textAlign: 'right' }}>{relativeTime(h.fecha)}</span>
    </Item>
  )
}

function Recientes() {
  const recientes = useBoveda((s) => s.recientes)
  const hojas = useBoveda((s) => s.hojas)
  const select = useBoveda((s) => s.select)
  const list = recientes.length ? recientes : [...hojas].sort((a, b) => (b.fecha_actualizado || b.fecha || '').localeCompare(a.fecha_actualizado || a.fecha || '')).slice(0, 8)
  return (
    <Panel title="Recientes" icon={Clock}>
      {list.length === 0 ? (
        <div className="small dim">Todavía no hay hojas.</div>
      ) : (
        <div className="list">
          {list.map((h, i) => {
            const Icon = TIPO_ICON[h.tipo] || FileText
            return (
              <motion.div key={h.id} className="li" onClick={() => select(h.id)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <Icon size={14} style={{ color: h.color || 'var(--a1)', flexShrink: 0 }} />
                <span className="grow ellipsis small">{hojaTitulo(h)}</span>
                <span className="tiny dim">{relativeTime(h.fecha_actualizado || h.fecha)}</span>
              </motion.div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function HoyAgenda() {
  const { eventos, calendarios, ensureRange, setDia, setTab } = useAgenda()
  const nav = useNavigate()
  const hoy = toISODate()
  useEffect(() => { ensureRange(toISODate(addDays(new Date(), -3)), toISODate(addDays(new Date(), 30))) }, [ensureRange])
  const list = eventosDelDia(eventos, calendarios, hoy).slice(0, 5)
  return (
    <Panel title="Hoy en agenda" icon={CalendarDays} actions={<button className="btn xs ghost" onClick={() => { setDia(hoy); setTab('hoy'); nav('/agenda') }}>Abrir</button>}>
      {list.length === 0 ? (
        <div className="small dim">Día libre de eventos ✦</div>
      ) : (
        <div className="list">
          {list.map((e) => (
            <div key={e.id} className="li" onClick={() => { setDia(hoy); setTab('hoy'); nav('/agenda') }}>
              <span className="dot" style={{ background: e.calendario_color || 'var(--cyan)', color: e.calendario_color || 'var(--cyan)' }} />
              <span className="grow ellipsis small">{e.titulo}</span>
              <span className="mono tiny muted">{hasTime(e.fecha_inicio) && !e.todo_el_dia ? fmtTime(e.fecha_inicio) : 'todo el día'}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function CategoriaModal({ data, onClose }) {
  const { categorias, crearCategoria, editarCategoria, borrarCategoria } = useBoveda()
  const editing = data?.cat
  const [f, setF] = useState({ nombre: '', padre_id: null, icono: '', color: '#9d4bff' })
  const [conflict, setConflict] = useState(null)
  useEffect(() => {
    if (!data) return
    setConflict(null)
    if (editing) setF({ nombre: editing.nombre, padre_id: editing.padre_id, icono: editing.icono || '', color: editing.color || '#9d4bff' })
    else setF({ nombre: '', padre_id: data.padre_id ?? null, icono: '', color: '#9d4bff' })
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const invalidParents = editing ? descendantIds(categorias, editing.id) : new Set()
  const [save, saving] = useBusy(async () => {
    if (!f.nombre.trim()) return
    const body = { nombre: f.nombre.trim(), padre_id: f.padre_id || null, icono: f.icono || null, color: f.color || null }
    if (editing) await editarCategoria(editing.id, body)
    else await crearCategoria(body)
    onClose()
  })
  const remove = async (forzar) => {
    const r = await borrarCategoria(editing.id, forzar)
    if (r.ok) onClose()
    else if (r.conflict) setConflict(r.msg)
  }
  return (
    <Modal open={!!data} onClose={onClose} title={editing ? 'Editar categoría' : 'Nueva categoría'} icon={FolderTree} onSubmit={save}
      footer={
        <>
          {editing && !conflict && <button className="btn danger sm" onClick={() => remove(false)}><Trash2 size={13} /> Eliminar</button>}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Icono"><input className="input" style={{ width: 64, textAlign: 'center', fontSize: 20 }} value={f.icono} maxLength={4} onChange={(e) => setF({ ...f, icono: e.target.value })} placeholder="◆" /></Field>
        <Field label="Nombre" className="grow"><input autoFocus className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
      </div>
      <Field label="Dentro de">
        <select className="select" value={f.padre_id ?? ''} onChange={(e) => setF({ ...f, padre_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— Raíz —</option>
          {categorias.filter((c) => !invalidParents.has(c.id) && !isBasura(c)).sort((a, b) => (a.ruta || a.nombre).localeCompare(b.ruta || b.nombre)).map((c) => (
            <option key={c.id} value={c.id}>{c.ruta || c.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="Color"><Swatches value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
      {editing?.ruta && <div className="small dim mono">📁 {editing.ruta}</div>}
      {conflict && (
        <div className="glass" style={{ padding: 12, borderColor: 'rgba(255,77,109,.5)' }}>
          <div className="small" style={{ color: '#ffb3c1' }}>{conflict}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="small muted grow">Las hojas se moverán a Basura.</span>
            <button className="btn danger sm" onClick={() => remove(true)}>Eliminar igual</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
