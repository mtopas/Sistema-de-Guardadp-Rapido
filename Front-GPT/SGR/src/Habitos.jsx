import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Flame,
  Check,
  CalendarDays,
  ChartNoAxesCombined,
  History,
  Target,
  Sparkles,
  ArrowUpRight,
  Trash2,
  Minus,
  Leaf,
  TrendingUp,
} from "lucide-react";
import { useApp } from "./store";
import {
  Button,
  Tabs,
  SectionTitle,
  Empty,
  EditActions,
  Pill,
  Progress,
  Stat,
  MonthPicker,
  ErrorNotice,
  Modal,
} from "./ui";
import {
  today,
  addDays,
  labelDate,
  monthDays,
  calendarDays,
  scheduled,
  recordFor,
  habitStats,
  PALETTE,
  num,
} from "./domain";
export default function Habitos({ tab = "hoy", setTab }) {
  const app = useApp();
  const { db, setModal, mode, refresh } = app;
  const [month, setMonth] = useState(today().slice(0, 7)),
    [selected, setSelected] = useState(null),
    [checkin, setCheckin] = useState(null),
    [category, setCategory] = useState("all"),
    [archived, setArchived] = useState(false);
  useEffect(() => {
    if (mode === "api")
      refresh("registros", {
        fecha_desde: addDays(month + "-01", -190),
        fecha_hasta: `${month}-${monthDays(month)}`,
      });
  }, [month, mode]);
  const habits = db.habitos.filter(
    (h) =>
      (archived || (h.activo !== false && h.activo !== 0 && !h.archivado_en)) &&
      (category === "all" || h.categoria === category),
  );
  const scheduledToday = habits.filter((h) => scheduled(h, today()));
  const done = scheduledToday.reduce(
    (s, h) => s + num(recordFor(db.registros, h.id, today())?.valor),
    0,
  );
  const pct = scheduledToday.length
    ? Math.round((done / scheduledToday.length) * 100)
    : 0;
  const chosen = habits.find((h) => String(h.id) === String(selected));
  const stats = habits.map((h) => ({
    habit: h,
    ...habitStats(h, db.registros, month),
  }));
  const best = Math.max(0, ...stats.map((s) => s.streak));
  return (
    <div className="page habits-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> EL PODER DE VOLVER A EMPEZAR
          </div>
          <h1>
            Pequeños pasos. <em>Grandes cambios.</em>
          </h1>
          <p>
            No buscás la perfección. Estás construyendo tu propia constancia.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "form", resource: "habitos" })}
        >
          Nuevo hábito
        </Button>
      </div>
      <div className="module-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ["hoy", "Mi constancia", CalendarDays],
            ["progreso", "Progreso", ChartNoAxesCombined],
            ["historial", "Historial", History],
          ]}
        />
        <div className="inline">
          <select
            aria-label="Categoría de hábitos"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {[
              ...new Set(db.habitos.map((h) => h.categoria).filter(Boolean)),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>
      <ErrorNotice keys={["habitos", "registros"]} />
      <div className="habits-layout">
        <main className="habits-main">
          <div className="habit-banner">
            <div>
              <span className="eyebrow">CADA VEZ QUE VOLVÉS, CUENTA.</span>
              <h2>
                Hoy también es
                <br />
                <em>una oportunidad.</em>
              </h2>
              <p>
                {scheduledToday.length
                  ? `${done} de ${scheduledToday.length} hábitos completados hoy.`
                  : "Empezá con algo pequeño que quieras repetir."}
              </p>
            </div>
            <div className="daily-ring">
              <svg viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity=".1"
                  strokeWidth="9"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 402} 402`}
                  transform="rotate(-90 80 80)"
                />
              </svg>
              <div>
                <strong>
                  {pct}
                  <span>%</span>
                </strong>
                <small>TU DÍA, EN MARCHA</small>
              </div>
              <span className="ring-spark">✳</span>
            </div>
          </div>
          <div className="stats-grid">
            <Stat
              label="Hábitos activos"
              value={habits.length}
              icon={Leaf}
              color="var(--lime)"
            />
            <Stat
              label="Mejor racha actual"
              value={`${best} días`}
              icon={Flame}
              color="var(--peach)"
            />
            <Stat
              label="Constancia del mes"
              value={`${stats.length ? Math.round(stats.reduce((a, s) => a + s.percent, 0) / stats.length) : 0}%`}
              icon={TrendingUp}
              color="var(--lavender)"
            />
          </div>
          {!habits.length ? (
            <div className="panel">
              <Empty
                icon={Leaf}
                title="Un pequeño compromiso con vos."
                text="Elegí un hábito simple. Repetilo a tu ritmo. Mirá cómo crece."
                action="Crear mi primer hábito"
                onAction={() => setModal({ type: "form", resource: "habitos" })}
              />
            </div>
          ) : (
            <>
              {tab === "hoy" && (
                <div className="panel habit-grid-panel">
                  <SectionTitle
                    title="Tu mapa de constancia"
                    eyebrow={labelDate(month + "-01", {
                      month: "long",
                      year: "numeric",
                    })}
                  >
                    <label className="toggle-inline">
                      <input
                        type="checkbox"
                        checked={archived}
                        onChange={(e) => setArchived(e.target.checked)}
                      />
                      Ver archivados
                    </label>
                  </SectionTitle>
                  <div className="habit-grid-scroll">
                    <table className="habit-grid">
                      <thead>
                        <tr>
                          <th scope="col">Hábito</th>
                          {Array.from(
                            { length: monthDays(month) },
                            (_, i) => i + 1,
                          ).map((d) => {
                            const date = `${month}-${String(d).padStart(2, "0")}`;
                            return (
                              <th
                                scope="col"
                                key={d}
                                className={
                                  date === today() ? "current-day" : ""
                                }
                              >
                                <small>
                                  {labelDate(date, { weekday: "short" }).slice(
                                    0,
                                    1,
                                  )}
                                </small>
                                <span>{d}</span>
                              </th>
                            );
                          })}
                          <th scope="col">MES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {habits.map((h, i) => {
                          const stat = stats.find((s) => s.habit.id === h.id);
                          return (
                            <tr key={h.id}>
                              <th scope="row">
                                <button
                                  className="habit-name"
                                  onClick={() => setSelected(h.id)}
                                >
                                  <span
                                    className="habit-symbol"
                                    style={{
                                      color: h.color || PALETTE[i % 6],
                                      background:
                                        (h.color || PALETTE[i % 6]) + "18",
                                    }}
                                  >
                                    {["✳", "◈", "◎", "✦", "⌘", "◇"][i % 6]}
                                  </span>
                                  <span>
                                    <strong>{h.nombre}</strong>
                                    <small>
                                      {h.categoria || "Mi rutina"}
                                      {stat.streak > 2
                                        ? ` · 🔥 ${stat.streak}`
                                        : ""}
                                    </small>
                                  </span>
                                </button>
                              </th>
                              {Array.from(
                                { length: monthDays(month) },
                                (_, i) => i + 1,
                              ).map((d) => {
                                const date = `${month}-${String(d).padStart(2, "0")}`,
                                  record = recordFor(db.registros, h.id, date),
                                  future = date > today(),
                                  isDay = scheduled(h, date);
                                return (
                                  <td
                                    key={d}
                                    className={
                                      date === today() ? "current-day" : ""
                                    }
                                  >
                                    <button
                                      className={`habit-cell ${record?.valor === 1 ? "total" : record?.valor === 0.5 ? "partial" : ""} ${future ? "future" : ""} ${!isDay ? "unscheduled" : ""}`}
                                      disabled={future || !isDay}
                                      style={{
                                        "--habit-color": h.color || PALETTE[0],
                                      }}
                                      aria-label={`${h.nombre}, ${labelDate(date)}, ${record?.valor === 1 ? "completo" : record ? "parcial" : future ? "futuro" : !isDay ? "no programado" : "sin completar"}`}
                                      title={
                                        record?.nota ||
                                        `${labelDate(date)} · ${record?.valor === 1 ? "Completo" : record ? "Parcial" : "Sin completar"}`
                                      }
                                      onClick={() =>
                                        setCheckin({ habit: h, date })
                                      }
                                      onKeyDown={(e) => {
                                        const shift = {
                                          ArrowLeft: -1,
                                          ArrowRight: 1,
                                          ArrowUp: -monthDays(month),
                                          ArrowDown: monthDays(month),
                                        }[e.key];
                                        if (shift !== undefined) {
                                          e.preventDefault();
                                          const cells = [
                                            ...e.currentTarget
                                              .closest("tbody")
                                              .querySelectorAll(".habit-cell"),
                                          ];
                                          const index = cells.indexOf(
                                            e.currentTarget,
                                          );
                                          cells[
                                            Math.max(
                                              0,
                                              Math.min(
                                                cells.length - 1,
                                                index + shift,
                                              ),
                                            )
                                          ]?.focus();
                                        }
                                      }}
                                    >
                                      {record?.valor === 1 ? (
                                        <Check size={13} />
                                      ) : record?.valor === 0.5 ? (
                                        <span>½</span>
                                      ) : !isDay ? (
                                        <Minus size={10} />
                                      ) : null}
                                    </button>
                                  </td>
                                );
                              })}
                              <td>
                                <strong
                                  className="habit-percent"
                                  style={{ color: h.color || PALETTE[0] }}
                                >
                                  {stat.percent}%
                                </strong>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="habit-legend">
                    <span>
                      <i className="total" />
                      Completo
                    </span>
                    <span>
                      <i className="partial" />
                      Parcial
                    </span>
                    <span>
                      <i />
                      Pendiente
                    </span>
                    <span>← ↑ ↓ → para moverte · Enter para registrar</span>
                  </div>
                </div>
              )}
              {tab === "progreso" && (
                <HabitProgress
                  habits={habits}
                  stats={stats}
                  month={month}
                  onDay={(date) => {
                    setMonth(date.slice(0, 7));
                    setTab("hoy");
                  }}
                />
              )}
              {tab === "historial" && (
                <HabitHistory
                  habits={habits}
                  month={month}
                  onCheck={setCheckin}
                />
              )}
            </>
          )}
        </main>
        <aside className="habits-sidebar">
          <div className="panel">
            <SectionTitle
              title="Tu ritual de hoy"
              eyebrow={labelDate(today(), { weekday: "long", day: "numeric" })}
            />
            {scheduledToday.map((h, i) => {
              const record = recordFor(db.registros, h.id, today());
              return (
                <button
                  className={`ritual-row ${record ? "done" : ""}`}
                  key={h.id}
                  onClick={() => setCheckin({ habit: h, date: today() })}
                >
                  <span
                    className="ritual-icon"
                    style={{ color: h.color || PALETTE[i % 6] }}
                  >
                    {record ? <Check size={21} /> : <Target size={21} />}
                  </span>
                  <span>
                    <strong>{h.nombre}</strong>
                    <small>
                      {record?.valor === 1
                        ? "Lo hiciste. Bien por vos."
                        : record
                          ? "Un avance también cuenta."
                          : h.hora || "A tu ritmo"}
                    </small>
                  </span>
                  <span className="ritual-check">
                    {record?.valor === 1 ? "✓" : record ? "½" : "+"}
                  </span>
                </button>
              );
            })}
            {!scheduledToday.length && (
              <p className="small muted">
                Un día libre también es parte del proceso.
              </p>
            )}
            <Progress value={pct} color="var(--lime)" />
          </div>
          {chosen ? (
            <div className="panel">
              <SectionTitle title={chosen.nombre}>
                <EditActions resource="habitos" item={chosen} />
              </SectionTitle>
              <p className="muted">
                {chosen.descripcion ||
                  "Un compromiso que se construye día a día."}
              </p>
              <div className="habit-detail-stat">
                <Flame size={25} />
                <strong>
                  {habitStats(chosen, db.registros, month).streak}
                </strong>
                <span>días de racha</span>
              </div>
              <div className="small-label">ÚLTIMOS REGISTROS</div>
              {db.registros
                .filter((r) => String(r.habito_id) === String(chosen.id))
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
                .slice(0, 5)
                .map((r) => (
                  <button
                    className="record-summary"
                    key={r.id}
                    onClick={() => setCheckin({ habit: chosen, date: r.fecha })}
                  >
                    <span>
                      {labelDate(r.fecha)}
                      <small>{r.nota || "Sin nota"}</small>
                    </span>
                    <Pill color={r.valor === 1 ? PALETTE[0] : PALETTE[5]}>
                      {r.valor === 1 ? "✓" : "½"}
                    </Pill>
                  </button>
                ))}
            </div>
          ) : (
            <div className="consistency-card">
              <Flame size={31} />
              <h3>
                La constancia
                <br />
                tiene tu ritmo.
              </h3>
              <p>
                Un día parcial también mantiene tu racha. Cada intento es parte
                del camino.
              </p>
              <div className="constellation-small">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          <div className="panel">
            <SectionTitle title="Tus hábitos" />
            {db.habitos.map((h) => (
              <div className="manager-row" key={h.id}>
                <button
                  className="text-button"
                  onClick={() => setSelected(h.id)}
                >
                  <span className="color-dot" style={{ background: h.color }} />
                  {h.nombre}
                </button>
                <EditActions resource="habitos" item={h} />
              </div>
            ))}
          </div>
        </aside>
      </div>
      {checkin && (
        <CheckinModal {...checkin} onClose={() => setCheckin(null)} />
      )}
    </div>
  );
}
function CheckinModal({ habit, date, onClose }) {
  const { db, mutate } = useApp();
  const record = recordFor(db.registros, habit.id, date);
  const [value, setValue] = useState(record?.valor || 1),
    [note, setNote] = useState(record?.nota || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (remove) => {
    setBusy(true);
    try {
      if (remove) await mutate("registros", "delete", record);
      else
        await mutate("registros", "record", {
          habito_id: habit.id,
          fecha: date,
          valor: value,
          nota: note,
        });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={habit.nombre} onClose={() => !busy && onClose()}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div className="modal-body">
          <span className="eyebrow">
            {labelDate(date, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          <h3>¿Cómo te fue hoy?</h3>
          <div className="completion-choices">
            <button
              type="button"
              className={value === 1 ? "selected" : ""}
              onClick={() => setValue(1)}
            >
              <Check size={27} />
              <strong>Lo completé</strong>
              <span>Un paso más. Una victoria.</span>
            </button>
            <button
              type="button"
              className={value === 0.5 ? "selected partial" : ""}
              onClick={() => setValue(0.5)}
            >
              <span className="half">½</span>
              <strong>Avancé un poco</strong>
              <span>Lo importante es volver.</span>
            </button>
          </div>
          <label className="field">
            <span>Una nota para vos (opcional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="¿Qué te ayudó? ¿Cómo te sentiste?"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          {record && (
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              disabled={busy}
              onClick={() => submit(true)}
            >
              Deshacer
            </Button>
          )}
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Check} disabled={busy}>
            {busy ? "Guardando…" : "Guardar progreso"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
function HabitProgress({ habits, stats, month, onDay }) {
  const { db } = useApp();
  const days = Array.from({ length: 91 }, (_, i) => addDays(today(), i - 90));
  const six = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() - 5 + i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: m,
      value:
        habits.reduce((s, h) => s + habitStats(h, db.registros, m).percent, 0) /
        Math.max(1, habits.length),
    };
  });
  return (
    <>
      <div className="panel">
        <SectionTitle
          title="Cada día deja una huella"
          eyebrow="ÚLTIMOS 3 MESES"
        />
        <div className="heatmap">
          {days.map((date) => {
            const hs = habits.filter((h) => scheduled(h, date)),
              value =
                hs.reduce(
                  (s, h) => s + num(recordFor(db.registros, h.id, date)?.valor),
                  0,
                ) / Math.max(1, hs.length);
            return (
              <button
                key={date}
                className={`heat-cell level-${Math.ceil(value * 4)}`}
                aria-label={`${labelDate(date)}: ${Math.round(value * 100)}% completado`}
                title={`${labelDate(date)} · ${Math.round(value * 100)}%`}
                onClick={() => onDay(date)}
              />
            );
          })}
        </div>
        <div className="chart-axis">
          <span>{labelDate(days[0])}</span>
          <span>Hoy</span>
        </div>
      </div>
      <div className="panel">
        <SectionTitle
          title="Tu constancia crece con vos"
          eyebrow="ÚLTIMOS 6 MESES"
        />
        <svg
          viewBox="0 0 600 140"
          className="habit-sparkline"
          role="img"
          aria-label="Porcentaje de constancia en los últimos seis meses"
        >
          {[20, 65, 110].map((y) => (
            <line
              key={y}
              x1="25"
              x2="575"
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
          ))}
          <polyline
            points={six
              .map((d, i) => `${25 + i * 110},${120 - d.value}`)
              .join(" ")}
            fill="none"
            stroke="var(--lavender)"
            strokeWidth="3"
          />
          {six.map((d, i) => (
            <g key={d.month}>
              <circle
                cx={25 + i * 110}
                cy={120 - d.value}
                r="5"
                fill="var(--lavender)"
              />
              <text
                x={25 + i * 110}
                y={110 - d.value}
                textAnchor="middle"
                fill="var(--text)"
                fontSize="10"
              >
                {Math.round(d.value)}%
              </text>
            </g>
          ))}
        </svg>
        <div className="spark-labels">
          {six.map((d) => (
            <span key={d.month}>
              {labelDate(d.month + "-01", { month: "short" })}
            </span>
          ))}
        </div>
      </div>
      <div className="panel">
        <SectionTitle title="Un hábito a la vez" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Hábito</th>
                <th scope="col">Racha actual</th>
                <th scope="col">Completaciones del mes</th>
                <th scope="col">Constancia</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.habit.id}>
                  <td>{s.habit.nombre}</td>
                  <td>
                    <span className="inline">
                      <Flame size={15} color={PALETTE[2]} />
                      {s.streak} días
                    </span>
                  </td>
                  <td>
                    {s.completed} / {s.possible}
                  </td>
                  <td>
                    <Progress value={s.percent} color={s.habit.color} />
                    <small>{s.percent}%</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
function HabitHistory({ habits, month, onCheck }) {
  const { db } = useApp();
  const [filter, setFilter] = useState("all"),
    [day, setDay] = useState(null);
  const hs =
    filter === "all" ? habits : habits.filter((h) => String(h.id) === filter);
  return (
    <div className="panel">
      <SectionTitle title="Tu historia, día a día">
        <select
          aria-label="Filtrar historial por hábito"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos los hábitos</option>
          {habits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </SectionTitle>
      <div className="history-calendar">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
          <span className="weekday-label" key={i}>
            {d}
          </span>
        ))}
        {calendarDays(month).map((date) => {
          const list = hs.filter((h) => scheduled(h, date));
          const val =
            list.reduce(
              (s, h) => s + num(recordFor(db.registros, h.id, date)?.valor),
              0,
            ) / Math.max(1, list.length);
          return (
            <button
              key={date}
              disabled={date > today()}
              className={`history-day level-${Math.ceil(val * 4)} ${date.slice(0, 7) !== month ? "outside" : ""} ${date === day ? "selected" : ""}`}
              onClick={() => setDay(date)}
              aria-label={`${labelDate(date)}: ${Math.round(val * 100)}%`}
            >
              <strong>{Number(date.slice(-2))}</strong>
              <span>
                {date > today() ? "" : val ? `${Math.round(val * 100)}%` : "—"}
              </span>
            </button>
          );
        })}
      </div>
      {day && (
        <div className="history-detail">
          <h3>
            {labelDate(day, { weekday: "long", day: "numeric", month: "long" })}
          </h3>
          {hs
            .filter((h) => scheduled(h, day))
            .map((h) => {
              const r = recordFor(db.registros, h.id, day);
              return (
                <button
                  className="record-summary"
                  key={h.id}
                  onClick={() => onCheck({ habit: h, date: day })}
                >
                  <span>
                    <strong>{h.nombre}</strong>
                    <small>{r?.nota || "Sin nota"}</small>
                  </span>
                  <Pill color={r?.valor === 1 ? PALETTE[0] : PALETTE[5]}>
                    {r?.valor === 1 ? "Completo" : r ? "Parcial" : "Pendiente"}
                  </Pill>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
