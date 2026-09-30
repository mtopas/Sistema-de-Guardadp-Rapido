import { today } from "./domain";
const f = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  ...extra,
});
export const resources = {
  hojas: {
    path: "/hojas",
    label: "nota",
    plural: "Notas",
    fields: [
      f("titulo", "Título", "text", { required: true }),
      f("tipo", "Tipo", "select", {
        options: ["texto", "link", "foto"],
        default: "texto",
      }),
      f("categoria_id", "Colección", "relation", { source: "categorias" }),
      f("contenido", "Contenido o URL", "textarea"),
      f("apuntes", "Apuntes", "textarea"),
      f("color", "Color", "color"),
    ],
  },
  categorias: {
    path: "/categorias",
    label: "colección",
    plural: "Colecciones",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("padre_id", "Colección superior", "relation", { source: "categorias" }),
      f("color", "Color", "color"),
      f("icono", "Ícono / emoji"),
    ],
  },
  movimientos: {
    path: "/fin/movimientos",
    label: "movimiento",
    plural: "Movimientos",
    fields: [
      f("descripcion", "Descripción", "text", { required: true }),
      f("tipo", "Tipo", "select", {
        options: ["gasto", "ingreso"],
        default: "gasto",
      }),
      f("monto", "Importe", "number", { required: true, min: 0.01 }),
      f("moneda", "Moneda", "select", {
        options: ["ARS", "USD"],
        default: "ARS",
      }),
      f("fecha", "Fecha", "date", { required: true, default: today }),
      f("cuenta_id", "Cuenta", "relation", {
        source: "cuentas",
        required: true,
      }),
      f("categoria_id", "Categoría", "relation", {
        source: "finCategorias",
        required: true,
      }),
      f("cuotas", "Cuotas", "number", { min: 1, default: 1 }),
      f("nota", "Nota", "textarea"),
    ],
  },
  cuentas: {
    path: "/fin/cuentas",
    label: "cuenta",
    plural: "Cuentas",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("tipo", "Tipo", "select", {
        options: ["banco", "billetera", "efectivo"],
        default: "banco",
      }),
      f("color", "Color", "color"),
    ],
  },
  finCategorias: {
    path: "/fin/categorias",
    label: "categoría",
    plural: "Categorías",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("tipo", "Tipo", "select", {
        options: ["gasto", "ingreso", "both"],
        default: "both",
      }),
      f("color", "Color", "color"),
      f("oculta", "Oculta", "checkbox"),
    ],
  },
  objetivos: {
    path: "/fin/objetivos",
    label: "objetivo",
    plural: "Objetivos",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("monto_objetivo", "Meta en USD", "number", { required: true, min: 1 }),
      f("fecha_objetivo", "Fecha objetivo", "date"),
      f("color", "Color", "color"),
    ],
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
        default: "acciones",
      }),
      f("precio_actual", "Precio actual USD", "number", { min: 0 }),
    ],
  },
  transacciones: {
    path: "/fin/transacciones",
    label: "transacción",
    plural: "Transacciones",
    fields: [
      f("instrumento_id", "Instrumento", "relation", {
        source: "instrumentos",
        required: true,
      }),
      f("tipo", "Operación", "select", {
        options: ["compra", "venta"],
        default: "compra",
      }),
      f("fecha", "Fecha", "date", { default: today, required: true }),
      f("cantidad", "Cantidad", "number", { required: true, min: 0.00000001 }),
      f("precio", "Precio unitario", "number", { required: true, min: 0 }),
      f("moneda", "Moneda", "select", {
        options: ["ARS", "USD"],
        default: "USD",
      }),
      f("tipo_cambio", "Tipo de cambio ARS/USD", "number", { min: 0.01 }),
      f("nota", "Nota", "textarea"),
    ],
  },
  finNotas: {
    path: "/fin/notas",
    label: "nota financiera",
    plural: "Notas financieras",
    fields: [
      f("contenido", "Nota", "textarea", { required: true }),
      f("mes", "Mes", "month", { default: () => today().slice(0, 7) }),
    ],
  },
  calendarios: {
    path: "/agenda/calendarios",
    label: "calendario",
    plural: "Calendarios",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("color", "Color", "color"),
      f("activo", "Activo", "checkbox", { default: true }),
    ],
  },
  eventos: {
    path: "/agenda/eventos",
    label: "evento",
    plural: "Eventos",
    fields: [
      f("titulo", "Título", "text", { required: true }),
      f("calendario_id", "Calendario", "relation", {
        source: "calendarios",
        required: true,
      }),
      f("fecha_inicio", "Inicio", "datetime-local", {
        required: true,
        default: () => today() + "T09:00",
      }),
      f("fecha_fin", "Fin", "datetime-local", {
        required: true,
        default: () => today() + "T10:00",
      }),
      f("todo_el_dia", "Todo el día", "checkbox"),
      f("descripcion", "Descripción", "textarea"),
      f("se_repite", "Se repite", "checkbox"),
      f("regla_repeticion", "Regla de repetición", "json"),
    ],
  },
  listas: {
    path: "/agenda/listas",
    label: "lista",
    plural: "Listas de tareas",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("color", "Color", "color"),
      f("pinned", "Fijar arriba", "checkbox"),
    ],
  },
  tareas: {
    path: "/agenda/tareas",
    label: "tarea",
    plural: "Tareas",
    fields: [
      f("titulo", "Título", "text", { required: true }),
      f("lista_id", "Lista", "relation", { source: "listas" }),
      f("fecha_opcional", "Fecha", "date"),
      f("hora_opcional", "Hora", "time"),
      f("hora_bloque", "Reservar un bloque a las", "time"),
      f("duracion_estimada", "Duración (minutos)", "number", {
        min: 5,
        default: 30,
      }),
      f("descripcion", "Descripción", "textarea"),
      f("completada", "Completada", "checkbox"),
      f("se_repite", "Se repite", "checkbox"),
      f("regla_repeticion", "Regla de repetición", "json"),
    ],
  },
  facultad: {
    path: "/agenda/horario-facultad",
    label: "materia",
    plural: "Horario de facultad",
    fields: [
      f("nombre", "Materia", "text", { required: true }),
      f("dia_semana", "Día (0 domingo a 6 sábado)", "number", {
        required: true,
        min: 0,
        max: 6,
      }),
      f("hora_inicio", "Inicio", "time", { required: true }),
      f("hora_fin", "Fin", "time", { required: true }),
      f("color", "Color", "color"),
    ],
  },
  habitos: {
    path: "/habitos",
    label: "hábito",
    plural: "Hábitos",
    fields: [
      f("nombre", "Nombre", "text", { required: true }),
      f("descripcion", "Tu intención", "textarea"),
      f("categoria", "Categoría"),
      f("color", "Color", "color"),
      f("frecuencia_tipo", "Frecuencia", "select", {
        options: ["diario", "semanal"],
        default: "diario",
      }),
      f("dias_semana", "Días de la semana", "weekdays"),
      f("hora", "Hora (opcional)", "time"),
      f("activo", "Activo", "checkbox", { default: true }),
      f("notificar", "Recordar", "checkbox"),
      f("minutos_antes", "Minutos de anticipación", "number", {
        min: 0,
        default: 15,
      }),
    ],
  },
  registros: {
    path: "/habitos/registros",
    label: "registro",
    plural: "Registros",
    fields: [],
  },
  fireFilas: {
    path: "/fin/fire-filas",
    label: "aporte FIRE",
    plural: "Aportes FIRE",
    fields: [
      f("mes", "Mes", "month", { required: true }),
      f("ahorrado", "Saldo acumulado USD", "number", { required: true }),
    ],
  },
  inflacion: {
    path: "/fin/inflacion",
    label: "inflación",
    plural: "Inflación mensual",
    fields: [
      f("mes", "Mes", "month", { required: true }),
      f("porcentaje", "Inflación (%)", "number", { required: true }),
    ],
  },
  feedback: {
    path: "/feedback",
    label: "comentario",
    plural: "Feedback",
    fields: [
      f("titulo", "Título", "text", { required: true }),
      f("contenido", "Comentario", "textarea", { required: true }),
    ],
  },
};
export const labels = {
  cuenta_nombre: "Cuenta",
  categoria_nombre: "Categoría",
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
  dolar_mep: "Dólar MEP",
  dolar_oficial: "Dólar manual",
  dolar_oficial_compra: "Dólar oficial compra",
  nombre_mostrar: "Nombre para mostrar",
};
