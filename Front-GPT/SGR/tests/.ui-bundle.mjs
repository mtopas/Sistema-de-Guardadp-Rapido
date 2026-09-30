var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/api.js
function resolveSchema(schema, doc) {
  if (!schema) return {};
  if (schema.$ref)
    return resolveSchema(
      doc?.components?.schemas?.[schema.$ref.split("/").pop()],
      doc
    );
  if (schema.anyOf) {
    const child = schema.anyOf.find((s) => s.type !== "null");
    return { ...schema, ...resolveSchema(child, doc) };
  }
  if (schema.allOf)
    return schema.allOf.reduce(
      (a, s) => ({ ...a, ...resolveSchema(s, doc) }),
      schema
    );
  return schema;
}
function unpack(data) {
  if (Array.isArray(data)) return data;
  for (const key of [
    "items",
    "data",
    "results",
    "resultados",
    "movimientos",
    "registros",
    "hojas"
  ])
    if (Array.isArray(data?.[key])) return data[key];
  return [];
}
var ApiError, Client;
var init_api = __esm({
  "src/api.js"() {
    ApiError = class extends Error {
      constructor(message, status = 0, details = null) {
        super(message);
        this.status = status;
        this.details = details;
      }
    };
    Client = class {
      constructor(base = "/api") {
        this.base = base.replace(/\/$/, "");
        this.doc = null;
      }
      async request(path, method = "GET", body, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2e4);
        try {
          const r = await fetch(this.base + path, {
            method,
            signal: controller.signal,
            headers: body instanceof FormData ? {} : body === void 0 ? {} : { "Content-Type": "application/json" },
            body: body === void 0 ? void 0 : body instanceof FormData ? body : JSON.stringify(body)
          });
          if (!r.ok) {
            let error;
            try {
              error = await r.json();
            } catch {
              error = { detail: r.statusText };
            }
            const detail = error.detail;
            const message = Array.isArray(detail) ? detail.map((d) => `${d.loc?.slice(1).join(".") || "Dato"}: ${d.msg}`).join("\n") : typeof detail === "string" ? detail : `La API respondi\xF3 ${r.status}.`;
            throw new ApiError(message, r.status, error);
          }
          if (r.status === 204) return null;
          if (options.blob) return r.blob();
          const content = await r.text();
          if (!content) return null;
          try {
            return JSON.parse(content);
          } catch {
            throw new ApiError(
              "El servidor devolvi\xF3 HTML o texto en lugar de JSON. Revis\xE1 la direcci\xF3n de la API.",
              r.status
            );
          }
        } catch (e) {
          if (e instanceof ApiError) throw e;
          throw new ApiError(
            e.name === "AbortError" ? "La API tard\xF3 demasiado en responder." : "No se pudo conectar con la API. Verific\xE1 que SGR est\xE9 ejecut\xE1ndose en el puerto 8765."
          );
        } finally {
          clearTimeout(timeout);
        }
      }
      async connect() {
        this.doc = await this.request("/openapi.json");
        if (!this.doc?.paths)
          throw new ApiError(
            "Esta direcci\xF3n no expone el contrato OpenAPI de SGR."
          );
        return this.doc;
      }
      path(path) {
        if (!this.doc) return path;
        return Object.hasOwn(this.doc.paths, path) ? path : Object.hasOwn(this.doc.paths, path + "/") ? path + "/" : path;
      }
      operation(path, method) {
        const exact = this.doc?.paths?.[this.path(path)];
        if (exact) return exact[method.toLowerCase()];
        for (const [template, ops] of Object.entries(this.doc?.paths || {})) {
          const regex = new RegExp(
            "^" + template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+") + "/?$"
          );
          if (regex.test(path)) return ops[method.toLowerCase()];
        }
        return void 0;
      }
      bodySchema(path, method) {
        const op = this.operation(path, method);
        return resolveSchema(
          op?.requestBody?.content?.["application/json"]?.schema,
          this.doc
        );
      }
      method(path, preferred = ["PATCH", "PUT", "POST"]) {
        return preferred.find((m) => this.operation(path, m)) || preferred[0];
      }
      async list(path, params = {}) {
        const op = this.operation(path, "GET");
        const allowed = new Set(
          (op?.parameters || []).filter((p) => p.in === "query").map((p) => p.name)
        );
        const query = new URLSearchParams();
        for (const [k, v] of Object.entries(params))
          if (v !== void 0 && (!this.doc || allowed.has(k)))
            query.set(k, String(v));
        const paginated = allowed.has("limit") && allowed.has("offset");
        const pageSize = Math.max(
          1,
          Math.min(
            500,
            Number(
              op?.parameters?.find((p) => p.name === "limit")?.schema?.maximum
            ) || 500
          )
        );
        const all = [];
        let offset = 0;
        do {
          if (paginated) {
            query.set("limit", String(pageSize));
            query.set("offset", String(offset));
          }
          const data = await this.request(
            this.path(path) + (query.size ? "?" + query : "")
          );
          let rows = unpack(data);
          if (!Array.isArray(data) && data && typeof data === "object" && !Object.values(data).some(Array.isArray)) {
            if (["/fin/inflacion", "/fin/fire-filas"].includes(path)) {
              rows = Object.entries(data).filter(([mes]) => /^\d{4}-\d{2}$/.test(mes)).map(([mes, value]) => ({
                mes,
                ...typeof value === "object" ? value : {
                  [path.endsWith("inflacion") ? "porcentaje" : "ahorrado"]: value
                }
              }));
            } else if (Object.keys(data).length)
              throw new ApiError(
                `La respuesta de ${path} no contiene una lista reconocible.`
              );
          } else if (!rows.length && data && !Array.isArray(data)) {
            rows = Object.values(data).find(Array.isArray) || [];
          }
          all.push(...rows);
          if (!paginated || !rows.length || (data?.total != null ? all.length >= data.total : rows.length < pageSize))
            break;
          offset += rows.length;
          if (offset > 1e5)
            throw new ApiError(
              "La consulta supera 100.000 filas. Acot\xE1 el per\xEDodo."
            );
        } while (paginated);
        return all;
      }
      async save(path, method, body) {
        if (this.doc && !this.operation(path, method))
          throw new ApiError(`El servidor no ofrece ${method} ${path}.`);
        return this.request(this.path(path), method, body);
      }
    };
  }
});

// src/domain.js
function iso(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function totals(moves, cats, currency = "ARS") {
  return moves.filter((m) => !transfer(m, cats) && (m.moneda || "ARS") === currency).reduce(
    (a, m) => {
      a[income(m) ? "in" : "out"] += amount(m);
      a.net = a.in - a.out;
      a.rate = a.in ? a.net / a.in * 100 : 0;
      return a;
    },
    { in: 0, out: 0, net: 0, rate: 0 }
  );
}
function scheduled(h, date) {
  if (h.activo === false || h.activo === 0 || h.archivado_en) return false;
  if (h.creado_en && date < String(h.creado_en).slice(0, 10)) return false;
  return h.frecuencia_tipo !== "semanal" || parseArray(h.dias_semana).map(Number).includes((/* @__PURE__ */ new Date(`${date}T12:00:00`)).getDay());
}
function recordFor(records, id2, date) {
  return records.find(
    (r) => String(r.habito_id) === String(id2) && r.fecha === date
  );
}
function habitStats(h, records, month = today().slice(0, 7), until = today()) {
  let possible = 0, completed = 0;
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
    percent: possible ? Math.round(completed / possible * 100) : 0,
    streak,
    possible,
    completed
  };
}
function allocation(moves, cats, name, rate = 1) {
  return moves.filter((m) => categoryName(m, cats).toLowerCase() === name.toLowerCase()).reduce(
    (s, m) => s + (income(m) ? -1 : 1) * amount(m) / ((m.moneda || "ARS") === "USD" ? 1 : rate),
    0
  );
}
function fireProjection({
  initial = 0,
  contribution = 0,
  annualReturn = 5,
  increase = 0,
  months = 120
}, overrides = []) {
  let balance = num(initial);
  const monthly = Math.pow(1 + num(annualReturn) / 100, 1 / 12) - 1;
  return Array.from({ length: Math.min(600, Math.max(1, months)) }, (_, i) => {
    const d = /* @__PURE__ */ new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    const mes = iso(d).slice(0, 7);
    const aporte = num(contribution) * Math.pow(1 + num(increase) / 100, i);
    const override = overrides.find((o) => o.mes === mes);
    balance = override?.ahorrado != null ? num(override.ahorrado) : balance * (1 + monthly) + aporte;
    return { mes, aporte, balance };
  });
}
function calendarDays(month) {
  const first = `${month}-01`;
  const shift = ((/* @__PURE__ */ new Date(`${first}T12:00:00`)).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - shift));
}
function escapeCSV(value) {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
function csv(rows, keys) {
  return "\uFEFF" + [keys, ...rows.map((r) => keys.map((k) => r[k]))].map((row) => row.map(escapeCSV).join(";")).join("\r\n");
}
function download(content, name, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function safeURL(url) {
  try {
    const u = new URL(url, globalThis.location?.origin || "http://localhost");
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
function plain(html) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
}
var PALETTE, today, addDays, monthDays, labelDate, money, num, title, dateOf, parseArray, categoryName, transfer, income, amount;
var init_domain = __esm({
  "src/domain.js"() {
    PALETTE = [
      "#b4f580",
      "#9f96ff",
      "#ffad79",
      "#65d9ee",
      "#f88db2",
      "#f5dc78"
    ];
    today = () => iso(/* @__PURE__ */ new Date());
    addDays = (date, n) => {
      const d = /* @__PURE__ */ new Date(`${String(date).slice(0, 10)}T12:00:00`);
      d.setDate(d.getDate() + n);
      return iso(d);
    };
    monthDays = (month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    labelDate = (date, options = { day: "numeric", month: "long" }) => (/* @__PURE__ */ new Date(`${String(date).slice(0, 10)}T12:00:00`)).toLocaleDateString(
      "es-AR",
      options
    );
    money = (value, currency = "ARS") => new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "USD" ? 2 : 0
    }).format(Number(value) || 0);
    num = (value) => Number(value) || 0;
    title = (item) => item?.titulo || item?.nombre || item?.descripcion || item?.ticker || "Sin t\xEDtulo";
    dateOf = (item) => String(
      item?.fecha || item?.fecha_opcional || item?.fecha_inicio || item?.creado_en || ""
    ).slice(0, 10);
    parseArray = (value) => {
      if (Array.isArray(value)) return value;
      try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    categoryName = (m, cats = []) => m.categoria_nombre || cats.find((c) => String(c.id) === String(m.categoria_id))?.nombre || m.cat || "Sin categor\xEDa";
    transfer = (m, cats) => categoryName(m, cats).toLowerCase() === "transferencia" || m.tipo === "transferencia";
    income = (m) => ["ingreso", "income"].includes(m.tipo || m.type);
    amount = (m) => Math.abs(num(m.monto ?? m.amount));
  }
});

// src/local.js
function emptyDB() {
  return {
    hojas: [],
    categorias: [],
    movimientos: [],
    cuentas: [],
    finCategorias: [],
    objetivos: [],
    instrumentos: [],
    transacciones: [],
    finNotas: [],
    calendarios: [],
    eventos: [],
    listas: [],
    tareas: [],
    facultad: [],
    habitos: [],
    registros: [],
    fireFilas: [],
    inflacion: [],
    feedback: [],
    config: {
      dolar_mep: 0,
      fire_saldo_inicial: 0,
      fire_aporte_inicial: 0,
      fire_rentabilidad_anual: 5,
      fire_aumento_aporte: 0
    },
    settings: { nombre_mostrar: "" }
  };
}
function localMutation(previous, key, action, payload) {
  const db = clone(previous);
  let row;
  if (action === "delete") {
    const target = db[key].find((x) => String(x.id) === String(payload.id));
    if (key === "categorias" && (db.hojas.some((x) => String(x.categoria_id) === String(payload.id)) || db.categorias.some((x) => String(x.padre_id) === String(payload.id))))
      throw Error(
        "Mov\xE9 las notas y subcolecciones antes de eliminar esta colecci\xF3n."
      );
    if (key === "cuentas" && db.movimientos.some((x) => String(x.cuenta_id) === String(payload.id)))
      throw Error(
        "Esta cuenta tiene movimientos. Reasignalos antes de eliminarla."
      );
    if (key === "finCategorias" && (target?.objetivo_id || ["fire", "transferencia", "ajuste"].includes(
      target?.nombre?.toLowerCase()
    )))
      throw Error("Esta categor\xEDa pertenece al sistema o a un objetivo.");
    if (key === "finCategorias" && db.movimientos.some((m) => String(m.categoria_id) === String(payload.id)))
      throw Error(
        "Esta categor\xEDa tiene movimientos. Ocultala o reasignalos antes de eliminarla."
      );
    db[key] = db[key].filter((x) => String(x.id) !== String(payload.id));
    if (key === "habitos")
      db.registros = db.registros.filter(
        (x) => String(x.habito_id) !== String(payload.id)
      );
    if (key === "calendarios")
      db.eventos = db.eventos.filter(
        (x) => String(x.calendario_id) !== String(payload.id)
      );
    if (key === "listas")
      db.tareas = db.tareas.map(
        (x) => String(x.lista_id) === String(payload.id) ? { ...x, lista_id: null } : x
      );
    if (key === "instrumentos")
      db.transacciones = db.transacciones.filter(
        (x) => String(x.instrumento_id) !== String(payload.id)
      );
    if (key === "objetivos")
      db.finCategorias = db.finCategorias.map(
        (c) => String(c.objetivo_id) === String(payload.id) ? { ...c, oculta: true } : c
      );
  } else if (action === "record") {
    if (![0.5, 1].includes(Number(payload.valor)))
      throw Error("El progreso debe ser parcial o completo.");
    if (payload.fecha > today())
      throw Error("No se puede registrar progreso en un d\xEDa futuro.");
    const existing = db.registros.find(
      (r) => String(r.habito_id) === String(payload.habito_id) && r.fecha === payload.fecha
    );
    row = { ...existing, ...payload, id: existing?.id || id() };
    db.registros = [...db.registros.filter((r) => r.id !== row.id), row];
  } else {
    row = {
      creado_en: (/* @__PURE__ */ new Date()).toISOString(),
      ...db[key].find((x) => String(x.id) === String(payload.id)) || {},
      ...payload,
      id: payload.id || id(),
      actualizado_en: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (key === "movimientos" && (!Number.isFinite(Number(row.monto)) || num(row.monto) <= 0))
      throw Error("El importe debe ser un n\xFAmero mayor que cero.");
    if (["fireFilas", "inflacion"].includes(key)) {
      const existing = db[key].find((entry) => entry.mes === row.mes);
      if (existing) row.id = existing.id;
    }
    if (key === "finCategorias" && payload.id) {
      const previousCategory = db.finCategorias.find(
        (c) => String(c.id) === String(payload.id)
      );
      if ((previousCategory?.objetivo_id || ["fire", "transferencia", "ajuste"].includes(
        previousCategory?.nombre?.toLowerCase()
      )) && previousCategory.nombre !== row.nombre)
        throw Error(
          "Las categor\xEDas del sistema o de objetivos no se pueden renombrar."
        );
    }
    if (key === "objetivos" && !payload.id) {
      if (db.objetivos.some(
        (o) => o.nombre.toLowerCase() === row.nombre.toLowerCase()
      ))
        throw Error("Ya existe un objetivo con ese nombre.");
      db.finCategorias.push({
        id: id(),
        nombre: row.nombre,
        tipo: "both",
        color: row.color,
        objetivo_id: row.id
      });
    }
    if (key === "categorias" && row.padre_id) {
      let parent = row.padre_id;
      const visited = /* @__PURE__ */ new Set([String(row.id)]);
      while (parent) {
        if (visited.has(String(parent)))
          throw Error("Una colecci\xF3n no puede contenerse a s\xED misma.");
        visited.add(String(parent));
        parent = db.categorias.find(
          (c) => String(c.id) === String(parent)
        )?.padre_id;
      }
    }
    if (key === "transacciones") {
      if (num(row.cantidad) <= 0 || num(row.precio) < 0)
        throw Error("Revis\xE1 la cantidad y el precio de la operaci\xF3n.");
      const instrument = db.instrumentos.find(
        (i) => String(i.id) === String(row.instrumento_id)
      );
      if (!instrument) throw Error("Eleg\xED un instrumento.");
      if (row.moneda === "ARS" && num(row.tipo_cambio) <= 0)
        throw Error("Ingres\xE1 el tipo de cambio para convertir a USD.");
      row.monto_total = num(row.cantidad) * num(row.precio);
    }
    db[key] = [...db[key].filter((x) => String(x.id) !== String(row.id)), row];
    if (["eventos", "tareas"].includes(key) && row.se_repite && !payload.id && row.regla_repeticion) {
      const rule = typeof row.regla_repeticion === "string" ? JSON.parse(row.regla_repeticion) : row.regla_repeticion;
      const start = String(row.fecha_inicio || row.fecha_opcional || "").slice(
        0,
        10
      );
      if (!start || !rule.hasta)
        throw Error(
          "La repetici\xF3n necesita una fecha de inicio y una fecha final."
        );
      if (rule.hasta > addDays(start, 366))
        throw Error("En el espacio local, la repetici\xF3n permite hasta un a\xF1o.");
      for (let day = addDays(start, 1); day <= rule.hasta; day = addDays(day, 1)) {
        const d = /* @__PURE__ */ new Date(day + "T12:00:00"), s = /* @__PURE__ */ new Date(start + "T12:00:00");
        const matches = rule.tipo === "diario" || rule.tipo === "semanal" && (rule.dias_semana || [s.getDay()]).includes(d.getDay()) || rule.tipo === "mensual" && d.getDate() === s.getDate();
        if (!matches) continue;
        const copy = { ...row, id: id(), serie_id: row.id };
        if (key === "eventos") {
          const duration = new Date(row.fecha_fin) - new Date(row.fecha_inicio);
          copy.fecha_inicio = day + row.fecha_inicio.slice(10);
          const end = new Date(
            new Date(copy.fecha_inicio).getTime() + duration
          );
          copy.fecha_fin = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
        } else copy.fecha_opcional = day;
        db[key].push(copy);
      }
    }
  }
  db.cuentas = db.cuentas.map((c) => ({
    ...c,
    saldo_ars: db.movimientos.filter(
      (m) => String(m.cuenta_id) === String(c.id) && (m.moneda || "ARS") === "ARS"
    ).reduce((a, m) => a + (income(m) ? 1 : -1) * amount(m), 0),
    saldo_usd: db.movimientos.filter((m) => String(m.cuenta_id) === String(c.id) && m.moneda === "USD").reduce((a, m) => a + (income(m) ? 1 : -1) * amount(m), 0)
  }));
  db.instrumentos = db.instrumentos.map((inst) => {
    let quantity = 0, cost = 0;
    for (const tx of db.transacciones.filter((t) => String(t.instrumento_id) === String(inst.id)).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const q = num(tx.cantidad);
      const price = num(tx.precio) / (tx.moneda === "ARS" ? num(tx.tipo_cambio) || 1 : 1);
      if (tx.tipo === "venta") {
        if (q > quantity + 1e-8)
          throw Error(
            "La venta supera la cantidad disponible del instrumento."
          );
        cost -= quantity ? cost / quantity * q : 0;
        quantity -= q;
      } else {
        quantity += q;
        cost += q * price;
      }
    }
    return {
      ...inst,
      cantidad: quantity,
      costo_usd: cost,
      has_transactions: db.transacciones.some(
        (t) => String(t.instrumento_id) === String(inst.id)
      )
    };
  });
  return { db, row };
}
function sampleDB() {
  const db = emptyDB(), d = today();
  db.settings.nombre_mostrar = "";
  db.categorias = [
    { id: "c1", nombre: "Universo creativo", color: "#9f96ff" },
    { id: "c2", nombre: "Desarrollo personal", color: "#b4f580" },
    { id: "c3", nombre: "Ideas en movimiento", color: "#ffad79" },
    { id: "c4", nombre: "Tecnolog\xEDa", color: "#65d9ee" }
  ];
  db.hojas = [
    [
      "Dise\xF1ar una vida con intenci\xF3n",
      "c2",
      "Un buen sistema deja espacio para lo inesperado.\n\nElegir tres prioridades. Cuidar la energ\xEDa. Celebrar los peque\xF1os avances."
    ],
    [
      "El jard\xEDn de las ideas",
      "c1",
      "Conectar ideas de disciplinas diferentes. Guardar preguntas, no solo respuestas."
    ],
    ["Una segunda mente", "c4", "Capturar \u2192 Organizar \u2192 Conectar \u2192 Crear."],
    [
      "Proyecto: mi pr\xF3ximo cap\xEDtulo",
      "c3",
      "Un lugar para explorar lo que viene."
    ],
    [
      "Menos ruido, m\xE1s foco",
      "c2",
      "Proteger una hora al d\xEDa para el trabajo que importa."
    ],
    [
      "Inspiraci\xF3n sin fronteras",
      "c1",
      "Formas org\xE1nicas, color y sistemas vivos."
    ],
    [
      "Aprender construyendo",
      "c4",
      "Convertir cada pregunta en un peque\xF1o experimento."
    ],
    [
      "La lista de alg\xFAn d\xEDa",
      "c3",
      "Aprender fotograf\xEDa. Viajar al sur. Publicar una idea."
    ]
  ].map(([titulo, categoria_id, contenido], i) => ({
    id: "n" + i,
    titulo,
    categoria_id,
    contenido,
    tipo: "texto",
    creado_en: (/* @__PURE__ */ new Date()).toISOString()
  }));
  db.calendarios = [
    { id: "a1", nombre: "Personal", color: "#b4f580", activo: true },
    { id: "a2", nombre: "Trabajo", color: "#9f96ff", activo: true }
  ];
  db.eventos = [
    {
      id: "e1",
      titulo: "Un espacio para crear",
      fecha_inicio: d + "T10:00",
      fecha_fin: d + "T11:30",
      calendario_id: "a2"
    },
    {
      id: "e2",
      titulo: "Salir a caminar",
      fecha_inicio: d + "T17:00",
      fecha_fin: d + "T17:45",
      calendario_id: "a1"
    }
  ];
  db.listas = [
    { id: "l1", nombre: "Esta semana", color: "#ffad79", pinned: true },
    { id: "l2", nombre: "Proyectos", color: "#65d9ee" }
  ];
  db.tareas = [
    {
      id: "t1",
      titulo: "Darle forma a una nueva idea",
      lista_id: "l1",
      fecha_opcional: d,
      completada: false
    },
    {
      id: "t2",
      titulo: "Ordenar el escritorio digital",
      lista_id: "l1",
      fecha_opcional: d,
      completada: true
    },
    {
      id: "t3",
      titulo: "Planear el pr\xF3ximo proyecto",
      lista_id: "l2",
      completada: false
    }
  ];
  db.habitos = [
    {
      id: "h1",
      nombre: "Leer un cap\xEDtulo",
      color: "#b4f580",
      categoria: "Mente",
      frecuencia_tipo: "diario",
      activo: true
    },
    {
      id: "h2",
      nombre: "Mover el cuerpo",
      color: "#ffad79",
      categoria: "Energ\xEDa",
      frecuencia_tipo: "diario",
      activo: true,
      hora: "08:00"
    },
    {
      id: "h3",
      nombre: "Escribir una idea",
      color: "#9f96ff",
      categoria: "Crear",
      frecuencia_tipo: "diario",
      activo: true
    }
  ];
  for (let i = 20; i >= 0; i--)
    db.habitos.forEach((h, j) => {
      if ((i + j) % 5 !== 0)
        db.registros.push({
          id: id(),
          habito_id: h.id,
          fecha: addDays(d, -i),
          valor: (i + j) % 7 === 0 ? 0.5 : 1,
          nota: ""
        });
    });
  db.cuentas = [
    {
      id: "q1",
      nombre: "Cuenta principal",
      tipo: "banco",
      saldo_ars: 98e4,
      saldo_usd: 0,
      color: "#65d9ee"
    }
  ];
  db.finCategorias = [
    { id: "f1", nombre: "Trabajo", tipo: "ingreso", color: "#b4f580" },
    { id: "f2", nombre: "Vida diaria", tipo: "gasto", color: "#ffad79" },
    { id: "f3", nombre: "FIRE", tipo: "both", color: "#9f96ff" }
  ];
  db.movimientos = [
    {
      id: "m1",
      descripcion: "Ingresos del mes",
      tipo: "ingreso",
      monto: 15e5,
      moneda: "ARS",
      fecha: d,
      cuenta_id: "q1",
      categoria_id: "f1"
    },
    {
      id: "m2",
      descripcion: "Compras de la semana",
      tipo: "gasto",
      monto: 12e4,
      moneda: "ARS",
      fecha: addDays(d, -1),
      cuenta_id: "q1",
      categoria_id: "f2"
    },
    {
      id: "m3",
      descripcion: "Inversi\xF3n en mi futuro",
      tipo: "gasto",
      monto: 4e5,
      moneda: "ARS",
      fecha: d,
      cuenta_id: "q1",
      categoria_id: "f3"
    }
  ];
  return db;
}
var clone, id;
var init_local = __esm({
  "src/local.js"() {
    init_domain();
    clone = (value) => JSON.parse(JSON.stringify(value));
    id = () => globalThis.crypto.randomUUID();
  }
});

// src/resources.js
var f, resources, labels;
var init_resources = __esm({
  "src/resources.js"() {
    init_domain();
    f = (key, label, type = "text", extra = {}) => ({
      key,
      label,
      type,
      ...extra
    });
    resources = {
      hojas: {
        path: "/hojas",
        label: "nota",
        plural: "Notas",
        fields: [
          f("titulo", "T\xEDtulo", "text", { required: true }),
          f("tipo", "Tipo", "select", {
            options: ["texto", "link", "foto"],
            default: "texto"
          }),
          f("categoria_id", "Colecci\xF3n", "relation", { source: "categorias" }),
          f("contenido", "Contenido o URL", "textarea"),
          f("apuntes", "Apuntes", "textarea"),
          f("color", "Color", "color")
        ]
      },
      categorias: {
        path: "/categorias",
        label: "colecci\xF3n",
        plural: "Colecciones",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("padre_id", "Colecci\xF3n superior", "relation", { source: "categorias" }),
          f("color", "Color", "color"),
          f("icono", "\xCDcono / emoji")
        ]
      },
      movimientos: {
        path: "/fin/movimientos",
        label: "movimiento",
        plural: "Movimientos",
        fields: [
          f("descripcion", "Descripci\xF3n", "text", { required: true }),
          f("tipo", "Tipo", "select", {
            options: ["gasto", "ingreso"],
            default: "gasto"
          }),
          f("monto", "Importe", "number", { required: true, min: 0.01 }),
          f("moneda", "Moneda", "select", {
            options: ["ARS", "USD"],
            default: "ARS"
          }),
          f("fecha", "Fecha", "date", { required: true, default: today }),
          f("cuenta_id", "Cuenta", "relation", {
            source: "cuentas",
            required: true
          }),
          f("categoria_id", "Categor\xEDa", "relation", {
            source: "finCategorias",
            required: true
          }),
          f("cuotas", "Cuotas", "number", { min: 1, default: 1 }),
          f("nota", "Nota", "textarea")
        ]
      },
      cuentas: {
        path: "/fin/cuentas",
        label: "cuenta",
        plural: "Cuentas",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("tipo", "Tipo", "select", {
            options: ["banco", "billetera", "efectivo"],
            default: "banco"
          }),
          f("color", "Color", "color")
        ]
      },
      finCategorias: {
        path: "/fin/categorias",
        label: "categor\xEDa",
        plural: "Categor\xEDas",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("tipo", "Tipo", "select", {
            options: ["gasto", "ingreso", "both"],
            default: "both"
          }),
          f("color", "Color", "color"),
          f("oculta", "Oculta", "checkbox")
        ]
      },
      objetivos: {
        path: "/fin/objetivos",
        label: "objetivo",
        plural: "Objetivos",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("monto_objetivo", "Meta en USD", "number", { required: true, min: 1 }),
          f("fecha_objetivo", "Fecha objetivo", "date"),
          f("color", "Color", "color")
        ]
      },
      instrumentos: {
        path: "/fin/instrumentos",
        label: "instrumento",
        plural: "Instrumentos",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("ticker", "Ticker", "text", { required: true }),
          f("tipo", "Tipo", "select", {
            options: ["acciones", "fci", "plazo_fijo", "ons", "crypto", "otros"],
            default: "acciones"
          }),
          f("precio_actual", "Precio actual USD", "number", { min: 0 })
        ]
      },
      transacciones: {
        path: "/fin/transacciones",
        label: "transacci\xF3n",
        plural: "Transacciones",
        fields: [
          f("instrumento_id", "Instrumento", "relation", {
            source: "instrumentos",
            required: true
          }),
          f("tipo", "Operaci\xF3n", "select", {
            options: ["compra", "venta"],
            default: "compra"
          }),
          f("fecha", "Fecha", "date", { default: today, required: true }),
          f("cantidad", "Cantidad", "number", { required: true, min: 1e-8 }),
          f("precio", "Precio unitario", "number", { required: true, min: 0 }),
          f("moneda", "Moneda", "select", {
            options: ["ARS", "USD"],
            default: "USD"
          }),
          f("tipo_cambio", "Tipo de cambio ARS/USD", "number", { min: 0.01 }),
          f("nota", "Nota", "textarea")
        ]
      },
      finNotas: {
        path: "/fin/notas",
        label: "nota financiera",
        plural: "Notas financieras",
        fields: [
          f("contenido", "Nota", "textarea", { required: true }),
          f("mes", "Mes", "month", { default: () => today().slice(0, 7) })
        ]
      },
      calendarios: {
        path: "/agenda/calendarios",
        label: "calendario",
        plural: "Calendarios",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("color", "Color", "color"),
          f("activo", "Activo", "checkbox", { default: true })
        ]
      },
      eventos: {
        path: "/agenda/eventos",
        label: "evento",
        plural: "Eventos",
        fields: [
          f("titulo", "T\xEDtulo", "text", { required: true }),
          f("calendario_id", "Calendario", "relation", {
            source: "calendarios",
            required: true
          }),
          f("fecha_inicio", "Inicio", "datetime-local", {
            required: true,
            default: () => today() + "T09:00"
          }),
          f("fecha_fin", "Fin", "datetime-local", {
            required: true,
            default: () => today() + "T10:00"
          }),
          f("todo_el_dia", "Todo el d\xEDa", "checkbox"),
          f("descripcion", "Descripci\xF3n", "textarea"),
          f("se_repite", "Se repite", "checkbox"),
          f("regla_repeticion", "Regla de repetici\xF3n", "json")
        ]
      },
      listas: {
        path: "/agenda/listas",
        label: "lista",
        plural: "Listas de tareas",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("color", "Color", "color"),
          f("pinned", "Fijar arriba", "checkbox")
        ]
      },
      tareas: {
        path: "/agenda/tareas",
        label: "tarea",
        plural: "Tareas",
        fields: [
          f("titulo", "T\xEDtulo", "text", { required: true }),
          f("lista_id", "Lista", "relation", { source: "listas" }),
          f("fecha_opcional", "Fecha", "date"),
          f("hora_opcional", "Hora", "time"),
          f("hora_bloque", "Reservar un bloque a las", "time"),
          f("duracion_estimada", "Duraci\xF3n (minutos)", "number", {
            min: 5,
            default: 30
          }),
          f("descripcion", "Descripci\xF3n", "textarea"),
          f("completada", "Completada", "checkbox"),
          f("se_repite", "Se repite", "checkbox"),
          f("regla_repeticion", "Regla de repetici\xF3n", "json")
        ]
      },
      facultad: {
        path: "/agenda/horario-facultad",
        label: "materia",
        plural: "Horario de facultad",
        fields: [
          f("nombre", "Materia", "text", { required: true }),
          f("dia_semana", "D\xEDa (0 domingo a 6 s\xE1bado)", "number", {
            required: true,
            min: 0,
            max: 6
          }),
          f("hora_inicio", "Inicio", "time", { required: true }),
          f("hora_fin", "Fin", "time", { required: true }),
          f("color", "Color", "color")
        ]
      },
      habitos: {
        path: "/habitos",
        label: "h\xE1bito",
        plural: "H\xE1bitos",
        fields: [
          f("nombre", "Nombre", "text", { required: true }),
          f("descripcion", "Tu intenci\xF3n", "textarea"),
          f("categoria", "Categor\xEDa"),
          f("color", "Color", "color"),
          f("frecuencia_tipo", "Frecuencia", "select", {
            options: ["diario", "semanal"],
            default: "diario"
          }),
          f("dias_semana", "D\xEDas de la semana", "weekdays"),
          f("hora", "Hora (opcional)", "time"),
          f("activo", "Activo", "checkbox", { default: true }),
          f("notificar", "Recordar", "checkbox"),
          f("minutos_antes", "Minutos de anticipaci\xF3n", "number", {
            min: 0,
            default: 15
          })
        ]
      },
      registros: {
        path: "/habitos/registros",
        label: "registro",
        plural: "Registros",
        fields: []
      },
      fireFilas: {
        path: "/fin/fire-filas",
        label: "aporte FIRE",
        plural: "Aportes FIRE",
        fields: [
          f("mes", "Mes", "month", { required: true }),
          f("ahorrado", "Saldo acumulado USD", "number", { required: true })
        ]
      },
      inflacion: {
        path: "/fin/inflacion",
        label: "inflaci\xF3n",
        plural: "Inflaci\xF3n mensual",
        fields: [
          f("mes", "Mes", "month", { required: true }),
          f("porcentaje", "Inflaci\xF3n (%)", "number", { required: true })
        ]
      },
      feedback: {
        path: "/feedback",
        label: "comentario",
        plural: "Feedback",
        fields: [
          f("titulo", "T\xEDtulo", "text", { required: true }),
          f("contenido", "Comentario", "textarea", { required: true })
        ]
      }
    };
    labels = {
      cuenta_nombre: "Cuenta",
      categoria_nombre: "Categor\xEDa",
      monto_total: "Importe total",
      fecha_desde: "Desde",
      fecha_hasta: "Hasta",
      texto: "Texto",
      mensaje: "Mensaje",
      meta: "Meta",
      monto_meta: "Meta",
      saldo_ars: "Saldo ARS",
      saldo_usd: "Saldo USD",
      fire_aporte_inicial: "Aporte mensual USD",
      fire_saldo_inicial: "Capital inicial USD",
      fire_rentabilidad_anual: "Rentabilidad anual (%)",
      fire_aumento_aporte: "Aumento mensual (%)",
      tasa_ahorro_objetivo: "Meta de ahorro (%)",
      dolar_mep: "D\xF3lar MEP",
      dolar_oficial: "D\xF3lar manual",
      dolar_oficial_compra: "D\xF3lar oficial compra",
      nombre_mostrar: "Nombre para mostrar"
    };
  }
});

