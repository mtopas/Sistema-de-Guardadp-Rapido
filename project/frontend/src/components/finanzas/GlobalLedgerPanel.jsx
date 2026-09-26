import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { fmtARS, fmtUSD, fmtCantidad } from '../../data/finanzas'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = () => ({ tipo: 'compra', instrumento_tipo: 'acciones', ticker: '', nombre: '', fecha: today(), cantidad: '', precio: '', moneda: 'ARS', tipo_cambio: '', nota: '' })
const fieldStyle = { minWidth: 0, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px', fontSize: 11 }

export default function GlobalLedgerPanel() {
  const transactions = useStore(s => s.finTransacciones)
  const config = useStore(s => s.finConfig)
  const fetchTransactions = useStore(s => s.fetchFinTransacciones)
  const add = useStore(s => s.addFinTransaccionUnificada)
  const update = useStore(s => s.updateFinTransaccion)
  const remove = useStore(s => s.deleteFinTransaccion)
  const toast = useStore(s => s.showToast)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [tickerFilter, setTickerFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTransactions({ limit: 2000 }).then(ok => {
      if (!ok) setError('No se pudo cargar el ledger global')
    })
  }, [fetchTransactions])
  const visible = useMemo(() => transactions.filter(tx => !tickerFilter || String(tx.ticker ?? '').toLowerCase().includes(tickerFilter.toLowerCase())), [transactions, tickerFilter])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const edit = tx => {
    setEditingId(tx.id)
    setError('')
    setForm({ tipo: tx.tipo, instrumento_tipo: tx.tipo_instrumento, ticker: tx.ticker ?? '', nombre: tx.nombre_instrumento ?? '', fecha: tx.fecha?.slice(0, 10) ?? '', cantidad: String(tx.cantidad), precio: String(tx.precio), moneda: tx.moneda ?? 'ARS', tipo_cambio: tx.tipo_cambio == null ? '' : String(tx.tipo_cambio), nota: tx.nota ?? '' })
  }

  const save = async event => {
    event.preventDefault()
    const cantidad = Number(form.cantidad), precio = Number(form.precio)
    if (!form.ticker.trim() || !form.fecha || cantidad <= 0 || precio <= 0 || !Number.isFinite(cantidad) || !Number.isFinite(precio)) {
      setError('Completá ticker, fecha, cantidad y precio positivos.')
      return
    }
    const rate = Number(form.tipo_cambio || config?.dolar_mep || config?.dolar_oficial || config?.dolar_default)
    if (form.tipo === 'compra' && form.moneda === 'ARS' && (!Number.isFinite(rate) || rate <= 0)) {
      setError('Ingresá el tipo de cambio de la compra en ARS.')
      return
    }
    const payload = {
      tipo: form.tipo, fecha: form.fecha, cantidad, precio,
      moneda: form.moneda, tipo_cambio: form.moneda === 'ARS' && rate > 0 ? rate : null,
      nota: form.nota || null,
    }
    setBusy(true)
    setError('')
    try {
      if (editingId) {
        if (!await update(editingId, payload)) throw new Error('No se pudo editar la transacción')
      } else {
        await add({ ...payload, instrumento_tipo: form.instrumento_tipo, ticker: form.ticker.trim(), nombre: form.nombre.trim() || form.ticker.trim() })
      }
      setForm(emptyForm())
      setEditingId(null)
      toast('Transacción guardada', 'success')
    } catch (err) { setError(err?.message || 'No se pudo guardar la transacción') }
    finally { setBusy(false) }
  }

  const deleteRow = async tx => {
    if (!window.confirm(`¿Eliminar ${tx.tipo} de ${tx.ticker || tx.nombre_instrumento}?`)) return
    await remove(tx.id)
  }

  const input = (label, key, type = 'text') => <label className="flex flex-col gap-1 min-w-[105px] flex-1"><span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--subtext)' }}>{label}</span><input style={fieldStyle} type={type} step={type === 'number' ? 'any' : undefined} disabled={!!editingId && ['ticker', 'nombre'].includes(key)} value={form[key]} onChange={e => set(key, e.target.value)} /></label>

  return (
    <details className="panel-strong p-4">
      <summary className="cursor-pointer font-semibold text-[13px]" style={{ color: 'var(--text)' }}>Ledger global · compras y ventas</summary>
      <p className="text-[11px] mt-2" style={{ color: 'var(--subtext)' }}>Cada ticker se vincula con su posición. ARS usa el tipo de cambio registrado en la compra para conservar el PPC.</p>
      <form onSubmit={save} className="flex flex-wrap gap-2 mt-3 items-end">
        <label className="flex flex-col gap-1 min-w-[95px]"><span className="text-[10px] uppercase" style={{ color: 'var(--subtext)' }}>Operación</span><select style={fieldStyle} value={form.tipo} onChange={e => set('tipo', e.target.value)}><option value="compra">Compra</option><option value="venta">Venta</option></select></label>
        <label className="flex flex-col gap-1 min-w-[95px]"><span className="text-[10px] uppercase" style={{ color: 'var(--subtext)' }}>Instrumento</span><select style={fieldStyle} value={form.instrumento_tipo} disabled={!!editingId} onChange={e => set('instrumento_tipo', e.target.value)}><option value="acciones">Acciones</option><option value="ons">ONs</option><option value="crypto">Crypto</option></select></label>
        {input('Ticker', 'ticker')}
        {input('Nombre', 'nombre')}
        {input('Fecha', 'fecha', 'date')}
        {input('Cantidad', 'cantidad', 'number')}
        {input('Precio', 'precio', 'number')}
        <label className="flex flex-col gap-1 min-w-[80px]"><span className="text-[10px] uppercase" style={{ color: 'var(--subtext)' }}>Moneda</span><select style={fieldStyle} value={form.moneda} onChange={e => set('moneda', e.target.value)}><option value="ARS">ARS</option><option value="USD">USD</option></select></label>
        {form.moneda === 'ARS' && input('ARS/USD', 'tipo_cambio', 'number')}
        {input('Nota', 'nota')}
        <button type="submit" disabled={busy} className="btn-ghost" style={{ color: 'var(--accent)' }}>{busy ? 'Guardando…' : editingId ? 'Guardar edición' : 'Agregar'}</button>
        {editingId && <button type="button" className="btn-ghost" onClick={() => { setEditingId(null); setForm(emptyForm()); setError('') }}>Cancelar</button>}
      </form>
      {error && <p role="alert" className="text-[11px] mt-2" style={{ color: 'var(--expense)' }}>{error}</p>}
      <div className="flex justify-between items-center mt-4 mb-2"><span className="text-[11px]" style={{ color: 'var(--subtext)' }}>{visible.length} transacciones{transactions.length === 2000 ? ' · mostrando las últimas 2000' : ''}</span><input style={fieldStyle} placeholder="Filtrar ticker" aria-label="Filtrar ticker" value={tickerFilter} onChange={e => setTickerFilter(e.target.value)} /></div>
      <div className="overflow-x-auto max-h-[320px] panel-scroll">
        <table className="w-full text-[11px]" style={{ color: 'var(--text)' }}><thead><tr className="text-left" style={{ color: 'var(--subtext)' }}><th>Fecha</th><th>Ticker</th><th>Tipo</th><th>Cantidad</th><th>Precio</th><th>Total</th><th>TC</th><th>Nota</th><th></th></tr></thead><tbody>
          {visible.map(tx => <tr key={tx.id} style={{ borderTop: '1px solid var(--border)' }}><td>{tx.fecha?.slice(0, 10)}</td><td className="font-semibold">{tx.ticker || tx.nombre_instrumento}</td><td>{tx.tipo}</td><td>{fmtCantidad(tx.cantidad)}</td><td>{tx.moneda === 'USD' ? fmtUSD(tx.precio) : fmtARS(tx.precio)}</td><td>{tx.moneda === 'USD' ? fmtUSD(tx.monto_total) : fmtARS(tx.monto_total)}</td><td>{tx.tipo_cambio ?? '—'}</td><td>{tx.nota || '—'}</td><td className="whitespace-nowrap"><button type="button" className="btn-ghost" onClick={() => edit(tx)}>Editar</button><button type="button" className="btn-ghost" onClick={() => deleteRow(tx)}>Eliminar</button></td></tr>)}
          {!visible.length && <tr><td colSpan={9} className="py-4 text-center" style={{ color: 'var(--subtext)' }}>Sin transacciones</td></tr>}
        </tbody></table>
      </div>
    </details>
  )
}
