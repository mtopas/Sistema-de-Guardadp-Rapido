// Cliente HTTP mínimo para la API de SGR.
// Base por defecto: `/api` (proxy de Vite → FastAPI). Se puede sobreescribir
// con VITE_API_URL o desde Ajustes (localStorage `sgr-nexus-api`).

const LS_KEY = 'sgr-nexus-api'

export function getApiBase() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v) return v.replace(/\/$/, '')
  } catch { /* storage bloqueado */ }
  return (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
}

export function setApiBase(v) {
  try {
    if (v) localStorage.setItem(LS_KEY, v)
    else localStorage.removeItem(LS_KEY)
  } catch { /* noop */ }
}

export class ApiError extends Error {
  constructor(status, detail, network = false) {
    super(typeof detail === 'string' ? detail : detailToText(detail))
    this.status = status
    this.detail = detail
    this.network = network
  }
}

function detailToText(d) {
  if (!d) return 'Error desconocido'
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(' · ')
  if (typeof d === 'object') return d.detail ? detailToText(d.detail) : JSON.stringify(d)
  return String(d)
}

function buildUrl(path, query) {
  let url = getApiBase() + path
  if (query) {
    const qs = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v)
    })
    const s = qs.toString()
    if (s) url += (url.includes('?') ? '&' : '?') + s
  }
  return url
}

export async function api(path, { method = 'GET', body, query, raw = false, form } = {}) {
  const opts = { method, headers: {} }
  if (form) {
    opts.body = form
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(buildUrl(path, query), opts)
  } catch (e) {
    throw new ApiError(0, 'Sin conexión con la API', true)
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, await safeDetail(res))
    return res
  }
  if (!res.ok) throw new ApiError(res.status, await safeDetail(res))
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

async function safeDetail(res) {
  try {
    const j = await res.json()
    return j?.detail ?? j
  } catch {
    return `HTTP ${res.status}`
  }
}

export const get = (p, query) => api(p, { query })
export const post = (p, body, query) => api(p, { method: 'POST', body, query })
export const put = (p, body, query) => api(p, { method: 'PUT', body, query })
export const patch = (p, body, query) => api(p, { method: 'PATCH', body, query })
export const del = (p, query, body) => api(p, { method: 'DELETE', query, body })

export function apiUrl(path, query) {
  return buildUrl(path, query)
}

// Normaliza rutas de adjuntos del backend (`/uploads/…`, `/adjuntos/…`) para que
// pasen por la misma base que la API.
export function assetUrl(u) {
  if (!u) return u
  if (u.startsWith('/uploads/') || u.startsWith('/adjuntos/')) return getApiBase() + u
  return u
}

export function rewriteAssetsInHtml(html) {
  if (!html) return html
  return html.replace(/src="(\/(?:uploads|adjuntos)\/[^"]+)"/g, (_, p) => `src="${assetUrl(p)}"`)
}
