# Finanzas — documentación técnica

Estado real del módulo Finanzas en SGR. Todo lo que está implementado y cómo funciona.
Para roadmap, mejoras y features pendientes: **`Finanzas-Roadmap.md`**.

---

## 1. Rol en el producto

Finanzas es el módulo de **contabilidad personal offline-first**: capturar movimientos, ver el mes en el Dashboard, analizar el año, planificar FIRE, gestionar ahorro/inversión y editar el histórico completo.

| Aspecto | Detalle |
|---------|---------|
| Ruta | `/finanzas` → `FinanzasScreen.jsx` |
| Accent (tema Arcoíris) | Ámbar `#d97706` (`Layout.jsx` → `ARCOIRIS_ACCENTS`) |
| CTA header | **+ Movimiento** → `MovementModal` (`openMovement` en store) |
| Estado global | Mismo `useStore.js` que Bóveda/Agenda/Hábitos |

---

## 2. Arquitectura

```
TopBar (+ Movimiento) ──┐
                        ├── FinanzasScreen
DashboardTabs ──────────┤     ├── FinanzasLeftPanel (siempre, md+)
                        │     ├── Centro (tab activa)
                        │     └── Panel derecho (xl, según tab)
MovementModal (global en App.jsx)
        │
        ▼
useStore.js ──fetch──► FastAPI /fin/* ──► crud.py ──► SQLite
        │
        └── fallback optimista local si falla red
```

| Capa | Archivos clave |
|------|----------------|
| Pantalla | `screens/FinanzasScreen.jsx` |
| Tabs | `components/finanzas/DashboardTabs.jsx` |
| Componentes | `components/finanzas/*` (22 archivos) |
| Helpers | `data/finanzas.js`, `data/finCategorias.js`, `data/finCategoriaColors.js` — **sin mock de movimientos** |
| Store | `store/useStore.js` (prefijo `fin*`, `selectedMes`, modales) |
| API | `app/main.py` rutas `/fin/*` |
| SQL | `app/db/crud.py`, esquema en `app/db/database.py` |
| Bot | `mybot/finanzas_handlers.py` + `mybot/bot.py` |

**Carga inicial (`App.jsx`):** al montar se llama `fetchFinMovimientos` (mes actual), cuentas, categorías, config, notas, emergencia. `fetchFinMovimientosAll` se llama al entrar a Datos/Anual/FIRE/Ahorro.

**Sin mock de datos:** `data/finanzas.js` solo exporta helpers (`fmtARS`, `fmtUSD`, `isTransferencia`). El mock `FINANZAS` con cuentas y movimientos hardcodeados fue eliminado; sin backend la app muestra estado vacío.

---

## 3. Layout y tabs

### Tres columnas

| Zona | Componente | Visible |
|------|------------|---------|
| Izquierda | `FinanzasLeftPanel` | `md+`, todas las tabs |
| Centro | Contenido según tab | Siempre |
| Derecha | `*RightPanel` según tab | `xl+`, solo algunas tabs |

### Tabs y selector de período

| Tab | Centro | Panel derecho | Selector mes/año |
|-----|--------|---------------|------------------|
| **dashboard** | Donuts ingreso/gasto, listas movimientos, cuotas, notas | Cuotas, gasto por categoría, KPIs, metas (tasa ahorro / fondo emergencia) | Sí (`selectedMes`) |
| **anual** | Resumen año, barras nominal/real, tabla meses | Highlights, comparación, inflación editable | Solo año |
| **fire** | Tabla plan mensual + proyección | % aumento aporte, rentabilidad | Oculto |
| **ahorro** | Reparto FIRE/objetivos/líquido, portafolio, ledger | Objetivos + meta FIRE del mes (cat. `FIRE`) | Oculto |
| **datos** | Tabla histórica inline editable | KPIs histórico + CRUD categorías (`DatosRightPanel`) | Oculto |

`selectedMes` formato `YYYY-MM`. Al cambiar mes: `setSelectedMes` → `fetchFinMovimientos(mes)`.

---

## 4. Reglas de negocio

### Transferencias

```js
isTransferencia(m) → categoría exacta "transferencia" (case-insensitive)
```

Excluidas de ingresos/gastos, donuts, KPIs, Anual, Datos, totales de ahorro.

### Asignación a cajones (modelo actual)

