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

## Ledger — mejoras pendientes

- [ ] Edición de hora de transacción y paginación de la tabla global cuando el historial exceda 2000 operaciones. El merge por ticker, PPC y tabla global ya están implementados.

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

## Frontend — Rendimiento

- [ ] Eliminar el fallback local temporal de `addFinMovimiento` si se implementa una cola offline durable; actualmente avisa el error y conserva el shape API.

## Migración de datos (usuario)

- [ ] Reasignar movimientos con categoría legacy **`Ahorro`** → **`FIRE`** o categoría del objetivo correspondiente (pestaña Datos). La UI muestra aviso en AhorroTab si quedan pendientes.

---

## Backend

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
