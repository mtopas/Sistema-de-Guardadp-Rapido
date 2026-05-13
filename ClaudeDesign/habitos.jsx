/* Hábitos — LeftPanel (lista) + Grilla mensual + ProgressSummary + FooterStats */

function HabitChip({ h, selected, onClick }) {
  const dayState = h.doneToday ? "done" : (h.sched.includes(((HABITOS.today-1) % 7) + 1) ? "pending" : "off");
  const dotColor = dayState === "done" ? "var(--habit-done)" :
                   dayState === "pending" ? "var(--warning)" : "var(--mute)";
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-150 relative"
      style={{
        background: selected ? "var(--surface)" : "transparent",
        borderLeft: selected ? `3px solid ${h.color}` : "3px solid transparent",
      }}
      onMouseEnter={(e)=>!selected && (e.currentTarget.style.background="color-mix(in oklch, var(--surface) 60%, transparent)")}
      onMouseLeave={(e)=>!selected && (e.currentTarget.style.background="transparent")}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background: h.color, boxShadow:`0 0 0 3px color-mix(in oklch, ${h.color} 15%, transparent)`}} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate" style={{color:"var(--text)"}}>{h.name}</div>
        <div className="text-[10.5px] mt-0.5 flex items-center gap-2" style={{color:"var(--subtext)"}}>
          <span className="w-1.5 h-1.5 rounded-full" style={{background:dotColor}} />
          {dayState === "done" ? "Hecho hoy" : dayState === "pending" ? "Pendiente hoy" : "No toca hoy"}
        </div>
      </div>
      {h.streak >= 3 && (
        <div className="flex items-center gap-1 text-[11px] font-semibold tnum" style={{color:"var(--warning)"}}>
          <Icon name="flame" size={13} />
          {h.streak}
        </div>
      )}
    </div>
  );
}

