# Finanzas — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Finanzas.
Cuando algo se complete, **mover la descripción actualizada a `Finanzas.md`**.

---

## Bot Finanzas

Implementado en `mybot/finanzas_handlers.py`. Ver documentación completa en `Finanzas.md §6`.

### Pendiente bot

- [ ] `/alertas` — enviar alertas pendientes por Telegram (requiere tabla `fin_alertas`; ver sección Notificaciones)
- [ ] Soporte de fecha en captura: `$: gasto 4500 super Coto uala ayer` → registra en fecha de ayer
- [ ] Soporte de cuotas en captura: `$: gasto 4500 Spotify uala cuotas:3`
- [ ] Resumen semanal de finanzas programado (job_queue lunes 9:00)

---

## Frontend — UX/Interacción pendiente

- [ ] `MovimientosTableModal`: click en fila → abrir edición inline; eliminar desde modal
- [ ] `CategoryDonutCard`: click en segmento → filtrar dashboard por categoría (complex state entre componentes)
- [ ] `FinanzasLeftPanel`: CRUD cuentas nuevas desde UI (complejo: grupos, tipos, saldos)
- [ ] `FireTab`: hitos por edad recalculados desde último saldo real; indicador mes actual sticky
- [ ] `AhorroTab`: ledger compra/venta por ticker (feature contable compleja)
- [ ] Búsqueda TopBar: dropdown con resultados movimientos+notas+objetivos (cross-module state)

## Frontend — Responsive

- [ ] Tabs inferiores o chip bar fija en móvil para cambiar tab
- [ ] Panel derecho como bottom sheet en `lg`–`xl` intermedio

## Frontend — Rendimiento

- [ ] Virtualización `DatosTab`: `@tanstack/react-virtual` para >200 filas
- [ ] `useMemo` + selectores Zustand finos en componentes pesados (donuts, listas)

## Frontend — Ctrl+M contextual

- [ ] Atajos globales Finanzas: `N` nuevo movimiento, `1–5` cambiar tab, `← →` mes, `/` focus buscador
- [ ] Atajos Dashboard: `Vi`/`Ve` ver todos ingresos/gastos, `C` focus notas
- [ ] Atajos Datos: `Ctrl+S` forzar guardado fila, `Supr` borrar fila seleccionada
- [ ] Atajos Ahorro: `I` nuevo instrumento; FIRE: `E` modo edición

## Frontend — Accesibilidad

- [ ] Focus trap + return focus en `MovementModal` / `MovimientosTableModal`
- [ ] Tab order en tabla Datos (evitar tab por celda invisible)
- [ ] `scope="col"` en tablas FIRE/Ahorro *(Datos ya tiene scope="col")*

---

## Backend

- [ ] Normalizar respuestas movimientos: mismo shape siempre; eliminar dual schema en clientes
- [ ] Paginación `?limit=&offset=` en Datos con miles de filas
- [ ] Bulk PATCH/DELETE movimientos (cambio de categoría masivo)
- [ ] Transacciones: crear movimiento + actualizar saldo cuenta en una sola transacción
- [ ] `PATCH /fin/categorias/{id}` (renombrar, fusionar categorías)
- [ ] `GET /fin/movimientos/duplicados?ventana_horas=24`
- [ ] `POST /fin/import/csv`, `GET /fin/export/csv`
- [ ] Deprecar `GET /fin/emergencia` → migrar a objetivo `Fondo de Emergencia`

---

## Notificaciones

- [ ] Tabla `fin_alertas (id, tipo, payload_json, leida, created_at)`
- [ ] Job al abrir app o cron: `POST /fin/alertas/evaluar` regenera alertas
- [ ] Tipos: meta ahorro mes, objetivo cerca 100%, objetivo vencido, cuota próxima, inflación sin cargar, FIRE desvío, dólar desactualizado, saldo bajo cuenta, sin asignar
- [ ] UI: dropdown campana; click navega a tab/contexto
- [ ] Bot: `/alertas` envía resumen por Telegram

---

## Producto — largo plazo

- [ ] Wizard transferencias: gasto en cuenta A + ingreso en B, categoría `transferencia`
- [ ] Reconciliación bancaria: import CSV del banco → matching por fecha+monto
- [ ] Export: PDF mes, CSV año fiscal, gráfico PNG
- [ ] Comparar meses: overlay mes anterior en donuts (ghost bars)
- [ ] Plantillas recurrentes: "Alquiler", "SUBE", "Spotify" con prefill categoría/cuenta/monto *(chips básicos ya en MovementModal)*
- [ ] Integración Agenda: `agenda_evento_id` opcional en movimiento
- [ ] `CaptureModal` tab Finanzas: habilitar formulario compacto o `openMovement()` embebido
- [ ] Tests: `isTransferencia`, cálculo ahorro, proyección FIRE

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Finanzas.md`.*
