export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export function resolveSchema(schema, doc) {
  if (!schema) return {};
  if (schema.$ref)
    return resolveSchema(
      doc?.components?.schemas?.[schema.$ref.split("/").pop()],
      doc,
    );
  if (schema.anyOf) {
    const child = schema.anyOf.find((s) => s.type !== "null");
    return { ...schema, ...resolveSchema(child, doc) };
  }
  if (schema.allOf)
    return schema.allOf.reduce(
      (a, s) => ({ ...a, ...resolveSchema(s, doc) }),
      schema,
    );
  return schema;
}
export function unpack(data) {
  if (Array.isArray(data)) return data;
  for (const key of [
    "items",
    "data",
    "results",
    "resultados",
    "movimientos",
    "registros",
    "hojas",
  ])
    if (Array.isArray(data?.[key])) return data[key];
  return [];
}
export class Client {
  constructor(base = "/api") {
    this.base = base.replace(/\/$/, "");
    this.doc = null;
  }
  async request(path, method = "GET", body, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(this.base + path, {
        method,
        signal: controller.signal,
        headers:
          body instanceof FormData
            ? {}
            : body === undefined
              ? {}
              : { "Content-Type": "application/json" },
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
      if (!r.ok) {
        let error;
        try {
          error = await r.json();
        } catch {
          error = { detail: r.statusText };
        }
        const detail = error.detail;
        const message = Array.isArray(detail)
          ? detail
              .map((d) => `${d.loc?.slice(1).join(".") || "Dato"}: ${d.msg}`)
              .join("\n")
          : typeof detail === "string"
            ? detail
            : `La API respondió ${r.status}.`;
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
          "El servidor devolvió HTML o texto en lugar de JSON. Revisá la dirección de la API.",
          r.status,
        );
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        e.name === "AbortError"
          ? "La API tardó demasiado en responder."
          : "No se pudo conectar con la API. Verificá que SGR esté ejecutándose en el puerto 8765.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async connect() {
    this.doc = await this.request("/openapi.json");
    if (!this.doc?.paths)
      throw new ApiError(
        "Esta dirección no expone el contrato OpenAPI de SGR.",
      );
    return this.doc;
  }
  path(path) {
    if (!this.doc) return path;
    return Object.hasOwn(this.doc.paths, path)
      ? path
      : Object.hasOwn(this.doc.paths, path + "/")
        ? path + "/"
        : path;
  }
  operation(path, method) {
    const exact = this.doc?.paths?.[this.path(path)];
    if (exact) return exact[method.toLowerCase()];
    for (const [template, ops] of Object.entries(this.doc?.paths || {})) {
      const regex = new RegExp(
        "^" +
          template
            .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
            .replace(/\{[^}]+\}/g, "[^/]+") +
          "/?$",
      );
      if (regex.test(path)) return ops[method.toLowerCase()];
    }
    return undefined;
  }
  bodySchema(path, method) {
    const op = this.operation(path, method);
    return resolveSchema(
      op?.requestBody?.content?.["application/json"]?.schema,
      this.doc,
    );
  }
  method(path, preferred = ["PATCH", "PUT", "POST"]) {
    return preferred.find((m) => this.operation(path, m)) || preferred[0];
  }
  async list(path, params = {}) {
    const op = this.operation(path, "GET");
    const allowed = new Set(
      (op?.parameters || []).filter((p) => p.in === "query").map((p) => p.name),
    );
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && (!this.doc || allowed.has(k)))
        query.set(k, String(v));
    const paginated = allowed.has("limit") && allowed.has("offset");
    const all = [];
    let offset = 0;
    do {
      if (paginated) {
        query.set("limit", "500");
        query.set("offset", String(offset));
      }
      const data = await this.request(
        this.path(path) + (query.size ? "?" + query : ""),
      );
      const rows = unpack(data);
      all.push(...rows);
      if (
        !paginated ||
        rows.length < 500 ||
        (data?.total != null && all.length >= data.total)
      )
        break;
      offset += rows.length;
      if (offset > 100000)
        throw new ApiError(
          "La consulta supera 100.000 filas. Acotá el período.",
        );
    } while (true);
    return all;
  }
  async save(path, method, body) {
    if (this.doc && !this.operation(path, method))
      throw new ApiError(`El servidor no ofrece ${method} ${path}.`);
    return this.request(this.path(path), method, body);
  }
}
