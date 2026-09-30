import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, FileText, Link2, Image, Receipt, CalendarDays, CheckSquare, Sprout, Sparkles, Upload, X } from 'lucide-react'
import { Modal, Tabs, Field, Swatches, Seg, Switch } from '../components/ui'
import { useUI, toast } from '../store/ui'
import { useBoveda, buildTree, detectTipo, isBasura } from '../store/boveda'
import { useFin } from '../store/fin'
import { useAgenda } from '../store/agenda'
import { useHabitos } from '../store/habitos'
import { useJarvis } from '../store/jarvis'
import { toISODate, DIAS_CORTO } from '../lib/dates'

const LAST_CAT = 'sgr-nexus-lastcat'

export function flattenTree(categorias) {
  const out = []
  const walk = (nodes) => nodes.forEach((n) => { if (!isBasura(n)) { out.push(n); walk(n.children) } })
  walk(buildTree(categorias))
  return out
}

export function CategoriaSelect({ value, onChange, className = 'select' }) {
  const categorias = useBoveda((s) => s.categorias)
  const flat = useMemo(() => flattenTree(categorias), [categorias])
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
      {flat.map((c) => (
        <option key={c.id} value={c.id}>
          {'  '.repeat(c.depth)}{c.depth ? '└ ' : ''}{c.icono ? `${c.icono} ` : ''}{c.nombre}
        </option>
      ))}
    </select>
  )
}

export default function CaptureModal() {
  const capture = useUI((s) => s.capture)
  const close = useUI((s) => s.closeCapture)
  const openMov = useFin((s) => s.openMov)
  const openEvento = useAgenda((s) => s.openEvento)
  const [tab, setTab] = useState('nota')

  useEffect(() => {
    if (capture) setTab(capture.tab || 'nota')
  }, [capture])

  const switchTab = (t) => {
    if (t === 'mov') { close(); openMov({}); return }
    if (t === 'evento') { close(); openEvento({}); return }
    setTab(t)
  }

  return (
    <Modal open={!!capture} onClose={close} title="Captura rápida" icon={Zap}>
      <Tabs
        id="capture"
        value={tab}
        onChange={switchTab}
        tabs={[
          { id: 'nota', label: 'Nota', icon: FileText },
          { id: 'mov', label: 'Movimiento', icon: Receipt },
          { id: 'evento', label: 'Evento', icon: CalendarDays },
          { id: 'tarea', label: 'Tarea', icon: CheckSquare },
          { id: 'habito', label: 'Hábito', icon: Sprout },
          { id: 'jarvis', label: 'Jarvis', icon: Sparkles },
        ]}
      />
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="col" style={{ gap: 14 }}>
          {tab === 'nota' && <NotaForm opts={capture} onDone={close} />}
          {tab === 'tarea' && <TareaForm onDone={close} />}
          {tab === 'habito' && <HabitoForm onDone={close} />}
          {tab === 'jarvis' && <JarvisForm onDone={close} />}
        </motion.div>
      </AnimatePresence>
    </Modal>
  )
}

function useCtrlEnter(fn) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [fn])
}

function NotaForm({ opts, onDone }) {
  const categorias = useBoveda((s) => s.categorias)
  const crearHoja = useBoveda((s) => s.crearHoja)
  const subir = useBoveda((s) => s.subirArchivo)
  const select = useBoveda((s) => s.select)
  const nav = useNavigate()
  const [texto, setTexto] = useState('')
  const [apuntes, setApuntes] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [cat, setCat] = useState(() => {
    if (opts?.categoriaId) return opts.categoriaId
    try { return Number(localStorage.getItem(LAST_CAT)) || null } catch { return null }
  })
  useEffect(() => {
    if (!cat || !categorias.some((c) => c.id === cat)) {
      const def = categorias.find((c) => /sin categorizar/i.test(c.nombre)) || categorias[0]
      if (def) setCat(def.id)
    }
  }, [categorias]) // eslint-disable-line react-hooks/exhaustive-deps
  const tipo = file ? 'foto' : detectTipo(texto)

  const pick = (f) => {
    if (!f || !f.type.startsWith('image/')) return toast('Solo imágenes', 'warn')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const save = async () => {
    if (busy || !cat) return
    if (!texto.trim() && !file) return toast('Escribí algo o soltá una imagen', 'warn')
    setBusy(true)
    try {
      localStorage.setItem(LAST_CAT, String(cat))
    } catch { /* noop */ }
    let payload
    if (file) {
      try {
        const url = await subir(file)
        const titulo = texto.trim() || file.name.replace(/\.[^.]+$/, '')
        payload = { contenido: titulo, categoria_id: cat, tipo: 'foto', apuntes: `<p><img src="${url}" alt="${titulo}"></p>${apuntes ? `<p>${escapeHtml(apuntes)}</p>` : ''}` }
      } catch (e) {
        setBusy(false)
        return toast(`No se pudo subir la imagen: ${e.message}`, 'error')
      }
    } else {
      payload = { contenido: texto.trim(), categoria_id: cat, tipo, apuntes: apuntes ? `<p>${escapeHtml(apuntes).replace(/\n/g, '<br>')}</p>` : undefined }
    }
    const h = await crearHoja(payload)
    setBusy(false)
    if (h) {
      toast('Guardado en la Bóveda ✦')
      onDone()
      select(h.id)
      nav('/')
    }
  }
  useCtrlEnter(save)

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
        onPaste={(e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) pick(f) }}
        style={{ position: 'relative' }}
      >
        <textarea
          autoFocus
          className="textarea"
          rows={4}
          placeholder="Pegá un link, escribí una idea o soltá una imagen…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          style={{ fontSize: 16, minHeight: 110, borderColor: drag ? 'var(--a2)' : undefined }}
        />
        <motion.span className="chip" style={{ position: 'absolute', right: 10, bottom: 12 }} key={tipo} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {tipo === 'link' ? <Link2 size={12} /> : tipo === 'foto' ? <Image size={12} /> : <FileText size={12} />}
          {tipo}
        </motion.span>
      </div>
      {preview && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <img src={preview} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 12, boxShadow: '0 0 20px -6px var(--a1)' }} />
          <button className="iconbtn sm" onClick={() => { setFile(null); setPreview(null) }}><X size={14} /></button>
        </div>
      )}
      <div className="grid2">
        <Field label="Categoría">
          <CategoriaSelect value={cat} onChange={setCat} />
        </Field>
        <Field label="Imagen">
          <label className="btn" style={{ width: '100%' }}>
            <Upload size={15} /> {file ? file.name.slice(0, 22) : 'Subir foto'}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </Field>
      </div>
      <Field label="Apuntes (opcional)">
        <textarea className="textarea" rows={2} value={apuntes} onChange={(e) => setApuntes(e.target.value)} placeholder="Contexto, por qué lo guardás…" />
      </Field>
      <div className="row">
        <span className="small dim grow"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> para guardar</span>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar nota'}</button>
      </div>
    </>
  )
}

