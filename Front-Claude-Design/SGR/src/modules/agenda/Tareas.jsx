import { useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, LayoutGrid, List, ListPlus, Pencil, Pin, PinOff, Plus, Trash2,
} from 'lucide-react'
import {
  Button, Card, CardHead, Checkbox, Chip, Empty, IconButton, Input, Progress, Tabs, cx,
} from '../../ui/primitives'
import { useAgenda } from '../../store/agenda'
import { fmtDate, toISODate } from '../../lib/dates'

const FILTROS = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'completadas', label: 'Hechas' },
  { id: 'todas', label: 'Todas' },
]

export function Tareas() {
  const {
    tareas, listas, filtroTareas, setFiltroTareas, vistaTareas, setVistaTareas, listaSel,
    tareaSel, setTareaSel, toggleTarea, openTarea, crearTarea, openLista,
  } = useAgenda()

  const pasa = (t) =>
    filtroTareas === 'todas' || (filtroTareas === 'completadas' ? !!t.completada : !t.completada)

  const visibles = useMemo(() => {
    let out = tareas.filter(pasa)
    if (listaSel === '__sin_fecha__') out = out.filter((t) => !t.fecha)
    else if (listaSel) out = out.filter((t) => String(t.lista_id) === String(listaSel))
    return out.sort(
      (a, b) =>
        Number(!!a.completada) - Number(!!b.completada) ||
        String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')) ||
        String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'),
    )
  }, [tareas, filtroTareas, listaSel])

  const conteoFiltro = (id) =>
    tareas.filter((t) => (id === 'todas' ? true : id === 'completadas' ? t.completada : !t.completada)).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={filtroTareas}
          onChange={setFiltroTareas}
          items={FILTROS.map((f) => ({ ...f, badge: conteoFiltro(f.id) }))}
        />
        <Tabs
          value={vistaTareas}
          onChange={setVistaTareas}
          items={[{ id: 'lista', label: 'Lista', icon: List }, { id: 'canvas', label: 'Canvas', icon: LayoutGrid }]}
        />
        <Button
          variant="primary"
          icon={Plus}
          className="ml-auto"
          onClick={() => openTarea({ lista_id: listaSel && listaSel !== '__sin_fecha__' ? Number(listaSel) : undefined })}
        >
          Tarea
        </Button>
      </div>

      {vistaTareas === 'canvas' ? (
        <CanvasTareas />
      ) : (
        <Card>
          <CardHead
            title={
              listaSel === '__sin_fecha__'
                ? 'Sin fecha'
                : listas.find((l) => String(l.id) === String(listaSel))?.nombre || 'Todas las tareas'
            }
            sub={`${visibles.length} tarea${visibles.length === 1 ? '' : 's'}`}
            icon={ListPlus}
          />
          <QuickAdd listaId={listaSel !== '__sin_fecha__' ? listaSel : null} onAdd={crearTarea} />
          {visibles.length === 0 ? (
            <Empty
              icon={CheckCircle2}
              title={filtroTareas === 'pendientes' ? 'Nada pendiente' : 'Sin tareas'}
              body="Escribí arriba y apretá Enter para cargar una tarea en dos segundos."
            />
          ) : (
            <div className="scroll max-h-[calc(100vh-300px)] space-y-0.5 px-2 pb-2">
              {visibles.map((t, i) => (
                <TareaRow
                  key={t.id}
                  t={t}
                  activo={String(tareaSel) === String(t.id)}
                  onToggle={() => toggleTarea(t)}
                  onSelect={() => setTareaSel(t.id)}
                  onEdit={() => openTarea({ tarea: t })}
                  delay={i * 22}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function TareaRow({ t, activo, onToggle, onSelect, onEdit, delay = 0 }) {
  const color = t.lista_color || 'var(--accent)'
  const vencida = !t.completada && t.fecha && String(t.fecha).slice(0, 10) < toISODate()
  return (
    <div
      className="group flex items-start gap-2.5 rounded-[10px] px-2 py-2 transition-all duration-150 hover:bg-elev"
      style={{
        boxShadow: activo ? `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)` : undefined,
        animation: `slideUp 300ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
      }}
      onClick={onSelect}
    >
      <Checkbox checked={!!t.completada} onChange={onToggle} color={color} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate1 text-[13px]', t.completada && 'text-txt-mute line-through')}>
          {t.titulo || t.nombre}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-txt-mute">
          {t.fecha && (
            <span style={vencida ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
              {fmtDate(t.fecha)}{vencida ? ' · vencida' : ''}
            </span>
          )}
          {t.hora && <span className="mono">· {t.hora}</span>}
          {t.hora_bloque && <span style={{ color: 'var(--accent)' }}>· bloque {t.hora_bloque}</span>}
          {t.duracion_estimada ? <span>· {t.duracion_estimada} min</span> : null}
          {t.lista_nombre && <Chip color={color} className="ml-1">{t.lista_nombre}</Chip>}
          {t._pending && <span className="chip text-[9px]">sin guardar</span>}
        </div>
        {t.descripcion && <p className="clamp2 mt-1 text-[11px] text-txt-sub">{t.descripcion}</p>}
      </div>
      <IconButton
        icon={Pencil}
        size={12}
        label="Editar"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onEdit() }}
      />
    </div>
  )
}

function QuickAdd({ listaId, onAdd, compact }) {
  const [txt, setTxt] = useState('')
  return (
    <form
      className={cx('flex gap-2', compact ? 'px-2 pb-2' : 'px-3.5 pb-3')}
      onSubmit={(e) => {
        e.preventDefault()
        if (!txt.trim()) return
        onAdd({ titulo: txt.trim(), lista_id: listaId ? Number(listaId) : null, completada: false })
        setTxt('')
      }}
    >
      <Input
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        placeholder="Nueva tarea + Enter"
        className={compact ? 'h-8 text-[12px]' : undefined}
      />
      <Button variant="primary" icon={Plus} type="submit" size={compact ? 'sm' : undefined} />
    </form>
  )
}

/** Vista Canvas: todas las listas a la vez, las pineadas arriba. */
function CanvasTareas() {
  const { tareas, listas, filtroTareas, toggleTarea, openTarea, openLista, crearTarea, togglePin } = useAgenda()

  const pasa = (t) =>
    filtroTareas === 'todas' || (filtroTareas === 'completadas' ? !!t.completada : !t.completada)

  const cards = useMemo(() => {
    const orden = [...listas].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(a.nombre).localeCompare(String(b.nombre), 'es'),
    )
    const out = orden.map((l) => ({
      lista: l,
      tareas: tareas.filter((t) => String(t.lista_id) === String(l.id) && pasa(t)),
      total: tareas.filter((t) => String(t.lista_id) === String(l.id)).length,
    }))
    // "Sin fecha" es un filtro virtual, no una lista real: va de solo lectura.
    const sinFecha = tareas.filter((t) => !t.fecha && pasa(t))
    if (sinFecha.length) {
      out.push({
        virtual: true,
        lista: { id: '__sin_fecha__', nombre: 'Sin fecha', color: 'var(--mute)' },
        tareas: sinFecha,
        total: sinFecha.length,
      })
    }
    return out
  }, [listas, tareas, filtroTareas])

  if (!listas.length) {
    return (
      <Card>
        <Empty
          icon={LayoutGrid}
          title="Sin listas"
          body="Creá una lista (Casa, Facultad, Compras…) y la vista Canvas te muestra todas juntas."
          action={<Button variant="primary" icon={Plus} onClick={() => openLista({})}>Nueva lista</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="stagger grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {cards.map(({ lista, tareas: tks, total, virtual }) => {
        const hechas = tks.filter((t) => t.completada).length
        return (
          <Card key={lista.id} lift spot className="flex flex-col">
            <CardHead
              title={
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: lista.color || 'var(--accent)' }} />
                  {lista.nombre}
                </span>
              }
              sub={virtual ? 'Filtro virtual · solo lectura' : `${total} tarea${total === 1 ? '' : 's'}`}
              right={
                virtual ? null : (
                  <>
                    <IconButton
                      icon={lista.pinned ? Pin : PinOff}
                      label={lista.pinned ? 'Desfijar' : 'Fijar arriba'}
                      active={!!lista.pinned}
                      onClick={() => togglePin(lista)}
                    />
                    <IconButton icon={Pencil} label="Editar lista" onClick={() => openLista({ lista })} />
                  </>
                )
              }
            />
            {total > 0 && (
              <div className="px-3.5 pb-2">
                <Progress value={hechas} max={total} color={lista.color || 'var(--accent)'} height={4} />
              </div>
            )}
            <div className="scroll max-h-[300px] flex-1 space-y-0.5 px-2">
              {tks.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] text-txt-mute">Nada acá.</p>
              ) : (
                tks.map((t, i) => (
                  <TareaRow key={t.id} t={t} onToggle={() => toggleTarea(t)} onEdit={() => openTarea({ tarea: t })} delay={i * 18} />
                ))
              )}
            </div>
            {!virtual && <QuickAdd listaId={lista.id} onAdd={crearTarea} compact />}
          </Card>
        )
      })}
    </div>
  )
}

/* ── Panel izquierdo: listas ──────────────────────────────────────── */
export function TareasLeft() {
  const { listas, tareas, listaSel, setListaSel, openLista } = useAgenda()

  const conteo = useMemo(() => {
    const m = new Map()
    for (const t of tareas) if (!t.completada) m.set(String(t.lista_id), (m.get(String(t.lista_id)) || 0) + 1)
    return m
  }, [tareas])

  const sinFecha = tareas.filter((t) => !t.fecha && !t.completada).length
  const items = [
    { id: null, nombre: 'Todas', color: 'var(--accent)', n: tareas.filter((t) => !t.completada).length },
    ...[...listas]
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .map((l) => ({ id: l.id, nombre: l.nombre, color: l.color, pinned: l.pinned, n: conteo.get(String(l.id)) || 0, lista: l })),
    { id: '__sin_fecha__', nombre: 'Sin fecha', color: 'var(--mute)', n: sinFecha, virtual: true },
  ]

  return (
    <Card spot>
      <CardHead
        title="Listas"
        sub={`${listas.length} creada${listas.length === 1 ? '' : 's'}`}
        icon={List}
        right={<IconButton icon={Plus} label="Nueva lista" onClick={() => openLista({})} />}
      />
      <div className="space-y-1 px-2.5 pb-3">
        {items.map((it) => {
          const on = String(listaSel ?? '') === String(it.id ?? '')
          return (
            <div
              key={String(it.id)}
              className="group flex items-center gap-2 rounded-[9px] px-1.5 py-1.5 transition-all duration-200"
              style={{
                background: on ? `color-mix(in srgb, ${it.color} 17%, transparent)` : undefined,
                boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${it.color} 34%, transparent)` : undefined,
              }}
            >
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setListaSel(it.id)}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                <span className="truncate1 text-[12.5px]">{it.nombre}</span>
                {it.pinned && <Pin size={9} className="shrink-0 text-txt-mute" />}
                <span className="badge ml-auto shrink-0">{it.n}</span>
              </button>
              {it.lista && (
                <IconButton
                  icon={Pencil}
                  size={11}
                  label="Editar"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => openLista({ lista: it.lista })}
                />
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ── Panel derecho: detalle de la tarea ───────────────────────────── */
export function TareasRight() {
  const { tareas, tareaSel, toggleTarea, openTarea, borrarTarea, editarTarea } = useAgenda()
  const t = tareas.find((x) => String(x.id) === String(tareaSel))

  if (!t) {
    return (
      <Card>
        <Empty icon={Circle} title="Elegí una tarea" body="Hacé clic en cualquier tarea para ver el detalle acá." />
      </Card>
    )
  }
  const color = t.lista_color || 'var(--accent)'
  return (
    <Card spot>
      <CardHead
        title="Detalle"
        right={
          <>
            <IconButton icon={Pencil} label="Editar" onClick={() => openTarea({ tarea: t })} />
            <IconButton icon={Trash2} label="Eliminar" onClick={() => borrarTarea(t.id)} />
          </>
        }
      />
      <div className="space-y-3.5 px-3.5 pb-3.5">
        <div className="flex items-start gap-2.5">
          <Checkbox checked={!!t.completada} onChange={() => toggleTarea(t)} color={color} className="mt-1" />
          <h3 className={cx('flex-1 text-[15px] font-medium leading-snug', t.completada && 'text-txt-mute line-through')}>
            {t.titulo || t.nombre}
          </h3>
        </div>

        {t.descripcion && (
          <p className="surface whitespace-pre-wrap p-3 text-[12.5px] leading-relaxed text-txt-2">{t.descripcion}</p>
        )}

        <dl className="space-y-2 text-[12px]">
          {[
            ['Lista', t.lista_nombre || '—'],
            ['Fecha', t.fecha ? fmtDate(t.fecha, { day: '2-digit', month: 'long', year: 'numeric' }) : 'Sin fecha'],
            ['Hora', t.hora || '—'],
            ['Bloque', t.hora_bloque || '—'],
            ['Duración', t.duracion_estimada ? `${t.duracion_estimada} min` : '—'],
            ['Repite', t.se_repite || 'No'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
              <dt className="text-txt-sub">{k}</dt>
              <dd className="truncate1 text-right">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => editarTarea(t.id, { fecha: toISODate() })}>Para hoy</Button>
          <Button size="sm" className="flex-1" onClick={() => editarTarea(t.id, { fecha: null, hora: null, hora_bloque: null })}>Sin fecha</Button>
        </div>
      </div>
    </Card>
  )
}