Un movimiento suma (o resta si es ingreso) al cajón si su **categoría** o su **descripción** coincide exactamente con el nombre del cajón (sin importar mayúsculas; comparación tras `trim`).

| Cajón | Nombre que debe coincidir |
|-------|---------------------------|
| Plan FIRE | `FIRE` |
| Cada objetivo | Mismo nombre que el objetivo (categoría creada al alta, `objetivo_id` en DB) |
| Sistema | `Transferencia`, `Ajuste` — no eliminables |

| Tipo movimiento | Efecto en el cajón |
|-----------------|-------------------|
| **Gasto** | Suma |
| **Ingreso** | Resta (puede quedar negativo) |

**Objetivos:** no se renombran; al eliminar el objetivo la categoría queda `oculta=1`. Legacy: categoría `Ahorro` — migrar a mano a `FIRE` u objetivo.

### Dólar (MEP + oficial)

- **`dolar_mep`** (principal) y **`dolar_oficial_compra`** en `fin_config`; botón **↻ Actualizar** en `FinanzasLeftPanel` → `GET /fin/dolar/cotizacion` (dolarapi.com), cache en config.
- UI: `dolar_mep ?? dolar_oficial ?? dolar_default` (fallback manual legacy).
- Conversión ARS ↔ USD en Ahorro/Anual/portafolio/FIRE display.
- Fórmulas portafolio: Total ARS = inst.ARS + inst.USD × dólar; Total USD = inst.USD + inst.ARS / dólar.

### Dual schema movimientos

Algunos consumidores aceptan `type`/`amount`/`cat`/`desc`/`method` (shape legacy). La API devuelve `tipo`/`monto`/`categoria_nombre`/`descripcion`/`cuenta_nombre`. `normalizeMovimiento()` en `finanzas.js` unifica al leer.

### Cuotas

Movimientos con `cuotas > 1` alimentan `CuotasCard` y panel derecho.

### Emergencia

- Objetivo seed **Fondo de emergencia** + categoría vinculada.
- `GET /fin/emergencia` (deprecated): saldo = movimientos de esa categoría.
- Meta en `fin_config.fondo_emergencia_meta`.

### Tab Ahorro — reparto

1. **Cajones** (movimientos): FIRE + cada objetivo.
2. **Instrumentos** (`fin_instrumentos`): portafolio; costo usado para líquido.
3. **Líquido sin invertir** = suma cajones − costo instrumentos (puede ser negativo).

### Categorías y objetivos (sync)

| Acción | Efecto en `fin_categorias` |
|--------|---------------------------|
| Crear objetivo | INSERT categoría mismo nombre, `objetivo_id`, `tipo: both` |
| Actualizar objetivo | Solo `meta`, `moneda`, `fecha_limite`, `cuota_mensual` — **no** `nombre` |
| Eliminar objetivo | `oculta=1` en categoría vinculada; DELETE objetivo. Si borrás **Fondo de emergencia**, no se vuelve a crear al reiniciar la API (`fin_emergencia_objetivo_deshabilitado` en config). |
| PATCH categoría | Sistema y vinculadas a objetivo: no renombrar; color/tipo sí |

`GET /fin/categorias?include_ocultas=true` para ver categorías ocultas (Datos/admin). Selectores de movimiento usan lista sin ocultas.

Colores de categoría en UI: `buildFinCategoriaColorByName` / `getFinCategoriaColor` (`finCategoriaColors.js`).

### FIRE

- **Ahorrado real del plan:** movimientos con categoría o descripción **`FIRE`** (`contribucionFire` / `movimientoAsignadoACajon` en front).
- Filas mensuales con proyección (aporte compuesto, interés, saldo).
- Overrides por mes en `fin_fire_filas` (`ahorrado_override`).
- Config: `fire_meta_usd`, `fire_meta_edad`, `fire_aumento_aporte`, `fire_rentabilidad_anual`, `fire_fecha_nacimiento`, `fire_aporte_inicial`, `fire_saldo_inicial`, `fire_inicio_mes`.
- Tabla compacta por defecto (36 meses futuros); botón **"Ver proyección completa"** expande hasta `fire_meta_edad` o 50 años.
- Fila marcada con 🎯 cuando `row.edad === fire_meta_edad`.
- `saveFinConfigBulk`: guarda toda la config FIRE en un solo PUT (evita race condition de PATCHes paralelos).

