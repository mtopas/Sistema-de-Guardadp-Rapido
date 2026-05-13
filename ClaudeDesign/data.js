/* Mock data for all 4 modules. Realistic Argentinian context. */

const BRANCH = ["#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#3b82f6","#f97316","#14b8a6","#a855f7","#f43f5e"];

const BOVEDA = {
  categories: [
    { id:"c1", name:"Lecturas",         icon:"📚", color:BRANCH[1], count:42, expanded:true,
      children:[
        { id:"c1a", name:"Ensayos",     icon:"✍️", color:BRANCH[1], count:18 },
        { id:"c1b", name:"Long-reads",  icon:"📰", color:BRANCH[1], count:14 },
        { id:"c1c", name:"Papers",      icon:"🧪", color:BRANCH[1], count:10 },
      ]
    },
    { id:"c2", name:"Ideas",            icon:"💡", color:BRANCH[3], count:27, expanded:false },
    { id:"c3", name:"Proyectos",        icon:"🧱", color:BRANCH[0], count:9,  expanded:true,
      children:[
        { id:"c3a", name:"SGR",         icon:"⚙️", color:BRANCH[0], count:6, active:true },
        { id:"c3b", name:"HomeLab",     icon:"🖥️", color:BRANCH[0], count:3 },
      ]
    },
    { id:"c4", name:"Citas",            icon:"❝",  color:BRANCH[2], count:54, expanded:false },
    { id:"c5", name:"Recetas",          icon:"🍳", color:BRANCH[6], count:11, expanded:false },
    { id:"c6", name:"Música",           icon:"🎧", color:BRANCH[8], count:23, expanded:false },
    { id:"c7", name:"Compras",          icon:"🛒", color:BRANCH[5], count:8,  expanded:false },
  ],
  leaves: [
    { id:"l1", type:"link",  title:"The Unreasonable Effectiveness of Plain Text", cat:"Lecturas › Long-reads", date:"Hace 2 días", color:BRANCH[1], host:"escapingflatland.substack.com" },
    { id:"l2", type:"text",  title:"Sobre la fricción del guardado", cat:"Ideas", date:"Hace 4 días", color:BRANCH[3], excerpt:"La idea de SGR nace del hartazgo. Cada herramienta te pide 6 clicks para guardar algo. Lo que se necesita es..." },
    { id:"l3", type:"photo", title:"Sketch del grafo radial",      cat:"Proyectos › SGR", date:"Ayer", color:BRANCH[0] },
    { id:"l4", type:"link",  title:"Tailwind + CSS Variables: el patrón estable", cat:"Proyectos › SGR", date:"Hoy", color:BRANCH[0], host:"adamwathan.me" },
    { id:"l5", type:"text",  title:"Cita de Pieper sobre el ocio", cat:"Citas", date:"06 May", color:BRANCH[2], excerpt:"El ocio no es la actitud del que interviene, sino del que se deja invadir..." },
    { id:"l6", type:"link",  title:"Cómo cocinar arroz persa",     cat:"Recetas", date:"03 May", color:BRANCH[6], host:"seriouseats.com" },
  ],
  selectedLeaf: "l4",
};

// HÁBITOS
const HABIT_COLORS = [BRANCH[0],BRANCH[2],BRANCH[1],BRANCH[3],BRANCH[5],BRANCH[6],BRANCH[8]];
const HABITOS = {
  month: "Mayo 2026",
  daysInMonth: 31,
  today: 13,
  weekdayOfFirst: 4, // 1 May 2026 is a Friday; we'll just decorate
  habits: [
    { id:"h1", name:"Meditar 10 min",     color:BRANCH[0], streak:9,  doneToday:true,
      sched:[1,2,3,4,5,6,7], doneDays:[1,2,3,4,5,7,8,9,10,11,12,13] },
    { id:"h2", name:"Correr 5km",         color:BRANCH[2], streak:4,  doneToday:false,
      sched:[1,3,5,6], doneDays:[2,4,6,9,11,13] },
    { id:"h3", name:"Leer 30 min",        color:BRANCH[1], streak:11, doneToday:true,
      sched:[1,2,3,4,5,6,7], doneDays:[1,2,3,4,5,6,7,8,9,10,11,12,13] },
    { id:"h4", name:"Sin azúcar",         color:BRANCH[3], streak:0,  doneToday:false,
      sched:[1,2,3,4,5,6,7], doneDays:[1,2,3,5,6,7,9,10,12] },
    { id:"h5", name:"Llamar a mamá",      color:BRANCH[5], streak:2,  doneToday:false,
      sched:[7], doneDays:[3,10] },
    { id:"h6", name:"Escribir journal",   color:BRANCH[6], streak:6,  doneToday:true,
      sched:[1,2,3,4,5,6,7], doneDays:[1,2,3,4,5,6,7,8,9,10,11,13] },
    { id:"h7", name:"Practicar piano",    color:BRANCH[8], streak:0,  doneToday:false,
      sched:[2,4,6], doneDays:[2,7,9] },
  ],
};

