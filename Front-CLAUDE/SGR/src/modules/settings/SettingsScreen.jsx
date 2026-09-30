import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { User, Server, Download, MessageSquarePlus, Bell, Palette, Keyboard, Trash2, Pencil, Save, Check, Sparkles, Plug, Info, RefreshCw } from 'lucide-react'
import { useUI, toast } from '../../store/ui'
import { get, post, patch, del, apiUrl, getApiBase, setApiBase } from '../../lib/api'
import { Panel, Seg, Switch, Field, ConfirmButton, Loader, Stagger, Item } from '../../components/ui'
import { relativeTime } from '../../lib/dates'

const PALETTES = [
  { id: 'nebula', label: 'Nébula', colors: ['#0d1030', '#9d4bff', '#ff2e97', '#00f0ff'] },
  { id: 'synthwave', label: 'Synthwave', colors: ['#22093a', '#ff2e97', '#ff8af2', '#ffb800'] },
  { id: 'artico', label: 'Ártico', colors: ['#0a2236', '#00f0ff', '#4d7cff', '#e8f7ff'] },
  { id: 'toxic', label: 'Toxic', colors: ['#0a2210', '#b4ff39', '#2effa8', '#f9f871'] },
]

export default function SettingsScreen() {
  return (
    <div className="mod-scroll" style={{ padding: 16, alignItems: 'center' }}>
      <Stagger style={{ width: 'min(1100px, 100%)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Perfil />
        <Apariencia />
        <Estado />
        <Avisos />
        <Conexion />
        <Feedback />
        <Atajos />
      </Stagger>
    </div>
  )
}

function Perfil() {
  const { profile, saveProfile } = useUI()
  const [n, setN] = useState(profile.nombre || '')
  useEffect(() => setN(profile.nombre || ''), [profile.nombre])
  return (
    <Panel title="Perfil" icon={User}>
      <Field label="Nombre para mostrar">
        <div className="row">
          <input className="input" value={n} onChange={(e) => setN(e.target.value)} placeholder="¿Cómo te llamo?" />
          <button className="btn primary sm" disabled={n === profile.nombre} onClick={() => saveProfile(n.trim())}><Save size={14} /></button>
        </div>
      </Field>
      <div className="small muted" style={{ marginTop: 10 }}>Se guarda en la base de SGR y lo usa todo el sistema.</div>
    </Panel>
  )
}

function Apariencia() {
  const { prefs, setPref } = useUI()
  return (
    <Panel title="Apariencia" icon={Palette}>
      <div className="lbl" style={{ marginBottom: 8 }}>Paleta de fondo</div>
      <div className="grid2" style={{ gap: 10 }}>
        {PALETTES.map((p) => (
          <motion.button
            key={p.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setPref('palette', p.id)}
            className="glass"
            style={{ padding: 10, borderRadius: 14, cursor: 'pointer', textAlign: 'left', border: prefs.palette === p.id ? '1.5px solid var(--a1)' : '1px solid var(--line)', boxShadow: prefs.palette === p.id ? '0 0 20px -6px var(--a1)' : 'none' }}
          >
            <div style={{ height: 34, borderRadius: 9, background: `linear-gradient(120deg, ${p.colors[0]} 10%, ${p.colors[1]} 45%, ${p.colors[2]} 75%, ${p.colors[3]})`, marginBottom: 6 }} />
            <div className="row small"><span className="grow">{p.label}</span>{prefs.palette === p.id && <Check size={14} style={{ color: 'var(--a1)' }} />}</div>
          </motion.button>
        ))}
      </div>
      <div className="hr" />
      <Field label="Intensidad de efectos">
        <Seg id="fx" value={prefs.effects} onChange={(v) => setPref('effects', v)} options={[{ id: 'full', label: 'Máxima' }, { id: 'lite', label: 'Liviana' }, { id: 'off', label: 'Sin animación' }]} />
      </Field>
      <div className="col" style={{ gap: 10, marginTop: 12 }}>
        <label className="row small"><Switch on={prefs.particles} onChange={(v) => setPref('particles', v)} /> Constelación de partículas</label>
        <label className="row small"><Switch on={prefs.cursorGlow} onChange={(v) => setPref('cursorGlow', v)} /> Halo que sigue al cursor</label>
      </div>
      <div className="tiny dim" style={{ marginTop: 10 }}>Cada módulo tiene su propio acento de color: violeta Bóveda, ámbar Finanzas, cian Agenda, lima Hábitos.</div>
    </Panel>
  )
}

function Estado() {
  const [s, setS] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => { setErr(null); get('/settings/status').then(setS).catch((e) => setErr(e.message)) }
  useEffect(load, [])
  return (
    <Panel title="Datos y sincronización" icon={Server} actions={<button className="iconbtn sm" onClick={load}><RefreshCw size={14} /></button>}>
      {err ? <div className="small" style={{ color: 'var(--amber)' }}>{err}</div> : !s ? <Loader /> : (
        <>
          <div className="row"><span className="chip">v{s.version}</span><span className="chip">{s.source === 'local' ? '🖥 local' : `☁ ${s.source}`}</span>{s.homelab_configured && <span className="chip">homelab configurado</span>}</div>
          <div className="grid3" style={{ marginTop: 12, gap: 8 }}>
            {Object.entries(s.counts || {}).map(([k, v]) => (
              <div key={k} className="glass" style={{ padding: 10, borderRadius: 12, textAlign: 'center' }}>
                <div className="display" style={{ fontWeight: 800, fontSize: 18 }}>{v}</div>
                <div className="tiny dim">{k}</div>
              </div>
            ))}
          </div>
          <div className="tiny dim mono" style={{ marginTop: 10, wordBreak: 'break-all' }}>{s.db_path}</div>
          {s.sync ? (
            <div className="small" style={{ marginTop: 8 }}>
              Última sincronización: <b>{s.sync.resultado || s.sync.status || s.sync.result || 'registrada'}</b> {s.sync.fecha || s.sync.at || s.sync.timestamp ? `· ${relativeTime(s.sync.fecha || s.sync.at || s.sync.timestamp)}` : ''}
            </div>
          ) : <div className="small dim" style={{ marginTop: 8 }}>Sin sincronizaciones registradas.</div>}
          {s.backup_available && (
            <a className="btn sm" style={{ marginTop: 12, width: '100%' }} href={apiUrl('/settings/backup')} download>
              <Download size={14} /> Descargar copia (DB + adjuntos)
            </a>
          )}
          <div className="tiny dim" style={{ marginTop: 8 }}>El vault de Bóveda (archivos Markdown) necesita su propio respaldo.</div>
        </>
      )}
    </Panel>
  )
}

function Avisos() {
  const { prefs, setPref } = useUI()
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const enable = async (v) => {
    if (v && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p !== 'granted') return toast('El navegador no dio permiso para avisos', 'warn')
    }
    setPref('notifyBrowser', v)
  }
  return (
    <Panel title="Avisos" icon={Bell}>
      <label className="row small"><Switch on={prefs.notifyBrowser && perm === 'granted'} onChange={enable} /> Notificaciones del navegador para eventos</label>
      <Field label="Anticipación" style={{ marginTop: 12 }}>
        <Seg id="notif-min" value={prefs.notifyMinutes} onChange={(v) => setPref('notifyMinutes', v)} options={[5, 15, 30, 60, 120].map((m) => ({ id: m, label: `${m}′` }))} />
      </Field>
      <div className="tiny dim" style={{ marginTop: 10 }}>Estado del permiso: {perm}. La campana del topbar consulta la agenda cada minuto.</div>
    </Panel>
  )
}

function Conexion() {
  const [v, setV] = useState(getApiBase())
  const [test, setTest] = useState(null)
  const probar = async () => {
    setTest('...')
    try {
      const m = await get('/meta')
      setTest(`OK · ${Object.entries(m.counts || {}).map(([k, x]) => `${x} ${k}`).join(' · ')}`)
      useUI.getState().setOnline(true)
    } catch (e) { setTest(`✕ ${e.message}`) }
  }
  return (
    <Panel title="Conexión con la API" icon={Plug}>
      <Field label="Base URL">
        <div className="row">
          <input className="input mono" value={v} onChange={(e) => setV(e.target.value)} />
          <button className="btn sm" onClick={() => { setApiBase(v === '/api' ? '' : v); toast('Base guardada — recargando'); setTimeout(() => location.reload(), 600) }}><Save size={14} /></button>
        </div>
      </Field>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={probar}><Sparkles size={14} /> Probar</button>
        <span className="small muted grow">{test}</span>
      </div>
      <div className="tiny dim" style={{ marginTop: 10 }}>Por defecto <span className="mono">/api</span> pasa por el proxy de Vite hacia <span className="mono">SGR_API_TARGET</span> (127.0.0.1:8765).</div>
    </Panel>
  )
}

function Feedback() {
  const [list, setList] = useState(null)
  const [t, setT] = useState('')
  const [edit, setEdit] = useState(null)
  const load = () => get('/feedback').then(setList).catch(() => setList([]))
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!t.trim()) return
    try { await post('/feedback', { contenido: t.trim() }); setT(''); load(); toast('Gracias ✦') } catch (e) { toast(e.message, 'error') }
  }
  return (
    <Panel title="Feedback e ideas" icon={MessageSquarePlus}>
      <div className="row">
        <textarea className="textarea" rows={2} style={{ minHeight: 50 }} placeholder="Algo que mejorar, un bug, una idea…" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="btn primary sm" onClick={add}><Save size={14} /></button>
      </div>
      <div className="list" style={{ marginTop: 10 }}>
        {!list ? <Loader /> : list.length === 0 ? <div className="small dim">Sin entradas.</div> : list.map((f) => (
          <div key={f.id} className="li" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            {edit?.id === f.id ? (
              <>
                <textarea className="textarea grow" rows={2} style={{ minHeight: 44 }} value={edit.contenido} onChange={(e) => setEdit({ ...edit, contenido: e.target.value })} />
                <button className="iconbtn sm" onClick={async () => { try { await patch(`/feedback/${f.id}`, { contenido: edit.contenido }); setEdit(null); load() } catch (e) { toast(e.message, 'error') } }}><Check size={13} /></button>
              </>
            ) : (
              <>
                <span className="grow small">{f.contenido}<div className="tiny dim">{relativeTime(f.fecha)}</div></span>
                <span className="li-actions">
                  <button className="iconbtn sm" onClick={() => setEdit(f)}><Pencil size={12} /></button>
                  <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={async () => { await del(`/feedback/${f.id}`).catch(() => {}); load() }} icon={<Trash2 size={12} />} />
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function Atajos() {
  const rows = [
    ['Ctrl + K', 'Paleta de comandos / búsqueda global'],
    ['Ctrl + Enter', 'Captura rápida (o guardar dentro de un modal)'],
    ['N', 'Nuevo movimiento (Finanzas)'],
    ['1 – 5', 'Cambiar pestaña (Finanzas)'],
    ['← →', 'Mes anterior / siguiente (Dashboard)'],
    ['Flechas · 1 · 2 · ⌫', 'Navegar y marcar la grilla de Hábitos'],
    ['Arrastrar tarea', 'Bloquear tiempo en Agenda Hoy/Semana'],
    ['Rueda del mouse', 'Zoom en el grafo · cambiar mes en Agenda'],
    ['Esc', 'Cerrar modal'],
  ]
  return (
    <Panel title="Atajos" icon={Keyboard}>
      <div className="list">
        {rows.map(([k, d]) => (
          <Item key={k} className="row small" style={{ padding: '6px 4px' }}>
            <kbd style={{ minWidth: 120, textAlign: 'center' }}>{k}</kbd>
            <span className="muted">{d}</span>
          </Item>
        ))}
      </div>
      <div className="row tiny dim" style={{ marginTop: 10 }}><Info size={12} /> SGR · Nexus — frontend alternativo para la API de SGR.</div>
    </Panel>
  )
}