---

## 5. Componentes por tab

| Tab | Archivos principales |
|-----|---------------------|
| Dashboard | `CategoryDonutCard`, `MovimientosCard`, `CuotasCard`, `NotasCard`, `FinanzasRightPanel` |
| Anual | `AnualTab`, `AnualRightPanel` |
| FIRE | `FireTab`, `FireRightPanel` |
| Ahorro | `AhorroTab`, `AhorroRightPanel` |
| Datos | `DatosTab`, `DatosRightPanel` (KPIs + lista categorías: crear/editar/eliminar; clic derecho) |
| Global | `MovementModal`, `MovimientosTableModal` (sort 3-clicks + filtro categoría) |
| Panel izq. | `FinanzasLeftPanel` — saldos, ingresos/gastos mes, tasa ahorro, grupos cuenta, config dólar + **CRUD cuentas** |

**Componentes huérfanos (no importados):** `IncomeExpenseCard.jsx`, `SubscriptionsCard.jsx`, `KPIsCard.jsx`, `FireProjectionCard.jsx`.

---

## 6. Modelo de datos (SQLite)

| Tabla | Uso |
|-------|-----|
| `fin_cuentas` | Billeteras / bancos / efectivo; `tipo`, saldos ARS/USD |
| `fin_categorias` | `nombre`, `color`, `tipo`, `oculta`, `objetivo_id`; seeds `Transferencia`, `Ajuste`, `FIRE` |
| `fin_movimientos` | Histórico; FK cuenta y categoría |
| `fin_config` | KV: `dolar_oficial`, `fire_*`, `tasa_ahorro_objetivo`, … |
| `fin_notas` | Notas del dashboard |
| `fin_instrumentos` | Portafolio polimórfico (`tipo`, ticker, TNA, fechas PF, …) |
| `fin_objetivos` | Metas de ahorro (nombre único) |
| `fin_fire_filas` | Override `ahorrado` por `YYYY-MM` |
| `fin_inflacion` | % mensual para tab Anual |

### API REST (`/fin/*`)

| Método | Ruta | Notas |
|--------|------|-------|
| GET/POST | `/fin/cuentas` | Listar / crear cuenta; POST acepta `saldo_ars`/`saldo_usd` opcionales → movimientos «Saldo inicial» (categoría Ajuste) |
| PATCH | `/fin/cuentas/{id}` | Editar metadata (nombre, tipo, color, initials) |
| POST | `/fin/recalcular-saldos` | Recalcula `saldo_ars`/`saldo_usd` de todas las cuentas desde movimientos |
| PATCH | `/fin/cuentas/{id}/saldo` | **410** — obsoleto; usar movimientos (Ajuste) o recalcular |
| DELETE | `/fin/cuentas/{id}` | Eliminar cuenta |
| GET | `/fin/categorias?include_ocultas=` | Lista; por defecto excluye `oculta=1` |
| POST/PATCH/DELETE | `/fin/categorias` | CRUD; PATCH sin rename en sistema/objetivo; DELETE bloqueado si `objetivo_id` o movimientos |
| GET | `/fin/movimientos?mes=YYYY-MM` | Mes actual vs histórico sin query |
| POST/PATCH/DELETE | `/fin/movimientos` | PATCH resuelve cuenta/categoría por nombre |
| GET/PUT | `/fin/config` | Dict clave-valor |
| GET/POST/DELETE | `/fin/notas` | |
| GET | `/fin/emergencia` | Deprecated; saldo = movimientos cat. objetivo **Fondo de emergencia** |
| CRUD | `/fin/instrumentos`, `/fin/objetivos` | Objetivo: POST crea categoría; PATCH sin `nombre`; DELETE oculta categoría |
| GET/PUT | `/fin/fire-filas/{mes}`, `/fin/inflacion/{mes}` | |

**Al crear movimiento:** si la categoría no existe se **crea automáticamente**. Riesgo de typos ("Comida" vs "comida").

---

## 6. Bot de Telegram — Finanzas

**API local:** `http://127.0.0.1:8765` (mismo default que `app/config.py` / `mybot/defaults.py`). Override con `API_BASE_URL` en `.env`.

### Arquitectura

