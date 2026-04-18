import { useState, useRef, useEffect } from 'react'
import { Search, Plus, Check, ChevronDown } from 'lucide-react'
import { useStore } from '../store/useStore'

export default function CategoryPicker({ value, onChange }) {
  const categorias    = useStore(s => s.categorias)
  const crearCategoria = useStore(s => s.crearCategoria)
  const [query,    setQuery]    = useState('')
  const [open,     setOpen]     = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef(null)

  const selected = categorias.find(c => c.id === value)
  const filtered = categorias.filter(c =>
    c.nombre.toLowerCase().includes(query.toLowerCase())
  )
  const exactMatch = filtered.some(
    c => c.nombre.toLowerCase() === query.toLowerCase()
  )

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!query.trim() || creating) return
    setCreating(true)
    try {
      const cat = await crearCategoria(query.trim())
      onChange(cat.id)
      setQuery('')
      setOpen(false)
    } catch (_) {}
    finally { setCreating(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-app-surface border border-app-border text-sm hover:border-app-accent transition-colors duration-150"
      >
        <Search size={14} className="text-app-subtext flex-shrink-0" />
        <span className={`flex-1 text-left ${selected ? 'text-app-text' : 'text-app-subtext'}`}>
          {selected ? selected.nombre : 'Elegí una categoría...'}
        </span>
        <ChevronDown size={14} className={`text-app-subtext transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-app-surface border border-app-border rounded-xl shadow-2xl overflow-hidden animate-in">
          <div className="p-2 border-b border-app-border">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !exactMatch && handleCreate()}
              placeholder="Buscar o crear..."
              className="w-full bg-transparent text-app-text text-sm outline-none placeholder:text-app-subtext px-1"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !query && (
              <p className="px-3 py-3 text-sm text-app-subtext">No hay categorías.</p>
            )}
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setQuery(''); setOpen(false) }}
                className="w-full text-left px-3 py-2.5 text-sm text-app-text hover:bg-app-bg transition-colors duration-100 flex items-center gap-2"
              >
                {c.id === value
                  ? <Check size={13} className="text-app-accent flex-shrink-0" />
                  : <span className="w-[13px]" />
                }
                {c.nombre}
              </button>
            ))}
            {query && !exactMatch && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full text-left px-3 py-2.5 text-sm text-app-accent hover:bg-app-bg transition-colors duration-100 flex items-center gap-2 border-t border-app-border"
              >
                <Plus size={13} className="flex-shrink-0" />
                {creating ? 'Creando...' : `Crear "${query}"`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
