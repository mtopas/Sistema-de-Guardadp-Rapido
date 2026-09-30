import { useEffect, useState } from 'react'
import { CalendarDays, CheckSquare, Trash2, Repeat, StopCircle, GraduationCap, Plus, Pencil, Palette, Ban } from 'lucide-react'
import { Modal, Field, Seg, Switch, ConfirmButton, Swatches , useBusy } from '../../components/ui'
import { useAgenda } from '../../store/agenda'
import { toast } from '../../store/ui'
import { toISODate, DIAS_LUN, DIAS_LUN_LARGO, hasTime, pad } from '../../lib/dates'

function RepeatEditor({ value, onChange, baseDate }) {
  const idx = baseDate ? (new Date(baseDate + 'T00:00').getDay() + 6) % 7 : 0
  const v = value || { frecuencia: 'semanal', dias: [idx], hasta: '' }
  return (
    <div className="glass" style={{ padding: 12, borderRadius: 14 }}>
      <div className="row wrap">
        <Seg id="rep-frec" value={v.frecuencia} onChange={(f) => onChange({ ...v, frecuencia: f })} options={[{ id: 'diario', label: 'Diario' }, { id: 'semanal', label: 'Semanal' }, { id: 'mensual', label: 'Mensual' }]} />
        <span className="grow" />
        <label className="row small">hasta <input type="date" className="input sm" style={{ width: 150 }} value={v.hasta || ''} onChange={(e) => onChange({ ...v, hasta: e.target.value })} /></label>
      </div>
      {v.frecuencia === 'semanal' && (
        <div className="row wrap gap6" style={{ marginTop: 10 }}>
          {DIAS_LUN.map((d, i) => (
            <button key={i} type="button" className={`chip click ${v.dias?.includes(i) ? 'on' : ''}`} onClick={() => onChange({ ...v, dias: v.dias?.includes(i) ? v.dias.filter((x) => x !== i) : [...(v.dias || []), i].sort() })}>{d}</button>
          ))}
        </div>
      )}
      {v.frecuencia === 'mensual' && <div className="small dim" style={{ marginTop: 8 }}>Se repite el mismo día de cada mes.</div>}
    </div>
  )
}

function reglaJSON(r) {
  const o = { frecuencia: r.frecuencia }
  if (r.frecuencia === 'semanal') o.dias = r.dias || []
  if (r.hasta) o.hasta = r.hasta
  return JSON.stringify(o)
}

