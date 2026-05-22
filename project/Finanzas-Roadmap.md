# Finanzas — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Finanzas.
Cuando algo se complete, **mover la descripción actualizada a `Finanzas.md`**.

---

## Bot Finanzas

Implementado en `mybot/finanzas_handlers.py`. Ver documentación completa en `Finanzas.md §6`.

### Implementado

- [x] `/mov` — flujo guiado con inline keyboards: tipo (Gasto/Ingreso) → monto → descripción → cuenta → categoría → confirmación con preview → `POST /fin/movimientos`
- [x] Captura natural con prefijo `$:` — `$: gasto 4500 Super Coto uala` → parsea tipo/monto/desc/cuenta (fuzzy); pide categoría con teclado; confirmación antes de guardar
- [x] `/saldo` — saldos de `fin_cuentas` en ARS y USD + equivalente total usando `dolar_oficial`
- [x] `/mes [YYYY-MM]` — ingresos, gastos, balance y tasa ahorro del mes (sin transferencias)
- [x] `/ahorro` — total categoría Ahorro del mes + lista de objetivos con meta y cuota
- [x] `/ultimo` — últimos 5 movimientos; botón `🗑 #N` para eliminar directamente desde Telegram
- [x] `/dolar [valor]` — ver o actualizar `dolar_oficial` en `fin_config` sin abrir la app
- [x] `/objetivo [nombre]` — listar objetivos o ver progreso de uno específico (barra, % ahorrado, meses restantes)
- [x] Fuzzy match para cuenta y categoría en captura natural
- [x] Confirmación antes de `POST` con preview completo del movimiento
- [x] `BOT_ALLOWED_CHAT_IDS` en `.env` — lista de chat_id permitidos para comandos de Finanzas

### Pendiente bot

- [ ] `/alertas` — enviar alertas pendientes por Telegram (requiere tabla `fin_alertas`; ver sección Notificaciones)
- [ ] Soporte de fecha en captura: `$: gasto 4500 super Coto uala ayer` → registra en fecha de ayer
- [ ] Soporte de cuotas en captura: `$: gasto 4500 Spotify uala cuotas:3`
- [ ] Resumen semanal de finanzas programado (job_queue lunes 9:00)

---

## Frontend — Bugs y quick wins

- [ ] `Ctrl+Enter` en `MovementModal` (paridad con `CaptureModal`)
- [ ] Subir `finActiveTab` a Zustand (hoy `useState` local → atajos y Ctrl+M no lo ven)
- [ ] Subir `finSearchQuery` a Zustand y conectar al filtro
- [ ] Reemplazar colores hex hardcoded `#f59e0b`, `#22c55e` en `AhorroTab` por tokens CSS
- [ ] Eliminar 4 componentes huérfanos: `IncomeExpenseCard`, `SubscriptionsCard`, `KPIsCard`, `FireProjectionCard`
- [ ] Quitar rama `Placeholder` en `FinanzasScreen` (código muerto)
- [ ] `prefers-reduced-motion` para `anim-card-in`
- [ ] Prefetch `fetchFinMovimientosAll` al entrar en `/finanzas` (hoy lazy)

## Frontend — UX/Interacción

- [ ] Validación visual en `MovementModal`: warning "Ahorro sin objetivo asignado" si descripción no coincide con ningún objetivo
- [ ] Plantillas rápidas en `MovementModal`: chips "Alquiler", "SUBE", "Spotify" → prefill
- [ ] Autocompletar última categoría/cuenta usada (`localStorage`)
- [ ] `MovimientosTableModal`: click en fila → abrir edición; eliminar desde modal; export CSV del filtrado
- [ ] `CategoryDonutCard`: hover tooltip monto/%; click segmento → filtrar dashboard; animación `stroke-dashoffset`
- [ ] `FinanzasLeftPanel`: CRUD cuentas nuevas desde UI; click `AccountRow` → movimientos de esa cuenta; barra con línea meta FIRE
- [ ] `FireTab`: hitos por edad recalculados desde último saldo real; indicador mes actual sticky; sparkline saldo en header
- [ ] `AhorroTab`: menú contextual por instrumento; ledger compra/venta por ticker
- [ ] `MovimientosTableModal`: solo lectura → habilitar edición/eliminación inline
- [ ] Búsqueda TopBar: dropdown resultados (movimientos + notas + objetivos); filtro en Dashboard y Datos

## Frontend — Responsive y mobile

- [ ] Sheet/drawer "Resumen" con contenido de `FinanzasLeftPanel` en `< md` (sin panel izq hoy)
- [ ] Tabs inferiores o chip bar fija en móvil para cambiar tab
- [ ] Entrada en bottom nav móvil: icono TrendingUp → `/finanzas`
- [ ] Panel derecho como bottom sheet en `lg`–`xl` intermedio