```
mybot/
├── bot.py                ← entry point; registra comandos Finanzas + dispatcher de callbacks
├── finanzas_handlers.py  ← todos los handlers, builders y lógica de Finanzas
├── agenda_handlers.py    ← Agenda + Hábitos (sin cambios de dominio)
└── chat_id.json
```

`_dispatch_callback` en `bot.py` intenta `fh.handle_finanzas_callback` primero; si devuelve `False`, cae en `ah.handle_callback` (Agenda/Hábitos). El `query.answer()` lo hace el dispatcher, no los handlers individuales de Finanzas.

### Seguridad

`BOT_ALLOWED_CHAT_IDS` en `.env` — lista de `chat_id` separados por coma. Si no está definida, todos los chats pueden usar los comandos de Finanzas. Si está definida, solo esos IDs pasan el check `_is_allowed()`.

### Comandos implementados

| Comando | Acción | API |
|---------|--------|-----|
| `/mov` | Flujo guiado: tipo (inline kb) → monto (texto) → descripción (texto) → cuenta (inline kb) → categoría (inline kb) → confirmación con preview → POST | `GET /fin/cuentas`, `GET /fin/categorias`, `POST /fin/movimientos` |
| `/saldo` | Saldos ARS/USD por cuenta + total + equivalente USD con `dolar_oficial` | `GET /fin/cuentas`, `GET /fin/config` |
| `/mes [YYYY-MM]` | Ingresos, gastos, balance, tasa ahorro del mes (sin transferencias). Default: mes actual | `GET /fin/movimientos?mes=` |
| `/ahorro` | FIRE del mes + aporte por objetivo (categoría o descripción = nombre) | `GET /fin/movimientos?mes=`, `GET /fin/objetivos` |
| `/ultimo` | Últimos 5 movimientos ordenados por fecha; botón `🗑 #N` para eliminar | `GET /fin/movimientos`, `DELETE /fin/movimientos/{id}` |
| `/dolar [valor]` | Sin arg: muestra valor actual. Con arg: actualiza `fin_config.dolar_oficial` | `GET /fin/config`, `PUT /fin/config` |
| `/objetivo [nombre]` | Sin arg: lista todos. Con nombre (fuzzy): barra de progreso, % ahorrado, meses restantes | `GET /fin/objetivos`, `GET /fin/movimientos` |
| Texto `$: …` | Captura rápida: parsea tipo + monto + desc + cuenta (fuzzy); pide categoría con teclado; confirmación antes de guardar | ídem `/mov` |

### UX — Inline keyboards

- **`/mov` tipo:** `[💸 Gasto]` `[💰 Ingreso]` → `ft:expense` / `ft:income`
- **`/mov` cuenta:** un botón por cuenta (2 columnas) → `fcc:{id}`
- **`/mov` categoría:** todas las categorías visibles (2 columnas, orden tipo + A-Z como la app) + `[➕ Nueva categoría…]` → `fcat:{id}` / `fcat_text`
- **`/mov` confirmar:** `[✓ Confirmar]` `[✕ Cancelar]` → `fok` / `fno`
- **`/ultimo` eliminar:** `[🗑 #N descripción]` por movimiento → `fdel:{id}`; lista se refresca tras eliminar

`callback_data` de Finanzas usa prefijos cortos:

| Prefijo | Acción |
|---------|--------|
| `ft:{tipo}` | Seleccionar tipo de movimiento |
| `fcc:{id}` | Seleccionar cuenta |
| `fcat:{id}` | Seleccionar categoría |
| `fcat_text` | Activar input de texto para categoría libre |
| `fok` | Confirmar y guardar movimiento |
| `fno` | Cancelar y limpiar draft |
| `fdel:{id}` | Eliminar movimiento desde `/ultimo` |

### Captura natural `$:`

```
$: gasto 4500 Super Coto uala    → Gasto $4.500 | desc: Super Coto | cuenta: Uala (fuzzy)
$: ingreso 50000 sueldo galicia  → Ingreso $50.000 | desc: sueldo | cuenta: Galicia (fuzzy)
fin: gasto 1200 café              → ídem con prefijo alternativo
```

Parsing: `{tipo?} {monto} {descripción…} {cuenta_hint?}` — el último token es la pista de cuenta; el resto (después del monto) es descripción. Si la cuenta no se detecta, muestra teclado de cuentas. Siempre termina en confirmación antes de `POST`.

