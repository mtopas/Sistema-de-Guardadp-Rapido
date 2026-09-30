import React, { useEffect, useState } from "react";
import {
  Check,
  User,
  Palette,
  Database,
  Plug,
  Download,
  Upload,
  Bell,
  Moon,
  Sun,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  MessageSquare,
  Plus,
  ExternalLink,
} from "lucide-react";
import { useApp } from "./store";
import {
  Button,
  SectionTitle,
  Pill,
  EditActions,
  ErrorNotice,
  Modal,
} from "./ui";
import { download, today } from "./domain";
export default function Settings() {
  const app = useApp();
  const {
    db,
    mode,
    setMode,
    base,
    setBase,
    status,
    preferences,
    setPrefs,
    notify,
    setModal,
  } = app;
  const [apiURL, setApiURL] = useState(base),
    [name, setName] = useState(
      db.settings.nombre_mostrar ||
        db.settings.display_name ||
        preferences.name ||
        "",
    ),
    [system, setSystem] = useState(null),
    [imported, setImported] = useState(null),
    [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (mode === "api" && status === "online")
      app
        .action("/settings/status")
        .then(setSystem)
        .catch(() => {});
  }, [mode, status]);
  const saveName = async (e) => {
    e.preventDefault();
    setPending(true);
    try {
      if (mode === "api") {
        const method = app.client.method("/settings", ["PATCH", "PUT"]);
        const fields =
          app.client.bodySchema("/settings", method).properties || {};
        const key =
          ["nombre_mostrar", "display_name", "nombre", "name"].find((k) =>
            Object.hasOwn(fields, k),
          ) || "nombre_mostrar";
        await app.configSave("settings", { ...db.settings, [key]: name });
      } else
        await app.configSave("settings", {
          ...db.settings,
          nombre_mostrar: name,
        });
      setPrefs((p) => ({ ...p, name }));
    } catch {
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="page settings-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">TU ESPACIO, TUS REGLAS</div>
          <h1>
            Hacelo <em>tuyo.</em>
          </h1>
          <p>Una órbita personal merece sentirse como casa.</p>
        </div>
        <Pill color={mode === "local" ? "var(--peach)" : "var(--lime)"}>
          {mode === "local" ? "Espacio local" : "Conectado al sistema"}
        </Pill>
      </div>
      <div className="settings-grid">
        <div className="panel">
          <SectionTitle title="Cómo te llamamos" eyebrow="PERFIL">
            <User size={20} />
          </SectionTitle>
          <form onSubmit={saveName}>
            <label className="field">
              <span>Nombre para mostrar</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                maxLength={80}
              />
            </label>
            <Button variant="primary" icon={Check} disabled={pending}>
              {pending ? "Guardando…" : "Guardar nombre"}
            </Button>
          </form>
        </div>
        <div className="panel">
          <SectionTitle title="Tu ambiente" eyebrow="APARIENCIA">
            <Palette size={20} />
          </SectionTitle>
          <div className="theme-options">
            <button
              className={`theme-option night ${preferences.theme === "dark" ? "selected" : ""}`}
              aria-pressed={preferences.theme === "dark"}
              onClick={() => setPrefs((p) => ({ ...p, theme: "dark" }))}
            >
              <Moon size={24} />
              <span>Órbita nocturna</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </button>
            <button
              className={`theme-option day ${preferences.theme === "light" ? "selected" : ""}`}
              aria-pressed={preferences.theme === "light"}
              onClick={() => setPrefs((p) => ({ ...p, theme: "light" }))}
            >
              <Sun size={24} />
              <span>Luz de mañana</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </button>
          </div>
          <label className="settings-toggle">
            <div>
              <strong>Un espacio en movimiento</strong>
              <small>Animaciones y transiciones suaves.</small>
            </div>
            <input
              type="checkbox"
              checked={preferences.motion}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, motion: e.target.checked }))
              }
            />
          </label>
          <p className="muted small">
            También respetamos la preferencia de movimiento reducido de tu
            sistema.
          </p>
        </div>
        <div className="panel settings-connection">
          <SectionTitle
            title="Conectá tu universo"
            eyebrow="ORIGEN DE LOS DATOS"
          >
            <Plug size={20} />
          </SectionTitle>
          <div className="connection-choices">
            <button
              className={mode === "local" ? "selected" : ""}
              onClick={() => setMode("local")}
            >
              <Database size={22} />
              <strong>Espacio local</strong>
              <span>
                Guardado en este navegador. Independiente de la base de SGR.
              </span>
            </button>
            <button
              className={mode === "api" ? "selected" : ""}
              onClick={() => setMode("api")}
            >
              <Plug size={22} />
              <strong>Sistema SGR</strong>
              <span>
                Tus notas, cuentas, eventos y hábitos del backend existente.
              </span>
            </button>
          </div>
          <form
            className="connection-form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = apiURL.trim().replace(/\/$/, "");
              if (
                value !== "" &&
                !value.startsWith("/") &&
                !/^https?:\/\//.test(value)
              ) {
                notify("Usá una URL HTTP/HTTPS o una ruta como /api.", "error");
                return;
              }
              setBase(value);
              setMode("api");
              if (value === base && mode === "api") app.connect();
            }}
          >
            <label className="field">
              <span>Dirección de la API</span>
              <input
                value={apiURL}
                onChange={(e) => setApiURL(e.target.value)}
                placeholder="/api"
                spellCheck="false"
              />
            </label>
            <Button icon={RefreshCw} disabled={status === "connecting"}>
              {status === "connecting" ? "Conectando…" : "Conectar"}
            </Button>
          </form>
          <p className="muted small">
            En desarrollo, <code>/api</code> conecta con{" "}
            <code>127.0.0.1:8765</code>. Al cambiar de espacio se conservan tus
            datos locales; no se copian a la API.
          </p>
          {app.errors.connection && (
            <p className="form-error" role="alert">
              {app.errors.connection}
            </p>
          )}
        </div>
        <div className="panel">
          <SectionTitle title="Un recordatorio amable" eyebrow="NOTIFICACIONES">
            <Bell size={20} />
          </SectionTitle>
          <p className="muted">
            Recibí avisos antes de los eventos y hábitos con hora mientras este
            espacio esté abierto.
          </p>
          <label className="field">
            <span>Anticipación</span>
            <select
              value={preferences.lead}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, lead: Number(e.target.value) }))
              }
            >
              {[0, 5, 10, 15, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "A la hora de inicio" : `${v} minutos antes`}
                </option>
              ))}
            </select>
          </label>
          <Button
            icon={Bell}
            onClick={async () => {
              if (preferences.notifications) {
                setPrefs((p) => ({ ...p, notifications: false }));
                return;
              }
              if (!("Notification" in window)) {
                notify("Este navegador no admite notificaciones.", "error");
                return;
              }
              const permission = await Notification.requestPermission();
              if (permission === "granted") {
                setPrefs((p) => ({ ...p, notifications: true }));
                notify("Recordatorios activados");
              } else
                notify(
                  "No se habilitaron las notificaciones. Podés cambiar el permiso desde tu navegador.",
                  "error",
                );
            }}
          >
            {preferences.notifications
              ? "Desactivar recordatorios"
              : "Habilitar recordatorios"}
          </Button>
        </div>
        <div className="panel">
          <SectionTitle
            title="Tus datos, a mano"
            eyebrow="COPIAS Y PORTABILIDAD"
          >
            <ShieldCheck size={20} />
          </SectionTitle>
          {mode === "local" ? (
            <>
              <p className="muted">
                Descargá una copia de tu espacio local para conservarla o
                trasladarla a otro navegador.
              </p>
              <div className="inline wrap">
                <Button
                  icon={Download}
                  onClick={() =>
                    download(
                      JSON.stringify(db, null, 2),
                      `sgr-orbita-${today()}.json`,
                      "application/json",
                    )
                  }
                >
                  Exportar espacio
                </Button>
                <label className="button">
                  <Upload size={16} />
                  <span>Restaurar copia</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        if (f.size > 25 * 1024 * 1024)
                          throw Error("La copia supera el límite de 25 MB.");
                        setImported(JSON.parse(await f.text()));
                        setConfirm(false);
                      } catch (e) {
                        notify(e.message, "error");
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="muted small">
                El almacenamiento pertenece a este navegador y a esta dirección.
                Exportá una copia antes de borrar los datos del navegador.
              </p>
              <div className="sample-space">
                <Sparkles size={20} />
                <div>
                  <strong>Explorá las posibilidades</strong>
                  <p>Cargá ejemplos si tu espacio local está vacío.</p>
                </div>
                <Button
                  onClick={() => {
                    try {
                      app.seed();
                    } catch (e) {
                      notify(e.message, "error");
                    }
                  }}
                >
                  Cargar ejemplos
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Descargá el respaldo que ofrece el sistema SGR. La Bóveda
                externa requiere su propia copia.
              </p>
              <Button
                icon={Download}
                onClick={() =>
                  app
                    .action(
                      "/settings/backup",
                      "GET",
                      undefined,
                      `sgr-backup-${today()}.zip`,
                    )
                    .catch(() => {})
                }
              >
                Descargar respaldo
              </Button>
              {system && (
                <details className="status-details">
                  <summary>Estado de los datos y la sincronización</summary>
                  <pre>{JSON.stringify(system, null, 2)}</pre>
                </details>
              )}
            </>
          )}
        </div>
        <div className="panel">
          <SectionTitle title="Ideas para mejorar" eyebrow="FEEDBACK">
            <Button
              icon={Plus}
              onClick={() => setModal({ type: "form", resource: "feedback" })}
            >
              Comentario
            </Button>
          </SectionTitle>
          <ErrorNotice keys={["feedback"]} />
          {db.feedback.map((f) => (
            <div className="feedback-row" key={f.id}>
              <MessageSquare size={18} />
              <div>
                <strong>{f.titulo || "Comentario"}</strong>
                <p>{f.contenido || f.mensaje || f.texto}</p>
              </div>
              <EditActions resource="feedback" item={f} />
            </div>
          ))}
          {!db.feedback.length && (
            <p className="muted">
              Una idea, un detalle, algo que podría funcionar mejor. Guardalo
              acá.
            </p>
          )}
        </div>
      </div>
      <div className="settings-bottom">
        <div className="brand-inline">
          SGR <span>ÓRBITA PERSONAL</span>
        </div>
        <span>
          Creado para conectar las partes de tu vida.{" "}
          <span className="heart">✦</span>
        </span>
        <span>v1.0</span>
      </div>
      {imported && (
        <Modal
          title="Restaurar espacio local"
          onClose={() => setImported(null)}
        >
          <div className="modal-body">
            <p>
              La copia reemplazará los datos de este espacio local. Descargá una
              copia actual antes de continuar si querés conservarlos.
            </p>
            <Button
              icon={Download}
              onClick={() =>
                download(
                  JSON.stringify(db, null, 2),
                  `sgr-antes-de-restaurar-${today()}.json`,
                  "application/json",
                )
              }
            >
              Guardar copia actual
            </Button>
            <label className="settings-toggle">
              <span>Entiendo que se reemplaza mi espacio local.</span>
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
            </label>
          </div>
          <footer>
            <Button onClick={() => setImported(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={!confirm}
              onClick={() => {
                try {
                  app.importLocal(imported);
                  setImported(null);
                } catch (e) {
                  notify(e.message, "error");
                }
              }}
            >
              Restaurar
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
