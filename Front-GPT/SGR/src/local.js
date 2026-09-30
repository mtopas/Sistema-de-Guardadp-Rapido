import { today, addDays, num, amount, income, scheduled } from "./domain.js";
const clone = (value) => JSON.parse(JSON.stringify(value));
const id = () => globalThis.crypto.randomUUID();
export function emptyDB() {
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
      fire_aumento_aporte: 0,
    },
    settings: { nombre_mostrar: "" },
  };
}
export function localMutation(previous, key, action, payload) {
  const db = clone(previous);
  let row;
  if (action === "delete") {
    const target = db[key].find((x) => String(x.id) === String(payload.id));
    if (
      key === "categorias" &&
      (db.hojas.some((x) => String(x.categoria_id) === String(payload.id)) ||
        db.categorias.some((x) => String(x.padre_id) === String(payload.id)))
    )
      throw Error(
        "Mové las notas y subcolecciones antes de eliminar esta colección.",
      );
    if (
      key === "cuentas" &&
      db.movimientos.some((x) => String(x.cuenta_id) === String(payload.id))
    )
      throw Error(
        "Esta cuenta tiene movimientos. Reasignalos antes de eliminarla.",
      );
    if (
      key === "finCategorias" &&
      (target?.objetivo_id ||
        ["fire", "transferencia", "ajuste"].includes(
          target?.nombre?.toLowerCase(),
        ))
    )
      throw Error("Esta categoría pertenece al sistema o a un objetivo.");
    db[key] = db[key].filter((x) => String(x.id) !== String(payload.id));
    if (key === "habitos")
      db.registros = db.registros.filter(
        (x) => String(x.habito_id) !== String(payload.id),
      );
    if (key === "calendarios")
      db.eventos = db.eventos.filter(
        (x) => String(x.calendario_id) !== String(payload.id),
      );
    if (key === "listas")
      db.tareas = db.tareas.map((x) =>
        String(x.lista_id) === String(payload.id)
          ? { ...x, lista_id: null }
          : x,
      );
    if (key === "instrumentos")
      db.transacciones = db.transacciones.filter(
        (x) => String(x.instrumento_id) !== String(payload.id),
      );
    if (key === "objetivos")
      db.finCategorias = db.finCategorias.map((c) =>
        String(c.objetivo_id) === String(payload.id)
          ? { ...c, oculta: true }
          : c,
      );
  } else if (action === "record") {
    const existing = db.registros.find(
      (r) =>
        String(r.habito_id) === String(payload.habito_id) &&
        r.fecha === payload.fecha,
    );
    row = { ...existing, ...payload, id: existing?.id || id() };
    db.registros = [...db.registros.filter((r) => r.id !== row.id), row];
  } else {
    row = {
      creado_en: new Date().toISOString(),
      ...(db[key].find((x) => String(x.id) === String(payload.id)) || {}),
      ...payload,
      id: payload.id || id(),
      actualizado_en: new Date().toISOString(),
    };
    if (key === "objetivos" && !payload.id) {
      if (
        db.objetivos.some(
          (o) => o.nombre.toLowerCase() === row.nombre.toLowerCase(),
        )
      )
        throw Error("Ya existe un objetivo con ese nombre.");
      db.finCategorias.push({
        id: id(),
        nombre: row.nombre,
        tipo: "both",
        color: row.color,
        objetivo_id: row.id,
      });
    }
    if (key === "categorias" && row.padre_id) {
      let parent = row.padre_id;
      const visited = new Set([String(row.id)]);
      while (parent) {
        if (visited.has(String(parent)))
          throw Error("Una colección no puede contenerse a sí misma.");
        visited.add(String(parent));
        parent = db.categorias.find(
          (c) => String(c.id) === String(parent),
        )?.padre_id;
      }
    }
    if (key === "transacciones") {
      const instrument = db.instrumentos.find(
        (i) => String(i.id) === String(row.instrumento_id),
      );
      if (!instrument) throw Error("Elegí un instrumento.");
      if (row.moneda === "ARS" && num(row.tipo_cambio) <= 0)
        throw Error("Ingresá el tipo de cambio para convertir a USD.");
      row.monto_total = num(row.cantidad) * num(row.precio);
    }
    db[key] = [...db[key].filter((x) => String(x.id) !== String(row.id)), row];
    if (
      ["eventos", "tareas"].includes(key) &&
      row.se_repite &&
      !payload.id &&
      row.regla_repeticion
    ) {
      const rule =
        typeof row.regla_repeticion === "string"
          ? JSON.parse(row.regla_repeticion)
          : row.regla_repeticion;
      const start = String(row.fecha_inicio || row.fecha_opcional || "").slice(
        0,
        10,
      );
      if (!start || !rule.hasta)
        throw Error(
          "La repetición necesita una fecha de inicio y una fecha final.",
        );
      if (rule.hasta > addDays(start, 366))
        throw Error("En el espacio local, la repetición permite hasta un año.");
      for (
        let day = addDays(start, 1);
        day <= rule.hasta;
        day = addDays(day, 1)
      ) {
        const d = new Date(day + "T12:00:00"),
          s = new Date(start + "T12:00:00");
        const matches =
          rule.tipo === "diario" ||
          (rule.tipo === "semanal" &&
            (rule.dias_semana || [s.getDay()]).includes(d.getDay())) ||
          (rule.tipo === "mensual" && d.getDate() === s.getDate());
        if (!matches) continue;
        const copy = { ...row, id: id(), serie_id: row.id };
        if (key === "eventos") {
          const duration = new Date(row.fecha_fin) - new Date(row.fecha_inicio);
          copy.fecha_inicio = day + row.fecha_inicio.slice(10);
          const end = new Date(
            new Date(copy.fecha_inicio).getTime() + duration,
          );
          copy.fecha_fin = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
        } else copy.fecha_opcional = day;
        db[key].push(copy);
      }
    }
  }
  db.cuentas = db.cuentas.map((c) => ({
    ...c,
    saldo_ars: db.movimientos
      .filter(
        (m) =>
          String(m.cuenta_id) === String(c.id) && (m.moneda || "ARS") === "ARS",
      )
      .reduce((a, m) => a + (income(m) ? 1 : -1) * amount(m), 0),
    saldo_usd: db.movimientos
      .filter((m) => String(m.cuenta_id) === String(c.id) && m.moneda === "USD")
      .reduce((a, m) => a + (income(m) ? 1 : -1) * amount(m), 0),
  }));
  db.instrumentos = db.instrumentos.map((inst) => {
    let quantity = 0,
      cost = 0;
    for (const tx of db.transacciones
      .filter((t) => String(t.instrumento_id) === String(inst.id))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const q = num(tx.cantidad);
      const price =
        num(tx.precio) / (tx.moneda === "ARS" ? num(tx.tipo_cambio) || 1 : 1);
      if (tx.tipo === "venta") {
        if (q > quantity + 1e-8)
          throw Error(
            "La venta supera la cantidad disponible del instrumento.",
          );
        cost -= quantity ? (cost / quantity) * q : 0;
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
        (t) => String(t.instrumento_id) === String(inst.id),
      ),
    };
  });
  return { db, row };
}
export function sampleDB() {
  const db = emptyDB(),
    d = today();
  db.settings.nombre_mostrar = "";
  db.categorias = [
    { id: "c1", nombre: "Universo creativo", color: "#9f96ff" },
    { id: "c2", nombre: "Desarrollo personal", color: "#b4f580" },
    { id: "c3", nombre: "Ideas en movimiento", color: "#ffad79" },
    { id: "c4", nombre: "Tecnología", color: "#65d9ee" },
  ];
  db.hojas = [
    [
      "Diseñar una vida con intención",
      "c2",
      "Un buen sistema deja espacio para lo inesperado.\n\nElegir tres prioridades. Cuidar la energía. Celebrar los pequeños avances.",
    ],
    [
      "El jardín de las ideas",
      "c1",
      "Conectar ideas de disciplinas diferentes. Guardar preguntas, no solo respuestas.",
    ],
    ["Una segunda mente", "c4", "Capturar → Organizar → Conectar → Crear."],
    [
      "Proyecto: mi próximo capítulo",
      "c3",
      "Un lugar para explorar lo que viene.",
    ],
    [
      "Menos ruido, más foco",
      "c2",
      "Proteger una hora al día para el trabajo que importa.",
    ],
    [
      "Inspiración sin fronteras",
      "c1",
      "Formas orgánicas, color y sistemas vivos.",
    ],
    [
      "Aprender construyendo",
      "c4",
      "Convertir cada pregunta en un pequeño experimento.",
    ],
    [
      "La lista de algún día",
      "c3",
      "Aprender fotografía. Viajar al sur. Publicar una idea.",
    ],
  ].map(([titulo, categoria_id, contenido], i) => ({
    id: "n" + i,
    titulo,
    categoria_id,
    contenido,
    tipo: "texto",
    creado_en: new Date().toISOString(),
  }));
  db.calendarios = [
    { id: "a1", nombre: "Personal", color: "#b4f580", activo: true },
    { id: "a2", nombre: "Trabajo", color: "#9f96ff", activo: true },
  ];
  db.eventos = [
    {
      id: "e1",
      titulo: "Un espacio para crear",
      fecha_inicio: d + "T10:00",
      fecha_fin: d + "T11:30",
      calendario_id: "a2",
    },
    {
      id: "e2",
      titulo: "Salir a caminar",
      fecha_inicio: d + "T17:00",
      fecha_fin: d + "T17:45",
      calendario_id: "a1",
    },
  ];
  db.listas = [
    { id: "l1", nombre: "Esta semana", color: "#ffad79", pinned: true },
    { id: "l2", nombre: "Proyectos", color: "#65d9ee" },
  ];
  db.tareas = [
    {
      id: "t1",
      titulo: "Darle forma a una nueva idea",
      lista_id: "l1",
      fecha_opcional: d,
      completada: false,
    },
    {
      id: "t2",
      titulo: "Ordenar el escritorio digital",
      lista_id: "l1",
      fecha_opcional: d,
      completada: true,
    },
    {
      id: "t3",
      titulo: "Planear el próximo proyecto",
      lista_id: "l2",
      completada: false,
    },
  ];
  db.habitos = [
    {
      id: "h1",
      nombre: "Leer un capítulo",
      color: "#b4f580",
      categoria: "Mente",
      frecuencia_tipo: "diario",
      activo: true,
    },
    {
      id: "h2",
      nombre: "Mover el cuerpo",
      color: "#ffad79",
      categoria: "Energía",
      frecuencia_tipo: "diario",
      activo: true,
      hora: "08:00",
    },
    {
      id: "h3",
      nombre: "Escribir una idea",
      color: "#9f96ff",
      categoria: "Crear",
      frecuencia_tipo: "diario",
      activo: true,
    },
  ];
  for (let i = 20; i >= 0; i--)
    db.habitos.forEach((h, j) => {
      if ((i + j) % 5 !== 0)
        db.registros.push({
          id: id(),
          habito_id: h.id,
          fecha: addDays(d, -i),
          valor: (i + j) % 7 === 0 ? 0.5 : 1,
          nota: "",
        });
    });
  db.cuentas = [
    {
      id: "q1",
      nombre: "Cuenta principal",
      tipo: "banco",
      saldo_ars: 980000,
      saldo_usd: 0,
      color: "#65d9ee",
    },
  ];
  db.finCategorias = [
    { id: "f1", nombre: "Trabajo", tipo: "ingreso", color: "#b4f580" },
    { id: "f2", nombre: "Vida diaria", tipo: "gasto", color: "#ffad79" },
    { id: "f3", nombre: "FIRE", tipo: "both", color: "#9f96ff" },
  ];
  db.movimientos = [
    {
      id: "m1",
      descripcion: "Ingresos del mes",
      tipo: "ingreso",
      monto: 1500000,
      moneda: "ARS",
      fecha: d,
      cuenta_id: "q1",
      categoria_id: "f1",
    },
    {
      id: "m2",
      descripcion: "Compras de la semana",
      tipo: "gasto",
      monto: 120000,
      moneda: "ARS",
      fecha: addDays(d, -1),
      cuenta_id: "q1",
      categoria_id: "f2",
    },
    {
      id: "m3",
      descripcion: "Inversión en mi futuro",
      tipo: "gasto",
      monto: 400000,
      moneda: "ARS",
      fecha: d,
      cuenta_id: "q1",
      categoria_id: "f3",
    },
  ];
  return db;
}
