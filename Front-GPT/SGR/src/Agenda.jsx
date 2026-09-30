import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  CalendarDays,
  Sun,
  CheckSquare,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock,
  ArrowUpRight,
  GraduationCap,
  Download,
  LayoutGrid,
  List,
  Pin,
  Flame,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { useApp } from "./store";
import {
  Button,
  IconButton,
  Tabs,
  SectionTitle,
  Empty,
  EditActions,
  Pill,
  Progress,
  Stat,
  SearchBox,
  MonthPicker,
  ErrorNotice,
} from "./ui";
import {
  today,
  addDays,
  labelDate,
  calendarDays,
  dateOf,
  title,
  PALETTE,
  scheduled,
  recordFor,
  num,
  download,
  totals,
  money,
} from "./domain";
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export default function Agenda({ tab = "hoy", setTab }) {
  const app = useApp();
  const { db, setModal, mode, refresh } = app;
  const [date, setDate] = useState(today()),
    [hidden, setHidden] = useState([]),
    [week, setWeek] = useState(false);
  const month = date.slice(0, 7);
  const events = db.eventos.filter(
    (e) => !hidden.includes(String(e.calendario_id)),
  );
  useEffect(() => {
    if (mode === "api")
      refresh("eventos", {
        fecha_desde: month + "-01",
        fecha_hasta: addDays(month + "-01", 42),
        desde: month + "-01",
        hasta: addDays(month + "-01", 42),
      });
  }, [month, mode]);
  return (
    <div className="page agenda-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> HACÉ LUGAR A LO IMPORTANTE
          </div>
          <h1>
            Tu tiempo, <em>con intención.</em>
          </h1>
          <p>Menos pendientes en la cabeza. Más espacio en tu día.</p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() =>
            setModal({
              type: "form",
              resource: tab === "tareas" ? "tareas" : "eventos",
              defaults:
                tab === "tareas"
                  ? { fecha_opcional: date }
                  : {
                      fecha_inicio: date + "T09:00",
                      fecha_fin: date + "T10:00",
                    },
            })
          }
        >
          {tab === "tareas" ? "Nueva tarea" : "Nuevo evento"}
        </Button>
      </div>
      <div className="module-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ["hoy", "Mi día", Sun],
            ["mes", "Calendario", CalendarDays],
            ["tareas", "Tareas", CheckSquare],
            ["revision", "Revisión", ChartNoAxesCombined],
          ]}
        />
        <div className="inline">
          <Button
            icon={GraduationCap}
            onClick={() => setModal({ type: "manager", resource: "facultad" })}
          >
            Facultad
          </Button>
          {mode === "api" && (
            <IconButton
              icon={Download}
              label="Exportar calendario iCalendar"
              onClick={() =>
                app
                  .action(
                    "/agenda/export.ics",
                    "GET",
                    undefined,
                    "agenda-sgr.ics",
                  )
                  .catch(() => {})
              }
            />
          )}
        </div>
      </div>
      <ErrorNotice keys={["eventos", "tareas", "calendarios", "listas"]} />
      <div className="agenda-layout">
        <aside className="agenda-sidebar">
          <MiniCalendar date={date} onChange={setDate} />
          <div className="panel">
            <SectionTitle title="Mis calendarios">
              <IconButton
                icon={Plus}
                label="Agregar calendario"
                onClick={() =>
                  setModal({ type: "form", resource: "calendarios" })
                }
              />
            </SectionTitle>
            {db.calendarios.map((c, i) => (
              <label
                className="calendar-toggle"
                key={c.id}
                style={{ "--check-color": c.color || PALETTE[i % 6] }}
              >
                <input
                  type="checkbox"
                  checked={!hidden.includes(String(c.id))}
                  onChange={() =>
                    setHidden((h) =>
                      h.includes(String(c.id))
                        ? h.filter((x) => x !== String(c.id))
                        : [...h, String(c.id)],
                    )
                  }
                />
                <span>{c.nombre}</span>
                <span
                  className="color-dot"
                  style={{ background: c.color || PALETTE[i % 6] }}
                />
              </label>
            ))}
            {!db.calendarios.length && (
              <p className="small muted">
                Creá un calendario para tus eventos.
              </p>
            )}
            <button
              className="text-button"
              onClick={() =>
                setModal({ type: "manager", resource: "calendarios" })
              }
            >
              Administrar calendarios <ArrowRight size={14} />
            </button>
          </div>
          <div className="panel">
            <SectionTitle
              title="Hábitos del día"
              eyebrow="PEQUEÑAS VICTORIAS"
            />
            {db.habitos
              .filter((h) => scheduled(h, date))
              .map((h) => {
                const record = recordFor(db.registros, h.id, date);
                return (
                  <div className="habit-quick" key={h.id}>
                    <button
                      className={`check-circle ${record ? "checked" : ""}`}
                      disabled={date > today()}
                      aria-label={`${record ? "Desmarcar" : "Completar"} ${h.nombre}`}
                      style={{ "--check-color": h.color }}
                      onClick={() => {
                        (record
                          ? app.mutate("registros", "delete", record)
                          : app.mutate("registros", "record", {
                              habito_id: h.id,
                              fecha: date,
                              valor: 1,
                              nota: "",
                            })
                        ).catch(() => {});
                      }}
                    >
                      {record && <Check size={13} />}
                    </button>
                    <span>{h.nombre}</span>
                    {h.hora && <small>{h.hora}</small>}
                  </div>
                );
              })}
            {!db.habitos.some((h) => scheduled(h, date)) && (
              <p className="muted small">
                No hay hábitos programados para este día.
              </p>
            )}
          </div>
          <div className="agenda-quote">
            <span>✳</span>
            <p>
              No se trata de hacer más.
              <br />
              <strong>Se trata de hacer espacio.</strong>
            </p>
          </div>
        </aside>
        <main className="agenda-main">
          {tab === "hoy" && (
            <>
              <div className="panel agenda-day-header">
                <div>
                  <span className="eyebrow">
                    {date === today()
                      ? "HOY ES UN BUEN DÍA"
                      : labelDate(date, { weekday: "long" })}
                  </span>
                  <h2>
                    {labelDate(date, { day: "numeric", month: "long" })}
                    <span className="muted"> / {date.slice(0, 4)}</span>
                  </h2>
                </div>
                <div className="inline">
                  <IconButton
                    icon={ChevronLeft}
                    label="Día anterior"
                    onClick={() => setDate(addDays(date, -1))}
                  />
                  <Button onClick={() => setDate(today())}>Hoy</Button>
                  <IconButton
                    icon={ChevronRight}
                    label="Día siguiente"
                    onClick={() => setDate(addDays(date, 1))}
                  />
                </div>
              </div>
              <DayTimeline date={date} events={events} />
              <div className="panel">
                <SectionTitle
                  title="Próximos pasos"
                  eyebrow="PENDIENTES · PRÓXIMOS 15 DÍAS"
                >
                  <Button
                    icon={Plus}
                    onClick={() =>
                      setModal({
                        type: "form",
                        resource: "tareas",
                        defaults: { fecha_opcional: date },
                      })
                    }
                  >
                    Tarea
                  </Button>
                </SectionTitle>
                <QuickTask date={date} />
                {db.tareas
                  .filter(
                    (t) =>
                      !t.completada &&
                      (!dateOf(t) || dateOf(t) <= addDays(date, 15)),
                  )
                  .slice(0, 15)
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
              </div>
            </>
          )}
          {tab === "mes" && (
            <div className="panel month-panel">
              <SectionTitle
                title={labelDate(date, { month: "long", year: "numeric" })}
              >
                <MonthPicker
                  value={month}
                  onChange={(m) => setDate(m + "-01")}
                />
                <Button onClick={() => setWeek((v) => !v)}>
                  {week ? "Ver mes" : "Ver semana"}
                </Button>
              </SectionTitle>
              {week ? (
                <div className="week-board">
                  {calendarDays(month)
                    .filter((d) => {
                      const start = addDays(
                        date,
                        -(new Date(date + "T12:00:00").getDay() + 6) % 7,
                      );
                      return d >= start && d <= addDays(start, 6);
                    })
                    .map((d) => (
                      <div key={d}>
                        <button
                          className={`week-day ${d === today() ? "today" : ""}`}
                          onClick={() => {
                            setDate(d);
                            setTab("hoy");
                          }}
                        >
                          {labelDate(d, { weekday: "short", day: "numeric" })}
                        </button>
                        {events
                          .filter(
                            (e) =>
                              String(e.fecha_inicio).slice(0, 10) <= d &&
                              String(e.fecha_fin).slice(0, 10) >= d,
                          )
                          .map((e) => (
                            <EventChip key={e.id} event={e} />
                          ))}
                        {db.tareas
                          .filter((t) => dateOf(t) === d)
                          .map((t) => (
                            <TaskRow key={t.id} task={t} compact />
                          ))}
                        <button
                          className="text-button"
                          onClick={() =>
                            setModal({
                              type: "form",
                              resource: "eventos",
                              defaults: {
                                fecha_inicio: d + "T09:00",
                                fecha_fin: d + "T10:00",
                              },
                            })
                          }
                        >
                          <Plus size={14} />
                          Evento
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="month-grid">
                  {weekdays.map((d) => (
                    <div className="weekday-label" key={d}>
                      {d}
                    </div>
                  ))}
                  {calendarDays(month).map((d) => (
                    <div
                      key={d}
                      className={`month-cell ${d.slice(0, 7) !== month ? "outside" : ""} ${d === today() ? "today" : ""}`}
                    >
                      <button
                        className="day-number"
                        aria-label={`Crear evento el ${labelDate(d)}`}
                        onClick={() =>
                          setModal({
                            type: "form",
                            resource: "eventos",
                            defaults: {
                              fecha_inicio: d + "T09:00",
                              fecha_fin: d + "T10:00",
                            },
                          })
                        }
                      >
                        {Number(d.slice(-2))}
                        <Plus size={12} />
                      </button>
                      {events
                        .filter(
                          (e) =>
                            String(e.fecha_inicio).slice(0, 10) <= d &&
                            String(e.fecha_fin).slice(0, 10) >= d,
                        )
                        .map((e) => (
                          <EventChip key={e.id} event={e} />
                        ))}
                      {db.tareas
                        .filter((t) => dateOf(t) === d)
                        .map((t) => (
                          <button
                            className={`task-chip ${t.completada ? "done" : ""}`}
                            key={t.id}
                            onClick={() =>
                              setModal({
                                type: "form",
                                resource: "tareas",
                                item: t,
                              })
                            }
                          >
                            <CheckSquare size={11} />
                            {t.titulo}
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "tareas" && <Tasks />}
          {tab === "revision" && <Review date={date} onDate={setDate} />}
        </main>
      </div>
    </div>
  );
}
function MiniCalendar({ date, onChange }) {
  const m = date.slice(0, 7);
  return (
    <div className="panel mini-calendar">
      <MonthPicker value={m} onChange={(month) => onChange(month + "-01")} />
      <div>
        {weekdays.map((d) => (
          <span key={d}>{d[0]}</span>
        ))}
        {calendarDays(m).map((d) => (
          <button
            key={d}
            className={`${d === date ? "selected" : ""} ${d === today() ? "today" : ""} ${d.slice(0, 7) !== m ? "outside" : ""}`}
            aria-label={labelDate(d, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            aria-pressed={d === date}
            onClick={() => onChange(d)}
          >
            {Number(d.slice(-2))}
          </button>
        ))}
      </div>
    </div>
  );
}
function EventChip({ event }) {
  const { db, setModal } = useApp();
  const c = db.calendarios.find(
    (c) => String(c.id) === String(event.calendario_id),
  );
  return (
    <button
      className="event-chip"
      style={{ "--event-color": c?.color || PALETTE[1] }}
      title={`${event.titulo} · ${event.fecha_inicio?.slice(11, 16) || ""}`}
      onClick={() =>
        setModal({ type: "form", resource: "eventos", item: event })
      }
    >
      {!event.todo_el_dia && <span>{event.fecha_inicio?.slice(11, 16)}</span>}
      {event.titulo}
    </button>
  );
}
function DayTimeline({ date, events }) {
  const { db, setModal } = useApp();
  const scroller = useRef();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (scroller.current)
      scroller.current.scrollTop = Math.max(
        0,
        ((date === today() ? new Date().getHours() : 9) - 7) * 64,
      );
  }, [date]);
  const dayEvents = events.filter(
    (e) =>
      String(e.fecha_inicio).slice(0, 10) <= date &&
      String(e.fecha_fin).slice(0, 10) >= date,
  );
  const items = [
    ...dayEvents
      .filter((e) => !e.todo_el_dia)
      .map((e) => ({
        item: e,
        resource: "eventos",
        label: e.titulo,
        start:
          e.fecha_inicio?.slice(0, 10) < date
            ? "06:00"
            : e.fecha_inicio?.slice(11, 16),
        end:
          e.fecha_fin?.slice(0, 10) > date
            ? "24:00"
            : e.fecha_fin?.slice(11, 16),
        color:
          db.calendarios.find((c) => String(c.id) === String(e.calendario_id))
            ?.color || PALETTE[1],
      })),
    ...db.tareas
      .filter((t) => dateOf(t) === date && t.hora_bloque)
      .map((t) => ({
        item: t,
        resource: "tareas",
        label: t.titulo,
        start: t.hora_bloque,
        duration: num(t.duracion_estimada) || 30,
        color: PALETTE[2],
      })),
    ...db.habitos
      .filter((h) => h.hora && scheduled(h, date))
      .map((h) => ({
        item: h,
        resource: "habitos",
        label: h.nombre,
        start: h.hora,
        duration: 30,
        color: h.color || PALETTE[0],
      })),
    ...db.facultad
      .filter(
        (f) => Number(f.dia_semana) === new Date(date + "T12:00:00").getDay(),
      )
      .map((f) => ({
        item: f,
        resource: "facultad",
        label: f.nombre || f.materia,
        start: f.hora_inicio,
        end: f.hora_fin,
        color: f.color || PALETTE[3],
      })),
  ]
    .map((b) => {
      const minutes = (s) => {
        const [h, m] = String(s || "09:00")
          .split(":")
          .map(Number);
        return h * 60 + m;
      };
      const start = Math.max(360, minutes(b.start)),
        end = Math.min(
          1440,
          b.end ? minutes(b.end) : minutes(b.start) + b.duration,
        );
      return { ...b, startMin: start, endMin: end };
    })
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  // Assign lanes to overlapping blocks; each cluster shares its widest lane count.
  let cluster = [],
    end = 0;
  const finish = () => {
    const width = Math.max(1, ...cluster.map((b) => b.lane + 1));
    cluster.forEach((b) => (b.lanes = width));
  };
  for (const b of items) {
    if (b.startMin >= end) {
      finish();
      cluster = [];
    }
    const active = cluster.filter((x) => x.endMin > b.startMin);
    let lane = 0;
    while (active.some((x) => x.lane === lane)) lane++;
    b.lane = lane;
    cluster.push(b);
    end = Math.max(...cluster.map((x) => x.endMin));
  }
  finish();
  return (
    <div className="panel timeline-panel">
      {!!dayEvents.filter((e) => e.todo_el_dia).length && (
        <div className="all-day">
          <span>TODO EL DÍA</span>
          {dayEvents
            .filter((e) => e.todo_el_dia)
            .map((e) => (
              <EventChip key={e.id} event={e} />
            ))}
        </div>
      )}
      <div className="timeline-scroll" ref={scroller}>
        <div className="day-timeline">
          {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
            <div className="hour-row" key={h}>
              <span>{String(h).padStart(2, "0")}:00</span>
              <button
                aria-label={`Crear evento a las ${h} horas`}
                onClick={() =>
                  setModal({
                    type: "form",
                    resource: "eventos",
                    defaults: {
                      fecha_inicio: date + `T${String(h).padStart(2, "0")}:00`,
                      fecha_fin:
                        h === 23
                          ? addDays(date, 1) + "T00:00"
                          : date + `T${String(h + 1).padStart(2, "0")}:00`,
                    },
                  })
                }
              >
                <Plus size={14} />
              </button>
            </div>
          ))}
          {items.map((b) => (
            <button
              key={`${b.resource}-${b.item.id}`}
              className={`time-block ${b.resource === "facultad" ? "faculty" : ""} ${b.item.completada ? "completed" : ""}`}
              style={{
                top: ((b.startMin - 360) / 60) * 64,
                height: Math.max(27, ((b.endMin - b.startMin) / 60) * 64 - 4),
                left: `calc(68px + (100% - 78px) * ${b.lane / b.lanes})`,
                width: `calc((100% - 78px) / ${b.lanes} - 5px)`,
                "--event-color": b.color,
              }}
              onClick={() =>
                setModal({ type: "form", resource: b.resource, item: b.item })
              }
            >
              <span>
                {b.start}
                {b.end ? " — " + b.end : ""}
              </span>
              <strong>{b.label}</strong>
              {b.resource === "facultad" && <small>Facultad</small>}
            </button>
          ))}
          {date === today() && now.getHours() >= 6 && (
            <div
              className="now-line"
              style={{
                top: (((now.getHours() - 6) * 60 + now.getMinutes()) / 60) * 64,
              }}
            >
              <span />
              <b>
                {now.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function QuickTask({ date, listId }) {
  const { mutate, notify } = useApp();
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="quick-task"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim() || busy) return;
        setBusy(true);
        try {
          await mutate("tareas", "save", {
            titulo: value.trim(),
            completada: false,
            ...(date ? { fecha_opcional: date } : {}),
            ...(listId ? { lista_id: listId } : {}),
          });
          setValue("");
        } catch {
        } finally {
          setBusy(false);
        }
      }}
    >
      <Plus size={17} />
      <input
        aria-label="Agregar tarea rápida"
        placeholder="Algo que querés hacer…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={250}
      />
      <button disabled={!value.trim() || busy} aria-label="Guardar tarea">
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
function TaskRow({ task, compact = false }) {
  const { mutate, db } = useApp();
  const [busy, setBusy] = useState(false);
  const date = dateOf(task),
    overdue = date && date < today() && !task.completada;
  return (
    <div
      className={`task-row ${task.completada ? "completed" : ""} ${compact ? "compact" : ""}`}
    >
      <button
        className={`check-circle ${task.completada ? "checked" : ""}`}
        disabled={busy}
        aria-label={`${task.completada ? "Desmarcar" : "Completar"} ${task.titulo}`}
        onClick={async () => {
          setBusy(true);
          try {
            await mutate("tareas", "save", {
              id: task.id,
              completada: !task.completada,
            });
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        {!!task.completada && <Check size={13} />}
      </button>
      <div>
        <strong>{task.titulo}</strong>
        {!compact && (
          <small className={overdue ? "negative" : "muted"}>
            {date ? (date === today() ? "Hoy" : labelDate(date)) : "Sin fecha"}
            {task.hora_bloque ? " · " + task.hora_bloque : ""}
            {overdue ? " · Vencida" : ""}
          </small>
        )}
      </div>
      {!compact && <EditActions resource="tareas" item={task} />}
    </div>
  );
}
function Tasks() {
  const { db, setModal, mutate } = useApp();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("pending"),
    [list, setList] = useState("all"),
    [canvas, setCanvas] = useState(true);
  const tasks = db.tareas.filter(
    (t) =>
      (filter === "all" ||
        (filter === "done" ? !!t.completada : !t.completada)) &&
      (!query || title(t).toLowerCase().includes(query.toLowerCase())) &&
      (list === "all" || list === "undated"
        ? !dateOf(t) || list === "all"
        : String(t.lista_id) === list),
  );
  const groups = [...db.listas].sort(
    (a, b) => Number(b.pinned || false) - Number(a.pinned || false),
  );
  if (tasks.some((t) => !t.lista_id))
    groups.push({ id: "none", nombre: "Sin lista", color: PALETTE[5] });
  return (
    <div className="panel tasks-panel">
      <SectionTitle
        title="Dale forma a tus pendientes"
        eyebrow="UN PASO A LA VEZ"
      >
        <Button
          icon={Plus}
          onClick={() => setModal({ type: "form", resource: "listas" })}
        >
          Lista
        </Button>
        <IconButton
          icon={canvas ? List : LayoutGrid}
          label={canvas ? "Ver como lista" : "Ver como tarjetas"}
          onClick={() => setCanvas((v) => !v)}
        />
      </SectionTitle>
      <div className="table-filters">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Encontrar una tarea…"
        />
        <select
          aria-label="Estado de tareas"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending">Pendientes</option>
          <option value="done">Completadas</option>
          <option value="all">Todas</option>
        </select>
        <select
          aria-label="Lista de tareas"
          value={list}
          onChange={(e) => setList(e.target.value)}
        >
          <option value="all">Todas las listas</option>
          <option value="undated">Sin fecha</option>
          {db.listas.map((l) => (
            <option value={l.id} key={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </div>
      {canvas ? (
        <div className="task-canvas">
          {groups
            .filter(
              (l) =>
                list === "all" || list === "undated" || String(l.id) === list,
            )
            .map((l, i) => (
              <div
                className="task-list-card"
                style={{ "--list-color": l.color || PALETTE[i % 6] }}
                key={l.id}
              >
                <div className="inline spread">
                  <h3>
                    {l.nombre}{" "}
                    <span className="count">
                      {
                        tasks.filter((t) =>
                          l.id === "none"
                            ? !t.lista_id
                            : String(t.lista_id) === String(l.id),
                        ).length
                      }
                    </span>
                  </h3>
                  {l.id !== "none" && (
                    <div className="inline">
                      <IconButton
                        icon={Pin}
                        label={l.pinned ? "Desfijar lista" : "Fijar lista"}
                        onClick={() =>
                          mutate("listas", "save", {
                            id: l.id,
                            pinned: !l.pinned,
                          }).catch(() => {})
                        }
                      />
                      <EditActions resource="listas" item={l} />
                    </div>
                  )}
                </div>
                {tasks
                  .filter((t) =>
                    l.id === "none"
                      ? !t.lista_id
                      : String(t.lista_id) === String(l.id),
                  )
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                {list !== "undated" && (
                  <QuickTask listId={l.id === "none" ? null : l.id} />
                )}
              </div>
            ))}
        </div>
      ) : (
        <>
          <QuickTask
            listId={list === "all" || list === "undated" ? null : list}
          />
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </>
      )}
      {!db.tareas.length && !db.listas.length && (
        <Empty
          icon={CheckSquare}
          title="De la cabeza a tu lista."
          text="Anotá lo pendiente. Elegí el próximo paso. Lo demás puede esperar."
          action="Crear primera tarea"
          onAction={() => setModal({ type: "form", resource: "tareas" })}
        />
      )}
      <button
        className="text-button"
        onClick={() => setModal({ type: "manager", resource: "listas" })}
      >
        Administrar listas <ArrowRight size={14} />
      </button>
    </div>
  );
}
function Review({ date, onDate }) {
  const { db } = useApp();
  const start = addDays(date, -(new Date(date + "T12:00:00").getDay() + 6) % 7),
    end = addDays(start, 6);
  const tasks = db.tareas.filter((t) => dateOf(t) >= start && dateOf(t) <= end);
  const completed = tasks.filter((t) => t.completada);
  const overdue = db.tareas.filter(
    (t) => !t.completada && dateOf(t) && dateOf(t) < addDays(today(), -7),
  );
  const events = db.eventos.filter(
    (e) =>
      e.fecha_inicio?.slice(0, 10) >= start &&
      e.fecha_inicio?.slice(0, 10) <= end &&
      !e.todo_el_dia,
  );
  const duration =
    events.reduce(
      (s, e) =>
        s +
        Math.max(0, (new Date(e.fecha_fin) - new Date(e.fecha_inicio)) / 60000),
      0,
    ) +
    tasks
      .filter((t) => t.hora_bloque)
      .reduce((s, t) => s + num(t.duracion_estimada), 0);
  const financial = totals(
    db.movimientos.filter((m) => m.fecha >= start && m.fecha <= end),
    db.finCategorias,
  );
  const exportReview = () =>
    download(
      `# Revisión semanal SGR\n${start} — ${end}\n\n- Tareas completadas: ${completed.length} / ${tasks.length}\n- Tiempo planificado: ${Math.round(duration / 60)} horas\n- Ingresos: ${money(financial.in)}\n- Gastos: ${money(financial.out)}\n\n## Completadas\n${completed.map((t) => "- [x] " + t.titulo).join("\n")}\n\n## Pendientes\n${tasks
        .filter((t) => !t.completada)
        .map((t) => "- [ ] " + t.titulo)
        .join("\n")}`,
      `revision-${start}.md`,
    );
  return (
    <>
      <div className="panel">
        <SectionTitle
          title="Una pausa para mirar atrás"
          eyebrow="REVISIÓN SEMANAL"
        >
          <IconButton
            icon={ChevronLeft}
            label="Semana anterior"
            onClick={() => onDate(addDays(date, -7))}
          />
          <span className="muted small">
            {labelDate(start)} — {labelDate(end)}
          </span>
          <IconButton
            icon={ChevronRight}
            label="Semana siguiente"
            onClick={() => onDate(addDays(date, 7))}
          />
          <Button icon={Download} onClick={exportReview}>
            Exportar
          </Button>
        </SectionTitle>
        <div className="stats-grid">
          <Stat
            label="Tareas completadas"
            value={`${completed.length} / ${tasks.length}`}
            icon={CheckSquare}
          />
          <Stat
            label="Tiempo planificado"
            value={`${Math.round(duration / 60)} h`}
            foot={`${Math.round((duration / 6720) * 100)}% de 112 horas despierto`}
            icon={Clock}
            color="var(--lavender)"
          />
          <Stat
            label="Balance semanal ARS"
            value={money(financial.net)}
            color="var(--peach)"
          />
        </div>
        <div className="week-activity">
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(start, i),
              all = tasks.filter((t) => dateOf(t) === day),
              done = all.filter((t) => t.completada).length;
            return (
              <div key={day}>
                <div className="activity-bar">
                  <span
                    style={{
                      height: `${all.length ? (done / all.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{done}</strong>
                <small>{weekdays[i]}</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <SectionTitle
          title="Pendientes que piden atención"
          eyebrow="VENCIDAS HACE MÁS DE 7 DÍAS"
        />
        {overdue.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {!overdue.length && (
          <div className="review-success">
            <Check size={27} />
            <div>
              <h3>Un poco más de liviandad.</h3>
              <p>No tenés tareas vencidas hace más de una semana.</p>
            </div>
          </div>
        )}
      </div>
      <div className="panel">
        <SectionTitle title="Cómo distribuiste tu tiempo" />
        {db.calendarios.map((c, i) => {
          const mins = events
            .filter((e) => String(e.calendario_id) === String(c.id))
            .reduce(
              (s, e) =>
                s + (new Date(e.fecha_fin) - new Date(e.fecha_inicio)) / 60000,
              0,
            );
          return (
            <div className="distribution-row" key={c.id}>
              <span>{c.nombre}</span>
              <Progress
                value={duration ? (mins / duration) * 100 : 0}
                color={c.color || PALETTE[i % 6]}
              />
              <strong>{(mins / 60).toFixed(1)} h</strong>
            </div>
          );
        })}
      </div>
    </>
  );
}
