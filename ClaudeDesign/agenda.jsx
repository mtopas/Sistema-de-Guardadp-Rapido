/* Agenda — LeftPanel (MiniCalendar + Calendarios + Próximos) + Vista Mes */

function MiniCalendar() {
  const days = Array.from({length:31}, (_,i)=>i+1);
  // 1 May 2026 is Friday → offset 4 (Mon=0)
  const offset = 4;
  const cells = Array.from({length: offset}, (_,i)=>null).concat(days);
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);
  const eventDays = Object.keys(AGENDA.monthEvents).map(n=>parseInt(n,10));

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[13px] font-semibold serif italic">{AGENDA.month}</div>
        <div className="flex items-center gap-1">
          <button className="icon-btn" style={{width:22,height:22}}><Icon name="chevronLeft" size={12}/></button>
          <button className="icon-btn" style={{width:22,height:22}}><Icon name="chevronRight" size={12}/></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["L","M","X","J","V","S","D"].map((d,i)=>(
          <div key={i} className="text-[10px] uppercase tracking-widest" style={{color:"var(--mute)"}}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday = d === AGENDA.today;
          const hasEvents = eventDays.includes(d);
          const evColors = hasEvents ? AGENDA.monthEvents[d].slice(0,3).map(e=>e.c) : [];
          const isWeekend = (i % 7) >= 5;
          return (
            <div key={i} className="relative flex flex-col items-center pt-0.5 pb-1.5">
              {isToday ? (
                <div className="w-7 h-7 rounded-full grid place-items-center grad-bg text-white text-[11px] font-semibold tnum">{d}</div>
              ) : (
                <div className="w-7 h-7 rounded-full grid place-items-center text-[11.5px] tnum cursor-pointer hover:bg-[var(--surface)]"
                  style={{color: isWeekend ? "var(--mute)" : "var(--text-2)"}}>{d}</div>
              )}
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5">
                  {evColors.map((c,j)=>(
                    <span key={j} className="w-1 h-1 rounded-full" style={{background:c, opacity:0.9}}/>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaLeftPanel() {
  return (
    <aside className="w-[280px] shrink-0 h-full overflow-y-auto"
      style={{ borderRight:"1px solid var(--border)" }}>
      <div className="p-4">
        <div className="panel-strong p-3 mb-4">
          <MiniCalendar />
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <div className="label">Calendarios</div>
          <button className="text-[10.5px] flex items-center gap-1 hover:text-[var(--text)]" style={{color:"var(--subtext)"}}>
            <Icon name="plus" size={11}/> Nuevo
          </button>
        </div>
        <div className="flex flex-col gap-0.5 mb-4">
          {AGENDA.calendars.map(k => (
            <div key={k.id}
              className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--surface)]">
              <div
                className="w-4 h-4 rounded grid place-items-center"
                style={{
                  background: k.on ? k.color : "transparent",
                  border: "1.5px solid "+(k.on ? k.color : "var(--border-2)"),
                }}
              >
                {k.on && <Icon name="check" size={10} strokeWidth={3} style={{color:"white"}}/>}
              </div>
              <span className="text-[12.5px] flex-1" style={{color: k.on ? "var(--text)" : "var(--subtext)"}}>{k.name}</span>
              <button className="icon-btn opacity-0 group-hover:opacity-100" style={{width:22,height:22}}>
                <Icon name="more" size={12}/>
              </button>
            </div>
          ))}
        </div>

        <hr className="divider" />

        <div className="label mb-2 px-1">Próximos</div>
        <div className="flex flex-col gap-1.5">
          {AGENDA.upcoming.map(e => (
            <div key={e.id} className="flex gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--surface)] cursor-pointer">
              <span className="w-1 rounded-full shrink-0 self-stretch" style={{background:e.cal}}/>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{e.title}</div>
                <div className="text-[10.5px] mt-0.5" style={{color:"var(--subtext)"}}>{e.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function MonthView() {
  // build 6×7 grid for May 2026
  const offset = 4; // Fri=4 (Mon=0)
  const totalDays = 31;
  const cells = [];
  // previous month tail: Apr ends with 30
  for (let i = 0; i < offset; i++) {
    cells.push({ d: 30 - offset + 1 + i, prev:true });
  }
  for (let d = 1; d <= totalDays; d++) cells.push({ d, prev:false });
  let nx = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ d: nx++, next:true });

  const weekdays = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

  return (
    <div className="panel-strong flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3">
          <button className="icon-btn"><Icon name="chevronLeft" size={15}/></button>
          <div className="text-[16px] font-semibold serif italic min-w-[140px] text-center">{AGENDA.month}</div>
          <button className="icon-btn"><Icon name="chevronRight" size={15}/></button>
          <button className="btn ml-2"><Icon name="target" size={13}/> Hoy</button>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl border" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
          {["Día","Semana","Mes"].map((v,i) => (
            <button key={v}
              className="px-3 py-1.5 rounded-lg text-[12px] transition-all duration-150"
              style={{
                background: v==="Mes" ? "var(--bg)" : "transparent",
                color: v==="Mes" ? "var(--text)" : "var(--subtext)",
                fontWeight: v==="Mes" ? 600 : 500,
                boxShadow: v==="Mes" ? "0 1px 0 var(--border)" : "none",
              }}>{v}</button>
          ))}
        </div>
      </div>

      {/* weekday headers */}
      <div className="grid grid-cols-7 border-b" style={{borderColor:"var(--border)"}}>
        {weekdays.map((d,i)=>(
          <div key={d} className="px-3 py-2 text-[10.5px] uppercase tracking-widest"
            style={{color: i>=5 ? "var(--mute)" : "var(--subtext)", borderLeft: i ? "1px solid var(--border)" : "none"}}>
            {d}
          </div>
        ))}
      </div>

      {/* cells */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {cells.map((cell, i) => {
          const row = Math.floor(i/7), col = i%7;
          const isToday = !cell.prev && !cell.next && cell.d === AGENDA.today;
          const isWeekend = col >= 5;
          const dim = cell.prev || cell.next;
          const evts = !dim && AGENDA.monthEvents[cell.d] ? AGENDA.monthEvents[cell.d] : [];
          return (
            <div key={i}
              className="min-h-0 p-1.5 cursor-pointer relative overflow-hidden"
              style={{
                borderLeft: col ? "1px solid var(--border)" : "none",
                borderTop: row ? "1px solid var(--border)" : "none",
                background: isToday ? "color-mix(in oklch, var(--accent) 5%, transparent)" : undefined,
                opacity: dim ? 0.32 : 1,
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="" />
                {isToday ? (
                  <div className="w-6 h-6 rounded-full grid place-items-center grad-bg text-white text-[11px] font-semibold tnum">{cell.d}</div>
                ) : (
                  <span className="text-[11px] tnum px-1"
                    style={{color: isWeekend ? "var(--mute)" : "var(--text-2)"}}>{cell.d}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {evts.slice(0,3).map((e,j) => (
                  <div key={j}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] truncate"
                    style={{
                      background: "color-mix(in oklch, "+e.c+" 22%, transparent)",
                      color: "color-mix(in oklch, "+e.c+" 50%, white 80%)",
                      borderLeft: "2px solid "+e.c,
                    }}
                  >
                    {e.h && <span className="mono text-[9.5px] opacity-80">{e.h}</span>}
                    <span className="truncate font-medium">{e.t}</span>
                  </div>
                ))}
                {evts.length > 3 && (
                  <div className="text-[10px] px-1.5" style={{color:"var(--subtext)"}}>
                    + {evts.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaTodayStrip() {
  const todays = AGENDA.monthEvents[AGENDA.today] || [];
  return (
    <div className="panel-strong p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="label">Tu día · 13 May · Miércoles</div>
          <div className="text-[18px] serif italic mt-0.5">{todays.length} eventos · 2 horas en reuniones</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn"><Icon name="clock" size={13}/> Ver horarios</button>
        </div>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {todays.map((e,i) => (
          <div key={i}
            className="shrink-0 rounded-xl border px-3 py-2.5 min-w-[180px]"
            style={{
              borderColor:"var(--border)",
              background: "linear-gradient(140deg, color-mix(in oklch, "+e.c+" 10%, transparent), transparent 80%)"
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{background:e.c}}/>
              <span className="mono text-[10.5px]" style={{color:"var(--subtext)"}}>{e.h || "todo el día"}</span>
            </div>
            <div className="text-[12.5px] font-medium truncate">{e.t}</div>
          </div>
        ))}
        <div className="shrink-0 rounded-xl border-2 border-dashed px-3 py-2.5 min-w-[120px] grid place-items-center cursor-pointer"
          style={{borderColor:"var(--border-2)", color:"var(--subtext)"}}>
          <span className="text-[11.5px] flex items-center gap-1"><Icon name="plus" size={12}/> Agregar</span>
        </div>
      </div>
    </div>
  );
}

function AgendaScreen() {
  const [showNew, setShowNew] = React.useState(false);
  return (
    <div className="flex flex-1 min-h-0" data-screen-label="03 Agenda">
      <AgendaLeftPanel />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden px-6 py-5">
        <AgendaTodayStrip />
        <MonthView />
      </div>
      {showNew && <NewEventModal onClose={()=>setShowNew(false)} />}
    </div>
  );
}

window.AgendaScreen = AgendaScreen;