function HabitsLeftPanel({ selectedId, setSelectedId, onNew }) {
  const [filter, setFilter] = React.useState("activos");
  return (
    <aside className="w-[280px] shrink-0 h-full overflow-y-auto"
      style={{ borderRight:"1px solid var(--border)" }}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label">Mis hábitos</div>
            <div className="text-[18px] serif italic mt-0.5">7 activos</div>
          </div>
          <button className="btn btn-primary glow-sm" onClick={onNew}>
            <Icon name="plus" size={13} strokeWidth={2} />
            Nuevo
          </button>
        </div>

        <div className="flex gap-1 mb-4 p-1 rounded-xl border" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
          {[
            {id:"activos",  label:"Activos",  n:7},
            {id:"pausados", label:"Pausados", n:2},
          ].map(t => (
            <button key={t.id} onClick={()=>setFilter(t.id)}
              className="flex-1 text-[12px] py-1.5 rounded-lg transition-all duration-150"
              style={{
                background: filter===t.id ? "var(--bg)" : "transparent",
                color: filter===t.id ? "var(--text)" : "var(--subtext)",
                fontWeight: filter===t.id ? 600 : 500,
                boxShadow: filter===t.id ? "0 1px 0 var(--border)" : "none",
              }}>
              {t.label} <span className="opacity-60 tnum">({t.n})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          {HABITOS.habits.map(h => (
            <HabitChip key={h.id} h={h} selected={h.id===selectedId} onClick={()=>setSelectedId(h.id)} />
          ))}
        </div>

        <hr className="divider" />

        <div className="label mb-2">Resumen</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-3" style={{borderColor:"var(--border)"}}>
            <div className="text-[10px] uppercase tracking-widest" style={{color:"var(--subtext)"}}>Mejor racha</div>
            <div className="text-[20px] font-semibold tnum mt-1 flex items-baseline gap-1">
              11 <span className="text-[10px]" style={{color:"var(--subtext)"}}>días</span>
            </div>
          </div>
          <div className="rounded-lg border p-3" style={{borderColor:"var(--border)"}}>
            <div className="text-[10px] uppercase tracking-widest" style={{color:"var(--subtext)"}}>Promedio</div>
            <div className="text-[20px] font-semibold tnum mt-1 flex items-baseline gap-1">
              78<span className="text-[10px]" style={{color:"var(--subtext)"}}>%</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProgressSummary() {
  const done = HABITOS.habits.filter(h => h.doneToday).length;
  const today = HABITOS.today;
  const total = HABITOS.habits.filter(h => h.sched.includes(((today-1)%7)+1)).length;
  const pct = Math.round((done/total)*100);
  return (
    <div className="sticky top-0 z-10 -mx-6 px-6 py-4 mb-4"
      style={{
        background:"linear-gradient(180deg, var(--bg) 70%, transparent 100%)",
        backdropFilter:"blur(6px)",
      }}
    >
      <div className="panel-strong p-4 flex items-center gap-5">
        <div className="shrink-0">
          <div className="label">Hoy · 13 May</div>
          <div className="text-[24px] serif italic mt-0.5">
            <span className="tnum font-semibold">{done}</span>
            <span className="text-[14px] mx-1.5" style={{color:"var(--subtext)"}}>de</span>
            <span className="tnum font-semibold">{total}</span>
            <span className="text-[13px] ml-2" style={{color:"var(--subtext)"}}>completados</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-2 rounded-full overflow-hidden" style={{background:"var(--surface)"}}>
            <div className="absolute inset-y-0 left-0 rounded-full grad-bg transition-all duration-500"
              style={{width: pct+"%"}} />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10.5px]" style={{color:"var(--subtext)"}}>
            <span>0</span>
            <span className="grad-text font-semibold tnum">{pct}%</span>
            <span>{total}</span>
          </div>
        </div>
        <div className="shrink-0 grid grid-cols-2 gap-2 w-[200px]">
          <div className="text-center">
            <div className="text-[20px] font-semibold tnum" style={{color:"var(--success)"}}>+18%</div>
            <div className="text-[10px]" style={{color:"var(--subtext)"}}>vs mes pasado</div>
          </div>
          <div className="text-center">
            <div className="text-[20px] font-semibold tnum" style={{color:"var(--text)"}}>11</div>
            <div className="text-[10px]" style={{color:"var(--subtext)"}}>racha máxima</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HabitGrid({ selectedId }) {
  const days = Array.from({length: HABITOS.daysInMonth}, (_,i) => i+1);
  return (
    <div className="panel-strong overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3">
          <button className="icon-btn"><Icon name="chevronLeft" size={15}/></button>
          <div className="text-[15px] font-semibold serif italic min-w-[120px] text-center">{HABITOS.month}</div>
          <button className="icon-btn"><Icon name="chevronRight" size={15}/></button>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn">
            <Icon name="target" size={13}/> Hoy
          </button>
          <button className="btn btn-ghost">
            <Icon name="filter" size={13}/> Vista
          </button>
        </div>
      </div>

      {/* day headers */}
      <div className="flex border-b" style={{borderColor:"var(--border)"}}>
        <div className="sticky left-0 z-10 w-[180px] shrink-0 px-4 py-2 text-[10px] uppercase tracking-widest"
          style={{background:"var(--panel-bg)", color:"var(--subtext)", borderRight:"1px solid var(--border)"}}>
          Hábito
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex">
            {days.map(d => {
              const isToday = d === HABITOS.today;
              // 1 May 2026 = Friday → weekday index of day d: ((d-1+4) % 7), 0=Lun
              const wd = ((d-1+4) % 7); // 0=Mon..6=Sun
              const isWeekend = wd >= 5;
              return (
                <div key={d} className="w-[36px] shrink-0 grid place-items-center py-2">
                  {isToday ? (
                    <div className="w-7 h-7 rounded-full grid place-items-center grad-bg text-white text-[11px] font-semibold tnum">
                      {d}
                    </div>
                  ) : (
                    <div className="text-[11px] tnum"
                      style={{color: isWeekend ? "var(--mute)" : "var(--text-2)"}}>{d}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="sticky right-0 z-10 w-[90px] shrink-0 px-3 py-2 text-[10px] uppercase tracking-widest text-right"
          style={{background:"var(--panel-bg)", color:"var(--subtext)", borderLeft:"1px solid var(--border)"}}>
          Mes
        </div>
      </div>

      {/* rows */}
      <div>
        {HABITOS.habits.map((h, hi) => {
          const isSelected = h.id === selectedId;
          // % cumplimiento del mes
          const scheduled = days.filter(d => h.sched.includes(((d-1+4)%7 === 6 ? 7 : (d-1+4)%7 + 1)) ).length || days.length;
          const done = h.doneDays.length;
          const pctMonth = Math.round((done / Math.max(scheduled, 1)) * 100);
          const pctColor = pctMonth >= 80 ? "var(--success)" : pctMonth >= 50 ? "var(--warning)" : "var(--danger)";
          return (
            <div key={h.id}
              className="flex border-b last:border-b-0 group anim-slideUp"
              style={{borderColor:"var(--border)", background: isSelected ? "color-mix(in oklch, "+h.color+" 4%, transparent)" : "transparent", animationDelay: (hi*30)+"ms"}}
            >
              {/* name */}
              <div className="sticky left-0 z-10 w-[180px] shrink-0 flex items-center gap-2.5 px-4 py-2.5"
                style={{
                  background: isSelected ? "color-mix(in oklch, "+h.color+" 6%, var(--panel-bg))" : "var(--panel-bg)",
                  borderRight:"1px solid var(--border)"
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{background: h.color}}/>
                <span className="text-[12.5px] font-medium truncate">{h.name}</span>
                {h.streak >= 3 && (
                  <span className="text-[10px] tnum flex items-center gap-0.5" style={{color:"var(--warning)"}}>
                    <Icon name="flame" size={10}/> {h.streak}
                  </span>
                )}
              </div>

              {/* day cells */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex">
                  {days.map(d => {
                    const wdIdx = ((d-1+4) % 7) + 1;  // 1..7 Mon..Sun
                    const active = h.sched.includes(wdIdx);
                    const isFuture = d > HABITOS.today;
                    const isDone = h.doneDays.includes(d);
                    const isToday = d === HABITOS.today;
                    return (
                      <div key={d}
                        className="w-[36px] h-[40px] shrink-0 grid place-items-center"
                        style={{ background: isToday ? "color-mix(in oklch, var(--accent) 6%, transparent)" : undefined }}
                      >
                        {!active ? (
                          <span className="w-3 h-px" style={{background:"var(--border)"}} />
                        ) : isDone ? (
                          <div className="w-[18px] h-[18px] rounded-md grid place-items-center text-white anim-pop"
                            style={{ background:`linear-gradient(135deg, ${h.color}, color-mix(in oklch, ${h.color} 70%, white 30%))`}}
                          >
                            <Icon name="check" size={11} strokeWidth={3}/>
                          </div>
                        ) : isFuture ? (
                          <div className="w-[18px] h-[18px] rounded-md border opacity-30"
                            style={{borderColor:"var(--border-2)"}} />
                        ) : (
                          <div className="w-[18px] h-[18px] rounded-md border cursor-pointer hover:border-[var(--accent)]"
                            style={{borderColor:"var(--border-2)"}} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* month % */}
              <div className="sticky right-0 z-10 w-[90px] shrink-0 px-3 py-2.5 grid place-items-end"
                style={{ background: isSelected ? "color-mix(in oklch, "+h.color+" 6%, var(--panel-bg))" : "var(--panel-bg)", borderLeft:"1px solid var(--border)"}}>
                <span className="chip tnum" style={{
                  color:pctColor,
                  background:"color-mix(in oklch, "+pctColor+" 14%, transparent)",
                  borderColor:"color-mix(in oklch, "+pctColor+" 30%, transparent)"
                }}>
                  {pctMonth}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FooterStats() {
  // tiny sparkline
  const data = [62, 71, 68, 74, 79, 78];
  const w = 220, h = 44;
  const max = 100, min = 0;
  const pts = data.map((v, i) => {
    const x = (i/(data.length-1)) * w;
    const y = h - ((v - min)/(max - min)) * h;
    return [x, y];
  });
  const dPath = pts.map((p,i) => (i===0?"M":"L")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const areaPath = dPath + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <div className="grid grid-cols-3 gap-3 mt-5">
      <div className="panel-strong p-4">
        <div className="label mb-2">Este mes vs mes anterior</div>
        <div className="flex items-baseline gap-3">
          <div className="text-[28px] font-semibold tnum serif italic">78%</div>
          <div className="flex items-center gap-1 text-[12.5px] font-medium" style={{color:"var(--success)"}}>
            <Icon name="arrowUp" size={12} strokeWidth={2.5} />
            +6 pp
          </div>
        </div>
        <div className="text-[11px] mt-1" style={{color:"var(--subtext)"}}>
          Promedio mensual <span className="mono">72%</span> en abril
        </div>
      </div>
      <div className="panel-strong p-4">
        <div className="label mb-2">Últimos 6 meses</div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[44px]">
          <defs>
            <linearGradient id="hbsg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#hbsg)" />
          <path d={dPath} stroke="var(--accent)" strokeWidth="1.6" fill="none" />
          {pts.map((p,i)=>(
            <circle key={i} cx={p[0]} cy={p[1]} r={i===pts.length-1?3:1.6}
              fill={i===pts.length-1?"var(--accent-light)":"var(--accent)"} />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] mono mt-1" style={{color:"var(--mute)"}}>
          <span>Dic</span><span>Ene</span><span>Feb</span><span>Mar</span><span>Abr</span><span>May</span>
        </div>
      </div>
      <div className="panel-strong p-4">
        <div className="label mb-2">Constancia</div>
        <div className="flex items-baseline gap-3">
          <div className="text-[28px] font-semibold tnum serif italic">11</div>
          <span className="text-[11.5px]" style={{color:"var(--subtext)"}}>días seguidos en <span style={{color:"var(--text)"}}>Leer 30 min</span></span>
        </div>
        <div className="mt-2 flex items-center gap-0.5">
          {Array.from({length:14}, (_,i) => (
            <span key={i} className="h-3 flex-1 rounded-sm"
              style={{background: i<11?"var(--accent)":"var(--border-2)",
                      opacity: i<11 ? 0.4 + (i/14)*0.6 : 1 }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function HabitosScreen() {
  const [selectedId, setSelectedId] = React.useState("h3");
  const [showNew, setShowNew] = React.useState(false);
  return (
    <div className="flex flex-1 min-h-0" data-screen-label="02 Hábitos">
      <HabitsLeftPanel selectedId={selectedId} setSelectedId={setSelectedId} onNew={()=>setShowNew(true)} />
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
        <ProgressSummary />
        <HabitGrid selectedId={selectedId} />
        <FooterStats />
        <div className="h-12" />
      </div>
      {showNew && <NewHabitModal onClose={()=>setShowNew(false)} />}
    </div>
  );
}

window.HabitosScreen = HabitosScreen;
