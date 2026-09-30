import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, GraduationCap, ListPlus, Palette, Pin, Plus, Trash2 } from 'lucide-react'
import {
  Button, Card, Checkbox, ColorPicker, Confirm, Field, IconButton, Input, Modal, Select,
  Switch, Textarea, cx,
} from '../../ui/primitives'
import { CAL_COLORS, useAgenda } from '../../store/agenda'
import { DIAS_LUN_L, pad, toISODate } from '../../lib/dates'
import { toast } from '../../store/ui'

const REPETICIONES = [
  { value: '', label: 'No se repite' },
  { value: 'diaria', label: 'Todos los días' },
  { value: 'semanal', label: 'Cada semana' },
  { value: 'mensual', label: 'Cada mes' },
  { value: 'anual', label: 'Cada año' },
]

/* ═══ Evento ═════════════════════════════════════════════════════════ */
export function EventoModal() {
  const data = useAgenda((s) => s.eventoModal)
  const close = useAgenda((s) => s.closeEvento)
  const { calendarios, crearEvento, editarEvento, borrarEvento, detenerSerie } = useAgenda()
  const open = !!data
  const ev = data?.evento
  const editando = !!ev?.id && ev.id > 0

  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [todoDia, setTodoDia] = useState(false)
  const [fecha, setFecha] = useState(toISODate())
  const [hIni, setHIni] = useState('09:00')
  const [fechaFin, setFechaFin] = useState('')
  const [hFin, setHFin] = useState('10:00')
  const [calId, setCalId] = useState('')
  const [repite, setRepite] = useState('')
  const [lugar, setLugar] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!open) return
    const ini = ev?.fecha_inicio || (data?.fecha ? `${data.fecha}T${data.hora || '09:00'}` : `${toISODate()}T09:00`)
    const fin = ev?.fecha_fin || ''
    setTitulo(ev?.titulo || ev?.nombre || '')
    setDesc(ev?.descripcion || '')
    setTodoDia(!!(ev?.todo_el_dia ?? data?.todoDia))
    setFecha(String(ini).slice(0, 10))
    setHIni(String(ini).slice(11, 16) || '09:00')
    setFechaFin(fin ? String(fin).slice(0, 10) : '')
    setHFin(fin ? String(fin).slice(11, 16) || '10:00' : sumarHora(String(ini).slice(11, 16) || '09:00'))
    setCalId(String(ev?.calendario_id ?? data?.calendario_id ?? calendarios[0]?.id ?? ''))
    setRepite(ev?.se_repite || '')
    setLugar(ev?.lugar || '')
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!titulo.trim()) { toast('Falta el título', 'warn'); return }
    setBusy(true)
    const body = {
      titulo: titulo.trim(),
      descripcion: desc.trim() || null,
      todo_el_dia: todoDia,
      fecha_inicio: todoDia ? fecha : `${fecha}T${hIni}`,
      fecha_fin: todoDia ? (fechaFin || fecha) : `${fechaFin || fecha}T${hFin}`,
      calendario_id: calId ? Number(calId) : null,
      se_repite: repite || null,
    }
    if (lugar.trim()) body.lugar = lugar.trim()
    const ok = editando ? await editarEvento(ev.id, body) : await crearEvento(body)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? 'Editar evento' : 'Nuevo evento'}
      icon={CalendarPlus}
      width={560}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={() => setConfirm(true)}>Eliminar</Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') guardar() }}>
        <Field label="Título" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Reunión, cumpleaños, deploy…" />
        </Field>

        <Switch checked={todoDia} onChange={setTodoDia} label="Todo el día" />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empieza" required>
            <div className="flex gap-2">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              {!todoDia && <Input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} className="w-[104px]" />}
            </div>
          </Field>
          <Field label="Termina" hint="Vacío = mismo día">
            <div className="flex gap-2">
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              {!todoDia && <Input type="time" value={hFin} onChange={(e) => setHFin(e.target.value)} className="w-[104px]" />}
            </div>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Calendario">
            <Select
              value={calId}
              onChange={(e) => setCalId(e.target.value)}
              placeholder="Sin calendario"
              options={calendarios.map((c) => ({ value: c.id, label: c.nombre }))}
            />
          </Field>
          <Field label="Repetición">
            <Select value={repite} onChange={(e) => setRepite(e.target.value)} options={REPETICIONES} />
          </Field>
        </div>

        <Field label="Lugar">
          <Input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Opcional" />
        </Field>

        <Field label="Descripción">
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
        </Field>

        {editando && ev.serie_id && (
          <div className="surface flex items-center gap-3 px-3 py-2.5">
            <p className="flex-1 text-[11.5px] text-txt-sub">Este evento es parte de una serie recurrente.</p>
            <Button size="sm" onClick={() => detenerSerie('evento', ev.serie_id)}>Detener repeticiones</Button>
          </div>
        )}
      </div>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Eliminar evento"
        body="Se borra solo esta ocurrencia. Si es una serie, las próximas se siguen generando salvo que la detengas."
        onConfirm={async () => { await borrarEvento(ev.id); close() }}
      />
    </Modal>
  )
}

