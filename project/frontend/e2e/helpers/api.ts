/**
 * Helpers para interactuar con la API de SGR en tests E2E.
 * Todos los helpers son read-only para auditar estado post-acción del navegador.
 */

export async function getTareas(apiUrl: string, lista_id?: number) {
  const url = new URL(`${apiUrl}/agenda/tareas`);
  if (lista_id) url.searchParams.append('lista_id', lista_id.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET /agenda/tareas: ${res.status}`);
  return res.json();
}

export async function getHojas(apiUrl: string) {
  const res = await fetch(`${apiUrl}/hojas/`);
  if (!res.ok) throw new Error(`GET /hojas/: ${res.status}`);
  return res.json();
}

export async function getHoja(apiUrl: string, id: number) {
  const res = await fetch(`${apiUrl}/hojas/${id}`);
  if (!res.ok) throw new Error(`GET /hojas/${id}: ${res.status}`);
  return res.json();
}

export async function getCategorias(apiUrl: string) {
  const res = await fetch(`${apiUrl}/categorias/`);
  if (!res.ok) throw new Error(`GET /categorias/: ${res.status}`);
  return res.json();
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 500
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}
