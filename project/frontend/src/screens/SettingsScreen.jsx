import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Bell, Check, ChevronRight, Database, Download, Globe2, HardDrive, Info, MessageSquareText, Palette, Pencil, Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { API_URL } from '../config'
import { THEMES } from '../utils/themes'
import './SettingsScreen.css'

const COPY = {
  es: {
    eyebrow: 'CENTRO DE CONTROL · SGR', title: 'Ajustes', subtitle: 'Tus datos, tus preferencias y el estado real de la aplicación.', back: 'Volver a SGR',
    data: 'Datos', profile: 'Perfil e idioma', alerts: 'Avisos', appearance: 'Apariencia', feedback: 'Feedback', about: 'Información',
    dataTitle: 'Tus datos, a la vista.', dataIntro: 'Consultá qué copia usa SGR y llevate un respaldo cuando lo necesites.',
    connected: 'Aplicación disponible', unavailable: 'Sin conexión con la aplicación', local: 'Esta computadora', server: 'Servidor', source: 'Origen de los datos',
    homelab: 'Sincronización con homelab', configured: 'Configurada', unconfigured: 'No configurada', lastSync: 'Última sincronización', never: 'Sin registro todavía', pull: 'Descarga desde homelab', push: 'Subida al homelab', success: 'Completada', failed: 'Falló',
    refresh: 'Actualizar estado', checking: 'Comprobando conexión', backup: 'Descargar respaldo', backupHint: 'Incluye las bases internas y archivos cargados. El vault externo va aparte.', backupRemote: 'El respaldo se descarga desde la aplicación local.', counts: 'Contenido de esta copia', hojas: 'Hojas', movimientos: 'Movimientos', eventos: 'Eventos', habitos: 'Hábitos',
    profileTitle: 'Cómo querés aparecer', profileIntro: 'El nombre se guarda con los datos de SGR y aparece en la barra superior.', name: 'Nombre para mostrar', namePlaceholder: 'Tu nombre', saveName: 'Guardar nombre', savedName: 'Nombre guardado', language: 'Idioma de la interfaz', languageHint: 'Algunos módulos todavía contienen textos en español.',
    alertsTitle: 'Avisos de Agenda', alertsIntro: 'Elegí si el navegador puede avisarte de eventos próximos mientras SGR está abierto.', browserPermission: 'Permiso del navegador', granted: 'Permitido', denied: 'Bloqueado', undecided: 'Sin solicitar', unsupported: 'No disponible', enableAlerts: 'Recordatorios de eventos', enableHint: 'Se muestran en esta computadora cuando SGR está abierto.', before: 'Avisar con anticipación', minutes: 'minutos', permissionDenied: 'El navegador bloqueó las notificaciones. Cambiá el permiso desde el icono junto a la dirección de SGR.',
    appearanceTitle: 'Apariencia a tu manera', appearanceIntro: 'Los colores y la tipografía se ajustan desde el panel visual de cada módulo.', currentLook: 'Aspecto de Bóveda', customize: 'Personalizar apariencia', shortcut: 'También podés abrir el panel con Ctrl + M.',
    feedbackTitle: 'Ideas, problemas y notas', feedbackIntro: 'Todo el feedback guardado en SGR, con espacio para corregirlo o eliminarlo.', newFeedback: 'Nuevo feedback', feedbackPlaceholder: 'Escribí una idea o algo que quieras mejorar…', add: 'Agregar feedback', history: 'Historial', all: 'Todos', empty: 'Todavía no hay feedback.', feedbackUnavailable: 'No se pudo cargar el feedback. Revisá la conexión y volvé a entrar.', edit: 'Editar', remove: 'Eliminar', cancel: 'Cancelar', save: 'Guardar cambios', confirmDelete: '¿Eliminar este feedback?', confirm: 'Sí, eliminar', feedbackAdded: 'Feedback agregado', feedbackUpdated: 'Feedback actualizado', feedbackDeleted: 'Feedback eliminado',
    aboutTitle: 'Esta instalación', aboutIntro: 'Datos útiles para identificar la copia de SGR que estás usando.', version: 'Versión de la API', location: 'Ubicación de la base de datos',
  },
  en: {
    eyebrow: 'CONTROL CENTER · SGR', title: 'Settings', subtitle: 'Your data, preferences, and the actual state of the app.', back: 'Back to SGR',
    data: 'Data', profile: 'Profile & language', alerts: 'Alerts', appearance: 'Appearance', feedback: 'Feedback', about: 'Information',
    dataTitle: 'Your data, in plain sight.', dataIntro: 'See which copy SGR uses and download a backup whenever you need one.',
    connected: 'App available', unavailable: 'App connection unavailable', local: 'This computer', server: 'Server', source: 'Data source',
    homelab: 'Homelab sync', configured: 'Configured', unconfigured: 'Not configured', lastSync: 'Last sync', never: 'No record yet', pull: 'Downloaded from homelab', push: 'Uploaded to homelab', success: 'Completed', failed: 'Failed',
    refresh: 'Refresh status', checking: 'Checking connection', backup: 'Download backup', backupHint: 'Includes internal databases and uploaded files. The external vault is separate.', backupRemote: 'Backups can be downloaded from the local app.', counts: 'Contents of this copy', hojas: 'Notes', movimientos: 'Transactions', eventos: 'Events', habitos: 'Habits',
    profileTitle: 'How you appear', profileIntro: 'Your name is stored with SGR data and appears in the top bar.', name: 'Display name', namePlaceholder: 'Your name', saveName: 'Save name', savedName: 'Name saved', language: 'Interface language', languageHint: 'Some modules still contain Spanish text.',
    alertsTitle: 'Agenda alerts', alertsIntro: 'Choose whether your browser can notify you about upcoming events while SGR is open.', browserPermission: 'Browser permission', granted: 'Allowed', denied: 'Blocked', undecided: 'Not requested', unsupported: 'Unavailable', enableAlerts: 'Event reminders', enableHint: 'Shown on this computer while SGR is open.', before: 'Notify in advance', minutes: 'minutes', permissionDenied: 'Your browser blocked notifications. Change permission from the icon next to the SGR address.',
    appearanceTitle: 'Make it yours', appearanceIntro: 'Colors and typography are set from each module’s visual panel.', currentLook: 'Vault appearance', customize: 'Customize appearance', shortcut: 'You can also open the panel with Ctrl + M.',
    feedbackTitle: 'Ideas, issues and notes', feedbackIntro: 'All feedback saved in SGR, ready to edit or remove.', newFeedback: 'New feedback', feedbackPlaceholder: 'Write an idea or something you want to improve…', add: 'Add feedback', history: 'History', all: 'All', empty: 'No feedback yet.', feedbackUnavailable: 'Feedback could not be loaded. Check the connection and open this section again.', edit: 'Edit', remove: 'Delete', cancel: 'Cancel', save: 'Save changes', confirmDelete: 'Delete this feedback?', confirm: 'Yes, delete', feedbackAdded: 'Feedback added', feedbackUpdated: 'Feedback updated', feedbackDeleted: 'Feedback deleted',
    aboutTitle: 'This installation', aboutIntro: 'Details to identify the copy of SGR you are using.', version: 'API version', location: 'Database location',
  },
}

