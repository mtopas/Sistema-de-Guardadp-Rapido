import React, { useMemo, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Flame,
  Target,
  Table2,
  LayoutDashboard,
  ChartNoAxesCombined,
  Download,
  Upload,
  Settings2,
  RefreshCw,
  Coins,
  ArrowRight,
  NotebookPen,
  Pencil,
  Check,
} from "lucide-react";
import { useApp } from "./store";
import {
  Button,
  IconButton,
  Stat,
  Tabs,
  MonthPicker,
  SearchBox,
  SectionTitle,
  Progress,
  Empty,
  EditActions,
  Pill,
  ErrorNotice,
  Modal,
} from "./ui";
import {
  PALETTE,
  today,
  money,
  num,
  totals,
  title,
  amount,
  income,
  categoryName,
  transfer,
  allocation,
  fireProjection,
  csv,
  download,
  labelDate,
} from "./domain";
export default function Finanzas({ tab = "dashboard", setTab }) {
  const { db, setModal, mode, action, refresh } = useApp();
  const [month, setMonth] = useState(today().slice(0, 7)),
    [currency, setCurrency] = useState("ARS"),
    [config, setConfig] = useState(false);
  const current = db.movimientos.filter((m) => m.fecha?.startsWith(month));
  const total = totals(current, db.finCategorias, currency);
  const balance = db.cuentas.reduce(
    (s, c) => s + num(currency === "ARS" ? c.saldo_ars : c.saldo_usd),
    0,
  );
  return (
    <div className="page finance-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> CLARIDAD PARA LO QUE VIENE
          </div>
          <h1>
            Tu dinero. <em>Tu libertad.</em>
          </h1>
          <p>Cada decisión de hoy construye las posibilidades de mañana.</p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setModal({ type: "form", resource: "movimientos" })}
        >
          Nuevo movimiento
        </Button>
      </div>
      <div className="module-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ["dashboard", "Panorama", LayoutDashboard],
            ["anual", "Anual", ChartNoAxesCombined],
            ["fire", "FIRE", Flame],
            ["ahorro", "Ahorro", Target],
            ["datos", "Datos", Table2],
          ]}
        />
        <div className="inline">
          <select
            aria-label="Moneda de visualización"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option>ARS</option>
            <option>USD</option>
          </select>
          {["dashboard", "anual"].includes(tab) && (
            <MonthPicker value={month} onChange={setMonth} />
          )}
          <IconButton
            icon={Settings2}
            label="Configuración financiera"
            onClick={() => setConfig(true)}
          />
        </div>
      </div>
      <ErrorNotice
        keys={["movimientos", "cuentas", "finCategorias", "config"]}
      />
      <div className="finance-layout">
        <main className="finance-main">
          {tab === "dashboard" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Ingresos del mes"
                  value={money(total.in, currency)}
                  foot={`${current.filter((m) => income(m) && !transfer(m, db.finCategorias)).length} ingresos registrados`}
                  icon={ArrowDownLeft}
                  color="var(--lime)"
                />
                <Stat
                  label="Gastos del mes"
                  value={money(total.out, currency)}
                  foot="Sin transferencias entre cuentas"
                  icon={ArrowUpRight}
                  color="var(--peach)"
                />
                <Stat
                  label="Tasa de ahorro"
                  value={`${Math.round(total.rate)}%`}
                  foot={
                    total.in
                      ? "De tus ingresos este mes"
                      : "Registrá ingresos para calcularla"
                  }
                  icon={TrendingUp}
                  color="var(--lavender)"
                />
              </div>
              <div className="finance-middle">
                <div className="panel">
                  <SectionTitle
                    eyebrow="CADA PESO CUENTA"
                    title="¿A dónde va tu dinero?"
                  />
                  <Donut
                    moves={current.filter(
                      (m) => (m.moneda || "ARS") === currency,
                    )}
                    categories={db.finCategorias}
                    currency={currency}
                  />
                </div>
                <div className="balance-feature">
                  <span className="eyebrow">SALDO DE TUS CUENTAS</span>
                  <div className="balance-orbit">
                    <i />
                    <i />
                    <Coins size={32} />
                  </div>
                  <strong>{money(balance, currency)}</strong>
                  <span className="muted">
                    {db.cuentas.length} cuentas · {currency}
                  </span>
                  <div className="balance-footer">
                    <span>El futuro se construye de a poco.</span>
                    <ArrowUpRight size={24} />
                  </div>
                </div>
              </div>
              <MovementTable moves={current} currency={currency} compact />
              <div className="panel">
                <SectionTitle
                  title="Notas del mes"
                  eyebrow="PARA NO PERDER DE VISTA"
                >
                  <Button
                    icon={Plus}
                    onClick={() =>
                      setModal({
                        type: "form",
                        resource: "finNotas",
                        defaults: { mes: month },
                      })
                    }
                  >
                    Nota
                  </Button>
                </SectionTitle>
                <ErrorNotice keys={["finNotas"]} />
                <div className="financial-notes">
                  {db.finNotas
                    .filter((n) => !n.mes || n.mes === month)
                    .map((n) => (
                      <div className="financial-note" key={n.id}>
                        <NotebookPen size={18} />
                        <p>{n.contenido || n.texto || n.nota}</p>
                        <EditActions resource="finNotas" item={n} />
                      </div>
                    ))}
                  {!db.finNotas.filter((n) => !n.mes || n.mes === month)
                    .length && (
                    <p className="muted">
                      Un vencimiento, una idea de ahorro, algo para recordar.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
          {tab === "anual" && (
            <Annual year={month.slice(0, 4)} currency={currency} />
          )}
          {tab === "fire" && <Fire onConfig={() => setConfig(true)} />}
          {tab === "ahorro" && <Savings />}
          {tab === "datos" && (
            <MovementTable moves={db.movimientos} currency={currency} />
          )}
        </main>
        <aside className="finance-sidebar">
          <div className="panel">
            <SectionTitle title="Mis cuentas">
              <IconButton
                icon={Plus}
                label="Agregar cuenta"
                onClick={() => setModal({ type: "form", resource: "cuentas" })}
              />
            </SectionTitle>
            {db.cuentas.map((c, i) => (
              <div className="account-row" key={c.id}>
                <span
                  className="account-icon"
                  style={{ color: c.color || PALETTE[i % 6] }}
                >
                  <Wallet size={20} />
                </span>
                <div>
                  <strong>{c.nombre}</strong>
                  <small>{c.tipo || "Cuenta"}</small>
                </div>
                <b>
                  {money(
                    currency === "ARS" ? c.saldo_ars : c.saldo_usd,
                    currency,
                  )}
                </b>
              </div>
            ))}
            {!db.cuentas.length && (
              <p className="muted small">
                Agregá tu primera cuenta para registrar movimientos.
              </p>
            )}
            <button
              className="text-button"
              onClick={() => setModal({ type: "manager", resource: "cuentas" })}
            >
              Administrar cuentas <ArrowRight size={14} />
            </button>
          </div>
          <div className="dollar-card">
            <div className="inline">
              <span className="dollar-sign">$</span>
              <div>
                <strong>Dólar MEP</strong>
                <small>Referencia para tus objetivos</small>
              </div>
            </div>
            <strong className="dollar-value">
              {num(db.config.dolar_mep)
                ? money(db.config.dolar_mep)
                : "Sin cotización"}
            </strong>
            <div className="inline spread">
              <span className="muted small">Oficial compra</span>
              <span>
                {num(db.config.dolar_oficial_compra)
                  ? money(db.config.dolar_oficial_compra)
                  : "—"}
              </span>
            </div>
            {mode === "api" ? (
              <Button
                icon={RefreshCw}
                onClick={async () => {
                  try {
                    const result = await action("/fin/dolar/cotizacion");
                    if (result) await appRefreshConfig();
                  } catch {}
                }}
              >
                Actualizar cotización
              </Button>
            ) : (
              <Button icon={Pencil} onClick={() => setConfig(true)}>
                Ingresar cotización
              </Button>
            )}
          </div>
          <div className="panel">
            <SectionTitle title="Metas de ahorro" />
            <div className="goal-inline">
              <span>Ahorrar este mes</span>
              <strong>{num(db.config.tasa_ahorro_objetivo) || 20}%</strong>
            </div>
            <Progress
              value={
                (total.rate / (num(db.config.tasa_ahorro_objetivo) || 20)) * 100
              }
              color="var(--lime)"
            />
            <p className="muted small">
              Tu tasa actual es {Math.round(total.rate)}%.
            </p>
            <Button icon={Target} onClick={() => setTab("ahorro")}>
              Ver mis objetivos
            </Button>
          </div>
          <button
            className="text-button"
            onClick={() =>
              setModal({ type: "manager", resource: "finCategorias" })
            }
          >
            <Settings2 size={15} />
            Gestionar categorías
          </button>
          {current.some((m) => num(m.cuotas) > 1) && (
            <div className="panel">
              <SectionTitle title="Compras en cuotas" />
              {current
                .filter((m) => num(m.cuotas) > 1)
                .map((m) => (
                  <div className="manager-row" key={m.id}>
                    <span>{m.descripcion}</span>
                    <Pill>{m.cuotas} cuotas</Pill>
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
      {config && <ConfigEditor onClose={() => setConfig(false)} />}
    </div>
  );
  async function appRefreshConfig() {
    window.dispatchEvent(new Event("sgr-refresh"));
  }
}
function Donut({ moves, categories, currency }) {
  const [selected, setSelected] = useState(null);
  const grouped = Object.entries(
    moves
      .filter((m) => !income(m) && !transfer(m, categories))
      .reduce((acc, m) => {
        const key = categoryName(m, categories);
        acc[key] = (acc[key] || 0) + amount(m);
        return acc;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const total = grouped.reduce((s, [, v]) => s + v, 0);
  let offset = 0;
  return (
    <div className="donut-layout">
      <div className="donut">
        <svg
          viewBox="0 0 180 180"
          role="img"
          aria-label={`Gastos por categoría, total ${money(total, currency)}`}
        >
          <circle
            cx="90"
            cy="90"
            r="67"
            fill="none"
            stroke="var(--line)"
            strokeWidth="17"
          />
          {grouped.map(([name, value], i) => {
            const length = total ? (value / total) * 421 : 0;
            const start = offset;
            offset += length;
            return (
              <circle
                key={name}
                cx="90"
                cy="90"
                r="67"
                fill="none"
                stroke={
                  categories.find((c) => c.nombre === name)?.color ||
                  PALETTE[i % 6]
                }
                strokeWidth={selected === name ? 23 : 17}
                strokeDasharray={`${Math.max(0, length - 4)} ${421 - Math.max(0, length - 4)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
                onMouseEnter={() => setSelected(name)}
                onMouseLeave={() => setSelected(null)}
              >
                <title>
                  {name}: {money(value, currency)}
                </title>
              </circle>
            );
          })}
        </svg>
        <div>
          <small>{selected || "GASTO TOTAL"}</small>
          <strong>
            {money(
              selected ? grouped.find(([n]) => n === selected)?.[1] : total,
              currency,
            )}
          </strong>
        </div>
      </div>
      <div className="donut-legend">
        {grouped.map(([name, value], i) => (
          <button
            key={name}
            className={selected === name ? "active" : ""}
            onFocus={() => setSelected(name)}
            onBlur={() => setSelected(null)}
            onMouseEnter={() => setSelected(name)}
            onMouseLeave={() => setSelected(null)}
          >
            <span
              className="color-dot"
              style={{
                background:
                  categories.find((c) => c.nombre === name)?.color ||
                  PALETTE[i % 6],
              }}
            />
            <span>{name}</span>
            <strong>{Math.round((value / total) * 100)}%</strong>
          </button>
        ))}
        {!grouped.length && (
          <p className="muted">
            Tus categorías tomarán color cuando registres gastos.
          </p>
        )}
      </div>
    </div>
  );
}
function MovementTable({ moves, currency, compact = false }) {
  const { db, setModal, mode, action, refresh } = useApp();
  const [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [cat, setCat] = useState("all"),
    [account, setAccount] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState(false);
  const filtered = moves
    .filter(
      (m) =>
        (m.moneda || "ARS") === currency &&
        (!query ||
          `${m.descripcion} ${categoryName(m, db.finCategorias)}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (type === "all" || type === "transferencia"
          ? type === "all" || transfer(m, db.finCategorias)
          : !transfer(m, db.finCategorias) &&
            (type === "ingreso" ? income(m) : !income(m))) &&
        (cat === "all" || String(m.categoria_id) === cat) &&
        (account === "all" || String(m.cuenta_id) === account) &&
        (!from || m.fecha >= from) &&
        (!to || m.fecha <= to),
    )
    .sort(
      (a, b) =>
        (sort ? 1 : -1) * String(a.fecha).localeCompare(String(b.fecha)),
    );
  const pageSize = compact ? 6 : 30;
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
  );
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return (
    <div className="panel movement-panel">
      <SectionTitle
        eyebrow={compact ? "TU ACTIVIDAD" : "REGISTRO COMPLETO"}
        title={compact ? "Últimos movimientos" : "Todos los movimientos"}
      >
        <IconButton
          icon={Download}
          label="Exportar movimientos filtrados como CSV"
          onClick={() =>
            download(
              csv(
                filtered.map((m) => ({
                  ...m,
                  categoria: categoryName(m, db.finCategorias),
                })),
                [
                  "fecha",
                  "descripcion",
                  "tipo",
                  "monto",
                  "moneda",
                  "categoria",
                  "cuenta_id",
                ],
              ),
              `movimientos-${today()}.csv`,
              "text/csv;charset=utf-8",
            )
          }
        />
        {!compact && mode === "api" && (
          <label
            className="icon-button"
            title="Importar CSV"
            aria-label="Importar CSV"
          >
            <Upload size={17} />
            <input
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.append("file", f);
                try {
                  await action("/fin/import/csv", "POST", form);
                  refresh("movimientos");
                  refresh("cuentas");
                } catch {}
                e.target.value = "";
              }}
            />
          </label>
        )}
      </SectionTitle>
      <div className="table-filters">
        <SearchBox
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(0);
          }}
          placeholder="Buscar movimiento…"
        />
        <select
          aria-label="Tipo de movimiento"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
          <option value="transferencia">Transferencias</option>
        </select>
        {!compact && (
          <>
            <select
              aria-label="Categoría"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              <option value="all">Todas las categorías</option>
              {db.finCategorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label="Cuenta"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="all">Todas las cuentas</option>
              {db.cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              aria-label="Fecha desde"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              aria-label="Fecha hasta"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
      </div>
      {filtered.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Movimiento</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">
                    <button
                      className="text-button"
                      onClick={() => setSort((v) => !v)}
                    >
                      Fecha {sort ? "↑" : "↓"}
                    </button>
                  </th>
                  <th scope="col" className="align-right">
                    Importe
                  </th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="movement-name">
                        <span
                          className={`movement-icon ${income(m) ? "positive" : "negative"}`}
                        >
                          {income(m) ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpRight size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{m.descripcion || "Movimiento"}</strong>
                          <small>
                            {db.cuentas.find(
                              (c) => String(c.id) === String(m.cuenta_id),
                            )?.nombre ||
                              m.cuenta_nombre ||
                              "Sin cuenta"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Pill
                        color={
                          db.finCategorias.find(
                            (c) => String(c.id) === String(m.categoria_id),
                          )?.color
                        }
                      >
                        {categoryName(m, db.finCategorias)}
                      </Pill>
                    </td>
                    <td className="muted">
                      {m.fecha
                        ? labelDate(m.fecha, { day: "2-digit", month: "short" })
                        : "—"}
                    </td>
                    <td
                      className={`align-right amount ${income(m) ? "positive" : ""}`}
                    >
                      {income(m) ? "+" : "−"}{" "}
                      {money(amount(m), m.moneda || "ARS")}
                    </td>
                    <td>
                      <EditActions resource="movimientos" item={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {filtered.length} movimientos · {currency}
            </span>
            <div className="inline">
              <Button
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Anterior
              </Button>
              <span>
                {safePage + 1} / {Math.ceil(filtered.length / pageSize)}
              </span>
              <Button
                disabled={(safePage + 1) * pageSize >= filtered.length}
                onClick={() => setPage(safePage + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Empty
          icon={Wallet}
          title="Cada movimiento cuenta."
          text="Registrá un ingreso o gasto para empezar a ver el panorama."
          action="Agregar movimiento"
          onAction={() => setModal({ type: "form", resource: "movimientos" })}
        />
      )}
    </div>
  );
}
function Annual({ year, currency }) {
  const { db, setModal } = useApp();
  const [real, setReal] = useState(false);
  let accumulated = 1;
  const data = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const total = totals(
      db.movimientos.filter((m) => m.fecha?.startsWith(month)),
      db.finCategorias,
      currency,
    );
    const inflation = num(
      db.inflacion.find((f) => f.mes === month)?.porcentaje ??
        db.inflacion.find((f) => f.mes === month)?.valor,
    );
    accumulated *= 1 + inflation / 100;
    return {
      ...total,
      month,
      inflation,
      realIn: total.in / accumulated,
      realOut: total.out / accumulated,
    };
  });
  const max = Math.max(
    1,
    ...data.flatMap((d) => (real ? [d.realIn, d.realOut] : [d.in, d.out])),
  );
  const annual = totals(
    db.movimientos.filter((m) => m.fecha?.startsWith(year)),
    db.finCategorias,
    currency,
  );
  return (
    <>
      <div className="stats-grid">
        <Stat
          label={`Ingresos ${year}`}
          value={money(annual.in, currency)}
          color="var(--lime)"
        />
        <Stat
          label={`Gastos ${year}`}
          value={money(annual.out, currency)}
          color="var(--peach)"
        />
        <Stat
          label="Balance anual"
          value={money(annual.net, currency)}
          color="var(--lavender)"
        />
      </div>
      <div className="panel">
        <SectionTitle title="Un año, en perspectiva" eyebrow={year}>
          <Button onClick={() => setReal((v) => !v)}>
            {real ? "Ajustado por inflación" : "Valores nominales"}
          </Button>
        </SectionTitle>
        <div className="chart-legend">
          <span>
            <i style={{ background: "var(--lime)" }} />
            Ingresos
          </span>
          <span>
            <i style={{ background: "var(--lavender)" }} />
            Gastos
          </span>
        </div>
        <div className="annual-chart">
          {data.map((d, i) => (
            <div className="chart-month" key={d.month}>
              <div className="bar-pair">
                <div
                  style={{
                    height: `${((real ? d.realIn : d.in) / max) * 100}%`,
                    background: "var(--lime)",
                  }}
                  title={`Ingresos ${money(real ? d.realIn : d.in, currency)}`}
                />
                <div
                  style={{
                    height: `${((real ? d.realOut : d.out) / max) * 100}%`,
                    background: "var(--lavender)",
                  }}
                  title={`Gastos ${money(real ? d.realOut : d.out, currency)}`}
                />
              </div>
              <span>
                {
                  [
                    "ENE",
                    "FEB",
                    "MAR",
                    "ABR",
                    "MAY",
                    "JUN",
                    "JUL",
                    "AGO",
                    "SEP",
                    "OCT",
                    "NOV",
                    "DIC",
                  ][i]
                }
              </span>
            </div>
          ))}
        </div>
        {real && (
          <p className="muted small">
            Valores a precios de inicio de año, usando la inflación mensual
            registrada. Un mes sin datos de inflación se toma como 0%.
          </p>
        )}
      </div>
      <div className="panel">
        <SectionTitle title="Mes a mes">
          <Button
            icon={Pencil}
            onClick={() => setModal({ type: "manager", resource: "inflacion" })}
          >
            Inflación
          </Button>
        </SectionTitle>
        <ErrorNotice keys={["inflacion"]} />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Mes",
                  "Ingresos",
                  "Gastos",
                  "Balance",
                  "Ahorro",
                  "Inflación",
                ].map((t) => (
                  <th scope="col" key={t}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <td>{labelDate(d.month + "-01", { month: "long" })}</td>
                  <td className="positive">
                    {money(real ? d.realIn : d.in, currency)}
                  </td>
                  <td>{money(real ? d.realOut : d.out, currency)}</td>
                  <td>
                    {money(real ? d.realIn - d.realOut : d.net, currency)}
                  </td>
                  <td>{Math.round(d.rate)}%</td>
                  <td>{d.inflation}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
function Fire({ onConfig }) {
  const { db, setModal } = useApp();
  const [years, setYears] = useState(10);
  const c = db.config;
  const data = fireProjection(
    {
      initial: c.fire_saldo_inicial,
      contribution: c.fire_aporte_inicial,
      annualReturn: c.fire_rentabilidad_anual ?? 5,
      increase: c.fire_aumento_aporte,
      months: years * 12,
    },
    db.fireFilas,
  );
  const last = data.at(-1);
  const max = Math.max(1, ...data.map((d) => d.balance));
  return (
    <>
      <div className="fire-hero">
        <div>
          <span className="eyebrow">FINANCIAL INDEPENDENCE · RETIRE EARLY</span>
          <h2>
            El tiempo también
            <br />
            <em>invierte en vos.</em>
          </h2>
          <p>Explorá el poder de tus aportes, mes a mes.</p>
          <Button icon={Settings2} onClick={onConfig}>
            Configurar proyección
          </Button>
        </div>
        <div className="fire-art">
          <Flame size={82} />
          <span className="fire-ring" />
          <span className="fire-ring second" />
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Aporte mensual inicial"
          value={money(c.fire_aporte_inicial, "USD")}
          color="var(--peach)"
        />
        <Stat
          label={`Proyección a ${years} años`}
          value={money(last?.balance, "USD")}
          color="var(--lime)"
        />
        <Stat
          label="Retorno anual supuesto"
          value={`${num(c.fire_rentabilidad_anual ?? 5)}%`}
          foot="Simulación, no rendimiento garantizado"
          color="var(--lavender)"
        />
      </div>
      <div className="panel">
        <SectionTitle title="Tu horizonte de libertad">
          <select
            aria-label="Horizonte de proyección"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          >
            {[1, 5, 10, 20, 30].map((y) => (
              <option key={y} value={y}>
                {y} años
              </option>
            ))}
          </select>
        </SectionTitle>
        <svg
          className="projection-chart"
          viewBox="0 0 800 180"
          role="img"
          aria-label={`Proyección de capital: ${money(last?.balance, "USD")}`}
        >
          <defs>
            <linearGradient id="fire-fill" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#b4f580" stopOpacity=".25" />
              <stop offset="1" stopColor="#b4f580" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 75, 120, 165].map((y) => (
            <line
              key={y}
              x1="0"
              x2="800"
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeDasharray="3 6"
            />
          ))}
          <path
            d={`M0 175 ${data.map((d, i) => `L${(i / (data.length - 1)) * 800} ${170 - (d.balance / max) * 150}`).join(" ")} L800 175 Z`}
            fill="url(#fire-fill)"
          />
          <polyline
            points={data
              .map(
                (d, i) =>
                  `${(i / (data.length - 1)) * 800},${170 - (d.balance / max) * 150}`,
              )
              .join(" ")}
            fill="none"
            stroke="var(--lime)"
            strokeWidth="3"
          />
        </svg>
        <div className="chart-axis">
          <span>Hoy</span>
          <span>{years} años</span>
        </div>
      </div>
      <div className="panel">
        <SectionTitle title="Plan mensual" eyebrow="PRÓXIMOS 12 MESES">
          <Button
            icon={Plus}
            onClick={() =>
              setModal({
                type: "form",
                resource: "fireFilas",
                defaults: { mes: today().slice(0, 7) },
              })
            }
          >
            Ajustar saldo real
          </Button>
        </SectionTitle>
        <ErrorNotice keys={["fireFilas"]} />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Aporte proyectado</th>
                <th scope="col">Capital acumulado</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 12).map((d) => (
                <tr key={d.mes}>
                  <td>
                    {labelDate(d.mes + "-01", {
                      month: "long",
                      year: "numeric",
                    })}
                  </td>
                  <td>{money(d.aporte, "USD")}</td>
                  <td className="positive">{money(d.balance, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="text-button"
          onClick={() => setModal({ type: "manager", resource: "fireFilas" })}
        >
          Administrar ajustes guardados <ArrowRight size={14} />
        </button>
      </div>
    </>
  );
}
function Savings() {
  const { db, setModal } = useApp();
  const rate = num(db.config.dolar_mep || db.config.dolar_oficial);
  const buckets = [
    { id: "fire", nombre: "FIRE", color: PALETTE[1] },
    ...db.objetivos,
  ];
  const allocated = rate
    ? buckets.reduce(
        (s, b) =>
          s + allocation(db.movimientos, db.finCategorias, b.nombre, rate),
        0,
      )
    : 0;
  const cost = db.instrumentos.reduce((s, i) => s + num(i.costo_usd), 0);
  return (
    <>
      <ErrorNotice keys={["objetivos", "instrumentos", "transacciones"]} />
      {!rate && (
        <div className="info-notice">
          Ingresá la cotización del dólar en la configuración financiera para
          calcular tus objetivos en USD.
        </div>
      )}
      <div className="stats-grid">
        <Stat
          label="Ahorro asignado"
          value={rate ? money(allocated, "USD") : "—"}
          icon={Target}
        />
        <Stat
          label="Costo del portafolio"
          value={money(cost, "USD")}
          color="var(--lavender)"
        />
        <Stat
          label="Líquido sin invertir"
          value={rate ? money(allocated - cost, "USD") : "—"}
          color="var(--cyan)"
        />
      </div>
      <div className="panel">
        <SectionTitle
          title="Poné un destino a tu ahorro"
          eyebrow="TUS OBJETIVOS"
        >
          <Button
            icon={Plus}
            onClick={() => setModal({ type: "form", resource: "objetivos" })}
          >
            Nuevo objetivo
          </Button>
        </SectionTitle>
        <div className="goals-grid">
          {buckets.map((b, i) => {
            const saved = rate
              ? allocation(db.movimientos, db.finCategorias, b.nombre, rate)
              : 0;
            const goal = num(b.monto_objetivo || b.monto_meta || b.meta);
            return (
              <div
                className="goal-card"
                style={{ "--goal-color": b.color || PALETTE[i % 6] }}
                key={b.id}
              >
                <div className="inline spread">
                  <Target size={24} />
                  {b.id !== "fire" && (
                    <EditActions resource="objetivos" item={b} />
                  )}
                </div>
                <h3>{b.nombre}</h3>
                <strong>{rate ? money(saved, "USD") : "—"}</strong>
                <p>
                  {goal
                    ? `de ${money(goal, "USD")}`
                    : "Un aporte a tu libertad futura"}
                </p>
                <Progress
                  value={goal ? (saved / goal) * 100 : 0}
                  color={b.color || PALETTE[i % 6]}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <SectionTitle title="Tu portafolio" eyebrow="INVERSIONES">
          <Button
            icon={Plus}
            onClick={() => setModal({ type: "form", resource: "instrumentos" })}
          >
            Instrumento
          </Button>
          <Button
            icon={Plus}
            variant="primary"
            onClick={() =>
              setModal({ type: "form", resource: "transacciones" })
            }
          >
            Operación
          </Button>
        </SectionTitle>
        {db.instrumentos.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Instrumento",
                    "Cantidad",
                    "Costo USD",
                    "Valor actual USD",
                    "Resultado",
                    "",
                  ].map((t, i) => (
                    <th key={i} scope="col">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {db.instrumentos.map((i) => {
                  const val = num(i.precio_actual) * num(i.cantidad);
                  return (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.ticker || i.nombre}</strong>
                        <small className="block muted">{i.tipo}</small>
                      </td>
                      <td>
                        {num(i.cantidad).toLocaleString("es-AR", {
                          maximumFractionDigits: 8,
                        })}
                      </td>
                      <td>{money(i.costo_usd, "USD")}</td>
                      <td>
                        {i.precio_actual != null
                          ? money(val, "USD")
                          : "Sin cotización"}
                      </td>
                      <td>
                        {i.precio_actual != null
                          ? money(val - num(i.costo_usd), "USD")
                          : "—"}
                      </td>
                      <td>
                        <EditActions resource="instrumentos" item={i} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={Coins}
            title="Invertí en posibilidades."
            text="Agregá un instrumento y registrá compras o ventas para construir tu portafolio."
            action="Agregar instrumento"
            onAction={() =>
              setModal({ type: "form", resource: "instrumentos" })
            }
          />
        )}
      </div>
      <div className="panel">
        <SectionTitle title="Historial de operaciones" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Instrumento",
                  "Operación",
                  "Cantidad",
                  "Precio",
                  "",
                ].map((t, i) => (
                  <th scope="col" key={i}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...db.transacciones]
                .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.fecha}</td>
                    <td>
                      {db.instrumentos.find(
                        (i) => String(i.id) === String(t.instrumento_id),
                      )?.ticker ||
                        t.ticker ||
                        "—"}
                    </td>
                    <td>
                      <Pill
                        color={t.tipo === "compra" ? PALETTE[0] : PALETTE[2]}
                      >
                        {t.tipo}
                      </Pill>
                    </td>
                    <td>{t.cantidad}</td>
                    <td>{money(t.precio, t.moneda || "USD")}</td>
                    <td>
                      <EditActions resource="transacciones" item={t} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!db.transacciones.length && (
            <p className="muted">Todavía no registraste operaciones.</p>
          )}
        </div>
      </div>
    </>
  );
}
export function ConfigEditor({ onClose }) {
  const { db, configSave } = useApp();
  const defaults = {
    dolar_mep: 0,
    dolar_oficial_compra: 0,
    fire_saldo_inicial: 0,
    fire_aporte_inicial: 0,
    fire_rentabilidad_anual: 5,
    fire_aumento_aporte: 0,
    tasa_ahorro_objetivo: 20,
  };
  const [values, setValues] = useState({ ...defaults, ...db.config }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const labels = {
    dolar_mep: "Dólar MEP (ARS por USD)",
    dolar_oficial_compra: "Dólar oficial compra",
    fire_saldo_inicial: "Capital FIRE inicial (USD)",
    fire_aporte_inicial: "Aporte FIRE inicial (USD / mes)",
    fire_rentabilidad_anual: "Rentabilidad FIRE anual (%)",
    fire_aumento_aporte: "Aumento mensual del aporte (%)",
    tasa_ahorro_objetivo: "Meta de ahorro (%)",
  };
  return (
    <Modal title="Tu plan financiero" onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await configSave("config", values);
            onClose();
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <div className="modal-body form-grid">
          {Object.entries(values)
            .filter(
              ([k, v]) =>
                !k.includes("actualizado") &&
                !k.endsWith("_at") &&
                typeof v !== "object",
            )
            .map(([key, value]) => (
              <label className="field" key={key}>
                <span>{labels[key] || key.replaceAll("_", " ")}</span>
                <input
                  type={
                    typeof value === "number" || Object.hasOwn(defaults, key)
                      ? "number"
                      : "text"
                  }
                  step="any"
                  value={value ?? ""}
                  min={
                    key === "fire_rentabilidad_anual"
                      ? -99
                      : key === "fire_aumento_aporte"
                        ? -99
                        : 0
                  }
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [key]:
                        typeof value === "number" ||
                        Object.hasOwn(defaults, key)
                          ? Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                />
              </label>
            ))}
          {error && (
            <p role="alert" className="form-error full">
              {error}
            </p>
          )}
        </div>
        <footer>
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Check} disabled={busy}>
            {busy ? "Guardando…" : "Guardar configuración"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
