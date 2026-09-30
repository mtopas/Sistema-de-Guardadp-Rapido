// Cliente HTTP de SGR.
//
// Base por defecto: `/api` → proxy de Vite → FastAPI en :8765 (ver vite.config.js).
// En build de producción servido por el propio backend, `/api` no existe, así que
// si VITE_API_URL está vacío y no estamos en dev, la base es el mismo origen ('').
// El usuario puede sobrescribirla desde Ajustes (localStorage) para apuntar al
// homelab por Tailscale.

const LS_KEY = 'sgr-fcd-api-base'

function defaultBase() {
  const env = import.meta.env.VITE_API_URL
  if (env !== undefined && env !== '') return env
  return import.meta.env.DEV ? '/api' : ''
}

export function getApiBase() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v !== null) return v.replace(/\/$/, '')
  } catch { /* storage bloqueado */ }
  return defaultBase().replace(/\/$/, '')
}

export function setApiBase(v) {
  try {
    if (v === null || v === undefined) localStorage.removeItem(LS_KEY)
    else localStorage.setItem(LS_KEY, String(v).replace(/\/$/, ''))
  } catch { /* noop */ }
}

export class ApiError extends Error {
  constructor(status, detail, network = false) {
    super(detailToText(detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.network = network
  }
}

function detailToText(d) {
  if (d === null || d === undefined) return 'Error desconocido'
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((x) => {
        const campo = Array.isArray(x?.loc) ? x.loc.filter((p) => p !== 'body').join('.') : null
        return campo ? `${campo}: ${x.msg}` : x?.msg || JSON.stringify(x)
      })
      .join(' · ')
  }
  if (typeof d === 'object') return d.detail !== undefined ? detailToText(d.detail) : JSON.stringify(d)
  return String(d)
}

export function buildUrl(path, query) {
  let url = getApiBase() + path
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.append(k, typeof v === 'boolean' ? String(v) : v)
    }
    const s = qs.toString()
    if (s) url += (url.includes('?') ? '&' : '?') + s
  }
  return url
}

const TIMEOUT = 25000

export async function api(path, { method = 'GET', body, query, form, raw = false, signal } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT)
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true })

  const opts = { method, headers: {}, signal: ctrl.signal }
  if (form) opts.body = form
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(buildUrl(path, query), opts)
  } catch (e) {
    clearTimeout(timer)
    const msg =
      e === 'timeout' || e?.name === 'AbortError'
        ? 'La API tardó demasiado en responder.'
        : 'Sin conexión con la API de SGR. ¿Está corriendo en el puerto 8765?'
    throw new ApiError(0, msg, true)
  }
  clearTimeout(timer)

  if (!res.ok) throw new ApiError(res.status, await safeDetail(res))
  if (raw) return res
  if (res.status === 204) return null

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function safeDetail(res) {
  try {
    const j = await res.json()
    return j?.detail ?? j
  } catch {
    return `HTTP ${res.status} ${res.statusText || ''}`.trim()
  }
}

export const get = (p, query) => api(p, { query })
export const post = (p, body, query) => api(p, { method: 'POST', body, query })
export const put = (p, body, query) => api(p, { method: 'PUT', body, query })
export const patch = (p, body, query) => api(p, { method: 'PATCH', body, query })
export const del = (p, query, body) => api(p, { method: 'DELETE', query, body })

// Los adjuntos que sirve el backend (`/uploads/...`) tienen que pasar por la
// misma base que la API, o en dev quedarían apuntando al server de Vite.
export function assetUrl(u) {
  if (!u) return u
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u
  if (u.startsWith('/uploads/') || u.startsWith('/adjuntos/')) return getApiBase() + u
  return u
}

export function rewriteAssetsInHtml(html) {
  if (!html) return html
  return html.replace(/src="(\/(?:uploads|adjuntos)\/[^"]+)"/g, (_, p) => `src="${assetUrl(p)}"`)
}

// Chequeo de vida: se usa en el indicador de conexión del shell.
export async function ping() {
  const t0 = performance.now()
  // `/openapi.json` existe siempre en FastAPI y no muta nada.
  await api('/openapi.json')
  return Math.round(performance.now() - t0)
}