// src/store.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { jsx } from "react/jsx-runtime";
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function Provider({ children }) {
  const [mode, setModeState] = useState(() => read("-mode", "api")), [base, setBase] = useState(
    () => read("-base", "/api")
  );
  const [db, setDB] = useState(
    () => mode === "local" ? { ...emptyDB(), ...read("-local", {}) } : emptyDB()
  ), [status, setStatus] = useState(mode === "api" ? "connecting" : "local"), [errors, setErrors] = useState({}), [toast, setToast] = useState(null), [modal, setModal] = useState(null), [preferences, setPrefs] = useState(
    () => read("-prefs", {
      theme: "dark",
      motion: true,
      name: "",
      notifications: false,
      lead: 15
    })
  );
  const client = useRef(new Client(base)), dbRef = useRef(db), modeRef = useRef(mode), generation = useRef(0), toastTimer = useRef(), queryRanges = useRef({}), requestVersions = useRef({});
  dbRef.current = db;
  modeRef.current = mode;
  const notify = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  };
  const persist = (value) => {
    localStorage.setItem(PREFIX + "-local", JSON.stringify(value));
    dbRef.current = value;
    setDB(value);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const pathFor = (key) => {
    const p = resources[key].path;
    if (key === "feedback" && client.current.doc?.paths?.["/settings/feedback"])
      return "/settings/feedback";
    return p;
  };
  async function refresh(key, params = {}) {
    if (modeRef.current !== "api") return;
    queryRanges.current[key] = { ...queryRanges.current[key], ...params };
    if (!client.current.doc) return;
    const token = generation.current;
    const version = (requestVersions.current[key] || 0) + 1;
    requestVersions.current[key] = version;
    try {
      const range = {
        ...["eventos", "registros"].includes(key) ? {
          fecha_desde: addDays(today(), -370),
          fecha_hasta: addDays(today(), 370),
          desde: addDays(today(), -370),
          hasta: addDays(today(), 370)
        } : {},
        ...queryRanges.current[key]
      };
      let rows = await client.current.list(pathFor(key), range);
      if (["fireFilas", "inflacion"].includes(key))
        rows = rows.map((row) => ({ ...row, id: row.id ?? row.mes }));
      if (token !== generation.current || requestVersions.current[key] !== version)
        return;
      setDB((prev) => {
        const next = { ...prev, [key]: rows };
        dbRef.current = next;
        return next;
      });
      setErrors((e) => ({ ...e, [key]: null }));
    } catch (e) {
      if (token === generation.current && requestVersions.current[key] === version)
        setErrors((prev) => ({ ...prev, [key]: e.message }));
    }
  }
  async function connect() {
    setStatus("connecting");
    setErrors({});
    setDB(emptyDB());
    const token = ++generation.current;
    try {
      client.current = new Client(base);
      await client.current.connect();
      if (token !== generation.current) return;
      setStatus("online");
      await Promise.all(Object.keys(resources).map((key) => refresh(key)));
      for (const [key, path] of [
        ["config", "/fin/config"],
        ["settings", "/settings"]
      ]) {
        try {
          if (!client.current.operation(path, "GET")) continue;
          const data = await client.current.request(path);
          if (token === generation.current)
            setDB((prev) => ({ ...prev, [key]: data }));
        } catch (e) {
          setErrors((prev) => ({ ...prev, [key]: e.message }));
        }
      }
    } catch (e) {
      if (token === generation.current) {
        setStatus("offline");
        setErrors({ connection: e.message });
      }
    }
  }
  useEffect(() => {
    localStorage.setItem(PREFIX + "-mode", JSON.stringify(mode));
    localStorage.setItem(PREFIX + "-base", JSON.stringify(base));
    if (mode === "api") connect();
    else {
      generation.current++;
      setStatus("local");
      setErrors({});
      setDB({ ...emptyDB(), ...read("-local", {}) });
    }
    return () => {
      generation.current++;
    };
  }, [mode, base]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.motion ? "on" : "off";
    localStorage.setItem(PREFIX + "-prefs", JSON.stringify(preferences));
  }, [preferences]);
  function itemPath(key, item) {
    const path = pathFor(key);
    const template = Object.keys(client.current.doc?.paths || {}).find(
      (p) => p.startsWith(path + "/") && /^\{[^}]+\}\/?$/.test(p.slice(path.length + 1))
    );
    if (template)
      return template.replace(
        /\{([^}]+)\}/g,
        (_, param) => encodeURIComponent(
          item[param] ?? (param === "mes" ? item.mes : item.id)
        )
      );
    return path + "/" + encodeURIComponent(item.id ?? item.mes);
  }
  function saveRoute(key, item = {}) {
    const basePath = pathFor(key);
    let path = item.id ? itemPath(key, item) : basePath;
    if (!item.id && client.current.doc && !["POST", "PUT"].some(
      (method) => client.current.operation(basePath, method)
    )) {
      const template = Object.keys(client.current.doc.paths).find(
        (p) => p.startsWith(basePath + "/") && /^\{[^}]+\}\/?$/.test(p.slice(basePath.length + 1)) && client.current.operation(p, "PUT")
      );
      if (template)
        path = template.replace(
          /\{([^}]+)\}/g,
          (_, param) => item[param] != null ? encodeURIComponent(item[param]) : `{${param}}`
        );
    }
    return {
      path,
      method: client.current.method(
        path,
        item.id ? ["PATCH", "PUT"] : ["POST", "PUT"]
      )
    };
  }
  async function mutate(key, action2, payload) {
    try {
      let result;
      if (modeRef.current === "local") {
        const next = localMutation(dbRef.current, key, action2, payload);
        persist(next.db);
        result = next.row;
      } else {
        if (status !== "online")
          throw Error(
            "Conect\xE1 la API antes de guardar. Tus datos no se guardaron."
          );
        const target = saveRoute(key, payload);
        const path = action2 === "record" ? `/habitos/${encodeURIComponent(payload.habito_id)}/registro` : action2 === "delete" ? itemPath(key, payload) : target.path;
        const method = action2 === "delete" ? "DELETE" : action2 === "record" ? "PUT" : target.method;
        const body = { ...payload };
        delete body.id;
        delete body.creado_en;
        delete body.actualizado_en;
        if (action2 === "record") delete body.habito_id;
        for (const param of client.current.operation(path, method)?.parameters || [])
          if (param.in === "path") delete body[param.name];
        result = await client.current.save(
          path,
          method,
          action2 === "delete" ? void 0 : body
        );
        await refresh(key);
        if (["movimientos", "transacciones", "objetivos"].includes(key))
          await Promise.all(
            ["cuentas", "instrumentos", "finCategorias"].map((k) => refresh(k))
          );
      }
      notify(
        action2 === "delete" ? "Eliminado correctamente" : action2 === "record" ? "Progreso registrado" : "Guardado correctamente"
      );
      return result;
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  async function configSave(key, value) {
    try {
      if (modeRef.current === "local")
        persist({ ...dbRef.current, [key]: value });
      else {
        const path = key === "config" ? "/fin/config" : "/settings";
        await client.current.save(
          path,
          client.current.method(path, ["PUT", "PATCH"]),
          value
        );
        setDB((d) => ({ ...d, [key]: value }));
      }
      notify("Preferencias guardadas");
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  async function action(path, method = "GET", body, filename) {
    try {
      if (modeRef.current !== "api")
        throw Error("Esta funci\xF3n requiere conexi\xF3n con la API de SGR.");
      const value = await client.current.request(
        path,
        method,
        body,
        filename ? { blob: true } : {}
      );
      if (filename) download(value, filename);
      else notify("Operaci\xF3n completada");
      return value;
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  const setMode = (value) => {
    setModal(null);
    setModeState(value);
  };
  const seed = () => {
    if (modeRef.current !== "local")
      throw Error("Los ejemplos solo est\xE1n disponibles en el espacio local.");
    if (Object.keys(resources).some((k) => (dbRef.current[k] || []).length))
      throw Error(
        "Los ejemplos solo se pueden cargar en un espacio local vac\xEDo."
      );
    persist(sampleDB());
    notify("Ejemplos cargados en tu espacio local");
  };
  const importLocal = (value) => {
    if (modeRef.current !== "local")
      throw Error(
        "La restauraci\xF3n JSON solo est\xE1 disponible en el espacio local."
      );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("El archivo no contiene un espacio SGR v\xE1lido.");
    for (const key of Object.keys(resources)) {
      if (!Array.isArray(value[key])) throw Error(`Falta la colecci\xF3n ${key}.`);
      if (value[key].some(
        (row) => !row || typeof row !== "object" || Array.isArray(row) || row.id == null
      ))
        throw Error(`La colecci\xF3n ${key} contiene un elemento inv\xE1lido.`);
    }
    for (const key of ["config", "settings"])
      if (value[key] && (typeof value[key] !== "object" || Array.isArray(value[key])))
        throw Error(`El campo ${key} no es v\xE1lido.`);
    persist({ ...emptyDB(), ...value });
    notify("Espacio local restaurado");
  };
  return /* @__PURE__ */ jsx(
    Context.Provider,
    {
      value: {
        db,
        mode,
        setMode,
        base,
        setBase,
        status,
        errors,
        refresh,
        connect,
        mutate,
        action,
        configSave,
        client: client.current,
        pathFor,
        itemPath,
        saveRoute,
        notify,
        toast,
        setToast,
        modal,
        setModal,
        preferences,
        setPrefs,
        seed,
        importLocal
      },
      children
    }
  );
}
var Context, PREFIX, useApp;
var init_store = __esm({
  "src/store.jsx"() {
    init_api();
    init_local();
    init_resources();
    init_domain();
    Context = createContext(null);
    PREFIX = "sgr-orbita-v1";
    useApp = () => useContext(Context);
  }
});

// src/RichEditor.jsx
var RichEditor_exports = {};
__export(RichEditor_exports, {
  default: () => RichEditor
});
import React2, { useEffect as useEffect2, useState as useState2 } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo,
  Redo,
  Check
} from "lucide-react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function RichEditor({ value, onChange, label = "Apuntes" }) {
  const [link, setLink] = useState2(null), [error, setError] = useState2("");
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }
      }),
      Placeholder.configure({ placeholder: "Dale forma a tu idea\u2026" })
    ],
    content: DOMPurify.sanitize(value || ""),
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true"
      }
    },
    onUpdate: ({ editor: editor2 }) => onChange(editor2.getHTML()),
    immediatelyRender: false
  });
  useEffect2(() => {
    if (editor && value !== editor.getHTML())
      editor.commands.setContent(DOMPurify.sanitize(value || ""), false);
  }, [value, editor]);
  if (!editor)
    return /* @__PURE__ */ jsx2(
      "textarea",
      {
        "aria-label": label,
        rows: 5,
        value,
        onChange: (e) => onChange(e.target.value)
      }
    );
  const controls = [
    ["Negrita", Bold, () => editor.chain().focus().toggleBold().run(), "bold"],
    [
      "Cursiva",
      Italic,
      () => editor.chain().focus().toggleItalic().run(),
      "italic"
    ],
    [
      "Subt\xEDtulo",
      Heading2,
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      "heading"
    ],
    [
      "Lista",
      List,
      () => editor.chain().focus().toggleBulletList().run(),
      "bulletList"
    ],
    [
      "Lista numerada",
      ListOrdered,
      () => editor.chain().focus().toggleOrderedList().run(),
      "orderedList"
    ],
    [
      "Cita",
      Quote,
      () => editor.chain().focus().toggleBlockquote().run(),
      "blockquote"
    ],
    [
      "Insertar enlace",
      Link2,
      () => setLink(editor.getAttributes("link").href || ""),
      "link"
    ],
    ["Deshacer", Undo, () => editor.chain().focus().undo().run()],
    ["Rehacer", Redo, () => editor.chain().focus().redo().run()]
  ];
  return /* @__PURE__ */ jsxs("div", { className: "rich-editor", children: [
    /* @__PURE__ */ jsx2(
      "div",
      {
        className: "editor-toolbar",
        role: "toolbar",
        "aria-label": "Formato de apuntes",
        children: controls.map(([name, Icon, command, active]) => /* @__PURE__ */ jsx2(
          "button",
          {
            type: "button",
            "aria-label": name,
            title: name,
            "aria-pressed": active ? editor.isActive(active) : void 0,
            onMouseDown: (e) => e.preventDefault(),
            onClick: command,
            children: /* @__PURE__ */ jsx2(Icon, { size: 15 })
          },
          name
        ))
      }
    ),
    link !== null && /* @__PURE__ */ jsxs("div", { className: "editor-link", children: [
      /* @__PURE__ */ jsx2(
        "input",
        {
          "aria-label": "Direcci\xF3n del enlace",
          type: "url",
          placeholder: "https://\u2026",
          value: link,
          onChange: (e) => setLink(e.target.value)
        }
      ),
      /* @__PURE__ */ jsx2(
        "button",
        {
          type: "button",
          "aria-label": "Aplicar enlace",
          onClick: () => {
            if (!link) {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setLink(null);
              return;
            }
            const url = safeURL(link);
            if (!url || !/^https?:\/\//.test(link)) {
              setError("Ingres\xE1 un enlace HTTP o HTTPS.");
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            setLink(null);
            setError("");
          },
          children: /* @__PURE__ */ jsx2(Check, { size: 16 })
        }
      )
    ] }),
    error && /* @__PURE__ */ jsx2("small", { className: "negative", children: error }),
    /* @__PURE__ */ jsx2(EditorContent, { editor })
  ] });
}
var init_RichEditor = __esm({
  "src/RichEditor.jsx"() {
    init_domain();
  }
});

// src/ui.jsx
import React3, { useEffect as useEffect3, useRef as useRef2, useState as useState3, lazy, Suspense } from "react";
import {
  X,
  Plus,
  ArrowUpRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
  Check as Check2,
  LoaderCircle,
  AlertCircle,
  Inbox,
  ChevronDown,
  MoreHorizontal
} from "lucide-react";
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function Button({
  children,
  icon: Icon,
  variant = "",
  className = "",
  ...props
}) {
  return /* @__PURE__ */ jsxs2("button", { className: `button ${variant} ${className}`, ...props, children: [
    Icon && /* @__PURE__ */ jsx3(Icon, { size: 16 }),
    /* @__PURE__ */ jsx3("span", { children })
  ] });
}
function IconButton({ icon: Icon, label, ...props }) {
  return /* @__PURE__ */ jsx3("button", { className: "icon-button", "aria-label": label, title: label, ...props, children: /* @__PURE__ */ jsx3(Icon, { size: 17 }) });
}
function Pill({ children, color }) {
  return /* @__PURE__ */ jsx3("span", { className: "pill", style: color ? { "--pill": color } : {}, children });
}
function SectionTitle({ eyebrow, title: heading, children }) {
  return /* @__PURE__ */ jsxs2("div", { className: "section-heading", children: [
    /* @__PURE__ */ jsxs2("div", { children: [
      eyebrow && /* @__PURE__ */ jsx3("div", { className: "eyebrow", children: eyebrow }),
      /* @__PURE__ */ jsx3("h2", { children: heading })
    ] }),
    /* @__PURE__ */ jsx3("div", { className: "inline", children })
  ] });
}
function Empty({
  icon: Icon = Inbox,
  title: heading = "Todo empieza con una idea.",
  text = "Cre\xE1 tu primer elemento y hac\xE9 lugar para lo que viene.",
  action,
  onAction
}) {
  return /* @__PURE__ */ jsxs2("div", { className: "empty", children: [
    /* @__PURE__ */ jsxs2("div", { className: "empty-orbit", children: [
      /* @__PURE__ */ jsx3(Icon, { size: 27 }),
      /* @__PURE__ */ jsx3("i", {}),
      /* @__PURE__ */ jsx3("i", {})
    ] }),
    /* @__PURE__ */ jsx3("h3", { children: heading }),
    /* @__PURE__ */ jsx3("p", { children: text }),
    action && /* @__PURE__ */ jsx3(Button, { icon: Plus, onClick: onAction, children: action })
  ] });
}
function Tabs({ items, value, onChange }) {
  return /* @__PURE__ */ jsx3("div", { className: "tabs", role: "tablist", children: items.map(([key, label, Icon]) => /* @__PURE__ */ jsxs2(
    "button",
    {
      role: "tab",
      "aria-selected": value === key,
      className: value === key ? "active" : "",
      onClick: () => onChange(key),
      children: [
        Icon && /* @__PURE__ */ jsx3(Icon, { size: 15 }),
        /* @__PURE__ */ jsx3("span", { children: label })
      ]
    },
    key
  )) });
}
function Progress({ value, color }) {
  return /* @__PURE__ */ jsx3(
    "div",
    {
      className: "progress",
      role: "progressbar",
      "aria-label": "Progreso",
      "aria-valuenow": Math.round(value) || 0,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      children: /* @__PURE__ */ jsx3(
        "span",
        {
          style: {
            width: `${Math.max(0, Math.min(100, value || 0))}%`,
            background: color
          }
        }
      )
    }
  );
}
function Stat({ label, value, foot, icon: Icon, color }) {
  return /* @__PURE__ */ jsxs2("div", { className: "stat", style: { "--stat-color": color || "var(--lime)" }, children: [
    /* @__PURE__ */ jsxs2("div", { className: "stat-label", children: [
      label,
      Icon && /* @__PURE__ */ jsx3(Icon, { size: 17 })
    ] }),
    /* @__PURE__ */ jsx3("strong", { children: value }),
    foot && /* @__PURE__ */ jsx3("span", { className: "stat-foot", children: foot })
  ] });
}
function SearchBox({
  value,
  onChange,
  placeholder = "Buscar...",
  ...rest
}) {
  return /* @__PURE__ */ jsxs2("div", { className: "search-box", children: [
    /* @__PURE__ */ jsx3(Search, { size: 17 }),
    /* @__PURE__ */ jsx3(
      "input",
      {
        "aria-label": placeholder,
        value,
        onChange: (e) => onChange(e.target.value),
        placeholder,
        ...rest
      }
    ),
    value && /* @__PURE__ */ jsx3("button", { "aria-label": "Limpiar b\xFAsqueda", onClick: () => onChange(""), children: /* @__PURE__ */ jsx3(X, { size: 14 }) })
  ] });
}
function MonthPicker({ value, onChange }) {
  const move = (n) => {
    const d = /* @__PURE__ */ new Date(value + "-01T12:00:00");
    d.setMonth(d.getMonth() + n);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return /* @__PURE__ */ jsxs2("div", { className: "date-picker", children: [
    /* @__PURE__ */ jsx3(
      IconButton,
      {
        icon: ChevronLeft,
        label: "Mes anterior",
        onClick: () => move(-1)
      }
    ),
    /* @__PURE__ */ jsx3(
      "input",
      {
        type: "month",
        value,
        "aria-label": "Mes seleccionado",
        onChange: (e) => e.target.value && onChange(e.target.value)
      }
    ),
    /* @__PURE__ */ jsx3(
      IconButton,
      {
        icon: ChevronRight,
        label: "Mes siguiente",
        onClick: () => move(1)
      }
    )
  ] });
}
function Modal({ title: heading, children, onClose, wide = false }) {
  const ref = useRef2();
  const closeRef = useRef2(onClose);
  closeRef.current = onClose;
  const savedFocus = useRef2(document.activeElement);
  useEffect3(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = () => (ref.current?.querySelector(
      'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
    ) || ref.current?.querySelector("button"))?.focus();
    focus();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = [
          ...ref.current.querySelectorAll(
            'button,input,textarea,select,a[href],[tabindex="0"],[contenteditable="true"]'
          )
        ].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!items.length) {
          e.preventDefault();
          return;
        }
        const first = items[0], last = items.at(-1);
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
  return /* @__PURE__ */ jsx3(
    "div",
    {
      className: "modal-backdrop",
      onMouseDown: (e) => e.target === e.currentTarget && onClose(),
      children: /* @__PURE__ */ jsxs2(
        "div",
        {
          ref,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "modal-title",
          className: `modal ${wide ? "wide" : ""}`,
          children: [
            /* @__PURE__ */ jsxs2("header", { children: [
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx3("span", { className: "eyebrow", children: "SGR / TU ESPACIO" }),
                /* @__PURE__ */ jsx3("h2", { id: "modal-title", children: heading })
              ] }),
              /* @__PURE__ */ jsx3(IconButton, { icon: X, label: "Cerrar", onClick: onClose })
            ] }),
            children
          ]
        }
      )
    }
  );
}
function ErrorNotice({ keys }) {
  const { errors, refresh } = useApp();
  const active = keys.filter((k) => errors[k]);
  if (!active.length) return null;
  return /* @__PURE__ */ jsxs2("div", { className: "error-notice", children: [
    /* @__PURE__ */ jsx3(AlertCircle, { size: 18 }),
    /* @__PURE__ */ jsx3("div", { children: active.map((k) => /* @__PURE__ */ jsxs2("p", { children: [
      /* @__PURE__ */ jsxs2("strong", { children: [
        resources[k]?.plural || k,
        ":"
      ] }),
      " ",
      errors[k]
    ] }, k)) }),
    /* @__PURE__ */ jsx3(Button, { onClick: () => active.forEach((k) => refresh(k)), children: "Reintentar" })
  ] });
}
function EditActions({ resource, item }) {
  const { setModal } = useApp();
  return /* @__PURE__ */ jsxs2("div", { className: "row-actions", children: [
    /* @__PURE__ */ jsx3(
      IconButton,
      {
        icon: Pencil,
        label: `Editar ${title(item)}`,
        onClick: () => setModal({ type: "form", resource, item })
      }
    ),
    /* @__PURE__ */ jsx3(
      IconButton,
      {
        icon: Trash2,
        label: `Eliminar ${title(item)}`,
        onClick: () => setModal({ type: "delete", resource, item })
      }
    )
  ] });
}
function Manager({ resource }) {
  const { db, setModal } = useApp();
  const def = resources[resource];
  return /* @__PURE__ */ jsxs2(Modal, { title: def.plural, onClose: () => setModal(null), children: [
    /* @__PURE__ */ jsxs2("div", { className: "modal-body", children: [
      /* @__PURE__ */ jsx3(ErrorNotice, { keys: [resource] }),
      /* @__PURE__ */ jsxs2("div", { className: "manager-list", children: [
        db[resource].map((item, i) => /* @__PURE__ */ jsxs2("div", { className: "manager-row", children: [
          /* @__PURE__ */ jsx3(
            "span",
            {
              className: "color-dot",
              style: { background: item.color || PALETTE[i % 6] }
            }
          ),
          /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx3("strong", { children: title(item) }),
            /* @__PURE__ */ jsx3("small", { children: item.tipo || item.fecha || item.mes || "" })
          ] }),
          /* @__PURE__ */ jsx3(EditActions, { resource, item })
        ] }, item.id)),
        !db[resource].length && /* @__PURE__ */ jsx3("p", { className: "muted", children: "Todav\xEDa no hay elementos." })
      ] })
    ] }),
    /* @__PURE__ */ jsx3("footer", { children: /* @__PURE__ */ jsxs2(
      Button,
      {
        icon: Plus,
        variant: "primary",
        onClick: () => setModal({ type: "form", resource }),
        children: [
          "Agregar ",
          def.label
        ]
      }
    ) })
  ] });
}
function schemaFields(resource, item, app) {
  const def = resources[resource];
  if (app.mode !== "api" || !app.client.doc) return def.fields;
  const { path, method } = app.saveRoute(resource, item);
  const schema = app.client.bodySchema(path, method);
  if (!schema.properties) return def.fields;
  const fields = Object.entries(schema.properties).filter(
    ([k, p]) => !p.readOnly && ![
      "id",
      "creado_en",
      "actualizado_en",
      "vault_id",
      "mtime",
      "has_transactions"
    ].includes(k)
  ).map(([key, value]) => {
    const p = resolveSchema(value, app.client.doc);
    const known = def.fields.find((f2) => f2.key === key);
    let type = p.enum ? "select" : p.type === "boolean" ? "checkbox" : ["number", "integer"].includes(p.type) ? "number" : p.format === "date" ? "date" : p.format === "date-time" ? "datetime-local" : p.type === "object" || p.type === "array" ? "json" : "text";
    if (known) type = known.type;
    if (p.enum) type = "select";
    const source = key === "cuenta_nombre" ? "cuentas" : key === "categoria_nombre" ? "finCategorias" : null;
    return {
      ...known,
      key,
      label: known?.label || labels[key] || key.replaceAll("_", " "),
      type: source ? "relation" : type,
      source: source || known?.source,
      nameValue: !!source,
      required: (schema.required || []).includes(key),
      options: p.enum || known?.options,
      default: p.enum && !p.enum.includes(p.default ?? known?.default) ? p.enum.includes(
        { gasto: "expense", ingreso: "income" }[known?.default]
      ) ? { gasto: "expense", ingreso: "income" }[known?.default] : p.enum[0] : p.default ?? known?.default,
      min: p.minimum ?? known?.min,
      max: p.maximum ?? known?.max,
      schema: p
    };
  });
  for (const param of app.client.operation(path, method)?.parameters || []) {
    if (param.in === "path" && param.name !== "id" && !param.name.endsWith("_id") && !fields.some((f2) => f2.key === param.name)) {
      fields.unshift({
        ...def.fields.find((f2) => f2.key === param.name),
        key: param.name,
        label: def.fields.find((f2) => f2.key === param.name)?.label || param.name,
        type: param.name === "mes" ? "month" : "text",
        required: true
      });
    }
  }
  return fields;
}
function ResourceForm({ resource, item = {}, defaults = {} }) {
  const app = useApp();
  const { db, setModal, mutate } = app;
  const def = resources[resource];
  const fields = schemaFields(resource, item, app);
  const [values, setValues] = useState3(
    () => Object.fromEntries(
      fields.map((f2) => [
        f2.key,
        item[f2.key] ?? defaults[f2.key] ?? (typeof f2.default === "function" ? f2.default() : f2.default) ?? (f2.type === "color" ? PALETTE[0] : f2.type === "checkbox" ? false : f2.type === "weekdays" ? [] : "")
      ])
    )
  );
  const [busy, setBusy] = useState3(false), [error, setError] = useState3("");
  const formRef = useRef2();
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      const data = {};
      for (const f2 of fields) {
        let v = values[f2.key];
        if (v === "" || v == null) {
          if (f2.required) throw Error(`Complet\xE1 ${f2.label.toLowerCase()}.`);
          if (item.id && item[f2.key] != null) data[f2.key] = null;
          continue;
        }
        if (f2.type === "number") v = Number(v);
        if (f2.type === "relation" && !f2.nameValue) {
          const row = db[f2.source]?.find((r) => String(r.id) === String(v));
          v = row?.id ?? v;
        }
        if (f2.type === "json") {
          v = typeof v === "string" ? JSON.parse(v) : v;
          if (f2.schema?.type === "string") v = JSON.stringify(v);
        }
        if (f2.type === "weekdays" && f2.schema?.type === "string")
          v = JSON.stringify(parseArray(v));
        data[f2.key] = v;
      }
      if (data.fecha_inicio && data.fecha_fin && new Date(data.fecha_fin) <= new Date(data.fecha_inicio))
        throw Error("El fin debe ser posterior al inicio.");
      if (data.frecuencia_tipo === "semanal" && !parseArray(data.dias_semana).length)
        throw Error("Eleg\xED al menos un d\xEDa para el h\xE1bito.");
      if (data.frecuencia_tipo === "diario") data.dias_semana = null;
      if (data.se_repite && !data.regla_repeticion)
        throw Error("Configur\xE1 la regla de repetici\xF3n.");
      if (resource === "objetivos" && item.id) delete data.nombre;
      setBusy(true);
      await mutate(resource, "save", {
        ...data,
        ...item.id ? { id: item.id } : {},
        ...item.mes ? { mes: item.mes } : {}
      });
      setModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx3(
    Modal,
    {
      title: `${item.id ? "Editar" : "Crear"} ${def.label}`,
      onClose: () => !busy && setModal(null),
      children: /* @__PURE__ */ jsxs2(
        "form",
        {
          ref: formRef,
          onSubmit: submit,
          onKeyDown: (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              formRef.current.requestSubmit();
            }
          },
          children: [
            /* @__PURE__ */ jsxs2("div", { className: "modal-body", children: [
              /* @__PURE__ */ jsx3("div", { className: "form-grid", children: fields.map((f2) => {
                if (f2.key === "dias_semana" && values.frecuencia_tipo !== "semanal")
                  return null;
                if (f2.key === "regla_repeticion" && !values.se_repite)
                  return null;
                let v = values[f2.key];
                return /* @__PURE__ */ jsxs2(
                  "label",
                  {
                    className: `field ${["textarea", "weekdays", "json"].includes(f2.type) ? "full" : ""} ${f2.type === "checkbox" ? "check-field" : ""}`,
                    children: [
                      /* @__PURE__ */ jsxs2("span", { children: [
                        f2.label,
                        f2.required && /* @__PURE__ */ jsx3("b", { children: " *" })
                      ] }),
                      f2.type === "select" || f2.type === "relation" ? /* @__PURE__ */ jsxs2(
                        "select",
                        {
                          value: v ?? "",
                          required: f2.required,
                          onChange: (e) => set(f2.key, e.target.value),
                          children: [
                            /* @__PURE__ */ jsx3("option", { value: "", children: "Seleccionar\u2026" }),
                            f2.type === "select" ? f2.options.map((o) => /* @__PURE__ */ jsx3("option", { value: o, children: o }, o)) : db[f2.source]?.filter(
                              (r) => String(r.id) !== String(
                                resource === f2.source ? item.id : ""
                              ) && !r.oculta
                            ).map((r) => /* @__PURE__ */ jsx3(
                              "option",
                              {
                                value: f2.nameValue ? r.nombre : r.id,
                                children: title(r)
                              },
                              r.id
                            ))
                          ]
                        }
                      ) : f2.key === "apuntes" ? /* @__PURE__ */ jsx3(
                        Suspense,
                        {
                          fallback: /* @__PURE__ */ jsx3(
                            "textarea",
                            {
                              rows: 5,
                              "aria-label": "Apuntes",
                              value: v,
                              onChange: (e) => set(f2.key, e.target.value)
                            }
                          ),
                          children: /* @__PURE__ */ jsx3(
                            RichEditor2,
                            {
                              label: "Apuntes",
                              value: v,
                              onChange: (value) => set(f2.key, value)
                            }
                          )
                        }
                      ) : f2.type === "textarea" ? /* @__PURE__ */ jsx3(
                        "textarea",
                        {
                          rows: 5,
                          value: v,
                          required: f2.required,
                          onChange: (e) => set(f2.key, e.target.value)
                        }
                      ) : f2.type === "json" && f2.key === "regla_repeticion" ? /* @__PURE__ */ jsx3(Recurrence, { value: v, onChange: (v2) => set(f2.key, v2) }) : f2.type === "json" ? /* @__PURE__ */ jsx3(
                        "textarea",
                        {
                          rows: 3,
                          value: typeof v === "object" ? JSON.stringify(v, null, 2) : v,
                          placeholder: "JSON",
                          required: f2.required,
                          onChange: (e) => set(f2.key, e.target.value)
                        }
                      ) : f2.type === "weekdays" ? /* @__PURE__ */ jsx3("span", { className: "weekday-picker", children: ["D", "L", "M", "X", "J", "V", "S"].map((day, i) => /* @__PURE__ */ jsx3(
                        "button",
                        {
                          type: "button",
                          "aria-label": [
                            "Domingo",
                            "Lunes",
                            "Martes",
                            "Mi\xE9rcoles",
                            "Jueves",
                            "Viernes",
                            "S\xE1bado"
                          ][i],
                          "aria-pressed": parseArray(v).includes(i),
                          className: parseArray(v).includes(i) ? "active" : "",
                          onClick: () => set(
                            f2.key,
                            parseArray(v).includes(i) ? parseArray(v).filter((d) => d !== i) : [...parseArray(v), i]
                          ),
                          children: day
                        },
                        i
                      )) }) : f2.type === "color" ? /* @__PURE__ */ jsxs2("span", { className: "color-picker", children: [
                        PALETTE.map((c) => /* @__PURE__ */ jsx3(
                          "button",
                          {
                            "aria-label": `Color ${c}`,
                            "aria-pressed": v === c,
                            type: "button",
                            style: { background: c },
                            onClick: () => set(f2.key, c),
                            children: v === c && /* @__PURE__ */ jsx3(Check2, { size: 16 })
                          },
                          c
                        )),
                        /* @__PURE__ */ jsx3(
                          "input",
                          {
                            "aria-label": "Color personalizado",
                            type: "color",
                            value: v || PALETTE[0],
                            onChange: (e) => set(f2.key, e.target.value)
                          }
                        )
                      ] }) : f2.type === "checkbox" ? /* @__PURE__ */ jsx3(
                        "input",
                        {
                          type: "checkbox",
                          checked: !!v,
                          onChange: (e) => set(f2.key, e.target.checked)
                        }
                      ) : /* @__PURE__ */ jsx3(
                        "input",
                        {
                          type: f2.type,
                          value: f2.type === "datetime-local" ? String(v).slice(0, 16) : v ?? "",
                          disabled: resource === "objetivos" && !!item.id && f2.key === "nombre",
                          min: f2.min,
                          max: f2.max,
                          step: f2.type === "number" ? "any" : void 0,
                          required: f2.required,
                          onChange: (e) => set(f2.key, e.target.value)
                        }
                      ),
                      f2.type === "relation" && !db[f2.source]?.length && /* @__PURE__ */ jsxs2("small", { children: [
                        "Primero cre\xE1 un elemento en",
                        " ",
                        resources[f2.source]?.plural.toLowerCase(),
                        "."
                      ] })
                    ]
                  },
                  f2.key
                );
              }) }),
              resource === "hojas" && /* @__PURE__ */ jsx3(
                Upload,
                {
                  onURL: (url) => {
                    set("contenido", url);
                    set("tipo", "foto");
                  }
                }
              ),
              error && /* @__PURE__ */ jsx3("div", { role: "alert", className: "form-error", children: error })
            ] }),
            /* @__PURE__ */ jsxs2("footer", { children: [
              /* @__PURE__ */ jsx3("span", { className: "shortcut-hint", children: "Ctrl + Enter para guardar" }),
              /* @__PURE__ */ jsx3(Button, { type: "button", onClick: () => setModal(null), disabled: busy, children: "Cancelar" }),
              /* @__PURE__ */ jsx3(
                Button,
                {
                  type: "submit",
                  variant: "primary",
                  icon: busy ? LoaderCircle : Check2,
                  disabled: busy,
                  children: busy ? "Guardando\u2026" : "Guardar"
                }
              )
            ] })
          ]
        }
      )
    }
  );
}
function Recurrence({ value, onChange }) {
  let v = { tipo: "semanal", hasta: today() };
  try {
    v = {
      ...v,
      ...typeof value === "string" ? JSON.parse(value || "{}") : value
    };
  } catch {
  }
  return /* @__PURE__ */ jsxs2("span", { className: "recurrence", children: [
    /* @__PURE__ */ jsx3(
      "select",
      {
        "aria-label": "Frecuencia de repetici\xF3n",
        value: v.tipo,
        onChange: (e) => onChange(JSON.stringify({ ...v, tipo: e.target.value })),
        children: ["diario", "semanal", "mensual"].map((x) => /* @__PURE__ */ jsx3("option", { children: x }, x))
      }
    ),
    /* @__PURE__ */ jsx3(
      "input",
      {
        "aria-label": "Repetir hasta",
        type: "date",
        min: today(),
        value: v.hasta,
        onChange: (e) => onChange(JSON.stringify({ ...v, hasta: e.target.value }))
      }
    )
  ] });
}
function Upload({ onURL }) {
  const app = useApp();
  const [busy, setBusy] = useState3(false);
  return /* @__PURE__ */ jsxs2("label", { className: "upload-control", children: [
    /* @__PURE__ */ jsx3("span", { children: busy ? "Subiendo\u2026" : "Adjuntar imagen" }),
    /* @__PURE__ */ jsx3(
      "input",
      {
        type: "file",
        accept: "image/*",
        disabled: busy,
        onChange: async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            app.notify("Us\xE1 una imagen de menos de 5 MB.", "error");
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
              if (!url) throw Error("La API no devolvi\xF3 la URL del archivo.");
              onURL(url);
              setBusy(false);
            }
          } catch (e2) {
            app.notify(e2.message, "error");
            setBusy(false);
          }
        }
      }
    )
  ] });
}
function DeleteModal({ resource, item }) {
  const { setModal, mutate } = useApp();
  const [busy, setBusy] = useState3(false), [error, setError] = useState3("");
  return /* @__PURE__ */ jsxs2(
    Modal,
    {
      title: `Eliminar ${resources[resource].label}`,
      onClose: () => !busy && setModal(null),
      children: [
        /* @__PURE__ */ jsxs2("div", { className: "modal-body", children: [
          /* @__PURE__ */ jsx3("div", { className: "delete-icon", children: /* @__PURE__ */ jsx3(Trash2, { size: 28 }) }),
          /* @__PURE__ */ jsxs2("h3", { children: [
            "\xBFEliminar \xAB",
            title(item),
            "\xBB?"
          ] }),
          /* @__PURE__ */ jsx3("p", { className: "muted", children: resource === "hojas" ? "En el sistema conectado, la nota se mueve a la papelera de la B\xF3veda." : "Esta acci\xF3n elimina el elemento y no se puede deshacer desde esta pantalla." }),
          ["calendarios", "habitos", "instrumentos"].includes(resource) && /* @__PURE__ */ jsxs2("p", { className: "form-error", children: [
            "Tambi\xE9n se eliminar\xE1n sus",
            " ",
            resource === "calendarios" ? "eventos" : resource === "habitos" ? "registros" : "transacciones",
            " ",
            "asociados."
          ] }),
          error && /* @__PURE__ */ jsx3("p", { role: "alert", className: "form-error", children: error })
        ] }),
        /* @__PURE__ */ jsxs2("footer", { children: [
          /* @__PURE__ */ jsx3(Button, { onClick: () => setModal(null), disabled: busy, children: "Cancelar" }),
          /* @__PURE__ */ jsx3(
            Button,
            {
              variant: "danger",
              disabled: busy,
              onClick: async () => {
                setBusy(true);
                try {
                  await mutate(resource, "delete", item);
                  setModal(null);
                } catch (e) {
                  setError(e.message);
                  setBusy(false);
                }
              },
              children: busy ? "Eliminando\u2026" : "S\xED, eliminar"
            }
          )
        ] })
      ]
    }
  );
}
function GlobalModals() {
  const { modal } = useApp();
  if (!modal) return null;
  if (modal.type === "form")
    return /* @__PURE__ */ jsx3(
      ResourceForm,
      {
        ...modal
      },
      `${modal.resource}-${modal.item?.id || "new"}`
    );
  if (modal.type === "delete") return /* @__PURE__ */ jsx3(DeleteModal, { ...modal });
  if (modal.type === "manager") return /* @__PURE__ */ jsx3(Manager, { ...modal });
  return null;
}
var RichEditor2;
var init_ui = __esm({
  "src/ui.jsx"() {
    init_store();
    init_resources();
    init_api();
    init_domain();
    RichEditor2 = lazy(() => Promise.resolve().then(() => (init_RichEditor(), RichEditor_exports)));
  }
});

