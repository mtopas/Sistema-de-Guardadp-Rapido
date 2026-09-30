import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  MessageSquare, Brain, Users, Inbox, Activity, Plus, Send, Trash2, Pencil, Sparkles, Check, X, Search, Tag, Cpu, Wallet,
  CircleDot, RefreshCw, FolderKanban, FileText, ShieldAlert,
} from 'lucide-react'
import { useJarvis } from '../../store/jarvis'
import { toast } from '../../store/ui'
import { Panel, Tabs, Empty, Loader, Modal, Field, ConfirmButton, Switch, useDebounced } from '../../components/ui'
import { Donut } from '../../components/charts'
import { relativeTime } from '../../lib/dates'
import { NEON } from '../../lib/fin'

const TABS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'memoria', label: 'Memoria', icon: Brain },
  { id: 'entidades', label: 'Entidades', icon: Users },
  { id: 'propuestas', label: 'Propuestas', icon: Inbox },
  { id: 'sistema', label: 'Sistema', icon: Activity },
]

export default function JarvisScreen() {
  const [tab, setTab] = useState('chat')
  const { fetchChats, fetchStatus } = useJarvis()
  useEffect(() => {
    fetchChats()
    fetchStatus()
    const t = setInterval(fetchStatus, 30000)
    return () => clearInterval(t)
  }, [fetchChats, fetchStatus])
  return (
    <div className="mod">
      <aside className="mod-col">
        <ChatsPanel onOpen={() => setTab('chat')} />
        <CapturePanel />
      </aside>
      <section className="mod-center">
        <div className="mod-bar">
          <Tabs id="jarvis" value={tab} onChange={setTab} tabs={TABS} />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={tab} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {tab === 'chat' && <Chat />}
            {tab === 'memoria' && <Memoria />}
            {tab === 'entidades' && <Entidades />}
            {tab === 'propuestas' && <Propuestas />}
            {tab === 'sistema' && <Sistema />}
          </motion.div>
        </AnimatePresence>
      </section>
      <aside className="mod-col mod-right"><StatusPanel /></aside>
    </div>
  )
}

function Orb({ active }) {
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', inset: i * 12, borderRadius: '50%', border: '1.5px solid', borderColor: ['var(--a1)', 'var(--a2)', 'var(--a3)'][i], boxShadow: `0 0 24px -4px ${['var(--a1)', 'var(--a2)', 'var(--a3)'][i]}` }}
          animate={{ rotate: i % 2 ? -360 : 360, scale: active ? [1, 1.08, 1] : 1 }}
          transition={{ rotate: { duration: 8 + i * 4, repeat: Infinity, ease: 'linear' }, scale: { duration: 1, repeat: Infinity } }}
        />
      ))}
      <motion.div
        style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, var(--a1) 45%, var(--a2))', boxShadow: '0 0 40px var(--a1), 0 0 80px var(--a2)' }}
        animate={{ scale: active ? [1, 1.25, 0.9, 1] : [1, 1.06, 1] }}
        transition={{ duration: active ? 1.2 : 3, repeat: Infinity }}
      />
    </div>
  )
}

