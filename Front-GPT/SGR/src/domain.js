export const PALETTE = [
  "#b4f580",
  "#9f96ff",
  "#ffad79",
  "#65d9ee",
  "#f88db2",
  "#f5dc78",
];
export const today = () => iso(new Date());
export function iso(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const addDays = (date, n) => {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const monthDays = (month) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
export const labelDate = (date, options = { day: "numeric", month: "long" }) =>
  new Date(`${String(date).slice(0, 10)}T12:00:00`).toLocaleDateString(
    "es-AR",
    options,
  );
export const money = (value, currency = "ARS") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(Number(value) || 0);
export const num = (value) => Number(value) || 0;
export const title = (item) =>
  item?.titulo ||
  item?.nombre ||
  item?.descripcion ||
  item?.ticker ||
  "Sin título";
export const dateOf = (item) =>
  String(
    item?.fecha ||
      item?.fecha_opcional ||
      item?.fecha_inicio ||
      item?.creado_en ||
      "",
  ).slice(0, 10);
export const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
export const categoryName = (m, cats = []) =>
  m.categoria_nombre ||
  cats.find((c) => String(c.id) === String(m.categoria_id))?.nombre ||
  m.cat ||
  "Sin categoría";
export const transfer = (m, cats) =>
  categoryName(m, cats).toLowerCase() === "transferencia" ||
  m.tipo === "transferencia";
export const income = (m) => ["ingreso", "income"].includes(m.tipo || m.type);
export const amount = (m) => Math.abs(num(m.monto ?? m.amount));
export function totals(moves, cats, currency = "ARS") {
  return moves
    .filter((m) => !transfer(m, cats) && (m.moneda || "ARS") === currency)
    .reduce(
      (a, m) => {
        a[income(m) ? "in" : "out"] += amount(m);
        a.net = a.in - a.out;
        a.rate = a.in ? (a.net / a.in) * 100 : 0;
        return a;
      },
      { in: 0, out: 0, net: 0, rate: 0 },
    );
}
export function scheduled(h, date) {
  if (h.activo === false || h.activo === 0 || h.archivado_en) return false;
  if (h.creado_en && date < String(h.creado_en).slice(0, 10)) return false;
  return (
    h.frecuencia_tipo !== "semanal" ||
    parseArray(h.dias_semana)
      .map(Number)
      .includes(new Date(`${date}T12:00:00`).getDay())
  );
}
export function recordFor(records, id, date) {
  return records.find(
    (r) => String(r.habito_id) === String(id) && r.fecha === date,
  );
}
export function habitStats(
  h,
  records,
  month = today().slice(0, 7),
  until = today(),
) {
  let possible = 0,
    completed = 0;
  for (let d = 1; d <= monthDays(month); d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    if (date <= until && scheduled(h, date)) {
      possible++;
      completed += num(recordFor(records, h.id, date)?.valor);
    }
  }
  let streak = 0;
  for (let i = 0; i < 3660; i++) {
    const date = addDays(until, -i);
    if (h.creado_en && date < String(h.creado_en).slice(0, 10)) break;
    if (!scheduled(h, date)) continue;
    const val = num(recordFor(records, h.id, date)?.valor);
    if (val > 0) streak++;
    else if (i > 0) break;
  }
  return {
    percent: possible ? Math.round((completed / possible) * 100) : 0,
    streak,
    possible,
    completed,
  };
}
export function allocation(moves, cats, name, rate = 1) {
  return moves
    .filter((m) => categoryName(m, cats).toLowerCase() === name.toLowerCase())
    .reduce(
      (s, m) =>
        s +
        ((income(m) ? -1 : 1) * amount(m)) /
          ((m.moneda || "ARS") === "USD" ? 1 : rate),
      0,
    );
}
export function fireProjection(
  {
    initial = 0,
    contribution = 0,
    annualReturn = 5,
    increase = 0,
    months = 120,
  },
  overrides = [],
) {
  let balance = num(initial);
  const monthly = Math.pow(1 + num(annualReturn) / 100, 1 / 12) - 1;
  return Array.from({ length: Math.min(600, Math.max(1, months)) }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    const mes = iso(d).slice(0, 7);
    const aporte = num(contribution) * Math.pow(1 + num(increase) / 100, i);
    const override = overrides.find((o) => o.mes === mes);
    balance =
      override?.ahorrado != null
        ? num(override.ahorrado)
        : balance * (1 + monthly) + aporte;
    return { mes, aporte, balance };
  });
}
export function calendarDays(month) {
  const first = `${month}-01`;
  const shift = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - shift));
}
export function escapeCSV(value) {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csv(rows, keys) {
  return (
    "\ufeff" +
    [keys, ...rows.map((r) => keys.map((k) => r[k]))]
      .map((row) => row.map(escapeCSV).join(";"))
      .join("\r\n")
  );
}
export function download(content, name, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeURL(url) {
  try {
    const u = new URL(url, globalThis.location?.origin || "http://localhost");
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function plain(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}