## Frontend — Rendimiento

- [ ] Virtualización `DatosTab`: `@tanstack/react-virtual` para >200 filas
- [ ] Extraer celdas `FechaCell`, `TextCell` a archivos estables con `memo`
- [ ] Debounce PATCH 300ms en edición rápida de Datos
- [ ] Lazy load tabs: `React.lazy(() => import('./AnualTab'))` con `Suspense` skeleton
- [ ] `normalizeMovimiento()` centralizado en store
- [ ] `useMemo` + selectores Zustand finos en componentes pesados (donuts, listas)

## Frontend — Componentes nuevos

- [ ] `ContextMenu.jsx` unificado (ver §12 de Finanzas.md original)
- [ ] `FinanzasMobileDrawer.jsx` — panel izq en móvil
- [ ] `FinShortcutsPanel.jsx` — pestaña Atajos en Ctrl+M
- [ ] `FinVirtualTable.jsx` — Datos con miles de filas
- [ ] `FinToastInline.jsx` — warning "Ahorro sin objetivo"
- [ ] `finTablePrimitives.jsx` — TH/TD/INPUT compartidos entre DatosTab/FireTab/AhorroTab
- [ ] `finanzasCalc.js` — extraer funciones puras (`buildCategories`, `computeDeflators`, etc.) para tests

## Frontend — Ctrl+M contextual

- [ ] Atajos globales Finanzas: `N` nuevo movimiento, `1–5` cambiar tab, `← →` mes, `/` focus buscador
- [ ] Atajos Dashboard: `Vi`/`Ve` ver todos ingresos/gastos, `C` focus notas
- [ ] Atajos Datos: `Ctrl+S` forzar guardado fila, `Supr` borrar fila seleccionada
- [ ] Atajos MovementModal: `Ctrl+Enter` guardar, `Tab` ciclar gasto↔ingreso
- [ ] Atajos Ahorro: `I` nuevo instrumento; FIRE: `E` modo edición; `D` config dólar

## Frontend — Accesibilidad

- [ ] Focus trap + return focus en `MovementModal` / `MovimientosTableModal`
- [ ] `scope="col"`, caption oculto para tablas Datos/FIRE con screen readers
- [ ] `aria-live` region para anunciar cambios tras guardar
- [ ] Tab order en tabla Datos (evitar tab por celda invisible)
- [ ] `prefers-reduced-motion` para `anim-card-in`

## Frontend — i18n

- [ ] "Saldos por cuenta", "blue" en panel izq → claves `i18n.js`
- [ ] Meses: centralizar en `utils/months.js` (duplicados en DashboardTabs, AnualTab, FireTab)
- [ ] Formato fecha: unificar con `Intl.DateTimeFormat` (`toLocaleDateString` vs `DD-MM-AAAA`)

---

## Backend

- [ ] Normalizar respuestas movimientos: mismo shape siempre; eliminar dual schema en clientes
- [ ] `GET /fin/movimientos/resumen?mes=` — agregados server-side (ingresos, gastos, por categoría)
- [ ] Paginación `?limit=&offset=` en Datos con miles de filas
- [ ] Bulk PATCH/DELETE movimientos (cambio de categoría masivo)
- [ ] Índices SQL: `(fecha)`, `(categoria_id)`, `(tipo, fecha)` en `fin_movimientos`
- [ ] Transacciones: crear movimiento + actualizar saldo cuenta en una sola transacción
- [ ] `PATCH /fin/categorias/{id}` (renombrar, fusionar categorías)
- [ ] `GET /fin/movimientos/duplicados?ventana_horas=24`
- [ ] `POST /fin/import/csv`, `GET /fin/export/csv` para backup y Excel
- [ ] Deprecar `GET /fin/emergencia` → migrar a objetivo `Fondo de Emergencia`
- [ ] `dolar_oficial_updated_at` en `fin_config` (para alerta "desactualizado")
- [ ] `mes_cierre` en config (día que cierra el mes contable)

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
- [ ] Export: PDF mes (snapshot dashboard), CSV año fiscal, gráfico PNG
- [ ] Comparar meses: overlay mes anterior en donuts (ghost bars)
- [ ] Plantillas recurrentes: "Alquiler", "SUBE", "Spotify" con prefill categoría/cuenta/monto
- [ ] Integración Agenda: `agenda_evento_id` opcional en movimiento (columna futura)
- [ ] `CaptureModal` tab Finanzas: habilitar formulario compacto o `openMovement()` embebido
- [ ] Tests: `isTransferencia`, cálculo ahorro, proyección FIRE (funciones puras extraídas)

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Finanzas.md`.*