export function EventoModal() {
  const modal = useAgenda((s) => s.eventoModal)
  const close = useAgenda((s) => s.closeEvento)
  const { calendarios, crearEvento, editarEvento, borrarEvento, detenerSerie } = useAgenda()
  const ev = modal?.evento
  const [f, setF] = useState(null)

  useEffect(() => {
    if (!modal) return
    if (ev) {
      const allDay = !!ev.todo_el_dia || !hasTime(ev.fecha_inicio)
      setF({
        titulo: ev.titulo, descripcion: ev.descripcion || '', calendario_id: ev.calendario_id || '', todo_el_dia: allDay,
        fi: ev.fecha_inicio.slice(0, 10), hi: hasTime(ev.fecha_inicio) ? ev.fecha_inicio.slice(11, 16) : '09:00',
        ff: (ev.fecha_fin || ev.fecha_inicio).slice(0, 10), hf: ev.fecha_fin && hasTime(ev.fecha_fin) ? ev.fecha_fin.slice(11, 16) : '',
        repetir: false, regla: null,
      })
    } else {
      const fecha = modal.fecha || toISODate()
      const hi = modal.hora || '09:00'
      const [h, m] = hi.split(':').map(Number)
      const hf = `${pad(Math.min(23, h + 1))}:${pad(m)}`
      setF({ titulo: '', descripcion: '', calendario_id: calendarios.find((c) => c.activo !== false)?.id || '', todo_el_dia: !!modal.todoElDia, fi: fecha, hi, ff: fecha, hf, repetir: false, regla: null })
    }
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const serieId = ev ? ev.serie_id || (ev.se_repite ? ev.id : null) : null

  const [save, saving] = useBusy(async () => {
    if (!f.titulo.trim()) return toast('Poné un título', 'warn')
    const fecha_inicio = f.todo_el_dia ? f.fi : `${f.fi}T${f.hi || '00:00'}`
    let fecha_fin = null
    if (f.todo_el_dia) fecha_fin = f.ff && f.ff > f.fi ? f.ff : null
    else if (f.hf) fecha_fin = `${f.ff || f.fi}T${f.hf}`
    if (fecha_fin && fecha_fin <= fecha_inicio) return toast('La fecha de fin debe ser posterior al inicio', 'warn')
    const body = { titulo: f.titulo.trim(), descripcion: f.descripcion || null, fecha_inicio, fecha_fin, todo_el_dia: f.todo_el_dia, calendario_id: f.calendario_id ? Number(f.calendario_id) : null }
    if (!ev && f.repetir) {
      body.se_repite = true
      body.regla_repeticion = reglaJSON(f.regla || { frecuencia: 'semanal', dias: [(new Date(f.fi + 'T00:00').getDay() + 6) % 7] })
    }
    const ok = ev ? await editarEvento(ev.id, body) : await crearEvento(body)
    if (ok) close()
  })
  if (!f) return <Modal open={false} />

  const cal = calendarios.find((c) => String(c.id) === String(f.calendario_id))
  return (
    <Modal
      open={!!modal}
      onClose={close}
      title={ev ? 'Editar evento' : 'Nuevo evento'}
      icon={CalendarDays}
      onSubmit={save}
      footer={
        <>
          {ev && <ConfirmButton onConfirm={() => { borrarEvento(ev.id); close() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
          {ev && serieId && ev.serie_activa !== false && (
            <ConfirmButton className="btn sm" confirmText="¿Detener serie?" onConfirm={() => { detenerSerie('evento', serieId); close() }} icon={<StopCircle size={13} />}>Detener repeticiones</ConfirmButton>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </>
      }
    >
      <input autoFocus className="input big" placeholder="Título del evento" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} style={cal ? { borderColor: cal.color, boxShadow: `0 0 24px -12px ${cal.color}` } : undefined} />
      <div className="row wrap">
        <Field label="Calendario" className="grow">
          <select className="select" value={f.calendario_id} onChange={(e) => set('calendario_id', e.target.value)}>
            <option value="">Sin calendario</option>
            {calendarios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <label className="row small" style={{ marginTop: 18 }}><Switch on={f.todo_el_dia} onChange={(v) => set('todo_el_dia', v)} /> Todo el día</label>
      </div>
      <div className="grid2">
        <Field label="Inicio">
          <div className="row gap6">
            <input type="date" className="input" value={f.fi} onChange={(e) => { set('fi', e.target.value); if (!f.ff || f.ff < e.target.value) set('ff', e.target.value) }} />
            {!f.todo_el_dia && <input type="time" className="input" style={{ width: 120 }} value={f.hi} onChange={(e) => set('hi', e.target.value)} />}
          </div>
        </Field>
        <Field label="Fin">
          <div className="row gap6">
            <input type="date" className="input" value={f.ff} onChange={(e) => set('ff', e.target.value)} />
            {!f.todo_el_dia && <input type="time" className="input" style={{ width: 120 }} value={f.hf} onChange={(e) => set('hf', e.target.value)} />}
          </div>
        </Field>
      </div>
      <Field label="Descripción"><textarea className="textarea" rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Field>
      {!ev ? (
        <>
          <label className="row small"><Switch on={f.repetir} onChange={(v) => set('repetir', v)} /> <Repeat size={14} /> Repetir</label>
          {f.repetir && <RepeatEditor value={f.regla} onChange={(r) => set('regla', r)} baseDate={f.fi} />}
        </>
      ) : serieId ? (
        <div className="small dim row gap6"><Repeat size={13} /> Forma parte de una serie: los cambios afectan solo esta ocurrencia.{ev.serie_activa === false && ' (serie detenida)'}</div>
      ) : null}
    </Modal>
  )
}

export function TareaModal() {
  const modal = useAgenda((s) => s.tareaModal)
  const close = useAgenda((s) => s.closeTarea)
  const { listas, crearTarea, editarTarea, borrarTarea, detenerSerie } = useAgenda()
  const t = modal?.tarea
  const [f, setF] = useState(null)
  useEffect(() => {
    if (!modal) return
    setF(t
      ? { titulo: t.titulo, descripcion: t.descripcion || '', lista_id: t.lista_id || '', fecha_opcional: t.fecha_opcional || '', hora_opcional: t.hora_opcional || '', hora_bloque: t.hora_bloque || '', duracion_estimada: t.duracion_estimada || '', completada: !!t.completada, repetir: false, regla: null }
      : { titulo: '', descripcion: '', lista_id: modal.lista_id || '', fecha_opcional: modal.fecha ?? toISODate(), hora_opcional: '', hora_bloque: modal.hora_bloque || '', duracion_estimada: modal.hora_bloque ? 30 : '', completada: false, repetir: false, regla: null })
  }, [modal]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const serieId = t ? t.serie_id || (t.se_repite ? t.id : null) : null
  const [save, saving] = useBusy(async () => {
    if (!f.titulo.trim()) return toast('Poné un título', 'warn')
    const body = {
      titulo: f.titulo.trim(), descripcion: f.descripcion || null, lista_id: f.lista_id ? Number(f.lista_id) : null,
      fecha_opcional: f.fecha_opcional || null, hora_opcional: f.hora_opcional || null, hora_bloque: f.hora_bloque || null,
      duracion_estimada: f.duracion_estimada ? Number(f.duracion_estimada) : null,
    }
    let ok
    if (t) ok = await editarTarea(t.id, { ...body, completada: f.completada })
    else {
      if (f.repetir) {
        if (!f.fecha_opcional) return toast('Una tarea repetitiva necesita fecha', 'warn')
        body.se_repite = true
        body.regla_repeticion = reglaJSON(f.regla || { frecuencia: 'semanal', dias: [(new Date(f.fecha_opcional + 'T00:00').getDay() + 6) % 7] })
      }
      ok = await crearTarea(body)
    }
    if (ok) { toast(t ? 'Tarea actualizada' : 'Tarea creada'); close() }
  })
  if (!f) return <Modal open={false} />
  return (
    <Modal open={!!modal} onClose={close} title={t ? 'Editar tarea' : 'Nueva tarea'} icon={CheckSquare} onSubmit={save}
      footer={<>
        {t && <ConfirmButton onConfirm={() => { borrarTarea(t.id); close() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>}
        {t && serieId && t.serie_activa !== false && <ConfirmButton className="btn sm" confirmText="¿Detener serie?" onConfirm={() => { detenerSerie('tarea', serieId); close() }} icon={<StopCircle size={13} />}>Detener repeticiones</ConfirmButton>}
        <span className="grow" />
        <button className="btn ghost" onClick={close}>Cancelar</button>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <div className="row">
        {t && <button type="button" className={`check ${f.completada ? 'on' : ''}`} style={{ width: 26, height: 26 }} onClick={() => set('completada', !f.completada)}>✓</button>}
        <input autoFocus className="input big grow" placeholder="¿Qué hay que hacer?" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} />
      </div>
      <div className="grid3">
        <Field label="Lista">
          <select className="select" value={f.lista_id} onChange={(e) => set('lista_id', e.target.value)}>
            <option value="">Sin lista</option>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Field>
        <Field label="Fecha"><input type="date" className="input" value={f.fecha_opcional} onChange={(e) => set('fecha_opcional', e.target.value)} /></Field>
        <Field label="Hora límite"><input type="time" className="input" value={f.hora_opcional} onChange={(e) => set('hora_opcional', e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Bloque de tiempo (inicio)"><input type="time" className="input" value={f.hora_bloque} onChange={(e) => set('hora_bloque', e.target.value)} /></Field>
        <Field label="Duración estimada (min)"><input type="number" min="5" step="5" className="input" value={f.duracion_estimada} onChange={(e) => set('duracion_estimada', e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><textarea className="textarea" rows={2} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} /></Field>
      {!t ? (
        <>
          <label className="row small"><Switch on={f.repetir} onChange={(v) => set('repetir', v)} /> <Repeat size={14} /> Repetir</label>
          {f.repetir && <RepeatEditor value={f.regla} onChange={(r) => set('regla', r)} baseDate={f.fecha_opcional || toISODate()} />}
        </>
      ) : serieId ? <div className="small dim row gap6"><Repeat size={13} /> Ocurrencia de una serie.</div> : null}
    </Modal>
  )
}

export function CalendarioModal({ data, onClose }) {
  const { calendarios, crearCalendario, editarCalendario, borrarCalendario } = useAgenda()
  const c = data?.cal
  const [f, setF] = useState({ nombre: '', color: '#00c2ff' })
  const [modo, setModo] = useState('borrar')
  const [destino, setDestino] = useState('')
  useEffect(() => {
    if (!data) return
    setF(c ? { nombre: c.nombre, color: c.color } : { nombre: '', color: '#00c2ff' })
    setModo('borrar')
    setDestino(calendarios.find((x) => x.id !== c?.id)?.id || '')
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, saving] = useBusy(async () => {
    if (!f.nombre.trim()) return
    if (c) await editarCalendario(c.id, { nombre: f.nombre.trim(), color: f.color })
    else await crearCalendario({ nombre: f.nombre.trim(), color: f.color })
    onClose()
  })
  const otros = calendarios.filter((x) => x.id !== c?.id)
  return (
    <Modal open={!!data} onClose={onClose} title={c ? 'Editar calendario' : 'Nuevo calendario'} icon={Palette} onSubmit={save}
      footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}>
      <Field label="Nombre"><input autoFocus className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
      <Field label="Color"><Swatches value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
      {c && (
        <div className="glass" style={{ padding: 12, borderRadius: 14, borderColor: 'rgba(255,77,109,.35)' }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Eliminar calendario</div>
          {otros.length > 0 && <Seg id="cal-del" value={modo} onChange={setModo} options={[{ id: 'borrar', label: 'Borrar sus eventos' }, { id: 'mover', label: 'Mover eventos a…' }]} />}
          {modo === 'mover' && (
            <select className="select sm" style={{ marginTop: 8 }} value={destino} onChange={(e) => setDestino(e.target.value)}>
              {otros.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <span className="grow" />
            <ConfirmButton onConfirm={async () => { await borrarCalendario(c.id, modo === 'mover' ? Number(destino) : null); onClose() }} icon={<Trash2 size={13} />}>Eliminar</ConfirmButton>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function FacultadModal({ open, onClose }) {
  const { horario, crearHorario, editarHorario, borrarHorario, excepcionHorario } = useAgenda()
  const empty = { dia_semana: 0, hora_inicio: '18:00', hora_fin: '20:00', materia: '', descripcion: '', color: '#ffb800' }
  const [f, setF] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [exc, setExc] = useState({})
  const save = async () => {
    if (!f.materia.trim()) return toast('Poné el nombre de la materia', 'warn')
    if (f.hora_fin <= f.hora_inicio) return toast('La hora de fin debe ser posterior', 'warn')
    const body = { ...f, dia_semana: Number(f.dia_semana), materia: f.materia.trim(), descripcion: f.descripcion || null }
    if (editId) await editarHorario(editId, body)
    else await crearHorario(body)
    setF(empty)
    setEditId(null)
  }
  const sorted = [...horario].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))
  return (
    <Modal open={open} onClose={onClose} title="Horario de facultad" icon={GraduationCap} wide>
      <div className="glass" style={{ padding: 14, borderRadius: 16 }}>
        <div className="grid3">
          <Field label="Materia"><input className="input" value={f.materia} onChange={(e) => setF({ ...f, materia: e.target.value })} /></Field>
          <Field label="Día">
            <select className="select" value={f.dia_semana} onChange={(e) => setF({ ...f, dia_semana: e.target.value })}>
              {DIAS_LUN_LARGO.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="Horario">
            <div className="row gap6">
              <input type="time" className="input" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
              <input type="time" className="input" value={f.hora_fin} onChange={(e) => setF({ ...f, hora_fin: e.target.value })} />
            </div>
          </Field>
        </div>
        <div className="row wrap" style={{ marginTop: 10, alignItems: 'flex-end' }}>
          <Field label="Aula / nota" className="grow"><input className="input" value={f.descripcion || ''} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
          <Field label="Color"><Swatches value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="grow" />
          {editId && <button className="btn ghost sm" onClick={() => { setEditId(null); setF(empty) }}>Cancelar edición</button>}
          <button className="btn primary sm" onClick={save}>{editId ? <><Pencil size={13} /> Guardar cambios</> : <><Plus size={13} /> Agregar clase</>}</button>
        </div>
      </div>
      <div className="list">
        {sorted.length === 0 && <div className="small dim">Sin clases cargadas.</div>}
        {sorted.map((h) => (
          <div key={h.id} className="li" style={{ cursor: 'default', flexWrap: 'wrap' }}>
            <span className="dot" style={{ background: h.color || '#ffb800', color: h.color || '#ffb800' }} />
            <b style={{ width: 90 }}>{DIAS_LUN_LARGO[h.dia_semana]}</b>
            <span className="mono small">{h.hora_inicio}–{h.hora_fin}</span>
            <span className="grow ellipsis">{h.materia}{h.descripcion ? <span className="dim"> · {h.descripcion}</span> : null}</span>
            {(h.excepciones || []).length > 0 && <span className="chip" title={(h.excepciones || []).join(', ')}><Ban size={11} /> {h.excepciones.length}</span>}
            <input type="date" className="input sm" style={{ width: 140 }} value={exc[h.id] || ''} onChange={(e) => setExc({ ...exc, [h.id]: e.target.value })} title="Día sin cursada" />
            <button className="btn xs" disabled={!exc[h.id]} onClick={() => { excepcionHorario(h.id, exc[h.id]); setExc({ ...exc, [h.id]: '' }) }}>Sin clase</button>
            <button className="iconbtn sm" onClick={() => { setEditId(h.id); setF({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, materia: h.materia, descripcion: h.descripcion || '', color: h.color || '#ffb800' }) }}><Pencil size={12} /></button>
            <ConfirmButton className="iconbtn sm danger" confirmText="✓" onConfirm={() => borrarHorario(h.id)} icon={<Trash2 size={12} />} />
          </div>
        ))}
      </div>
      <div className="small dim">Las clases se muestran como capa en las vistas horarias (Hoy y Semana).</div>
    </Modal>
  )
}
