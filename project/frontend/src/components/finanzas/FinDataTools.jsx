import { useRef, useState } from 'react'
import { Download, Upload, Trash2 } from 'lucide-react'
import { API_URL } from '../../config'
import { useStore } from '../../store/useStore'
import { parseFinCsv } from '../../data/finCsv'

export default function FinDataTools({ selectedIds, clearSelection }) {
  const categories = useStore(s => s.finCategorias)
  const refreshAll = useStore(s => s.fetchFinMovimientosAll)
  const refreshMonth = useStore(s => s.fetchFinMovimientos)
  const refreshAccounts = useStore(s => s.fetchFinCuentas)
  const refreshCategories = useStore(s => s.fetchFinCategorias)
  const selectedMes = useStore(s => s.selectedMes)
  const toast = useStore(s => s.showToast)
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [bulkCategory, setBulkCategory] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    await Promise.all([refreshAll(), refreshMonth(selectedMes), refreshAccounts(), refreshCategories()])
    clearSelection()
  }

  const download = async () => {
    try {
      const res = await fetch(`${API_URL}/fin/export/csv`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `movimientos-completos-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch { toast('No se pudo exportar el historial', 'error') }
  }

  const chooseFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try { setPreview({ name: file.name, rows: parseFinCsv(await file.text()) }) }
    catch (error) { setPreview(null); toast(error.message, 'error') }
    event.target.value = ''
  }

  const importRows = async () => {
    if (!preview?.rows.length || busy) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/fin/import/csv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: preview.rows }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      if (result.importados !== preview.rows.length) throw new Error('Importación parcial')
      setPreview(null)
      await refresh()
      toast(`${result.importados} movimientos importados`, 'success')
    } catch {
      setPreview(null)
      await refresh()
      toast('No se pudo completar la importación; revisá el historial antes de reintentar', 'error')
    }
    finally { setBusy(false) }
  }

  const bulk = async kind => {
    if (!selectedIds.length || busy) return
    if (kind === 'delete' && !window.confirm(`¿Eliminar ${selectedIds.length} movimientos?`)) return
    if (kind === 'category' && !bulkCategory) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/fin/movimientos/bulk`, {
        method: kind === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'delete'
          ? { ids: selectedIds }
          : { updates: selectedIds.map(id => ({ id, categoria_id: Number(bulkCategory) })) }),
      })
      if (!res.ok) throw new Error()
      const result = await res.json()
      const count = kind === 'delete' ? result.eliminados : result.actualizados
      if (count !== selectedIds.length) throw new Error()
      await refresh()
      toast(`${count} movimientos ${kind === 'delete' ? 'eliminados' : 'actualizados'}`, 'success')
    } catch { toast('La operación masiva quedó incompleta; recargá antes de reintentar', 'error'); await refresh() }
    finally { setBusy(false) }
  }

  return (
    <div className="panel-strong px-3 py-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--subtext)' }}>
      <button type="button" onClick={download} className="btn-ghost flex items-center gap-1"><Download size={12} /> Exportar historial CSV</button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={chooseFile} aria-label="Elegir CSV de movimientos" />
      <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1"><Upload size={12} /> Elegir CSV para importar</button>
      {preview && <span>{preview.name}: {preview.rows.length} filas <button type="button" disabled={busy} onClick={importRows} className="btn-ghost">Importar ahora</button> <button type="button" onClick={() => setPreview(null)} className="btn-ghost">Cancelar</button></span>}
      {selectedIds.length > 0 && <>
        <span className="ml-auto">{selectedIds.length} seleccionados</span>
        <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} aria-label="Nueva categoría para seleccionados" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
          <option value="">Categoría…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" disabled={!bulkCategory || busy} onClick={() => bulk('category')} className="btn-ghost">Aplicar</button>
        <button type="button" disabled={busy} onClick={() => bulk('delete')} className="btn-ghost flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>
      </>}
    </div>
  )
}