// src/Boveda.jsx
var Boveda_exports = {};
__export(Boveda_exports, {
  default: () => Boveda
});
import React4, { useEffect as useEffect4, useMemo, useRef as useRef3, useState as useState4 } from "react";
import DOMPurify2 from "dompurify";
import {
  Network,
  LayoutGrid,
  Plus as Plus2,
  ArrowUpRight as ArrowUpRight2,
  Folder,
  FileText,
  Link as Link3,
  Image,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize,
  MoveUpRight,
  Search as Search2,
  Sparkles,
  RefreshCw,
  ChevronRight as ChevronRight2,
  ArrowLeft,
  Clock,
  ExternalLink
} from "lucide-react";
import { Fragment, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function Boveda({ noteId, navigate }) {
  const app = useApp();
  const { db, setModal, mode } = app;
  const [query, setQuery] = useState4(""), [category, setCategory] = useState4("all"), [type, setType] = useState4("all"), [view, setView] = useState4("graph"), [selected, setSelected] = useState4(noteId || null), [semantic, setSemantic] = useState4(null), [searching, setSearching] = useState4(false);
  useEffect4(() => {
    if (noteId) setSelected(noteId);
  }, [noteId]);
  const descendants = useMemo(() => {
    const ids = /* @__PURE__ */ new Set([String(category)]);
    for (let i = 0; i < db.categorias.length; i++)
      for (const c of db.categorias)
        if (ids.has(String(c.padre_id))) ids.add(String(c.id));
    return ids;
  }, [category, db.categorias]);
  const notes = (semantic || db.hojas).filter(
    (n) => (category === "all" || descendants.has(String(n.categoria_id))) && (type === "all" || n.tipo === type) && (!query || semantic || `${title(n)} ${plain(n.contenido)} ${plain(n.apuntes)}`.toLowerCase().includes(query.toLowerCase()))
  );
  const chosen = db.hojas.find((n) => String(n.id) === String(selected));
  const create = () => setModal({
    type: "form",
    resource: "hojas",
    defaults: category === "all" ? {} : { categoria_id: category }
  });
  return /* @__PURE__ */ jsxs3("div", { className: "page boveda-page", children: [
    /* @__PURE__ */ jsxs3("div", { className: "page-intro", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsxs3("div", { className: "eyebrow", children: [
          /* @__PURE__ */ jsx4("span", { className: "live-dot" }),
          " TU SEGUNDA MENTE"
        ] }),
        /* @__PURE__ */ jsxs3("h1", { children: [
          "Las ideas ",
          /* @__PURE__ */ jsx4("em", { children: "se conectan." })
        ] }),
        /* @__PURE__ */ jsx4("p", { children: "Un lugar para guardar lo que descubr\xEDs. Y descubrir lo que conect\xE1s." })
      ] }),
      /* @__PURE__ */ jsx4(Button, { variant: "primary", icon: Plus2, onClick: create, children: "Capturar una idea" })
    ] }),
    /* @__PURE__ */ jsx4(ErrorNotice, { keys: ["categorias", "hojas"] }),
    /* @__PURE__ */ jsxs3("div", { className: "vault-layout", children: [
      /* @__PURE__ */ jsxs3("aside", { className: "collection-panel", children: [
        /* @__PURE__ */ jsxs3("div", { className: "panel-label", children: [
          "MI B\xD3VEDA",
          " ",
          /* @__PURE__ */ jsx4(
            IconButton,
            {
              icon: Plus2,
              label: "Crear colecci\xF3n",
              onClick: () => setModal({ type: "form", resource: "categorias" })
            }
          )
        ] }),
        /* @__PURE__ */ jsx4(
          SearchBox,
          {
            value: query,
            onChange: (v) => {
              setQuery(v);
              setSemantic(null);
            },
            placeholder: "Buscar una idea\u2026"
          }
        ),
        /* @__PURE__ */ jsxs3(
          "button",
          {
            className: `collection-row ${category === "all" ? "active" : ""}`,
            onClick: () => setCategory("all"),
            children: [
              /* @__PURE__ */ jsx4(Network, { size: 18 }),
              /* @__PURE__ */ jsx4("span", { children: "Todo mi universo" }),
              /* @__PURE__ */ jsx4("b", { children: db.hojas.length })
            ]
          }
        ),
        /* @__PURE__ */ jsx4("div", { className: "small-label", children: "COLECCIONES" }),
        /* @__PURE__ */ jsx4(
          CategoryTree,
          {
            categories: db.categorias,
            notes: db.hojas,
            selected: category,
            select: setCategory
          }
        ),
        !db.categorias.length && /* @__PURE__ */ jsx4("p", { className: "muted small", children: "Organiz\xE1 tu conocimiento en colecciones." }),
        /* @__PURE__ */ jsxs3(
          "button",
          {
            className: "text-button",
            onClick: () => setModal({ type: "form", resource: "categorias" }),
            children: [
              /* @__PURE__ */ jsx4(Plus2, { size: 15 }),
              "Nueva colecci\xF3n"
            ]
          }
        ),
        /* @__PURE__ */ jsxs3("div", { className: "collection-bottom", children: [
          /* @__PURE__ */ jsx4("div", { className: "small-label", children: "TIPO DE CONTENIDO" }),
          [
            ["all", "Todos", Network],
            ["texto", "Notas", FileText],
            ["link", "Enlaces", Link3],
            ["foto", "Im\xE1genes", Image]
          ].map(([key, label, Icon]) => /* @__PURE__ */ jsxs3(
            "button",
            {
              className: `filter-row ${type === key ? "active" : ""}`,
              onClick: () => setType(key),
              children: [
                /* @__PURE__ */ jsx4(Icon, { size: 15 }),
                label,
                type === key && /* @__PURE__ */ jsx4("span", { className: "color-dot" })
              ]
            },
            key
          )),
          /* @__PURE__ */ jsxs3(
            "button",
            {
              className: "text-button",
              onClick: () => setModal({ type: "manager", resource: "categorias" }),
              children: [
                /* @__PURE__ */ jsx4(SlidersHorizontal, { size: 14 }),
                "Administrar colecciones"
              ]
            }
          ),
          mode === "api" && /* @__PURE__ */ jsxs3(Fragment, { children: [
            /* @__PURE__ */ jsx4(
              Button,
              {
                icon: Sparkles,
                disabled: !query || searching,
                onClick: async () => {
                  setSearching(true);
                  try {
                    const result = await app.action(
                      `/hojas/buscar-semantico?q=${encodeURIComponent(query)}&top_k=30`
                    );
                    const list = Array.isArray(result) ? result : result.results || result.resultados || result.hojas || [];
                    setSemantic(list.map((r) => r.hoja || r));
                  } catch {
                  } finally {
                    setSearching(false);
                  }
                },
                children: searching ? "Buscando\u2026" : "B\xFAsqueda sem\xE1ntica"
              }
            ),
            /* @__PURE__ */ jsxs3(
              "button",
              {
                className: "text-button",
                onClick: () => app.action("/hojas/reindexar", "POST").catch(() => {
                }),
                children: [
                  /* @__PURE__ */ jsx4(RefreshCw, { size: 13 }),
                  "Reindexar B\xF3veda"
                ]
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("section", { className: "vault-main", children: [
        /* @__PURE__ */ jsxs3("div", { className: "canvas-toolbar", children: [
          /* @__PURE__ */ jsxs3("div", { className: "inline", children: [
            /* @__PURE__ */ jsx4("span", { className: "color-dot" }),
            /* @__PURE__ */ jsx4("strong", { children: category === "all" ? "Mapa de conocimiento" : db.categorias.find((c) => String(c.id) === String(category))?.nombre }),
            /* @__PURE__ */ jsx4("span", { className: "count", children: notes.length })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "segmented", children: [
            /* @__PURE__ */ jsx4(
              "button",
              {
                "aria-label": "Vista de grafo",
                "aria-pressed": view === "graph",
                className: view === "graph" ? "active" : "",
                onClick: () => setView("graph"),
                children: /* @__PURE__ */ jsx4(Network, { size: 16 })
              }
            ),
            /* @__PURE__ */ jsx4(
              "button",
              {
                "aria-label": "Vista de tarjetas",
                "aria-pressed": view === "grid",
                className: view === "grid" ? "active" : "",
                onClick: () => setView("grid"),
                children: /* @__PURE__ */ jsx4(LayoutGrid, { size: 16 })
              }
            )
          ] })
        ] }),
        view === "graph" ? /* @__PURE__ */ jsx4(
          KnowledgeGraph,
          {
            notes,
            categories: db.categorias,
            selected,
            onSelect: setSelected,
            onCategory: setCategory,
            onCreate: create
          }
        ) : /* @__PURE__ */ jsxs3("div", { className: "note-grid", children: [
          notes.map((n, i) => /* @__PURE__ */ jsx4(
            NoteCard,
            {
              note: n,
              category: db.categorias.find(
                (c) => String(c.id) === String(n.categoria_id)
              ),
              onClick: () => setSelected(n.id),
              index: i
            },
            n.id
          )),
          !notes.length && /* @__PURE__ */ jsx4(
            Empty,
            {
              title: query ? "Ninguna idea coincide." : "Tu pr\xF3xima idea empieza ac\xE1.",
              text: query ? "Prob\xE1 con otra b\xFAsqueda o colecci\xF3n." : "Una nota, un enlace o una imagen. Capturala antes de que se escape.",
              action: "Crear nota",
              onAction: create
            }
          )
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "canvas-caption", children: [
          /* @__PURE__ */ jsxs3("span", { children: [
            /* @__PURE__ */ jsx4("span", { className: "live-dot" }),
            " ",
            semantic ? "RESULTADOS SEM\xC1NTICOS" : "CONOCIMIENTO EN EXPANSI\xD3N"
          ] }),
          /* @__PURE__ */ jsxs3("span", { children: [
            db.categorias.length,
            " colecciones \xB7 ",
            notes.length,
            " conexiones"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("aside", { className: "detail-panel", children: chosen ? /* @__PURE__ */ jsx4(
        NoteDetail,
        {
          note: chosen,
          category: db.categorias.find(
            (c) => String(c.id) === String(chosen.categoria_id)
          ),
          onClose: () => {
            setSelected(null);
            if (noteId) navigate("/");
          }
        }
      ) : /* @__PURE__ */ jsxs3(Fragment, { children: [
        /* @__PURE__ */ jsxs3("div", { className: "panel-label", children: [
          "A MANO ",
          /* @__PURE__ */ jsx4(Sparkles, { size: 16 })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "inspiration-card", children: [
          /* @__PURE__ */ jsx4("span", { className: "tiny-tag", children: "MENOS RUIDO. M\xC1S IDEAS." }),
          /* @__PURE__ */ jsxs3("div", { className: "mini-orbit", children: [
            /* @__PURE__ */ jsx4("i", {}),
            /* @__PURE__ */ jsx4("i", {}),
            /* @__PURE__ */ jsx4("span", { children: "\u2726" })
          ] }),
          /* @__PURE__ */ jsxs3("h3", { children: [
            "Tu pr\xF3ximo gran paso",
            /* @__PURE__ */ jsx4("br", {}),
            "empieza con una nota."
          ] }),
          /* @__PURE__ */ jsxs3("button", { onClick: create, children: [
            "Hac\xE9 espacio para una idea ",
            /* @__PURE__ */ jsx4(ArrowUpRight2, { size: 18 })
          ] })
        ] }),
        /* @__PURE__ */ jsx4(
          SectionTitle,
          {
            title: "Lo m\xE1s reciente",
            eyebrow: "VOLV\xC9 A CONECTAR"
          }
        ),
        [...db.hojas].sort(
          (a, b) => String(b.actualizado_en || b.creado_en).localeCompare(
            String(a.actualizado_en || a.creado_en)
          )
        ).slice(0, 5).map((n, i) => {
          const Icon = typeIcon[n.tipo] || FileText;
          return /* @__PURE__ */ jsxs3(
            "button",
            {
              className: "recent-note",
              onClick: () => setSelected(n.id),
              children: [
                /* @__PURE__ */ jsx4(
                  "span",
                  {
                    className: "note-icon",
                    style: {
                      color: PALETTE[i % 6],
                      background: `${PALETTE[i % 6]}15`
                    },
                    children: /* @__PURE__ */ jsx4(Icon, { size: 18 })
                  }
                ),
                /* @__PURE__ */ jsxs3("span", { children: [
                  /* @__PURE__ */ jsx4("strong", { children: title(n) }),
                  /* @__PURE__ */ jsx4("small", { children: db.categorias.find(
                    (c) => String(c.id) === String(n.categoria_id)
                  )?.nombre || "Sin colecci\xF3n" })
                ] }),
                /* @__PURE__ */ jsx4(ChevronRight2, { size: 14 })
              ]
            },
            n.id
          );
        }),
        !db.hojas.length && /* @__PURE__ */ jsx4("p", { className: "muted small", children: "Tus \xFAltimas notas aparecer\xE1n ac\xE1." }),
        /* @__PURE__ */ jsxs3("div", { className: "vault-tip", children: [
          /* @__PURE__ */ jsx4("span", { children: "\u2197" }),
          /* @__PURE__ */ jsxs3("p", { children: [
            /* @__PURE__ */ jsx4("strong", { children: "Captur\xE1 el momento." }),
            /* @__PURE__ */ jsx4("br", {}),
            "Us\xE1 ",
            /* @__PURE__ */ jsx4("kbd", { children: "N" }),
            " para guardar una idea desde cualquier secci\xF3n."
          ] })
        ] })
      ] }) })
    ] })
  ] });
}
function CategoryTree({
  categories,
  notes,
  selected,
  select,
  parent = null,
  depth = 0,
  visited = /* @__PURE__ */ new Set()
}) {
  if (depth > 8) return null;
  return categories.filter(
    (c) => parent == null ? !c.padre_id : String(c.padre_id) === String(parent)
  ).filter((c) => !visited.has(c.id)).map((c, i) => /* @__PURE__ */ jsxs3(React4.Fragment, { children: [
    /* @__PURE__ */ jsxs3(
      "button",
      {
        className: `collection-row ${String(selected) === String(c.id) ? "active" : ""}`,
        style: {
          paddingLeft: 12 + depth * 14,
          "--collection": c.color || PALETTE[i % 6]
        },
        onClick: () => select(c.id),
        children: [
          /* @__PURE__ */ jsx4(Folder, { size: 17 }),
          /* @__PURE__ */ jsx4("span", { children: c.nombre }),
          /* @__PURE__ */ jsx4("b", { children: notes.filter((n) => String(n.categoria_id) === String(c.id)).length })
        ]
      }
    ),
    /* @__PURE__ */ jsx4(
      CategoryTree,
      {
        categories,
        notes,
        selected,
        select,
        parent: c.id,
        depth: depth + 1,
        visited: /* @__PURE__ */ new Set([...visited, c.id])
      }
    )
  ] }, c.id));
}
function KnowledgeGraph({
  notes,
  categories,
  selected,
  onSelect,
  onCategory,
  onCreate
}) {
  const [zoom, setZoom] = useState4(1), [pan, setPan] = useState4({ x: 0, y: 0 });
  const drag = useRef3(null);
  const groups = useMemo(() => {
    const used = categories.filter(
      (c) => notes.some((n) => String(n.categoria_id) === String(c.id))
    );
    if (notes.some(
      (n) => !categories.some((c) => String(c.id) === String(n.categoria_id))
    ))
      used.push({
        id: "uncategorized",
        nombre: "Sin colecci\xF3n",
        color: PALETTE[5]
      });
    return used.map((c, i) => {
      const angle = i / Math.max(used.length, 1) * Math.PI * 2 - Math.PI / 2;
      return {
        ...c,
        x: 400 + Math.cos(angle) * 222,
        y: 310 + Math.sin(angle) * 188,
        color: c.color || PALETTE[i % 6],
        notes: notes.filter(
          (n) => c.id === "uncategorized" ? !categories.some(
            (cat) => String(cat.id) === String(n.categoria_id)
          ) : String(n.categoria_id) === String(c.id)
        )
      };
    });
  }, [notes, categories]);
  return /* @__PURE__ */ jsxs3("div", { className: "graph-area", children: [
    /* @__PURE__ */ jsxs3(
      "svg",
      {
        className: "knowledge-svg",
        viewBox: "0 0 800 620",
        "aria-label": "Mapa interactivo de conocimiento",
        onPointerDown: (e) => {
          if (e.target.closest("[data-node]")) return;
          drag.current = { x: e.clientX, y: e.clientY, pan };
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: (e) => {
          if (!drag.current) return;
          const ratio = 800 / e.currentTarget.getBoundingClientRect().width;
          setPan({
            x: drag.current.pan.x + (e.clientX - drag.current.x) * ratio,
            y: drag.current.pan.y + (e.clientY - drag.current.y) * ratio
          });
        },
        onPointerUp: () => drag.current = null,
        onPointerCancel: () => drag.current = null,
        children: [
          /* @__PURE__ */ jsxs3("defs", { children: [
            /* @__PURE__ */ jsxs3("radialGradient", { id: "graphGlow", children: [
              /* @__PURE__ */ jsx4("stop", { offset: "0", stopColor: "#a594ff", stopOpacity: ".12" }),
              /* @__PURE__ */ jsx4("stop", { offset: "1", stopColor: "#a594ff", stopOpacity: "0" })
            ] }),
            /* @__PURE__ */ jsx4(
              "pattern",
              {
                id: "graphDots",
                width: "22",
                height: "22",
                patternUnits: "userSpaceOnUse",
                children: /* @__PURE__ */ jsx4("circle", { cx: "1", cy: "1", r: ".8", fill: "currentColor", opacity: ".16" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx4("rect", { width: "800", height: "620", fill: "url(#graphDots)" }),
          /* @__PURE__ */ jsx4("circle", { cx: "400", cy: "310", r: "290", fill: "url(#graphGlow)" }),
          /* @__PURE__ */ jsxs3(
            "g",
            {
              transform: `translate(${400 + pan.x},${310 + pan.y}) scale(${zoom}) translate(-400,-310)`,
              children: [
                /* @__PURE__ */ jsxs3("g", { className: "orbit-rings", fill: "none", children: [
                  /* @__PURE__ */ jsx4("ellipse", { cx: "400", cy: "310", rx: "280", ry: "245" }),
                  /* @__PURE__ */ jsx4("ellipse", { cx: "400", cy: "310", rx: "190", ry: "169" }),
                  /* @__PURE__ */ jsx4("circle", { cx: "400", cy: "310", r: "100" })
                ] }),
                groups.map((g, gi) => /* @__PURE__ */ jsxs3("g", { children: [
                  /* @__PURE__ */ jsx4(
                    "path",
                    {
                      className: "graph-edge",
                      d: `M400 310 Q ${400 + (g.x - 400) * 0.1} ${g.y} ${g.x} ${g.y}`,
                      stroke: g.color
                    }
                  ),
                  g.notes.slice(0, 12).map((n, i) => {
                    const angle = i / Math.min(g.notes.length, 12) * Math.PI * 2 + gi;
                    const radius = 62 + i % 2 * 18;
                    const x = g.x + Math.cos(angle) * radius, y = g.y + Math.sin(angle) * radius;
                    return /* @__PURE__ */ jsxs3("g", { children: [
                      /* @__PURE__ */ jsx4(
                        "line",
                        {
                          className: "graph-edge branch",
                          x1: g.x,
                          y1: g.y,
                          x2: x,
                          y2: y,
                          stroke: g.color
                        }
                      ),
                      /* @__PURE__ */ jsxs3(
                        "g",
                        {
                          "data-node": "true",
                          className: `graph-leaf ${String(selected) === String(n.id) ? "selected" : ""}`,
                          role: "button",
                          tabIndex: "0",
                          "aria-label": title(n),
                          onClick: () => onSelect(n.id),
                          onKeyDown: (e) => {
                            if (["Enter", " "].includes(e.key)) {
                              e.preventDefault();
                              onSelect(n.id);
                            }
                          },
                          children: [
                            /* @__PURE__ */ jsx4("title", { children: title(n) }),
                            /* @__PURE__ */ jsx4(
                              "circle",
                              {
                                cx: x,
                                cy: y,
                                r: "18",
                                fill: g.color,
                                fillOpacity: ".07"
                              }
                            ),
                            /* @__PURE__ */ jsx4("circle", { cx: x, cy: y, r: "6", fill: g.color }),
                            /* @__PURE__ */ jsx4("text", { x, y: y + 27, textAnchor: "middle", children: title(n).length > 21 ? title(n).slice(0, 20) + "\u2026" : title(n) })
                          ]
                        }
                      )
                    ] }, n.id);
                  }),
                  /* @__PURE__ */ jsxs3(
                    "g",
                    {
                      "data-node": "true",
                      role: "button",
                      tabIndex: "0",
                      "aria-label": `Filtrar ${g.nombre}`,
                      className: "graph-group",
                      onClick: () => onCategory(g.id === "uncategorized" ? "all" : g.id),
                      onKeyDown: (e) => {
                        if (e.key === "Enter")
                          onCategory(g.id === "uncategorized" ? "all" : g.id);
                      },
                      children: [
                        /* @__PURE__ */ jsx4(
                          "circle",
                          {
                            cx: g.x,
                            cy: g.y,
                            r: "29",
                            fill: g.color,
                            fillOpacity: ".13",
                            stroke: g.color,
                            strokeOpacity: ".55"
                          }
                        ),
                        /* @__PURE__ */ jsx4(
                          "text",
                          {
                            className: "group-symbol",
                            x: g.x,
                            y: g.y + 7,
                            fill: g.color,
                            textAnchor: "middle",
                            children: ["\u2727", "\u25CE", "\u2318", "\u2726", "\u25C8", "\u2295"][gi % 6]
                          }
                        ),
                        /* @__PURE__ */ jsx4(
                          "rect",
                          {
                            x: g.x - 83,
                            y: g.y + 35,
                            width: "166",
                            height: "28",
                            rx: "9",
                            fill: "var(--panel)"
                          }
                        ),
                        /* @__PURE__ */ jsxs3(
                          "text",
                          {
                            className: "group-label",
                            x: g.x,
                            y: g.y + 53,
                            fill: g.color,
                            textAnchor: "middle",
                            children: [
                              g.nombre.length > 23 ? g.nombre.slice(0, 22) + "\u2026" : g.nombre,
                              g.notes.length > 12 ? ` +${g.notes.length - 12}` : ""
                            ]
                          }
                        )
                      ]
                    }
                  )
                ] }, g.id)),
                /* @__PURE__ */ jsxs3("g", { className: "graph-core", children: [
                  /* @__PURE__ */ jsx4("circle", { cx: "400", cy: "310", r: "65", fill: "var(--panel)" }),
                  /* @__PURE__ */ jsx4(
                    "circle",
                    {
                      cx: "400",
                      cy: "310",
                      r: "64",
                      fill: "none",
                      stroke: "var(--lime)",
                      strokeOpacity: ".28"
                    }
                  ),
                  /* @__PURE__ */ jsx4(
                    "circle",
                    {
                      cx: "400",
                      cy: "310",
                      r: "52",
                      fill: "var(--lime)",
                      fillOpacity: ".05"
                    }
                  ),
                  /* @__PURE__ */ jsx4("text", { x: "400", y: "299", textAnchor: "middle", className: "core-title", children: "SGR" }),
                  /* @__PURE__ */ jsx4("text", { x: "400", y: "324", textAnchor: "middle", className: "core-sub", children: "MI UNIVERSO" }),
                  /* @__PURE__ */ jsx4(
                    "circle",
                    {
                      className: "orbit-particle",
                      cx: "400",
                      cy: "246",
                      r: "4",
                      fill: "var(--lime)"
                    }
                  )
                ] })
              ]
            }
          )
        ]
      }
    ),
    !notes.length && /* @__PURE__ */ jsxs3("div", { className: "graph-empty", children: [
      /* @__PURE__ */ jsx4("span", { children: "Un universo de posibilidades." }),
      /* @__PURE__ */ jsx4(Button, { icon: Plus2, onClick: onCreate, children: "Tu primera idea" })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "graph-controls", children: [
      /* @__PURE__ */ jsx4(
        IconButton,
        {
          icon: ZoomOut,
          label: "Alejar mapa",
          onClick: () => setZoom((z) => Math.max(0.4, z - 0.15))
        }
      ),
      /* @__PURE__ */ jsxs3("span", { children: [
        Math.round(zoom * 100),
        "%"
      ] }),
      /* @__PURE__ */ jsx4(
        IconButton,
        {
          icon: ZoomIn,
          label: "Acercar mapa",
          onClick: () => setZoom((z) => Math.min(2.5, z + 0.15))
        }
      ),
      /* @__PURE__ */ jsx4("i", {}),
      /* @__PURE__ */ jsx4(
        IconButton,
        {
          icon: Maximize,
          label: "Restablecer mapa",
          onClick: () => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx4("span", { className: "graph-instruction", children: "Arrastr\xE1 para explorar \xB7 Toc\xE1 una idea para abrirla" })
  ] });
}
function NoteCard({ note, category, onClick, index }) {
  const Icon = typeIcon[note.tipo] || FileText;
  return /* @__PURE__ */ jsxs3(
    "button",
    {
      className: "note-card",
      style: {
        "--note-color": category?.color || PALETTE[index % 6],
        animationDelay: `${Math.min(index, 8) * 40}ms`
      },
      onClick,
      children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx4(Icon, { size: 20 }),
          /* @__PURE__ */ jsx4(ArrowUpRight2, { size: 17 })
        ] }),
        /* @__PURE__ */ jsx4("h3", { children: title(note) }),
        /* @__PURE__ */ jsx4("p", { children: plain(note.contenido).slice(0, 150) || "Una idea por desarrollar." }),
        /* @__PURE__ */ jsx4("span", { children: category?.nombre || "Sin colecci\xF3n" })
      ]
    }
  );
}
function NoteDetail({ note, category, onClose }) {
  const app = useApp();
  const Icon = typeIcon[note.tipo] || FileText;
  const url = note.tipo === "link" ? safeURL(note.contenido) : null;
  const imageURL = note.tipo === "foto" ? String(note.contenido).startsWith("data:image/") ? note.contenido : safeURL(
    note.contenido?.startsWith("/uploads/") ? app.base + note.contenido : note.contenido
  ) : null;
  return /* @__PURE__ */ jsxs3("div", { className: "note-detail", children: [
    /* @__PURE__ */ jsxs3("div", { className: "panel-label", children: [
      /* @__PURE__ */ jsxs3("button", { className: "text-button", onClick: onClose, children: [
        /* @__PURE__ */ jsx4(ArrowLeft, { size: 14 }),
        "Volver"
      ] }),
      /* @__PURE__ */ jsx4(EditActions, { resource: "hojas", item: note })
    ] }),
    /* @__PURE__ */ jsxs3(
      "div",
      {
        className: "detail-type",
        style: { color: category?.color || PALETTE[1] },
        children: [
          /* @__PURE__ */ jsx4(Icon, { size: 25 }),
          /* @__PURE__ */ jsx4("span", { children: note.tipo || "texto" })
        ]
      }
    ),
    /* @__PURE__ */ jsx4("h2", { children: title(note) }),
    /* @__PURE__ */ jsx4(Pill, { color: category?.color, children: category?.nombre || "Sin colecci\xF3n" }),
    imageURL && /* @__PURE__ */ jsx4("img", { className: "note-image", src: imageURL, alt: title(note) }),
    /* @__PURE__ */ jsx4("div", { className: "note-content", children: note.tipo !== "foto" && plain(note.contenido) }),
    url && /* @__PURE__ */ jsxs3(
      "a",
      {
        className: "button",
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        children: [
          "Abrir enlace ",
          /* @__PURE__ */ jsx4(ExternalLink, { size: 15 })
        ]
      }
    ),
    note.apuntes && /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsx4("div", { className: "small-label", children: "APUNTES" }),
      /* @__PURE__ */ jsx4(
        "div",
        {
          className: "note-content rich-preview",
          dangerouslySetInnerHTML: {
            __html: DOMPurify2.sanitize(note.apuntes, {
              USE_PROFILES: { html: true }
            })
          }
        }
      )
    ] }),
    /* @__PURE__ */ jsx4(
      Button,
      {
        icon: FileText,
        onClick: () => app.setModal({ type: "form", resource: "hojas", item: note }),
        children: "Editar contenido"
      }
    ),
    /* @__PURE__ */ jsxs3("div", { className: "detail-date", children: [
      /* @__PURE__ */ jsx4(Clock, { size: 13 }),
      note.creado_en ? labelDate(String(note.creado_en).slice(0, 10)) : "Guardado en tu B\xF3veda"
    ] })
  ] });
}
var typeIcon;
var init_Boveda = __esm({
  "src/Boveda.jsx"() {
    init_store();
    init_ui();
    init_domain();
    typeIcon = { texto: FileText, link: Link3, foto: Image };
  }
});

// src/Finanzas.jsx
var Finanzas_exports = {};
__export(Finanzas_exports, {
  ConfigEditor: () => ConfigEditor,
  default: () => Finanzas
});
import React5, { useMemo as useMemo2, useState as useState5 } from "react";
import {
  Plus as Plus3,
  ArrowUpRight as ArrowUpRight3,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Flame,
  Target,
  Table2,
  LayoutDashboard,
  ChartNoAxesCombined,
  Download,
  Upload as Upload2,
  Settings2,
  RefreshCw as RefreshCw2,
  Coins,
  ArrowRight,
  NotebookPen,
  Pencil as Pencil2,
  Check as Check3
} from "lucide-react";
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function Finanzas({ tab = "dashboard", setTab }) {
  const { db, setModal, mode, action, refresh } = useApp();
  const [month, setMonth] = useState5(today().slice(0, 7)), [currency, setCurrency] = useState5("ARS"), [config, setConfig] = useState5(false);
  const current = db.movimientos.filter((m) => m.fecha?.startsWith(month));
  const total = totals(current, db.finCategorias, currency);
  const balance = db.cuentas.reduce(
    (s, c) => s + num(currency === "ARS" ? c.saldo_ars : c.saldo_usd),
    0
  );
  return /* @__PURE__ */ jsxs4("div", { className: "page finance-page", children: [
    /* @__PURE__ */ jsxs4("div", { className: "page-intro", children: [
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsxs4("div", { className: "eyebrow", children: [
          /* @__PURE__ */ jsx5("span", { className: "live-dot" }),
          " CLARIDAD PARA LO QUE VIENE"
        ] }),
        /* @__PURE__ */ jsxs4("h1", { children: [
          "Tu dinero. ",
          /* @__PURE__ */ jsx5("em", { children: "Tu libertad." })
        ] }),
        /* @__PURE__ */ jsx5("p", { children: "Cada decisi\xF3n de hoy construye las posibilidades de ma\xF1ana." })
      ] }),
      /* @__PURE__ */ jsx5(
        Button,
        {
          variant: "primary",
          icon: Plus3,
          onClick: () => setModal({ type: "form", resource: "movimientos" }),
          children: "Nuevo movimiento"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "module-toolbar", children: [
      /* @__PURE__ */ jsx5(
        Tabs,
        {
          value: tab,
          onChange: setTab,
          items: [
            ["dashboard", "Panorama", LayoutDashboard],
            ["anual", "Anual", ChartNoAxesCombined],
            ["fire", "FIRE", Flame],
            ["ahorro", "Ahorro", Target],
            ["datos", "Datos", Table2]
          ]
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "inline", children: [
        /* @__PURE__ */ jsxs4(
          "select",
          {
            "aria-label": "Moneda de visualizaci\xF3n",
            value: currency,
            onChange: (e) => setCurrency(e.target.value),
            children: [
              /* @__PURE__ */ jsx5("option", { children: "ARS" }),
              /* @__PURE__ */ jsx5("option", { children: "USD" })
            ]
          }
        ),
        ["dashboard", "anual"].includes(tab) && /* @__PURE__ */ jsx5(MonthPicker, { value: month, onChange: setMonth }),
        /* @__PURE__ */ jsx5(
          IconButton,
          {
            icon: Settings2,
            label: "Configuraci\xF3n financiera",
            onClick: () => setConfig(true)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx5(
      ErrorNotice,
      {
        keys: ["movimientos", "cuentas", "finCategorias", "config"]
      }
    ),
    /* @__PURE__ */ jsxs4("div", { className: "finance-layout", children: [
      /* @__PURE__ */ jsxs4("main", { className: "finance-main", children: [
        tab === "dashboard" && /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsxs4("div", { className: "stats-grid", children: [
            /* @__PURE__ */ jsx5(
              Stat,
              {
                label: "Ingresos del mes",
                value: money(total.in, currency),
                foot: `${current.filter((m) => income(m) && !transfer(m, db.finCategorias)).length} ingresos registrados`,
                icon: ArrowDownLeft,
                color: "var(--lime)"
              }
            ),
            /* @__PURE__ */ jsx5(
              Stat,
              {
                label: "Gastos del mes",
                value: money(total.out, currency),
                foot: "Sin transferencias entre cuentas",
                icon: ArrowUpRight3,
                color: "var(--peach)"
              }
            ),
            /* @__PURE__ */ jsx5(
              Stat,
              {
                label: "Tasa de ahorro",
                value: `${Math.round(total.rate)}%`,
                foot: total.in ? "De tus ingresos este mes" : "Registr\xE1 ingresos para calcularla",
                icon: TrendingUp,
                color: "var(--lavender)"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "finance-middle", children: [
            /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
              /* @__PURE__ */ jsx5(
                SectionTitle,
                {
                  eyebrow: "CADA PESO CUENTA",
                  title: "\xBFA d\xF3nde va tu dinero?"
                }
              ),
              /* @__PURE__ */ jsx5(
                Donut,
                {
                  moves: current.filter(
                    (m) => (m.moneda || "ARS") === currency
                  ),
                  categories: db.finCategorias,
                  currency
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "balance-feature", children: [
              /* @__PURE__ */ jsx5("span", { className: "eyebrow", children: "SALDO DE TUS CUENTAS" }),
              /* @__PURE__ */ jsxs4("div", { className: "balance-orbit", children: [
                /* @__PURE__ */ jsx5("i", {}),
                /* @__PURE__ */ jsx5("i", {}),
                /* @__PURE__ */ jsx5(Coins, { size: 32 })
              ] }),
              /* @__PURE__ */ jsx5("strong", { children: money(balance, currency) }),
              /* @__PURE__ */ jsxs4("span", { className: "muted", children: [
                db.cuentas.length,
                " cuentas \xB7 ",
                currency
              ] }),
              /* @__PURE__ */ jsxs4("div", { className: "balance-footer", children: [
                /* @__PURE__ */ jsx5("span", { children: "El futuro se construye de a poco." }),
                /* @__PURE__ */ jsx5(ArrowUpRight3, { size: 24 })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx5(MovementTable, { moves: current, currency, compact: true }),
          /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
            /* @__PURE__ */ jsx5(
              SectionTitle,
              {
                title: "Notas del mes",
                eyebrow: "PARA NO PERDER DE VISTA",
                children: /* @__PURE__ */ jsx5(
                  Button,
                  {
                    icon: Plus3,
                    onClick: () => setModal({
                      type: "form",
                      resource: "finNotas",
                      defaults: { mes: month }
                    }),
                    children: "Nota"
                  }
                )
              }
            ),
            /* @__PURE__ */ jsx5(ErrorNotice, { keys: ["finNotas"] }),
            /* @__PURE__ */ jsxs4("div", { className: "financial-notes", children: [
              db.finNotas.filter((n) => !n.mes || n.mes === month).map((n) => /* @__PURE__ */ jsxs4("div", { className: "financial-note", children: [
                /* @__PURE__ */ jsx5(NotebookPen, { size: 18 }),
                /* @__PURE__ */ jsx5("p", { children: n.contenido || n.texto || n.nota }),
                /* @__PURE__ */ jsx5(EditActions, { resource: "finNotas", item: n })
              ] }, n.id)),
              !db.finNotas.filter((n) => !n.mes || n.mes === month).length && /* @__PURE__ */ jsx5("p", { className: "muted", children: "Un vencimiento, una idea de ahorro, algo para recordar." })
            ] })
          ] })
        ] }),
        tab === "anual" && /* @__PURE__ */ jsx5(Annual, { year: month.slice(0, 4), currency }),
        tab === "fire" && /* @__PURE__ */ jsx5(Fire, { onConfig: () => setConfig(true) }),
        tab === "ahorro" && /* @__PURE__ */ jsx5(Savings, {}),
        tab === "datos" && /* @__PURE__ */ jsx5(MovementTable, { moves: db.movimientos, currency })
      ] }),
      /* @__PURE__ */ jsxs4("aside", { className: "finance-sidebar", children: [
        /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
          /* @__PURE__ */ jsx5(SectionTitle, { title: "Mis cuentas", children: /* @__PURE__ */ jsx5(
            IconButton,
            {
              icon: Plus3,
              label: "Agregar cuenta",
              onClick: () => setModal({ type: "form", resource: "cuentas" })
            }
          ) }),
          db.cuentas.map((c, i) => /* @__PURE__ */ jsxs4("div", { className: "account-row", children: [
            /* @__PURE__ */ jsx5(
              "span",
              {
                className: "account-icon",
                style: { color: c.color || PALETTE[i % 6] },
                children: /* @__PURE__ */ jsx5(Wallet, { size: 20 })
              }
            ),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("strong", { children: c.nombre }),
              /* @__PURE__ */ jsx5("small", { children: c.tipo || "Cuenta" })
            ] }),
            /* @__PURE__ */ jsx5("b", { children: money(
              currency === "ARS" ? c.saldo_ars : c.saldo_usd,
              currency
            ) })
          ] }, c.id)),
          !db.cuentas.length && /* @__PURE__ */ jsx5("p", { className: "muted small", children: "Agreg\xE1 tu primera cuenta para registrar movimientos." }),
          /* @__PURE__ */ jsxs4(
            "button",
            {
              className: "text-button",
              onClick: () => setModal({ type: "manager", resource: "cuentas" }),
              children: [
                "Administrar cuentas ",
                /* @__PURE__ */ jsx5(ArrowRight, { size: 14 })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "dollar-card", children: [
          /* @__PURE__ */ jsxs4("div", { className: "inline", children: [
            /* @__PURE__ */ jsx5("span", { className: "dollar-sign", children: "$" }),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("strong", { children: "D\xF3lar MEP" }),
              /* @__PURE__ */ jsx5("small", { children: "Referencia para tus objetivos" })
            ] })
          ] }),
          /* @__PURE__ */ jsx5("strong", { className: "dollar-value", children: num(db.config.dolar_mep) ? money(db.config.dolar_mep) : "Sin cotizaci\xF3n" }),
          /* @__PURE__ */ jsxs4("div", { className: "inline spread", children: [
            /* @__PURE__ */ jsx5("span", { className: "muted small", children: "Oficial compra" }),
            /* @__PURE__ */ jsx5("span", { children: num(db.config.dolar_oficial_compra) ? money(db.config.dolar_oficial_compra) : "\u2014" })
          ] }),
          mode === "api" ? /* @__PURE__ */ jsx5(
            Button,
            {
              icon: RefreshCw2,
              onClick: async () => {
                try {
                  const result = await action("/fin/dolar/cotizacion");
                  if (result) await appRefreshConfig();
                } catch {
                }
              },
              children: "Actualizar cotizaci\xF3n"
            }
          ) : /* @__PURE__ */ jsx5(Button, { icon: Pencil2, onClick: () => setConfig(true), children: "Ingresar cotizaci\xF3n" })
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
          /* @__PURE__ */ jsx5(SectionTitle, { title: "Metas de ahorro" }),
          /* @__PURE__ */ jsxs4("div", { className: "goal-inline", children: [
            /* @__PURE__ */ jsx5("span", { children: "Ahorrar este mes" }),
            /* @__PURE__ */ jsxs4("strong", { children: [
              num(db.config.tasa_ahorro_objetivo) || 20,
              "%"
            ] })
          ] }),
          /* @__PURE__ */ jsx5(
            Progress,
            {
              value: total.rate / (num(db.config.tasa_ahorro_objetivo) || 20) * 100,
              color: "var(--lime)"
            }
          ),
          /* @__PURE__ */ jsxs4("p", { className: "muted small", children: [
            "Tu tasa actual es ",
            Math.round(total.rate),
            "%."
          ] }),
          /* @__PURE__ */ jsx5(Button, { icon: Target, onClick: () => setTab("ahorro"), children: "Ver mis objetivos" })
        ] }),
        /* @__PURE__ */ jsxs4(
          "button",
          {
            className: "text-button",
            onClick: () => setModal({ type: "manager", resource: "finCategorias" }),
            children: [
              /* @__PURE__ */ jsx5(Settings2, { size: 15 }),
              "Gestionar categor\xEDas"
            ]
          }
        ),
        current.some((m) => num(m.cuotas) > 1) && /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
          /* @__PURE__ */ jsx5(SectionTitle, { title: "Compras en cuotas" }),
          current.filter((m) => num(m.cuotas) > 1).map((m) => /* @__PURE__ */ jsxs4("div", { className: "manager-row", children: [
            /* @__PURE__ */ jsx5("span", { children: m.descripcion }),
            /* @__PURE__ */ jsxs4(Pill, { children: [
              m.cuotas,
              " cuotas"
            ] })
          ] }, m.id))
        ] })
      ] })
    ] }),
    config && /* @__PURE__ */ jsx5(ConfigEditor, { onClose: () => setConfig(false) })
  ] });
  async function appRefreshConfig() {
    window.dispatchEvent(new Event("sgr-refresh"));
  }
}
function Donut({ moves, categories, currency }) {
  const [selected, setSelected] = useState5(null);
  const grouped = Object.entries(
    moves.filter((m) => !income(m) && !transfer(m, categories)).reduce((acc, m) => {
      const key = categoryName(m, categories);
      acc[key] = (acc[key] || 0) + amount(m);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const total = grouped.reduce((s, [, v]) => s + v, 0);
  let offset = 0;
  return /* @__PURE__ */ jsxs4("div", { className: "donut-layout", children: [
    /* @__PURE__ */ jsxs4("div", { className: "donut", children: [
      /* @__PURE__ */ jsxs4(
        "svg",
        {
          viewBox: "0 0 180 180",
          role: "img",
          "aria-label": `Gastos por categor\xEDa, total ${money(total, currency)}`,
          children: [
            /* @__PURE__ */ jsx5(
              "circle",
              {
                cx: "90",
                cy: "90",
                r: "67",
                fill: "none",
                stroke: "var(--line)",
                strokeWidth: "17"
              }
            ),
            grouped.map(([name, value], i) => {
              const length = total ? value / total * 421 : 0;
              const start = offset;
              offset += length;
              return /* @__PURE__ */ jsx5(
                "circle",
                {
                  cx: "90",
                  cy: "90",
                  r: "67",
                  fill: "none",
                  stroke: categories.find((c) => c.nombre === name)?.color || PALETTE[i % 6],
                  strokeWidth: selected === name ? 23 : 17,
                  strokeDasharray: `${Math.max(0, length - 4)} ${421 - Math.max(0, length - 4)}`,
                  strokeDashoffset: -start,
                  transform: "rotate(-90 90 90)",
                  onMouseEnter: () => setSelected(name),
                  onMouseLeave: () => setSelected(null),
                  children: /* @__PURE__ */ jsxs4("title", { children: [
                    name,
                    ": ",
                    money(value, currency)
                  ] })
                },
                name
              );
            })
          ]
        }
      ),
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx5("small", { children: selected || "GASTO TOTAL" }),
        /* @__PURE__ */ jsx5("strong", { children: money(
          selected ? grouped.find(([n]) => n === selected)?.[1] : total,
          currency
        ) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "donut-legend", children: [
      grouped.map(([name, value], i) => /* @__PURE__ */ jsxs4(
        "button",
        {
          className: selected === name ? "active" : "",
          onFocus: () => setSelected(name),
          onBlur: () => setSelected(null),
          onMouseEnter: () => setSelected(name),
          onMouseLeave: () => setSelected(null),
          children: [
            /* @__PURE__ */ jsx5(
              "span",
              {
                className: "color-dot",
                style: {
                  background: categories.find((c) => c.nombre === name)?.color || PALETTE[i % 6]
                }
              }
            ),
            /* @__PURE__ */ jsx5("span", { children: name }),
            /* @__PURE__ */ jsxs4("strong", { children: [
              Math.round(value / total * 100),
              "%"
            ] })
          ]
        },
        name
      )),
      !grouped.length && /* @__PURE__ */ jsx5("p", { className: "muted", children: "Tus categor\xEDas tomar\xE1n color cuando registres gastos." })
    ] })
  ] });
}
function MovementTable({ moves, currency, compact = false }) {
  const { db, setModal, mode, action, refresh } = useApp();
  const [query, setQuery] = useState5(""), [type, setType] = useState5("all"), [cat, setCat] = useState5("all"), [account, setAccount] = useState5("all"), [from, setFrom] = useState5(""), [to, setTo] = useState5(""), [page, setPage] = useState5(0), [sort, setSort] = useState5(false);
  const filtered = moves.filter(
    (m) => (m.moneda || "ARS") === currency && (!query || `${m.descripcion} ${categoryName(m, db.finCategorias)}`.toLowerCase().includes(query.toLowerCase())) && (type === "all" || type === "transferencia" ? type === "all" || transfer(m, db.finCategorias) : !transfer(m, db.finCategorias) && (type === "ingreso" ? income(m) : !income(m))) && (cat === "all" || String(m.categoria_id) === cat) && (account === "all" || String(m.cuenta_id) === account) && (!from || m.fecha >= from) && (!to || m.fecha <= to)
  ).sort(
    (a, b) => (sort ? 1 : -1) * String(a.fecha).localeCompare(String(b.fecha))
  );
  const pageSize = compact ? 6 : 30;
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  );
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return /* @__PURE__ */ jsxs4("div", { className: "panel movement-panel", children: [
    /* @__PURE__ */ jsxs4(
      SectionTitle,
      {
        eyebrow: compact ? "TU ACTIVIDAD" : "REGISTRO COMPLETO",
        title: compact ? "\xDAltimos movimientos" : "Todos los movimientos",
        children: [
          /* @__PURE__ */ jsx5(
            IconButton,
            {
              icon: Download,
              label: "Exportar movimientos filtrados como CSV",
              onClick: () => download(
                csv(
                  filtered.map((m) => ({
                    ...m,
                    categoria: categoryName(m, db.finCategorias)
                  })),
                  [
                    "fecha",
                    "descripcion",
                    "tipo",
                    "monto",
                    "moneda",
                    "categoria",
                    "cuenta_id"
                  ]
                ),
                `movimientos-${today()}.csv`,
                "text/csv;charset=utf-8"
              )
            }
          ),
          !compact && mode === "api" && /* @__PURE__ */ jsxs4(
            "label",
            {
              className: "icon-button",
              title: "Importar CSV",
              "aria-label": "Importar CSV",
              children: [
                /* @__PURE__ */ jsx5(Upload2, { size: 17 }),
                /* @__PURE__ */ jsx5(
                  "input",
                  {
                    type: "file",
                    accept: ".csv",
                    className: "sr-only",
                    onChange: async (e) => {
                      const f2 = e.target.files?.[0];
                      if (!f2) return;
                      const form = new FormData();
                      form.append("file", f2);
                      try {
                        await action("/fin/import/csv", "POST", form);
                        refresh("movimientos");
                        refresh("cuentas");
                      } catch {
                      }
                      e.target.value = "";
                    }
                  }
                )
              ]
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxs4("div", { className: "table-filters", children: [
      /* @__PURE__ */ jsx5(
        SearchBox,
        {
          value: query,
          onChange: (v) => {
            setQuery(v);
            setPage(0);
          },
          placeholder: "Buscar movimiento\u2026"
        }
      ),
      /* @__PURE__ */ jsxs4(
        "select",
        {
          "aria-label": "Tipo de movimiento",
          value: type,
          onChange: (e) => setType(e.target.value),
          children: [
            /* @__PURE__ */ jsx5("option", { value: "all", children: "Todos los tipos" }),
            /* @__PURE__ */ jsx5("option", { value: "ingreso", children: "Ingresos" }),
            /* @__PURE__ */ jsx5("option", { value: "gasto", children: "Gastos" }),
            /* @__PURE__ */ jsx5("option", { value: "transferencia", children: "Transferencias" })
          ]
        }
      ),
      !compact && /* @__PURE__ */ jsxs4(Fragment2, { children: [
        /* @__PURE__ */ jsxs4(
          "select",
          {
            "aria-label": "Categor\xEDa",
            value: cat,
            onChange: (e) => setCat(e.target.value),
            children: [
              /* @__PURE__ */ jsx5("option", { value: "all", children: "Todas las categor\xEDas" }),
              db.finCategorias.map((c) => /* @__PURE__ */ jsx5("option", { value: c.id, children: c.nombre }, c.id))
            ]
          }
        ),
        /* @__PURE__ */ jsxs4(
          "select",
          {
            "aria-label": "Cuenta",
            value: account,
            onChange: (e) => setAccount(e.target.value),
            children: [
              /* @__PURE__ */ jsx5("option", { value: "all", children: "Todas las cuentas" }),
              db.cuentas.map((c) => /* @__PURE__ */ jsx5("option", { value: c.id, children: c.nombre }, c.id))
            ]
          }
        ),
        /* @__PURE__ */ jsx5(
          "input",
          {
            "aria-label": "Fecha desde",
            type: "date",
            value: from,
            onChange: (e) => setFrom(e.target.value)
          }
        ),
        /* @__PURE__ */ jsx5(
          "input",
          {
            "aria-label": "Fecha hasta",
            type: "date",
            value: to,
            onChange: (e) => setTo(e.target.value)
          }
        )
      ] })
    ] }),
    filtered.length ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
      /* @__PURE__ */ jsx5("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs4("table", { children: [
        /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx5("th", { scope: "col", children: "Movimiento" }),
          /* @__PURE__ */ jsx5("th", { scope: "col", children: "Categor\xEDa" }),
          /* @__PURE__ */ jsx5("th", { scope: "col", children: /* @__PURE__ */ jsxs4(
            "button",
            {
              className: "text-button",
              onClick: () => setSort((v) => !v),
              children: [
                "Fecha ",
                sort ? "\u2191" : "\u2193"
              ]
            }
          ) }),
          /* @__PURE__ */ jsx5("th", { scope: "col", className: "align-right", children: "Importe" }),
          /* @__PURE__ */ jsx5("th", { scope: "col", children: /* @__PURE__ */ jsx5("span", { className: "sr-only", children: "Acciones" }) })
        ] }) }),
        /* @__PURE__ */ jsx5("tbody", { children: shown.map((m) => /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsxs4("div", { className: "movement-name", children: [
            /* @__PURE__ */ jsx5(
              "span",
              {
                className: `movement-icon ${income(m) ? "positive" : "negative"}`,
                children: income(m) ? /* @__PURE__ */ jsx5(ArrowDownLeft, { size: 17 }) : /* @__PURE__ */ jsx5(ArrowUpRight3, { size: 17 })
              }
            ),
            /* @__PURE__ */ jsxs4("div", { children: [
              /* @__PURE__ */ jsx5("strong", { children: m.descripcion || "Movimiento" }),
              /* @__PURE__ */ jsx5("small", { children: db.cuentas.find(
                (c) => String(c.id) === String(m.cuenta_id)
              )?.nombre || m.cuenta_nombre || "Sin cuenta" })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(
            Pill,
            {
              color: db.finCategorias.find(
                (c) => String(c.id) === String(m.categoria_id)
              )?.color,
              children: categoryName(m, db.finCategorias)
            }
          ) }),
          /* @__PURE__ */ jsx5("td", { className: "muted", children: m.fecha ? labelDate(m.fecha, { day: "2-digit", month: "short" }) : "\u2014" }),
          /* @__PURE__ */ jsxs4(
            "td",
            {
              className: `align-right amount ${income(m) ? "positive" : ""}`,
              children: [
                income(m) ? "+" : "\u2212",
                " ",
                money(amount(m), m.moneda || "ARS")
              ]
            }
          ),
          /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(EditActions, { resource: "movimientos", item: m }) })
        ] }, m.id)) })
      ] }) }),
      /* @__PURE__ */ jsxs4("div", { className: "pagination", children: [
        /* @__PURE__ */ jsxs4("span", { children: [
          filtered.length,
          " movimientos \xB7 ",
          currency
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "inline", children: [
          /* @__PURE__ */ jsx5(
            Button,
            {
              disabled: safePage === 0,
              onClick: () => setPage(safePage - 1),
              children: "Anterior"
            }
          ),
          /* @__PURE__ */ jsxs4("span", { children: [
            safePage + 1,
            " / ",
            Math.ceil(filtered.length / pageSize)
          ] }),
          /* @__PURE__ */ jsx5(
            Button,
            {
              disabled: (safePage + 1) * pageSize >= filtered.length,
              onClick: () => setPage(safePage + 1),
              children: "Siguiente"
            }
          )
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsx5(
      Empty,
      {
        icon: Wallet,
        title: "Cada movimiento cuenta.",
        text: "Registr\xE1 un ingreso o gasto para empezar a ver el panorama.",
        action: "Agregar movimiento",
        onAction: () => setModal({ type: "form", resource: "movimientos" })
      }
    )
  ] });
}
function Annual({ year, currency }) {
  const { db, setModal } = useApp();
  const [real, setReal] = useState5(false);
  let accumulated = 1;
  const data = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const total = totals(
      db.movimientos.filter((m) => m.fecha?.startsWith(month)),
      db.finCategorias,
      currency
    );
    const inflation = num(
      db.inflacion.find((f2) => f2.mes === month)?.porcentaje ?? db.inflacion.find((f2) => f2.mes === month)?.valor
    );
    accumulated *= 1 + inflation / 100;
    return {
      ...total,
      month,
      inflation,
      realIn: total.in / accumulated,
      realOut: total.out / accumulated
    };
  });
  const max = Math.max(
    1,
    ...data.flatMap((d) => real ? [d.realIn, d.realOut] : [d.in, d.out])
  );
  const annual = totals(
    db.movimientos.filter((m) => m.fecha?.startsWith(year)),
    db.finCategorias,
    currency
  );
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "stats-grid", children: [
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: `Ingresos ${year}`,
          value: money(annual.in, currency),
          color: "var(--lime)"
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: `Gastos ${year}`,
          value: money(annual.out, currency),
          color: "var(--peach)"
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "Balance anual",
          value: money(annual.net, currency),
          color: "var(--lavender)"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(SectionTitle, { title: "Un a\xF1o, en perspectiva", eyebrow: year, children: /* @__PURE__ */ jsx5(Button, { onClick: () => setReal((v) => !v), children: real ? "Ajustado por inflaci\xF3n" : "Valores nominales" }) }),
      /* @__PURE__ */ jsxs4("div", { className: "chart-legend", children: [
        /* @__PURE__ */ jsxs4("span", { children: [
          /* @__PURE__ */ jsx5("i", { style: { background: "var(--lime)" } }),
          "Ingresos"
        ] }),
        /* @__PURE__ */ jsxs4("span", { children: [
          /* @__PURE__ */ jsx5("i", { style: { background: "var(--lavender)" } }),
          "Gastos"
        ] })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "annual-chart", children: data.map((d, i) => /* @__PURE__ */ jsxs4("div", { className: "chart-month", children: [
        /* @__PURE__ */ jsxs4("div", { className: "bar-pair", children: [
          /* @__PURE__ */ jsx5(
            "div",
            {
              style: {
                height: `${(real ? d.realIn : d.in) / max * 100}%`,
                background: "var(--lime)"
              },
              title: `Ingresos ${money(real ? d.realIn : d.in, currency)}`
            }
          ),
          /* @__PURE__ */ jsx5(
            "div",
            {
              style: {
                height: `${(real ? d.realOut : d.out) / max * 100}%`,
                background: "var(--lavender)"
              },
              title: `Gastos ${money(real ? d.realOut : d.out, currency)}`
            }
          )
        ] }),
        /* @__PURE__ */ jsx5("span", { children: [
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
          "DIC"
        ][i] })
      ] }, d.month)) }),
      real && /* @__PURE__ */ jsx5("p", { className: "muted small", children: "Valores a precios de inicio de a\xF1o, usando la inflaci\xF3n mensual registrada. Un mes sin datos de inflaci\xF3n se toma como 0%." })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(SectionTitle, { title: "Mes a mes", children: /* @__PURE__ */ jsx5(
        Button,
        {
          icon: Pencil2,
          onClick: () => setModal({ type: "manager", resource: "inflacion" }),
          children: "Inflaci\xF3n"
        }
      ) }),
      /* @__PURE__ */ jsx5(ErrorNotice, { keys: ["inflacion"] }),
      /* @__PURE__ */ jsx5("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs4("table", { children: [
        /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsx5("tr", { children: [
          "Mes",
          "Ingresos",
          "Gastos",
          "Balance",
          "Ahorro",
          "Inflaci\xF3n"
        ].map((t) => /* @__PURE__ */ jsx5("th", { scope: "col", children: t }, t)) }) }),
        /* @__PURE__ */ jsx5("tbody", { children: data.map((d) => /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx5("td", { children: labelDate(d.month + "-01", { month: "long" }) }),
          /* @__PURE__ */ jsx5("td", { className: "positive", children: money(real ? d.realIn : d.in, currency) }),
          /* @__PURE__ */ jsx5("td", { children: money(real ? d.realOut : d.out, currency) }),
          /* @__PURE__ */ jsx5("td", { children: money(real ? d.realIn - d.realOut : d.net, currency) }),
          /* @__PURE__ */ jsxs4("td", { children: [
            Math.round(d.rate),
            "%"
          ] }),
          /* @__PURE__ */ jsxs4("td", { children: [
            d.inflation,
            "%"
          ] })
        ] }, d.month)) })
      ] }) })
    ] })
  ] });
}
function Fire({ onConfig }) {
  const { db, setModal } = useApp();
  const [years, setYears] = useState5(10);
  const c = db.config;
  const data = fireProjection(
    {
      initial: c.fire_saldo_inicial,
      contribution: c.fire_aporte_inicial,
      annualReturn: c.fire_rentabilidad_anual ?? 5,
      increase: c.fire_aumento_aporte,
      months: years * 12
    },
    db.fireFilas
  );
  const last = data.at(-1);
  const max = Math.max(1, ...data.map((d) => d.balance));
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsxs4("div", { className: "fire-hero", children: [
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsx5("span", { className: "eyebrow", children: "FINANCIAL INDEPENDENCE \xB7 RETIRE EARLY" }),
        /* @__PURE__ */ jsxs4("h2", { children: [
          "El tiempo tambi\xE9n",
          /* @__PURE__ */ jsx5("br", {}),
          /* @__PURE__ */ jsx5("em", { children: "invierte en vos." })
        ] }),
        /* @__PURE__ */ jsx5("p", { children: "Explor\xE1 el poder de tus aportes, mes a mes." }),
        /* @__PURE__ */ jsx5(Button, { icon: Settings2, onClick: onConfig, children: "Configurar proyecci\xF3n" })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "fire-art", children: [
        /* @__PURE__ */ jsx5(Flame, { size: 82 }),
        /* @__PURE__ */ jsx5("span", { className: "fire-ring" }),
        /* @__PURE__ */ jsx5("span", { className: "fire-ring second" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "stats-grid", children: [
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "Aporte mensual inicial",
          value: money(c.fire_aporte_inicial, "USD"),
          color: "var(--peach)"
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: `Proyecci\xF3n a ${years} a\xF1os`,
          value: money(last?.balance, "USD"),
          color: "var(--lime)"
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "Retorno anual supuesto",
          value: `${num(c.fire_rentabilidad_anual ?? 5)}%`,
          foot: "Simulaci\xF3n, no rendimiento garantizado",
          color: "var(--lavender)"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(SectionTitle, { title: "Tu horizonte de libertad", children: /* @__PURE__ */ jsx5(
        "select",
        {
          "aria-label": "Horizonte de proyecci\xF3n",
          value: years,
          onChange: (e) => setYears(Number(e.target.value)),
          children: [1, 5, 10, 20, 30].map((y) => /* @__PURE__ */ jsxs4("option", { value: y, children: [
            y,
            " a\xF1os"
          ] }, y))
        }
      ) }),
      /* @__PURE__ */ jsxs4(
        "svg",
        {
          className: "projection-chart",
          viewBox: "0 0 800 180",
          role: "img",
          "aria-label": `Proyecci\xF3n de capital: ${money(last?.balance, "USD")}`,
          children: [
            /* @__PURE__ */ jsx5("defs", { children: /* @__PURE__ */ jsxs4("linearGradient", { id: "fire-fill", x1: "0", y1: "0", x2: "0", y2: "1", children: [
              /* @__PURE__ */ jsx5("stop", { stopColor: "#b4f580", stopOpacity: ".25" }),
              /* @__PURE__ */ jsx5("stop", { offset: "1", stopColor: "#b4f580", stopOpacity: "0" })
            ] }) }),
            [30, 75, 120, 165].map((y) => /* @__PURE__ */ jsx5(
              "line",
              {
                x1: "0",
                x2: "800",
                y1: y,
                y2: y,
                stroke: "var(--line)",
                strokeDasharray: "3 6"
              },
              y
            )),
            /* @__PURE__ */ jsx5(
              "path",
              {
                d: `M0 175 ${data.map((d, i) => `L${i / (data.length - 1) * 800} ${170 - d.balance / max * 150}`).join(" ")} L800 175 Z`,
                fill: "url(#fire-fill)"
              }
            ),
            /* @__PURE__ */ jsx5(
              "polyline",
              {
                points: data.map(
                  (d, i) => `${i / (data.length - 1) * 800},${170 - d.balance / max * 150}`
                ).join(" "),
                fill: "none",
                stroke: "var(--lime)",
                strokeWidth: "3"
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxs4("div", { className: "chart-axis", children: [
        /* @__PURE__ */ jsx5("span", { children: "Hoy" }),
        /* @__PURE__ */ jsxs4("span", { children: [
          years,
          " a\xF1os"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(SectionTitle, { title: "Plan mensual", eyebrow: "PR\xD3XIMOS 12 MESES", children: /* @__PURE__ */ jsx5(
        Button,
        {
          icon: Plus3,
          onClick: () => setModal({
            type: "form",
            resource: "fireFilas",
            defaults: { mes: today().slice(0, 7) }
          }),
          children: "Ajustar saldo real"
        }
      ) }),
      /* @__PURE__ */ jsx5(ErrorNotice, { keys: ["fireFilas"] }),
      /* @__PURE__ */ jsx5("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs4("table", { children: [
        /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx5("th", { scope: "col", children: "Mes" }),
          /* @__PURE__ */ jsx5("th", { scope: "col", children: "Aporte proyectado" }),
          /* @__PURE__ */ jsx5("th", { scope: "col", children: "Capital acumulado" })
        ] }) }),
        /* @__PURE__ */ jsx5("tbody", { children: data.slice(0, 12).map((d) => /* @__PURE__ */ jsxs4("tr", { children: [
          /* @__PURE__ */ jsx5("td", { children: labelDate(d.mes + "-01", {
            month: "long",
            year: "numeric"
          }) }),
          /* @__PURE__ */ jsx5("td", { children: money(d.aporte, "USD") }),
          /* @__PURE__ */ jsx5("td", { className: "positive", children: money(d.balance, "USD") })
        ] }, d.mes)) })
      ] }) }),
      /* @__PURE__ */ jsxs4(
        "button",
        {
          className: "text-button",
          onClick: () => setModal({ type: "manager", resource: "fireFilas" }),
          children: [
            "Administrar ajustes guardados ",
            /* @__PURE__ */ jsx5(ArrowRight, { size: 14 })
          ]
        }
      )
    ] })
  ] });
}
function Savings() {
  const { db, setModal } = useApp();
  const rate = num(db.config.dolar_mep || db.config.dolar_oficial);
  const buckets = [
    { id: "fire", nombre: "FIRE", color: PALETTE[1] },
    ...db.objetivos
  ];
  const allocated = rate ? buckets.reduce(
    (s, b) => s + allocation(db.movimientos, db.finCategorias, b.nombre, rate),
    0
  ) : 0;
  const cost = db.instrumentos.reduce((s, i) => s + num(i.costo_usd), 0);
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsx5(ErrorNotice, { keys: ["objetivos", "instrumentos", "transacciones"] }),
    !rate && /* @__PURE__ */ jsx5("div", { className: "info-notice", children: "Ingres\xE1 la cotizaci\xF3n del d\xF3lar en la configuraci\xF3n financiera para calcular tus objetivos en USD." }),
    /* @__PURE__ */ jsxs4("div", { className: "stats-grid", children: [
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "Ahorro asignado",
          value: rate ? money(allocated, "USD") : "\u2014",
          icon: Target
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "Costo del portafolio",
          value: money(cost, "USD"),
          color: "var(--lavender)"
        }
      ),
      /* @__PURE__ */ jsx5(
        Stat,
        {
          label: "L\xEDquido sin invertir",
          value: rate ? money(allocated - cost, "USD") : "\u2014",
          color: "var(--cyan)"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(
        SectionTitle,
        {
          title: "Pon\xE9 un destino a tu ahorro",
          eyebrow: "TUS OBJETIVOS",
          children: /* @__PURE__ */ jsx5(
            Button,
            {
              icon: Plus3,
              onClick: () => setModal({ type: "form", resource: "objetivos" }),
              children: "Nuevo objetivo"
            }
          )
        }
      ),
      /* @__PURE__ */ jsx5("div", { className: "goals-grid", children: buckets.map((b, i) => {
        const saved = rate ? allocation(db.movimientos, db.finCategorias, b.nombre, rate) : 0;
        const goal = num(b.monto_objetivo || b.monto_meta || b.meta);
        return /* @__PURE__ */ jsxs4(
          "div",
          {
            className: "goal-card",
            style: { "--goal-color": b.color || PALETTE[i % 6] },
            children: [
              /* @__PURE__ */ jsxs4("div", { className: "inline spread", children: [
                /* @__PURE__ */ jsx5(Target, { size: 24 }),
                b.id !== "fire" && /* @__PURE__ */ jsx5(EditActions, { resource: "objetivos", item: b })
              ] }),
              /* @__PURE__ */ jsx5("h3", { children: b.nombre }),
              /* @__PURE__ */ jsx5("strong", { children: rate ? money(saved, "USD") : "\u2014" }),
              /* @__PURE__ */ jsx5("p", { children: goal ? `de ${money(goal, "USD")}` : "Un aporte a tu libertad futura" }),
              /* @__PURE__ */ jsx5(
                Progress,
                {
                  value: goal ? saved / goal * 100 : 0,
                  color: b.color || PALETTE[i % 6]
                }
              )
            ]
          },
          b.id
        );
      }) })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsxs4(SectionTitle, { title: "Tu portafolio", eyebrow: "INVERSIONES", children: [
        /* @__PURE__ */ jsx5(
          Button,
          {
            icon: Plus3,
            onClick: () => setModal({ type: "form", resource: "instrumentos" }),
            children: "Instrumento"
          }
        ),
        /* @__PURE__ */ jsx5(
          Button,
          {
            icon: Plus3,
            variant: "primary",
            onClick: () => setModal({ type: "form", resource: "transacciones" }),
            children: "Operaci\xF3n"
          }
        )
      ] }),
      db.instrumentos.length ? /* @__PURE__ */ jsx5("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs4("table", { children: [
        /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsx5("tr", { children: [
          "Instrumento",
          "Cantidad",
          "Costo USD",
          "Valor actual USD",
          "Resultado",
          ""
        ].map((t, i) => /* @__PURE__ */ jsx5("th", { scope: "col", children: t }, i)) }) }),
        /* @__PURE__ */ jsx5("tbody", { children: db.instrumentos.map((i) => {
          const val = num(i.precio_actual) * num(i.cantidad);
          return /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsxs4("td", { children: [
              /* @__PURE__ */ jsx5("strong", { children: i.ticker || i.nombre }),
              /* @__PURE__ */ jsx5("small", { className: "block muted", children: i.tipo })
            ] }),
            /* @__PURE__ */ jsx5("td", { children: num(i.cantidad).toLocaleString("es-AR", {
              maximumFractionDigits: 8
            }) }),
            /* @__PURE__ */ jsx5("td", { children: money(i.costo_usd, "USD") }),
            /* @__PURE__ */ jsx5("td", { children: i.precio_actual != null ? money(val, "USD") : "Sin cotizaci\xF3n" }),
            /* @__PURE__ */ jsx5("td", { children: i.precio_actual != null ? money(val - num(i.costo_usd), "USD") : "\u2014" }),
            /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(EditActions, { resource: "instrumentos", item: i }) })
          ] }, i.id);
        }) })
      ] }) }) : /* @__PURE__ */ jsx5(
        Empty,
        {
          icon: Coins,
          title: "Invert\xED en posibilidades.",
          text: "Agreg\xE1 un instrumento y registr\xE1 compras o ventas para construir tu portafolio.",
          action: "Agregar instrumento",
          onAction: () => setModal({ type: "form", resource: "instrumentos" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "panel", children: [
      /* @__PURE__ */ jsx5(SectionTitle, { title: "Historial de operaciones" }),
      /* @__PURE__ */ jsxs4("div", { className: "table-scroll", children: [
        /* @__PURE__ */ jsxs4("table", { children: [
          /* @__PURE__ */ jsx5("thead", { children: /* @__PURE__ */ jsx5("tr", { children: [
            "Fecha",
            "Instrumento",
            "Operaci\xF3n",
            "Cantidad",
            "Precio",
            ""
          ].map((t, i) => /* @__PURE__ */ jsx5("th", { scope: "col", children: t }, i)) }) }),
          /* @__PURE__ */ jsx5("tbody", { children: [...db.transacciones].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).map((t) => /* @__PURE__ */ jsxs4("tr", { children: [
            /* @__PURE__ */ jsx5("td", { children: t.fecha }),
            /* @__PURE__ */ jsx5("td", { children: db.instrumentos.find(
              (i) => String(i.id) === String(t.instrumento_id)
            )?.ticker || t.ticker || "\u2014" }),
            /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(
              Pill,
              {
                color: t.tipo === "compra" ? PALETTE[0] : PALETTE[2],
                children: t.tipo
              }
            ) }),
            /* @__PURE__ */ jsx5("td", { children: t.cantidad }),
            /* @__PURE__ */ jsx5("td", { children: money(t.precio, t.moneda || "USD") }),
            /* @__PURE__ */ jsx5("td", { children: /* @__PURE__ */ jsx5(EditActions, { resource: "transacciones", item: t }) })
          ] }, t.id)) })
        ] }),
        !db.transacciones.length && /* @__PURE__ */ jsx5("p", { className: "muted", children: "Todav\xEDa no registraste operaciones." })
      ] })
    ] })
  ] });
}
function ConfigEditor({ onClose }) {
  const { db, configSave } = useApp();
  const defaults = {
    dolar_mep: 0,
    dolar_oficial_compra: 0,
    fire_saldo_inicial: 0,
    fire_aporte_inicial: 0,
    fire_rentabilidad_anual: 5,
    fire_aumento_aporte: 0,
    tasa_ahorro_objetivo: 20
  };
  const [values, setValues] = useState5({ ...defaults, ...db.config }), [busy, setBusy] = useState5(false), [error, setError] = useState5("");
  const labels2 = {
    dolar_mep: "D\xF3lar MEP (ARS por USD)",
    dolar_oficial_compra: "D\xF3lar oficial compra",
    fire_saldo_inicial: "Capital FIRE inicial (USD)",
    fire_aporte_inicial: "Aporte FIRE inicial (USD / mes)",
    fire_rentabilidad_anual: "Rentabilidad FIRE anual (%)",
    fire_aumento_aporte: "Aumento mensual del aporte (%)",
    tasa_ahorro_objetivo: "Meta de ahorro (%)"
  };
  return /* @__PURE__ */ jsx5(Modal, { title: "Tu plan financiero", onClose: () => !busy && onClose(), children: /* @__PURE__ */ jsxs4(
    "form",
    {
      onSubmit: async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await configSave("config", values);
          onClose();
        } catch (e2) {
          setError(e2.message);
          setBusy(false);
        }
      },
      children: [
        /* @__PURE__ */ jsxs4("div", { className: "modal-body form-grid", children: [
          Object.entries(values).filter(
            ([k, v]) => !k.includes("actualizado") && !k.endsWith("_at") && typeof v !== "object"
          ).map(([key, value]) => /* @__PURE__ */ jsxs4("label", { className: "field", children: [
            /* @__PURE__ */ jsx5("span", { children: labels2[key] || key.replaceAll("_", " ") }),
            /* @__PURE__ */ jsx5(
              "input",
              {
                type: typeof value === "number" || Object.hasOwn(defaults, key) ? "number" : "text",
                step: "any",
                value: value ?? "",
                min: key === "fire_rentabilidad_anual" ? -99 : key === "fire_aumento_aporte" ? -99 : 0,
                onChange: (e) => setValues((v) => ({
                  ...v,
                  [key]: typeof value === "number" || Object.hasOwn(defaults, key) ? Number(e.target.value) : e.target.value
                }))
              }
            )
          ] }, key)),
          error && /* @__PURE__ */ jsx5("p", { role: "alert", className: "form-error full", children: error })
        ] }),
        /* @__PURE__ */ jsxs4("footer", { children: [
          /* @__PURE__ */ jsx5(Button, { type: "button", onClick: onClose, children: "Cancelar" }),
          /* @__PURE__ */ jsx5(Button, { variant: "primary", icon: Check3, disabled: busy, children: busy ? "Guardando\u2026" : "Guardar configuraci\xF3n" })
        ] })
      ]
    }
  ) });
}
var init_Finanzas = __esm({
  "src/Finanzas.jsx"() {
    init_store();
    init_ui();
    init_domain();
  }
});

// src/Agenda.jsx
var Agenda_exports = {};
__export(Agenda_exports, {
  default: () => Agenda
});
import React6, { useEffect as useEffect5, useRef as useRef4, useState as useState6 } from "react";
import {
  Plus as Plus4,
  CalendarDays,
  Sun,
  CheckSquare,
  ChartNoAxesCombined as ChartNoAxesCombined2,
  ChevronLeft as ChevronLeft2,
  ChevronRight as ChevronRight3,
  Check as Check4,
  Clock as Clock2,
  ArrowUpRight as ArrowUpRight4,
  GraduationCap,
  Download as Download2,
  LayoutGrid as LayoutGrid2,
  List as List2,
  Pin,
  Flame as Flame2,
  Calendar,
  ArrowRight as ArrowRight2
} from "lucide-react";
import { Fragment as Fragment3, jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function Agenda({ tab = "hoy", setTab }) {
  const app = useApp();
  const { db, setModal, mode, refresh } = app;
  const [date, setDate] = useState6(today()), [hidden, setHidden] = useState6([]), [week, setWeek] = useState6(false);
  const month = date.slice(0, 7);
  const events = db.eventos.filter(
    (e) => !hidden.includes(String(e.calendario_id))
  );
  useEffect5(() => {
    if (mode === "api")
      refresh("eventos", {
        fecha_desde: month + "-01",
        fecha_hasta: addDays(month + "-01", 42),
        desde: month + "-01",
        hasta: addDays(month + "-01", 42)
      });
  }, [month, mode]);
  return /* @__PURE__ */ jsxs5("div", { className: "page agenda-page", children: [
    /* @__PURE__ */ jsxs5("div", { className: "page-intro", children: [
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsxs5("div", { className: "eyebrow", children: [
          /* @__PURE__ */ jsx6("span", { className: "live-dot" }),
          " HAC\xC9 LUGAR A LO IMPORTANTE"
        ] }),
        /* @__PURE__ */ jsxs5("h1", { children: [
          "Tu tiempo, ",
          /* @__PURE__ */ jsx6("em", { children: "con intenci\xF3n." })
        ] }),
        /* @__PURE__ */ jsx6("p", { children: "Menos pendientes en la cabeza. M\xE1s espacio en tu d\xEDa." })
      ] }),
      /* @__PURE__ */ jsx6(
        Button,
        {
          variant: "primary",
          icon: Plus4,
          onClick: () => setModal({
            type: "form",
            resource: tab === "tareas" ? "tareas" : "eventos",
            defaults: tab === "tareas" ? { fecha_opcional: date } : {
              fecha_inicio: date + "T09:00",
              fecha_fin: date + "T10:00"
            }
          }),
          children: tab === "tareas" ? "Nueva tarea" : "Nuevo evento"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "module-toolbar", children: [
      /* @__PURE__ */ jsx6(
        Tabs,
        {
          value: tab,
          onChange: setTab,
          items: [
            ["hoy", "Mi d\xEDa", Sun],
            ["mes", "Calendario", CalendarDays],
            ["tareas", "Tareas", CheckSquare],
            ["revision", "Revisi\xF3n", ChartNoAxesCombined2]
          ]
        }
      ),
      /* @__PURE__ */ jsxs5("div", { className: "inline", children: [
        /* @__PURE__ */ jsx6(
          Button,
          {
            icon: GraduationCap,
            onClick: () => setModal({ type: "manager", resource: "facultad" }),
            children: "Facultad"
          }
        ),
        mode === "api" && /* @__PURE__ */ jsx6(
          IconButton,
          {
            icon: Download2,
            label: "Exportar calendario iCalendar",
            onClick: () => app.action(
              "/agenda/export.ics",
              "GET",
              void 0,
              "agenda-sgr.ics"
            ).catch(() => {
            })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx6(ErrorNotice, { keys: ["eventos", "tareas", "calendarios", "listas"] }),
    /* @__PURE__ */ jsxs5("div", { className: "agenda-layout", children: [
      /* @__PURE__ */ jsxs5("aside", { className: "agenda-sidebar", children: [
        /* @__PURE__ */ jsx6(MiniCalendar, { date, onChange: setDate }),
        /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
          /* @__PURE__ */ jsx6(SectionTitle, { title: "Mis calendarios", children: /* @__PURE__ */ jsx6(
            IconButton,
            {
              icon: Plus4,
              label: "Agregar calendario",
              onClick: () => setModal({ type: "form", resource: "calendarios" })
            }
          ) }),
          db.calendarios.map((c, i) => /* @__PURE__ */ jsxs5(
            "label",
            {
              className: "calendar-toggle",
              style: { "--check-color": c.color || PALETTE[i % 6] },
              children: [
                /* @__PURE__ */ jsx6(
                  "input",
                  {
                    type: "checkbox",
                    checked: !hidden.includes(String(c.id)),
                    onChange: () => setHidden(
                      (h) => h.includes(String(c.id)) ? h.filter((x) => x !== String(c.id)) : [...h, String(c.id)]
                    )
                  }
                ),
                /* @__PURE__ */ jsx6("span", { children: c.nombre }),
                /* @__PURE__ */ jsx6(
                  "span",
                  {
                    className: "color-dot",
                    style: { background: c.color || PALETTE[i % 6] }
                  }
                )
              ]
            },
            c.id
          )),
          !db.calendarios.length && /* @__PURE__ */ jsx6("p", { className: "small muted", children: "Cre\xE1 un calendario para tus eventos." }),
          /* @__PURE__ */ jsxs5(
            "button",
            {
              className: "text-button",
              onClick: () => setModal({ type: "manager", resource: "calendarios" }),
              children: [
                "Administrar calendarios ",
                /* @__PURE__ */ jsx6(ArrowRight2, { size: 14 })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
          /* @__PURE__ */ jsx6(
            SectionTitle,
            {
              title: "H\xE1bitos del d\xEDa",
              eyebrow: "PEQUE\xD1AS VICTORIAS"
            }
          ),
          db.habitos.filter((h) => scheduled(h, date)).map((h) => {
            const record = recordFor(db.registros, h.id, date);
            return /* @__PURE__ */ jsxs5("div", { className: "habit-quick", children: [
              /* @__PURE__ */ jsx6(
                "button",
                {
                  className: `check-circle ${record ? "checked" : ""}`,
                  disabled: date > today(),
                  "aria-label": `${record ? "Desmarcar" : "Completar"} ${h.nombre}`,
                  style: { "--check-color": h.color },
                  onClick: () => {
                    (record ? app.mutate("registros", "delete", record) : app.mutate("registros", "record", {
                      habito_id: h.id,
                      fecha: date,
                      valor: 1,
                      nota: ""
                    })).catch(() => {
                    });
                  },
                  children: record && /* @__PURE__ */ jsx6(Check4, { size: 13 })
                }
              ),
              /* @__PURE__ */ jsx6("span", { children: h.nombre }),
              h.hora && /* @__PURE__ */ jsx6("small", { children: h.hora })
            ] }, h.id);
          }),
          !db.habitos.some((h) => scheduled(h, date)) && /* @__PURE__ */ jsx6("p", { className: "muted small", children: "No hay h\xE1bitos programados para este d\xEDa." })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "agenda-quote", children: [
          /* @__PURE__ */ jsx6("span", { children: "\u2733" }),
          /* @__PURE__ */ jsxs5("p", { children: [
            "No se trata de hacer m\xE1s.",
            /* @__PURE__ */ jsx6("br", {}),
            /* @__PURE__ */ jsx6("strong", { children: "Se trata de hacer espacio." })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs5("main", { className: "agenda-main", children: [
        tab === "hoy" && /* @__PURE__ */ jsxs5(Fragment3, { children: [
          /* @__PURE__ */ jsxs5("div", { className: "panel agenda-day-header", children: [
            /* @__PURE__ */ jsxs5("div", { children: [
              /* @__PURE__ */ jsx6("span", { className: "eyebrow", children: date === today() ? "HOY ES UN BUEN D\xCDA" : labelDate(date, { weekday: "long" }) }),
              /* @__PURE__ */ jsxs5("h2", { children: [
                labelDate(date, { day: "numeric", month: "long" }),
                /* @__PURE__ */ jsxs5("span", { className: "muted", children: [
                  " / ",
                  date.slice(0, 4)
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "inline", children: [
              /* @__PURE__ */ jsx6(
                IconButton,
                {
                  icon: ChevronLeft2,
                  label: "D\xEDa anterior",
                  onClick: () => setDate(addDays(date, -1))
                }
              ),
              /* @__PURE__ */ jsx6(Button, { onClick: () => setDate(today()), children: "Hoy" }),
              /* @__PURE__ */ jsx6(
                IconButton,
                {
                  icon: ChevronRight3,
                  label: "D\xEDa siguiente",
                  onClick: () => setDate(addDays(date, 1))
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx6(DayTimeline, { date, events }),
          /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
            /* @__PURE__ */ jsx6(
              SectionTitle,
              {
                title: "Pr\xF3ximos pasos",
                eyebrow: "PENDIENTES \xB7 PR\xD3XIMOS 15 D\xCDAS",
                children: /* @__PURE__ */ jsx6(
                  Button,
                  {
                    icon: Plus4,
                    onClick: () => setModal({
                      type: "form",
                      resource: "tareas",
                      defaults: { fecha_opcional: date }
                    }),
                    children: "Tarea"
                  }
                )
              }
            ),
            /* @__PURE__ */ jsx6(QuickTask, { date }),
            db.tareas.filter(
              (t) => !t.completada && (!dateOf(t) || dateOf(t) <= addDays(date, 15))
            ).slice(0, 15).map((t) => /* @__PURE__ */ jsx6(TaskRow, { task: t }, t.id))
          ] })
        ] }),
        tab === "mes" && /* @__PURE__ */ jsxs5("div", { className: "panel month-panel", children: [
          /* @__PURE__ */ jsxs5(
            SectionTitle,
            {
              title: labelDate(date, { month: "long", year: "numeric" }),
              children: [
                /* @__PURE__ */ jsx6(
                  MonthPicker,
                  {
                    value: month,
                    onChange: (m) => setDate(m + "-01")
                  }
                ),
                /* @__PURE__ */ jsx6(Button, { onClick: () => setWeek((v) => !v), children: week ? "Ver mes" : "Ver semana" })
              ]
            }
          ),
          week ? /* @__PURE__ */ jsx6("div", { className: "week-board", children: calendarDays(month).filter((d) => {
            const start = addDays(
              date,
              -((/* @__PURE__ */ new Date(date + "T12:00:00")).getDay() + 6) % 7
            );
            return d >= start && d <= addDays(start, 6);
          }).map((d) => /* @__PURE__ */ jsxs5("div", { children: [
            /* @__PURE__ */ jsx6(
              "button",
              {
                className: `week-day ${d === today() ? "today" : ""}`,
                onClick: () => {
                  setDate(d);
                  setTab("hoy");
                },
                children: labelDate(d, { weekday: "short", day: "numeric" })
              }
            ),
            events.filter(
              (e) => String(e.fecha_inicio).slice(0, 10) <= d && String(e.fecha_fin).slice(0, 10) >= d
            ).map((e) => /* @__PURE__ */ jsx6(EventChip, { event: e }, e.id)),
            db.tareas.filter((t) => dateOf(t) === d).map((t) => /* @__PURE__ */ jsx6(TaskRow, { task: t, compact: true }, t.id)),
            /* @__PURE__ */ jsxs5(
              "button",
              {
                className: "text-button",
                onClick: () => setModal({
                  type: "form",
                  resource: "eventos",
                  defaults: {
                    fecha_inicio: d + "T09:00",
                    fecha_fin: d + "T10:00"
                  }
                }),
                children: [
                  /* @__PURE__ */ jsx6(Plus4, { size: 14 }),
                  "Evento"
                ]
              }
            )
          ] }, d)) }) : /* @__PURE__ */ jsxs5("div", { className: "month-grid", children: [
            weekdays.map((d) => /* @__PURE__ */ jsx6("div", { className: "weekday-label", children: d }, d)),
            calendarDays(month).map((d) => /* @__PURE__ */ jsxs5(
              "div",
              {
                className: `month-cell ${d.slice(0, 7) !== month ? "outside" : ""} ${d === today() ? "today" : ""}`,
                children: [
                  /* @__PURE__ */ jsxs5(
                    "button",
                    {
                      className: "day-number",
                      "aria-label": `Crear evento el ${labelDate(d)}`,
                      onClick: () => setModal({
                        type: "form",
                        resource: "eventos",
                        defaults: {
                          fecha_inicio: d + "T09:00",
                          fecha_fin: d + "T10:00"
                        }
                      }),
                      children: [
                        Number(d.slice(-2)),
                        /* @__PURE__ */ jsx6(Plus4, { size: 12 })
                      ]
                    }
                  ),
                  events.filter(
                    (e) => String(e.fecha_inicio).slice(0, 10) <= d && String(e.fecha_fin).slice(0, 10) >= d
                  ).map((e) => /* @__PURE__ */ jsx6(EventChip, { event: e }, e.id)),
                  db.tareas.filter((t) => dateOf(t) === d).map((t) => /* @__PURE__ */ jsxs5(
                    "button",
                    {
                      className: `task-chip ${t.completada ? "done" : ""}`,
                      onClick: () => setModal({
                        type: "form",
                        resource: "tareas",
                        item: t
                      }),
                      children: [
                        /* @__PURE__ */ jsx6(CheckSquare, { size: 11 }),
                        t.titulo
                      ]
                    },
                    t.id
                  ))
                ]
              },
              d
            ))
          ] })
        ] }),
        tab === "tareas" && /* @__PURE__ */ jsx6(Tasks, {}),
        tab === "revision" && /* @__PURE__ */ jsx6(Review, { date, onDate: setDate })
      ] })
    ] })
  ] });
}
function MiniCalendar({ date, onChange }) {
  const m = date.slice(0, 7);
  return /* @__PURE__ */ jsxs5("div", { className: "panel mini-calendar", children: [
    /* @__PURE__ */ jsx6(MonthPicker, { value: m, onChange: (month) => onChange(month + "-01") }),
    /* @__PURE__ */ jsxs5("div", { children: [
      weekdays.map((d) => /* @__PURE__ */ jsx6("span", { children: d[0] }, d)),
      calendarDays(m).map((d) => /* @__PURE__ */ jsx6(
        "button",
        {
          className: `${d === date ? "selected" : ""} ${d === today() ? "today" : ""} ${d.slice(0, 7) !== m ? "outside" : ""}`,
          "aria-label": labelDate(d, {
            day: "numeric",
            month: "long",
            year: "numeric"
          }),
          "aria-pressed": d === date,
          onClick: () => onChange(d),
          children: Number(d.slice(-2))
        },
        d
      ))
    ] })
  ] });
}
function EventChip({ event }) {
  const { db, setModal } = useApp();
  const c = db.calendarios.find(
    (c2) => String(c2.id) === String(event.calendario_id)
  );
  return /* @__PURE__ */ jsxs5(
    "button",
    {
      className: "event-chip",
      style: { "--event-color": c?.color || PALETTE[1] },
      title: `${event.titulo} \xB7 ${event.fecha_inicio?.slice(11, 16) || ""}`,
      onClick: () => setModal({ type: "form", resource: "eventos", item: event }),
      children: [
        !event.todo_el_dia && /* @__PURE__ */ jsx6("span", { children: event.fecha_inicio?.slice(11, 16) }),
        event.titulo
      ]
    }
  );
}
function DayTimeline({ date, events }) {
  const { db, setModal } = useApp();
  const scroller = useRef4();
  const [now, setNow] = useState6(/* @__PURE__ */ new Date());
  useEffect5(() => {
    const timer = setInterval(() => setNow(/* @__PURE__ */ new Date()), 6e4);
    return () => clearInterval(timer);
  }, []);
  useEffect5(() => {
    if (scroller.current)
      scroller.current.scrollTop = Math.max(
        0,
        ((date === today() ? (/* @__PURE__ */ new Date()).getHours() : 9) - 7) * 64
      );
  }, [date]);
  const dayEvents = events.filter(
    (e) => String(e.fecha_inicio).slice(0, 10) <= date && String(e.fecha_fin).slice(0, 10) >= date
  );
  const items = [
    ...dayEvents.filter((e) => !e.todo_el_dia).map((e) => ({
      item: e,
      resource: "eventos",
      label: e.titulo,
      start: e.fecha_inicio?.slice(0, 10) < date ? "06:00" : e.fecha_inicio?.slice(11, 16),
      end: e.fecha_fin?.slice(0, 10) > date ? "24:00" : e.fecha_fin?.slice(11, 16),
      color: db.calendarios.find((c) => String(c.id) === String(e.calendario_id))?.color || PALETTE[1]
    })),
    ...db.tareas.filter((t) => dateOf(t) === date && t.hora_bloque).map((t) => ({
      item: t,
      resource: "tareas",
      label: t.titulo,
      start: t.hora_bloque,
      duration: num(t.duracion_estimada) || 30,
      color: PALETTE[2]
    })),
    ...db.habitos.filter((h) => h.hora && scheduled(h, date)).map((h) => ({
      item: h,
      resource: "habitos",
      label: h.nombre,
      start: h.hora,
      duration: 30,
      color: h.color || PALETTE[0]
    })),
    ...db.facultad.filter(
      (f2) => Number(f2.dia_semana) === (/* @__PURE__ */ new Date(date + "T12:00:00")).getDay()
    ).map((f2) => ({
      item: f2,
      resource: "facultad",
      label: f2.nombre || f2.materia,
      start: f2.hora_inicio,
      end: f2.hora_fin,
      color: f2.color || PALETTE[3]
    }))
  ].map((b) => {
    const minutes = (s) => {
      const [h, m] = String(s || "09:00").split(":").map(Number);
      return h * 60 + m;
    };
    const start = Math.max(360, minutes(b.start)), end2 = Math.min(
      1440,
      b.end ? minutes(b.end) : minutes(b.start) + b.duration
    );
    return { ...b, startMin: start, endMin: end2 };
  }).filter((b) => b.endMin > b.startMin).sort((a, b) => a.startMin - b.startMin);
  let cluster = [], end = 0;
  const finish = () => {
    const width = Math.max(1, ...cluster.map((b) => b.lane + 1));
    cluster.forEach((b) => b.lanes = width);
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
  return /* @__PURE__ */ jsxs5("div", { className: "panel timeline-panel", children: [
    !!dayEvents.filter((e) => e.todo_el_dia).length && /* @__PURE__ */ jsxs5("div", { className: "all-day", children: [
      /* @__PURE__ */ jsx6("span", { children: "TODO EL D\xCDA" }),
      dayEvents.filter((e) => e.todo_el_dia).map((e) => /* @__PURE__ */ jsx6(EventChip, { event: e }, e.id))
    ] }),
    /* @__PURE__ */ jsx6("div", { className: "timeline-scroll", ref: scroller, children: /* @__PURE__ */ jsxs5("div", { className: "day-timeline", children: [
      Array.from({ length: 18 }, (_, i) => i + 6).map((h) => /* @__PURE__ */ jsxs5("div", { className: "hour-row", children: [
        /* @__PURE__ */ jsxs5("span", { children: [
          String(h).padStart(2, "0"),
          ":00"
        ] }),
        /* @__PURE__ */ jsx6(
          "button",
          {
            "aria-label": `Crear evento a las ${h} horas`,
            onClick: () => setModal({
              type: "form",
              resource: "eventos",
              defaults: {
                fecha_inicio: date + `T${String(h).padStart(2, "0")}:00`,
                fecha_fin: h === 23 ? addDays(date, 1) + "T00:00" : date + `T${String(h + 1).padStart(2, "0")}:00`
              }
            }),
            children: /* @__PURE__ */ jsx6(Plus4, { size: 14 })
          }
        )
      ] }, h)),
      items.map((b) => /* @__PURE__ */ jsxs5(
        "button",
        {
          className: `time-block ${b.resource === "facultad" ? "faculty" : ""} ${b.item.completada ? "completed" : ""}`,
          style: {
            top: (b.startMin - 360) / 60 * 64,
            height: Math.max(27, (b.endMin - b.startMin) / 60 * 64 - 4),
            left: `calc(68px + (100% - 78px) * ${b.lane / b.lanes})`,
            width: `calc((100% - 78px) / ${b.lanes} - 5px)`,
            "--event-color": b.color
          },
          onClick: () => setModal({ type: "form", resource: b.resource, item: b.item }),
          children: [
            /* @__PURE__ */ jsxs5("span", { children: [
              b.start,
              b.end ? " \u2014 " + b.end : ""
            ] }),
            /* @__PURE__ */ jsx6("strong", { children: b.label }),
            b.resource === "facultad" && /* @__PURE__ */ jsx6("small", { children: "Facultad" })
          ]
        },
        `${b.resource}-${b.item.id}`
      )),
      date === today() && now.getHours() >= 6 && /* @__PURE__ */ jsxs5(
        "div",
        {
          className: "now-line",
          style: {
            top: ((now.getHours() - 6) * 60 + now.getMinutes()) / 60 * 64
          },
          children: [
            /* @__PURE__ */ jsx6("span", {}),
            /* @__PURE__ */ jsx6("b", { children: now.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit"
            }) })
          ]
        }
      )
    ] }) })
  ] });
}
function QuickTask({ date, listId }) {
  const { mutate, notify } = useApp();
  const [value, setValue] = useState6(""), [busy, setBusy] = useState6(false);
  return /* @__PURE__ */ jsxs5(
    "form",
    {
      className: "quick-task",
      onSubmit: async (e) => {
        e.preventDefault();
        if (!value.trim() || busy) return;
        setBusy(true);
        try {
          await mutate("tareas", "save", {
            titulo: value.trim(),
            completada: false,
            ...date ? { fecha_opcional: date } : {},
            ...listId ? { lista_id: listId } : {}
          });
          setValue("");
        } catch {
        } finally {
          setBusy(false);
        }
      },
      children: [
        /* @__PURE__ */ jsx6(Plus4, { size: 17 }),
        /* @__PURE__ */ jsx6(
          "input",
          {
            "aria-label": "Agregar tarea r\xE1pida",
            placeholder: "Algo que quer\xE9s hacer\u2026",
            value,
            onChange: (e) => setValue(e.target.value),
            maxLength: 250
          }
        ),
        /* @__PURE__ */ jsx6("button", { disabled: !value.trim() || busy, "aria-label": "Guardar tarea", children: /* @__PURE__ */ jsx6(ArrowUpRight4, { size: 17 }) })
      ]
    }
  );
}
function TaskRow({ task, compact = false }) {
  const { mutate, db } = useApp();
  const [busy, setBusy] = useState6(false);
  const date = dateOf(task), overdue = date && date < today() && !task.completada;
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      className: `task-row ${task.completada ? "completed" : ""} ${compact ? "compact" : ""}`,
      children: [
        /* @__PURE__ */ jsx6(
          "button",
          {
            className: `check-circle ${task.completada ? "checked" : ""}`,
            disabled: busy,
            "aria-label": `${task.completada ? "Desmarcar" : "Completar"} ${task.titulo}`,
            onClick: async () => {
              setBusy(true);
              try {
                await mutate("tareas", "save", {
                  id: task.id,
                  completada: !task.completada
                });
              } catch {
              } finally {
                setBusy(false);
              }
            },
            children: !!task.completada && /* @__PURE__ */ jsx6(Check4, { size: 13 })
          }
        ),
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx6("strong", { children: task.titulo }),
          !compact && /* @__PURE__ */ jsxs5("small", { className: overdue ? "negative" : "muted", children: [
            date ? date === today() ? "Hoy" : labelDate(date) : "Sin fecha",
            task.hora_bloque ? " \xB7 " + task.hora_bloque : "",
            overdue ? " \xB7 Vencida" : ""
          ] })
        ] }),
        !compact && /* @__PURE__ */ jsx6(EditActions, { resource: "tareas", item: task })
      ]
    }
  );
}
function Tasks() {
  const { db, setModal, mutate } = useApp();
  const [query, setQuery] = useState6(""), [filter, setFilter] = useState6("pending"), [list, setList] = useState6("all"), [canvas, setCanvas] = useState6(true);
  const tasks = db.tareas.filter(
    (t) => (filter === "all" || (filter === "done" ? !!t.completada : !t.completada)) && (!query || title(t).toLowerCase().includes(query.toLowerCase())) && (list === "all" || list === "undated" ? !dateOf(t) || list === "all" : String(t.lista_id) === list)
  );
  const groups = [...db.listas].sort(
    (a, b) => Number(b.pinned || false) - Number(a.pinned || false)
  );
  if (tasks.some((t) => !t.lista_id))
    groups.push({ id: "none", nombre: "Sin lista", color: PALETTE[5] });
  return /* @__PURE__ */ jsxs5("div", { className: "panel tasks-panel", children: [
    /* @__PURE__ */ jsxs5(
      SectionTitle,
      {
        title: "Dale forma a tus pendientes",
        eyebrow: "UN PASO A LA VEZ",
        children: [
          /* @__PURE__ */ jsx6(
            Button,
            {
              icon: Plus4,
              onClick: () => setModal({ type: "form", resource: "listas" }),
              children: "Lista"
            }
          ),
          /* @__PURE__ */ jsx6(
            IconButton,
            {
              icon: canvas ? List2 : LayoutGrid2,
              label: canvas ? "Ver como lista" : "Ver como tarjetas",
              onClick: () => setCanvas((v) => !v)
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxs5("div", { className: "table-filters", children: [
      /* @__PURE__ */ jsx6(
        SearchBox,
        {
          value: query,
          onChange: setQuery,
          placeholder: "Encontrar una tarea\u2026"
        }
      ),
      /* @__PURE__ */ jsxs5(
        "select",
        {
          "aria-label": "Estado de tareas",
          value: filter,
          onChange: (e) => setFilter(e.target.value),
          children: [
            /* @__PURE__ */ jsx6("option", { value: "pending", children: "Pendientes" }),
            /* @__PURE__ */ jsx6("option", { value: "done", children: "Completadas" }),
            /* @__PURE__ */ jsx6("option", { value: "all", children: "Todas" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs5(
        "select",
        {
          "aria-label": "Lista de tareas",
          value: list,
          onChange: (e) => setList(e.target.value),
          children: [
            /* @__PURE__ */ jsx6("option", { value: "all", children: "Todas las listas" }),
            /* @__PURE__ */ jsx6("option", { value: "undated", children: "Sin fecha" }),
            db.listas.map((l) => /* @__PURE__ */ jsx6("option", { value: l.id, children: l.nombre }, l.id))
          ]
        }
      )
    ] }),
    canvas ? /* @__PURE__ */ jsx6("div", { className: "task-canvas", children: groups.filter(
      (l) => list === "all" || list === "undated" || String(l.id) === list
    ).map((l, i) => /* @__PURE__ */ jsxs5(
      "div",
      {
        className: "task-list-card",
        style: { "--list-color": l.color || PALETTE[i % 6] },
        children: [
          /* @__PURE__ */ jsxs5("div", { className: "inline spread", children: [
            /* @__PURE__ */ jsxs5("h3", { children: [
              l.nombre,
              " ",
              /* @__PURE__ */ jsx6("span", { className: "count", children: tasks.filter(
                (t) => l.id === "none" ? !t.lista_id : String(t.lista_id) === String(l.id)
              ).length })
            ] }),
            l.id !== "none" && /* @__PURE__ */ jsxs5("div", { className: "inline", children: [
              /* @__PURE__ */ jsx6(
                IconButton,
                {
                  icon: Pin,
                  label: l.pinned ? "Desfijar lista" : "Fijar lista",
                  onClick: () => mutate("listas", "save", {
                    id: l.id,
                    pinned: !l.pinned
                  }).catch(() => {
                  })
                }
              ),
              /* @__PURE__ */ jsx6(EditActions, { resource: "listas", item: l })
            ] })
          ] }),
          tasks.filter(
            (t) => l.id === "none" ? !t.lista_id : String(t.lista_id) === String(l.id)
          ).map((t) => /* @__PURE__ */ jsx6(TaskRow, { task: t }, t.id)),
          list !== "undated" && /* @__PURE__ */ jsx6(QuickTask, { listId: l.id === "none" ? null : l.id })
        ]
      },
      l.id
    )) }) : /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsx6(
        QuickTask,
        {
          listId: list === "all" || list === "undated" ? null : list
        }
      ),
      tasks.map((t) => /* @__PURE__ */ jsx6(TaskRow, { task: t }, t.id))
    ] }),
    !db.tareas.length && !db.listas.length && /* @__PURE__ */ jsx6(
      Empty,
      {
        icon: CheckSquare,
        title: "De la cabeza a tu lista.",
        text: "Anot\xE1 lo pendiente. Eleg\xED el pr\xF3ximo paso. Lo dem\xE1s puede esperar.",
        action: "Crear primera tarea",
        onAction: () => setModal({ type: "form", resource: "tareas" })
      }
    ),
    /* @__PURE__ */ jsxs5(
      "button",
      {
        className: "text-button",
        onClick: () => setModal({ type: "manager", resource: "listas" }),
        children: [
          "Administrar listas ",
          /* @__PURE__ */ jsx6(ArrowRight2, { size: 14 })
        ]
      }
    )
  ] });
}
function Review({ date, onDate }) {
  const { db } = useApp();
  const start = addDays(date, -((/* @__PURE__ */ new Date(date + "T12:00:00")).getDay() + 6) % 7), end = addDays(start, 6);
  const tasks = db.tareas.filter((t) => dateOf(t) >= start && dateOf(t) <= end);
  const completed = tasks.filter((t) => t.completada);
  const overdue = db.tareas.filter(
    (t) => !t.completada && dateOf(t) && dateOf(t) < addDays(today(), -7)
  );
  const events = db.eventos.filter(
    (e) => e.fecha_inicio?.slice(0, 10) >= start && e.fecha_inicio?.slice(0, 10) <= end && !e.todo_el_dia
  );
  const duration = events.reduce(
    (s, e) => s + Math.max(0, (new Date(e.fecha_fin) - new Date(e.fecha_inicio)) / 6e4),
    0
  ) + tasks.filter((t) => t.hora_bloque).reduce((s, t) => s + num(t.duracion_estimada), 0);
  const financial = totals(
    db.movimientos.filter((m) => m.fecha >= start && m.fecha <= end),
    db.finCategorias
  );
  const exportReview = () => download(
    `# Revisi\xF3n semanal SGR
${start} \u2014 ${end}

- Tareas completadas: ${completed.length} / ${tasks.length}
- Tiempo planificado: ${Math.round(duration / 60)} horas
- Ingresos: ${money(financial.in)}
- Gastos: ${money(financial.out)}

## Completadas
${completed.map((t) => "- [x] " + t.titulo).join("\n")}

## Pendientes
${tasks.filter((t) => !t.completada).map((t) => "- [ ] " + t.titulo).join("\n")}`,
    `revision-${start}.md`
  );
  return /* @__PURE__ */ jsxs5(Fragment3, { children: [
    /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
      /* @__PURE__ */ jsxs5(
        SectionTitle,
        {
          title: "Una pausa para mirar atr\xE1s",
          eyebrow: "REVISI\xD3N SEMANAL",
          children: [
            /* @__PURE__ */ jsx6(
              IconButton,
              {
                icon: ChevronLeft2,
                label: "Semana anterior",
                onClick: () => onDate(addDays(date, -7))
              }
            ),
            /* @__PURE__ */ jsxs5("span", { className: "muted small", children: [
              labelDate(start),
              " \u2014 ",
              labelDate(end)
            ] }),
            /* @__PURE__ */ jsx6(
              IconButton,
              {
                icon: ChevronRight3,
                label: "Semana siguiente",
                onClick: () => onDate(addDays(date, 7))
              }
            ),
            /* @__PURE__ */ jsx6(Button, { icon: Download2, onClick: exportReview, children: "Exportar" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs5("div", { className: "stats-grid", children: [
        /* @__PURE__ */ jsx6(
          Stat,
          {
            label: "Tareas completadas",
            value: `${completed.length} / ${tasks.length}`,
            icon: CheckSquare
          }
        ),
        /* @__PURE__ */ jsx6(
          Stat,
          {
            label: "Tiempo planificado",
            value: `${Math.round(duration / 60)} h`,
            foot: `${Math.round(duration / 6720 * 100)}% de 112 horas despierto`,
            icon: Clock2,
            color: "var(--lavender)"
          }
        ),
        /* @__PURE__ */ jsx6(
          Stat,
          {
            label: "Balance semanal ARS",
            value: money(financial.net),
            color: "var(--peach)"
          }
        )
      ] }),
      /* @__PURE__ */ jsx6("div", { className: "week-activity", children: Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i), all = tasks.filter((t) => dateOf(t) === day), done = all.filter((t) => t.completada).length;
        return /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx6("div", { className: "activity-bar", children: /* @__PURE__ */ jsx6(
            "span",
            {
              style: {
                height: `${all.length ? done / all.length * 100 : 0}%`
              }
            }
          ) }),
          /* @__PURE__ */ jsx6("strong", { children: done }),
          /* @__PURE__ */ jsx6("small", { children: weekdays[i] })
        ] }, day);
      }) })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
      /* @__PURE__ */ jsx6(
        SectionTitle,
        {
          title: "Pendientes que piden atenci\xF3n",
          eyebrow: "VENCIDAS HACE M\xC1S DE 7 D\xCDAS"
        }
      ),
      overdue.map((t) => /* @__PURE__ */ jsx6(TaskRow, { task: t }, t.id)),
      !overdue.length && /* @__PURE__ */ jsxs5("div", { className: "review-success", children: [
        /* @__PURE__ */ jsx6(Check4, { size: 27 }),
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx6("h3", { children: "Un poco m\xE1s de liviandad." }),
          /* @__PURE__ */ jsx6("p", { children: "No ten\xE9s tareas vencidas hace m\xE1s de una semana." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "panel", children: [
      /* @__PURE__ */ jsx6(SectionTitle, { title: "C\xF3mo distribuiste tu tiempo" }),
      db.calendarios.map((c, i) => {
        const mins = events.filter((e) => String(e.calendario_id) === String(c.id)).reduce(
          (s, e) => s + (new Date(e.fecha_fin) - new Date(e.fecha_inicio)) / 6e4,
          0
        );
        return /* @__PURE__ */ jsxs5("div", { className: "distribution-row", children: [
          /* @__PURE__ */ jsx6("span", { children: c.nombre }),
          /* @__PURE__ */ jsx6(
            Progress,
            {
              value: duration ? mins / duration * 100 : 0,
              color: c.color || PALETTE[i % 6]
            }
          ),
          /* @__PURE__ */ jsxs5("strong", { children: [
            (mins / 60).toFixed(1),
            " h"
          ] })
        ] }, c.id);
      })
    ] })
  ] });
}
var weekdays;
var init_Agenda = __esm({
  "src/Agenda.jsx"() {
    init_store();
    init_ui();
    init_domain();
    weekdays = ["Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b", "Dom"];
  }
});

// src/Habitos.jsx
var Habitos_exports = {};
__export(Habitos_exports, {
  default: () => Habitos
});
import React7, { useEffect as useEffect6, useMemo as useMemo3, useState as useState7 } from "react";
import {
  Plus as Plus5,
  Flame as Flame3,
  Check as Check5,
  CalendarDays as CalendarDays2,
  ChartNoAxesCombined as ChartNoAxesCombined3,
  History,
  Target as Target2,
  Sparkles as Sparkles2,
  ArrowUpRight as ArrowUpRight5,
  Trash2 as Trash22,
  Minus,
  Leaf,
  TrendingUp as TrendingUp2
} from "lucide-react";
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
function Habitos({ tab = "hoy", setTab }) {
  const app = useApp();
  const { db, setModal, mode, refresh } = app;
  const [month, setMonth] = useState7(today().slice(0, 7)), [selected, setSelected] = useState7(null), [checkin, setCheckin] = useState7(null), [category, setCategory] = useState7("all"), [archived, setArchived] = useState7(false);
  useEffect6(() => {
    if (mode === "api")
      refresh("registros", {
        fecha_desde: addDays(month + "-01", -190),
        fecha_hasta: `${month}-${monthDays(month)}`
      });
  }, [month, mode]);
  const habits = db.habitos.filter(
    (h) => (archived || h.activo !== false && h.activo !== 0 && !h.archivado_en) && (category === "all" || h.categoria === category)
  );
  const scheduledToday = habits.filter((h) => scheduled(h, today()));
  const done = scheduledToday.reduce(
    (s, h) => s + num(recordFor(db.registros, h.id, today())?.valor),
    0
  );
  const pct = scheduledToday.length ? Math.round(done / scheduledToday.length * 100) : 0;
  const chosen = habits.find((h) => String(h.id) === String(selected));
  const stats = habits.map((h) => ({
    habit: h,
    ...habitStats(h, db.registros, month)
  }));
  const best = Math.max(0, ...stats.map((s) => s.streak));
  return /* @__PURE__ */ jsxs6("div", { className: "page habits-page", children: [
    /* @__PURE__ */ jsxs6("div", { className: "page-intro", children: [
      /* @__PURE__ */ jsxs6("div", { children: [
        /* @__PURE__ */ jsxs6("div", { className: "eyebrow", children: [
          /* @__PURE__ */ jsx7("span", { className: "live-dot" }),
          " EL PODER DE VOLVER A EMPEZAR"
        ] }),
        /* @__PURE__ */ jsxs6("h1", { children: [
          "Peque\xF1os pasos. ",
          /* @__PURE__ */ jsx7("em", { children: "Grandes cambios." })
        ] }),
        /* @__PURE__ */ jsx7("p", { children: "No busc\xE1s la perfecci\xF3n. Est\xE1s construyendo tu propia constancia." })
      ] }),
      /* @__PURE__ */ jsx7(
        Button,
        {
          variant: "primary",
          icon: Plus5,
          onClick: () => setModal({ type: "form", resource: "habitos" }),
          children: "Nuevo h\xE1bito"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "module-toolbar", children: [
      /* @__PURE__ */ jsx7(
        Tabs,
        {
          value: tab,
          onChange: setTab,
          items: [
            ["hoy", "Mi constancia", CalendarDays2],
            ["progreso", "Progreso", ChartNoAxesCombined3],
            ["historial", "Historial", History]
          ]
        }
      ),
      /* @__PURE__ */ jsxs6("div", { className: "inline", children: [
        /* @__PURE__ */ jsxs6(
          "select",
          {
            "aria-label": "Categor\xEDa de h\xE1bitos",
            value: category,
            onChange: (e) => setCategory(e.target.value),
            children: [
              /* @__PURE__ */ jsx7("option", { value: "all", children: "Todas las categor\xEDas" }),
              [
                ...new Set(db.habitos.map((h) => h.categoria).filter(Boolean))
              ].map((c) => /* @__PURE__ */ jsx7("option", { children: c }, c))
            ]
          }
        ),
        /* @__PURE__ */ jsx7(MonthPicker, { value: month, onChange: setMonth })
      ] })
    ] }),
    /* @__PURE__ */ jsx7(ErrorNotice, { keys: ["habitos", "registros"] }),
    /* @__PURE__ */ jsxs6("div", { className: "habits-layout", children: [
      /* @__PURE__ */ jsxs6("main", { className: "habits-main", children: [
        /* @__PURE__ */ jsxs6("div", { className: "habit-banner", children: [
          /* @__PURE__ */ jsxs6("div", { children: [
            /* @__PURE__ */ jsx7("span", { className: "eyebrow", children: "CADA VEZ QUE VOLV\xC9S, CUENTA." }),
            /* @__PURE__ */ jsxs6("h2", { children: [
              "Hoy tambi\xE9n es",
              /* @__PURE__ */ jsx7("br", {}),
              /* @__PURE__ */ jsx7("em", { children: "una oportunidad." })
            ] }),
            /* @__PURE__ */ jsx7("p", { children: scheduledToday.length ? `${done} de ${scheduledToday.length} h\xE1bitos completados hoy.` : "Empez\xE1 con algo peque\xF1o que quieras repetir." })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "daily-ring", children: [
            /* @__PURE__ */ jsxs6("svg", { viewBox: "0 0 160 160", children: [
              /* @__PURE__ */ jsx7(
                "circle",
                {
                  cx: "80",
                  cy: "80",
                  r: "64",
                  fill: "none",
                  stroke: "currentColor",
                  strokeOpacity: ".1",
                  strokeWidth: "9"
                }
              ),
              /* @__PURE__ */ jsx7(
                "circle",
                {
                  cx: "80",
                  cy: "80",
                  r: "64",
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: "9",
                  strokeLinecap: "round",
                  strokeDasharray: `${pct / 100 * 402} 402`,
                  transform: "rotate(-90 80 80)"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs6("div", { children: [
              /* @__PURE__ */ jsxs6("strong", { children: [
                pct,
                /* @__PURE__ */ jsx7("span", { children: "%" })
              ] }),
              /* @__PURE__ */ jsx7("small", { children: "TU D\xCDA, EN MARCHA" })
            ] }),
            /* @__PURE__ */ jsx7("span", { className: "ring-spark", children: "\u2733" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "stats-grid", children: [
          /* @__PURE__ */ jsx7(
            Stat,
            {
              label: "H\xE1bitos activos",
              value: habits.length,
              icon: Leaf,
              color: "var(--lime)"
            }
          ),
          /* @__PURE__ */ jsx7(
            Stat,
            {
              label: "Mejor racha actual",
              value: `${best} d\xEDas`,
              icon: Flame3,
              color: "var(--peach)"
            }
          ),
          /* @__PURE__ */ jsx7(
            Stat,
            {
              label: "Constancia del mes",
              value: `${stats.length ? Math.round(stats.reduce((a, s) => a + s.percent, 0) / stats.length) : 0}%`,
              icon: TrendingUp2,
              color: "var(--lavender)"
            }
          )
        ] }),
        !habits.length ? /* @__PURE__ */ jsx7("div", { className: "panel", children: /* @__PURE__ */ jsx7(
          Empty,
          {
            icon: Leaf,
            title: "Un peque\xF1o compromiso con vos.",
            text: "Eleg\xED un h\xE1bito simple. Repetilo a tu ritmo. Mir\xE1 c\xF3mo crece.",
            action: "Crear mi primer h\xE1bito",
            onAction: () => setModal({ type: "form", resource: "habitos" })
          }
        ) }) : /* @__PURE__ */ jsxs6(Fragment4, { children: [
          tab === "hoy" && /* @__PURE__ */ jsxs6("div", { className: "panel habit-grid-panel", children: [
            /* @__PURE__ */ jsx7(
              SectionTitle,
              {
                title: "Tu mapa de constancia",
                eyebrow: labelDate(month + "-01", {
                  month: "long",
                  year: "numeric"
                }),
                children: /* @__PURE__ */ jsxs6("label", { className: "toggle-inline", children: [
                  /* @__PURE__ */ jsx7(
                    "input",
                    {
                      type: "checkbox",
                      checked: archived,
                      onChange: (e) => setArchived(e.target.checked)
                    }
                  ),
                  "Ver archivados"
                ] })
              }
            ),
            /* @__PURE__ */ jsx7("div", { className: "habit-grid-scroll", children: /* @__PURE__ */ jsxs6("table", { className: "habit-grid", children: [
              /* @__PURE__ */ jsx7("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
                /* @__PURE__ */ jsx7("th", { scope: "col", children: "H\xE1bito" }),
                Array.from(
                  { length: monthDays(month) },
                  (_, i) => i + 1
                ).map((d) => {
                  const date = `${month}-${String(d).padStart(2, "0")}`;
                  return /* @__PURE__ */ jsxs6(
                    "th",
                    {
                      scope: "col",
                      className: date === today() ? "current-day" : "",
                      children: [
                        /* @__PURE__ */ jsx7("small", { children: labelDate(date, { weekday: "short" }).slice(
                          0,
                          1
                        ) }),
                        /* @__PURE__ */ jsx7("span", { children: d })
                      ]
                    },
                    d
                  );
                }),
                /* @__PURE__ */ jsx7("th", { scope: "col", children: "MES" })
              ] }) }),
              /* @__PURE__ */ jsx7("tbody", { children: habits.map((h, i) => {
                const stat = stats.find((s) => s.habit.id === h.id);
                return /* @__PURE__ */ jsxs6("tr", { children: [
                  /* @__PURE__ */ jsx7("th", { scope: "row", children: /* @__PURE__ */ jsxs6(
                    "button",
                    {
                      className: "habit-name",
                      onClick: () => setSelected(h.id),
                      children: [
                        /* @__PURE__ */ jsx7(
                          "span",
                          {
                            className: "habit-symbol",
                            style: {
                              color: h.color || PALETTE[i % 6],
                              background: (h.color || PALETTE[i % 6]) + "18"
                            },
                            children: ["\u2733", "\u25C8", "\u25CE", "\u2726", "\u2318", "\u25C7"][i % 6]
                          }
                        ),
                        /* @__PURE__ */ jsxs6("span", { children: [
                          /* @__PURE__ */ jsx7("strong", { children: h.nombre }),
                          /* @__PURE__ */ jsxs6("small", { children: [
                            h.categoria || "Mi rutina",
                            stat.streak > 2 ? ` \xB7 \u{1F525} ${stat.streak}` : ""
                          ] })
                        ] })
                      ]
                    }
                  ) }),
                  Array.from(
                    { length: monthDays(month) },
                    (_, i2) => i2 + 1
                  ).map((d) => {
                    const date = `${month}-${String(d).padStart(2, "0")}`, record = recordFor(db.registros, h.id, date), future = date > today(), isDay = scheduled(h, date);
                    return /* @__PURE__ */ jsx7(
                      "td",
                      {
                        className: date === today() ? "current-day" : "",
                        children: /* @__PURE__ */ jsx7(
                          "button",
                          {
                            className: `habit-cell ${record?.valor === 1 ? "total" : record?.valor === 0.5 ? "partial" : ""} ${future ? "future" : ""} ${!isDay ? "unscheduled" : ""}`,
                            disabled: future || !isDay,
                            style: {
                              "--habit-color": h.color || PALETTE[0]
                            },
                            "aria-label": `${h.nombre}, ${labelDate(date)}, ${record?.valor === 1 ? "completo" : record ? "parcial" : future ? "futuro" : !isDay ? "no programado" : "sin completar"}`,
                            title: record?.nota || `${labelDate(date)} \xB7 ${record?.valor === 1 ? "Completo" : record ? "Parcial" : "Sin completar"}`,
                            onClick: () => setCheckin({ habit: h, date }),
                            onKeyDown: (e) => {
                              const shift = {
                                ArrowLeft: -1,
                                ArrowRight: 1,
                                ArrowUp: -monthDays(month),
                                ArrowDown: monthDays(month)
                              }[e.key];
                              if (shift !== void 0) {
                                e.preventDefault();
                                const cells = [
                                  ...e.currentTarget.closest("tbody").querySelectorAll(".habit-cell")
                                ];
                                const index = cells.indexOf(
                                  e.currentTarget
                                );
                                cells[Math.max(
                                  0,
                                  Math.min(
                                    cells.length - 1,
                                    index + shift
                                  )
                                )]?.focus();
                              }
                            },
                            children: record?.valor === 1 ? /* @__PURE__ */ jsx7(Check5, { size: 13 }) : record?.valor === 0.5 ? /* @__PURE__ */ jsx7("span", { children: "\xBD" }) : !isDay ? /* @__PURE__ */ jsx7(Minus, { size: 10 }) : null
                          }
                        )
                      },
                      d
                    );
                  }),
                  /* @__PURE__ */ jsx7("td", { children: /* @__PURE__ */ jsxs6(
                    "strong",
                    {
                      className: "habit-percent",
                      style: { color: h.color || PALETTE[0] },
                      children: [
                        stat.percent,
                        "%"
                      ]
                    }
                  ) })
                ] }, h.id);
              }) })
            ] }) }),
            /* @__PURE__ */ jsxs6("div", { className: "habit-legend", children: [
              /* @__PURE__ */ jsxs6("span", { children: [
                /* @__PURE__ */ jsx7("i", { className: "total" }),
                "Completo"
              ] }),
              /* @__PURE__ */ jsxs6("span", { children: [
                /* @__PURE__ */ jsx7("i", { className: "partial" }),
                "Parcial"
              ] }),
              /* @__PURE__ */ jsxs6("span", { children: [
                /* @__PURE__ */ jsx7("i", {}),
                "Pendiente"
              ] }),
              /* @__PURE__ */ jsx7("span", { children: "\u2190 \u2191 \u2193 \u2192 para moverte \xB7 Enter para registrar" })
            ] })
          ] }),
          tab === "progreso" && /* @__PURE__ */ jsx7(
            HabitProgress,
            {
              habits,
              stats,
              month,
              onDay: (date) => {
                setMonth(date.slice(0, 7));
                setTab("hoy");
              }
            }
          ),
          tab === "historial" && /* @__PURE__ */ jsx7(
            HabitHistory,
            {
              habits,
              month,
              onCheck: setCheckin
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs6("aside", { className: "habits-sidebar", children: [
        /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
          /* @__PURE__ */ jsx7(
            SectionTitle,
            {
              title: "Tu ritual de hoy",
              eyebrow: labelDate(today(), { weekday: "long", day: "numeric" })
            }
          ),
          scheduledToday.map((h, i) => {
            const record = recordFor(db.registros, h.id, today());
            return /* @__PURE__ */ jsxs6(
              "button",
              {
                className: `ritual-row ${record ? "done" : ""}`,
                onClick: () => setCheckin({ habit: h, date: today() }),
                children: [
                  /* @__PURE__ */ jsx7(
                    "span",
                    {
                      className: "ritual-icon",
                      style: { color: h.color || PALETTE[i % 6] },
                      children: record ? /* @__PURE__ */ jsx7(Check5, { size: 21 }) : /* @__PURE__ */ jsx7(Target2, { size: 21 })
                    }
                  ),
                  /* @__PURE__ */ jsxs6("span", { children: [
                    /* @__PURE__ */ jsx7("strong", { children: h.nombre }),
                    /* @__PURE__ */ jsx7("small", { children: record?.valor === 1 ? "Lo hiciste. Bien por vos." : record ? "Un avance tambi\xE9n cuenta." : h.hora || "A tu ritmo" })
                  ] }),
                  /* @__PURE__ */ jsx7("span", { className: "ritual-check", children: record?.valor === 1 ? "\u2713" : record ? "\xBD" : "+" })
                ]
              },
              h.id
            );
          }),
          !scheduledToday.length && /* @__PURE__ */ jsx7("p", { className: "small muted", children: "Un d\xEDa libre tambi\xE9n es parte del proceso." }),
          /* @__PURE__ */ jsx7(Progress, { value: pct, color: "var(--lime)" })
        ] }),
        chosen ? /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
          /* @__PURE__ */ jsx7(SectionTitle, { title: chosen.nombre, children: /* @__PURE__ */ jsx7(EditActions, { resource: "habitos", item: chosen }) }),
          /* @__PURE__ */ jsx7("p", { className: "muted", children: chosen.descripcion || "Un compromiso que se construye d\xEDa a d\xEDa." }),
          /* @__PURE__ */ jsxs6("div", { className: "habit-detail-stat", children: [
            /* @__PURE__ */ jsx7(Flame3, { size: 25 }),
            /* @__PURE__ */ jsx7("strong", { children: habitStats(chosen, db.registros, month).streak }),
            /* @__PURE__ */ jsx7("span", { children: "d\xEDas de racha" })
          ] }),
          /* @__PURE__ */ jsx7("div", { className: "small-label", children: "\xDALTIMOS REGISTROS" }),
          db.registros.filter((r) => String(r.habito_id) === String(chosen.id)).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map((r) => /* @__PURE__ */ jsxs6(
            "button",
            {
              className: "record-summary",
              onClick: () => setCheckin({ habit: chosen, date: r.fecha }),
              children: [
                /* @__PURE__ */ jsxs6("span", { children: [
                  labelDate(r.fecha),
                  /* @__PURE__ */ jsx7("small", { children: r.nota || "Sin nota" })
                ] }),
                /* @__PURE__ */ jsx7(Pill, { color: r.valor === 1 ? PALETTE[0] : PALETTE[5], children: r.valor === 1 ? "\u2713" : "\xBD" })
              ]
            },
            r.id
          ))
        ] }) : /* @__PURE__ */ jsxs6("div", { className: "consistency-card", children: [
          /* @__PURE__ */ jsx7(Flame3, { size: 31 }),
          /* @__PURE__ */ jsxs6("h3", { children: [
            "La constancia",
            /* @__PURE__ */ jsx7("br", {}),
            "tiene tu ritmo."
          ] }),
          /* @__PURE__ */ jsx7("p", { children: "Un d\xEDa parcial tambi\xE9n mantiene tu racha. Cada intento es parte del camino." }),
          /* @__PURE__ */ jsxs6("div", { className: "constellation-small", children: [
            /* @__PURE__ */ jsx7("i", {}),
            /* @__PURE__ */ jsx7("i", {}),
            /* @__PURE__ */ jsx7("i", {}),
            /* @__PURE__ */ jsx7("i", {}),
            /* @__PURE__ */ jsx7("i", {})
          ] })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
          /* @__PURE__ */ jsx7(SectionTitle, { title: "Tus h\xE1bitos" }),
          db.habitos.map((h) => /* @__PURE__ */ jsxs6("div", { className: "manager-row", children: [
            /* @__PURE__ */ jsxs6(
              "button",
              {
                className: "text-button",
                onClick: () => setSelected(h.id),
                children: [
                  /* @__PURE__ */ jsx7("span", { className: "color-dot", style: { background: h.color } }),
                  h.nombre
                ]
              }
            ),
            /* @__PURE__ */ jsx7(EditActions, { resource: "habitos", item: h })
          ] }, h.id))
        ] })
      ] })
    ] }),
    checkin && /* @__PURE__ */ jsx7(CheckinModal, { ...checkin, onClose: () => setCheckin(null) })
  ] });
}
function CheckinModal({ habit, date, onClose }) {
  const { db, mutate } = useApp();
  const record = recordFor(db.registros, habit.id, date);
  const [value, setValue] = useState7(record?.valor || 1), [note, setNote] = useState7(record?.nota || ""), [busy, setBusy] = useState7(false), [error, setError] = useState7("");
  const submit = async (remove) => {
    setBusy(true);
    try {
      if (remove) await mutate("registros", "delete", record);
      else
        await mutate("registros", "record", {
          habito_id: habit.id,
          fecha: date,
          valor: value,
          nota: note
        });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx7(Modal, { title: habit.nombre, onClose: () => !busy && onClose(), children: /* @__PURE__ */ jsxs6(
    "form",
    {
      onSubmit: (e) => {
        e.preventDefault();
        submit(false);
      },
      children: [
        /* @__PURE__ */ jsxs6("div", { className: "modal-body", children: [
          /* @__PURE__ */ jsx7("span", { className: "eyebrow", children: labelDate(date, {
            weekday: "long",
            day: "numeric",
            month: "long"
          }) }),
          /* @__PURE__ */ jsx7("h3", { children: "\xBFC\xF3mo te fue hoy?" }),
          /* @__PURE__ */ jsxs6("div", { className: "completion-choices", children: [
            /* @__PURE__ */ jsxs6(
              "button",
              {
                type: "button",
                className: value === 1 ? "selected" : "",
                onClick: () => setValue(1),
                children: [
                  /* @__PURE__ */ jsx7(Check5, { size: 27 }),
                  /* @__PURE__ */ jsx7("strong", { children: "Lo complet\xE9" }),
                  /* @__PURE__ */ jsx7("span", { children: "Un paso m\xE1s. Una victoria." })
                ]
              }
            ),
            /* @__PURE__ */ jsxs6(
              "button",
              {
                type: "button",
                className: value === 0.5 ? "selected partial" : "",
                onClick: () => setValue(0.5),
                children: [
                  /* @__PURE__ */ jsx7("span", { className: "half", children: "\xBD" }),
                  /* @__PURE__ */ jsx7("strong", { children: "Avanc\xE9 un poco" }),
                  /* @__PURE__ */ jsx7("span", { children: "Lo importante es volver." })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs6("label", { className: "field", children: [
            /* @__PURE__ */ jsx7("span", { children: "Una nota para vos (opcional)" }),
            /* @__PURE__ */ jsx7(
              "textarea",
              {
                value: note,
                onChange: (e) => setNote(e.target.value),
                rows: 3,
                maxLength: 1e3,
                placeholder: "\xBFQu\xE9 te ayud\xF3? \xBFC\xF3mo te sentiste?"
              }
            )
          ] }),
          error && /* @__PURE__ */ jsx7("p", { role: "alert", className: "form-error", children: error })
        ] }),
        /* @__PURE__ */ jsxs6("footer", { children: [
          record && /* @__PURE__ */ jsx7(
            Button,
            {
              type: "button",
              variant: "danger",
              icon: Trash22,
              disabled: busy,
              onClick: () => submit(true),
              children: "Deshacer"
            }
          ),
          /* @__PURE__ */ jsx7(Button, { type: "button", disabled: busy, onClick: onClose, children: "Cancelar" }),
          /* @__PURE__ */ jsx7(Button, { variant: "primary", icon: Check5, disabled: busy, children: busy ? "Guardando\u2026" : "Guardar progreso" })
        ] })
      ]
    }
  ) });
}
function HabitProgress({ habits, stats, month, onDay }) {
  const { db } = useApp();
  const days = Array.from({ length: 91 }, (_, i) => addDays(today(), i - 90));
  const six = Array.from({ length: 6 }, (_, i) => {
    const d = /* @__PURE__ */ new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() - 5 + i);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: m,
      value: habits.reduce((s, h) => s + habitStats(h, db.registros, m).percent, 0) / Math.max(1, habits.length)
    };
  });
  return /* @__PURE__ */ jsxs6(Fragment4, { children: [
    /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
      /* @__PURE__ */ jsx7(
        SectionTitle,
        {
          title: "Cada d\xEDa deja una huella",
          eyebrow: "\xDALTIMOS 3 MESES"
        }
      ),
      /* @__PURE__ */ jsx7("div", { className: "heatmap", children: days.map((date) => {
        const hs = habits.filter((h) => scheduled(h, date)), value = hs.reduce(
          (s, h) => s + num(recordFor(db.registros, h.id, date)?.valor),
          0
        ) / Math.max(1, hs.length);
        return /* @__PURE__ */ jsx7(
          "button",
          {
            className: `heat-cell level-${Math.ceil(value * 4)}`,
            "aria-label": `${labelDate(date)}: ${Math.round(value * 100)}% completado`,
            title: `${labelDate(date)} \xB7 ${Math.round(value * 100)}%`,
            onClick: () => onDay(date)
          },
          date
        );
      }) }),
      /* @__PURE__ */ jsxs6("div", { className: "chart-axis", children: [
        /* @__PURE__ */ jsx7("span", { children: labelDate(days[0]) }),
        /* @__PURE__ */ jsx7("span", { children: "Hoy" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
      /* @__PURE__ */ jsx7(
        SectionTitle,
        {
          title: "Tu constancia crece con vos",
          eyebrow: "\xDALTIMOS 6 MESES"
        }
      ),
      /* @__PURE__ */ jsxs6(
        "svg",
        {
          viewBox: "0 0 600 140",
          className: "habit-sparkline",
          role: "img",
          "aria-label": "Porcentaje de constancia en los \xFAltimos seis meses",
          children: [
            [20, 65, 110].map((y) => /* @__PURE__ */ jsx7(
              "line",
              {
                x1: "25",
                x2: "575",
                y1: y,
                y2: y,
                stroke: "var(--line)",
                strokeDasharray: "3 5"
              },
              y
            )),
            /* @__PURE__ */ jsx7(
              "polyline",
              {
                points: six.map((d, i) => `${25 + i * 110},${120 - d.value}`).join(" "),
                fill: "none",
                stroke: "var(--lavender)",
                strokeWidth: "3"
              }
            ),
            six.map((d, i) => /* @__PURE__ */ jsxs6("g", { children: [
              /* @__PURE__ */ jsx7(
                "circle",
                {
                  cx: 25 + i * 110,
                  cy: 120 - d.value,
                  r: "5",
                  fill: "var(--lavender)"
                }
              ),
              /* @__PURE__ */ jsxs6(
                "text",
                {
                  x: 25 + i * 110,
                  y: 110 - d.value,
                  textAnchor: "middle",
                  fill: "var(--text)",
                  fontSize: "10",
                  children: [
                    Math.round(d.value),
                    "%"
                  ]
                }
              )
            ] }, d.month))
          ]
        }
      ),
      /* @__PURE__ */ jsx7("div", { className: "spark-labels", children: six.map((d) => /* @__PURE__ */ jsx7("span", { children: labelDate(d.month + "-01", { month: "short" }) }, d.month)) })
    ] }),
    /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
      /* @__PURE__ */ jsx7(SectionTitle, { title: "Un h\xE1bito a la vez" }),
      /* @__PURE__ */ jsx7("div", { className: "table-scroll", children: /* @__PURE__ */ jsxs6("table", { children: [
        /* @__PURE__ */ jsx7("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
          /* @__PURE__ */ jsx7("th", { scope: "col", children: "H\xE1bito" }),
          /* @__PURE__ */ jsx7("th", { scope: "col", children: "Racha actual" }),
          /* @__PURE__ */ jsx7("th", { scope: "col", children: "Completaciones del mes" }),
          /* @__PURE__ */ jsx7("th", { scope: "col", children: "Constancia" })
        ] }) }),
        /* @__PURE__ */ jsx7("tbody", { children: stats.map((s) => /* @__PURE__ */ jsxs6("tr", { children: [
          /* @__PURE__ */ jsx7("td", { children: s.habit.nombre }),
          /* @__PURE__ */ jsx7("td", { children: /* @__PURE__ */ jsxs6("span", { className: "inline", children: [
            /* @__PURE__ */ jsx7(Flame3, { size: 15, color: PALETTE[2] }),
            s.streak,
            " d\xEDas"
          ] }) }),
          /* @__PURE__ */ jsxs6("td", { children: [
            s.completed,
            " / ",
            s.possible
          ] }),
          /* @__PURE__ */ jsxs6("td", { children: [
            /* @__PURE__ */ jsx7(Progress, { value: s.percent, color: s.habit.color }),
            /* @__PURE__ */ jsxs6("small", { children: [
              s.percent,
              "%"
            ] })
          ] })
        ] }, s.habit.id)) })
      ] }) })
    ] })
  ] });
}
function HabitHistory({ habits, month, onCheck }) {
  const { db } = useApp();
  const [filter, setFilter] = useState7("all"), [day, setDay] = useState7(null);
  const hs = filter === "all" ? habits : habits.filter((h) => String(h.id) === filter);
  return /* @__PURE__ */ jsxs6("div", { className: "panel", children: [
    /* @__PURE__ */ jsx7(SectionTitle, { title: "Tu historia, d\xEDa a d\xEDa", children: /* @__PURE__ */ jsxs6(
      "select",
      {
        "aria-label": "Filtrar historial por h\xE1bito",
        value: filter,
        onChange: (e) => setFilter(e.target.value),
        children: [
          /* @__PURE__ */ jsx7("option", { value: "all", children: "Todos los h\xE1bitos" }),
          habits.map((h) => /* @__PURE__ */ jsx7("option", { value: h.id, children: h.nombre }, h.id))
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs6("div", { className: "history-calendar", children: [
      ["L", "M", "X", "J", "V", "S", "D"].map((d, i) => /* @__PURE__ */ jsx7("span", { className: "weekday-label", children: d }, i)),
      calendarDays(month).map((date) => {
        const list = hs.filter((h) => scheduled(h, date));
        const val = list.reduce(
          (s, h) => s + num(recordFor(db.registros, h.id, date)?.valor),
          0
        ) / Math.max(1, list.length);
        return /* @__PURE__ */ jsxs6(
          "button",
          {
            disabled: date > today(),
            className: `history-day level-${Math.ceil(val * 4)} ${date.slice(0, 7) !== month ? "outside" : ""} ${date === day ? "selected" : ""}`,
            onClick: () => setDay(date),
            "aria-label": `${labelDate(date)}: ${Math.round(val * 100)}%`,
            children: [
              /* @__PURE__ */ jsx7("strong", { children: Number(date.slice(-2)) }),
              /* @__PURE__ */ jsx7("span", { children: date > today() ? "" : val ? `${Math.round(val * 100)}%` : "\u2014" })
            ]
          },
          date
        );
      })
    ] }),
    day && /* @__PURE__ */ jsxs6("div", { className: "history-detail", children: [
      /* @__PURE__ */ jsx7("h3", { children: labelDate(day, { weekday: "long", day: "numeric", month: "long" }) }),
      hs.filter((h) => scheduled(h, day)).map((h) => {
        const r = recordFor(db.registros, h.id, day);
        return /* @__PURE__ */ jsxs6(
          "button",
          {
            className: "record-summary",
            onClick: () => onCheck({ habit: h, date: day }),
            children: [
              /* @__PURE__ */ jsxs6("span", { children: [
                /* @__PURE__ */ jsx7("strong", { children: h.nombre }),
                /* @__PURE__ */ jsx7("small", { children: r?.nota || "Sin nota" })
              ] }),
              /* @__PURE__ */ jsx7(Pill, { color: r?.valor === 1 ? PALETTE[0] : PALETTE[5], children: r?.valor === 1 ? "Completo" : r ? "Parcial" : "Pendiente" })
            ]
          },
          h.id
        );
      })
    ] })
  ] });
}
var init_Habitos = __esm({
  "src/Habitos.jsx"() {
    init_store();
    init_ui();
    init_domain();
  }
});

// src/Settings.jsx
var Settings_exports = {};
__export(Settings_exports, {
  default: () => Settings
});
import React8, { useEffect as useEffect7, useState as useState8 } from "react";
import {
  Check as Check6,
  User,
  Palette,
  Database,
  Plug,
  Download as Download3,
  Upload as Upload3,
  Bell,
  Moon,
  Sun as Sun2,
  Sparkles as Sparkles3,
  ArrowUpRight as ArrowUpRight6,
  RefreshCw as RefreshCw3,
  ShieldCheck,
  MessageSquare,
  Plus as Plus6,
  ExternalLink as ExternalLink2
} from "lucide-react";
import { Fragment as Fragment5, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
function Settings() {
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
    setModal
  } = app;
  const [apiURL, setApiURL] = useState8(base), [name, setName] = useState8(
    db.settings.nombre_mostrar || db.settings.display_name || preferences.name || ""
  ), [system, setSystem] = useState8(null), [imported, setImported] = useState8(null), [confirm, setConfirm] = useState8(false), [pending, setPending] = useState8(false);
  useEffect7(() => {
    if (mode === "api" && status === "online")
      app.action("/settings/status").then(setSystem).catch(() => {
      });
  }, [mode, status]);
  const saveName = async (e) => {
    e.preventDefault();
    setPending(true);
    try {
      if (mode === "api") {
        const method = app.client.method("/settings", ["PATCH", "PUT"]);
        const fields = app.client.bodySchema("/settings", method).properties || {};
        const key = ["nombre_mostrar", "display_name", "nombre", "name"].find(
          (k) => Object.hasOwn(fields, k)
        ) || "nombre_mostrar";
        await app.configSave("settings", { ...db.settings, [key]: name });
      } else
        await app.configSave("settings", {
          ...db.settings,
          nombre_mostrar: name
        });
      setPrefs((p) => ({ ...p, name }));
    } catch {
    } finally {
      setPending(false);
    }
  };
  return /* @__PURE__ */ jsxs7("div", { className: "page settings-page", children: [
    /* @__PURE__ */ jsxs7("div", { className: "page-intro", children: [
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsx8("div", { className: "eyebrow", children: "TU ESPACIO, TUS REGLAS" }),
        /* @__PURE__ */ jsxs7("h1", { children: [
          "Hacelo ",
          /* @__PURE__ */ jsx8("em", { children: "tuyo." })
        ] }),
        /* @__PURE__ */ jsx8("p", { children: "Una \xF3rbita personal merece sentirse como casa." })
      ] }),
      /* @__PURE__ */ jsx8(Pill, { color: mode === "local" ? "var(--peach)" : "var(--lime)", children: mode === "local" ? "Espacio local" : "Conectado al sistema" })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "settings-grid", children: [
      /* @__PURE__ */ jsxs7("div", { className: "panel", children: [
        /* @__PURE__ */ jsx8(SectionTitle, { title: "C\xF3mo te llamamos", eyebrow: "PERFIL", children: /* @__PURE__ */ jsx8(User, { size: 20 }) }),
        /* @__PURE__ */ jsxs7("form", { onSubmit: saveName, children: [
          /* @__PURE__ */ jsxs7("label", { className: "field", children: [
            /* @__PURE__ */ jsx8("span", { children: "Nombre para mostrar" }),
            /* @__PURE__ */ jsx8(
              "input",
              {
                value: name,
                onChange: (e) => setName(e.target.value),
                placeholder: "Tu nombre",
                maxLength: 80
              }
            )
          ] }),
          /* @__PURE__ */ jsx8(Button, { variant: "primary", icon: Check6, disabled: pending, children: pending ? "Guardando\u2026" : "Guardar nombre" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "panel", children: [
        /* @__PURE__ */ jsx8(SectionTitle, { title: "Tu ambiente", eyebrow: "APARIENCIA", children: /* @__PURE__ */ jsx8(Palette, { size: 20 }) }),
        /* @__PURE__ */ jsxs7("div", { className: "theme-options", children: [
          /* @__PURE__ */ jsxs7(
            "button",
            {
              className: `theme-option night ${preferences.theme === "dark" ? "selected" : ""}`,
              "aria-pressed": preferences.theme === "dark",
              onClick: () => setPrefs((p) => ({ ...p, theme: "dark" })),
              children: [
                /* @__PURE__ */ jsx8(Moon, { size: 24 }),
                /* @__PURE__ */ jsx8("span", { children: "\xD3rbita nocturna" }),
                /* @__PURE__ */ jsxs7("div", { children: [
                  /* @__PURE__ */ jsx8("i", {}),
                  /* @__PURE__ */ jsx8("i", {}),
                  /* @__PURE__ */ jsx8("i", {})
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxs7(
            "button",
            {
              className: `theme-option day ${preferences.theme === "light" ? "selected" : ""}`,
              "aria-pressed": preferences.theme === "light",
              onClick: () => setPrefs((p) => ({ ...p, theme: "light" })),
              children: [
                /* @__PURE__ */ jsx8(Sun2, { size: 24 }),
                /* @__PURE__ */ jsx8("span", { children: "Luz de ma\xF1ana" }),
                /* @__PURE__ */ jsxs7("div", { children: [
                  /* @__PURE__ */ jsx8("i", {}),
                  /* @__PURE__ */ jsx8("i", {}),
                  /* @__PURE__ */ jsx8("i", {})
                ] })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs7("label", { className: "settings-toggle", children: [
          /* @__PURE__ */ jsxs7("div", { children: [
            /* @__PURE__ */ jsx8("strong", { children: "Un espacio en movimiento" }),
            /* @__PURE__ */ jsx8("small", { children: "Animaciones y transiciones suaves." })
          ] }),
          /* @__PURE__ */ jsx8(
            "input",
            {
              type: "checkbox",
              checked: preferences.motion,
              onChange: (e) => setPrefs((p) => ({ ...p, motion: e.target.checked }))
            }
          )
        ] }),
        /* @__PURE__ */ jsx8("p", { className: "muted small", children: "Tambi\xE9n respetamos la preferencia de movimiento reducido de tu sistema." })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "panel settings-connection", children: [
        /* @__PURE__ */ jsx8(
          SectionTitle,
          {
            title: "Conect\xE1 tu universo",
            eyebrow: "ORIGEN DE LOS DATOS",
            children: /* @__PURE__ */ jsx8(Plug, { size: 20 })
          }
        ),
        /* @__PURE__ */ jsxs7("div", { className: "connection-choices", children: [
          /* @__PURE__ */ jsxs7(
            "button",
            {
              className: mode === "local" ? "selected" : "",
              onClick: () => setMode("local"),
              children: [
                /* @__PURE__ */ jsx8(Database, { size: 22 }),
                /* @__PURE__ */ jsx8("strong", { children: "Espacio local" }),
                /* @__PURE__ */ jsx8("span", { children: "Guardado en este navegador. Independiente de la base de SGR." })
              ]
            }
          ),
          /* @__PURE__ */ jsxs7(
            "button",
            {
              className: mode === "api" ? "selected" : "",
              onClick: () => setMode("api"),
              children: [
                /* @__PURE__ */ jsx8(Plug, { size: 22 }),
                /* @__PURE__ */ jsx8("strong", { children: "Sistema SGR" }),
                /* @__PURE__ */ jsx8("span", { children: "Tus notas, cuentas, eventos y h\xE1bitos del backend existente." })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs7(
          "form",
          {
            className: "connection-form",
            onSubmit: (e) => {
              e.preventDefault();
              const value = apiURL.trim().replace(/\/$/, "");
              if (value !== "" && !value.startsWith("/") && !/^https?:\/\//.test(value)) {
                notify("Us\xE1 una URL HTTP/HTTPS o una ruta como /api.", "error");
                return;
              }
              setBase(value);
              setMode("api");
              if (value === base && mode === "api") app.connect();
            },
            children: [
              /* @__PURE__ */ jsxs7("label", { className: "field", children: [
                /* @__PURE__ */ jsx8("span", { children: "Direcci\xF3n de la API" }),
                /* @__PURE__ */ jsx8(
                  "input",
                  {
                    value: apiURL,
                    onChange: (e) => setApiURL(e.target.value),
                    placeholder: "/api",
                    spellCheck: "false"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx8(Button, { icon: RefreshCw3, disabled: status === "connecting", children: status === "connecting" ? "Conectando\u2026" : "Conectar" })
            ]
          }
        ),
        /* @__PURE__ */ jsxs7("p", { className: "muted small", children: [
          "En desarrollo, ",
          /* @__PURE__ */ jsx8("code", { children: "/api" }),
          " conecta con",
          " ",
          /* @__PURE__ */ jsx8("code", { children: "127.0.0.1:8765" }),
          ". Al cambiar de espacio se conservan tus datos locales; no se copian a la API."
        ] }),
        app.errors.connection && /* @__PURE__ */ jsx8("p", { className: "form-error", role: "alert", children: app.errors.connection })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "panel", children: [
        /* @__PURE__ */ jsx8(SectionTitle, { title: "Un recordatorio amable", eyebrow: "NOTIFICACIONES", children: /* @__PURE__ */ jsx8(Bell, { size: 20 }) }),
        /* @__PURE__ */ jsx8("p", { className: "muted", children: "Recib\xED avisos antes de los eventos y h\xE1bitos con hora mientras este espacio est\xE9 abierto." }),
        /* @__PURE__ */ jsxs7("label", { className: "field", children: [
          /* @__PURE__ */ jsx8("span", { children: "Anticipaci\xF3n" }),
          /* @__PURE__ */ jsx8(
            "select",
            {
              value: preferences.lead,
              onChange: (e) => setPrefs((p) => ({ ...p, lead: Number(e.target.value) })),
              children: [0, 5, 10, 15, 30, 60].map((v) => /* @__PURE__ */ jsx8("option", { value: v, children: v === 0 ? "A la hora de inicio" : `${v} minutos antes` }, v))
            }
          )
        ] }),
        /* @__PURE__ */ jsx8(
          Button,
          {
            icon: Bell,
            onClick: async () => {
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
                  "No se habilitaron las notificaciones. Pod\xE9s cambiar el permiso desde tu navegador.",
                  "error"
                );
            },
            children: preferences.notifications ? "Desactivar recordatorios" : "Habilitar recordatorios"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "panel", children: [
        /* @__PURE__ */ jsx8(
          SectionTitle,
          {
            title: "Tus datos, a mano",
            eyebrow: "COPIAS Y PORTABILIDAD",
            children: /* @__PURE__ */ jsx8(ShieldCheck, { size: 20 })
          }
        ),
        mode === "local" ? /* @__PURE__ */ jsxs7(Fragment5, { children: [
          /* @__PURE__ */ jsx8("p", { className: "muted", children: "Descarg\xE1 una copia de tu espacio local para conservarla o trasladarla a otro navegador." }),
          /* @__PURE__ */ jsxs7("div", { className: "inline wrap", children: [
            /* @__PURE__ */ jsx8(
              Button,
              {
                icon: Download3,
                onClick: () => download(
                  JSON.stringify(db, null, 2),
                  `sgr-orbita-${today()}.json`,
                  "application/json"
                ),
                children: "Exportar espacio"
              }
            ),
            /* @__PURE__ */ jsxs7("label", { className: "button", children: [
              /* @__PURE__ */ jsx8(Upload3, { size: 16 }),
              /* @__PURE__ */ jsx8("span", { children: "Restaurar copia" }),
              /* @__PURE__ */ jsx8(
                "input",
                {
                  className: "sr-only",
                  type: "file",
                  accept: ".json,application/json",
                  onChange: async (e) => {
                    const f2 = e.target.files?.[0];
                    if (!f2) return;
                    try {
                      if (f2.size > 25 * 1024 * 1024)
                        throw Error("La copia supera el l\xEDmite de 25 MB.");
                      setImported(JSON.parse(await f2.text()));
                      setConfirm(false);
                    } catch (e2) {
                      notify(e2.message, "error");
                    }
                    e.target.value = "";
                  }
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "muted small", children: "El almacenamiento pertenece a este navegador y a esta direcci\xF3n. Export\xE1 una copia antes de borrar los datos del navegador." }),
          /* @__PURE__ */ jsxs7("div", { className: "sample-space", children: [
            /* @__PURE__ */ jsx8(Sparkles3, { size: 20 }),
            /* @__PURE__ */ jsxs7("div", { children: [
              /* @__PURE__ */ jsx8("strong", { children: "Explor\xE1 las posibilidades" }),
              /* @__PURE__ */ jsx8("p", { children: "Carg\xE1 ejemplos si tu espacio local est\xE1 vac\xEDo." })
            ] }),
            /* @__PURE__ */ jsx8(
              Button,
              {
                onClick: () => {
                  try {
                    app.seed();
                  } catch (e) {
                    notify(e.message, "error");
                  }
                },
                children: "Cargar ejemplos"
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxs7(Fragment5, { children: [
          /* @__PURE__ */ jsx8("p", { className: "muted", children: "Descarg\xE1 el respaldo que ofrece el sistema SGR. La B\xF3veda externa requiere su propia copia." }),
          /* @__PURE__ */ jsx8(
            Button,
            {
              icon: Download3,
              onClick: () => app.action(
                "/settings/backup",
                "GET",
                void 0,
                `sgr-backup-${today()}.zip`
              ).catch(() => {
              }),
              children: "Descargar respaldo"
            }
          ),
          system && /* @__PURE__ */ jsxs7("details", { className: "status-details", children: [
            /* @__PURE__ */ jsx8("summary", { children: "Estado de los datos y la sincronizaci\xF3n" }),
            /* @__PURE__ */ jsx8("pre", { children: JSON.stringify(system, null, 2) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "panel", children: [
        /* @__PURE__ */ jsx8(SectionTitle, { title: "Ideas para mejorar", eyebrow: "FEEDBACK", children: /* @__PURE__ */ jsx8(
          Button,
          {
            icon: Plus6,
            onClick: () => setModal({ type: "form", resource: "feedback" }),
            children: "Comentario"
          }
        ) }),
        /* @__PURE__ */ jsx8(ErrorNotice, { keys: ["feedback"] }),
        db.feedback.map((f2) => /* @__PURE__ */ jsxs7("div", { className: "feedback-row", children: [
          /* @__PURE__ */ jsx8(MessageSquare, { size: 18 }),
          /* @__PURE__ */ jsxs7("div", { children: [
            /* @__PURE__ */ jsx8("strong", { children: f2.titulo || "Comentario" }),
            /* @__PURE__ */ jsx8("p", { children: f2.contenido || f2.mensaje || f2.texto })
          ] }),
          /* @__PURE__ */ jsx8(EditActions, { resource: "feedback", item: f2 })
        ] }, f2.id)),
        !db.feedback.length && /* @__PURE__ */ jsx8("p", { className: "muted", children: "Una idea, un detalle, algo que podr\xEDa funcionar mejor. Guardalo ac\xE1." })
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "settings-bottom", children: [
      /* @__PURE__ */ jsxs7("div", { className: "brand-inline", children: [
        "SGR ",
        /* @__PURE__ */ jsx8("span", { children: "\xD3RBITA PERSONAL" })
      ] }),
      /* @__PURE__ */ jsxs7("span", { children: [
        "Creado para conectar las partes de tu vida.",
        " ",
        /* @__PURE__ */ jsx8("span", { className: "heart", children: "\u2726" })
      ] }),
      /* @__PURE__ */ jsx8("span", { children: "v1.0" })
    ] }),
    imported && /* @__PURE__ */ jsxs7(
      Modal,
      {
        title: "Restaurar espacio local",
        onClose: () => setImported(null),
        children: [
          /* @__PURE__ */ jsxs7("div", { className: "modal-body", children: [
            /* @__PURE__ */ jsx8("p", { children: "La copia reemplazar\xE1 los datos de este espacio local. Descarg\xE1 una copia actual antes de continuar si quer\xE9s conservarlos." }),
            /* @__PURE__ */ jsx8(
              Button,
              {
                icon: Download3,
                onClick: () => download(
                  JSON.stringify(db, null, 2),
                  `sgr-antes-de-restaurar-${today()}.json`,
                  "application/json"
                ),
                children: "Guardar copia actual"
              }
            ),
            /* @__PURE__ */ jsxs7("label", { className: "settings-toggle", children: [
              /* @__PURE__ */ jsx8("span", { children: "Entiendo que se reemplaza mi espacio local." }),
              /* @__PURE__ */ jsx8(
                "input",
                {
                  type: "checkbox",
                  checked: confirm,
                  onChange: (e) => setConfirm(e.target.checked)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("footer", { children: [
            /* @__PURE__ */ jsx8(Button, { onClick: () => setImported(null), children: "Cancelar" }),
            /* @__PURE__ */ jsx8(
              Button,
              {
                variant: "primary",
                disabled: !confirm,
                onClick: () => {
                  try {
                    app.importLocal(imported);
                    setImported(null);
                  } catch (e) {
                    notify(e.message, "error");
                  }
                },
                children: "Restaurar"
              }
            )
          ] })
        ]
      }
    )
  ] });
}
var init_Settings = __esm({
  "src/Settings.jsx"() {
    init_store();
    init_ui();
    init_domain();
  }
});

// tests/ui.jsx
init_store();
init_ui();
import React10 from "react";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
  within,
  act
} from "@testing-library/react";

// src/App.jsx
init_store();
init_ui();
init_domain();
import React9, { useEffect as useEffect8, useRef as useRef5, useState as useState9, Suspense as Suspense2, lazy as lazy2 } from "react";
import {
  Orbit,
  Network as Network2,
  Wallet as Wallet2,
  CalendarDays as CalendarDays3,
  Leaf as Leaf2,
  Settings as Settings3,
  Search as Search3,
  Plus as Plus7,
  ArrowUpRight as ArrowUpRight7,
  Bell as Bell2,
  Command,
  Menu,
  X as X2,
  Check as Check7,
  AlertCircle as AlertCircle2,
  RefreshCw as RefreshCw4,
  ChevronRight as ChevronRight4,
  FileText as FileText2,
  CheckSquare as CheckSquare2,
  Sun as Sun3,
  ArrowRight as ArrowRight3,
  Keyboard,
  LoaderCircle as LoaderCircle2
} from "lucide-react";
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
var Boveda2 = lazy2(() => Promise.resolve().then(() => (init_Boveda(), Boveda_exports)));
var Finanzas2 = lazy2(() => Promise.resolve().then(() => (init_Finanzas(), Finanzas_exports)));
var Agenda2 = lazy2(() => Promise.resolve().then(() => (init_Agenda(), Agenda_exports)));
var Habitos2 = lazy2(() => Promise.resolve().then(() => (init_Habitos(), Habitos_exports)));
var SettingsPage = lazy2(() => Promise.resolve().then(() => (init_Settings(), Settings_exports)));
var nav = [
  {
    path: "/",
    label: "B\xF3veda",
    sub: "Conect\xE1 tus ideas",
    icon: Network2,
    color: "#9f96ff",
    section: "boveda"
  },
  {
    path: "/finanzas",
    label: "Finanzas",
    sub: "Constru\xED tu libertad",
    icon: Wallet2,
    color: "#ffad79",
    section: "finanzas"
  },
  {
    path: "/agenda",
    label: "Agenda",
    sub: "Dale espacio a tu d\xEDa",
    icon: CalendarDays3,
    color: "#65d9ee",
    section: "agenda"
  },
  {
    path: "/habitos",
    label: "H\xE1bitos",
    sub: "Un paso cada d\xEDa",
    icon: Leaf2,
    color: "#b4f580",
    section: "habitos"
  }
];
function useRoute() {
  const [route, setRoute] = useState9(
    window.location.pathname + window.location.search
  );
  useEffect8(() => {
    const pop = () => setRoute(window.location.pathname + window.location.search);
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
function App() {
  const app = useApp();
  const { db, status, mode, preferences, setModal, toast, setToast } = app;
  const [route, navigate] = useRoute();
  const pathname = route.split("?")[0];
  const section = pathname.startsWith("/finanzas") ? "finanzas" : pathname.startsWith("/agenda") ? "agenda" : pathname.startsWith("/habitos") ? "habitos" : pathname.startsWith("/settings") ? "settings" : "boveda";
  const current = nav.find((n) => n.section === section);
  const [command, setCommand] = useState9(false), [capture, setCapture] = useState9(false), [mobile, setMobile] = useState9(false), [shortcuts, setShortcuts] = useState9(false), [notices, setNotices] = useState9(false);
  const searchRef = useRef5();
  const tab = new URLSearchParams(route.split("?")[1]).get("tab") || { finanzas: "dashboard", agenda: "hoy", habitos: "hoy" }[section];
  const setTab = (value) => navigate(`${pathname}?tab=${value}`);
  useEffect8(() => {
    document.documentElement.style.setProperty(
      "--accent",
      current?.color || "#b4f580"
    );
    document.title = `${current?.label || "Ajustes"} \xB7 SGR \xD3rbita`;
    setMobile(false);
  }, [route]);
  useEffect8(() => {
    const onKey = (e) => {
      if (document.querySelector('[role="dialog"]') && !command && !shortcuts)
        return;
      const editable = e.target?.closest?.(
        "input,textarea,select,[contenteditable]"
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!app.modal && !capture && !shortcuts) setCommand((c) => !c);
      } else if (!editable && !e.ctrlKey && !e.metaKey && !e.altKey && !app.modal && !command && !capture && !shortcuts) {
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
  useEffect8(() => {
    const listener = () => {
      if (mode === "api") app.connect();
    };
    window.addEventListener("sgr-refresh", listener);
    return () => window.removeEventListener("sgr-refresh", listener);
  }, [mode, app.base]);
  useEffect8(() => {
    if (pathname === "/capture") setCapture(true);
  }, [pathname]);
  useNotifications(app);
  const pending = db.habitos.filter(
    (h) => scheduled(h, today()) && !db.registros.some(
      (r) => String(r.habito_id) === String(h.id) && r.fecha === today() && r.valor === 1
    )
  );
  const openCapture = (resource) => {
    setCapture(false);
    setModal({ type: "form", resource });
  };
  return /* @__PURE__ */ jsxs8("div", { className: "app-shell", children: [
    /* @__PURE__ */ jsx9("a", { className: "skip-link", href: "#main-content", children: "Saltar al contenido" }),
    mobile && /* @__PURE__ */ jsx9(
      "button",
      {
        className: "sidebar-scrim",
        "aria-label": "Cerrar navegaci\xF3n",
        onClick: () => setMobile(false)
      }
    ),
    /* @__PURE__ */ jsxs8("aside", { className: `sidebar ${mobile ? "open" : ""}`, children: [
      /* @__PURE__ */ jsxs8(
        "button",
        {
          className: "brand",
          onClick: () => navigate("/"),
          "aria-label": "SGR, ir a B\xF3veda",
          children: [
            /* @__PURE__ */ jsx9("span", { className: "brand-mark", children: /* @__PURE__ */ jsx9(Orbit, { size: 31 }) }),
            /* @__PURE__ */ jsxs8("span", { children: [
              /* @__PURE__ */ jsxs8("strong", { children: [
                "SGR",
                /* @__PURE__ */ jsx9("span", { children: "\u2726" })
              ] }),
              /* @__PURE__ */ jsx9("small", { children: "\xD3RBITA PERSONAL" })
            ] })
          ]
        }
      ),
      /* @__PURE__ */ jsxs8("div", { className: "workspace-label", children: [
        /* @__PURE__ */ jsx9("span", { className: "workspace-dot" }),
        " MI ESPACIO ",
        /* @__PURE__ */ jsx9("span", { children: "01" })
      ] }),
      /* @__PURE__ */ jsx9("nav", { "aria-label": "Navegaci\xF3n principal", children: nav.map((n) => /* @__PURE__ */ jsxs8(
        "a",
        {
          href: n.path,
          className: `nav-item ${section === n.section ? "active" : ""}`,
          style: { "--nav-color": n.color },
          onClick: (e) => {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              navigate(n.path);
            }
          },
          children: [
            /* @__PURE__ */ jsx9("span", { className: "nav-icon", children: /* @__PURE__ */ jsx9(n.icon, { size: 21 }) }),
            /* @__PURE__ */ jsxs8("span", { children: [
              /* @__PURE__ */ jsx9("strong", { children: n.label }),
              /* @__PURE__ */ jsx9("small", { children: n.sub })
            ] }),
            /* @__PURE__ */ jsx9(ChevronRight4, { className: "nav-chevron", size: 14 })
          ]
        },
        n.path
      )) }),
      /* @__PURE__ */ jsxs8("button", { className: "capture-sidebar", onClick: () => setCapture(true), children: [
        /* @__PURE__ */ jsx9("span", { className: "capture-icon", children: /* @__PURE__ */ jsx9(Plus7, { size: 20 }) }),
        /* @__PURE__ */ jsx9("span", { children: "Captura r\xE1pida" }),
        /* @__PURE__ */ jsx9("kbd", { children: "N" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "sidebar-space", children: [
        /* @__PURE__ */ jsxs8("div", { className: "sidebar-orbit", children: [
          /* @__PURE__ */ jsx9("i", {}),
          /* @__PURE__ */ jsx9("i", {}),
          /* @__PURE__ */ jsx9("i", {}),
          /* @__PURE__ */ jsx9("span", { children: "\u2726" })
        ] }),
        /* @__PURE__ */ jsxs8("p", { children: [
          "Tu vida tiene muchas partes.",
          /* @__PURE__ */ jsx9("br", {}),
          /* @__PURE__ */ jsx9("strong", { children: "Ac\xE1, todas se conectan." })
        ] }),
        /* @__PURE__ */ jsx9("div", { className: "spectrum-line" })
      ] }),
      /* @__PURE__ */ jsxs8("div", { className: "sidebar-bottom", children: [
        /* @__PURE__ */ jsxs8(
          "a",
          {
            href: "/settings",
            className: `settings-nav ${section === "settings" ? "active" : ""}`,
            onClick: (e) => {
              e.preventDefault();
              navigate("/settings");
            },
            children: [
              /* @__PURE__ */ jsx9(Settings3, { size: 18 }),
              "Ajustes",
              /* @__PURE__ */ jsx9(ArrowUpRight7, { size: 14 })
            ]
          }
        ),
        /* @__PURE__ */ jsxs8("button", { className: "profile", onClick: () => navigate("/settings"), children: [
          /* @__PURE__ */ jsx9("span", { className: "avatar", children: (db.settings.nombre_mostrar || preferences.name || "T").slice(0, 1).toUpperCase() }),
          /* @__PURE__ */ jsxs8("span", { children: [
            /* @__PURE__ */ jsx9("strong", { children: db.settings.nombre_mostrar || db.settings.display_name || preferences.name || "Tu espacio personal" }),
            /* @__PURE__ */ jsx9("small", { children: mode === "local" ? "Guardado en este navegador" : "Conectado con SGR" })
          ] }),
          /* @__PURE__ */ jsx9(
            "span",
            {
              className: `connection-dot ${status === "offline" ? "offline" : ""}`
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "main-shell", children: [
      /* @__PURE__ */ jsxs8("header", { className: "topbar", children: [
        /* @__PURE__ */ jsxs8("div", { className: "inline", children: [
          /* @__PURE__ */ jsx9(
            IconButton,
            {
              icon: Menu,
              label: "Abrir navegaci\xF3n",
              onClick: () => setMobile((v) => !v),
              className: "icon-button mobile-menu"
            }
          ),
          /* @__PURE__ */ jsxs8("div", { className: "breadcrumb", children: [
            /* @__PURE__ */ jsx9("span", { children: "Mi espacio" }),
            /* @__PURE__ */ jsx9(ChevronRight4, { size: 13 }),
            /* @__PURE__ */ jsx9("strong", { children: current?.label || "Ajustes" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs8("div", { className: "topbar-actions", children: [
          /* @__PURE__ */ jsxs8("button", { className: "global-search", onClick: () => setCommand(true), children: [
            /* @__PURE__ */ jsx9(Search3, { size: 16 }),
            /* @__PURE__ */ jsx9("span", { children: "Encontr\xE1 lo que ten\xE9s en mente" }),
            /* @__PURE__ */ jsx9("kbd", { children: "Ctrl K" })
          ] }),
          /* @__PURE__ */ jsxs8("span", { className: "today-label", children: [
            /* @__PURE__ */ jsx9(Sun3, { size: 15 }),
            labelDate(today(), { day: "numeric", month: "short" })
          ] }),
          /* @__PURE__ */ jsxs8("div", { className: "notifications-wrap", children: [
            /* @__PURE__ */ jsxs8(
              "button",
              {
                className: "icon-button notification-button",
                "aria-label": `Notificaciones, ${pending.length} h\xE1bitos pendientes`,
                onClick: () => setNotices((v) => !v),
                children: [
                  /* @__PURE__ */ jsx9(Bell2, { size: 18 }),
                  pending.length > 0 && /* @__PURE__ */ jsx9("i", {})
                ]
              }
            ),
            notices && /* @__PURE__ */ jsxs8("div", { className: "notifications-popover", children: [
              /* @__PURE__ */ jsxs8("div", { className: "inline spread", children: [
                /* @__PURE__ */ jsx9("strong", { children: "Tu d\xEDa sigue en marcha" }),
                /* @__PURE__ */ jsx9(
                  IconButton,
                  {
                    icon: X2,
                    label: "Cerrar notificaciones",
                    onClick: () => setNotices(false)
                  }
                )
              ] }),
              pending.slice(0, 5).map((h) => /* @__PURE__ */ jsxs8(
                "button",
                {
                  onClick: () => {
                    setNotices(false);
                    navigate("/habitos");
                  },
                  children: [
                    /* @__PURE__ */ jsx9(
                      "span",
                      {
                        className: "color-dot",
                        style: { background: h.color }
                      }
                    ),
                    h.nombre,
                    /* @__PURE__ */ jsx9(ArrowUpRight7, { size: 14 })
                  ]
                },
                h.id
              )),
              !pending.length && /* @__PURE__ */ jsx9("p", { children: "Sin h\xE1bitos pendientes para hoy." }),
              /* @__PURE__ */ jsxs8(
                "button",
                {
                  className: "text-button",
                  onClick: () => {
                    navigate("/agenda");
                    setNotices(false);
                  },
                  children: [
                    "Ver mi agenda ",
                    /* @__PURE__ */ jsx9(ArrowRight3, { size: 14 })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsx9("div", { className: "topbar-divider" }),
          /* @__PURE__ */ jsxs8(
            "button",
            {
              className: `connection-badge ${status}`,
              onClick: () => navigate("/settings"),
              children: [
                /* @__PURE__ */ jsx9("span", {}),
                status === "connecting" ? "Conectando" : mode === "local" ? "Espacio local" : status === "online" ? "SGR conectado" : "Sin conexi\xF3n"
              ]
            }
          )
        ] })
      ] }),
      status === "offline" && /* @__PURE__ */ jsxs8("div", { className: "connection-banner", role: "alert", children: [
        /* @__PURE__ */ jsx9(AlertCircle2, { size: 17 }),
        /* @__PURE__ */ jsx9("span", { children: "No pudimos conectar con SGR. Tus datos no se modificaron." }),
        /* @__PURE__ */ jsx9(Button, { icon: RefreshCw4, onClick: app.connect, children: "Reintentar" }),
        /* @__PURE__ */ jsx9(Button, { onClick: () => app.setMode("local"), children: "Abrir espacio local" })
      ] }),
      status === "connecting" && /* @__PURE__ */ jsx9("div", { className: "loading-line" }),
      /* @__PURE__ */ jsx9("main", { id: "main-content", tabIndex: -1, children: /* @__PURE__ */ jsxs8(
        Suspense2,
        {
          fallback: /* @__PURE__ */ jsxs8("div", { className: "page-loading", children: [
            /* @__PURE__ */ jsx9(LoaderCircle2, { size: 28 }),
            /* @__PURE__ */ jsx9("p", { children: "Conectando las partes de tu universo\u2026" })
          ] }),
          children: [
            section === "boveda" && /* @__PURE__ */ jsx9(
              Boveda2,
              {
                noteId: pathname.startsWith("/hoja/") ? decodeURIComponent(pathname.split("/")[2]) : null,
                navigate
              }
            ),
            section === "finanzas" && /* @__PURE__ */ jsx9(
              Finanzas2,
              {
                tab: ["dashboard", "anual", "fire", "ahorro", "datos"].includes(
                  tab
                ) ? tab : "dashboard",
                setTab
              }
            ),
            section === "agenda" && /* @__PURE__ */ jsx9(
              Agenda2,
              {
                tab: ["hoy", "mes", "tareas", "revision"].includes(tab) ? tab : "hoy",
                setTab
              }
            ),
            section === "habitos" && /* @__PURE__ */ jsx9(
              Habitos2,
              {
                tab: ["hoy", "progreso", "historial"].includes(tab) ? tab : "hoy",
                setTab
              }
            ),
            section === "settings" && /* @__PURE__ */ jsx9(SettingsPage, {})
          ]
        }
      ) }),
      /* @__PURE__ */ jsxs8("footer", { className: "app-footer", children: [
        /* @__PURE__ */ jsxs8("span", { children: [
          /* @__PURE__ */ jsx9("span", { className: "live-dot" }),
          " UN POCO M\xC1S DE CLARIDAD, CADA D\xCDA."
        ] }),
        /* @__PURE__ */ jsxs8("button", { onClick: () => setShortcuts(true), children: [
          /* @__PURE__ */ jsx9(Keyboard, { size: 14 }),
          "Atajos de teclado"
        ] }),
        /* @__PURE__ */ jsxs8("span", { children: [
          "HECHO PARA TU \xD3RBITA ",
          /* @__PURE__ */ jsx9("span", { className: "footer-star", children: "\u2733" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx9(GlobalModals, {}),
    command && /* @__PURE__ */ jsx9(CommandPalette, { onClose: () => setCommand(false), navigate }),
    capture && /* @__PURE__ */ jsx9(
      Modal,
      {
        title: "Una idea. Un primer paso.",
        onClose: () => {
          setCapture(false);
          if (pathname === "/capture") navigate("/");
        },
        children: /* @__PURE__ */ jsxs8("div", { className: "modal-body", children: [
          /* @__PURE__ */ jsx9("p", { className: "muted", children: "Sacalo de tu cabeza. Dale un lugar." }),
          /* @__PURE__ */ jsx9("div", { className: "capture-options", children: [
            [
              "hojas",
              "Guardar una idea",
              "Una nota, un enlace o una imagen.",
              FileText2,
              "#9f96ff"
            ],
            [
              "movimientos",
              "Registrar dinero",
              "Un ingreso o un gasto.",
              Wallet2,
              "#ffad79"
            ],
            [
              "eventos",
              "Reservar tiempo",
              "Un momento para lo importante.",
              CalendarDays3,
              "#65d9ee"
            ],
            [
              "tareas",
              "Anotar una tarea",
              "El pr\xF3ximo paso, por peque\xF1o que sea.",
              CheckSquare2,
              "#f5dc78"
            ],
            [
              "habitos",
              "Crear un h\xE1bito",
              "Un compromiso con tu futuro.",
              Leaf2,
              "#b4f580"
            ]
          ].map(([resource, label, desc, Icon, color]) => /* @__PURE__ */ jsxs8(
            "button",
            {
              onClick: () => openCapture(resource),
              style: { "--capture-color": color },
              children: [
                /* @__PURE__ */ jsx9(Icon, { size: 24 }),
                /* @__PURE__ */ jsxs8("span", { children: [
                  /* @__PURE__ */ jsx9("strong", { children: label }),
                  /* @__PURE__ */ jsx9("small", { children: desc })
                ] }),
                /* @__PURE__ */ jsx9(ArrowUpRight7, { size: 20 })
              ]
            },
            resource
          )) })
        ] })
      }
    ),
    shortcuts && /* @__PURE__ */ jsx9(
      Modal,
      {
        title: "Menos clics. M\xE1s fluidez.",
        onClose: () => setShortcuts(false),
        children: /* @__PURE__ */ jsx9("div", { className: "modal-body shortcuts-list", children: [
          ["Ctrl + K", "Buscar en todo tu universo"],
          ["N", "Abrir captura r\xE1pida"],
          ["Ctrl + Enter", "Guardar el formulario actual"],
          ["Esc", "Cerrar una ventana"],
          ["Ctrl + M", "Ver los atajos"],
          ["\u2191 \u2193 \u2190 \u2192", "Moverte entre los d\xEDas de h\xE1bitos"]
        ].map(([key, text]) => /* @__PURE__ */ jsxs8("div", { children: [
          /* @__PURE__ */ jsx9("span", { children: text }),
          /* @__PURE__ */ jsx9("kbd", { children: key })
        ] }, key)) })
      }
    ),
    toast && /* @__PURE__ */ jsxs8(
      "div",
      {
        className: `toast ${toast.type}`,
        role: toast.type === "error" ? "alert" : "status",
        "aria-live": toast.type === "error" ? "assertive" : "polite",
        children: [
          toast.type === "error" ? /* @__PURE__ */ jsx9(AlertCircle2, { size: 19 }) : /* @__PURE__ */ jsx9(Check7, { size: 19 }),
          /* @__PURE__ */ jsx9("span", { children: toast.message }),
          /* @__PURE__ */ jsx9(
            IconButton,
            {
              icon: X2,
              label: "Cerrar aviso",
              onClick: () => setToast(null)
            }
          )
        ]
      }
    )
  ] });
}
function CommandPalette({ onClose, navigate }) {
  const { db, setModal } = useApp();
  const [query, setQuery] = useState9("");
  const q = query.toLowerCase();
  const entries = [
    ...db.hojas.map((x) => ({
      item: x,
      resource: "hojas",
      label: "B\xF3veda",
      icon: FileText2,
      path: `/hoja/${encodeURIComponent(x.id)}`
    })),
    ...db.tareas.map((x) => ({
      item: x,
      resource: "tareas",
      label: "Tarea",
      icon: CheckSquare2
    })),
    ...db.eventos.map((x) => ({
      item: x,
      resource: "eventos",
      label: "Evento",
      icon: CalendarDays3
    })),
    ...db.movimientos.map((x) => ({
      item: x,
      resource: "movimientos",
      label: "Movimiento",
      icon: Wallet2
    })),
    ...db.habitos.map((x) => ({
      item: x,
      resource: "habitos",
      label: "H\xE1bito",
      icon: Leaf2
    }))
  ].filter(
    (e) => q && `${title(e.item)} ${e.item.contenido || ""} ${e.item.descripcion || ""}`.toLowerCase().includes(q)
  ).slice(0, 30);
  return /* @__PURE__ */ jsx9(Modal, { title: "Todo est\xE1 conectado.", onClose, children: /* @__PURE__ */ jsxs8("div", { className: "modal-body command-body", children: [
    /* @__PURE__ */ jsx9(
      SearchBox,
      {
        value: query,
        onChange: setQuery,
        placeholder: "Busc\xE1 una idea, una tarea, un movimiento\u2026",
        autoFocus: true
      }
    ),
    !q ? /* @__PURE__ */ jsx9("div", { className: "command-links", children: nav.map((n) => /* @__PURE__ */ jsxs8(
      "button",
      {
        onClick: () => {
          navigate(n.path);
          onClose();
        },
        children: [
          /* @__PURE__ */ jsx9(n.icon, { size: 20, color: n.color }),
          /* @__PURE__ */ jsxs8("span", { children: [
            "Ir a ",
            n.label
          ] }),
          /* @__PURE__ */ jsx9(ArrowUpRight7, { size: 17 })
        ]
      },
      n.path
    )) }) : /* @__PURE__ */ jsxs8("div", { className: "command-results", children: [
      entries.map((e) => /* @__PURE__ */ jsxs8(
        "button",
        {
          onClick: () => {
            onClose();
            if (e.path) navigate(e.path);
            else
              setModal({
                type: "form",
                resource: e.resource,
                item: e.item
              });
          },
          children: [
            /* @__PURE__ */ jsx9(e.icon, { size: 18 }),
            /* @__PURE__ */ jsxs8("span", { children: [
              /* @__PURE__ */ jsx9("strong", { children: title(e.item) }),
              /* @__PURE__ */ jsx9("small", { children: e.label })
            ] }),
            /* @__PURE__ */ jsx9(ArrowUpRight7, { size: 15 })
          ]
        },
        `${e.resource}-${e.item.id}`
      )),
      !entries.length && /* @__PURE__ */ jsx9("p", { className: "muted", children: "No hay coincidencias en los datos cargados. Prob\xE1 con otra palabra." })
    ] })
  ] }) });
}
function useNotifications({ db, preferences, notify }) {
  const sent = useRef5(/* @__PURE__ */ new Set());
  useEffect8(() => {
    if (!preferences.notifications || !("Notification" in window) || Notification.permission !== "granted")
      return;
    const check = () => {
      const now = Date.now(), lead = (preferences.lead || 0) * 6e4;
      const items = [
        ...db.eventos.filter((e) => !e.todo_el_dia).map((e) => ({
          id: "e" + e.id,
          title: e.titulo,
          start: e.fecha_inicio
        })),
        ...db.habitos.filter((h) => h.hora && h.notificar && scheduled(h, today())).map((h) => ({
          id: "h" + h.id + today(),
          title: h.nombre,
          start: today() + "T" + h.hora
        }))
      ];
      items.forEach((i) => {
        const diff = new Date(i.start).getTime() - now;
        if (diff >= 0 && diff <= Math.max(lead, 6e4) && !sent.current.has(i.id)) {
          sent.current.add(i.id);
          try {
            new Notification(i.title, {
              body: `Empieza a las ${i.start.slice(11, 16)}`,
              icon: "/favicon.svg"
            });
          } catch {
            notify(i.title);
          }
        }
      });
    };
    check();
    const timer = setInterval(check, 3e4);
    return () => clearInterval(timer);
  }, [db.eventos, db.habitos, preferences.notifications, preferences.lead]);
}

// tests/ui.jsx
init_Boveda();
init_Finanzas();
init_Agenda();
init_Habitos();
init_Settings();
init_local();
init_domain();
init_resources();
import { jsx as jsx10, jsxs as jsxs9 } from "react/jsx-runtime";
var context;
function Observer() {
  context = useApp();
  return null;
}
function wrap(element) {
  return render(
    /* @__PURE__ */ jsxs9(Provider, { children: [
      /* @__PURE__ */ jsx10(Observer, {}),
      element,
      /* @__PURE__ */ jsx10(GlobalModals, {})
    ] })
  );
}
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  localStorage.setItem("sgr-orbita-v1-mode", JSON.stringify("local"));
});
afterEach(() => {
  cleanup();
});
test("Todos los m\xF3dulos y sus pesta\xF1as renderizan con datos y vac\xEDos", async () => {
  for (const data of [emptyDB(), sampleDB()]) {
    localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(data));
    const views = [
      /* @__PURE__ */ jsx10(Boveda, { navigate: () => {
      } }),
      ...["dashboard", "anual", "fire", "ahorro", "datos"].map((tab) => /* @__PURE__ */ jsx10(Finanzas, { tab, setTab: () => {
      } })),
      ...["hoy", "mes", "tareas", "revision"].map((tab) => /* @__PURE__ */ jsx10(Agenda, { tab, setTab: () => {
      } })),
      ...["hoy", "progreso", "historial"].map((tab) => /* @__PURE__ */ jsx10(Habitos, { tab, setTab: () => {
      } })),
      /* @__PURE__ */ jsx10(Settings, {})
    ];
    for (const view of views) {
      const result = wrap(view);
      assert.ok(result.container.querySelector("h1"));
      assert.ok(!result.container.textContent.includes("NaN"));
      result.unmount();
    }
  }
});
test("Crear, editar y eliminar una nota persiste los cambios", async () => {
  wrap(/* @__PURE__ */ jsx10(Boveda, { navigate: () => {
  } }));
  fireEvent.click(screen.getByRole("button", { name: "Capturar una idea" }));
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Mi nota de prueba" }
  });
  fireEvent.change(screen.getByLabelText("Contenido o URL"), {
    target: { value: "Una idea importante." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true }));
  await waitFor(() => assert.equal(context.db.hojas.length, 1));
  assert.equal(
    JSON.parse(localStorage.getItem("sgr-orbita-v1-local")).hojas[0].titulo,
    "Mi nota de prueba"
  );
  const note = context.db.hojas[0];
  await act(
    async () => context.setModal({ type: "form", resource: "hojas", item: note })
  );
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Nota actualizada" }
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true }));
  await waitFor(
    () => assert.equal(context.db.hojas[0].titulo, "Nota actualizada")
  );
  await act(
    async () => context.setModal({
      type: "delete",
      resource: "hojas",
      item: context.db.hojas[0]
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "S\xED, eliminar" }));
  await waitFor(() => assert.equal(context.db.hojas.length, 0));
});
test("Completar tarea y h\xE1bito actualiza estado persistido", async () => {
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(sampleDB()));
  const result = wrap(/* @__PURE__ */ jsx10(Agenda, { tab: "tareas", setTab: () => {
  } }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Completar Darle forma a una nueva idea"
    })
  );
  await waitFor(
    () => assert.equal(context.db.tareas.find((t) => t.id === "t1").completada, true)
  );
  result.unmount();
  wrap(/* @__PURE__ */ jsx10(Habitos, { tab: "hoy", setTab: () => {
  } }));
  fireEvent.click(
    screen.getAllByRole("button", {
      name: /Leer un capítulo,.*sin completar/
    })[0]
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: /Avancé un poco/ })
  );
  fireEvent.change(within(dialog).getByLabelText(/Una nota para vos/), {
    target: { value: "Un avance peque\xF1o" }
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Guardar progreso" })
  );
  await waitFor(
    () => assert.ok(
      context.db.registros.some(
        (r) => r.habito_id === "h1" && r.valor === 0.5 && r.nota === "Un avance peque\xF1o"
      )
    )
  );
});
test("Formulario rechaza eventos cuyo fin es anterior al inicio", async () => {
  const data = emptyDB();
  data.calendarios = [{ id: "a1", nombre: "Personal" }];
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(data));
  wrap(/* @__PURE__ */ jsx10(ResourceForm, { resource: "eventos" }));
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Evento inv\xE1lido" }
  });
  fireEvent.change(screen.getByLabelText(/Calendario/), {
    target: { value: "a1" }
  });
  fireEvent.change(screen.getByLabelText(/^Inicio/), {
    target: { value: today() + "T12:00" }
  });
  fireEvent.change(screen.getByLabelText(/^Fin/), {
    target: { value: today() + "T11:00" }
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Guardar", exact: true }).closest("form")
  );
  await waitFor(
    () => assert.match(screen.getByRole("alert").textContent, /posterior al inicio/)
  );
  assert.equal(context.db.eventos.length, 0);
});
test("Espacio local persiste al recargar y API fallida no modifica sus datos", async () => {
  const data = sampleDB();
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(data));
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("offline");
  };
  try {
    wrap(/* @__PURE__ */ jsx10(Observer, {}));
    assert.equal(context.db.hojas.length, 8);
    await act(async () => context.setMode("api"));
    await waitFor(() => assert.equal(context.status, "offline"));
    await act(async () => {
      await assert.rejects(
        () => context.mutate("hojas", "save", { titulo: "No guardar" }),
        /Conectá/
      );
    });
    assert.equal(
      JSON.parse(localStorage.getItem("sgr-orbita-v1-local")).hojas.length,
      8
    );
    await act(async () => context.setMode("local"));
    await waitFor(() => assert.equal(context.db.hojas.length, 8));
  } finally {
    globalThis.fetch = original;
  }
});
test("Navegaci\xF3n, captura r\xE1pida y b\xFAsqueda global funcionan por teclado", async () => {
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(sampleDB()));
  render(
    /* @__PURE__ */ jsx10(Provider, { children: /* @__PURE__ */ jsx10(App, {}) })
  );
  await screen.findByRole("heading", { name: /Las ideas/ });
  fireEvent.click(screen.getByRole("link", { name: /Finanzas/ }));
  await screen.findByRole("heading", { name: /Tu dinero/ });
  assert.equal(window.location.pathname, "/finanzas");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByRole("textbox", { name: /Buscá una idea/ }), {
    target: { value: "segunda mente" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Una segunda mente/ }));
  await screen.findByRole("heading", { name: "Una segunda mente" });
  assert.ok(window.location.pathname.startsWith("/hoja/"));
  fireEvent.keyDown(document.body, { key: "n" });
  await screen.findByRole("heading", { name: "Una idea. Un primer paso." });
  fireEvent.click(screen.getByRole("button", { name: /Crear un hábito/ }));
  await screen.findByRole("heading", { name: "Crear h\xE1bito" });
});
test("API: adapta formularios a nombres y enums del contrato, y env\xEDa el cuerpo correcto", async () => {
  localStorage.setItem("sgr-orbita-v1-mode", JSON.stringify("api"));
  const paths = Object.fromEntries(
    Object.values(resources).map((r) => [r.path, { get: {} }])
  );
  paths["/fin/movimientos"].post = {
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: [
              "descripcion",
              "tipo",
              "monto",
              "fecha",
              "cuenta_nombre",
              "categoria_nombre"
            ],
            properties: {
              descripcion: { type: "string" },
              tipo: { type: "string", enum: ["income", "expense"] },
              monto: { type: "number" },
              fecha: { type: "string", format: "date" },
              moneda: { type: "string", enum: ["ARS", "USD"], default: "ARS" },
              cuenta_nombre: { type: "string" },
              categoria_nombre: { type: "string" }
            }
          }
        }
      }
    }
  };
  paths["/fin/fire-filas/{mes}"] = {
    put: {
      parameters: [
        { name: "mes", in: "path", required: true, schema: { type: "string" } }
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ahorrado"],
              properties: { ahorrado: { type: "number" } }
            }
          }
        }
      }
    }
  };
  const calls = [], movements = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    const path = String(url).replace("/api", "").split("?")[0];
    let data = [];
    if (path === "/openapi.json") data = { paths };
    else if (path === "/fin/cuentas")
      data = [{ id: 17, nombre: "Banco de prueba" }];
    else if (path === "/fin/categorias")
      data = [{ id: 23, nombre: "Alimentos" }];
    else if (path === "/fin/movimientos") {
      if (options.method === "POST")
        movements.push({ id: 9, ...JSON.parse(options.body) });
      data = options.method === "POST" ? movements.at(-1) : movements;
    } else if (path.startsWith("/fin/fire-filas/") && options.method === "PUT")
      data = { mes: path.split("/").pop(), ...JSON.parse(options.body) };
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    wrap(/* @__PURE__ */ jsx10(Observer, {}));
    await waitFor(() => assert.equal(context.db.cuentas.length, 1));
    await act(
      async () => context.setModal({ type: "form", resource: "movimientos" })
    );
    fireEvent.change(screen.getByLabelText(/Descripción/), {
      target: { value: "Almuerzo" }
    });
    fireEvent.change(screen.getByLabelText(/Importe/), {
      target: { value: "4200" }
    });
    fireEvent.change(screen.getByLabelText(/^Cuenta/), {
      target: { value: "Banco de prueba" }
    });
    fireEvent.change(screen.getByLabelText(/^Categoría/), {
      target: { value: "Alimentos" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar", exact: true })
    );
    await waitFor(() => assert.equal(context.db.movimientos.length, 1));
    const call = calls.find((c) => c.method === "POST");
    const body = JSON.parse(call.body);
    assert.equal(body.cuenta_nombre, "Banco de prueba");
    assert.equal(body.categoria_nombre, "Alimentos");
    assert.equal(body.tipo, "expense");
    assert.equal(body.monto, 4200);
    assert.equal(body.cuenta_id, void 0);
    assert.ok(
      calls.filter(
        (c) => String(c.url).includes("/fin/movimientos") && c.method === "GET"
      ).every((c) => !String(c.url).includes("fecha_desde"))
    );
    await act(
      async () => context.setModal({ type: "form", resource: "fireFilas" })
    );
    fireEvent.change(screen.getByLabelText(/^Mes/), {
      target: { value: "2026-09" }
    });
    fireEvent.change(screen.getByLabelText(/Saldo acumulado/), {
      target: { value: "900" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar", exact: true })
    );
    await waitFor(
      () => assert.ok(
        calls.some(
          (c) => c.url === "/api/fin/fire-filas/2026-09" && c.method === "PUT"
        )
      )
    );
    const put = calls.find((c) => c.url === "/api/fin/fire-filas/2026-09");
    assert.deepEqual(JSON.parse(put.body), { ahorrado: 900 });
    await waitFor(() => assert.equal(context.modal, null));
  } finally {
    globalThis.fetch = original;
  }
});
