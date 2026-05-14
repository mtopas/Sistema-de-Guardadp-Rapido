/* App root: module switching, tweaks integration */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#8b5cf6",
  "density": "comfortable",
  "tone": "cool"
}/*EDITMODE-END*/;

const ACCENT_SWATCHES = [
  ["#8b5cf6","#a78bfa","#7c3aed"], // violeta
  ["#06b6d4","#22d3ee","#0891b2"], // cyan
  ["#10b981","#34d399","#059669"], // emerald
  ["#f59e0b","#fbbf24","#d97706"], // amber
  ["#f43f5e","#fb7185","#e11d48"], // rose
];

function App() {
  const [active, setActive] = React.useState("boveda");
  const [transitioning, setTransitioning] = React.useState(false);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply accent CSS vars
  React.useEffect(() => {
    const accent = Array.isArray(tweaks.accent) ? tweaks.accent : (tweaks.accent || "#8b5cf6");
    const swatch = ACCENT_SWATCHES.find(s => (Array.isArray(accent) ? s[0] === accent[0] : s[0] === accent)) || ACCENT_SWATCHES[0];
    document.documentElement.style.setProperty("--accent", swatch[0]);
    document.documentElement.style.setProperty("--accent-light", swatch[1]);
    document.documentElement.style.setProperty("--accent-deep", swatch[2]);
  }, [tweaks.accent]);

  // Apply tone
  React.useEffect(() => {
    const root = document.documentElement;
    const tones = {
      cool:    { bg:"oklch(0.145 0.018 280)", sur:"oklch(0.185 0.022 280)", sb:"oklch(0.118 0.018 280)", pan:"oklch(0.175 0.022 280)" },
      neutral: { bg:"oklch(0.145 0.005 280)", sur:"oklch(0.185 0.006 280)", sb:"oklch(0.118 0.005 280)", pan:"oklch(0.175 0.006 280)" },
      warm:    { bg:"oklch(0.148 0.016 60)",  sur:"oklch(0.188 0.020 60)",  sb:"oklch(0.120 0.014 60)",  pan:"oklch(0.178 0.018 60)" },
    };
    const k = tones[tweaks.tone] || tones.cool;
    root.style.setProperty("--bg", k.bg);
    root.style.setProperty("--surface", k.sur);
    root.style.setProperty("--sidebar", k.sb);
    root.style.setProperty("--panel-bg", k.pan);
  }, [tweaks.tone]);

  // Apply density
  React.useEffect(() => {
    const root = document.documentElement;
    if (tweaks.density === "compact") {
      root.style.setProperty("--row-pad", "8px");
      document.body.style.fontSize = "13px";
    } else {
      root.style.setProperty("--row-pad", "12px");
      document.body.style.fontSize = "14px";
    }
  }, [tweaks.density]);

  const handleNav = (id) => {
    if (id === active) return;
    setTransitioning(true);
    setTimeout(() => {
      setActive(id);
      setTransitioning(false);
    }, 80);
  };

  const CYCLE_ORDER = ["boveda", "finanzas", "agenda", "habitos"];
  const cycleModule = () => {
    const idx = CYCLE_ORDER.indexOf(active);
    const next = idx === -1 ? CYCLE_ORDER[0] : CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    handleNav(next);
  };

  const [primaryModal, setPrimaryModal] = React.useState(null);
  const handlePrimary = () => {
    if (active === "habitos") setPrimaryModal("habit");
    else if (active === "agenda") setPrimaryModal("event");
    else if (active === "finanzas") setPrimaryModal("mov");
    else setPrimaryModal("capture");
  };

  return (
    <div className="flex h-screen w-full relative">
      <div className="flex-1 min-w-0 flex flex-col relative">
        <TopBar moduleId={active} onPrimary={handlePrimary} onSettings={()=>setPrimaryModal("settings")} onCycle={cycleModule}/>
        <main className={`flex-1 min-h-0 flex flex-col ${transitioning ? "opacity-0" : "opacity-100"} transition-opacity duration-150`}>
          {active === "boveda"   && <BovedaScreen />}
          {active === "habitos"  && <HabitosScreen />}
          {active === "agenda"   && <AgendaScreen />}
          {active === "finanzas" && <FinanzasScreen />}
        </main>
      </div>

      {/* Global modals from TopBar primary action */}
      {primaryModal === "habit"   && <NewHabitModal onClose={()=>setPrimaryModal(null)}/>}
      {primaryModal === "event"   && <NewEventModal onClose={()=>setPrimaryModal(null)}/>}
      {primaryModal === "mov"     && <NewMovimientoModal onClose={()=>setPrimaryModal(null)}/>}
      {primaryModal === "capture" && <CaptureModal onClose={()=>setPrimaryModal(null)}/>}
      {primaryModal === "settings"&& <SettingsModal onClose={()=>setPrimaryModal(null)} onOpenModal={(id)=>setPrimaryModal(id)} />}

      <TweaksPanel title="Tweaks · SGR">
        <TweakSection label="Tema">
          <TweakColor
            label="Acento"
            value={tweaks.accent}
            options={ACCENT_SWATCHES}
            onChange={(v) => setTweak('accent', Array.isArray(v) ? v[0] : v)}
          />
          <TweakRadio
            label="Tono base"
            value={tweaks.tone}
            options={[
              { value:"cool", label:"Frío" },
              { value:"neutral", label:"Neutro" },
              { value:"warm", label:"Cálido" },
            ]}
            onChange={(v) => setTweak('tone', v)}
          />
          <TweakRadio
            label="Densidad"
            value={tweaks.density}
            options={[
              { value:"comfortable", label:"Cómoda" },
              { value:"compact", label:"Compacta" },
            ]}
            onChange={(v) => setTweak('density', v)}
          />
        </TweakSection>

        <TweakSection label="Atajos">
          <div className="grid grid-cols-2 gap-1.5">
            {MODULES.map(m => (
              <button key={m.id}
                onClick={()=>handleNav(m.id)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] text-left"
                style={{
                  background: m.id===active ? "color-mix(in oklch, var(--accent) 16%, transparent)" : "var(--surface)",
                  color: m.id===active ? "var(--text)" : "var(--text-2)",
                  border:"1px solid var(--border)",
                }}>
                <Icon name={m.icon} size={14}/>
                {m.name}
              </button>
            ))}
          </div>
        </TweakSection>

        <TweakSection label="Modales">
          <div className="grid grid-cols-2 gap-1.5">
            <TweakButton label="Nuevo hábito" onClick={()=>setPrimaryModal("habit")} />
            <TweakButton label="Nuevo evento" onClick={()=>setPrimaryModal("event")} />
            <TweakButton label="Movimiento"   onClick={()=>setPrimaryModal("mov")} />
            <TweakButton label="Captura"      onClick={()=>setPrimaryModal("capture")} />
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

/* Quick capture modal (Bóveda primary action) */
function CaptureModal({ onClose }) {
  const [showOG, setShowOG] = React.useState(false);
  return (
    <ModalShell onClose={onClose} width="max-w-xl">
      <ModalHeader title="Captura rápida" subtitle="A la Bóveda" onClose={onClose}/>
      <div className="px-5 py-4">
        <textarea
          autoFocus
          placeholder="Pegá un link, escribí texto, o usá la cámara…"
          className="input text-[15px] resize-none"
          rows={4}
          onChange={(e)=> setShowOG(e.target.value.includes("http"))}
          defaultValue=""
        />
        {showOG && (
          <div className="mt-3 rounded-xl border p-3 anim-slideUp" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{color:"var(--subtext)"}}>Preview detectado</div>
            <div className="text-[12.5px] font-medium">The Unreasonable Effectiveness of Plain Text</div>
            <div className="text-[10.5px] mono" style={{color:"var(--subtext)"}}>escapingflatland.substack.com</div>
          </div>
        )}

        <div className="flex gap-2 mt-4 flex-wrap">
          <div className="chip"><Icon name="fileText" size={11}/> Texto</div>
          <div className="chip"><Icon name="link" size={11}/> Link</div>
          <div className="chip"><Icon name="image" size={11}/> Foto</div>
          <div className="ml-auto chip" style={{color:"var(--accent-light)", background:"color-mix(in oklch, var(--accent) 14%, transparent)", borderColor:"color-mix(in oklch, var(--accent) 28%, transparent)"}}>
            <Icon name="sparkles" size={11}/> Auto-detectar
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Field label="Categoría">
            <button className="input flex items-center justify-between text-left">
              <span className="flex items-center gap-2">📚 Lecturas › Long-reads</span>
              <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
            </button>
          </Field>
          <Field label="Recordar (opcional)">
            <button className="input flex items-center justify-between text-left" style={{color:"var(--subtext)"}}>
              <span className="flex items-center gap-2"><Icon name="clock" size={12}/> Sin recordatorio</span>
              <Icon name="plus" size={12}/>
            </button>
          </Field>
        </div>
      </div>
      <div className="px-5 py-4 border-t flex items-center gap-2 justify-between" style={{borderColor:"var(--border)", background:"color-mix(in oklch, var(--surface) 40%, transparent)"}}>
        <div className="text-[10.5px] mono" style={{color:"var(--subtext)"}}>
          <kbd className="px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)"}}>⌘</kbd>
          <kbd className="px-1.5 py-0.5 rounded border ml-1" style={{borderColor:"var(--border)"}}>↵</kbd>
          <span className="ml-2">para guardar</span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onClose}>
            <Icon name="zap" size={14} strokeWidth={2.5}/> Guardar en Bóveda
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* Settings modal */
function SettingsModal({ onClose, onOpenModal }) {
  const modalShortcuts = [
    { id:"capture", label:"Captura rápida",  icon:"zap",      desc:"Bóveda" },
    { id:"habit",   label:"Nuevo hábito",    icon:"target",   desc:"Hábitos" },
    { id:"event",   label:"Nuevo evento",    icon:"calendar", desc:"Agenda" },
    { id:"mov",     label:"Nuevo movimiento",icon:"wallet",   desc:"Finanzas" },
  ];
  return (
    <ModalShell onClose={onClose} width="max-w-md">
      <ModalHeader title="Ajustes" subtitle="Configuración" onClose={onClose}/>
      <div className="px-5 py-4 flex flex-col gap-3">
        <Field label="Nombre de usuario">
          <input className="input" defaultValue="Marcos"/>
        </Field>
        <Field label="Idioma">
          <button className="input flex items-center justify-between text-left">
            <span className="flex items-center gap-2"><Icon name="globe" size={13}/> Español (AR)</span>
            <Icon name="chevronDown" size={12} style={{color:"var(--subtext)"}}/>
          </button>
        </Field>
        <Field label="Bot de Telegram">
          <div className="flex items-center justify-between rounded-xl border p-3" style={{borderColor:"var(--border)", background:"var(--surface)"}}>
            <div>
              <div className="text-[12.5px] font-medium">Conectado</div>
              <div className="text-[10.5px] mono" style={{color:"var(--subtext)"}}>@sgr_marcos_bot</div>
            </div>
            <span className="chip" style={{color:"var(--success)", background:"color-mix(in oklch, var(--success) 14%, transparent)", borderColor:"color-mix(in oklch, var(--success) 30%, transparent)"}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{background:"var(--success)"}}/> activo
            </span>
          </div>
        </Field>

        <hr className="divider" style={{margin:"4px 0"}}/>

        <Field label="Vista previa de modales" hint="prototipo / demo">
          <div className="grid grid-cols-2 gap-2">
            {modalShortcuts.map(s => (
              <button key={s.id}
                onClick={() => { onClose(); setTimeout(()=>onOpenModal(s.id), 60); }}
                className="rounded-xl border px-3 py-2.5 text-left flex items-center gap-2.5 transition-colors hover:border-[color:var(--accent)]"
                style={{borderColor:"var(--border)", background:"var(--surface)"}}>
                <span className="w-8 h-8 rounded-lg grid place-items-center"
                  style={{background:"color-mix(in oklch, var(--accent) 14%, transparent)", color:"var(--accent-light)"}}>
                  <Icon name={s.icon} size={14}/>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium truncate">{s.label}</span>
                  <span className="block text-[10px]" style={{color:"var(--subtext)"}}>{s.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="px-5 py-4 border-t flex items-center justify-end gap-2" style={{borderColor:"var(--border)", background:"color-mix(in oklch, var(--surface) 40%, transparent)"}}>
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={onClose}>Guardar</button>
      </div>
    </ModalShell>
  );
}

window.CaptureModal = CaptureModal;
window.SettingsModal = SettingsModal;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