const NAV = [
  { id: 'data', icon: Database, number: '01' }, { id: 'profile', icon: Globe2, number: '02' },
  { id: 'alerts', icon: Bell, number: '03' }, { id: 'appearance', icon: Palette, number: '04' },
  { id: 'feedback', icon: MessageSquareText, number: '05' }, { id: 'about', icon: Info, number: '06' },
]

function formatDate(date, language) {
  if (!date) return ''
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleString(language === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const lang = useStore(s => s.lang)
  const setLang = useStore(s => s.setLang)
  const userName = useStore(s => s.userName)
  const setUserName = useStore(s => s.setUserName)
  const theme = useStore(s => s.theme)
  const feedbackList = useStore(s => s.feedbackList)
  const fetchFeedback = useStore(s => s.fetchFeedback)
  const addFeedback = useStore(s => s.addFeedback)
  const updateFeedback = useStore(s => s.updateFeedback)
  const deleteFeedback = useStore(s => s.deleteFeedback)
  const showToast = useStore(s => s.showToast)
  const notificationsEnabled = useStore(s => s.agendaNotificationsEnabled)
  const setNotificationsEnabled = useStore(s => s.setAgendaNotificationsEnabled)
  const reminderMinutes = useStore(s => s.agendaReminderMinutes)
  const setReminderMinutes = useStore(s => s.setAgendaReminderMinutes)
  const copy = COPY[lang] || COPY.es

  const [tab, setTab] = useState('data')
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [nameDraft, setNameDraft] = useState(userName)
  const [nameSaving, setNameSaving] = useState(false)
  const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'unsupported')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackLoadError, setFeedbackLoadError] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { setNameDraft(userName) }, [userName])
  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const response = await fetch(`${API_URL}/settings/status`)
      if (!response.ok) throw new Error('status unavailable')
      setStatus(await response.json())
      setStatusError(false)
    } catch { setStatusError(true) }
    finally { setStatusLoading(false) }
  }, [])
  useEffect(() => { refreshStatus() }, [refreshStatus])
  useEffect(() => {
    if (tab !== 'feedback') return
    let active = true
    fetchFeedback().then(data => { if (active) setFeedbackLoadError(data === null) })
    return () => { active = false }
  }, [tab, fetchFeedback])

  const sync = status?.sync
  const feedbackSorted = [...feedbackList].sort((a, b) => (b.id || 0) - (a.id || 0))

  async function saveName(event) {
    event.preventDefault()
    if (nameSaving || nameDraft.trim() === userName) return
    setNameSaving(true)
    const ok = await setUserName(nameDraft)
    setNameSaving(false)
    if (ok) showToast(copy.savedName)
  }
  async function changeNotifications() {
    if (notificationsEnabled) { setNotificationsEnabled(false); return }
    if (!('Notification' in window)) return
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') setNotificationsEnabled(true)
  }
  async function submitFeedback(event) {
    event.preventDefault()
    if (!feedbackDraft.trim() || feedbackBusy) return
    setFeedbackBusy(true)
    const item = await addFeedback(feedbackDraft.trim())
    setFeedbackBusy(false)
    if (item) { setFeedbackDraft(''); showToast(copy.feedbackAdded) }
  }
  async function saveFeedback(id) {
    if (!editDraft.trim() || feedbackBusy) return
    setFeedbackBusy(true)
    const item = await updateFeedback(id, editDraft.trim())
    setFeedbackBusy(false)
    if (item) { setEditingId(null); showToast(copy.feedbackUpdated) }
  }
  async function removeFeedback(id) {
    if (feedbackBusy) return
    setFeedbackBusy(true)
    const ok = await deleteFeedback(id)
    setFeedbackBusy(false)
    if (ok) { setDeletingId(null); showToast(copy.feedbackDeleted) }
  }

  return <div className="settings-page"><div className="settings-shell">
    <header className="settings-header"><button type="button" className="settings-back" onClick={() => navigate('/')}><ArrowLeft size={15} />{copy.back}</button><span className="settings-brand">SGR <span>/</span> CONTROL</span></header>
    <div className="settings-heading"><div><span className="settings-eyebrow">{copy.eyebrow}</span><h1>{copy.title}<span>.</span></h1><p>{copy.subtitle}</p></div><div className="settings-header-stamp" aria-hidden="true">S / 01</div></div>
    <div className="settings-layout"><nav className="settings-nav" aria-label={copy.title}>{NAV.map(({ id, icon: Icon, number }) => <button key={id} type="button" onClick={() => setTab(id)} className={`settings-nav-item ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'page' : undefined}><span className="settings-nav-number">{number}</span><Icon size={17} strokeWidth={1.8} /><span>{copy[id]}</span><ChevronRight className="settings-nav-arrow" size={14} /></button>)}</nav>
    <main className="settings-content" key={tab}><div className="settings-section-mark"><span>{NAV.find(item => item.id === tab).number} / 06</span><span>{copy[tab].toUpperCase()}</span></div>

    {tab === 'data' && <><div className="settings-intro"><h2>{copy.dataTitle}</h2><p>{copy.dataIntro}</p></div>
      <div className="settings-status-hero"><div className="settings-status-top"><span className={`settings-status-dot ${statusError ? 'is-error' : ''}`} />{statusError ? copy.unavailable : status ? copy.connected : copy.checking}<button type="button" onClick={refreshStatus} disabled={statusLoading} title={copy.refresh} aria-label={copy.refresh}><RefreshCw size={16} className={statusLoading ? 'settings-spinning' : ''} /></button></div><div className="settings-status-main"><div><span className="settings-overline">{copy.source}</span><strong>{status ? (status.source === 'local' ? copy.local : copy.server) : '—'}</strong></div><HardDrive size={42} strokeWidth={1.1} /></div></div>
      <div className="settings-card-grid"><div className="settings-card"><span className="settings-overline">{copy.homelab}</span><strong>{status?.homelab_configured ? copy.configured : copy.unconfigured}</strong><p>{sync ? `${sync.direction === 'push' ? copy.push : copy.pull} · ${sync.ok ? copy.success : copy.failed}` : copy.never}</p></div><div className="settings-card"><span className="settings-overline">{copy.lastSync}</span><strong>{sync ? formatDate(sync.at, lang) : '—'}</strong><p>{sync ? (sync.ok ? copy.success : copy.failed) : copy.never}</p></div></div>
      <div className="settings-card settings-backup-card"><div className="settings-backup-icon"><Download size={23} /></div><div><strong>{copy.backup}</strong><p>{status?.backup_available ? copy.backupHint : copy.backupRemote}</p></div>{status?.backup_available && <a className="settings-primary" href={`${API_URL}/settings/backup`}><Download size={15} />{copy.backup}</a>}</div>
      <div className="settings-counts"><span className="settings-overline">{copy.counts}</span><div>{['hojas', 'movimientos', 'eventos', 'habitos'].map(key => <div key={key}><strong>{status?.counts?.[key] ?? '—'}</strong><span>{copy[key]}</span></div>)}</div></div></>}

    {tab === 'profile' && <><div className="settings-intro"><h2>{copy.profileTitle}</h2><p>{copy.profileIntro}</p></div><form className="settings-card settings-form" onSubmit={saveName}><label htmlFor="settings-name">{copy.name}</label><div className="settings-inline"><input id="settings-name" value={nameDraft} onChange={event => setNameDraft(event.target.value)} placeholder={copy.namePlaceholder} maxLength={80} /><button className="settings-primary" disabled={nameSaving || nameDraft.trim() === userName}><Save size={15} />{copy.saveName}</button></div></form><div className="settings-card settings-form"><span className="settings-field-label">{copy.language}</span><div className="settings-choice-row">{[['es', 'Español'], ['en', 'English']].map(([code, label]) => <button key={code} type="button" className={`settings-choice ${lang === code ? 'is-selected' : ''}`} onClick={() => setLang(code)}>{label}{lang === code && <Check size={15} />}</button>)}</div><p className="settings-hint">{copy.languageHint}</p></div></>}

    {tab === 'alerts' && <><div className="settings-intro"><h2>{copy.alertsTitle}</h2><p>{copy.alertsIntro}</p></div><div className="settings-card settings-alert-card"><span className="settings-overline">{copy.browserPermission}</span><strong><span className={`settings-small-dot ${permission === 'granted' ? 'is-good' : ''}`} />{permission === 'granted' ? copy.granted : permission === 'denied' ? copy.denied : permission === 'unsupported' ? copy.unsupported : copy.undecided}</strong></div><div className="settings-card settings-toggle-card"><div><strong>{copy.enableAlerts}</strong><p>{copy.enableHint}</p></div><button type="button" className={`settings-switch ${notificationsEnabled ? 'is-on' : ''}`} role="switch" aria-checked={notificationsEnabled} aria-label={copy.enableAlerts} onClick={changeNotifications} disabled={permission === 'unsupported'}><span /></button></div>{permission === 'denied' && <p className="settings-note">{copy.permissionDenied}</p>}<div className="settings-card settings-form"><label htmlFor="settings-reminder">{copy.before}</label><select id="settings-reminder" value={reminderMinutes} onChange={event => setReminderMinutes(event.target.value)}>{[5, 15, 30, 60].map(value => <option key={value} value={value}>{value} {copy.minutes}</option>)}</select></div></>}

    {tab === 'appearance' && <><div className="settings-intro"><h2>{copy.appearanceTitle}</h2><p>{copy.appearanceIntro}</p></div><div className="settings-appearance-card"><div className="settings-appearance-orbit" /><span className="settings-overline">{copy.currentLook}</span><strong>{THEMES[theme]?.name || theme}</strong><button type="button" className="settings-primary" onClick={() => window.dispatchEvent(new Event('sgr:open-tweaks'))}>{copy.customize}<ArrowUpRight size={16} /></button></div><p className="settings-hint">{copy.shortcut}</p></>}

    {tab === 'feedback' && <><div className="settings-intro"><h2>{copy.feedbackTitle}</h2><p>{copy.feedbackIntro}</p></div><form className="settings-card settings-feedback-compose" onSubmit={submitFeedback}><label htmlFor="settings-feedback">{copy.newFeedback}</label><textarea id="settings-feedback" value={feedbackDraft} onChange={event => setFeedbackDraft(event.target.value)} placeholder={copy.feedbackPlaceholder} rows={4} /><button type="submit" className="settings-primary" disabled={!feedbackDraft.trim() || feedbackBusy}><Plus size={16} />{copy.add}</button></form><div className="settings-feedback-heading"><span>{copy.history}</span><span>{copy.all} / {feedbackSorted.length}</span></div>{feedbackLoadError && <p className="settings-note">{copy.feedbackUnavailable}</p>}{feedbackSorted.length === 0 && !feedbackLoadError ? <div className="settings-empty">{copy.empty}</div> : <div className="settings-feedback-list">{feedbackSorted.map(item => <article className="settings-feedback-item" key={item.id}>{editingId === item.id ? <><textarea aria-label={copy.edit} value={editDraft} onChange={event => setEditDraft(event.target.value)} rows={4} /><div className="settings-item-actions"><button type="button" onClick={() => setEditingId(null)}><X size={14} />{copy.cancel}</button><button type="button" className="is-accent" disabled={!editDraft.trim() || feedbackBusy} onClick={() => saveFeedback(item.id)}><Check size={14} />{copy.save}</button></div></> : deletingId === item.id ? <><p className="settings-confirm">{copy.confirmDelete}</p><p>{item.contenido}</p><div className="settings-item-actions"><button type="button" onClick={() => setDeletingId(null)}>{copy.cancel}</button><button type="button" className="is-danger" disabled={feedbackBusy} onClick={() => removeFeedback(item.id)}><Trash2 size={14} />{copy.confirm}</button></div></> : <><p>{item.contenido}</p><div className="settings-item-footer"><time>{formatDate(item.fecha, lang)}</time><div className="settings-item-actions"><button type="button" onClick={() => { setEditingId(item.id); setEditDraft(item.contenido); setDeletingId(null) }}><Pencil size={14} />{copy.edit}</button><button type="button" onClick={() => { setDeletingId(item.id); setEditingId(null) }}><Trash2 size={14} />{copy.remove}</button></div></div></>}</article>)}</div>}</>}

    {tab === 'about' && <><div className="settings-intro"><h2>{copy.aboutTitle}</h2><p>{copy.aboutIntro}</p></div><div className="settings-card settings-about-row"><ShieldCheck size={21} /><div><span>{copy.version}</span><strong>{status?.version || '—'}</strong></div></div><div className="settings-card settings-about-row"><HardDrive size={21} /><div><span>{copy.location}</span><code>{status?.db_path || '—'}</code></div></div></>}
    </main></div>
  </div></div>
}
