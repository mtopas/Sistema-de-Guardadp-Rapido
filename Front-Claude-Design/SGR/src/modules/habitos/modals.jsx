import { useEffect, useState } from 'react'
import { Check, CircleDashed, Flame, Trash2 } from 'lucide-react'
import {
  Button, Checkbox, ColorPicker, Confirm, Field, Input, Modal, Select, Switch, Textarea, cx,
} from '../../ui/primitives'
import { HABITO_COLORS, useHabitos } from '../../store/habitos'
import { diasDe } from '../../lib/habitos'
import { DIAS_C, fmtDateLong, monToJs } from '../../lib/dates'
import { toast } from '../../store/ui'

/* ═══ Alta / edición de hábito ═══════════════════════════════════════ */
export function HabitoModal() {
  const data = useHabitos((s) => s.modal)
  const close = useHabitos((s) => s.closeModal)
  const { crear, editar, borrar } = useHabitos()
  const open = !!data
  const h = data?.habito
  const editando = !!h?.id && h.id > 0

  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  const [categoria, setCategoria] = useState('')
  const [color, setColor] = useState(HABITO_COLORS[0])
  const [diario, setDiario] = useState(true)
  const [dias, setDias] = useState([1, 2, 3, 4, 5])
  const [hora, setHora] = useState('')
  const [activo, setActivo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(h?.nombre || '')
    setDesc(h?.descripcion || '')
    setCategoria(h?.categoria || '')
    setColor(h?.color || HABITO_COLORS[0])
    setDiario((h?.frecuencia_tipo || 'diario') !== 'semanal')
    setDias(h ? (diasDe(h).length ? diasDe(h) : [1, 2, 3, 4, 5]) : [1, 2, 3, 4, 5])
    setHora(h?.hora || '')
    setActivo(h ? h.activo !== false : true)
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDia = (js) => setDias((d) => (d.includes(js) ? d.filter((x) => x !== js) : [...d, js].sort()))

  const guardar = async () => {
    if (!nombre.trim()) { toast('Falta el nombre', 'warn'); return }
    if (!diario && dias.length === 0) { toast('Elegí al menos un día', 'warn'); return }
    setBusy(true)
    const body = {
      nombre: nombre.trim(),
      descripcion: desc.trim() || null,
      categoria: categoria.trim() || null,
      color,
      frecuencia_tipo: diario ? 'diario' : 'semanal',
      dias_semana: diario ? null : JSON.stringify(dias),
      hora: hora || null,
      activo,
    }
    const ok = editando ? await editar(h.id, body) : await crear(body)
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={editando ? `Hábito: ${h?.nombre}` : 'Nuevo hábito'}
      sub="Un hábito con hora también aparece en la grilla horaria de Agenda › HOY."
      icon={Flame}
      width={540}
      footer={
        <>
          {editando && (
            <Button variant="danger" icon={Trash2} className="mr-auto" onClick={() => setConfirm(true)}>Eliminar</Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') guardar() }}>
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Meditar 10 min, Correr, Leer…" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1fr,120px]">
          <Field label="Categoría" hint="Texto libre, para agrupar">
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Salud, Estudio…" />
          </Field>
          <Field label="Hora" hint="Opcional">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Field>
        </div>

        <Field label="Frecuencia">
          <div className="tabs mb-2.5">
            <button type="button" className="tab flex-1" data-on={diario} onClick={() => setDiario(true)}>
              {diario && <span className="tab-pill" />}
              <span className="relative z-10">Todos los días</span>
            </button>
            <button type="button" className="tab flex-1" data-on={!diario} onClick={() => setDiario(false)}>
              {!diario && <span className="tab-pill" />}
              <span className="relative z-10">Días específicos</span>
            </button>
          </div>
          {!diario && (
            <div className="flex gap-1.5 a-down">
              {[0, 1, 2, 3, 4, 5, 6].map((monIdx) => {
                const js = monToJs(monIdx)
                const on = dias.includes(js)
                return (
                  <button
                    key={js}
                    type="button"
                    onClick={() => toggleDia(js)}
                    className="flex-1 rounded-[9px] py-2 text-[11px] font-semibold transition-all duration-200 ease-spring"
                    style={{
                      background: on ? color : 'color-mix(in srgb, var(--elev) 70%, transparent)',
                      color: on ? '#fff' : 'var(--subtext)',
                      transform: on ? 'scale(1.04)' : 'scale(1)',
                      boxShadow: on ? `0 6px 16px -8px ${color}` : 'inset 0 0 0 1px var(--border)',
                    }}
                  >
                    {DIAS_C[js]}
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} colors={HABITO_COLORS} />
        </Field>

        <Field label="Descripción">
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Por qué te importa este hábito" />
        </Field>

        {editando && (
          <Switch checked={activo} onChange={setActivo} label="Activo (los inactivos no se programan ni rompen rachas)" />
        )}
      </div>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Eliminar “${h?.nombre}”`}
        body="Se borran también todos sus registros (CASCADE). No hay deshacer."
        onConfirm={async () => { await borrar(h.id); close() }}
      />
    </Modal>
  )
}

/* ═══ Completar un día ═══════════════════════════════════════════════ */
export function CompletarModal() {
  const data = useHabitos((s) => s.completar)
  const close = useHabitos((s) => s.closeCompletar)
  const { registros, registrar, desmarcar } = useHabitos()
  const open = !!data
  const h = data?.habito
  const fecha = data?.fecha
  const actual = registros.find((r) => r.habito_id === h?.id && r.fecha === fecha)

  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setNota(actual?.nota || ''); setBusy(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const marcar = async (valor) => {
    setBusy(true)
    await registrar(h.id, fecha, valor, nota || null)
    setBusy(false)
    close()
  }

  const color = h?.color || 'var(--accent)'

  return (
    <Modal
      open={open}
      onClose={close}
      title={h?.nombre || 'Registrar'}
      sub={fecha ? fmtDateLong(fecha) : undefined}
      icon={Flame}
      width={430}
      footer={
        <>
          {actual && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => { setBusy(true); await desmarcar(h.id, fecha); setBusy(false); close() }}
            >
              Desmarcar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancelar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => marcar(1)}
            className="surface flex flex-col items-center gap-1.5 py-4 transition-all duration-200 ease-swift hover:-translate-y-0.5"
            style={{
              boxShadow: actual?.valor >= 1
                ? 'inset 0 0 0 1.5px var(--success), 0 12px 26px -16px var(--success)'
                : 'inset 0 0 0 1px var(--border)',
            }}
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--success) 22%, transparent)', color: 'var(--success)' }}
            >
              <Check size={18} />
            </span>
            <span className="text-[13px] font-semibold">Total</span>
            <span className="mono text-[10px] text-txt-mute">valor 1.0</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => marcar(0.5)}
            className="surface flex flex-col items-center gap-1.5 py-4 transition-all duration-200 ease-swift hover:-translate-y-0.5"
            style={{
              boxShadow: actual?.valor === 0.5
                ? 'inset 0 0 0 1.5px var(--warning), 0 12px 26px -16px var(--warning)'
                : 'inset 0 0 0 1px var(--border)',
            }}
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--warning) 22%, transparent)', color: 'var(--warning)' }}
            >
              <CircleDashed size={18} />
            </span>
            <span className="text-[13px] font-semibold">Parcial</span>
            <span className="mono text-[10px] text-txt-mute">valor 0.5</span>
          </button>
        </div>

        <Field label="Nota corta" hint="Se ve al pasar el mouse en Historial.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" maxLength={140} />
        </Field>

        <p className="text-[11px] leading-relaxed text-txt-mute">
          Un parcial mantiene la racha viva: la racha cuenta días con valor mayor a cero.
        </p>
      </div>
    </Modal>
  )
}