// AGENDA
const AGENDA = {
  month: "Mayo 2026",
  today: 13,
  calendars: [
    { id:"k1", name:"Personal",        color:BRANCH[0], on:true },
    { id:"k2", name:"Trabajo",         color:BRANCH[1], on:true },
    { id:"k3", name:"Familia",         color:BRANCH[3], on:true },
    { id:"k4", name:"Salud",           color:BRANCH[2], on:false },
    { id:"k5", name:"Cumpleaños",      color:BRANCH[9], on:true },
  ],
  upcoming: [
    { id:"e1", day:13, title:"Stand-up matutino",       when:"hoy · 09:30", cal:BRANCH[1] },
    { id:"e2", day:13, title:"Cena con Sofía",          when:"hoy · 21:00", cal:BRANCH[0] },
    { id:"e3", day:14, title:"Dentista",                when:"mañana · 11:00", cal:BRANCH[2] },
    { id:"e4", day:15, title:"Deploy v0.4",             when:"en 2 días · 16:00", cal:BRANCH[1] },
    { id:"e5", day:17, title:"Cumple de Tomás",         when:"en 4 días",   cal:BRANCH[9] },
  ],
  monthEvents: {
    1:  [{c:BRANCH[1], t:"1:1 con M.", h:"10:00"}],
    4:  [{c:BRANCH[3], t:"Asado familia", h:"13:00"}, {c:BRANCH[1], t:"Sprint review"}],
    6:  [{c:BRANCH[0], t:"Yoga", h:"19:00"}],
    8:  [{c:BRANCH[1], t:"Demo cliente", h:"15:00"}],
    11: [{c:BRANCH[2], t:"Análisis sangre", h:"08:00"}],
    13: [{c:BRANCH[1], t:"Stand-up", h:"09:30"}, {c:BRANCH[0], t:"Cena Sofía", h:"21:00"}],
    14: [{c:BRANCH[2], t:"Dentista", h:"11:00"}],
    15: [{c:BRANCH[1], t:"Deploy v0.4", h:"16:00"}, {c:BRANCH[0], t:"Cine"}],
    17: [{c:BRANCH[9], t:"Cumple Tomás"}],
    20: [{c:BRANCH[1], t:"Retro Q2"}],
    22: [{c:BRANCH[0], t:"Concierto", h:"21:00"}],
    25: [{c:BRANCH[1], t:"All hands", h:"14:00"}, {c:BRANCH[3], t:"Cena abuelos"}, {c:BRANCH[2], t:"Kinesiólogo"}, {c:BRANCH[0], t:"Lectura"}],
    27: [{c:BRANCH[3], t:"Aniversario"}],
    30: [{c:BRANCH[0], t:"Viaje a Tigre"}],
  },
};

