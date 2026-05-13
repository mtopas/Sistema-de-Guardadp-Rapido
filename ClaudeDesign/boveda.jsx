/* Bóveda — LeftPanel (categorías) + NetworkGraph + RightPanel (detalle) */

function BovedaCatItem({ cat, depth=0, isSelected=false, onSelect }) {
  const [expanded, setExpanded] = React.useState(cat.expanded);
  const hasChildren = cat.children && cat.children.length > 0;
  return (
    <div>
      <div
        onClick={() => { onSelect(cat); if (hasChildren) setExpanded(!expanded); }}
        className="group flex items-center gap-2 pr-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-150"
        style={{
          paddingLeft: 8 + depth*12 + "px",
          background: cat.active ? "color-mix(in oklch, var(--accent) 12%, transparent)" : undefined,
          borderLeft: cat.active ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onMouseEnter={(e) => !cat.active && (e.currentTarget.style.background="var(--surface)")}
        onMouseLeave={(e) => !cat.active && (e.currentTarget.style.background="transparent")}
      >
        <span className="w-4 grid place-items-center" style={{color:"var(--mute)"}}>
          {hasChildren ? (
            <Icon name={expanded ? "chevronDown" : "chevronRight"} size={12} />
          ) : (
            <span className="w-1 h-1 rounded-full" style={{background:"var(--mute)"}} />
          )}
        </span>
        <span className="text-[15px]" style={{lineHeight:1}}>{cat.icon}</span>
        <span className="flex-1 text-[13px] truncate" style={{color: cat.active ? "var(--text)" : "var(--text-2)"}}>{cat.name}</span>
        <span className="badge tnum">{cat.count}</span>
        <button
          className="icon-btn opacity-0 group-hover:opacity-100"
          style={{width:22, height:22}}
          onClick={(e) => e.stopPropagation()}
          aria-label="Agregar subcategoría"
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
      {hasChildren && expanded && (
        <div className="anim-slideUp">
          {cat.children.map(ch => <BovedaCatItem key={ch.id} cat={ch} depth={depth+1} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

function BovedaLeftPanel() {
  return (
    <aside
      className="w-[260px] shrink-0 h-full overflow-y-auto pl-1"
      style={{ borderRight:"1px solid var(--border)" }}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 px-3 h-9 rounded-xl border mb-3"
             style={{background:"var(--surface)", borderColor:"var(--border)"}}>
          <Icon name="search" size={14} style={{color:"var(--subtext)"}} />
          <input placeholder="Filtrar categorías…" className="flex-1 bg-transparent outline-none text-[12.5px] placeholder:opacity-60" />
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <div className="label">Árbol</div>
          <button className="text-[10.5px] flex items-center gap-1" style={{color:"var(--subtext)"}}>
            <Icon name="plus" size={11} /> Nueva
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {BOVEDA.categories.map(c => (
            <BovedaCatItem key={c.id} cat={c} onSelect={()=>{}} />
          ))}
        </div>

        <hr className="divider" />

        <div className="label mb-2 px-1">Capturas recientes</div>
        <div className="flex flex-col gap-1.5">
          {BOVEDA.leaves.slice(0,4).map(l => (
            <div key={l.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--surface)] cursor-pointer">
              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{background:l.color}} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] truncate" style={{color:"var(--text-2)"}}>{l.title}</div>
                <div className="text-[10px] mt-0.5" style={{color:"var(--mute)"}}>{l.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function NetworkGraph() {
  const W = 720, H = 560;
  const cx = W/2, cy = H/2;

  // hub
  const hub = { x: cx, y: cy, r: 36, label:"SGR", color:"var(--accent)" };
  // 7 main branches
  const branches = BOVEDA.categories.map((c, i, arr) => {
    const angle = (i / arr.length) * Math.PI * 2 - Math.PI/2;
    const dist = 165;
    return {
      ...c,
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r: 14 + Math.min(c.count,40) * 0.4,
      angle,
    };
  });
  // leaves around each branch
  const leaves = [];
  branches.forEach((b, i) => {
    const n = 3 + (i % 4); // 3–6 leaves per branch
    for (let j=0; j<n; j++) {
      const sub = (j - (n-1)/2) * 0.32;
      const a = b.angle + sub;
      const dist = 90 + ((j*37) % 50);
      const lx = b.x + Math.cos(a) * dist;
      const ly = b.y + Math.sin(a) * dist;
      const types = ["text","link","photo"];
      const type = types[(i+j) % 3];
      const highlight = (i===2 && j===0); // a featured node
      leaves.push({ id:`${b.id}-${j}`, x:lx, y:ly, color:b.color, type, highlight });
    }
  });

  // links
  const links = [
    ...branches.map(b => ({ x1:hub.x, y1:hub.y, x2:b.x, y2:b.y, c:b.color, w:1.5 })),
    ...leaves.map((l, idx) => {
      // each leaf to nearest branch
      const b = branches.reduce((acc, br) => {
        const d = Math.hypot(l.x-br.x, l.y-br.y);
        return (!acc || d < acc.d) ? { br, d } : acc;
      }, null).br;
      return { x1:b.x, y1:b.y, x2:l.x, y2:l.y, c:l.color, w:0.8 };
    }),
  ];

  // Sample inter-branch faint links
  const crossLinks = [
    [branches[0], branches[2]],
    [branches[1], branches[3]],
    [branches[2], branches[5]],
  ];

  return (
    <div className="relative h-full grid place-items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full max-h-[640px]" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-light)" />
            <stop offset="100%" stopColor="var(--accent-deep)" />
          </radialGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* faint concentric rings */}
        {[120,200,260].map(r => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeDasharray="2 4" />
        ))}

        {/* cross-links */}
        {crossLinks.map((p,i) => (
          <line key={i} x1={p[0].x} y1={p[0].y} x2={p[1].x} y2={p[1].y}
            stroke="var(--border-2)" strokeDasharray="2 3" strokeWidth="1" />
        ))}

        {/* links */}
        {links.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.c} strokeOpacity="0.35" strokeWidth={l.w} />
        ))}

        {/* leaves */}
        {leaves.map(l => {
          if (l.type === "link") {
            const s = 10;
            return (
              <g key={l.id}>
                <rect x={l.x - s/2} y={l.y - s/2} width={s} height={s}
                  fill={l.color} opacity={l.highlight ? 1 : 0.75}
                  transform={`rotate(45 ${l.x} ${l.y})`}
                  stroke={l.highlight ? "white" : "none"} strokeWidth="1" />
              </g>
            );
          }
          if (l.type === "photo") {
            return (
              <rect key={l.id} x={l.x-5} y={l.y-5} width="10" height="10" rx="2"
                fill={l.color} opacity="0.8" />
            );
          }
          return (
            <circle key={l.id} cx={l.x} cy={l.y} r={l.highlight ? 7 : 5}
              fill={l.color} opacity={l.highlight ? 1 : 0.75}
              stroke={l.highlight ? "white" : "none"} strokeWidth="1.2" />
          );
        })}

        {/* branches */}
        {branches.map((b, i) => (
          <g key={b.id}>
            <circle cx={b.x} cy={b.y} r={b.r}
              fill={b.color} opacity="0.18" />
            <circle cx={b.x} cy={b.y} r={b.r * 0.55}
              fill={b.color} stroke="white" strokeOpacity="0.15" strokeWidth="1" />
            <text x={b.x} y={b.y + b.r + 18}
              fontFamily="Sora" fontSize="11.5" fontWeight="500"
              textAnchor="middle" fill="var(--text)">{b.name}</text>
            <text x={b.x} y={b.y + b.r + 32}
              fontFamily="JetBrains Mono" fontSize="9.5"
              textAnchor="middle" fill="var(--subtext)">{b.count} hojas</text>
          </g>
        ))}

        {/* hub */}
        <g filter="url(#softGlow)">
          <circle cx={hub.x} cy={hub.y} r={hub.r+8} fill="var(--accent)" opacity="0.18" />
          <circle cx={hub.x} cy={hub.y} r={hub.r} fill="url(#hubGrad)" />
        </g>
        <text x={hub.x} y={hub.y+5} fontFamily="Playfair Display" fontStyle="italic"
          fontSize="22" fontWeight="700" textAnchor="middle" fill="white">SGR</text>
      </svg>

      {/* legend */}
      <div className="absolute bottom-3 left-3 panel px-3 py-2 flex items-center gap-3 text-[10.5px]"
           style={{color:"var(--subtext)"}}>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--accent-light)]"/> texto</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rotate-45 bg-[var(--accent-light)]"/> link</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[var(--accent-light)]"/> foto</span>
      </div>
      {/* minimap */}
      <div className="absolute bottom-3 right-3 panel w-[120px] h-[80px] p-2 grid place-items-center">
        <svg viewBox="0 0 120 80" className="w-full h-full opacity-70">
          <circle cx="60" cy="40" r="4" fill="var(--accent)" />
          {branches.map((b,i)=>{
            const x = 60 + Math.cos(b.angle) * 22;
            const y = 40 + Math.sin(b.angle) * 16;
            return <circle key={i} cx={x} cy={y} r="2.4" fill={b.color} opacity="0.8" />;
          })}
          <rect x="40" y="22" width="40" height="36" fill="none" stroke="var(--accent-light)" strokeWidth="1" rx="2" />
        </svg>
      </div>
      {/* zoom controls */}
      <div className="absolute top-3 right-3 panel flex flex-col">
        <button className="icon-btn" style={{width:30, height:30}}><Icon name="plus" size={13} /></button>
        <div className="h-px" style={{background:"var(--border)"}} />
        <button className="icon-btn" style={{width:30, height:30}} aria-label="Zoom out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>
  );
}

function LeafDetailPanel() {
  const leaf = BOVEDA.leaves.find(l => l.id === BOVEDA.selectedLeaf);
  return (
    <aside className="w-[340px] shrink-0 h-full overflow-y-auto anim-slideIn"
      style={{ borderLeft:"1px solid var(--border)" }}>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="chip" style={{background: "color-mix(in oklch, "+leaf.color+" 20%, transparent)", borderColor: "color-mix(in oklch, "+leaf.color+" 35%, transparent)", color: leaf.color}}>
            <Icon name={leaf.type === "link" ? "link" : leaf.type === "photo" ? "image" : "fileText"} size={11} />
            {leaf.type}
          </span>
          <span className="text-[10.5px]" style={{color:"var(--mute)"}}>· {leaf.date}</span>
          <div className="flex-1" />
          <button className="icon-btn" aria-label="Más"><Icon name="more" size={15} /></button>
        </div>

        <h2 className="text-[18px] leading-tight font-semibold mb-1.5">{leaf.title}</h2>
        <div className="text-[11px] mb-4" style={{color:"var(--subtext)"}}>
          <Icon name="chevronRight" size={11} className="inline -mt-0.5" />
          {leaf.cat}
        </div>

        {/* Open Graph preview */}
        <div className="rounded-xl overflow-hidden border mb-4" style={{borderColor:"var(--border)"}}>
          <div className="aspect-[16/9] relative grid place-items-center"
            style={{background: "linear-gradient(135deg, "+leaf.color+"30, transparent 70%), repeating-linear-gradient(45deg, var(--surface) 0 8px, color-mix(in oklch, var(--surface) 90%, white 6%) 8px 16px)"}}
          >
            <div className="text-center px-4">
              <div className="text-[10px] mono uppercase tracking-widest mb-1" style={{color:"var(--subtext)"}}>OG preview</div>
              <div className="text-[13px] font-medium" style={{color:"var(--text-2)"}}>{leaf.host}</div>
            </div>
          </div>
          <div className="px-3 py-2.5 text-[11px] flex items-center gap-2" style={{background:"var(--surface)"}}>
            <Icon name="globe" size={11} style={{color:"var(--subtext)"}} />
            <span className="truncate mono" style={{color:"var(--subtext)"}}>{leaf.host}</span>
            <Icon name="arrowUpRight" size={11} style={{color:"var(--subtext)"}} />
          </div>
        </div>

        {/* Editor */}
        <div className="label mb-1.5">Apuntes</div>
        <div className="rounded-xl border p-3 mb-4" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
          <div className="flex items-center gap-0.5 mb-2 pb-2 border-b" style={{borderColor:"var(--border)"}}>
            {["B","I","H","•","1."].map((t,i)=>(
              <button key={i} className="icon-btn" style={{width:24, height:24, fontSize: i<2?13:11, fontWeight:600}}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{color:"var(--text-2)"}}>
            CSS variables sobre <span className="mono text-[11px]" style={{color:"var(--accent-light)"}}>:root</span> + clases Tailwind como capa de utilidades. La clave es <em>no</em> reescribir Tailwind para temas, sino mantener Tailwind como mecanismo de layout y la paleta en custom properties.
          </p>
          <p className="text-[12.5px] leading-relaxed mt-2" style={{color:"var(--text-2)"}}>
            Aplicar a SGR para los 8 temas oscuros.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="rounded-lg border p-2.5" style={{borderColor:"var(--border)"}}>
            <div className="label mb-0.5">Lugar</div>
            <div className="text-[11.5px] flex items-center gap-1.5"><Icon name="mapPin" size={11}/> Casa</div>
          </div>
          <div className="rounded-lg border p-2.5" style={{borderColor:"var(--border)"}}>
            <div className="label mb-0.5">Recordar</div>
            <div className="text-[11.5px] flex items-center gap-1.5"><Icon name="clock" size={11}/> 20 May</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn flex-1 justify-center"><Icon name="edit" size={13}/> Editar</button>
          <button className="btn btn-danger"><Icon name="trash" size={13}/></button>
        </div>
      </div>
    </aside>
  );
}

function BovedaScreen() {
  return (
    <div className="flex flex-1 min-h-0" data-screen-label="01 Bóveda">
      <BovedaLeftPanel />
      <div className="flex-1 min-w-0 relative">
        <NetworkGraph />
      </div>
      <LeafDetailPanel />
    </div>
  );
}

window.BovedaScreen = BovedaScreen;