### Fuzzy match

`_fuzzy_match(nombre, items)` — exacto → contiene → por palabras. Usado para cuentas (captura `$:`) y objetivos (`/objetivo`).

### Pasos conversacionales

| Step | Cuándo |
|------|--------|
| `fin_monto` | `/mov` después de elegir tipo: espera número |
| `fin_desc` | `/mov` después de monto: espera texto o `-` para omitir |
| `fin_cat_text` | Usuario tocó `✏️ Otra…` en categorías: espera nombre libre |

`/cancel` limpia `user_data` completo (incluyendo `fin_draft`).

---

## 7. Estado implementado (mayo 2026)

- Dashboard completo: donuts (con tooltip hover monto/% y highlight interactivo), tarjetas movimientos, modal ver todos (sort 3-clicks + filtro categoría + **export CSV**), cuotas, notas, panel der.
- Datos: histórico, edición inline on blur con **debounce 300ms**, delete sin confirmación, orden por fecha. `scope="col"` en headers.
- Anual, FIRE, Ahorro con paneles y CRUD instrumentos/objetivos.
- **FIRE mejorado:**
  - `ProyeccionRow` → un solo grid por columna (edad + año + card Total + card /mes·4% alineados); fuente USD auto-escala por longitud (`usdFontSize`); ARS equivalente abreviado (`fmtARSShort`: `$560M ARS`) con `whiteSpace: nowrap`.
  - Tabla: toggle **"Ver proyección completa"** expande hasta `fire_meta_edad` o 50 años (default 36 meses). `expanded` state antes del `useMemo` que lo consume.
  - `FireRightPanel`: campos `fire_meta_usd` y `fire_meta_edad`; botón Guardar con estados `saving/ok/err`; usa `saveFinConfigBulk` (un solo PUT).
  - `fire_inicio_mes` usa `||` (no `??`) para no iterar desde `''` si el campo está vacío.
- **CRUD cuentas (`FinanzasLeftPanel`):**
  - Por cuenta en configOpen: ícono lápiz → form inline (nombre, tipo, siglas, swatches de color `BRANCH_COLORS`); ícono papelera → confirm inline `¿Sí?/X`.
  - Botón **"+ Nueva cuenta"** expande form con mismo layout.
  - Store: `createFinCuenta` (optimista), `editFinCuentaMeta` (optimista), `deleteFinCuenta` (optimista).
  - Backend: `fin_editar_cuenta` en `crud.py`; `FinCuentaUpdate` model + `PATCH /fin/cuentas/{id}` en `main.py`.
- **`data/finanzas.js`:** helpers de cajón (`movimientoAsignadoACajon`, `contribucionCategoria`, `contribucionFire`, `acumuladoPorCategoriaNombre`); sin mock `FINANZAS`.
- **`MovementModal`:** `Ctrl+Enter` guarda; `FinCategoriaPicker`; plantillas rápidas; autocompletar cuenta/categoría desde `localStorage`.
- **Code-split:** `AnualTab`, `FireTab`, `AhorroTab`, `DatosTab` con `React.lazy` + `Suspense`.
- **`finActiveTab`** en store Zustand; `normalizeMovimiento()` centralizado.
- **`fetchFinMovimientosAll`** prefetcheado al entrar en `/finanzas` (no espera a que el usuario cambie de tab).
- **`utils/months.js`** centralizado; `DashboardTabs` ya lo usa.
- **`FinanzasMobileDrawer`:** botón "Ver resumen y cuentas" en `< md` abre panel izquierdo como drawer.
- **`prefers-reduced-motion`** para `.anim-card-in`.
- **Hex hardcoded** `#f59e0b`/`#22c55e` en `AhorroTab` → `var(--warning)`/`var(--success)`.
- **4 componentes huérfanos eliminados:** `IncomeExpenseCard`, `SubscriptionsCard`, `KPIsCard`, `FireProjectionCard`.
- **Rama `Placeholder`** eliminada de `FinanzasScreen`.
- **i18n:** `finSaldosCuenta`, `finBlue`, `finActual` agregados a `i18n.js`; `FinanzasLeftPanel` usa claves en lugar de strings hardcodeados.
- **Toast:** `role="status"/"alert"` + `aria-live` para anunciar cambios a lectores de pantalla.
- **Backend:** índices SQL `(fecha)`, `(categoria_id)`, `(tipo, fecha)` en `fin_movimientos`; `dolar_oficial_updated_at` en `fin_config` (auto-stamped en PUT); `mes_cierre` en config; endpoint `GET /fin/movimientos/resumen?mes=`.
- Scrollbars tematizados (`.panel-scroll` + accent Finanzas).
- Patrón offline: update optimista + try/catch en store.

