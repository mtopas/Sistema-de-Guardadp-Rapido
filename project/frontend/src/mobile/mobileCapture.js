import { API_URL } from '../config'
import { textoPlanoAHtml, tituloDesdeCuerpo } from '../utils/cuerpoHoja'

export const MOBILE_ACTIONS = [
  { id: 'gasto', label: 'Gasto', eyebrow: 'Finanzas', prompt: '¿Qué pagaste?', placeholder: 'Café con medialunas' },
  { id: 'boveda', label: 'Bóveda', eyebrow: 'Inbox', prompt: '¿Qué querés guardar?', placeholder: 'Idea, enlace o nota rápida' },
  { id: 'tarea', label: 'Tarea', eyebrow: 'Agenda', prompt: '¿Qué hay que hacer?', placeholder: 'Enviar el informe' },
  { id: 'habito', label: 'Hábito', eyebrow: 'Rutina diaria', prompt: '¿Qué hábito querés crear?', placeholder: 'Leer veinte minutos' },
  { id: 'jarvis', label: 'Preguntar a Jarvis', eyebrow: 'Consulta', prompt: '¿Qué querés saber?', placeholder: '¿Qué tengo pendiente esta semana?' },
]

export function localISODate(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localISODateTime(now = new Date()) {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${localISODate(now)}T${hours}:${minutes}:00`
}

async function requestJson(fetchImpl, path, options) {
  const response = await fetchImpl(`${API_URL}${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'No se pudo completar la acción')
  return data
}

export async function loadMobileTargets(action, fetchImpl = fetch) {
  if (action === 'gasto') {
    const [accounts, categories] = await Promise.all([
      requestJson(fetchImpl, '/fin/cuentas'),
      requestJson(fetchImpl, '/fin/categorias'),
    ])
    return {
      accounts,
      categories: categories.filter(category => !category.oculta && category.tipo !== 'income'),
    }
  }
  if (action === 'boveda') {
    const categories = await requestJson(fetchImpl, '/categorias')
    const inbox = categories.find(category => /sin categorizar|inbox/i.test(category.nombre)) || null
    return { inbox }
  }
  if (action === 'tarea') {
    return { lists: await requestJson(fetchImpl, '/agenda/listas') }
  }
  return {}
}

export function mobileDestination(action, fields = {}, targets = {}) {
  if (action === 'gasto') {
    const account = targets.accounts?.find(item => String(item.id) === String(fields.accountId))
    return `Finanzas · ${account?.name || 'Elegí cuenta'} · ${fields.categoryName || 'Elegí categoría'}`
  }
  if (action === 'boveda') return `Bóveda · ${targets.inbox?.nombre || 'Inbox no disponible'}`
  if (action === 'tarea') {
    const list = targets.lists?.find(item => String(item.id) === String(fields.listId))
    return `Agenda · Hoy${list ? ` · ${list.nombre}` : ''}`
  }
  if (action === 'habito') return 'Hábitos · Diario'
  if (action === 'jarvis') return 'Jarvis · Chat nuevo'
  return ''
}

export async function submitMobileCapture({
  action,
  text,
  fields = {},
  targets = {},
  today = localISODate(),
  now = new Date(),
}, fetchImpl = fetch) {
  const content = String(text || '').trim()
  if (!content) throw new Error('Escribí algo antes de guardar')

  if (action === 'gasto') {
    const amount = Number(String(fields.amount || '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ingresá un monto válido')
    if (!fields.accountId || !fields.categoryName) throw new Error('Elegí cuenta y categoría')
    const data = await requestJson(fetchImpl, '/fin/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'expense', monto: amount, moneda: 'ARS', fecha: localISODateTime(now),
        descripcion: content, cuenta_id: Number(fields.accountId), categoria_nombre: fields.categoryName,
      }),
    })
    return {
      title: 'Gasto guardado',
      detail: mobileDestination(action, fields, targets),
      undo: { method: 'DELETE', path: `/fin/movimientos/${data.id}` },
    }
  }

  if (action === 'boveda') {
    if (!targets.inbox?.id) throw new Error('No se encontró la categoría Inbox')
    const data = await requestJson(fetchImpl, '/hojas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contenido: tituloDesdeCuerpo(content), categoria_id: targets.inbox.id,
        tipo: 'texto', apuntes: textoPlanoAHtml(content),
      }),
    })
    return {
      title: 'Nota guardada',
      detail: mobileDestination(action, fields, targets),
      undo: { method: 'DELETE', path: `/hojas/${data.id}` },
    }
  }

  if (action === 'tarea') {
    const payload = { titulo: content, fecha_opcional: today }
    if (fields.listId) payload.lista_id = Number(fields.listId)
    const data = await requestJson(fetchImpl, '/agenda/tareas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return {
      title: 'Tarea creada para hoy',
      detail: mobileDestination(action, fields, targets),
      undo: { method: 'DELETE', path: `/agenda/tareas/${data.id}` },
    }
  }

  if (action === 'habito') {
    const data = await requestJson(fetchImpl, '/habitos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: content, frecuencia_tipo: 'diario', color: '#059669' }),
    })
    return {
      title: 'Hábito diario creado',
      detail: mobileDestination(action, fields, targets),
      undo: { method: 'DELETE', path: `/habitos/${data.id}` },
    }
  }

  if (action === 'jarvis') {
    const chat = await requestJson(fetchImpl, '/jarvis/chats', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: null }),
    })
    const data = await requestJson(fetchImpl, '/jarvis/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: content, conversation_id: chat.id }),
    })
    return {
      title: 'Jarvis respondió',
      detail: mobileDestination(action, fields, targets),
      answer: data.answer,
      undo: null,
    }
  }

  throw new Error('Acción móvil desconocida')
}

export async function undoMobileCapture(undo, fetchImpl = fetch) {
  if (!undo?.path) return false
  await requestJson(fetchImpl, undo.path, { method: undo.method || 'DELETE' })
  return true
}
