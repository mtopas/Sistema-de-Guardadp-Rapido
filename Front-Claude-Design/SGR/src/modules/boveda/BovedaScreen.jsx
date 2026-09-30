import { useEffect, useMemo, useState } from 'react'
import {
  Brain, ChevronRight, Clock, ExternalLink, FolderPlus, Image as ImageIcon, LayoutList,
  Link2, Network, Pencil, Plus, RefreshCw, Save, Search, Trash2, Type, X,
} from 'lucide-react'
import {
  Button, Card, CardHead, Chip, ColorPicker, Confirm, Empty, Field, IconButton, Input, Modal,
  SearchInput, Select, Skeleton, SkeletonList, Tabs, ThreeCol, cx,
} from '../../ui/primitives'
import { RichEditor } from '../../ui/RichEditor'
import { Graph } from './Graph'
import {
  buildTree, descendantIds, hojaTitulo, hostDe, isBasura, rutaCategoria, stripHtml, useBoveda,
} from '../../store/boveda'
import { hashColor } from '../../lib/fin'
import { fmtDate, relTime } from '../../lib/dates'
import { assetUrl } from '../../lib/api'
import { useDebounced } from '../../ui/hooks'

const TIPO_ICON = { link: Link2, foto: ImageIcon, texto: Type }

