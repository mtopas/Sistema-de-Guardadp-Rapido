import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  calendarDays,
  monthDays,
  totals,
  scheduled,
  habitStats,
  allocation,
  fireProjection,
  escapeCSV,
  safeURL,
  recordFor,
} from "../src/domain.js";
import { emptyDB, localMutation } from "../src/local.js";
test("Fechas locales, años bisiestos y calendario de 42 días", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(monthDays("2024-02"), 29);
  const days = calendarDays("2026-09");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-08-31");
  assert.equal(days.at(-1), "2026-10-11");
});
test("Finanzas separa monedas y excluye transferencias", () => {
  const cats = [
    { id: 1, nombre: "Transferencia" },
    { id: 2, nombre: "Trabajo" },
  ];
  const moves = [
    { tipo: "ingreso", monto: 1000, categoria_id: 2 },
    { tipo: "gasto", monto: 250 },
    { tipo: "gasto", monto: 300, categoria_id: 1 },
    { tipo: "ingreso", monto: 100, moneda: "USD" },
  ];
  assert.deepEqual(totals(moves, cats), {
    in: 1000,
    out: 250,
    net: 750,
    rate: 75,
  });
  assert.equal(totals(moves, cats, "USD").net, 100);
});
test("Ahorro convierte ARS a USD y los ingresos retiran del objetivo", () => {
  const cats = [{ id: 1, nombre: "FIRE" }];
  const moves = [
    { tipo: "gasto", monto: 120000, moneda: "ARS", categoria_id: 1 },
    { tipo: "gasto", monto: 30, moneda: "USD", categoria_id: 1 },
    { tipo: "ingreso", monto: 10000, categoria_id: 1 },
  ];
  assert.equal(allocation(moves, cats, "FIRE", 1000), 140);
});
test("Hábitos: parcial mantiene racha y los días libres no la rompen", () => {
  const h = {
    id: 1,
    activo: true,
    frecuencia_tipo: "semanal",
    dias_semana: "[1,3,5]",
  };
  const records = [
    { habito_id: 1, fecha: "2026-09-25", valor: 1 },
    { habito_id: 1, fecha: "2026-09-28", valor: 0.5 },
    { habito_id: 1, fecha: "2026-09-30", valor: 1 },
  ];
  assert.equal(scheduled(h, "2026-09-29"), false);
  assert.equal(scheduled(h, "2026-09-30"), true);
  assert.equal(habitStats(h, records, "2026-09", "2026-09-30").streak, 3);
  assert.equal(habitStats(h, records, "2026-09", "2026-09-30").completed, 2.5);
});
test("FIRE: capital compuesto y override mensual", () => {
  const rows = fireProjection({
    initial: 100,
    contribution: 10,
    annualReturn: 0,
    months: 3,
  });
  assert.deepEqual(
    rows.map((r) => r.balance),
    [110, 120, 130],
  );
  const other = fireProjection(
    { initial: 100, contribution: 10, annualReturn: 0, months: 3 },
    [{ mes: rows[1].mes, ahorrado: 500 }],
  );
  assert.equal(other[2].balance, 510);
});
test("Exportación neutraliza fórmulas y enlaces peligrosos", () => {
  assert.equal(escapeCSV("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(escapeCSV('a"b'), '"a""b"');
  assert.equal(safeURL("javascript:alert(1)"), null);
  assert.equal(safeURL("https://example.com"), "https://example.com/");
});
test("CRUD local mantiene identidades, saldo y rollback sin tocar el original", () => {
  let db = emptyDB();
  db = localMutation(db, "cuentas", "save", { nombre: "Banco" }).db;
  const account = db.cuentas[0];
  db = localMutation(db, "movimientos", "save", {
    descripcion: "Ingreso",
    tipo: "ingreso",
    monto: 500,
    moneda: "ARS",
    cuenta_id: account.id,
  }).db;
  assert.equal(db.cuentas[0].saldo_ars, 500);
  const id = db.movimientos[0].id;
  const updated = localMutation(db, "movimientos", "save", {
    id,
    monto: 400,
  }).db;
  assert.equal(updated.movimientos.length, 1);
  assert.equal(updated.movimientos[0].descripcion, "Ingreso");
  assert.equal(updated.cuentas[0].saldo_ars, 400);
  assert.equal(db.cuentas[0].saldo_ars, 500);
  assert.throws(
    () => localMutation(updated, "cuentas", "delete", account),
    /tiene movimientos/,
  );
  assert.equal(
    localMutation(updated, "movimientos", "delete", { id }).db.cuentas[0]
      .saldo_ars,
    0,
  );
});
test("Upsert de hábitos no duplica registros y eliminar hábito los elimina", () => {
  let db = emptyDB();
  db = localMutation(db, "habitos", "save", {
    nombre: "Leer",
    activo: true,
  }).db;
  const h = db.habitos[0];
  db = localMutation(db, "registros", "record", {
    habito_id: h.id,
    fecha: "2026-09-30",
    valor: 0.5,
  }).db;
  db = localMutation(db, "registros", "record", {
    habito_id: h.id,
    fecha: "2026-09-30",
    valor: 1,
  }).db;
  assert.equal(db.registros.length, 1);
  assert.equal(recordFor(db.registros, h.id, "2026-09-30").valor, 1);
  assert.equal(
    localMutation(db, "habitos", "delete", h).db.registros.length,
    0,
  );
});
test("Colecciones bloquea ciclos y eliminaciones con notas", () => {
  let db = emptyDB();
  db = localMutation(db, "categorias", "save", { nombre: "Raíz" }).db;
  const root = db.categorias[0];
  db = localMutation(db, "categorias", "save", {
    nombre: "Hija",
    padre_id: root.id,
  }).db;
  const child = db.categorias[1];
  assert.throws(
    () =>
      localMutation(db, "categorias", "save", {
        id: root.id,
        padre_id: child.id,
      }),
    /misma/,
  );
  assert.throws(
    () => localMutation(db, "categorias", "delete", root),
    /subcolecciones/,
  );
});
test("Portafolio recalcula PPC y rechaza ventas que exceden la posición", () => {
  let db = emptyDB();
  db = localMutation(db, "instrumentos", "save", {
    nombre: "Acción",
    ticker: "XYZ",
  }).db;
  const id = db.instrumentos[0].id;
  for (const [cantidad, precio] of [
    [10, 20],
    [10, 40],
  ])
    db = localMutation(db, "transacciones", "save", {
      instrumento_id: id,
      tipo: "compra",
      fecha: "2026-01-01",
      cantidad,
      precio,
      moneda: "USD",
    }).db;
  db = localMutation(db, "transacciones", "save", {
    instrumento_id: id,
    tipo: "venta",
    fecha: "2026-02-01",
    cantidad: 5,
    precio: 50,
    moneda: "USD",
  }).db;
  assert.equal(db.instrumentos[0].cantidad, 15);
  assert.equal(db.instrumentos[0].costo_usd, 450);
  assert.throws(
    () =>
      localMutation(db, "transacciones", "save", {
        instrumento_id: id,
        tipo: "venta",
        fecha: "2026-03-01",
        cantidad: 16,
        precio: 40,
        moneda: "USD",
      }),
    /supera/,
  );
});
test("Recurrencia local conserva duración y materializa hasta el límite", () => {
  const db = localMutation(emptyDB(), "eventos", "save", {
    titulo: "Rutina",
    fecha_inicio: "2026-09-28T10:00",
    fecha_fin: "2026-09-28T11:30",
    se_repite: true,
    regla_repeticion: '{"tipo":"diario","hasta":"2026-09-30"}',
  }).db;
  assert.equal(db.eventos.length, 3);
  assert.equal(db.eventos[2].fecha_inicio, "2026-09-30T10:00");
  assert.equal(db.eventos[2].fecha_fin, "2026-09-30T11:30");
});