function ChatsPanel({ onOpen }) {
  const { chats, chatId, openChat, newChat, renameChat, deleteChat } = useJarvis()
  const [edit, setEdit] = useState(null)
  return (
    <Panel title="Conversaciones" icon={MessageSquare} actions={<button className="iconbtn sm" title="Nueva conversación" onClick={() => { newChat(); onOpen() }}><Plus size={15} /></button>}>
      <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {chats.length === 0 && <div className="small dim">Sin conversaciones.</div>}
        {chats.map((c) => (
          <div key={c.id} className={`li ${chatId === c.id ? 'on' : ''}`} onClick={() => { openChat(c.id); onOpen() }}>
            <MessageSquare size={13} className="dim" />
            {edit === c.id ? (
              <input autoFocus className="input sm" defaultValue={c.title || ''} onClick={(e) => e.stopPropagation()} onBlur={(e) => { renameChat(c.id, e.target.value); setEdit(null) }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
            ) : (
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small ellipsis">{c.title || 'Sin título'}</div>
                <div className="tiny dim">{c.message_count} msj · {relativeTime(c.last_message_at)}</div>
              </div>
            )}
            <span className="li-actions">
              <button className="iconbtn sm" onClick={(e) => { e.stopPropagation(); setEdit(c.id) }}><Pencil size={12} /></button>
              <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={() => deleteChat(c.id)} icon={<Trash2 size={12} />} />
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function CapturePanel() {
  const capture = useJarvis((s) => s.capture)
  const [c, setC] = useState('')
  const [local, setLocal] = useState(false)
  const [conf, setConf] = useState(false)
  return (
    <Panel title="Recordá esto" icon={Brain}>
      <textarea className="textarea" rows={3} placeholder="Un dato, decisión o persona…" value={c} onChange={(e) => setC(e.target.value)} />
      <div className="row wrap" style={{ marginTop: 8 }}>
        <label className="row tiny"><Switch on={local} onChange={setLocal} /> local</label>
        <label className="row tiny"><Switch on={conf} onChange={setConf} /> confidencial</label>
        <span className="grow" />
        <button className="btn primary xs" disabled={!c.trim()} onClick={async () => { if (await capture(c.trim(), { local_only: local, confidential: conf })) setC('') }}><Sparkles size={12} /> Capturar</button>
      </div>
    </Panel>
  )
}

function Chat() {
  const { messages, thinking, ask, chatId } = useJarvis()
  const [q, setQ] = useState('')
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, thinking])
  const send = () => {
    if (!q.trim() || thinking) return
    ask(q.trim())
    setQ('')
  }
  const sugerencias = ['¿Qué sabés de mí?', '¿Qué decisiones tomé esta semana?', '¿Qué tengo pendiente en la agenda?', '¿Cómo vengo con mis hábitos?']
  return (
    <div className="glass jarvis-chat" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 22, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {messages.length === 0 && !thinking ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, textAlign: 'center' }}>
            <Orb />
            <div>
              <div className="display grad-text" style={{ fontSize: 22, fontWeight: 800 }}>Hola, soy Jarvis</div>
              <div className="small muted">Pregúntame sobre lo que guardaste: notas, decisiones, personas, proyectos.</div>
            </div>
            <div className="row wrap gap6" style={{ justifyContent: 'center' }}>
              {sugerencias.map((s) => <button key={s} className="chip click" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 14 }}>
            {!chatId && messages.length === 0 && null}
            {messages.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                <div
                  style={{
                    padding: '12px 16px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', whiteSpace: 'pre-wrap', lineHeight: 1.55,
                    ...(m.role === 'user'
                      ? { background: 'linear-gradient(135deg, rgba(var(--a1-rgb), .55), rgba(var(--a2-rgb), .45))', boxShadow: '0 8px 30px -14px var(--a2)' }
                      : { background: 'rgba(255,255,255,.05)', border: `1px solid ${m.error ? 'rgba(255,77,109,.5)' : 'var(--line)'}` }),
                  }}
                >
                  {m.role === 'assistant' && !m.error ? <Typewriter text={m.content} animate={i === messages.length - 1 && !!m.meta} /> : m.content}
                </div>
                {m.sources?.length > 0 && (
                  <div className="row wrap gap4" style={{ marginTop: 6 }}>
                    {m.sources.slice(0, 6).map((s, k) => (
                      <span key={k} className="tag" title={typeof s === 'object' ? (s.content_raw || s.content || JSON.stringify(s)) : String(s)}>
                        <FileText size={10} /> {sourceLabel(s)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="tiny dim" style={{ marginTop: 4, textAlign: m.role === 'user' ? 'right' : 'left' }}>{relativeTime(m.created_at)}{m.meta ? ` · ${m.meta.context_sent}/${m.meta.context_count} memorias usadas` : ''}</div>
              </motion.div>
            ))}
            {thinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row" style={{ gap: 12 }}>
                <div style={{ transform: 'scale(.4)', margin: -36 }}><Orb active /></div>
                <span className="small muted">Buscando en tu memoria…</span>
              </motion.div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>
      <div style={{ padding: 14, borderTop: '1px solid var(--line)' }}>
        <div className="row">
          <textarea
            className="textarea"
            rows={1}
            style={{ minHeight: 46, resize: 'none' }}
            placeholder="Preguntale algo a Jarvis…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <motion.button className="btn primary" style={{ height: 46 }} onClick={send} disabled={thinking || !q.trim()} whileTap={{ scale: 0.9 }}><Send size={16} /></motion.button>
        </div>
      </div>
    </div>
  )
}

function sourceLabel(s) {
  if (!s || typeof s !== 'object') return String(s).slice(0, 30)
  const t = s.title || s.name || s.content_raw || s.content || s.id || 'fuente'
  return String(t).slice(0, 34) + (String(t).length > 34 ? '…' : '')
}

function Typewriter({ text, animate }) {
  const [n, setN] = useState(animate ? 0 : text.length)
  useEffect(() => {
    if (!animate) return setN(text.length)
    setN(0)
    const step = Math.max(1, Math.round(text.length / 160))
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x } return x + step }), 12)
    return () => clearInterval(t)
  }, [text, animate])
  return <>{text.slice(0, n)}{n < text.length && <span style={{ color: 'var(--a1)' }}>▌</span>}</>
}

const TYPE_COLOR = (t) => NEON[[...String(t)].reduce((a, c) => a + c.charCodeAt(0), 0) % NEON.length]

function Memoria() {
  const { browse, statsTypes, tags: fetchTags } = useJarvis()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 300)
  const [type, setType] = useState('')
  const [tag, setTag] = useState('')
  const [types, setTypes] = useState({})
  const [tags, setTags] = useState([])
  const [res, setRes] = useState(null)
  const [offset, setOffset] = useState(0)
  const [edit, setEdit] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    statsTypes().then(setTypes).catch(() => {})
    fetchTags().then((t) => setTags(Array.isArray(t) ? t : [])).catch(() => {})
  }, [statsTypes, fetchTags])
  useEffect(() => {
    let alive = true
    setRes(null)
    browse({ q: dq || undefined, type: type || undefined, tag: tag || undefined, limit: 40, offset })
      .then((r) => alive && setRes(r))
      .catch((e) => alive && setRes({ error: e.message, items: [], total: 0 }))
    return () => { alive = false }
  }, [dq, type, tag, offset, reload, browse])
  const donut = Object.entries(types).map(([name, value]) => ({ name, value, color: TYPE_COLOR(name) }))
  return (
    <div className="mod-scroll" style={{ padding: 0 }}>
      <div className="row wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--dim)' }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar en la memoria…" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0) }} />
        </div>
        <select className="select" style={{ width: 170 }} value={type} onChange={(e) => { setType(e.target.value); setOffset(0) }}>
          <option value="">Todos los tipos</option>
          {Object.keys(types).map((t) => <option key={t}>{t}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="select" style={{ width: 150 }} value={tag} onChange={(e) => { setTag(e.target.value); setOffset(0) }}>
            <option value="">Todas las tags</option>
            {tags.map((t) => { const n = typeof t === 'string' ? t : t.name || t.tag; return <option key={n}>{n}</option> })}
          </select>
        )}
      </div>
      {donut.length > 0 && (
        <Panel title="Tipos de memoria" icon={Brain}>
          <div className="row wrap" style={{ gap: 20 }}>
            <Donut data={donut} size={130} thickness={16} format={(v) => v} center={<div className="display" style={{ fontWeight: 800 }}>{donut.reduce((a, d) => a + d.value, 0)}</div>} onSelect={(n) => setType(n || '')} selected={type || null} />
            <div className="row wrap gap6">{donut.map((d) => <button key={d.name} className={`chip click ${type === d.name ? 'on' : ''}`} onClick={() => setType(type === d.name ? '' : d.name)}><span className="dot" style={{ background: d.color, color: d.color }} />{d.name} <b className="mono">{d.value}</b></button>)}</div>
          </div>
        </Panel>
      )}
      {!res ? <div className="glass"><Loader label="Consultando memoria" /></div> : res.error ? (
        <div className="glass card small" style={{ color: 'var(--amber)' }}>{res.error}</div>
      ) : res.items.length === 0 ? (
        <div className="glass"><Empty icon={Brain} title="Sin recuerdos para esta búsqueda" /></div>
      ) : (
        <>
          <div className="small muted">{res.total} recuerdos</div>
          <div className="col" style={{ gap: 10 }}>
            {res.items.map((m, i) => (
              <motion.div key={m.id} className="glass neon-edge" style={{ padding: 14, borderRadius: 16, cursor: 'pointer', borderLeft: `3px solid ${TYPE_COLOR(m.type)}` }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} onClick={() => setEdit(m)}>
                <div className="row tiny upper" style={{ gap: 8 }}>
                  <span style={{ color: TYPE_COLOR(m.type) }}>{m.type}</span>
                  <span className="dim">{m.source}{m.channel ? ` · ${m.channel}` : ''}</span>
                  {!!m.confidential && <span className="chip" style={{ fontSize: 9, color: 'var(--red)' }}><ShieldAlert size={9} /> confidencial</span>}
                  <span className="grow" />
                  <span className="dim">{relativeTime(m.recorded_at || m.created_at)}</span>
                </div>
                <div style={{ marginTop: 6 }}>{m.content_processed || m.content_raw}</div>
                {m.tags && <div className="row wrap gap4" style={{ marginTop: 6 }}>{parseTags(m.tags).map((t) => <span key={t} className="tag"><Tag size={9} />{t}</span>)}</div>}
              </motion.div>
            ))}
          </div>
          <div className="row">
            <button className="btn sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 40))}>Anterior</button>
            <span className="grow center small dim">{offset + 1}–{Math.min(res.total, offset + 40)} de {res.total}</span>
            <button className="btn sm" disabled={offset + 40 >= res.total} onClick={() => setOffset(offset + 40)}>Siguiente</button>
          </div>
        </>
      )}
      <EntryModal entry={edit} onClose={() => setEdit(null)} onChanged={() => setReload((x) => x + 1)} types={Object.keys(types)} />
    </div>
  )
}

