import { useMemo, useRef, useState } from 'react'
import { Image, Link2, Minus, Plus, RotateCcw, Type } from 'lucide-react'
import { hojaTitulo } from '../../store/boveda'
import { hashColor } from '../../lib/fin'
import { IconButton } from '../../ui/primitives'
import { useSize } from '../../ui/hooks'

const ICON = { link: Link2, foto: Image, texto: Type }

/**
 * Grafo radial de posiciones fijas (mismo criterio que NetworkGraph.jsx del
 * proyecto: SVG, sin D3 force, para que la posición de cada nodo no cambie
 * entre renders). Categorías en un anillo; sus hojas en un arco alrededor.
 */
export function Graph({ categorias, hojas, selectedId, onSelect, catFilter, onCatFilter }) {
  const [wrap, { w, h }] = useSize()
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hover, setHover] = useState(null)
  const drag = useRef(null)

  const W = Math.max(400, w || 800)
  const H = Math.max(360, h || 600)
  const cx0 = W / 2
  const cy0 = H / 2
  const R = Math.min(W, H) * 0.25 // el anillo de hojas llega a ~R*1.72: entra sin recortarse

  const layout = useMemo(() => {
    const raiz = categorias.filter((c) => !c.padre_id)
    const cats = raiz.length ? raiz : categorias
    const nodes = []
    const edges = []
    const porCat = new Map()
    for (const hj of hojas) {
      const k = hj.categoria_id ?? 0
      if (!porCat.has(k)) porCat.set(k, [])
      porCat.get(k).push(hj)
    }
    // Una categoría raíz "adopta" las hojas de sus descendientes para el conteo visual.
    const hijos = new Map()
    for (const c of categorias) {
      if (!c.padre_id) continue
      if (!hijos.has(c.padre_id)) hijos.set(c.padre_id, [])
      hijos.get(c.padre_id).push(c)
    }
    const recolectar = (id, out = [], depth = 0) => {
      if (depth > 6) return out
      out.push(...(porCat.get(id) || []))
      for (const ch of hijos.get(id) || []) recolectar(ch.id, out, depth + 1)
      return out
    }

    cats.forEach((c, i) => {
      const ang = (i / Math.max(1, cats.length)) * Math.PI * 2 - Math.PI / 2
      const x = cx0 + Math.cos(ang) * R
      const y = cy0 + Math.sin(ang) * R
      const color = c.color || hashColor(c.nombre)
      const propias = recolectar(c.id)
      nodes.push({ kind: 'cat', id: c.id, label: c.nombre, x, y, color, icono: c.icono, count: propias.length, ang })
      edges.push({ x1: cx0, y1: cy0, x2: x, y2: y, color, key: `c${c.id}` })

      const visibles = propias.slice(0, 9)
      const spread = Math.min(1.05, 0.34 + visibles.length * 0.1)
      visibles.forEach((hj, j) => {
        const a = ang + (visibles.length === 1 ? 0 : (j / (visibles.length - 1) - 0.5) * spread)
        const rr = R * (1.5 + (j % 2) * 0.22)
        const hx = cx0 + Math.cos(a) * rr
        const hy = cy0 + Math.sin(a) * rr
        nodes.push({ kind: 'hoja', id: hj.id, label: hojaTitulo(hj), x: hx, y: hy, color, tipo: hj.tipo, hoja: hj })
        edges.push({ x1: x, y1: y, x2: hx, y2: hy, color, thin: true, key: `h${hj.id}` })
      })
    })

    const sueltas = porCat.get(0) || []
    sueltas.slice(0, 8).forEach((hj, j) => {
      const a = (j / Math.max(1, Math.min(8, sueltas.length))) * Math.PI * 2
      const rr = R * 0.44
      nodes.push({
        kind: 'hoja', id: hj.id, label: hojaTitulo(hj),
        x: cx0 + Math.cos(a) * rr, y: cy0 + Math.sin(a) * rr,
        color: 'var(--mute)', tipo: hj.tipo, hoja: hj,
      })
    })
    return { nodes, edges }
  }, [categorias, hojas, cx0, cy0, R, W, H])

  const onWheel = (e) => {
    e.preventDefault()
    setZoom((z) => Math.min(2.6, Math.max(0.45, z * (e.deltaY > 0 ? 0.92 : 1.08))))
  }
  // Pan con pointer events (más confiable que listeners globales de mouse).
  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }
  const handlePointerMove = (e) => {
    if (!drag.current) return
    setPan({ x: drag.current.px + (e.clientX - drag.current.sx), y: drag.current.py + (e.clientY - drag.current.sy) })
  }
  const handlePointerUp = () => { drag.current = null }

  const dim = (n) => {
    if (hover) {
      if (n.kind === 'cat') return hover.kind === 'cat' ? hover.id !== n.id : hover.color !== n.color
      return hover.kind === 'hoja' ? hover.id !== n.id : hover.color !== n.color
    }
    if (catFilter && n.kind === 'cat') return n.id !== catFilter
    return false
  }

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <svg
        width="100%" height="100%"
        className="cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <radialGradient id="coreGlow">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) translate(${cx0} ${cy0}) scale(${zoom}) translate(${-cx0} ${-cy0})`}>
          <circle cx={cx0} cy={cy0} r={R * 2.1} fill="url(#coreGlow)" opacity="0.5" />
          <circle cx={cx0} cy={cy0} r={R} fill="none" stroke="var(--border)" strokeDasharray="2 6" />

          {layout.edges.map((e, i) => (
            <line
              key={e.key}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke={e.color}
              strokeWidth={e.thin ? 0.8 : 1.6}
              strokeOpacity={e.thin ? 0.22 : 0.42}
              style={{
                strokeDasharray: 400, strokeDashoffset: 0,
                animation: `drawIn 900ms cubic-bezier(0.22,1,0.36,1) ${i * 9}ms both`,
                '--len': 400,
              }}
            />
          ))}

          {/* Núcleo */}
          <g>
            <circle
              cx={cx0} cy={cy0} r="26"
              fill="var(--panel-bg)" stroke="var(--accent)" strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 0 14px color-mix(in srgb, var(--accent) 65%, transparent))' }}
            />
            <circle cx={cx0} cy={cy0} r="32" fill="none" stroke="var(--accent)" strokeOpacity="0.3"
              style={{ animation: 'breathe 3.2s ease-in-out infinite' }} />
            <text x={cx0} y={cy0 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">SGR</text>
          </g>

          {layout.nodes.map((n, i) => {
            const on = n.kind === 'hoja' ? selectedId === n.id : catFilter === n.id
            const faded = dim(n)
            const Icon = n.kind === 'hoja' ? ICON[n.tipo] || Type : null
            const r = n.kind === 'cat' ? 15 : 8
            return (
              <g
                key={`${n.kind}-${n.id}`}
                transform={`translate(${n.x} ${n.y})`}
                style={{ cursor: 'pointer', opacity: faded ? 0.2 : 1, transition: 'opacity 240ms ease' }}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
                onClick={() => (n.kind === 'cat' ? onCatFilter(catFilter === n.id ? null : n.id) : onSelect(n.id))}
              >
                <g style={{ animation: `nodeIn 420ms cubic-bezier(0.34,1.4,0.64,1) ${140 + i * 13}ms both` }}>
                {on && (
                  <circle r={r + 7} fill="none" stroke={n.color} strokeWidth="1.5" strokeOpacity="0.7"
                    style={{ animation: 'breathe 2s ease-in-out infinite' }} />
                )}
                <circle
                  r={r}
                  fill={n.kind === 'cat' ? n.color : 'var(--panel-bg)'}
                  stroke={n.color}
                  strokeWidth={n.kind === 'cat' ? 0 : 1.8}
                  style={{ filter: on || hover?.id === n.id ? `drop-shadow(0 0 9px ${n.color})` : 'none', transition: 'filter 200ms ease' }}
                />
                {n.kind === 'cat' && n.icono && (
                  <text y="4" textAnchor="middle" fontSize="13">{n.icono}</text>
                )}
                {n.kind === 'cat' && !n.icono && (
                  <text y="4" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
                    {String(n.label || '?').slice(0, 1).toUpperCase()}
                  </text>
                )}
                {Icon && (
                  <g transform="translate(-5 -5)" style={{ color: n.color }}>
                    <Icon size={10} />
                  </g>
                )}
                <text
                  y={n.kind === 'cat' ? r + 15 : r + 12}
                  textAnchor="middle"
                  fontSize={n.kind === 'cat' ? 11 : 9.5}
                  fontWeight={n.kind === 'cat' ? 600 : 400}
                  fill={n.kind === 'cat' ? 'var(--text)' : 'var(--subtext)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {truncar(n.label, n.kind === 'cat' ? 18 : 16)}
                </text>
                {n.kind === 'cat' && n.count > 0 && (
                  <text y={r + 26} textAnchor="middle" fontSize="8.5" fill="var(--mute)" style={{ pointerEvents: 'none' }}>
                    {n.count} hoja{n.count === 1 ? '' : 's'}
                  </text>
                )}
                </g>
              </g>
            )
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <IconButton icon={Plus} label="Acercar" onClick={() => setZoom((z) => Math.min(2.6, z * 1.18))} className="panel" />
        <IconButton icon={Minus} label="Alejar" onClick={() => setZoom((z) => Math.max(0.45, z / 1.18))} className="panel" />
        <IconButton icon={RotateCcw} label="Centrar" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="panel" />
      </div>

      {hover?.kind === 'hoja' && (
        <div className="panel a-fade pointer-events-none absolute left-3 top-3 max-w-[280px] px-3 py-2">
          <div className="truncate1 text-[12px] font-semibold">{hover.label}</div>
          <div className="mt-0.5 text-[10.5px] text-txt-sub">
            {hover.hoja?.categoria_nombre || 'Sin categoría'} · {hover.tipo}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-txt-mute">
        arrastrá para mover · rueda para zoom · clic en una categoría para filtrar
      </div>
    </div>
  )
}

const truncar = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''))
