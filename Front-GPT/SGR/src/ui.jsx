import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  X,
  Plus,
  ArrowUpRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  LoaderCircle,
  AlertCircle,
  Inbox,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "./store";
import { resources, labels } from "./resources";
import { resolveSchema } from "./api";
import { PALETTE, title, today, parseArray } from "./domain";
const RichEditor = lazy(() => import("./RichEditor"));
export function Button({
  children,
  icon: Icon,
  variant = "",
  className = "",
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={17} />
    </button>
  );
}
export function Pill({ children, color }) {
  return (
    <span className="pill" style={color ? { "--pill": color } : {}}>
      {children}
    </span>
  );
}
export function SectionTitle({ eyebrow, title: heading, children }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{heading}</h2>
      </div>
      <div className="inline">{children}</div>
    </div>
  );
}
export function Empty({
  icon: Icon = Inbox,
  title: heading = "Todo empieza con una idea.",
  text = "Creá tu primer elemento y hacé lugar para lo que viene.",
  action,
  onAction,
}) {
  return (
    <div className="empty">
      <div className="empty-orbit">
        <Icon size={27} />
        <i />
        <i />
      </div>
      <h3>{heading}</h3>
      <p>{text}</p>
      {action && (
        <Button icon={Plus} onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([key, label, Icon]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={value === key ? "active" : ""}
          onClick={() => onChange(key)}
        >
          {Icon && <Icon size={15} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
export function Progress({ value, color }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progreso"
      aria-valuenow={Math.round(value) || 0}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        style={{
          width: `${Math.max(0, Math.min(100, value || 0))}%`,
          background: color,
        }}
      />
    </div>
  );
}
export function Stat({ label, value, foot, icon: Icon, color }) {
  return (
    <div className="stat" style={{ "--stat-color": color || "var(--lime)" }}>
      <div className="stat-label">
        {label}
        {Icon && <Icon size={17} />}
      </div>
      <strong>{value}</strong>
      {foot && <span className="stat-foot">{foot}</span>}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar...",
  ...rest
}) {
  return (
    <div className="search-box">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
      {value && (
        <button aria-label="Limpiar búsqueda" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function MonthPicker({ value, onChange }) {
  const move = (n) => {
    const d = new Date(value + "-01T12:00:00");
    d.setMonth(d.getMonth() + n);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="date-picker">
      <IconButton
        icon={ChevronLeft}
        label="Mes anterior"
        onClick={() => move(-1)}
      />
      <input
        type="month"
        value={value}
        aria-label="Mes seleccionado"
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      <IconButton
        icon={ChevronRight}
        label="Mes siguiente"
        onClick={() => move(1)}
      />
    </div>
  );
}
export function Modal({ title: heading, children, onClose, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const savedFocus = useRef(document.activeElement);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = () =>
      (
        ref.current?.querySelector(
          'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
        ) || ref.current?.querySelector("button")
      )?.focus();
    focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = [
          ...ref.current.querySelectorAll(
            'button,input,textarea,select,a[href],[tabindex="0"],[contenteditable="true"]',
          ),
        ].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler);
      savedFocus.current?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <div>
            <span className="eyebrow">SGR / TU ESPACIO</span>
            <h2 id="modal-title">{heading}</h2>
          </div>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}
export function ErrorNotice({ keys }) {
  const { errors, refresh } = useApp();
  const active = keys.filter((k) => errors[k]);
  if (!active.length) return null;
  return (
    <div className="error-notice">
      <AlertCircle size={18} />
      <div>
        {active.map((k) => (
          <p key={k}>
            <strong>{resources[k]?.plural || k}:</strong> {errors[k]}
          </p>
        ))}
      </div>
      <Button onClick={() => active.forEach((k) => refresh(k))}>
        Reintentar
      </Button>
    </div>
  );
}
export function EditActions({ resource, item }) {
  const { setModal } = useApp();
  return (
    <div className="row-actions">
      <IconButton
        icon={Pencil}
        label={`Editar ${title(item)}`}
        onClick={() => setModal({ type: "form", resource, item })}
      />
      <IconButton
        icon={Trash2}
        label={`Eliminar ${title(item)}`}
        onClick={() => setModal({ type: "delete", resource, item })}
      />
    </div>
  );
}
export function Manager({ resource }) {
  const { db, setModal } = useApp();
  const def = resources[resource];
  return (
    <Modal title={def.plural} onClose={() => setModal(null)}>
      <div className="modal-body">
        <ErrorNotice keys={[resource]} />
        <div className="manager-list">
          {db[resource].map((item, i) => (
            <div className="manager-row" key={item.id}>
              <span
                className="color-dot"
                style={{ background: item.color || PALETTE[i % 6] }}
              />
              <div>
                <strong>{title(item)}</strong>
                <small>{item.tipo || item.fecha || item.mes || ""}</small>
              </div>
              <EditActions resource={resource} item={item} />
            </div>
          ))}
          {!db[resource].length && (
            <p className="muted">Todavía no hay elementos.</p>
          )}
        </div>
      </div>
      <footer>
        <Button
          icon={Plus}
          variant="primary"
          onClick={() => setModal({ type: "form", resource })}
        >
          Agregar {def.label}
        </Button>
      </footer>
    </Modal>
  );
}
function schemaFields(resource, item, app) {
  const def = resources[resource];
  if (app.mode !== "api" || !app.client.doc) return def.fields;
  const { path, method } = app.saveRoute(resource, item);
  const schema = app.client.bodySchema(path, method);
  if (!schema.properties) return def.fields;
  const fields = Object.entries(schema.properties)
    .filter(
      ([k, p]) =>
        !p.readOnly &&
        ![
          "id",
          "creado_en",
          "actualizado_en",
          "vault_id",
          "mtime",
          "has_transactions",
        ].includes(k),
    )
    .map(([key, value]) => {
      const p = resolveSchema(value, app.client.doc);
      const known = def.fields.find((f) => f.key === key);
      let type = p.enum
        ? "select"
        : p.type === "boolean"
          ? "checkbox"
          : ["number", "integer"].includes(p.type)
            ? "number"
            : p.format === "date"
              ? "date"
              : p.format === "date-time"
                ? "datetime-local"
                : p.type === "object" || p.type === "array"
                  ? "json"
                  : "text";
      if (known) type = known.type;
      if (p.enum) type = "select";
      const source =
        key === "cuenta_nombre"
          ? "cuentas"
          : key === "categoria_nombre"
            ? "finCategorias"
            : null;
      return {
        ...known,
        key,
        label: known?.label || labels[key] || key.replaceAll("_", " "),
        type: source ? "relation" : type,
        source: source || known?.source,
        nameValue: !!source,
        required: (schema.required || []).includes(key),
        options: p.enum || known?.options,
        default:
          p.enum && !p.enum.includes(p.default ?? known?.default)
            ? p.enum.includes(
                { gasto: "expense", ingreso: "income" }[known?.default],
              )
              ? { gasto: "expense", ingreso: "income" }[known?.default]
              : p.enum[0]
            : (p.default ?? known?.default),
        min: p.minimum ?? known?.min,
        max: p.maximum ?? known?.max,
        schema: p,
      };
    });
  for (const param of app.client.operation(path, method)?.parameters || []) {
    if (
      param.in === "path" &&
      param.name !== "id" &&
      !param.name.endsWith("_id") &&
      !fields.some((f) => f.key === param.name)
    ) {
      fields.unshift({
        ...def.fields.find((f) => f.key === param.name),
        key: param.name,
        label:
          def.fields.find((f) => f.key === param.name)?.label || param.name,
        type: param.name === "mes" ? "month" : "text",
        required: true,
      });
    }
  }
  return fields;
}
export function ResourceForm({ resource, item = {}, defaults = {} }) {
  const app = useApp();
  const { db, setModal, mutate } = app;
  const def = resources[resource];
  const fields = schemaFields(resource, item, app);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        item[f.key] ??
          defaults[f.key] ??
          (typeof f.default === "function" ? f.default() : f.default) ??
          (f.type === "color"
            ? PALETTE[0]
            : f.type === "checkbox"
              ? false
              : f.type === "weekdays"
                ? []
                : ""),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const formRef = useRef();
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      const data = {};
      for (const f of fields) {
        let v = values[f.key];
        if (v === "" || v == null) {
          if (f.required) throw Error(`Completá ${f.label.toLowerCase()}.`);
          if (item.id && item[f.key] != null) data[f.key] = null;
          continue;
        }
        if (f.type === "number") v = Number(v);
        if (f.type === "relation" && !f.nameValue) {
          const row = db[f.source]?.find((r) => String(r.id) === String(v));
          v = row?.id ?? v;
        }
        if (f.type === "json") {
          v = typeof v === "string" ? JSON.parse(v) : v;
          if (f.schema?.type === "string") v = JSON.stringify(v);
        }
        if (f.type === "weekdays" && f.schema?.type === "string")
          v = JSON.stringify(parseArray(v));
        data[f.key] = v;
      }
      if (
        data.fecha_inicio &&
        data.fecha_fin &&
        new Date(data.fecha_fin) <= new Date(data.fecha_inicio)
      )
        throw Error("El fin debe ser posterior al inicio.");
      if (
        data.frecuencia_tipo === "semanal" &&
        !parseArray(data.dias_semana).length
      )
        throw Error("Elegí al menos un día para el hábito.");
      if (data.frecuencia_tipo === "diario") data.dias_semana = null;
      if (data.se_repite && !data.regla_repeticion)
        throw Error("Configurá la regla de repetición.");
      if (resource === "objetivos" && item.id) delete data.nombre;
      setBusy(true);
      await mutate(resource, "save", {
        ...data,
        ...(item.id ? { id: item.id } : {}),
        ...(item.mes ? { mes: item.mes } : {}),
      });
      setModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${item.id ? "Editar" : "Crear"} ${def.label}`}
      onClose={() => !busy && setModal(null)}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            formRef.current.requestSubmit();
          }
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            {fields.map((f) => {
              if (
                f.key === "dias_semana" &&
                values.frecuencia_tipo !== "semanal"
              )
                return null;
              if (f.key === "regla_repeticion" && !values.se_repite)
                return null;
              let v = values[f.key];
              return (
                <label
                  key={f.key}
                  className={`field ${["textarea", "weekdays", "json"].includes(f.type) ? "full" : ""} ${f.type === "checkbox" ? "check-field" : ""}`}
                >
                  <span>
                    {f.label}
                    {f.required && <b> *</b>}
                  </span>
                  {f.type === "select" || f.type === "relation" ? (
                    <select
                      value={v ?? ""}
                      required={f.required}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {f.type === "select"
                        ? f.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))
                        : db[f.source]
                            ?.filter(
                              (r) =>
                                String(r.id) !==
                                  String(
                                    resource === f.source ? item.id : "",
                                  ) && !r.oculta,
                            )
                            .map((r) => (
                              <option
                                key={r.id}
                                value={f.nameValue ? r.nombre : r.id}
                              >
                                {title(r)}
                              </option>
                            ))}
                    </select>
                  ) : f.key === "apuntes" ? (
                    <Suspense
                      fallback={
                        <textarea
                          rows={5}
                          aria-label="Apuntes"
                          value={v}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      }
                    >
                      <RichEditor
                        label="Apuntes"
                        value={v}
                        onChange={(value) => set(f.key, value)}
                      />
                    </Suspense>
                  ) : f.type === "textarea" ? (
                    <textarea
                      rows={5}
                      value={v}
                      required={f.required}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : f.type === "json" && f.key === "regla_repeticion" ? (
                    <Recurrence value={v} onChange={(v) => set(f.key, v)} />
                  ) : f.type === "json" ? (
                    <textarea
                      rows={3}
                      value={
                        typeof v === "object" ? JSON.stringify(v, null, 2) : v
                      }
                      placeholder="JSON"
                      required={f.required}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : f.type === "weekdays" ? (
                    <span className="weekday-picker">
                      {["D", "L", "M", "X", "J", "V", "S"].map((day, i) => (
                        <button
                          type="button"
                          aria-label={
                            [
                              "Domingo",
                              "Lunes",
                              "Martes",
                              "Miércoles",
                              "Jueves",
                              "Viernes",
                              "Sábado",
                            ][i]
                          }
                          aria-pressed={parseArray(v).includes(i)}
                          className={parseArray(v).includes(i) ? "active" : ""}
                          key={i}
                          onClick={() =>
                            set(
                              f.key,
                              parseArray(v).includes(i)
                                ? parseArray(v).filter((d) => d !== i)
                                : [...parseArray(v), i],
                            )
                          }
                        >
                          {day}
                        </button>
                      ))}
                    </span>
                  ) : f.type === "color" ? (
                    <span className="color-picker">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          aria-label={`Color ${c}`}
                          aria-pressed={v === c}
                          type="button"
                          style={{ background: c }}
                          onClick={() => set(f.key, c)}
                        >
                          {v === c && <Check size={16} />}
                        </button>
                      ))}
                      <input
                        aria-label="Color personalizado"
                        type="color"
                        value={v || PALETTE[0]}
                        onChange={(e) => set(f.key, e.target.value)}
                      />
                    </span>
                  ) : f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!v}
                      onChange={(e) => set(f.key, e.target.checked)}
                    />
                  ) : (
                    <input
                      type={f.type}
                      value={
                        f.type === "datetime-local"
                          ? String(v).slice(0, 16)
                          : (v ?? "")
                      }
                      disabled={
                        resource === "objetivos" &&
                        !!item.id &&
                        f.key === "nombre"
                      }
                      min={f.min}
                      max={f.max}
                      step={f.type === "number" ? "any" : undefined}
                      required={f.required}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                  {f.type === "relation" && !db[f.source]?.length && (
                    <small>
                      Primero creá un elemento en{" "}
                      {resources[f.source]?.plural.toLowerCase()}.
                    </small>
                  )}
                </label>
              );
            })}
          </div>
          {resource === "hojas" && (
            <Upload
              onURL={(url) => {
                set("contenido", url);
                set("tipo", "foto");
              }}
            />
          )}
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
        </div>
        <footer>
          <span className="shortcut-hint">Ctrl + Enter para guardar</span>
          <Button type="button" onClick={() => setModal(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={busy ? LoaderCircle : Check}
            disabled={busy}
          >
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
function Recurrence({ value, onChange }) {
  let v = { tipo: "semanal", hasta: today() };
  try {
    v = {
      ...v,
      ...(typeof value === "string" ? JSON.parse(value || "{}") : value),
    };
  } catch {}
  return (
    <span className="recurrence">
      <select
        aria-label="Frecuencia de repetición"
        value={v.tipo}
        onChange={(e) =>
          onChange(JSON.stringify({ ...v, tipo: e.target.value }))
        }
      >
        {["diario", "semanal", "mensual"].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <input
        aria-label="Repetir hasta"
        type="date"
        min={today()}
        value={v.hasta}
        onChange={(e) =>
          onChange(JSON.stringify({ ...v, hasta: e.target.value }))
        }
      />
    </span>
  );
}
function Upload({ onURL }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <label className="upload-control">
      <span>{busy ? "Subiendo…" : "Adjuntar imagen"}</span>
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            app.notify("Usá una imagen de menos de 5 MB.", "error");
            return;
          }
          setBusy(true);
          try {
            if (app.mode === "local") {
              const reader = new FileReader();
              reader.onload = () => {
                onURL(reader.result);
                setBusy(false);
              };
              reader.onerror = () => {
                app.notify("No se pudo leer la imagen.", "error");
                setBusy(false);
              };
              reader.readAsDataURL(file);
            } else {
              const form = new FormData();
              form.append("file", file);
              const r = await app.action("/upload", "POST", form);
              const url = r.url || r.path || r.ruta;
              if (!url) throw Error("La API no devolvió la URL del archivo.");
              onURL(url);
              setBusy(false);
            }
          } catch (e) {
            app.notify(e.message, "error");
            setBusy(false);
          }
        }}
      />
    </label>
  );
}
export function DeleteModal({ resource, item }) {
  const { setModal, mutate } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={`Eliminar ${resources[resource].label}`}
      onClose={() => !busy && setModal(null)}
    >
      <div className="modal-body">
        <div className="delete-icon">
          <Trash2 size={28} />
        </div>
        <h3>¿Eliminar «{title(item)}»?</h3>
        <p className="muted">
          {resource === "hojas"
            ? "En el sistema conectado, la nota se mueve a la papelera de la Bóveda."
            : "Esta acción elimina el elemento y no se puede deshacer desde esta pantalla."}
        </p>
        {["calendarios", "habitos", "instrumentos"].includes(resource) && (
          <p className="form-error">
            También se eliminarán sus{" "}
            {resource === "calendarios"
              ? "eventos"
              : resource === "habitos"
                ? "registros"
                : "transacciones"}{" "}
            asociados.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <Button onClick={() => setModal(null)} disabled={busy}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await mutate(resource, "delete", item);
              setModal(null);
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Eliminando…" : "Sí, eliminar"}
        </Button>
      </footer>
    </Modal>
  );
}
export function GlobalModals() {
  const { modal } = useApp();
  if (!modal) return null;
  if (modal.type === "form")
    return (
      <ResourceForm
        key={`${modal.resource}-${modal.item?.id || "new"}`}
        {...modal}
      />
    );
  if (modal.type === "delete") return <DeleteModal {...modal} />;
  if (modal.type === "manager") return <Manager {...modal} />;
  return null;
}