### Estado implementado (junio 2026 — segunda ronda)

- **`MovimientosTableModal`:** click en fila → edición inline (descripción, monto, fecha) con confirmación; botón eliminar por fila con confirmación; focus trap + return focus al cerrar; `scope="col"` en headers.
- **`CategoryDonutCard`:** click en segmento o leyenda → filtra `MovimientosListCard` del mismo tipo; badge "✕ cat" para limpiar filtro; highlight visual del segmento activo; atajos `activeCat` / `onFilterCat` como props.
- **FireTab:** botón "Hoy — [mes]" sobre la tabla para volver a la fila actual; `ProyeccionRow` usa `saldoRealCuentas` (suma de `fin_cuentas.saldo_ars + saldo_usd × dolar`) como base real en lugar de `fire_saldo_inicial`; `scope="col"` en headers.
- **AhorroTab:** `LedgerSection` al pie del tab — selector de instrumento, tabla de transacciones (compra/venta) con fecha/cantidad/precio/total/nota, formulario de alta, eliminar por fila. Llama a `/fin/instrumentos/{id}/transacciones` y `/fin/transacciones/{id}`. `scope="col"` en todas las tablas de headers.
- **TopBar búsqueda Finanzas:** debounce 200ms → filtra localmente `finMovimientosAll` + `finNotas` + `finObjetivos`; dropdown con secciones Movimientos/Objetivos/Notas; se cierra al hacer click fuera o al seleccionar resultado. `searchInputRef` prop en TopBar para focus programático.
- **Mobile tabs:** chip bar fija en `< md` con las 5 tabs (Dash/Anual/FIRE/Ahorro/Datos); accent activo; bottom padding en centro para no tapar contenido.
- **Panel derecho bottom sheet:** visible en `lg` (entre `md` y `xl`) como panel flotante en esquina inferior derecha; muestra el panel derecho de la tab activa.
- **DatosTab virtualización:** `@tanstack/react-virtual` — solo renderiza las filas visibles; scroll container separado con `maxHeight: calc(100vh - 280px)`; padding rows top/bottom para altura total correcta.
- **DatosTab tab order:** `tabIndex={-1}` en `<select>` y botón delete de filas no en edición; evita que Tab cicle por centenas de celdas.
- **Ctrl+M atajos Finanzas:** sección dinámica en TweaksPanel muestra atajos globales + del tab activo; handlers en `FinanzasScreen`: `N` → nuevo movimiento, `1–5` → cambiar tab, `← →` → mes (en dashboard), `/` → focus buscador.
- **Focus trap MovementModal:** `containerRef` en `<form>`; cicla Tab/Shift-Tab dentro del modal; retorna focus al trigger al cerrar; `role="dialog"` + `aria-modal`.
- **Backend — PATCH /fin/categorias/{id}:** renombrar, cambiar color o tipo de una categoría de finanzas; 409 si nombre duplicado.
- **Backend — GET /fin/movimientos/duplicados?ventana_horas=24:** detecta movimientos con mismo tipo/monto/categoría dentro de una ventana de horas.
- **Backend — GET /fin/export/csv:** descarga CSV completo del histórico de movimientos (Content-Disposition attachment, UTF-8 BOM).
- **Backend — POST /fin/import/csv:** importa lista de filas `{tipo, monto, fecha, descripcion, categoria_nombre?, cuenta_nombre?, moneda?, nota?, cuotas?}`; auto-crea categorías inexistentes; devuelve cantidad importada y movimientos creados.
- **Backend — paginación opt-in:** `GET /fin/movimientos?limit=N&offset=M`; sin params = histórico completo (no rompe Anual/FIRE/Ahorro).
- **Backend — bulk ops:** `PATCH /fin/movimientos/bulk` (lista `[{id, ...campos}]`) y `DELETE /fin/movimientos/bulk` (lista `{ids: [...]}`).
- **Backend — ledger instrumentos:** tabla `fin_transacciones_instrumento`; endpoints `GET /fin/instrumentos/{id}/transacciones`, `POST /fin/instrumentos/{id}/transacciones`, `DELETE /fin/transacciones/{trans_id}`.
- **Backend — emergencia deprecated:** `GET /fin/emergencia` marcado `deprecated=True` en FastAPI; respuesta incluye `_deprecated: true`.
- **Bot — fecha en captura `$:`:** parser detecta `ayer`, `anteayer`, `hoy`, `DD/MM`, `DD-MM-YYYY` en cualquier posición; sobreescribe la fecha del movimiento.
- **Bot — cuotas en captura `$:`:** detecta `cuotas:N` o `c:N` en el texto; incluye `cuotas` en el payload POST.
- **Bot — resumen semanal:** `resumen_semanal_finanzas` como job diario que sólo ejecuta si `weekday() == 0` (lunes); envía `_build_mes` del mes actual a las 9:00 vía `job_queue`.

