import { create } from 'zustand'
import { api, get, post, patch, del } from '../lib/api'
import { reportError, toast } from './ui'

let tmp = -1

export const useBoveda = create((set, g) => ({
  categorias: [],
  hojas: [],
  recientes: [],
  loaded: false,
  busy: false,

  // UI
  selectedId: null,
  catFilter: null,
  q: '',
  tipoFilter: null,
  vista: 'grafo', // grafo | lista
  semanticos: null, // resultados de búsqueda semántica o null
  captura: null, // null | { preset }

  select: (id) => set({ selectedId: id }),
  setCatFilter: (id) => set({ catFilter: id, semanticos: null }),
  setQ: (q) => set({ q, semanticos: q ? g().semanticos : null }),
  setTipoFilter: (t) => set({ tipoFilter: t }),
  setVista: (vista) => set({ vista }),
  openCaptura: (preset = {}) => set({ captura: preset }),
  closeCaptura: () => set({ captura: null }),

  fetchAll: async () => {
    set({ busy: true })
    try {
      const [categorias, hojas] = await Promise.all([get('/categorias'), get('/hojas')])
      set({
        categorias: Array.isArray(categorias) ? categorias : g().categorias,
        hojas: Array.isArray(hojas) ? hojas : g().hojas,
        loaded: true,
        busy: false,
      })
    } catch (e) {
      set({ loaded: true, busy: false })
      if (!e.network) reportError(e)
    }
  },

  fetchRecientes: async (limit = 10) => {
    try {
      const r = await get('/hojas/recientes', { limit })
      if (Array.isArray(r)) set({ recientes: r })
    } catch { /* offline: conserva lo que había */ }
  },

  // ── Categorías ──────────────────────────────────────────────────────
  crearCategoria: async (data) => {
    try {
      const c = await post('/categorias', data)
      set((s) => ({ categorias: [...s.categorias, c] }))
      toast(`Categoría “${c.nombre}” creada`)
      return c
    } catch (e) { reportError(e); return null }
  },
  editarCategoria: async (id, data) => {
    const prev = g().categorias
    set((s) => ({ categorias: s.categorias.map((c) => (c.id === id ? { ...c, ...data } : c)) }))
    try {
      await patch(`/categorias/${id}`, data)
      await g().fetchAll()
      return true
    } catch (e) {
      if (!e.network) set({ categorias: prev })
      reportError(e)
      return false
    }
  },
  borrarCategoria: async (id, forzar = false) => {
    try {
      await del(`/categorias/${id}`, forzar ? { forzar: true } : undefined)
      await g().fetchAll()
      set((s) => ({ catFilter: s.catFilter === id ? null : s.catFilter }))
      toast('Categoría eliminada')
      return { ok: true }
    } catch (e) {
      if (e.status === 409) return { ok: false, conflict: true, msg: e.message }
      reportError(e)
      return { ok: false }
    }
  },

  // ── Hojas ───────────────────────────────────────────────────────────
  crearHoja: async (data) => {
    const cat = g().categorias.find((c) => c.id === data.categoria_id)
    const temp = {
      id: tmp--,
      tipo: 'texto',
      apuntes: '',
      fecha: new Date().toISOString(),
      categoria_nombre: cat?.nombre,
      ...data,
      _pending: true,
    }
    set((s) => ({ hojas: [temp, ...s.hojas], selectedId: temp.id }))
    try {
      const r = await post('/hojas', data)
      const full = await get(`/hojas/${r.id}`).catch(() => ({ ...temp, ...r, _pending: false }))
      set((s) => ({
        hojas: s.hojas.map((h) => (h.id === temp.id ? full : h)),
        selectedId: s.selectedId === temp.id ? full.id : s.selectedId,
      }))
      g().fetchRecientes()
      toast('Guardado en la Bóveda')
      return full
    } catch (e) {
      if (!e.network) set((s) => ({ hojas: s.hojas.filter((h) => h.id !== temp.id) }))
      reportError(e)
      return e.network ? temp : null
    }
  },
  editarHoja: async (id, data) => {
    const prev = g().hojas.find((h) => h.id === id)
    const cat = data.categoria_id ? g().categorias.find((c) => c.id === data.categoria_id) : null
    set((s) => ({
      hojas: s.hojas.map((h) =>
        h.id === id ? { ...h, ...data, ...(cat ? { categoria_nombre: cat.nombre } : {}) } : h,
      ),
    }))
    if (id < 0) return true // hoja optimista sin id real todavía
    try {
      await patch(`/hojas/${id}`, data)
      const full = await get(`/hojas/${id}`).catch(() => null)
      if (full) set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? full : h)) }))
      return true
    } catch (e) {
      if (!e.network && prev) set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? prev : h)) }))
      reportError(e)
      return false
    }
  },
  borrarHoja: async (id) => {
    const prev = g().hojas
    set((s) => ({
      hojas: s.hojas.filter((h) => h.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }))
    try {
      await del(`/hojas/${id}`)
      toast('Hoja movida a Basura')
      g().fetchRecientes()
    } catch (e) {
      if (!e.network) set({ hojas: prev })
      reportError(e)
    }
  },
  refrescarPreview: async (id) => {
    try {
      const r = await post(`/hojas/${id}/preview`)
      set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? { ...h, link_preview: r.link_preview ?? h.link_preview } : h)) }))
      toast('Vista previa actualizada')
    } catch (e) { reportError(e) }
  },
  subirArchivo: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await api('/upload', { method: 'POST', form: fd })
    return r?.url ?? r?.ruta ?? null
  },
  buscarSemantico: async (q, top_k = 25) => {
    if (!q?.trim()) { set({ semanticos: null }); return }
    set({ busy: true })
    try {
      const r = await get('/hojas/buscar-semantico', { q, top_k })
      const arr = Array.isArray(r) ? r : r?.resultados || r?.hojas || []
      set({ semanticos: arr, busy: false })
      toast(`${arr.length} resultado${arr.length === 1 ? '' : 's'} por significado`)
    } catch (e) {
      set({ busy: false, semanticos: null })
      reportError(e, 'La búsqueda semántica necesita Ollama corriendo')
    }
  },
  limpiarSemantico: () => set({ semanticos: null }),
  reindexar: async () => {
    try {
      await post('/hojas/reindexar')
      toast('Reindexación semántica en curso', 'ok', 5000)
    } catch (e) { reportError(e) }
  },
}))

