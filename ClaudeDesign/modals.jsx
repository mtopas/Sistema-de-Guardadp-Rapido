/* Modals: NewHabitModal, NewEventModal, NewMovimientoModal */

function ModalShell({ onClose, children, width="max-w-md" }) {
  React.useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center anim-fadeIn"
      onClick={onClose}
      style={{ background:"color-mix(in oklch, black 50%, transparent)", backdropFilter:"blur(8px)" }}>
      <div
        onClick={(e)=>e.stopPropagation()}
        className={`anim-scaleIn w-[92%] ${width} panel-strong glow overflow-hidden`}
        style={{ background:"var(--panel-bg)" }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b" style={{borderColor:"var(--border)"}}>
      <div>
        <div className="label">{subtitle}</div>
        <div className="text-[16px] font-semibold serif italic mt-0.5">{title}</div>
      </div>
      <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
        <Icon name="x" size={16}/>
      </button>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="label">{label}</div>
        {hint && <div className="text-[10.5px]" style={{color:"var(--subtext)"}}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────── New Habit ─────────────────────── */

function NewHabitModal({ onClose }) {
  const [color, setColor] = React.useState(BRANCH[0]);
  const [freq, setFreq] = React.useState("all");
  const [days, setDays] = React.useState(["L","M","X","J","V"]);
  const [scheduled, setScheduled] = React.useState(false);

  const dayLetters = ["L","M","X","J","V","S","D"];

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Nuevo hábito" subtitle="Crear" onClose={onClose} />
      <div className="px-5 py-4">
        <Field label="Nombre">
          <input className="input" placeholder="Ej: Meditar 10 min" autoFocus defaultValue="" />
        </Field>

        <Field label="Color">
          <div className="flex gap-1.5 flex-wrap">
            {BRANCH.map(c => (
              <button key={c} onClick={()=>setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{
                  background: c,
                  opacity: c === color ? 1 : 0.4,
                  transform: c === color ? "scale(1.1)" : "scale(1)",
                  boxShadow: c === color ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : "none",
                }}
                aria-label={"Color "+c}
              />
            ))}
          </div>
        </Field>

        <Field label="Frecuencia">
          <div className="flex gap-1 p-1 rounded-xl border mb-2.5" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
            {[
              {id:"all", label:"Todos los días"},
              {id:"custom", label:"Días personalizados"},
            ].map(t => (
              <button key={t.id} onClick={()=>setFreq(t.id)}
                className="flex-1 text-[12.5px] py-1.5 rounded-lg transition-all"
                style={{
                  background: freq===t.id ? "var(--bg)" : "transparent",
                  color: freq===t.id ? "var(--text)" : "var(--subtext)",
                  fontWeight: freq===t.id ? 600 : 500,
                  boxShadow: freq===t.id ? "0 1px 0 var(--border)" : "none",
                }}>{t.label}</button>
            ))}
          </div>
          {freq === "custom" && (
            <div className="flex gap-1.5 anim-slideUp">
              {dayLetters.map(d => {
                const on = days.includes(d);
                return (
                  <button key={d}
                    onClick={()=> setDays(on ? days.filter(x=>x!==d) : [...days, d])}
                    className="w-9 h-9 rounded-full text-[12px] font-semibold transition-all"
                    style={{
                      background: on ? color : "var(--surface)",
                      color: on ? "white" : "var(--subtext)",
                      border: "1px solid "+(on ? color : "var(--border)"),
                    }}
                  >{d}</button>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Horario">
          <div className="flex gap-1 p-1 rounded-xl border mb-2.5" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
            {[
              {id:false, label:"Sin horario"},
              {id:true,  label:"Con horario"},
            ].map(t => (
              <button key={String(t.id)} onClick={()=>setScheduled(t.id)}
                className="flex-1 text-[12.5px] py-1.5 rounded-lg transition-all"
                style={{
                  background: scheduled===t.id ? "var(--bg)" : "transparent",
                  color: scheduled===t.id ? "var(--text)" : "var(--subtext)",
                  fontWeight: scheduled===t.id ? 600 : 500,
                  boxShadow: scheduled===t.id ? "0 1px 0 var(--border)" : "none",
                }}>{t.label}</button>
            ))}
          </div>
          {scheduled && (
            <div className="flex items-center gap-2 anim-slideUp">
              <input type="time" defaultValue="07:30" className="input mono" style={{maxWidth:140}}/>
              <span className="text-[12px]" style={{color:"var(--subtext)"}}>cada día a esta hora</span>
            </div>
          )}
        </Field>
      </div>

      <div className="px-5 py-4 border-t flex items-center gap-2 justify-end" style={{borderColor:"var(--border)", background:"color-mix(in oklch, var(--surface) 40%, transparent)"}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onClose}>
          <Icon name="check" size={14} strokeWidth={2.5}/> Crear hábito
        </button>
      </div>
    </ModalShell>
  );
}

/* ─────────────────────── New Event ─────────────────────── */

function NewEventModal({ onClose }) {
  const [allDay, setAllDay] = React.useState(false);
  const [cal, setCal] = React.useState(AGENDA.calendars[0]);
  return (
    <ModalShell onClose={onClose} width="max-w-lg">
      <div className="h-1.5 grad-bg"/>
      <ModalHeader title="Nuevo evento" subtitle="Agendar" onClose={onClose}/>
      <div className="px-5 py-4">
        <input className="input text-[18px] serif italic font-medium mb-4"
          placeholder="¿Qué evento?" autoFocus defaultValue=""
          style={{padding:"14px 14px"}}/>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <button className="input flex items-center justify-between text-left" style={{padding:"10px 12px"}}>
              <span className="flex items-center gap-2"><Icon name="calendar" size={13}/> 13 May 2026</span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
          <Field label="Calendario">
            <button className="input flex items-center justify-between text-left" style={{padding:"10px 12px"}}>
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{background:cal.color}}/> {cal.name}
              </span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
        </div>

        <Field label="Horario">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[12.5px]" style={{color:"var(--text-2)"}}>Todo el día</span>
            <button onClick={()=>setAllDay(!allDay)}
              className="w-9 h-5 rounded-full p-0.5 transition-colors"
              style={{background: allDay ? "var(--accent)" : "var(--surface)", border:"1px solid var(--border)"}}>
              <span className="block w-4 h-4 rounded-full bg-white transition-transform"
                style={{transform: allDay ? "translateX(14px)" : "translateX(0)"}}/>
            </button>
          </div>
          {!allDay && (
            <div className="flex items-center gap-2 anim-slideUp">
              <input type="time" defaultValue="09:30" className="input mono" style={{maxWidth:130}}/>
              <span className="text-[11px]" style={{color:"var(--subtext)"}}>a</span>
              <input type="time" defaultValue="10:30" className="input mono" style={{maxWidth:130}}/>
              <span className="chip ml-auto" style={{color:"var(--accent-light)", background:"color-mix(in oklch, var(--accent) 14%, transparent)", borderColor:"color-mix(in oklch, var(--accent) 28%, transparent)"}}>
                <Icon name="clock" size={10}/> 1 hora
              </span>
            </div>
          )}
        </Field>

        <Field label="Repetición">
          <div className="flex flex-wrap gap-1.5">
            {["Sin repetir","Cada día","Semanal","Mensual","Anual"].map((r,i)=>(
              <button key={r} className="chip cursor-pointer transition-colors"
                style={{
                  color: i===0 ? "var(--accent-light)" : "var(--text-2)",
                  borderColor: i===0 ? "color-mix(in oklch, var(--accent) 30%, transparent)" : "var(--border)",
                  background: i===0 ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "var(--surface)",
                }}>
                {i===0 ? <Icon name="check" size={10} strokeWidth={3}/> : <Icon name="repeat" size={10}/>}
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notas (opcional)">
          <textarea className="input" rows={2} placeholder="Detalles, link de reunión, ubicación…" />
        </Field>
      </div>

      <div className="px-5 py-4 border-t flex items-center gap-2 justify-end" style={{borderColor:"var(--border)", background:"color-mix(in oklch, var(--surface) 40%, transparent)"}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onClose}>
          <Icon name="check" size={14} strokeWidth={2.5}/> Guardar evento
        </button>
      </div>
    </ModalShell>
  );
}

/* ─────────────────────── New Movimiento ─────────────────────── */

function NewMovimientoModal({ onClose }) {
  const [type, setType] = React.useState("expense");
  const [method, setMethod] = React.useState("Ualá");
  const [audit, setAudit] = React.useState(false);
  const [shared, setShared] = React.useState(false);

  const types = [
    { id:"expense", label:"Gasto",   icon:"arrowUp",   color:"var(--expense)" },
    { id:"income",  label:"Ingreso", icon:"arrowDown", color:"var(--income)"  },
    { id:"debt",    label:"Deuda",   icon:"link",      color:"var(--warning)" },
  ];
  const amountColor = types.find(t=>t.id===type).color;
  const methods = ["Ualá","Brubank","Galicia","Mercado Pago","Efectivo","+ Custom"];

  return (
    <ModalShell onClose={onClose} width="max-w-lg">
      <ModalHeader title="Nuevo movimiento" subtitle="Registrar" onClose={onClose}/>
      <div className="px-5 py-4">
        {/* Type toggle */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {types.map(t => {
            const on = t.id === type;
            return (
              <button key={t.id} onClick={()=>setType(t.id)}
                className="rounded-xl border py-2.5 flex flex-col items-center gap-1 transition-all"
                style={{
                  borderColor: on ? t.color : "var(--border)",
                  background: on ? "color-mix(in oklch, "+t.color+" 12%, transparent)" : "var(--surface)",
                  color: on ? t.color : "var(--text-2)",
                }}>
                <Icon name={t.icon} size={16} strokeWidth={2.2}/>
                <span className="text-[12px] font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Amount */}
        <div className="rounded-2xl border p-4 mb-5"
          style={{
            borderColor:"color-mix(in oklch, "+amountColor+" 30%, var(--border))",
            background:"linear-gradient(180deg, color-mix(in oklch, "+amountColor+" 7%, transparent), transparent 80%)"
          }}>
          <div className="label" style={{color: amountColor}}>Monto</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[28px] font-semibold tnum" style={{color: amountColor}}>$</span>
            <input
              className="bg-transparent outline-none flex-1 serif italic text-[38px] font-semibold tnum w-full"
              defaultValue="34.200"
              style={{color: amountColor}}
              autoFocus
            />
            <span className="text-[12px] mono" style={{color:"var(--subtext)"}}>ARS</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Descripción">
            <input className="input" placeholder="¿En qué?" defaultValue="Supermercado Coto" />
          </Field>
          <Field label="Categoría">
            <button className="input flex items-center justify-between text-left">
              <span className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md grid place-items-center text-[12px]" style={{background:"var(--surface)"}}>🛒</span>
                Comida
              </span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
        </div>

        <Field label="Método de pago">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {methods.map(m => {
              const on = m === method && !m.startsWith("+");
              const isAdd = m.startsWith("+");
              return (
                <button key={m} onClick={()=>!isAdd && setMethod(m)}
                  className="chip shrink-0 cursor-pointer transition-colors"
                  style={{
                    color: on ? "var(--accent-light)" : (isAdd ? "var(--subtext)" : "var(--text-2)"),
                    borderColor: on ? "color-mix(in oklch, var(--accent) 30%, transparent)" : (isAdd ? "color-mix(in oklch, var(--subtext) 30%, transparent)" : "var(--border)"),
                    background: on ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "var(--surface)",
                    borderStyle: isAdd ? "dashed" : "solid",
                  }}>
                  {m}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <button className="input flex items-center justify-between text-left">
              <span className="flex items-center gap-2"><Icon name="calendar" size={13}/> Hoy · 13 May</span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
          <Field label="Cuenta destino">
            <button className="input flex items-center justify-between text-left">
              <span className="flex items-center gap-2"><Icon name="wallet" size={13}/> Cuenta principal</span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2.5 text-[12.5px] cursor-pointer">
            <button onClick={(e)=>{e.preventDefault(); setAudit(!audit);}}
              className="w-4 h-4 rounded grid place-items-center"
              style={{background: audit ? "var(--accent)" : "transparent", border:"1.5px solid "+(audit?"var(--accent)":"var(--border-2)")}}>
              {audit && <Icon name="check" size={10} strokeWidth={3} style={{color:"white"}}/>}
            </button>
            <span style={{color:"var(--text-2)"}}>Marcar para revisión (buffer de auditoría)</span>
          </label>
          <label className="flex items-center gap-2.5 text-[12.5px] cursor-pointer">
            <button onClick={(e)=>{e.preventDefault(); setShared(!shared);}}
              className="w-4 h-4 rounded grid place-items-center"
              style={{background: shared ? "var(--accent)" : "transparent", border:"1.5px solid "+(shared?"var(--accent)":"var(--border-2)")}}>
              {shared && <Icon name="check" size={10} strokeWidth={3} style={{color:"white"}}/>}
            </button>
            <span style={{color:"var(--text-2)"}}>Gasto compartido (50%)</span>
          </label>
        </div>
      </div>

      <div className="px-5 py-4 border-t flex items-center gap-2 justify-end" style={{borderColor:"var(--border)", background:"color-mix(in oklch, var(--surface) 40%, transparent)"}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={onClose}>
          <Icon name="check" size={14} strokeWidth={2.5}/> Guardar movimiento
        </button>
      </div>
    </ModalShell>
  );
}

window.NewHabitModal = NewHabitModal;
window.NewEventModal = NewEventModal;
window.NewMovimientoModal = NewMovimientoModal;