### Estado implementado (junio 2026 — modelo ahorro por categoría)

- **Migración** (`database.py` → `_migrate_fin_categorias_objetivos`): columnas `oculta`, `objetivo_id`; seed FIRE; objetivo **Fondo de emergencia**; Emergencia legacy `oculta=1`.
- **Backend** (`crud.py`): sync categoría al crear/eliminar objetivo; `fin_obtener_emergencia_saldo` por categoría del objetivo; protección PATCH/DELETE categorías reservadas.
- **Frontend:** `FireTab`/`FireRightPanel`/`AhorroRightPanel` usan cat. `FIRE`; `AhorroTab` panel Reparto; `finCategorias.js` reservadas; store refresca categorías tras CRUD objetivos.
- **Bot:** `/ahorro` y `/objetivo` por categoría o descripción (= nombre del cajón); categorías ocultas filtradas en teclados.
- **Dashboard emergencia:** `fetchFinEmergencia` → endpoint deprecated que ya suma movimientos de la categoría del objetivo seed.

### Deuda conocida

| Ítem | Detalle |
|------|---------|
| Migración `Ahorro` | Usuarios con movimientos en categoría legacy `Ahorro` deben reasignarlos manualmente a `FIRE` u objetivo |
| `GET /fin/emergencia` | Deprecated pero el dashboard aún lo consume (saldo correcto vía objetivo) |
| Instrumentos avanzados | Ventas parciales, splits, dividendos |
| Dual schema movimientos | `type/amount/cat` vs `tipo/monto/categoria_nombre` — fallbacks en consumidores; optimistic add en offline sigue usando shape legacy |
| Campana notificaciones | Badge visual, sin handler (requiere `fin_alertas`) |
| Atajos teclado avanzados | Vi/Ve/C (Dashboard), Ctrl+S/Supr (Datos), I/E (Ahorro/FIRE) — pendiente de levantar estado a store |
| Fusionar categorías | Renombrar sí; merge de dos categorías en una — pendiente |

---

## 8. Checklist para agentes

1. Leer `../CLAUDE.md` (resumen) y este archivo (detalle).
2. Confirmar si la tab usa `finMovimientos` (mes) vs `finMovimientosAll` (histórico).
3. Respetar `isTransferencia`; cajón FIRE = cat. `FIRE`; objetivo = cat. con mismo nombre que `fin_objetivos.nombre`.
4. Normalizar campos API/mock al leer y escribir.
5. Mantener patrón optimista en `useStore.js`.
6. Panel derecho solo en `xl+` — probar layout sin él.

---

## 9. Referencias de archivos

```
project/frontend/src/screens/FinanzasScreen.jsx
project/frontend/src/components/finanzas/
project/frontend/src/store/useStore.js
project/frontend/src/data/finanzas.js
project/frontend/src/data/finCategorias.js
project/frontend/src/data/finCategoriaColors.js
project/frontend/src/components/finanzas/DatosRightPanel.jsx
project/frontend/src/components/finanzas/EditFinCategoriaModal.jsx
project/frontend/src/index.css           # .panel-strong, .anim-card-in, .panel-scroll
project/app/main.py                      # rutas /fin/*
project/app/db/crud.py
project/app/db/database.py
ClaudeDesign/finanzas.jsx                # referencia visual, no runtime
```

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Finanzas-Roadmap.md`.*
