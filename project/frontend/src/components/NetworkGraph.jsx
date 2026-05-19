import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { BRANCH_COLORS } from '../utils/themes'
import { extractTags } from '../utils/tags'

const W = 720, H = 560
const HUB = { x: W / 2, y: H / 2, r: 36 }
const BRANCH_DIST = 165
const MAX_LEAVES_PER_BRANCH = 14

function buildGraph(categorias, hojas) {
  // Map every category to its root ancestor
  const rootOf = {}
  const findRoot = (id, seen = new Set()) => {
    if (id == null || seen.has(id)) return null
    seen.add(id)
    const c = categorias.find(x => x.id === id)
    if (!c) return null
    if (!c.padre_id) return c.id
    return findRoot(c.padre_id, seen)
  }
  categorias.forEach(c => { rootOf[c.id] = findRoot(c.id) })

  // Group hojas under their root ancestor (subcat hojas roll up to root)
  const hojasByRoot = {}
  hojas.forEach(h => {
    const r = rootOf[h.categoria_id]
    if (r == null) return
    if (!hojasByRoot[r]) hojasByRoot[r] = []
    hojasByRoot[r].push(h)
  })

  // Branches = root categories arranged in a ring
  const roots = categorias.filter(c => !c.padre_id)
  const branches = roots.map((c, i) => {
    const angle = (i / Math.max(roots.length, 1)) * Math.PI * 2 - Math.PI / 2
    const count = (hojasByRoot[c.id] || []).length
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length]
    return {
      id: c.id,
      name: c.nombre,
      count,
      color,
      angle,
      x: HUB.x + Math.cos(angle) * BRANCH_DIST,
      y: HUB.y + Math.sin(angle) * BRANCH_DIST,
      r: 14 + Math.min(count, 40) * 0.4,
    }
  })

  // Leaves fan out from each branch
  const leaves = []
  branches.forEach(b => {
    const bHojas = (hojasByRoot[b.id] || []).slice(0, MAX_LEAVES_PER_BRANCH)
    const n = bHojas.length
    const idealStep = 0.32
    const maxSpread = Math.PI * 0.55
    const spread = n <= 1 ? 0 : Math.min(idealStep * (n - 1), maxSpread)
    bHojas.forEach((h, j) => {
      const sub = n === 1 ? 0 : -spread / 2 + spread * (j / (n - 1))
      const a = b.angle + sub
      const dist = 90 + ((j * 37) % 50)
      leaves.push({
        id: h.id,
        tipo: h.tipo,
        contenido: h.contenido,
        apuntes: h.apuntes,
        color: b.color,
        branchId: b.id,
        x: b.x + Math.cos(a) * dist,
        y: b.y + Math.sin(a) * dist,
      })
    })
  })

  // Structural links: hub→branch, branch→leaf
  const links = [
    ...branches.map(b => ({ x1: HUB.x, y1: HUB.y, x2: b.x, y2: b.y, c: b.color, w: 1.5 })),
    ...leaves.map(l => {
      const b = branches.find(br => br.id === l.branchId)
      return { x1: b.x, y1: b.y, x2: l.x, y2: l.y, c: l.color, w: 0.8 }
    }),
  ]

  // Cross-links via shared #tags
  const tagOwners = {}
  leaves.forEach(l => {
    extractTags(l.contenido, l.apuntes).forEach(t => {
      if (!tagOwners[t]) tagOwners[t] = []
      tagOwners[t].push(l)
    })
  })
  const crossLinks = []
  Object.values(tagOwners).forEach(group => {
    if (group.length < 2) return
    for (let i = 0; i < group.length - 1; i++) {
      crossLinks.push({ a: group[i], b: group[i + 1] })
    }
  })

  return { branches, leaves, links, crossLinks }
}

const panelStyle = {
  background: 'var(--panel-bg)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid var(--border)',
  borderRadius: 14,
}

const iconBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 10,
  color: 'var(--subtext)', cursor: 'pointer',
  border: '1px solid transparent', background: 'transparent',
}

export default function NetworkGraph() {
  const hojas      = useStore(s => s.hojas)
  const categorias = useStore(s => s.categorias)

  const { branches, leaves, links, crossLinks } = useMemo(
    () => buildGraph(categorias, hojas),
    [categorias, hojas]
  )

  return (
    <div className="absolute inset-0 grid place-items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-light)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </radialGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* tag cross-links (under structural lines) */}
        {crossLinks.map((l, i) => (
          <line key={`x${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
            stroke="rgba(255,255,255,0.28)" strokeDasharray="2 3" strokeWidth="1" />
        ))}

        {/* structural links */}
        {links.map((l, i) => (
          <line key={`s${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.c} strokeOpacity="0.35" strokeWidth={l.w} />
        ))}

        {/* leaves — shape by tipo */}
        {leaves.map(l => {
          if (l.tipo === 'link') {
            const s = 10
            return (
              <rect key={l.id} x={l.x - s / 2} y={l.y - s / 2}
                width={s} height={s} fill={l.color} opacity="0.75"
                transform={`rotate(45 ${l.x} ${l.y})`} />
            )
          }
          if (l.tipo === 'foto') {
            return (
              <rect key={l.id} x={l.x - 5} y={l.y - 5}
                width="10" height="10" rx="2" fill={l.color} opacity="0.8" />
            )
          }
          return (
            <circle key={l.id} cx={l.x} cy={l.y} r="5"
              fill={l.color} opacity="0.75" />
          )
        })}

        {/* branches */}
        {branches.map(b => (
          <g key={b.id}>
            <circle cx={b.x} cy={b.y} r={b.r} fill={b.color} opacity="0.18" />
            <circle cx={b.x} cy={b.y} r={b.r * 0.55} fill={b.color}
              stroke="white" strokeOpacity="0.15" strokeWidth="1" />
            <text x={b.x} y={b.y + b.r + 18}
              style={{ fontFamily: 'var(--font-sans)' }} fontSize="11.5" fontWeight="500"
              textAnchor="middle" fill="var(--text)">
              {b.name}
            </text>
            <text x={b.x} y={b.y + b.r + 32}
              style={{ fontFamily: 'var(--font-mono)' }}
              fontSize="9.5" textAnchor="middle" fill="var(--subtext)">
              {b.count} {b.count === 1 ? 'hoja' : 'hojas'}
            </text>
          </g>
        ))}

        {/* hub */}
        <g filter="url(#softGlow)">
          <circle cx={HUB.x} cy={HUB.y} r={HUB.r + 8} fill="var(--accent)" opacity="0.18" />
          <circle cx={HUB.x} cy={HUB.y} r={HUB.r} fill="url(#hubGrad)" />
        </g>
        <text x={HUB.x} y={HUB.y + 5}
          style={{ fontFamily: 'var(--font-serif)' }} fontStyle="italic"
          fontSize="22" fontWeight="700" textAnchor="middle" fill="var(--cta-text)">
          SGR
        </text>
      </svg>

      {/* legend */}
      <div
        className="absolute bottom-3 left-3 px-3 py-2 flex items-center gap-3 text-[10.5px]"
        style={{ ...panelStyle, color: 'var(--subtext)' }}
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--accent-light)' }} />
          texto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rotate-45" style={{ background: 'var(--accent-light)' }} />
          link
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--accent-light)' }} />
          foto
        </span>
      </div>

      {/* zoom controls (decorative — match design) */}
      <div className="absolute top-3 right-3 flex flex-col" style={panelStyle}>
        <button style={iconBtnStyle} aria-label="Zoom in">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div className="h-px" style={{ background: 'var(--border)' }} />
        <button style={iconBtnStyle} aria-label="Zoom out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