// ── Derivados ─────────────────────────────────────────────────────────
export const isBasura = (c) => /basura/i.test(c?.ruta || c?.nombre || '')

export function buildTree(categorias) {
  const byParent = new Map()
  for (const c of categorias) {
    if (isBasura(c)) continue
    const k = c.padre_id ?? 0
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(c)
  }
  const sortFn = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  const build = (pid, depth) =>
    (byParent.get(pid) || []).sort(sortFn).map((c) => ({ ...c, depth, children: build(c.id, depth + 1) }))
  return build(0, 0)
}

export function descendantIds(categorias, id) {
  const out = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const c of categorias) {
      if (c.padre_id && out.has(c.padre_id) && !out.has(c.id)) { out.add(c.id); changed = true }
    }
  }
  return out
}

export function rutaCategoria(categorias, id) {
  const byId = new Map(categorias.map((c) => [c.id, c]))
  const parts = []
  let cur = byId.get(id)
  for (let i = 0; i < 12 && cur; i++) {
    parts.unshift(cur.nombre)
    cur = cur.padre_id ? byId.get(cur.padre_id) : null
  }
  return parts.join(' › ')
}

export function detectTipo(text) {
  const t = String(text || '').trim()
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+/i.test(t)) return 'link'
  if (/^data:image\//i.test(t) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(t)) return 'foto'
  return 'texto'
}

export function hojaTitulo(h) {
  if (!h) return ''
  if (h.tipo === 'link') return h.link_preview?.title || h.titulo || h.contenido || 'Enlace'
  return h.titulo || h.contenido || 'Sin título'
}

export function hostDe(url) {
  try { return new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '') }
  catch { return '' }
}

/** El proyecto guarda la foto como primer <img> de `apuntes`. */
export function fotoDeApuntes(apuntes) {
  const m = /^\s*(?:<p>)?\s*<img[^>]*src="([^"]+)"[^>]*>(?:<\/p>)?/i.exec(apuntes || '')
  if (!m) return { src: null, rest: apuntes || '' }
  return { src: m[1], rest: (apuntes || '').slice(m[0].length) }
}

export const stripHtml = (html) =>
  String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
