import React from "react";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
  within,
  act,
} from "@testing-library/react";
import { Provider, useApp } from "../src/store";
import { ResourceForm, GlobalModals } from "../src/ui";
import App from "../src/App";
import Boveda from "../src/Boveda";
import Finanzas from "../src/Finanzas";
import Agenda from "../src/Agenda";
import Habitos from "../src/Habitos";
import Settings from "../src/Settings";
import { sampleDB, emptyDB } from "../src/local";
import { today } from "../src/domain";
import { resources } from "../src/resources";
let context;
function Observer() {
  context = useApp();
  return null;
}
function wrap(element) {
  return render(
    <Provider>
      <Observer />
      {element}
      <GlobalModals />
    </Provider>,
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
test("Todos los módulos y sus pestañas renderizan con datos y vacíos", async () => {
  for (const data of [emptyDB(), sampleDB()]) {
    localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(data));
    const views = [
      <Boveda navigate={() => {}} />,
      ...["dashboard", "anual", "fire", "ahorro", "datos"].map((tab) => (
        <Finanzas tab={tab} setTab={() => {}} />
      )),
      ...["hoy", "mes", "tareas", "revision"].map((tab) => (
        <Agenda tab={tab} setTab={() => {}} />
      )),
      ...["hoy", "progreso", "historial"].map((tab) => (
        <Habitos tab={tab} setTab={() => {}} />
      )),
      <Settings />,
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
  wrap(<Boveda navigate={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Capturar una idea" }));
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Mi nota de prueba" },
  });
  fireEvent.change(screen.getByLabelText("Contenido o URL"), {
    target: { value: "Una idea importante." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true }));
  await waitFor(() => assert.equal(context.db.hojas.length, 1));
  assert.equal(
    JSON.parse(localStorage.getItem("sgr-orbita-v1-local")).hojas[0].titulo,
    "Mi nota de prueba",
  );
  const note = context.db.hojas[0];
  await act(async () =>
    context.setModal({ type: "form", resource: "hojas", item: note }),
  );
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Nota actualizada" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true }));
  await waitFor(() =>
    assert.equal(context.db.hojas[0].titulo, "Nota actualizada"),
  );
  await act(async () =>
    context.setModal({
      type: "delete",
      resource: "hojas",
      item: context.db.hojas[0],
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
  await waitFor(() => assert.equal(context.db.hojas.length, 0));
});
test("Completar tarea y hábito actualiza estado persistido", async () => {
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(sampleDB()));
  const result = wrap(<Agenda tab="tareas" setTab={() => {}} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Completar Darle forma a una nueva idea",
    }),
  );
  await waitFor(() =>
    assert.equal(context.db.tareas.find((t) => t.id === "t1").completada, true),
  );
  result.unmount();
  wrap(<Habitos tab="hoy" setTab={() => {}} />);
  fireEvent.click(
    screen.getAllByRole("button", {
      name: /Leer un capítulo,.*sin completar/,
    })[0],
  );
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: /Avancé un poco/ }),
  );
  fireEvent.change(within(dialog).getByLabelText(/Una nota para vos/), {
    target: { value: "Un avance pequeño" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Guardar progreso" }),
  );
  await waitFor(() =>
    assert.ok(
      context.db.registros.some(
        (r) =>
          r.habito_id === "h1" &&
          r.valor === 0.5 &&
          r.nota === "Un avance pequeño",
      ),
    ),
  );
});
test("Formulario rechaza eventos cuyo fin es anterior al inicio", async () => {
  const data = emptyDB();
  data.calendarios = [{ id: "a1", nombre: "Personal" }];
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(data));
  wrap(<ResourceForm resource="eventos" />);
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Evento inválido" },
  });
  fireEvent.change(screen.getByLabelText(/Calendario/), {
    target: { value: "a1" },
  });
  fireEvent.change(screen.getByLabelText(/^Inicio/), {
    target: { value: today() + "T12:00" },
  });
  fireEvent.change(screen.getByLabelText(/^Fin/), {
    target: { value: today() + "T11:00" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Guardar", exact: true })
      .closest("form"),
  );
  await waitFor(() =>
    assert.match(screen.getByRole("alert").textContent, /posterior al inicio/),
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
    wrap(<Observer />);
    assert.equal(context.db.hojas.length, 8);
    await act(async () => context.setMode("api"));
    await waitFor(() => assert.equal(context.status, "offline"));
    await act(async () => {
      await assert.rejects(
        () => context.mutate("hojas", "save", { titulo: "No guardar" }),
        /Conectá/,
      );
    });
    assert.equal(
      JSON.parse(localStorage.getItem("sgr-orbita-v1-local")).hojas.length,
      8,
    );
    await act(async () => context.setMode("local"));
    await waitFor(() => assert.equal(context.db.hojas.length, 8));
  } finally {
    globalThis.fetch = original;
  }
});
test("Navegación, captura rápida y búsqueda global funcionan por teclado", async () => {
  localStorage.setItem("sgr-orbita-v1-local", JSON.stringify(sampleDB()));
  render(
    <Provider>
      <App />
    </Provider>,
  );
  await screen.findByRole("heading", { name: /Las ideas/ });
  fireEvent.click(screen.getByRole("link", { name: /Finanzas/ }));
  await screen.findByRole("heading", { name: /Tu dinero/ });
  assert.equal(window.location.pathname, "/finanzas");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  await screen.findByRole("dialog");
  fireEvent.change(screen.getByRole("textbox", { name: /Buscá una idea/ }), {
    target: { value: "segunda mente" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Una segunda mente/ }));
  await screen.findByRole("heading", { name: "Una segunda mente" });
  assert.ok(window.location.pathname.startsWith("/hoja/"));
  fireEvent.keyDown(document.body, { key: "n" });
  await screen.findByRole("heading", { name: "Una idea. Un primer paso." });
  fireEvent.click(screen.getByRole("button", { name: /Crear un hábito/ }));
  await screen.findByRole("heading", { name: "Crear hábito" });
});
test("API: adapta formularios a nombres y enums del contrato, y envía el cuerpo correcto", async () => {
  localStorage.setItem("sgr-orbita-v1-mode", JSON.stringify("api"));
  const paths = Object.fromEntries(
    Object.values(resources).map((r) => [r.path, { get: {} }]),
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
              "categoria_nombre",
            ],
            properties: {
              descripcion: { type: "string" },
              tipo: { type: "string", enum: ["income", "expense"] },
              monto: { type: "number" },
              fecha: { type: "string", format: "date" },
              moneda: { type: "string", enum: ["ARS", "USD"], default: "ARS" },
              cuenta_nombre: { type: "string" },
              categoria_nombre: { type: "string" },
            },
          },
        },
      },
    },
  };
  paths["/fin/fire-filas/{mes}"] = {
    put: {
      parameters: [
        { name: "mes", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ahorrado"],
              properties: { ahorrado: { type: "number" } },
            },
          },
        },
      },
    },
  };
  const calls = [],
    movements = [];
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
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    wrap(<Observer />);
    await waitFor(() => assert.equal(context.db.cuentas.length, 1));
    await act(async () =>
      context.setModal({ type: "form", resource: "movimientos" }),
    );
    fireEvent.change(screen.getByLabelText(/Descripción/), {
      target: { value: "Almuerzo" },
    });
    fireEvent.change(screen.getByLabelText(/Importe/), {
      target: { value: "4200" },
    });
    fireEvent.change(screen.getByLabelText(/^Cuenta/), {
      target: { value: "Banco de prueba" },
    });
    fireEvent.change(screen.getByLabelText(/^Categoría/), {
      target: { value: "Alimentos" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar", exact: true }),
    );
    await waitFor(() => assert.equal(context.db.movimientos.length, 1));
    const call = calls.find((c) => c.method === "POST");
    const body = JSON.parse(call.body);
    assert.equal(body.cuenta_nombre, "Banco de prueba");
    assert.equal(body.categoria_nombre, "Alimentos");
    assert.equal(body.tipo, "expense");
    assert.equal(body.monto, 4200);
    assert.equal(body.cuenta_id, undefined);
    assert.ok(
      calls
        .filter(
          (c) =>
            String(c.url).includes("/fin/movimientos") && c.method === "GET",
        )
        .every((c) => !String(c.url).includes("fecha_desde")),
    );
    await act(async () =>
      context.setModal({ type: "form", resource: "fireFilas" }),
    );
    fireEvent.change(screen.getByLabelText(/^Mes/), {
      target: { value: "2026-09" },
    });
    fireEvent.change(screen.getByLabelText(/Saldo acumulado/), {
      target: { value: "900" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar", exact: true }),
    );
    await waitFor(() =>
      assert.ok(
        calls.some(
          (c) => c.url === "/api/fin/fire-filas/2026-09" && c.method === "PUT",
        ),
      ),
    );
    const put = calls.find((c) => c.url === "/api/fin/fire-filas/2026-09");
    assert.deepEqual(JSON.parse(put.body), { ahorrado: 900 });
    await waitFor(() => assert.equal(context.modal, null));
  } finally {
    globalThis.fetch = original;
  }
});
