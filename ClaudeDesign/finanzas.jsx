/* Finanzas — Sidebar (Resumen + Cuentas) + Dashboard cards */

function FinanzasLeftPanel() {
  return (
    <aside className="w-[300px] shrink-0 h-full overflow-y-auto"
      style={{ borderRight:"1px solid var(--border)" }}>
      <div className="p-4">
        <div className="label mb-2">Saldo disponible</div>
        <div className="flex items-baseline gap-1">
          <span className="text-[11px] mono" style={{color:"var(--subtext)"}}>ARS</span>
          <div className="serif italic text-[30px] font-semibold tnum leading-none">
            {fmtARS(FINANZAS.saldoARS)}
          </div>
        </div>
        <div className="text-[11.5px] mt-1.5 flex items-center gap-2" style={{color:"var(--subtext)"}}>
          <span className="mono">≈ {fmtUSD(FINANZAS.saldoUSD)}</span>
          <span className="opacity-50">·</span>
          <span>blue 1245 ARS/USD</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="arrowDown" size={12} style={{color:"var(--income)"}}/>
              <span className="label" style={{color:"var(--income)"}}>Ingresos</span>
            </div>
            <div className="text-[15px] font-semibold tnum">{fmtARS(FINANZAS.ingresosMes)}</div>
          </div>
          <div className="rounded-xl border p-3" style={{borderColor:"var(--border)"}}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="arrowUp" size={12} style={{color:"var(--expense)"}}/>
              <span className="label" style={{color:"var(--expense)"}}>Gastos</span>
            </div>
            <div className="text-[15px] font-semibold tnum">{fmtARS(FINANZAS.gastosMes)}</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span style={{color:"var(--subtext)"}}>Tasa de ahorro</span>
            <span className="font-semibold tnum grad-text">{FINANZAS.tasaAhorro}%</span>
          </div>
          <div className="relative h-1.5 rounded-full overflow-hidden" style={{background:"var(--surface)"}}>
            <div className="absolute inset-y-0 left-0 grad-bg rounded-full" style={{width:FINANZAS.tasaAhorro+"%"}}/>
          </div>
        </div>

        <hr className="divider" />

        {FINANZAS.cuentas.map(group => {
          const total = group.items.reduce((a,b)=>a+b.ars,0);
          return (
            <div key={group.group} className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="label">{group.group}</span>
                <span className="text-[10.5px] mono tnum" style={{color:"var(--subtext)"}}>{fmtARS(total)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {group.items.map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[var(--surface)] cursor-pointer">
                    <div className="w-7 h-7 rounded-lg grid place-items-center text-[10px] font-semibold tnum text-white shrink-0"
                      style={{background:a.color}}>{a.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{a.name}</div>
                      <div className="text-[10.5px] mono" style={{color:"var(--subtext)"}}>
                        {fmtARS(a.ars)}{a.usd ? ` · ${fmtUSD(a.usd)}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="label">{subtitle}</div>
        <div className="text-[14.5px] font-semibold mt-0.5 serif italic">{title}</div>
      </div>
      {action}
    </div>
  );
}

function IncomeExpenseCard() {
  const { ingresosMes, gastosMes, tasaAhorro } = FINANZAS;
  const max = Math.max(ingresosMes, gastosMes);
  return (
    <div className="panel-strong p-4 col-span-2">
      <CardHeader
        title="Mayo 2026 · Ingresos vs Gastos"
        subtitle="Flujo mensual"
        action={
          <div className="flex items-center gap-1">
            <button className="icon-btn" style={{width:26,height:26}}><Icon name="chevronLeft" size={12}/></button>
            <button className="icon-btn" style={{width:26,height:26}}><Icon name="chevronRight" size={12}/></button>
          </div>
        }
      />
      <div className="grid grid-cols-[1fr_auto] gap-6 items-center">
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{color:"var(--income)"}}>
                <Icon name="arrowDown" size={11} strokeWidth={2.5}/> Ingresos
              </span>
              <span className="text-[14px] font-semibold tnum">{fmtARS(ingresosMes)}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{background:"var(--surface)"}}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: ((ingresosMes/max)*100)+"%",
                  background:"linear-gradient(90deg, var(--income), color-mix(in oklch, var(--income) 60%, white 30%))"
                }}/>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{color:"var(--expense)"}}>
                <Icon name="arrowUp" size={11} strokeWidth={2.5}/> Gastos
              </span>
              <span className="text-[14px] font-semibold tnum">{fmtARS(gastosMes)}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{background:"var(--surface)"}}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: ((gastosMes/max)*100)+"%",
                  background:"linear-gradient(90deg, var(--expense), color-mix(in oklch, var(--expense) 60%, white 30%))"
                }}/>
            </div>
          </div>
          <div className="text-[11px]" style={{color:"var(--subtext)"}}>
            Ahorrás <span style={{color:"var(--text)"}} className="font-semibold">{fmtARS(ingresosMes-gastosMes)}</span> este mes — el mejor de los últimos 6.
          </div>
        </div>
        <div className="grid place-items-center">
          <div className="relative w-[120px] h-[120px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface)" strokeWidth="10"/>
              <circle cx="50" cy="50" r="42" fill="none" stroke="url(#sav)" strokeWidth="10"
                strokeDasharray={`${(tasaAhorro/100)*264} 264`} strokeLinecap="round"/>
              <defs>
                <linearGradient id="sav" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent)"/>
                  <stop offset="100%" stopColor="var(--accent-light)"/>
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-[24px] serif italic font-semibold tnum grad-text leading-none">{tasaAhorro}%</div>
                <div className="text-[10px] mt-1" style={{color:"var(--subtext)"}}>ahorro</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DonutCard() {
  const cats = FINANZAS.categorias;
  const total = cats.reduce((a,b)=>a+b.amount,0);
  const R = 38, C = 2*Math.PI*R;
  let acc = 0;
  return (
    <div className="panel-strong p-4">
      <CardHeader
        title="Gastos por categoría"
        subtitle="Mayo 2026"
        action={<button className="btn btn-ghost text-[11px]">Ver detalle</button>}
      />
      <div className="grid grid-cols-[110px_1fr] gap-4 items-center">
        <div className="relative w-[110px] h-[110px] grid place-items-center">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface)" strokeWidth="12"/>
            {cats.map((c, i) => {
              const dash = (c.pct/100) * C;
              const offset = -((acc/100) * C);
              acc += c.pct;
              return (
                <circle key={i} cx="50" cy="50" r={R} fill="none"
                  stroke={c.color} strokeWidth="12"
                  strokeDasharray={`${dash} ${C-dash}`}
                  strokeDashoffset={offset} />
              );
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-[10px]" style={{color:"var(--subtext)"}}>Total</div>
              <div className="serif italic text-[14px] font-semibold tnum">{fmtARS(total)}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {cats.slice(0,5).map(c => (
            <div key={c.name} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{background:c.color}}/>
              <span className="flex-1 truncate" style={{color:"var(--text-2)"}}>{c.name}</span>
              <span className="tnum mono text-[10.5px]" style={{color:"var(--subtext)"}}>{c.pct}%</span>
              <span className="tnum w-[64px] text-right" style={{color:"var(--text)"}}>{fmtARS(c.amount)}</span>
            </div>
          ))}
          {cats.length > 5 && (
            <div className="text-[10.5px]" style={{color:"var(--subtext)"}}>+{cats.length-5} categorías</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MovimientosCard() {
  return (
    <div className="panel-strong p-4">
      <CardHeader
        title="Últimos movimientos"
        subtitle="Recientes"
        action={<button className="btn btn-ghost text-[11px]">Ver todos →</button>}
      />
      <div className="flex flex-col">
        {FINANZAS.movimientos.slice(0,5).map((m, i) => (
          <div key={m.id}
            className="flex items-center gap-3 py-2 border-b last:border-b-0"
            style={{borderColor:"var(--border)"}}>
            <div className="w-9 h-9 rounded-lg grid place-items-center text-[15px]"
              style={{background:"var(--surface)"}}>{m.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium truncate">{m.desc}</div>
              <div className="text-[10.5px] flex items-center gap-1.5 mt-0.5" style={{color:"var(--subtext)"}}>
                <span>{m.cat}</span>
                <span className="opacity-50">·</span>
                <span className="chip" style={{padding:"1px 6px", fontSize:10}}>{m.method}</span>
                {m.audit && (
                  <span className="chip" style={{padding:"1px 6px", fontSize:10, color:"var(--warning)", background:"color-mix(in oklch, var(--warning) 12%, transparent)", borderColor:"color-mix(in oklch, var(--warning) 30%, transparent)"}}>
                    auditar
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[13px] font-semibold tnum"
                style={{color: m.type==="income" ? "var(--income)" : "var(--text)"}}>
                {m.amount > 0 ? "+" : ""}{fmtARS(m.amount)}
              </div>
              <div className="text-[10px] mono mt-0.5" style={{color:"var(--subtext)"}}>{m.date}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubscriptionsCard() {
  const total = FINANZAS.suscripciones.reduce((a,b)=>a+b.amount,0);
  return (
    <div className="panel-strong p-4">
      <CardHeader
        title="Suscripciones"
        subtitle="Recurrentes"
        action={<span className="chip tnum" style={{color:"var(--accent-light)", background:"color-mix(in oklch, var(--accent) 14%, transparent)", borderColor:"color-mix(in oklch, var(--accent) 28%, transparent)"}}>{fmtARS(total)}/mes</span>}
      />
      <div className="flex flex-col">
        {FINANZAS.suscripciones.map((s, i) => (
          <div key={s.name} className="flex items-center gap-3 py-2 border-b last:border-b-0"
            style={{borderColor:"var(--border)"}}>
            <div className="w-7 h-7 rounded-md grid place-items-center"
              style={{background:"color-mix(in oklch, var(--accent) 14%, transparent)", color:"var(--accent-light)"}}>
              <Icon name="repeat" size={13}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium truncate">{s.name}</div>
              <div className="text-[10.5px]" style={{color:"var(--subtext)"}}>Próximo: {s.next}</div>
            </div>
            <div className="text-[12.5px] font-semibold tnum">{fmtARS(s.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KPIsCard() {
  const kpis = [
    { label:"Gasto promedio diario", value: fmtARS(39950), delta:"-12%", up:false, deltaColor:"var(--success)" },
    { label:"Categoría top", value:"Alquiler", delta:"32% del total", up:null, deltaColor:"var(--subtext)" },
    { label:"vs Mes anterior", value:"-9.8%", delta:"menos gastos", up:false, deltaColor:"var(--success)" },
    { label:"Días sin gastar", value:"4", delta:"este mes", up:null, deltaColor:"var(--subtext)" },
  ];
  return (
    <div className="panel-strong p-4">
      <CardHeader
        title="KPIs"
        subtitle="Indicadores"
        action={null}
      />
      <div className="grid grid-cols-2 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border p-3" style={{borderColor:"var(--border)"}}>
            <div className="text-[10.5px]" style={{color:"var(--subtext)"}}>{k.label}</div>
            <div className="text-[18px] serif italic font-semibold mt-0.5">{k.value}</div>
            <div className="text-[10.5px] mt-1" style={{color:k.deltaColor}}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FireProjectionCard() {
  // small area chart 6 mo (history) projected
  const data = FINANZAS.history;
  const w = 460, h = 110;
  const max = Math.max(...data.map(d=>d.in));
  const pts = data.map((d, i) => {
    const x = (i/(data.length-1)) * (w-10) + 5;
    const y = h - ((d.in - 1900)/(max - 1900)) * (h-20) - 10;
    return [x, y];
  });
  // smooth path
  const d = pts.map((p,i)=> (i===0?"M":"L")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area = d + ` L ${pts[pts.length-1][0]} ${h} L ${pts[0][0]} ${h} Z`;

  return (
    <div className="panel-strong p-4 col-span-2">
      <CardHeader
        title="Proyección FIRE"
        subtitle="Camino a la independencia"
        action={<button className="btn">Ver completo →</button>}
      />
      <div className="grid grid-cols-[1fr_auto] gap-5 items-end">
        <div>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[110px]">
            <defs>
              <linearGradient id="firegrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {/* objetivo line */}
            <line x1="0" y1="14" x2={w} y2="14" stroke="var(--accent-light)" strokeDasharray="2 4" opacity="0.5"/>
            <text x={w-2} y={11} textAnchor="end" fontSize="9" fontFamily="JetBrains Mono" fill="var(--subtext)">objetivo</text>
            <path d={area} fill="url(#firegrad)"/>
            <path d={d} stroke="var(--accent)" strokeWidth="1.8" fill="none"/>
            {pts.map((p,i)=>(
              <circle key={i} cx={p[0]} cy={p[1]} r={i===pts.length-1?3.4:1.6}
                fill={i===pts.length-1?"var(--accent-light)":"var(--accent)"}/>
            ))}
            {/* labels */}
            {data.map((d,i)=>(
              <text key={i} x={pts[i][0]} y={h-1} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="var(--mute)">
                {d.m}
              </text>
            ))}
          </svg>
        </div>
        <div className="flex flex-col gap-3 min-w-[180px]">
          <div>
            <div className="label">Alcanzás FIRE en</div>
            <div className="serif italic text-[26px] font-semibold tnum grad-text leading-tight">2041</div>
            <div className="text-[11px]" style={{color:"var(--subtext)"}}>en ~15 años al ritmo actual</div>
          </div>
          <div>
            <div className="label">Retiro mensual proyectado</div>
            <div className="serif italic text-[18px] font-semibold tnum">{fmtUSD(2400)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MainAreaHeader() {
  const tabs = [
    {id:"dash",  label:"Dashboard",    active:true},
    {id:"mov",   label:"Movimientos",  active:false},
    {id:"pat",   label:"Patrimonio",   active:false},
    {id:"fire",  label:"Proyección FIRE", active:false},
  ];
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-1 p-1 rounded-xl border" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
        {tabs.map(t => (
          <button key={t.id}
            className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150"
            style={{
              background: t.active ? "var(--bg)" : "transparent",
              color: t.active ? "var(--text)" : "var(--subtext)",
              boxShadow: t.active ? "0 1px 0 var(--border)" : "none",
            }}>{t.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn">
          <Icon name="filter" size={13}/>
          Filtros
        </button>
        <button className="btn">
          <Icon name="download" size={13}/>
          Exportar
        </button>
      </div>
    </div>
  );
}

function FinanzasScreen() {
  const [showNew, setShowNew] = React.useState(false);
  return (
    <div className="flex flex-1 min-h-0" data-screen-label="04 Finanzas">
      <FinanzasLeftPanel />
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
        <MainAreaHeader />
        <div className="grid grid-cols-3 gap-4">
          <IncomeExpenseCard />
          <DonutCard />
          <MovimientosCard />
          <SubscriptionsCard />
          <KPIsCard />
          <FireProjectionCard />
        </div>
        <div className="h-12" />
      </div>
      {showNew && <NewMovimientoModal onClose={()=>setShowNew(false)} />}
    </div>
  );
}

window.FinanzasScreen = FinanzasScreen;
