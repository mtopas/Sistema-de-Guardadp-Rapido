import { create } from 'zustand'
import { api, get, post, patch, del } from '../lib/api'
import { reportError, toast } from './ui'

let tmp = -1

export const useBoveda = create((set, g) => ({
  categorias: [],
  hojas: [],
  recientes: [],
  loaded: false,
  selectedId: null,
  select: (id) => set({ selectedId: id }),

  fetchAll: async () => {
    try {
      const [categorias, hojas] = await Promise.all([get('/categorias'), get('/hojas')])
      set({
        categorias: Array.isArray(categorias) ? categorias : g().categorias,
        hojas: Array.isArray(hojas) ? hojas : g().hojas,
        loaded: true,
      })
    } catch (e) {
      set({ loaded: true })
      if (!e.network) reportError(e)
    }
  },
  fetchRecientes: async (limit = 8) => {
    try {
      set({ recientes: await get('/hojas/recientes', { limit }) })
    } catch { /* offline */ }
  },

  // ── Categorías ──
  crearCategoria: async (data) => {
    try {
      const c = await post('/categorias', data)
      set((s) => ({ categorias: [...s.categorias, c] }))
      toast(`Categoría “${c.nombre}” creada`)
      return c
    } catch (e) {
      reportError(e)
    }
  },
  editarCategoria: async (id, data) => {
    const prev = g().categorias
    set((s) => ({ categorias: s.categorias.map((c) => (c.id === id ? { ...c, ...data } : c)) }))
    try {
      const c = await patch(`/categorias/${id}`, data)
      if (c && c.id) set((s) => ({ categorias: s.categorias.map((x) => (x.id === id ? { ...x, ...c } : x)) }))
      await g().fetchAll()
    } catch (e) {
      if (!e.network) set({ categorias: prev })
      reportError(e)
    }
  },
  borrarCategoria: async (id, forzar = false) => {
    try {
      await del(`/categorias/${id}`, forzar ? { forzar: true } : undefined)
      await g().fetchAll()
      toast('Categoría eliminada')
      return { ok: true }
    } catch (e) {
      if (e.status === 409) return { ok: false, conflict: true, msg: e.message }
      reportError(e)
      return { ok: false }
    }
  },

  // ── Hojas ──
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
    set((s) => ({ hojas: [temp, ...s.hojas] }))
    try {
      const r = await post('/hojas', data)
      const full = await get(`/hojas/${r.id}`).catch(() => ({ ...temp, id: r.id, link_preview: r.link_preview }))
      set((s) => ({ hojas: s.hojas.map((h) => (h.id === temp.id ? full : h)) }))
      g().fetchRecientes()
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
        h.id === id ? { ...h, ...data, ...(cat ? { categoria_nombre: cat.nombre } : {}), _dirty: true } : h,
      ),
    }))
    try {
      await patch(`/hojas/${id}`, data)
      const full = await get(`/hojas/${id}`)
      set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? full : h)) }))
      return true
    } catch (e) {
      if (!e.network && prev) set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? prev : h)) }))
      reportError(e)
      return false
    }
  },
  borrarHoja: async (id) => {
    try {
      await del(`/hojas/${id}`)
      set((s) => ({ hojas: s.hojas.filter((h) => h.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }))
      toast('Hoja movida a Basura')
      g().fetchRecientes()
    } catch (e) {
      reportError(e)
    }
  },
  refrescarPreview: async (id) => {
    try {
      const r = await post(`/hojas/${id}/preview`)
      set((s) => ({ hojas: s.hojas.map((h) => (h.id === id ? { ...h, link_preview: r.link_preview } : h)) }))
      toast('Vista previa actualizada')
    } catch (e) {
      reportError(e)
    }
  },
  subirArchivo: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await api('/upload', { method: 'POST', form: fd })
    return r.url
  },
  buscarSemantico: async (q, top_k = 20) => {
    return get('/hojas/buscar-semantico', { q, top_k })
  },
  reindexar: async () => {
    try {
      await post('/hojas/reindexar')
      toast('Reindexación semántica en curso')
    } catch (e) {
      reportError(e)
    }
  },
}))

// Árbol: nodos con hijos; se excluye “Basura” (la API ya la filtra de hojas).
export function buildTree(categorias) {
  const byParent = new Map()
  for (const c of categorias) {
    const k = c.padre_id ?? 0
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(c)
  }
  const sortFn = (a, b) => (a.ruta || a.nombre).localeCompare(b.ruta || b.nombre)
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
      if (c.padre_id && out.has(c.padre_id) && !out.has(c.id)) {
        out.add(c.id)
        changed = true
      }
    }
  }
  return out
}

export const isBasura = (c) => /basura/i.test(c?.ruta || c?.nombre || '')

export function detectTipo(text) {
  const t = (text || '').trim()
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+$/i.test(t)) return 'link'
  return 'texto'
}

export function hojaTitulo(h) {
  if (!h) return ''
  if (h.tipo === 'link') return h.link_preview?.title || h.contenido
  return h.contenido
}

export function photoFromApuntes(apuntes) {
  const m = /^\s*(?:<p>)?\s*<img[^>]*src="([^"]+)"[^>]*>(?:<\/p>)?/i.exec(apuntes || '')
  if (!m) return { src: null, rest: apuntes || '' }
  return { src: m[1], rest: (apuntes || '').slice(m[0].length) }
}
