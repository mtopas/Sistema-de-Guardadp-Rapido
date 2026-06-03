import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { filterCategoriasPorTipo } from '../../data/finCategorias'
import { pickDefaultCategoria } from '../../data/finanzas'

const NEW_VALUE = '__new__'

/**
 * Selector de categoría de movimiento: lista filtrada por tipo + crear nueva.
 */
export default function FinCategoriaPicker({ tipo, value, onChange, className = '' }) {
  const lang               = useStore(s => s.lang)
  const finCategorias      = useStore(s => s.finCategorias)
  const createFinCategoria = useStore(s => s.createFinCategoria)
  const showToast          = useStore(s => s.showToast)

  const pool = useMemo(
    () => filterCategoriasPorTipo(finCategorias, tipo),
    [finCategorias, tipo],
  )

  const [mode, setMode] = useState('select')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (mode === 'create') return
    if (!value) return
    const ok = pool.some(c => c.name === value)
    if (!ok) setMode('create')
  }, [value, pool, mode])

  useEffect(() => {
    setMode('select')
    setNewName('')
  }, [tipo])

  const handleSelectChange = e => {
    const v = e.target.value
    if (v === NEW_VALUE) {
      setMode('create')
      setNewName('')
      return
    }
    setMode('select')
    onChange(v)
  }

  const handleCreate = async () => {
    const nombre = newName.trim()
    if (!nombre) {
      showToast(t(lang, 'finCatNameRequired'), 'error')
      return
    }
    setCreating(true)
    const catTipo = tipo === 'income' ? 'income' : 'expense'
    const created = await createFinCategoria(nombre, catTipo)
    setCreating(false)
    if (created) {
      onChange(created.name)
      setMode('select')
      setNewName('')
    }
  }

  const inputStyle = {
    borderColor: 'var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
  }

  if (mode === 'create') {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleCreate() }
            if (e.key === 'Escape') { setMode('select'); setNewName('') }
          }}
          placeholder={t(lang, 'finCatNewPlaceholder')}
          autoFocus
          className="w-full px-3 py-2 rounded-xl border outline-none text-[12.5px]"
          style={inputStyle}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{ background: 'var(--cta-bg)', color: 'var(--cta-text)', border: 'none' }}
          >
            {creating ? t(lang, 'creating') : t(lang, 'finCatCreateUse')}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('select')
              setNewName('')
              if (!value && pool.length) {
                onChange(pickDefaultCategoria(finCategorias, tipo, null))
              }
            }}
            className="px-2 py-1.5 rounded-lg text-[11px] border"
            style={{ borderColor: 'var(--border)', color: 'var(--subtext)', background: 'transparent' }}
          >
            {t(lang, 'cancel')}
          </button>
        </div>
      </div>
    )
  }

  const selectValue = pool.some(c => c.name === value) ? value : (pool[0]?.name ?? '')

  return (
    <select
      value={selectValue}
      onChange={handleSelectChange}
      className={`w-full px-3 py-2 rounded-xl border outline-none text-[12.5px] ${className}`}
      style={inputStyle}
    >
      {pool.map(c => (
        <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
      ))}
      <option value={NEW_VALUE}>{t(lang, 'finCatNewOption')}</option>
    </select>
  )
}