function TareaForm({ onDone }) {
  const listas = useAgenda((s) => s.listas)
  const crear = useAgenda((s) => s.crearTarea)
  const [t, setT] = useState({ titulo: '', fecha_opcional: toISODate(), hora_opcional: '', lista_id: '' })
  const save = async () => {
    if (!t.titulo.trim()) return
    const r = await crear({ titulo: t.titulo.trim(), fecha_opcional: t.fecha_opcional || null, hora_opcional: t.hora_opcional || null, lista_id: t.lista_id ? Number(t.lista_id) : null })
    if (r) { toast('Tarea creada'); onDone() }
  }
  useCtrlEnter(save)
  return (
    <>
      <input autoFocus className="input big" placeholder="¿Qué hay que hacer?" value={t.titulo} onChange={(e) => setT({ ...t, titulo: e.target.value })} />
      <div className="grid3">
        <Field label="Fecha"><input type="date" className="input" value={t.fecha_opcional} onChange={(e) => setT({ ...t, fecha_opcional: e.target.value })} /></Field>
        <Field label="Hora"><input type="time" className="input" value={t.hora_opcional} onChange={(e) => setT({ ...t, hora_opcional: e.target.value })} /></Field>
        <Field label="Lista">
          <select className="select" value={t.lista_id} onChange={(e) => setT({ ...t, lista_id: e.target.value })}>
            <option value="">Sin lista</option>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Field>
      </div>
      <div className="row"><span className="grow" /><button className="btn primary" onClick={save}>Crear tarea</button></div>
    </>
  )
}

function HabitoForm({ onDone }) {
  const crear = useHabitos((s) => s.crear)
  const [h, setH] = useState({ nombre: '', color: '#b4ff39', frecuencia_tipo: 'diario', dias: [1, 2, 3, 4, 5] })
  const save = async () => {
    if (!h.nombre.trim()) return
    const r = await crear({ nombre: h.nombre.trim(), color: h.color, frecuencia_tipo: h.frecuencia_tipo, dias_semana: h.frecuencia_tipo === 'semanal' ? JSON.stringify(h.dias) : null })
    if (r) onDone()
  }
  useCtrlEnter(save)
  return (
    <>
      <input autoFocus className="input big" placeholder="Nombre del hábito" value={h.nombre} onChange={(e) => setH({ ...h, nombre: e.target.value })} />
      <Field label="Color"><Swatches value={h.color} onChange={(color) => setH({ ...h, color })} /></Field>
      <Field label="Frecuencia">
        <Seg id="cap-frec" value={h.frecuencia_tipo} onChange={(v) => setH({ ...h, frecuencia_tipo: v })} options={[{ id: 'diario', label: 'Diario' }, { id: 'semanal', label: 'Días específicos' }]} />
      </Field>
      {h.frecuencia_tipo === 'semanal' && (
        <div className="row wrap gap6">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} className={`chip click ${h.dias.includes(d) ? 'on' : ''}`} onClick={() => setH({ ...h, dias: h.dias.includes(d) ? h.dias.filter((x) => x !== d) : [...h.dias, d] })}>
              {DIAS_CORTO[d]}
            </button>
          ))}
        </div>
      )}
      <div className="row"><span className="grow" /><button className="btn primary" onClick={save}>Crear hábito</button></div>
    </>
  )
}

function JarvisForm({ onDone }) {
  const capture = useJarvis((s) => s.capture)
  const [c, setC] = useState('')
  const [local, setLocal] = useState(false)
  const [conf, setConf] = useState(false)
  const save = async () => {
    if (!c.trim()) return
    const r = await capture(c.trim(), { local_only: local, confidential: conf })
    if (r) onDone()
  }
  useCtrlEnter(save)
  return (
    <>
      <textarea autoFocus className="textarea" rows={5} placeholder="Algo que Jarvis debería recordar: un dato, una decisión, una persona…" value={c} onChange={(e) => setC(e.target.value)} style={{ fontSize: 15 }} />
      <div className="row wrap gap16">
        <label className="row small"><Switch on={local} onChange={setLocal} /> Solo local (sin LLM externo)</label>
        <label className="row small"><Switch on={conf} onChange={setConf} /> Confidencial</label>
      </div>
      <div className="row"><span className="grow" /><button className="btn primary" onClick={save}><Sparkles size={15} /> Enviar a Jarvis</button></div>
    </>
  )
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
