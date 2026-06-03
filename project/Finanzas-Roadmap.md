# Finanzas — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Finanzas.
Cuando algo se complete, **mover la descripción actualizada a `Finanzas.md`** (y resumir en `README.md` si afecta arquitectura global).

---

## Completado (junio 2026 — modelo ahorro por categoría)

*Documentado en `Finanzas.md` §4 y §7. No reabrir salvo bugs.*

- [x] Categoría **`FIRE`** alimenta plan FIRE (front + bot + overrides `fin_fire_filas`)
- [x] Objetivo ↔ categoría homónima (`objetivo_id`, sync en alta/baja)
- [x] Reparto en **AhorroTab** (FIRE + objetivos + líquido sin invertir)
- [x] Objetivo seed **Fondo de emergencia**; Emergencia legacy oculta
- [x] `GET /fin/emergencia` deprecated con saldo por categoría del objetivo
- [x] CRUD categorías en Datos + colores en donuts/tablas
- [x] Saldos de cuenta derivados de movimientos + categoría **Ajuste**
- [x] Bot `/ahorro` y `/objetivo` por categoría (no Ahorro + descripción)

---

## Bot Finanzas

Implementado en `mybot/finanzas_handlers.py`. Ver `Finanzas.md` §6.

### Pendiente bot

- [ ] `/alertas` — enviar alertas pendientes por Telegram (requiere tabla `fin_alertas`; ver Notificaciones)

---

## Frontend — UX/Interacción pendiente

- [ ] Atajos Dashboard: `Vi`/`Ve` ver todos ingresos/gastos con teclado (requiere levantar estado modal a store)
- [ ] Atajos Datos: `Ctrl+S` guardar fila, `Supr` borrar fila seleccionada (requiere fila seleccionada en store)
- [ ] Atajos Ahorro: `I` nuevo instrumento; FIRE: `E` modo edición (requiere refs o store)
- [ ] Dashboard fondo emergencia: calcular saldo en cliente desde `finMovimientosAll` + objetivo (eliminar dependencia de `GET /fin/emergencia`)

## Frontend — Rendimiento

- [ ] Normalizar dual schema movimientos: eliminar fallbacks `type/amount/cat` en todos los consumidores; alinear optimistic add a shape API

## Migración de datos (usuario)

- [ ] Reasignar movimientos con categoría legacy **`Ahorro`** → **`FIRE`** o categoría del objetivo correspondiente (pestaña Datos). La UI muestra aviso en AhorroTab si quedan pendientes.

---

## Backend

- [ ] Normalizar respuestas movimientos: mismo shape siempre; eliminar dual schema en clientes
- [ ] `PATCH /fin/categorias/{id}` — **fusionar** dos categorías en una (renombrar ya está; merge pendiente)
- [ ] Endpoint o job one-shot: migrar movimientos `Ahorro` → `FIRE` (opcional; hoy es manual)

---

## Notificaciones

- [ ] Tabla `fin_alertas (id, tipo, payload_json, leida, created_at)`
- [ ] Job al abrir app o cron: `POST /fin/alertas/evaluar` regenera alertas
- [ ] Tipos: meta ahorro mes, objetivo cerca 100%, objetivo vencido, cuota próxima, inflación sin cargar, FIRE desvío, dólar desactualizado, saldo bajo cuenta
- [ ] UI: dropdown campana; click navega a tab/contexto
- [ ] Bot: `/alertas` envía resumen por Telegram

---

## Producto — largo plazo

- [ ] Wizard transferencias: gasto en cuenta A + ingreso en B, categoría `transferencia`
- [ ] Reconciliación bancaria: import CSV del banco → matching por fecha+monto
- [ ] Export: PDF mes, gráfico PNG
- [ ] Comparar meses: overlay mes anterior en donuts (ghost bars)
- [ ] Integración Agenda: `agenda_evento_id` opcional en movimiento
- [ ] `CaptureModal` tab Finanzas: habilitar formulario compacto o `openMovement()` embebido
- [ ] Tests: `isTransferencia`, `contribucionFire`, `acumuladoPorCategoriaNombre`, proyección FIRE

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Finanzas.md`.*
