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
        └── fallback optimista + mock FINANZAS si falla red
```

| Capa | Archivos clave |
|------|----------------|
| Pantalla | `screens/FinanzasScreen.jsx` |
| Tabs | `components/finanzas/DashboardTabs.jsx` |
| Componentes | `components/finanzas/*` (22 archivos) |
| Reglas / mock | `data/finanzas.js` (`isTransferencia`, `fmtARS`, `fmtUSD`, `FINANZAS`) |
| Store | `store/useStore.js` (prefijo `fin*`, `selectedMes`, modales) |
| API | `app/main.py` rutas `/fin/*` |
| SQL | `app/db/crud.py`, esquema en `app/db/database.py` |
| Bot | `mybot/bot.py` — **sin** `/fin/*` implementado aún |

**Carga inicial (`App.jsx`):** al montar se llama `fetchFinMovimientos` (mes actual), cuentas, categorías, config, notas, emergencia. `fetchFinMovimientosAll` se llama al entrar a Datos/Anual/FIRE/Ahorro.

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
| **dashboard** | Donuts ingreso/gasto, listas movimientos, cuotas, notas | Cuotas, gasto por categoría, KPIs, metas FIRE/emergencia (legacy) | Sí (`selectedMes`) |
| **anual** | Resumen año, barras nominal/real, tabla meses | Highlights, comparación, inflación editable | Solo año |
| **fire** | Tabla plan mensual + proyección | % aumento aporte, rentabilidad | Oculto |
| **ahorro** | Totales ARS/USD, distribución, instrumentos | Objetivos + meta FIRE del mes | Oculto |
| **datos** | Tabla histórica inline editable | KPIs del histórico | Oculto |

`selectedMes` formato `YYYY-MM`. Al cambiar mes: `setSelectedMes` → `fetchFinMovimientos(mes)`.

---

## 4. Reglas de negocio

### Transferencias

```js
isTransferencia(m) → categoría exacta "transferencia" (case-insensitive)
```

Excluidas de ingresos/gastos, donuts, KPIs, Anual, Datos, totales de ahorro.

### Categoría `Ahorro` (nombre exacto)

| Tipo movimiento | Efecto |
|-----------------|--------|
| **Gasto** + `Ahorro` | Suma al total ahorrado |
| **Ingreso** + `Ahorro` | Resta del total (retiro desde ahorros) |

**Objetivos:** descripción del movimiento **idéntica** al `nombre` del objetivo → asigna al objetivo. Sin match → **sin asignar**, pero el monto **sí** entra al total bruto.

### Dólar oficial

- Clave `fin_config.dolar_oficial` — carga **manual** en panel izquierdo.
- Conversión ARS ↔ USD en Ahorro/Anual/portafolio.
- Sin API de cotización en runtime.
- Fórmulas: Total ARS = inst.ARS + inst.USD × dólar; Total USD = inst.USD + inst.ARS / dólar.

### Dual schema movimientos

El mock usa `type`/`amount`/`cat`/`desc`/`method`. La API devuelve `tipo`/`monto`/`categoria_nombre`/`descripcion`/`cuenta_nombre`. `DatosTab` y otros normalizan con helpers (`getVal`, `patchKey`).

### Cuotas

Movimientos con `cuotas > 1` alimentan `CuotasCard` y panel derecho.

### Emergencia (legacy)

- API `GET /fin/emergencia`, categoría seed `Emergencia`, `fondo_emergencia_meta` en config.
- **Spec:** migrar a objetivo `Fondo de Emergencia`. Pendiente.

### Ahorro: dos mundos de datos

1. **Movimientos** categoría `Ahorro` → total líquido ahorrado.
2. **Instrumentos** (`fin_instrumentos`) → portafolio con P&L, plazos fijos, etc.

Concepto **"líquido sin invertir"** en `AhorroTab` reconcilia parcialmente ambos.

### FIRE

- Filas mensuales con proyección (aporte compuesto, interés, saldo).
- Overrides por mes en `fin_fire_filas` (`ahorrado_override`).
- Config: % incremento mensual de ahorro, rentabilidad.

---

## 5. Componentes por tab

| Tab | Archivos principales |
|-----|---------------------|
| Dashboard | `CategoryDonutCard`, `MovimientosCard`, `CuotasCard`, `NotasCard`, `FinanzasRightPanel` |
| Anual | `AnualTab`, `AnualRightPanel` |
| FIRE | `FireTab`, `FireRightPanel` |
| Ahorro | `AhorroTab`, `AhorroRightPanel` |
| Datos | `DatosTab`, `DatosRightPanel` |
| Global | `MovementModal`, `MovimientosTableModal` (sort 3-clicks + filtro categoría) |
| Panel izq. | `FinanzasLeftPanel` — saldos, ingresos/gastos mes, tasa ahorro, grupos cuenta, config dólar |

**Componentes huérfanos (no importados):** `IncomeExpenseCard.jsx`, `SubscriptionsCard.jsx`, `KPIsCard.jsx`, `FireProjectionCard.jsx`.

---

## 6. Modelo de datos (SQLite)

| Tabla | Uso |
|-------|-----|
| `fin_cuentas` | Billeteras / bancos / efectivo; `tipo`, saldos ARS/USD |
| `fin_categorias` | Gasto / ingreso / both; seeds `Ahorro`, `Emergencia` |
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
| GET/POST/PATCH/DELETE | `/fin/cuentas`, `.../saldo` | CRUD + actualizar saldos |
| GET/POST/DELETE | `/fin/categorias` | Auto-create al crear movimiento si no existe |
| GET | `/fin/movimientos?mes=YYYY-MM` | Mes actual vs histórico sin query |
| POST/PATCH/DELETE | `/fin/movimientos` | PATCH resuelve cuenta/categoría por nombre |
| GET/PUT | `/fin/config` | Dict clave-valor |
| GET/POST/DELETE | `/fin/notas` | |
| GET | `/fin/emergencia` | Legacy |
| CRUD | `/fin/instrumentos`, `/fin/objetivos` | |
| GET/PUT | `/fin/fire-filas/{mes}`, `/fin/inflacion/{mes}` | |

**Al crear movimiento:** si la categoría no existe se **crea automáticamente**. Riesgo de typos ("Comida" vs "comida").

---

## 6. Bot de Telegram — Finanzas

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
| `/ahorro` | Total categoría Ahorro del mes + lista de objetivos con meta y cuota | `GET /fin/movimientos?mes=`, `GET /fin/objetivos` |
| `/ultimo` | Últimos 5 movimientos ordenados por fecha; botón `🗑 #N` para eliminar | `GET /fin/movimientos`, `DELETE /fin/movimientos/{id}` |
| `/dolar [valor]` | Sin arg: muestra valor actual. Con arg: actualiza `fin_config.dolar_oficial` | `GET /fin/config`, `PUT /fin/config` |
| `/objetivo [nombre]` | Sin arg: lista todos. Con nombre (fuzzy): barra de progreso, % ahorrado, meses restantes | `GET /fin/objetivos`, `GET /fin/movimientos` |
| Texto `$: …` | Captura rápida: parsea tipo + monto + desc + cuenta (fuzzy); pide categoría con teclado; confirmación antes de guardar | ídem `/mov` |

### UX — Inline keyboards

- **`/mov` tipo:** `[💸 Gasto]` `[💰 Ingreso]` → `ft:expense` / `ft:income`
- **`/mov` cuenta:** un botón por cuenta (2 columnas) → `fcc:{id}`
- **`/mov` categoría:** hasta 10 categorías (2 columnas) + `[✏️ Otra…]` → `fcat:{id}` / `fcat_text`
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
- **`MovementModal`:** `Ctrl+Enter` guarda; validación visual "Ahorro sin objetivo"; chips de plantillas rápidas (Alquiler, SUBE, Spotify, etc.); autocompletar última cuenta/categoría desde `localStorage`.
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

### Deuda conocida

| Ítem | Detalle |
|------|---------|
| Emergencia → objetivo | Migración pendiente (`GET /fin/emergencia` sigue en código) |
| FIRE hitos por edad | Recálculo desde saldo real pendiente |
| Instrumentos avanzados | Ventas parciales, splits, dividendos |
| Dual schema movimientos | `type/amount/cat` vs `tipo/monto/categoria_nombre` — `normalizeMovimiento()` existe pero no se usa aún en todos los consumidores |
| TopBar búsqueda | `searchQuery` en `FinanzasScreen` existe pero no filtra nada todavía |
| Campana notificaciones | Badge visual, sin handler (requiere `fin_alertas`) |

---

## 8. Checklist para agentes

1. Leer sección relevante en `Prompt.md`.
2. Confirmar si la tab usa `finMovimientos` (mes) vs `finMovimientosAll` (histórico).
3. Respetar `isTransferencia` y categoría exacta `Ahorro`.
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
project/frontend/src/index.css           # .panel-strong, .anim-card-in, .panel-scroll
project/app/main.py                      # rutas /fin/*
project/app/db/crud.py
project/app/db/database.py
ClaudeDesign/finanzas.jsx                # referencia visual, no runtime
```

---

*Actualizar este archivo cuando se complete algo del roadmap. Referencia de pendientes: `Finanzas-Roadmap.md`.*
