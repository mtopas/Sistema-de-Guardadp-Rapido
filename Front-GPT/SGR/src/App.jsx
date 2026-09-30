import React, { useEffect, useRef, useState, Suspense, lazy } from "react";
import {
  Orbit,
  Network,
  Wallet,
  CalendarDays,
  Leaf,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  Bell,
  Command,
  Menu,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  FileText,
  CheckSquare,
  Sun,
  ArrowRight,
  Keyboard,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "./store";
import { Button, IconButton, GlobalModals, Modal, SearchBox, Pill } from "./ui";
import { title, today, labelDate, scheduled, safeURL } from "./domain";
const Boveda = lazy(() => import("./Boveda")),
  Finanzas = lazy(() => import("./Finanzas")),
  Agenda = lazy(() => import("./Agenda")),
  Habitos = lazy(() => import("./Habitos")),
  SettingsPage = lazy(() => import("./Settings"));
const nav = [
  {
    path: "/",
    label: "Bóveda",
    sub: "Conectá tus ideas",
    icon: Network,
    color: "#9f96ff",
    section: "boveda",
  },
  {
    path: "/finanzas",
    label: "Finanzas",
    sub: "Construí tu libertad",
    icon: Wallet,
    color: "#ffad79",
    section: "finanzas",
  },
  {
    path: "/agenda",
    label: "Agenda",
    sub: "Dale espacio a tu día",
    icon: CalendarDays,
    color: "#65d9ee",
    section: "agenda",
  },
  {
    path: "/habitos",
    label: "Hábitos",
    sub: "Un paso cada día",
    icon: Leaf,
    color: "#b4f580",
    section: "habitos",
  },
];
function useRoute() {
  const [route, setRoute] = useState(
    window.location.pathname + window.location.search,
  );
  useEffect(() => {
    const pop = () =>
      setRoute(window.location.pathname + window.location.search);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const navigate = (url) => {
    window.history.pushState({}, "", url);
    setRoute(url);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return [route, navigate];
}
export default function App() {
  const app = useApp();
  const { db, status, mode, preferences, setModal, toast, setToast } = app;
  const [route, navigate] = useRoute();
  const pathname = route.split("?")[0];
  const section = pathname.startsWith("/finanzas")
    ? "finanzas"
    : pathname.startsWith("/agenda")
      ? "agenda"
      : pathname.startsWith("/habitos")
        ? "habitos"
        : pathname.startsWith("/settings")
          ? "settings"
          : "boveda";
  const current = nav.find((n) => n.section === section);
  const [command, setCommand] = useState(false),
    [capture, setCapture] = useState(false),
    [mobile, setMobile] = useState(false),
    [shortcuts, setShortcuts] = useState(false),
    [notices, setNotices] = useState(false);
  const searchRef = useRef();
  const tab =
    new URLSearchParams(route.split("?")[1]).get("tab") ||
    { finanzas: "dashboard", agenda: "hoy", habitos: "hoy" }[section];
  const setTab = (value) => navigate(`${pathname}?tab=${value}`);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--accent",
      current?.color || "#b4f580",
    );
    document.title = `${current?.label || "Ajustes"} · SGR Órbita`;
    setMobile(false);
  }, [route]);
  useEffect(() => {
    const onKey = (e) => {
      const editable = e.target.closest(
        "input,textarea,select,[contenteditable]",
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!app.modal && !capture && !shortcuts) setCommand((c) => !c);
      } else if (
        !editable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !app.modal &&
        !command &&
        !capture &&
        !shortcuts
      ) {
        if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          setCapture(true);
        }
        if (e.key === "?") setShortcuts(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        if (!app.modal && !capture && !command) setShortcuts((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [app.modal, command, capture, shortcuts]);
  useEffect(() => {
    const listener = () => {
      if (mode === "api") app.connect();
    };
    window.addEventListener("sgr-refresh", listener);
    return () => window.removeEventListener("sgr-refresh", listener);
  }, [mode, app.base]);
  useEffect(() => {
    if (pathname === "/capture") setCapture(true);
  }, [pathname]);
  useNotifications(app);
  const pending = db.habitos.filter(
    (h) =>
      scheduled(h, today()) &&
      !db.registros.some(
        (r) =>
          String(r.habito_id) === String(h.id) &&
          r.fecha === today() &&
          r.valor === 1,
      ),
  );
  const openCapture = (resource) => {
    setCapture(false);
    setModal({ type: "form", resource });
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("/")}
          aria-label="SGR, ir a Bóveda"
        >
          <span className="brand-mark">
            <Orbit size={31} />
          </span>
          <span>
            <strong>
              SGR<span>®</span>
            </strong>
            <small>ÓRBITA PERSONAL</small>
          </span>
        </button>
        <div className="workspace-label">
          <span className="workspace-dot" /> MI ESPACIO <span>01</span>
        </div>
        <nav aria-label="Navegación principal">
          {nav.map((n) => (
            <a
              href={n.path}
              key={n.path}
              className={`nav-item ${section === n.section ? "active" : ""}`}
              style={{ "--nav-color": n.color }}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  navigate(n.path);
                }
              }}
            >
              <span className="nav-icon">
                <n.icon size={21} />
              </span>
              <span>
                <strong>{n.label}</strong>
                <small>{n.sub}</small>
              </span>
              <ChevronRight className="nav-chevron" size={14} />
            </a>
          ))}
        </nav>
        <button className="capture-sidebar" onClick={() => setCapture(true)}>
          <span className="capture-icon">
            <Plus size={20} />
          </span>
          <span>Captura rápida</span>
          <kbd>N</kbd>
        </button>
        <div className="sidebar-space">
          <div className="sidebar-orbit">
            <i />
            <i />
            <i />
            <span>✦</span>
          </div>
          <p>
            Tu vida tiene muchas partes.
            <br />
            <strong>Acá, todas se conectan.</strong>
          </p>
          <div className="spectrum-line" />
        </div>
        <div className="sidebar-bottom">
          <a
            href="/settings"
            className={`settings-nav ${section === "settings" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              navigate("/settings");
            }}
          >
            <Settings size={18} />
            Ajustes
            <ArrowUpRight size={14} />
          </a>
          <button className="profile" onClick={() => navigate("/settings")}>
            <span className="avatar">
              {(db.settings.nombre_mostrar || preferences.name || "T")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <span>
              <strong>
                {db.settings.nombre_mostrar ||
                  db.settings.display_name ||
                  preferences.name ||
                  "Tu espacio personal"}
              </strong>
              <small>
                {mode === "local"
                  ? "Guardado en este navegador"
                  : "Conectado con SGR"}
              </small>
            </span>
            <span
              className={`connection-dot ${status === "offline" ? "offline" : ""}`}
            />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="inline">
            <IconButton
              icon={Menu}
              label="Abrir navegación"
              onClick={() => setMobile((v) => !v)}
              className="icon-button mobile-menu"
            />
            <div className="breadcrumb">
              <span>Mi espacio</span>
              <ChevronRight size={13} />
              <strong>{current?.label || "Ajustes"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setCommand(true)}>
              <Search size={16} />
              <span>Encontrá lo que tenés en mente</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="today-label">
              <Sun size={15} />
              {labelDate(today(), { day: "numeric", month: "short" })}
            </span>
            <div className="notifications-wrap">
              <button
                className="icon-button notification-button"
                aria-label={`Notificaciones, ${pending.length} hábitos pendientes`}
                onClick={() => setNotices((v) => !v)}
              >
                <Bell size={18} />
                {pending.length > 0 && <i />}
              </button>
              {notices && (
                <div className="notifications-popover">
                  <div className="inline spread">
                    <strong>Tu día sigue en marcha</strong>
                    <IconButton
                      icon={X}
                      label="Cerrar notificaciones"
                      onClick={() => setNotices(false)}
                    />
                  </div>
                  {pending.slice(0, 5).map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setNotices(false);
                        navigate("/habitos");
                      }}
                    >
                      <span
                        className="color-dot"
                        style={{ background: h.color }}
                      />
                      {h.nombre}
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {!pending.length && <p>Sin hábitos pendientes para hoy.</p>}
                  <button
                    className="text-button"
                    onClick={() => {
                      navigate("/agenda");
                      setNotices(false);
                    }}
                  >
                    Ver mi agenda <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <button
              className={`connection-badge ${status}`}
              onClick={() => navigate("/settings")}
            >
              <span />
              {status === "connecting"
                ? "Conectando"
                : mode === "local"
                  ? "Espacio local"
                  : status === "online"
                    ? "SGR conectado"
                    : "Sin conexión"}
            </button>
          </div>
        </header>
        {status === "offline" && (
          <div className="connection-banner" role="alert">
            <AlertCircle size={17} />
            <span>
              No pudimos conectar con SGR. Tus datos no se modificaron.
            </span>
            <Button icon={RefreshCw} onClick={app.connect}>
              Reintentar
            </Button>
            <Button onClick={() => app.setMode("local")}>
              Abrir espacio local
            </Button>
          </div>
        )}
        {status === "connecting" && <div className="loading-line" />}
        <main id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page-loading">
                <LoaderCircle size={28} />
                <p>Conectando las partes de tu universo…</p>
              </div>
            }
          >
            {section === "boveda" && (
              <Boveda
                noteId={
                  pathname.startsWith("/hoja/")
                    ? decodeURIComponent(pathname.split("/")[2])
                    : null
                }
                navigate={navigate}
              />
            )}
            {section === "finanzas" && (
              <Finanzas
                tab={
                  ["dashboard", "anual", "fire", "ahorro", "datos"].includes(
                    tab,
                  )
                    ? tab
                    : "dashboard"
                }
                setTab={setTab}
              />
            )}
            {section === "agenda" && (
              <Agenda
                tab={
                  ["hoy", "mes", "tareas", "revision"].includes(tab)
                    ? tab
                    : "hoy"
                }
                setTab={setTab}
              />
            )}
            {section === "habitos" && (
              <Habitos
                tab={
                  ["hoy", "progreso", "historial"].includes(tab) ? tab : "hoy"
                }
                setTab={setTab}
              />
            )}
            {section === "settings" && <SettingsPage />}
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>
            <span className="live-dot" /> UN POCO MÁS DE CLARIDAD, CADA DÍA.
          </span>
          <button onClick={() => setShortcuts(true)}>
            <Keyboard size={14} />
            Atajos de teclado
          </button>
          <span>
            HECHO PARA TU ÓRBITA <span className="footer-star">✳</span>
          </span>
        </footer>
      </div>
      <GlobalModals />
      {command && (
        <CommandPalette onClose={() => setCommand(false)} navigate={navigate} />
      )}
      {capture && (
        <Modal
          title="Una idea. Un primer paso."
          onClose={() => {
            setCapture(false);
            if (pathname === "/capture") navigate("/");
          }}
        >
          <div className="modal-body">
            <p className="muted">Sacalo de tu cabeza. Dale un lugar.</p>
            <div className="capture-options">
              {[
                [
                  "hojas",
                  "Guardar una idea",
                  "Una nota, un enlace o una imagen.",
                  FileText,
                  "#9f96ff",
                ],
                [
                  "movimientos",
                  "Registrar dinero",
                  "Un ingreso o un gasto.",
                  Wallet,
                  "#ffad79",
                ],
                [
                  "eventos",
                  "Reservar tiempo",
                  "Un momento para lo importante.",
                  CalendarDays,
                  "#65d9ee",
                ],
                [
                  "tareas",
                  "Anotar una tarea",
                  "El próximo paso, por pequeño que sea.",
                  CheckSquare,
                  "#f5dc78",
                ],
                [
                  "habitos",
                  "Crear un hábito",
                  "Un compromiso con tu futuro.",
                  Leaf,
                  "#b4f580",
                ],
              ].map(([resource, label, desc, Icon, color]) => (
                <button
                  key={resource}
                  onClick={() => openCapture(resource)}
                  style={{ "--capture-color": color }}
                >
                  <Icon size={24} />
                  <span>
                    <strong>{label}</strong>
                    <small>{desc}</small>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {shortcuts && (
        <Modal
          title="Menos clics. Más fluidez."
          onClose={() => setShortcuts(false)}
        >
          <div className="modal-body shortcuts-list">
            {[
              ["Ctrl + K", "Buscar en todo tu universo"],
              ["N", "Abrir captura rápida"],
              ["Ctrl + Enter", "Guardar el formulario actual"],
              ["Esc", "Cerrar una ventana"],
              ["Ctrl + M", "Ver los atajos"],
              ["↑ ↓ ← →", "Moverte entre los días de hábitos"],
            ].map(([key, text]) => (
              <div key={key}>
                <span>{text}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
        >
          {toast.type === "error" ? (
            <AlertCircle size={19} />
          ) : (
            <Check size={19} />
          )}
          <span>{toast.message}</span>
          <IconButton
            icon={X}
            label="Cerrar aviso"
            onClick={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
}
function CommandPalette({ onClose, navigate }) {
  const { db, setModal } = useApp();
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();
  const entries = [
    ...db.hojas.map((x) => ({
      item: x,
      resource: "hojas",
      label: "Bóveda",
      icon: FileText,
      path: `/hoja/${encodeURIComponent(x.id)}`,
    })),
    ...db.tareas.map((x) => ({
      item: x,
      resource: "tareas",
      label: "Tarea",
      icon: CheckSquare,
    })),
    ...db.eventos.map((x) => ({
      item: x,
      resource: "eventos",
      label: "Evento",
      icon: CalendarDays,
    })),
    ...db.movimientos.map((x) => ({
      item: x,
      resource: "movimientos",
      label: "Movimiento",
      icon: Wallet,
    })),
    ...db.habitos.map((x) => ({
      item: x,
      resource: "habitos",
      label: "Hábito",
      icon: Leaf,
    })),
  ]
    .filter(
      (e) =>
        q &&
        `${title(e.item)} ${e.item.contenido || ""} ${e.item.descripcion || ""}`
          .toLowerCase()
          .includes(q),
    )
    .slice(0, 30);
  return (
    <Modal title="Todo está conectado." onClose={onClose}>
      <div className="modal-body command-body">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscá una idea, una tarea, un movimiento…"
          autoFocus
        />
        {!q ? (
          <div className="command-links">
            {nav.map((n) => (
              <button
                key={n.path}
                onClick={() => {
                  navigate(n.path);
                  onClose();
                }}
              >
                <n.icon size={20} color={n.color} />
                <span>Ir a {n.label}</span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <div className="command-results">
            {entries.map((e) => (
              <button
                key={`${e.resource}-${e.item.id}`}
                onClick={() => {
                  onClose();
                  if (e.path) navigate(e.path);
                  else
                    setModal({
                      type: "form",
                      resource: e.resource,
                      item: e.item,
                    });
                }}
              >
                <e.icon size={18} />
                <span>
                  <strong>{title(e.item)}</strong>
                  <small>{e.label}</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            {!entries.length && (
              <p className="muted">
                No hay coincidencias en los datos cargados. Probá con otra
                palabra.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
function useNotifications({ db, preferences, notify }) {
  const sent = useRef(new Set());
  useEffect(() => {
    if (
      !preferences.notifications ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const check = () => {
      const now = Date.now(),
        lead = (preferences.lead || 0) * 60000;
      const items = [
        ...db.eventos
          .filter((e) => !e.todo_el_dia)
          .map((e) => ({
            id: "e" + e.id,
            title: e.titulo,
            start: e.fecha_inicio,
          })),
        ...db.habitos
          .filter((h) => h.hora && h.notificar && scheduled(h, today()))
          .map((h) => ({
            id: "h" + h.id + today(),
            title: h.nombre,
            start: today() + "T" + h.hora,
          })),
      ];
      items.forEach((i) => {
        const diff = new Date(i.start).getTime() - now;
        if (
          diff >= 0 &&
          diff <= Math.max(lead, 60000) &&
          !sent.current.has(i.id)
        ) {
          sent.current.add(i.id);
          try {
            new Notification(i.title, {
              body: `Empieza a las ${i.start.slice(11, 16)}`,
              icon: "/favicon.svg",
            });
          } catch {
            notify(i.title);
          }
        }
      });
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [db.eventos, db.habitos, preferences.notifications, preferences.lead]);
}