export default function BovedaScreen() {
  const s = useBoveda()
  const [catModal, setCatModal] = useState(null)
  const q = useDebounced(s.q, 250)

  useEffect(() => {
    s.fetchAll()
    s.fetchRecientes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibles = useMemo(() => {
    let out = s.semanticos
      ? s.semanticos.map((r) => s.hojas.find((h) => h.id === (r.id ?? r.hoja_id)) || r)
      : s.hojas
    out = out.filter((h) => h && !isBasura({ nombre: h.categoria_nombre }))
    if (s.catFilter) {
      const ids = descendantIds(s.categorias, s.catFilter)
      out = out.filter((h) => ids.has(h.categoria_id))
    }
    if (s.tipoFilter) out = out.filter((h) => h.tipo === s.tipoFilter)
    if (q && !s.semanticos) {
      const t = q.toLowerCase()
      out = out.filter((h) =>
        `${hojaTitulo(h)} ${h.contenido || ''} ${stripHtml(h.apuntes)} ${h.categoria_nombre || ''}`.toLowerCase().includes(t),
      )
    }
    return out
  }, [s.hojas, s.semanticos, s.catFilter, s.tipoFilter, q, s.categorias])

  const sel = s.hojas.find((h) => h.id === s.selectedId) || null

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2.5">
        <Tabs
          value={s.vista}
          onChange={s.setVista}
          items={[
            { id: 'grafo', label: 'Grafo', icon: Network },
            { id: 'lista', label: 'Lista', icon: LayoutList, badge: visibles.length },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          {['texto', 'link', 'foto'].map((t) => {
            const Icon = TIPO_ICON[t]
            const on = s.tipoFilter === t
            return (
              <IconButton
                key={t}
                icon={Icon}
                label={`Solo ${t}`}
                active={on}
                onClick={() => s.setTipoFilter(on ? null : t)}
              />
            )
          })}
          <Button variant="primary" icon={Plus} onClick={() => s.openCaptura()}>Capturar</Button>
        </div>
      </div>

      <ThreeCol
        left={
          <LeftPanel
            s={s}
            onNuevaCat={(padre) => setCatModal({ padre_id: padre ?? null })}
            onEditarCat={(c) => setCatModal(c)}
          />
        }
        center={
          s.vista === 'grafo' ? (
            <Card className="h-[calc(100vh-150px)] overflow-hidden" spot>
              {!s.loaded ? (
                <div className="grid h-full place-items-center"><Skeleton h={220} w={220} className="rounded-full" /></div>
              ) : s.hojas.length === 0 && s.categorias.length === 0 ? (
                <Empty
                  icon={Network}
                  title="La Bóveda está vacía"
                  body="Creá una categoría en el panel izquierdo y capturá tu primera hoja. Todo se guarda en la API local."
                  action={<Button variant="primary" icon={Plus} onClick={() => s.openCaptura()}>Capturar la primera</Button>}
                />
              ) : (
                <Graph
                  categorias={s.categorias.filter((c) => !isBasura(c))}
                  hojas={visibles}
                  selectedId={s.selectedId}
                  onSelect={s.select}
                  catFilter={s.catFilter}
                  onCatFilter={s.setCatFilter}
                />
              )}
            </Card>
          ) : (
            <ListaHojas s={s} hojas={visibles} />
          )
        }
        right={<DetallePanel s={s} hoja={sel} />}
      />

      <CategoriaModal open={!!catModal} data={catModal} onClose={() => setCatModal(null)} s={s} />
    </>
  )
}

/* ── Panel izquierdo: árbol + búsqueda ─────────────────────────────── */
function LeftPanel({ s, onNuevaCat, onEditarCat }) {
  const [abiertos, setAbiertos] = useState({})
  const [confirm, setConfirm] = useState(null)
  const tree = useMemo(() => buildTree(s.categorias), [s.categorias])

  const conteo = useMemo(() => {
    const m = new Map()
    for (const h of s.hojas) m.set(h.categoria_id, (m.get(h.categoria_id) || 0) + 1)
    return m
  }, [s.hojas])

  const totalDe = (node) => {
    let t = conteo.get(node.id) || 0
    for (const c of node.children) t += totalDe(c)
    return t
  }

  const render = (nodes) =>
    nodes.map((c) => {
      const abierto = abiertos[c.id] ?? c.depth === 0
      const on = s.catFilter === c.id
      const color = c.color || hashColor(c.nombre)
      const n = totalDe(c)
      return (
        <div key={c.id}>
          <div
            className={cx(
              'group flex items-center gap-1.5 rounded-[9px] py-1.5 pr-1 transition-all duration-200',
              on ? '' : 'hover:bg-elev',
            )}
            style={{
              paddingLeft: 6 + c.depth * 12,
              background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : undefined,
              boxShadow: on ? `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)` : undefined,
            }}
          >
            {c.children.length ? (
              <button
                className="grid h-4 w-4 shrink-0 place-items-center text-txt-mute transition-transform duration-200"
                style={{ transform: abierto ? 'rotate(90deg)' : 'none' }}
                onClick={() => setAbiertos((a) => ({ ...a, [c.id]: !abierto }))}
              >
                <ChevronRight size={12} />
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" />
            )}
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => s.setCatFilter(on ? null : c.id)}>
              <span className="shrink-0 text-[12px]" style={{ color }}>{c.icono || '●'}</span>
              <span className="truncate1 text-[12.5px]">{c.nombre}</span>
              {n > 0 && <span className="badge ml-auto shrink-0">{n}</span>}
            </button>
            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <IconButton icon={Plus} size={11} label="Subcategoría" className="h-6 w-6" onClick={() => onNuevaCat(c.id)} />
              <IconButton icon={Pencil} size={11} label="Editar" className="h-6 w-6" onClick={() => onEditarCat(c)} />
              <IconButton icon={Trash2} size={11} label="Eliminar" className="h-6 w-6" onClick={() => setConfirm(c)} />
            </div>
          </div>
          {abierto && c.children.length > 0 && <div className="a-down">{render(c.children)}</div>}
        </div>
      )
    })

  return (
    <div className="space-y-3">
      <Card>
        <CardHead
          title="Buscar"
          icon={Search}
          right={
            <IconButton
              icon={RefreshCw}
              label="Reindexar búsqueda semántica"
              onClick={s.reindexar}
            />
          }
        />
        <div className="space-y-2 px-3 pb-3">
          <SearchInput
            value={s.q}
            onChange={s.setQ}
            placeholder="Título, contenido, apuntes…"
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) s.buscarSemantico(s.q) }}
          />
          <div className="flex gap-1.5">
            <Button size="sm" icon={Brain} className="flex-1" loading={s.busy} onClick={() => s.buscarSemantico(s.q)}>
              Por significado
            </Button>
            {s.semanticos && (
              <Button size="sm" variant="ghost" icon={X} onClick={s.limpiarSemantico}>Salir</Button>
            )}
          </div>
          {s.semanticos && (
            <p className="text-[10.5px]" style={{ color: 'var(--accent)' }}>
              Mostrando {s.semanticos.length} resultados por similitud semántica (RAG).
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Categorías"
          sub={s.catFilter ? rutaCategoria(s.categorias, s.catFilter) : `${s.categorias.length} en el árbol`}
          right={<IconButton icon={FolderPlus} label="Nueva categoría raíz" onClick={() => onNuevaCat(null)} />}
        />
        <div className="scroll max-h-[38vh] px-2 pb-3">
          {!s.loaded ? (
            <SkeletonList rows={6} h={26} />
          ) : tree.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11.5px] text-txt-mute">Sin categorías todavía.</p>
          ) : (
            <div className="stagger">{render(tree)}</div>
          )}
        </div>
        {s.catFilter && (
          <div className="border-t border-line px-3 py-2">
            <button className="text-[11px]" style={{ color: 'var(--accent)' }} onClick={() => s.setCatFilter(null)}>
              ← Ver todas las hojas
            </button>
          </div>
        )}
      </Card>

      <Card>
        <CardHead title="Recientes" icon={Clock} />
        <div className="space-y-0.5 px-2 pb-3">
          {s.recientes.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11.5px] text-txt-mute">Todavía nada.</p>
          ) : (
            s.recientes.slice(0, 8).map((h) => {
              const Icon = TIPO_ICON[h.tipo] || Type
              return (
                <button
                  key={h.id}
                  className="flex w-full items-start gap-2 rounded-[9px] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-elev"
                  onClick={() => s.select(h.id)}
                >
                  <Icon size={12} className="mt-0.5 shrink-0" style={{ color: h.color || hashColor(h.categoria_nombre || '') }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate1 text-[12px]">{hojaTitulo(h)}</span>
                    <span className="block text-[10px] text-txt-mute">{relTime(h.fecha || h.creado_en)}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </Card>

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Eliminar “${confirm?.nombre}”`}
        body="Si la categoría tiene hojas, el backend rechaza el borrado; se puede forzar y las hojas quedan sin categoría."
        cta="Eliminar"
        onConfirm={async () => {
          const r = await s.borrarCategoria(confirm.id)
          if (r?.conflict && window.confirm(`${r.msg}\n\n¿Forzar el borrado?`)) {
            await s.borrarCategoria(confirm.id, true)
          }
        }}
      />
    </div>
  )
}

/* ── Lista de hojas ────────────────────────────────────────────────── */
function ListaHojas({ s, hojas }) {
  if (!s.loaded) return <Card><SkeletonList rows={7} h={62} /></Card>
  if (!hojas.length) {
    return (
      <Card>
        <Empty
          icon={Search}
          title="Nada que mostrar"
          body={s.q || s.catFilter || s.tipoFilter ? 'Probá quitando filtros o buscando por significado.' : 'Capturá tu primera hoja para empezar.'}
          action={<Button variant="primary" icon={Plus} onClick={() => s.openCaptura()}>Capturar</Button>}
        />
      </Card>
    )
  }
  return (
    <div className="stagger grid gap-2.5 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
      {hojas.map((h) => {
        const Icon = TIPO_ICON[h.tipo] || Type
        const color = h.color || hashColor(h.categoria_nombre || h.tipo)
        const on = s.selectedId === h.id
        const foto = h.tipo === 'foto' ? assetUrl(h.contenido) : h.link_preview?.image
        return (
          <Card
            key={h.id}
            as="button"
            lift
            spot
            className="overflow-hidden p-0 text-left"
            style={on ? { boxShadow: `inset 0 0 0 1.5px ${color}, 0 16px 34px -20px ${color}` } : undefined}
            onClick={() => s.select(h.id)}
          >
            {foto && (
              <div className="h-24 w-full overflow-hidden" style={{ background: 'var(--elev)' }}>
                <img src={assetUrl(foto)} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-swift hover:scale-105" />
              </div>
            )}
            <div className="p-3">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px]"
                  style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
                >
                  <Icon size={12} />
                </span>
                <span className="truncate1 flex-1 text-[13px] font-medium">{hojaTitulo(h)}</span>
                {h._pending && <span className="chip text-[9px]">sin guardar</span>}
              </div>
              {h.tipo === 'link' ? (
                <p className="mt-1.5 truncate1 text-[11px]" style={{ color }}>{hostDe(h.contenido)}</p>
              ) : (
                <p className="clamp2 mt-1.5 text-[11.5px] leading-snug text-txt-sub">
                  {stripHtml(h.apuntes) || h.contenido}
                </p>
              )}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {h.categoria_nombre ? <Chip color={color}>{h.categoria_nombre}</Chip> : <span className="chip">Sin categoría</span>}
                <span className="shrink-0 text-[10px] text-txt-mute">{fmtDate(h.fecha || h.creado_en)}</span>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ── Panel derecho: detalle + editor ──────────────────────────────── */
function DetallePanel({ s, hoja }) {
  const [apuntes, setApuntes] = useState('')
  const [titulo, setTitulo] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setApuntes(hoja?.apuntes || '')
    setTitulo(hojaTitulo(hoja) || '')
    setDirty(false)
  }, [hoja?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hoja) {
    return (
      <Card>
        <Empty
          icon={Network}
          title="Elegí una hoja"
          body="Hacé clic en un nodo del grafo o en una tarjeta de la lista para ver y editar sus apuntes acá."
        />
      </Card>
    )
  }

  const Icon = TIPO_ICON[hoja.tipo] || Type
  const color = hoja.color || hashColor(hoja.categoria_nombre || hoja.tipo)

  const guardar = async () => {
    setGuardando(true)
    const body = { apuntes }
    if (titulo && titulo !== hojaTitulo(hoja)) body.titulo = titulo
    const ok = await s.editarHoja(hoja.id, body)
    setGuardando(false)
    if (ok) setDirty(false)
  }

  return (
    <div className="space-y-3">
      <Card spot>
        <CardHead
          title={
            <span className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-[8px]" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
                <Icon size={12} />
              </span>
              {hoja.tipo}
            </span>
          }
          sub={hoja.categoria_nombre ? rutaCategoria(s.categorias, hoja.categoria_id) || hoja.categoria_nombre : 'Sin categoría'}
          right={
            <>
              {hoja.tipo === 'link' && (
                <>
                  <IconButton icon={RefreshCw} label="Refrescar vista previa" onClick={() => s.refrescarPreview(hoja.id)} />
                  <IconButton icon={ExternalLink} label="Abrir" onClick={() => window.open(hoja.contenido, '_blank', 'noopener')} />
                </>
              )}
              <IconButton icon={Trash2} label="Mover a Basura" onClick={() => setConfirm(true)} />
            </>
          }
        />
        <div className="space-y-3 px-3.5 pb-3.5">
          <Input value={titulo} onChange={(e) => { setTitulo(e.target.value); setDirty(true) }} className="text-[14px] font-medium" />

          {hoja.tipo === 'foto' && hoja.contenido && (
            <img src={assetUrl(hoja.contenido)} alt="" className="w-full rounded-[11px] a-scale" />
          )}

          {hoja.tipo === 'link' && (
            <a
              href={hoja.contenido}
              target="_blank"
              rel="noopener noreferrer"
              className="surface block overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
            >
              {hoja.link_preview?.image && (
                <img src={assetUrl(hoja.link_preview.image)} alt="" className="h-28 w-full object-cover" />
              )}
              <div className="p-2.5">
                <div className="truncate1 text-[12.5px] font-medium">{hoja.link_preview?.title || hoja.contenido}</div>
                {hoja.link_preview?.description && (
                  <p className="clamp2 mt-1 text-[11px] text-txt-sub">{hoja.link_preview.description}</p>
                )}
                <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px]" style={{ color }}>
                  <Link2 size={10} /> {hostDe(hoja.contenido)}
                </div>
              </div>
            </a>
          )}

          {hoja.tipo === 'texto' && hoja.contenido && (
            <p className="surface whitespace-pre-wrap p-3 text-[12.5px] leading-relaxed text-txt-2">{hoja.contenido}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-txt-mute">
            <span>Creada {fmtDate(hoja.fecha || hoja.creado_en, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            {hoja.ruta && <span className="mono truncate1">· {hoja.ruta}</span>}
          </div>

          <Field label="Color">
            <ColorPicker value={hoja.color} onChange={(c) => s.editarHoja(hoja.id, { color: c })} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead
          title="Apuntes"
          right={
            dirty ? (
              <Button size="sm" variant="primary" icon={Save} loading={guardando} onClick={guardar}>Guardar</Button>
            ) : (
              <span className="text-[10.5px] text-txt-mute">al día</span>
            )
          }
        />
        <div className="px-3 pb-3">
          <RichEditor
            value={apuntes}
            onChange={(v) => { setApuntes(v); setDirty(true) }}
            minHeight={220}
            placeholder="Escribí lo que pensás de esto…"
          />
        </div>
      </Card>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Mover a Basura"
        body="La nota se mueve a la carpeta “05 - Basura” del vault y deja de aparecer en las consultas."
        cta="Mover"
        onConfirm={() => s.borrarHoja(hoja.id)}
      />
    </div>
  )
}

/* ── Modal de categoría ───────────────────────────────────────────── */
function CategoriaModal({ open, data, onClose, s }) {
  const editando = !!data?.id
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('')
  const [color, setColor] = useState('#8b5cf6')
  const [padre, setPadre] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNombre(data?.nombre || '')
    setIcono(data?.icono || '')
    setColor(data?.color || '#8b5cf6')
    setPadre(String(data?.padre_id ?? ''))
    setBusy(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(
    () =>
      s.categorias
        .filter((c) => !isBasura(c) && c.id !== data?.id)
        .map((c) => ({ value: c.id, label: rutaCategoria(s.categorias, c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [s.categorias, data?.id],
  )

  const guardar = async () => {
    if (!nombre.trim()) return
    setBusy(true)
    const body = { nombre: nombre.trim(), color, icono: icono || null, padre_id: padre ? Number(padre) : null }
    const ok = editando ? await s.editarCategoria(data.id, body) : await s.crearCategoria(body)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar categoría' : 'Nueva categoría'}
      icon={FolderPlus}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>{editando ? 'Guardar' : 'Crear'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Lecturas, Proyectos, Ideas…" />
        </Field>
        <div className="grid grid-cols-[1fr,120px] gap-3">
          <Field label="Categoría superior">
            <Select value={padre} onChange={(e) => setPadre(e.target.value)} placeholder="— Raíz —" options={opciones} />
          </Field>
          <Field label="Emoji">
            <Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="📚" maxLength={4} className="text-center text-[18px]" />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
      </div>
    </Modal>
  )
}