// FINANZAS
const FINANZAS = {
  saldoARS: 1842500,
  saldoUSD: 1480,
  ingresosMes: 2350000,
  gastosMes: 1198400,
  tasaAhorro: 49,
  cuentas: [
    { group:"Billeteras", items:[
      { id:"a1", name:"Ualá",        initials:"UA", color:BRANCH[8], ars:284500, usd:0 },
      { id:"a2", name:"Mercado Pago",initials:"MP", color:BRANCH[5], ars:412000, usd:0 },
      { id:"a3", name:"Brubank",     initials:"BB", color:BRANCH[7], ars:78000,  usd:120 },
    ]},
    { group:"Bancos", items:[
      { id:"a4", name:"Galicia",     initials:"GA", color:BRANCH[3], ars:920000, usd:0 },
      { id:"a5", name:"Galicia USD", initials:"G$", color:BRANCH[2], ars:0,      usd:1360 },
    ]},
    { group:"Efectivo", items:[
      { id:"a6", name:"En mano",     initials:"$$", color:BRANCH[6], ars:148000, usd:0 },
    ]},
  ],
  categorias: [
    { name:"Comida",       color:BRANCH[6], amount:286400, pct:24 },
    { name:"Alquiler",     color:BRANCH[0], amount:380000, pct:32 },
    { name:"Transporte",   color:BRANCH[1], amount:84000,  pct:7  },
    { name:"Suscripciones",color:BRANCH[8], amount:62300,  pct:5  },
    { name:"Salud",        color:BRANCH[2], amount:96000,  pct:8  },
    { name:"Ocio",         color:BRANCH[7], amount:148500, pct:12 },
    { name:"Otros",        color:BRANCH[5], amount:141200, pct:12 },
  ],
  movimientos: [
    { id:"m1",  day:"Hoy",       date:"13 May", icon:"🍱", cat:"Comida",     desc:"Almuerzo La Birra",   method:"Ualá",        amount:-8400,  type:"expense" },
    { id:"m2",  day:"Hoy",       date:"13 May", icon:"🚇", cat:"Transporte", desc:"SUBE recarga",        method:"MP",          amount:-2000,  type:"expense" },
    { id:"m3",  day:"Hoy",       date:"13 May", icon:"💼", cat:"Trabajo",    desc:"Honorarios proyecto", method:"Galicia",     amount:480000, type:"income", audit:true },
    { id:"m4",  day:"Ayer",      date:"12 May", icon:"🛒", cat:"Comida",     desc:"Supermercado Coto",   method:"Galicia",     amount:-34200, type:"expense" },
    { id:"m5",  day:"Ayer",      date:"12 May", icon:"🎬", cat:"Ocio",       desc:"Cine + cena",         method:"Ualá",        amount:-18500, type:"expense" },
    { id:"m6",  day:"11 May",    date:"11 May", icon:"💊", cat:"Salud",      desc:"Farmacia",            method:"MP",          amount:-6300,  type:"expense" },
    { id:"m7",  day:"11 May",    date:"11 May", icon:"📡", cat:"Suscripciones", desc:"Spotify Familiar", method:"Galicia",     amount:-4500,  type:"expense" },
    { id:"m8",  day:"10 May",    date:"10 May", icon:"🏠", cat:"Alquiler",   desc:"Alquiler Mayo",       method:"Galicia",     amount:-380000,type:"expense" },
  ],
  suscripciones: [
    { name:"Spotify Familiar", next:"02 Jun", amount:4500 },
    { name:"iCloud 200GB",     next:"08 Jun", amount:1900 },
    { name:"Netflix",          next:"15 Jun", amount:7800 },
    { name:"ChatGPT Plus",     next:"22 Jun", amount:24000 },
    { name:"Vercel Pro",       next:"01 Jul", amount:24100 },
  ],
  // 12 months historical (en miles ARS) — for sparkline / bars
  history: [
    { m:"Jun", in:1980, out:1420 },
    { m:"Jul", in:2050, out:1480 },
    { m:"Ago", in:2100, out:1520 },
    { m:"Sep", in:2180, out:1380 },
    { m:"Oct", in:2240, out:1410 },
    { m:"Nov", in:2200, out:1560 },
    { m:"Dic", in:2380, out:1820 },
    { m:"Ene", in:2080, out:1350 },
    { m:"Feb", in:2150, out:1280 },
    { m:"Mar", in:2240, out:1410 },
    { m:"Abr", in:2310, out:1330 },
    { m:"May", in:2350, out:1198 },
  ],
};

const I18N = {
  // very small subset; just to demonstrate the pattern
  es: {
    "nav.boveda":   "Bóveda",
    "nav.habitos":  "Hábitos",
    "nav.agenda":   "Agenda",
    "nav.finanzas": "Finanzas",
    "nav.settings": "Ajustes",
    "topbar.search":"Buscar en SGR…",
    "common.today": "Hoy",
    "common.new":   "Nuevo",
  }
};

const fmtARS = n => "$" + Math.round(n).toLocaleString("es-AR");
const fmtUSD = n => "US$ " + Math.round(n).toLocaleString("es-AR");

window.BRANCH = BRANCH;
window.BOVEDA = BOVEDA;
window.HABITOS = HABITOS;
window.AGENDA  = AGENDA;
window.FINANZAS= FINANZAS;
window.I18N    = I18N;
window.fmtARS  = fmtARS;
window.fmtUSD  = fmtUSD;
