import test from "node:test";
import assert from "node:assert/strict";
import { Client, ApiError, resolveSchema, unpack } from "../src/api.js";
const doc = {
  paths: {
    "/hojas": {
      get: {},
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Note" },
            },
          },
        },
      },
    },
    "/hojas/{id}": {
      get: {},
      patch: {
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Note" },
            },
          },
        },
      },
    },
    "/habitos/{id}/registro": { put: {} },
  },
  components: {
    schemas: {
      Note: {
        type: "object",
        properties: { titulo: { type: "string" } },
        required: ["titulo"],
      },
    },
  },
};
test("OpenAPI resuelve referencias y rutas parametrizadas", () => {
  const c = new Client("/api");
  c.doc = doc;
  assert.ok(c.operation("/hojas/abc", "PATCH"));
  assert.ok(c.operation("/habitos/123/registro", "PUT"));
  assert.equal(c.operation("/hojas/abc/unexpected", "PATCH"), undefined);
  assert.equal(
    c.bodySchema("/hojas/123", "PATCH").properties.titulo.type,
    "string",
  );
  assert.equal(
    resolveSchema({ anyOf: [{ type: "null" }, { type: "number" }] }, doc).type,
    "number",
  );
});
test("Lectura paginada obtiene todos los movimientos", async () => {
  const c = new Client();
  c.doc = {
    paths: {
      "/fin/movimientos": {
        get: {
          parameters: [
            { in: "query", name: "limit" },
            { in: "query", name: "offset" },
          ],
        },
      },
    },
  };
  const requests = [];
  c.request = async (path) => {
    requests.push(path);
    const offset = Number(
      new URL(path, "http://test").searchParams.get("offset"),
    );
    return {
      items: Array.from({ length: offset ? 23 : 500 }, (_, i) => ({
        id: offset + i,
      })),
      total: 523,
    };
  };
  assert.equal(
    (await c.list("/fin/movimientos", { unknown: "ignored" })).length,
    523,
  );
  assert.equal(requests.length, 2);
  assert.ok(!requests[0].includes("unknown"));
});
test("Errores HTTP y errores de validación no se informan como éxito", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        detail: [{ loc: ["body", "monto"], msg: "Debe ser positivo" }],
      }),
      { status: 422 },
    );
  try {
    await assert.rejects(
      () => new Client().request("/fin/movimientos", "POST", { monto: -1 }),
      (e) =>
        e instanceof ApiError &&
        e.status === 422 &&
        e.message === "monto: Debe ser positivo",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Mutaciones no ofrecidas por OpenAPI se rechazan antes de fetch", async () => {
  const c = new Client();
  c.doc = doc;
  await assert.rejects(() => c.save("/hojas/1", "DELETE"), /no ofrece DELETE/);
});
test("Respuestas 204 y cuerpos no JSON", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(await new Client().request("/hojas/1", "DELETE"), null);
    globalThis.fetch = async () => new Response("<html>Vite</html>");
    await assert.rejects(() => new Client().request("/hojas"), /HTML o texto/);
  } finally {
    globalThis.fetch = original;
  }
});
test("Extrae listas de los formatos de respuesta habituales", () => {
  assert.deepEqual(unpack({ items: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(unpack({ movimientos: [{ id: 2 }] }), [{ id: 2 }]);
});