function parseTags(t) {
  if (Array.isArray(t)) return t
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : [String(t)] } catch { return String(t).split(',').map((x) => x.trim()).filter(Boolean) }
}

function EntryModal({ entry, onClose, onChanged, types }) {
  const { editEntry, deleteEntry } = useJarvis()
  const [f, setF] = useState(null)
  useEffect(() => { if (entry) setF({ content: entry.content_raw || '', type: entry.type || '', tags: entry.tags ? parseTags(entry.tags).join(', ') : '' }) }, [entry])
  if (!entry || !f) return <Modal open={false} />
  const save = async () => {
    try {
      await editEntry(entry.id, { content: f.content, type: f.type || null, tags: f.tags ? f.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] })
      toast('Recuerdo actualizado')
      onChanged()
      onClose()
    } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Modal open={!!entry} onClose={onClose} title="Recuerdo" icon={Brain} onSubmit={save}
      footer={<>
        <ConfirmButton onConfirm={async () => { try { await deleteEntry(entry.id); toast('Recuerdo eliminado'); onChanged(); onClose() } catch (e) { toast(e.message, 'error') } }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <Field label="Contenido"><textarea className="textarea" rows={5} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Tipo">
          <input className="input" list="jv-types" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} />
          <datalist id="jv-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Tags (coma)"><input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
      </div>
      <div className="tiny dim mono" style={{ lineHeight: 1.6 }}>
        id {entry.id}<br />origen {entry.origin_trust} · confianza {entry.confidence} · autoría {entry.authorship}<br />source_id {entry.source_id}
      </div>
    </Modal>
  )
}

