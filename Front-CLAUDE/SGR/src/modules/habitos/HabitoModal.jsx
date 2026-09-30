import { useEffect, useMemo, useState } from 'react'
import { Sprout, Trash2, Archive } from 'lucide-react'
import { Modal, Field, Seg, Swatches, Switch, ConfirmButton , useBusy } from '../../components/ui'
import { useHabitos } from '../../store/habitos'
import { toast } from '../../store/ui'
import { diasDe, frecuenciaTexto } from '../../lib/habitos'
import { DIAS_CORTO } from '../../lib/dates'

export default function HabitoModal() {
  const modal = useHabitos((s) => s.modal)
  const close = useHabitos((s) => s.closeModal)
  const { habitos, crear, editar, borrar } = useHabitos()
  const h = modal?.habito
  const [f, setF] = useState(null)
  const categorias = useMemo(() => [...new Set(habitos.map((x) => x.categoria).filter(Boolean))], [habitos])

  useEffect(() => {
    if (!modal) return
    setF(h
      ? { nombre: h.nombre, descripcion: h.descripcion || '', color: h.color || '#b4ff39', categoria: h.categoria || '', frecuencia_tipo: h.frecuencia_tipo || 'diario', dias: diasDe(h), hora: h.hora || '', activo: h.activo !== false, notificar: !!h.notificar, minutos_antes: h.minutos_antes || 0 }
      : { nombre: '', descripcion: '', color: '#b4ff39', categoria: '', frecuencia_tipo: 'diario', dias: [1, 2, 3, 4, 5], hora: '', activo: true, notificar: false, minutos_antes: 10 })
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const [save, saving] = useBusy(async () => {
    if (!f.nombre.trim()) return toast('Poné un nombre', 'warn')
    if (f.frecuencia_tipo === 'semanal' && !f.dias.length) return toast('Elegí al menos un día', 'warn')
    const body = {
      nombre: f.nombre.trim(), descripcion: f.descripcion || null, color: f.color, categoria: f.categoria || null,
      frecuencia_tipo: f.frecuencia_tipo, dias_semana: f.frecuencia_tipo === 'semanal' ? JSON.stringify([...f.dias].sort()) : null, hora: f.hora || null,
    }
    const ok = h ? await editar(h.id, { ...body, activo: f.activo, notificar: f.notificar, minutos_antes: Number(f.minutos_antes) || 0 }) : await crear(body)
    if (ok) { if (h) toast('Hábito actualizado'); close() }
  })
  if (!f) return <Modal open={false} />
  const preview = frecuenciaTexto({ frecuencia_tipo: f.frecuencia_tipo, dias_semana: JSON.stringify(f.dias) })

  return (
    <Modal open={!!modal} onClose={close} title={h ? 'Editar hábito' : 'Nuevo hábito'} icon={Sprout} onSubmit={save}
      footer={<>
        {h && <ConfirmButton onConfirm={() => { borrar(h.id); close() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
        <span className="grow small dim hide-sm"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span>
        <button className="btn ghost" onClick={close}>Cancelar</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <input autoFocus className="input big" placeholder="Ej: Leer 20 minutos" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} style={{ borderColor: f.color, boxShadow: `0 0 26px -12px ${f.color}` }} />
      <Field label="Descripción / por qué"><textarea className="textarea" rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Soy una persona que…" /></Field>
      <Field label="Color"><Swatches value={f.color} onChange={(c) => set('color', c)} /></Field>
      <div className="grid2">
        <Field label="Categoría">
          <input className="input" list="hab-cats" value={f.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Salud, Mente…" />
          <datalist id="hab-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Hora (opcional)"><input type="time" className="input" value={f.hora} onChange={(e) => set('hora', e.target.value)} /></Field>
      </div>
      <Field label="Frecuencia">
        <Seg id="hab-frec" value={f.frecuencia_tipo} onChange={(v) => set('frecuencia_tipo', v)} options={[{ id: 'diario', label: 'Todos los días' }, { id: 'semanal', label: 'Días específicos' }]} />
      </Field>
      {f.frecuencia_tipo === 'semanal' && (
        <div className="row wrap gap6">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} type="button" className={`chip click ${f.dias.includes(d) ? 'on' : ''}`} onClick={() => set('dias', f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d])}>{DIAS_CORTO[d]}</button>
          ))}
        </div>
      )}
      <div className="small" style={{ color: f.color }}>↻ {preview}{f.hora ? ` · a las ${f.hora} (aparece en Agenda)` : ''}</div>
      {h && (
        <div className="glass" style={{ padding: 12, borderRadius: 14 }}>
          <div className="row wrap gap16">
            <label className="row small"><Switch on={f.activo} onChange={(v) => set('activo', v)} /> <Archive size={13} /> Activo</label>
            <label className="row small"><Switch on={f.notificar} onChange={(v) => set('notificar', v)} /> Recordatorio</label>
            {f.notificar && <label className="row small"><input type="number" className="input sm" style={{ width: 70 }} value={f.minutos_antes} onChange={(e) => set('minutos_antes', e.target.value)} /> min antes</label>}
          </div>
          {!f.activo && <div className="tiny dim" style={{ marginTop: 6 }}>Archivado: conserva el historial pero no cuenta en rachas ni porcentajes.</div>}
        </div>
      )}
    </Modal>
  )
}
