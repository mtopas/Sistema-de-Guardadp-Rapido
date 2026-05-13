/* App shell: Sidebar global + TopBar + container */

const MODULES = [
  { id:"boveda",   name:"Bóveda",   icon:"bookOpen",    badge:null,
    sub:"capturar y conectar", primary:"Capturar" },
  { id:"habitos",  name:"Hábitos",  icon:"target",      badge:3,
    sub:"hoy: 3 pendientes",   primary:"Nuevo hábito" },
  { id:"agenda",   name:"Agenda",   icon:"calendar",    badge:2,
    sub:"2 eventos hoy",       primary:"Nuevo evento" },
  { id:"finanzas", name:"Finanzas", icon:"trendingUp",  badge:null,
    sub:"7 mov · auditar 1",   primary:"Movimiento" },
];

function Sidebar({ active, onNav, onSettings }) {
  return (
    <aside
      data-screen-label="Sidebar"
      style={{ background:"var(--sidebar)", borderRight:"1px solid var(--border)" }}
      className="w-[232px] shrink-0 flex flex-col h-screen sticky top-0 z-20"
    >
      {/* logo */}
      <div className="px-5 pt-6 pb-5 flex items-baseline gap-2 border-b" style={{borderColor:"var(--border)"}}>
        <div className="serif italic text-[28px] leading-none grad-text font-bold">SGR</div>
        <div className="text-[10px] uppercase tracking-[0.18em]" style={{color:"var(--mute)"}}>v0.4</div>
      </div>
      <div className="px-5 pt-2 pb-4 text-[11px]" style={{color:"var(--subtext)"}}>
        Sistema de Guardado Rápido
      </div>

      {/* modules */}
      <div className="px-3 flex flex-col gap-1">
        <div className="label px-2 pt-2 pb-1.5">Módulos</div>
        {MODULES.map(m => {
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              onClick={() => onNav(m.id)}
              className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left focus-ring"
              style={{
                background: isActive
                  ? "linear-gradient(95deg, color-mix(in oklch, var(--accent) 16%, transparent), transparent 80%)"
                  : "transparent",
                color: isActive ? "var(--text)" : "var(--text-2)",
              }}
              onMouseEnter={(e)=> !isActive && (e.currentTarget.style.background="var(--surface)") }
              onMouseLeave={(e)=> !isActive && (e.currentTarget.style.background="transparent") }
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full grad-bg" />
              )}
              <span
                className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                style={{
                  background: isActive ? "color-mix(in oklch, var(--accent) 22%, transparent)" : "var(--surface)",
                  color: isActive ? "var(--accent-light)" : "var(--subtext)",
                  border: "1px solid var(--border)",
                }}
              >
                <Icon name={m.icon} size={17} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-medium">{m.name}</span>
                <span className="block text-[10.5px]" style={{color:"var(--subtext)"}}>{m.sub}</span>
              </span>
              {m.badge && (
                <span
                  className="shrink-0 text-[10px] font-semibold rounded-full px-1.5 h-[18px] grid place-items-center"
                  style={{
                    background:"color-mix(in oklch, var(--accent) 22%, transparent)",
                    color:"var(--accent-light)",
                    border:"1px solid color-mix(in oklch, var(--accent) 30%, transparent)",
                  }}
                >{m.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Quick capture inset */}
      <div className="px-3 pb-3">
        <div className="rounded-xl p-3 border" style={{
          borderColor:"var(--border)",
          background:"linear-gradient(150deg, color-mix(in oklch, var(--accent) 10%, transparent), transparent 70%)"
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-md grad-bg grid place-items-center text-white">
              <Icon name="zap" size={13} strokeWidth={2} />
            </span>
            <span className="text-[11px] uppercase tracking-widest font-semibold" style={{color:"var(--text-2)"}}>Atajo</span>
          </div>
          <div className="text-[12px] leading-snug" style={{color:"var(--subtext)"}}>
            Captura rápida desde cualquier módulo
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <kbd className="mono text-[10px] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)", color:"var(--text-2)", background:"var(--surface)"}}>⌘</kbd>
            <kbd className="mono text-[10px] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)", color:"var(--text-2)", background:"var(--surface)"}}>K</kbd>
            <span className="text-[10.5px]" style={{color:"var(--mute)"}}>para abrir</span>
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="px-3 pb-3 pt-2 border-t flex items-center gap-3" style={{borderColor:"var(--border)"}}>
        <div className="w-9 h-9 rounded-full grad-bg grid place-items-center text-white text-[12px] font-semibold serif italic">
          M
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium truncate">Marcos</div>
          <div className="text-[10.5px] truncate" style={{color:"var(--subtext)"}}>HomeLab · local</div>
        </div>
        <button className="icon-btn" onClick={onSettings} aria-label="Ajustes">
          <Icon name="settings" size={16} />
        </button>
      </div>
    </aside>
  );
}

function TopBar({ moduleId, onPrimary }) {
  const m = MODULES.find(x => x.id === moduleId) || MODULES[0];
  return (
    <header
      className="h-[60px] shrink-0 sticky top-0 z-10 flex items-center px-6 gap-6 border-b"
      style={{ background:"color-mix(in oklch, var(--bg) 80%, transparent)", borderColor:"var(--border)", backdropFilter:"blur(12px)" }}
    >
      <div className="flex items-baseline gap-3">
        <div className="label">Módulo</div>
        <div className="text-[15px] font-semibold flex items-center gap-2">
          <span className="grad-text serif italic">{m.name}</span>
          <span className="text-[11px]" style={{color:"var(--subtext)"}}>· {m.sub}</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-[520px] mx-auto relative">
        <div
          className="flex items-center gap-2 px-3 h-9 rounded-xl border transition-colors duration-150"
          style={{ background:"var(--surface)", borderColor:"var(--border)" }}
        >
          <Icon name="search" size={15} style={{color:"var(--subtext)"}} />
          <input
            placeholder="Buscar en SGR…"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:opacity-60"
          />
          <div className="flex items-center gap-1">
            <kbd className="mono text-[10px] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)", color:"var(--subtext)", background:"var(--bg)"}}>⌘</kbd>
            <kbd className="mono text-[10px] px-1.5 py-0.5 rounded border" style={{borderColor:"var(--border)", color:"var(--subtext)", background:"var(--bg)"}}>K</kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="icon-btn" aria-label="Notificaciones">
          <Icon name="bell" size={16} />
          <span
            className="absolute mt-[-12px] ml-[14px] w-[8px] h-[8px] rounded-full"
            style={{background:"var(--accent)", boxShadow:"0 0 0 2px var(--bg)"}}
          />
        </button>
        <button className="icon-btn" aria-label="Sync"><Icon name="refresh" size={16} /></button>
        <div className="w-px h-6" style={{background:"var(--border)"}} />
        <button className="btn btn-primary" onClick={onPrimary}>
          <Icon name="plus" size={15} strokeWidth={2} />
          <span>{m.primary}</span>
        </button>
      </div>
    </header>
  );
}

window.Sidebar = Sidebar;
window.TopBar = TopBar;
window.MODULES = MODULES;