function Entidades() {
  const { entities, entity, projects } = useJarvis()
  const [list, setList] = useState(null)
  const [projs, setProjs] = useState([])
  const [sel, setSel] = useState(null)
  const [mems, setMems] = useState(null)
  useEffect(() => {
    entities().then(setList).catch(() => setList([]))
    projects().then((p) => setProjs(Array.isArray(p) ? p : [])).catch(() => {})
  }, [entities, projects])
  useEffect(() => {
    if (!sel) return
    setMems(null)
    entity(sel.name).then(setMems).catch(() => setMems([]))
  }, [sel, entity])
  return (
    <div className="mod-scroll" style={{ padding: 0 }}>
      {!list ? <div className="glass"><Loader /></div> : list.length === 0 ? <div className="glass"><Empty icon={Users} title="Todavía no hay entidades" /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {list.map((e, i) => (
            <motion.div key={e.entity_id} className={`glass neon-edge ${sel?.entity_id === e.entity_id ? 'lit' : ''}`} style={{ padding: 14, borderRadius: 18, cursor: 'pointer' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} whileHover={{ y: -3 }} onClick={() => setSel(e)}>
              <div className="row">
                <span className="center" style={{ width: 38, height: 38, borderRadius: 12, background: `${TYPE_COLOR(e.entity_type)}26`, color: TYPE_COLOR(e.entity_type), fontWeight: 800 }}>{e.name.slice(0, 1)}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b className="ellipsis" style={{ display: 'block' }}>{e.name}</b>
                  <div className="tiny dim">{e.entity_type} · {e.memory_count} recuerdos</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {sel && (
        <Panel title={sel.name} icon={Users} actions={<button className="iconbtn sm" onClick={() => setSel(null)}><X size={14} /></button>}>
          {sel.notes && <div className="small muted" style={{ marginBottom: 8 }}>{sel.notes}</div>}
          {!mems ? <Loader /> : (
            <div className="list">
              {mems.map((m) => <div key={m.id} className="li small" style={{ cursor: 'default' }}><CircleDot size={12} style={{ color: TYPE_COLOR(m.type) }} /><span className="grow">{m.content_processed || m.content_raw}</span><span className="tiny dim">{relativeTime(m.recorded_at)}</span></div>)}
            </div>
          )}
        </Panel>
      )}
      {projs.length > 0 && (
        <Panel title="Proyectos" icon={FolderKanban}>
          <div className="list">{projs.map((p, i) => <div key={p.id || i} className="li small" style={{ cursor: 'default' }}><FolderKanban size={13} /><span className="grow">{p.name || p.nombre || p.title || JSON.stringify(p)}</span></div>)}</div>
        </Panel>
      )}
    </div>
  )
}

function Propuestas() {
  const { proposals, auditProposals, acceptProposal, rejectProposal, acceptAudit, rejectAudit } = useJarvis()
  const [p, setP] = useState(null)
  const [a, setA] = useState(null)
  const [text, setText] = useState({})
  const load = () => {
    proposals().then(setP).catch(() => setP([]))
    auditProposals().then(setA).catch(() => setA([]))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn, msg) => {
    try { await fn(); toast(msg); load() } catch (e) { toast(e.message, 'error') }
  }
  const Card = ({ item, kind }) => {
    const id = item.id || item.proposal_id
    const q = item.question || item.content || item.proposal || item.text || JSON.stringify(item)
    return (
      <motion.div className="glass neon-edge" style={{ padding: 14, borderRadius: 16 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="tiny upper dim">{kind === 'audit' ? 'Auditoría' : 'Propuesta'} · {relativeTime(item.created_at)}</div>
        <div style={{ margin: '6px 0 10px' }}>{q}</div>
        {item.content && item.question && <div className="small muted" style={{ marginBottom: 8 }}>“{item.content}”</div>}
        <div className="row">
          <input className="input sm" placeholder={kind === 'audit' ? 'Respuesta (opcional)' : 'Aclaración (opcional)'} value={text[id] || ''} onChange={(e) => setText({ ...text, [id]: e.target.value })} />
          <button className="btn sm" onClick={() => act(() => (kind === 'audit' ? acceptAudit(id, text[id]) : acceptProposal(id, text[id])), 'Aceptada')}><Check size={13} /> Aceptar</button>
          <button className="btn sm danger" onClick={() => act(() => (kind === 'audit' ? rejectAudit(id) : rejectProposal(id)), 'Rechazada')}><X size={13} /></button>
        </div>
      </motion.div>
    )
  }
  return (
    <div className="mod-scroll" style={{ padding: 0 }}>
      <div className="row"><span className="grow" /><button className="btn sm" onClick={load}><RefreshCw size={13} /> Actualizar</button></div>
      {p === null || a === null ? <div className="glass"><Loader /></div> : p.length + a.length === 0 ? (
        <div className="glass"><Empty icon={Inbox} title="Nada que revisar">Jarvis te va a preguntar acá antes de guardar patrones o correcciones.</Empty></div>
      ) : (
        <>
          {p.map((x, i) => <Card key={`p${x.id || i}`} item={x} kind="prop" />)}
          {a.map((x, i) => <Card key={`a${x.id || i}`} item={x} kind="audit" />)}
        </>
      )}
    </div>
  )
}

function Sistema() {
  const { inbox, events } = useJarvis()
  const [items, setItems] = useState(null)
  const [evs, setEvs] = useState(null)
  useEffect(() => {
    inbox().then(setItems).catch(() => setItems([]))
    events().then(setEvs).catch(() => setEvs([]))
  }, [inbox, events])
  const LEVEL = { EMBED: '#00f0ff', CLASSIFY: '#9d4bff', ENTITY: '#ff2e97', ERROR: '#ff4d6d' }
  return (
    <div className="mod-scroll" style={{ padding: 0 }}>
      <Panel title="Bandeja de procesamiento" icon={Inbox}>
        {!items ? <Loader /> : items.length === 0 ? <div className="small dim">Bandeja vacía.</div> : (
          <div className="list">
            {items.map((x) => (
              <div key={x.entry_id} className="li" style={{ cursor: 'default' }}>
                <span className="chip" style={{ fontSize: 10, color: x.status === 'DONE' ? 'var(--mint)' : x.status === 'ERROR' ? 'var(--red)' : 'var(--amber)' }}>{x.status}</span>
                <span className="grow ellipsis small">{x.content_raw}</span>
                <span className="tiny dim">{relativeTime(x.updated_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Eventos del worker" icon={Activity}>
        {!evs ? <Loader /> : (
          <div className="col" style={{ gap: 0 }}>
            {evs.map((e, i) => (
              <motion.div key={e.id} className="row small" style={{ padding: '6px 0', borderBottom: '1px solid rgba(150,170,255,.06)', fontFamily: 'var(--font-mono)' }} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.015 }}>
                <span className="tiny" style={{ width: 72, color: LEVEL[e.level] || 'var(--muted)' }}>{e.level}</span>
                <span className="grow ellipsis">{e.message}</span>
                <span className="tiny dim">{relativeTime(e.created_at)}</span>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function StatusPanel() {
  const { status, budget, inboxStats } = useJarvis()
  const alive = status?.worker_alive
  const pct = budget ? Math.min(1, budget.spent_usd / (budget.daily_budget_usd || 1)) : 0
  return (
    <>
      <Panel title="Worker" icon={Cpu}>
        <div className="row">
          <span className={`status-dot ${alive ? '' : 'off'}`} />
          <b className="grow">{status == null ? 'Sin datos' : alive ? 'Activo' : 'Detenido'}</b>
        </div>
        {inboxStats && (
          <div className="grid3" style={{ marginTop: 12, textAlign: 'center' }}>
            <div><div className="display" style={{ fontWeight: 800, fontSize: 20 }}>{inboxStats.pending}</div><div className="tiny dim">pendientes</div></div>
            <div><div className="display" style={{ fontWeight: 800, fontSize: 20 }}>{inboxStats.processing}</div><div className="tiny dim">procesando</div></div>
            <div><div className="display" style={{ fontWeight: 800, fontSize: 20, color: inboxStats.errors ? 'var(--red)' : undefined }}>{inboxStats.errors}</div><div className="tiny dim">errores</div></div>
          </div>
        )}
      </Panel>
      {budget && (
        <Panel title="Presupuesto LLM" icon={Wallet}>
          <div className="row"><span className="display grow" style={{ fontWeight: 700, fontSize: 20 }}>US${Number(budget.spent_usd).toFixed(3)}</span><span className="small dim">/ {budget.daily_budget_usd} hoy</span></div>
          <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${pct * 100}%`, ...(pct > 0.8 ? { background: 'var(--red)' } : {}) }} /></div>
          <div className="tiny dim" style={{ marginTop: 6 }}>estado {budget.status}</div>
          {(budget.by_model || []).map((m, i) => <div key={i} className="row tiny mono" style={{ marginTop: 4 }}><span className="grow">{m.model || m.name}</span><span>{Number(m.spent_usd ?? m.cost ?? 0).toFixed(3)}</span></div>)}
        </Panel>
      )}
    </>
  )
}