const sumarHora = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return `${pad((h + 1) % 24)}:${pad(m || 0)}`
}

/* ═══ Tarea ══════════════════════════════════════════════════════════ */
export function TareaModal() {
  const data = useAgenda((s) => s.tareaModal)
  const close = useAgenda((s) => s.closeTarea)
  const { listas, crearTarea, editarTarea, borrarTarea, detenerSerie } = useAgenda()
  const open = !!data
  const t = data?.tarea
  const editando = !!t?.id && t.id > 0

  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [bloque, setBloque] = useState('')
  const [dur, setDur] = useState('')
  const [listaId, setListaId] = useState('')
  const [repite, setRepite] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitulo(t?.titulo || t?.nombre || '')
    setDesc(t?.descripcion || '')
    setFecha(t?.fecha ? String(t.fecha).slice(0, 10) : data?.fecha || '')
    setHora(t?.hora || '')
    setBloque(t?.hora_bloque || data?.hora_bloque || '')
    setDur(t?.duracion_estimada != null ? String(t.duracion_estimada) : '')
    setListaId(String(t?.lista_id ?? data?.lista_id ?? listas[0]?.id ?? ''))
    setRepite(t?.se_repite || '')
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!titulo.trim()) { toast('Falta el título', 'warn'); return }
    setBusy(true)
    const body = {
      titulo: titulo.trim(),
      descripcion: desc.trim() || null,
      fecha: fecha || null,
      hora: hora || null,
      hora_bloque: bloque || null,
      duracion_estimada: dur ? Number(dur) : null,
      lista_id: listaId ? Number(listaId) : null,
      se_repite: repite || null,
    }
    const ok = editando ? await editarTarea(t.id, body) : await crearTarea(body)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? 'Editar tarea' : 'Nueva tarea'}
      icon={ListPlus}
      width={540}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarTarea(t.id); close() }}>Eliminar</Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') guardar() }}>
        <Field label="Título" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Comprar, escribir, llamar…" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lista">
            <Select value={listaId} onChange={(e) => setListaId(e.target.value)} placeholder="Sin lista" options={listas.map((l) => ({ value: l.id, label: l.nombre }))} />
          </Field>
          <Field label="Repetición">
            <Select value={repite} onChange={(e) => setRepite(e.target.value)} options={REPETICIONES} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha" hint="Opcional">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Hora límite">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Field>
          <Field label="Bloque" hint="Time blocking">
            <Input type="time" value={bloque} onChange={(e) => setBloque(e.target.value)} />
          </Field>
        </div>
        <Field label="Duración estimada (minutos)">
          <Input value={dur} onChange={(e) => setDur(e.target.value)} type="number" min="5" step="5" placeholder="30" className="mono" />
        </Field>
        <Field label="Notas">
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
        </Field>
        {editando && t.serie_id && (
          <div className="surface flex items-center gap-3 px-3 py-2.5">
            <p className="flex-1 text-[11.5px] text-txt-sub">Tarea recurrente.</p>
            <Button size="sm" onClick={() => detenerSerie('tarea', t.serie_id)}>Detener repeticiones</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ═══ Calendario ═════════════════════════════════════════════════════ */
export function CalendarioModal() {
  const data = useAgenda((s) => s.calendarioModal)
  const close = useAgenda((s) => s.closeCalendario)
  const { calendarios, crearCalendario, editarCalendario, borrarCalendario } = useAgenda()
  const open = !!data
  const c = data?.calendario
  const editando = !!c?.id

  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(CAL_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [destino, setDestino] = useState('')

  useEffect(() => {
    if (!open) return
    setNombre(c?.nombre || '')
    setColor(c?.color || CAL_COLORS[0])
    setBusy(false)
    setBorrando(false)
    setDestino('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const otros = calendarios.filter((x) => x.id !== c?.id)

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Calendario: ${c?.nombre}` : 'Nuevo calendario'}
      icon={CalendarDays}
      width={460}
      footer={
        <>
          {editando && !borrando && (
            <Button variant="danger" className="mr-auto" onClick={() => setBorrando(true)}>Eliminar</Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          {!borrando && (
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!nombre.trim()) return
                setBusy(true)
                const ok = editando
                  ? await editarCalendario(c.id, { nombre: nombre.trim(), color })
                  : await crearCalendario({ nombre: nombre.trim(), color, activo: true })
                setBusy(false)
                if (ok) close()
              }}
            >
              {editando ? 'Guardar' : 'Crear'}
            </Button>
          )}
        </>
      }
    >
      {borrando ? (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-txt-2">
            ¿Qué hacemos con los eventos de <b>{c?.nombre}</b>?
          </p>
          {otros.length > 0 && (
            <Field label="Mover a otro calendario">
              <Select value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="— No mover —" options={otros.map((x) => ({ value: x.id, label: x.nombre }))} />
            </Field>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setBorrando(false)}>Volver</Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={async () => { await borrarCalendario(c.id, destino ? Number(destino) : null); close() }}
            >
              {destino ? 'Mover y eliminar' : 'Eliminar con sus eventos'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Nombre" required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Personal, Trabajo, Familia…" />
          </Field>
          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} colors={CAL_COLORS} />
          </Field>
        </div>
      )}
    </Modal>
  )
}

/* ═══ Lista de tareas ════════════════════════════════════════════════ */
export function ListaModal() {
  const data = useAgenda((s) => s.listaModal)
  const close = useAgenda((s) => s.closeLista)
  const { crearLista, editarLista, borrarLista } = useAgenda()
  const open = !!data
  const l = data?.lista
  const editando = !!l?.id

  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState(CAL_COLORS[2])
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(l?.nombre || '')
    setColor(l?.color || CAL_COLORS[2])
    setPinned(!!l?.pinned)
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Lista: ${l?.nombre}` : 'Nueva lista'}
      icon={ListPlus}
      width={440}
      footer={
        <>
          {editando && (
            <Button variant="danger" className="mr-auto" onClick={async () => { await borrarLista(l.id); close() }}>Eliminar</Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!nombre.trim()) return
              setBusy(true)
              const ok = editando
                ? await editarLista(l.id, { nombre: nombre.trim(), color, pinned })
                : await crearLista({ nombre: nombre.trim(), color, pinned })
              setBusy(false)
              if (ok) close()
            }}
          >
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Casa, Facultad, Compras…" />
        </Field>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} colors={CAL_COLORS} />
        </Field>
        <Checkbox checked={pinned} onChange={setPinned} label={<span className="text-[12.5px]">Fijar arriba en la vista Canvas</span>} />
      </div>
    </Modal>
  )
}

/* ═══ Horario Facultad ═══════════════════════════════════════════════ */
export function FacultadModal() {
  const open = useAgenda((s) => s.facultadModal)
  const close = useAgenda((s) => s.closeFacultad)
  const { horario, crearHorario, editarHorario, borrarHorario } = useAgenda()
  const [f, setF] = useState({ materia: '', dia_semana: 0, hora_inicio: '08:00', hora_fin: '10:00', aula: '', color: '#3b82f6' })
  const [busy, setBusy] = useState(false)

  const porDia = useMemo(() => {
    const m = new Map()
    for (const h of horario) {
      const d = Number(h.dia_semana)
      if (!m.has(d)) m.set(d, [])
      m.get(d).push(h)
    }
    for (const arr of m.values()) arr.sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)))
    return m
  }, [horario])

  const agregar = async () => {
    if (!f.materia.trim()) { toast('Falta la materia', 'warn'); return }
    setBusy(true)
    const ok = await crearHorario({
      materia: f.materia.trim(),
      dia_semana: Number(f.dia_semana),
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
      aula: f.aula.trim() || null,
      color: f.color,
    })
    setBusy(false)
    if (ok) setF({ ...f, materia: '', aula: '' })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Horario de facultad"
      sub="Recurrente por día de semana. Solo se ve en la grilla horaria de HOY."
      icon={GraduationCap}
      width={680}
      footer={<Button variant="ghost" onClick={close}>Cerrar</Button>}
    >
      <div className="space-y-4">
        <div className="surface space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr,130px]">
            <Field label="Materia" required>
              <Input value={f.materia} onChange={(e) => setF({ ...f, materia: e.target.value })} placeholder="Análisis II" />
            </Field>
            <Field label="Día">
              <Select
                value={f.dia_semana}
                onChange={(e) => setF({ ...f, dia_semana: e.target.value })}
                options={DIAS_LUN_L.map((d, i) => ({ value: i, label: d }))}
              />
            </Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Desde">
              <Input type="time" value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />
            </Field>
            <Field label="Hasta">
              <Input type="time" value={f.hora_fin} onChange={(e) => setF({ ...f, hora_fin: e.target.value })} />
            </Field>
            <Field label="Aula">
              <Input value={f.aula} onChange={(e) => setF({ ...f, aula: e.target.value })} placeholder="Opcional" />
            </Field>
          </div>
          <div className="flex items-end justify-between gap-3">
            <Field label="Color" className="flex-1">
              <ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} colors={CAL_COLORS} />
            </Field>
            <Button variant="primary" icon={Plus} loading={busy} onClick={agregar}>Agregar</Button>
          </div>
        </div>

        <div className="space-y-3">
          {DIAS_LUN_L.map((dia, i) => {
            const clases = porDia.get(i) || []
            if (!clases.length) return null
            return (
              <div key={i}>
                <h4 className="label mb-1.5">{dia}</h4>
                <div className="space-y-1">
                  {clases.map((h) => (
                    <div key={h.id} className="surface group flex items-center gap-2.5 px-2.5 py-2">
                      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: h.color || '#3b82f6' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate1 text-[12.5px]">{h.materia}</span>
                        <span className="mono block text-[10.5px] text-txt-mute">
                          {h.hora_inicio}–{h.hora_fin}{h.aula ? ` · ${h.aula}` : ''}
                        </span>
                      </span>
                      <IconButton
                        icon={Trash2}
                        size={12}
                        label="Eliminar"
                        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => borrarHorario(h.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {horario.length === 0 && (
            <p className="py-4 text-center text-[12px] text-txt-mute">Sin clases cargadas todavía.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
