# Finanzas — documentación experta (SGR)

Referencia viva del módulo **Finanzas** (`/finanzas`): arquitectura, reglas de negocio, estado real del código, deuda conocida y propuestas de producto (bot, notificaciones, backend, atajos, menú contextual, **frontend**).

**Fuentes:** `Prompt.md` (spec), `project/README.md` (implementado), código en `project/frontend/src/components/finanzas/`, `project/frontend/src/store/useStore.js`, `project/app/main.py`, `project/mybot/bot.py`.

---

## 1. Rol en el producto

Finanzas es el módulo de **contabilidad personal offline-first**: capturar movimientos, ver el mes en el Dashboard, analizar el año, planificar FIRE, gestionar ahorro/inversión y editar el histórico completo.

| Aspecto | Detalle |
|---------|---------|
| Ruta | `/finanzas` → `FinanzasScreen.jsx` |
| Accent (tema Arcoíris) | Ámbar `#d97706` (`Layout.jsx` → `ARCOIRIS_ACCENTS`) |
| CTA header | **+ Movimiento** → `MovementModal` (`openMovement` en store) |
| Estado global | Mismo `useStore.js` que Bóveda/Agenda/Hábitos |
| Online | Solo el **bot Telegram** puede hablar con el mismo REST; la UI asume API local `http://127.0.0.1:8000` |

**Prompt original vs implementación:** el diseño ClaudeDesign tenía Dashboard / Movimiento / Patrimonio / Proyección FIRE. En producción: **Dashboard | Anual | FIRE | Ahorro | Datos**.

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
| Bot | `mybot/bot.py` — **hoy solo Bóveda**, sin `/fin/*` |

**Carga inicial (`App.jsx`):** al montar se llama `fetchFinMovimientos` (mes actual), cuentas, categorías, config, notas, emergencia. **No** se precarga `fetchFinMovimientosAll`; las tabs Datos/Anual/FIRE/Ahorro lo piden al entrar.

---

## 3. Layout y tabs

### 3.1 Tres columnas

| Zona | Componente | Visible |
|------|------------|---------|
| Izquierda | `FinanzasLeftPanel` | `md+`, todas las tabs |
| Centro | Contenido según tab | Siempre |
| Derecha | `*RightPanel` según tab | `xl+`, solo algunas tabs |

### 3.2 Tabs y selector de período

| Tab | Centro | Panel derecho | Selector mes/año |
|-----|--------|---------------|------------------|
| **dashboard** | Donuts ingreso/gasto, listas movimientos, cuotas, notas | Cuotas, gasto por categoría, KPIs, metas FIRE/emergencia (legacy) | Sí (`selectedMes` en store) |
| **anual** | Resumen año, barras nominal/real, tabla meses | Highlights, comparación, inflación editable | Solo año |
| **fire** | Tabla plan mensual + proyección | % aumento aporte, rentabilidad | Oculto |
| **ahorro** | Totales ARS/USD, distribución, instrumentos | Objetivos + meta FIRE del mes | Oculto |
| **datos** | Tabla histórica inline editable | KPIs del histórico | Oculto |

`selectedMes` formato `YYYY-MM`. Al cambiar mes: `setSelectedMes` → `fetchFinMovimientos(mes)`.

---

## 4. Reglas de negocio (críticas)

### 4.1 Transferencias

```js
// data/finanzas.js
isTransferencia(m) → categoría exacta "transferencia" (case-insensitive)
```

Excluidas de ingresos/gastos, donuts, KPIs, Anual, Datos, totales de ahorro.

### 4.2 Categoría `Ahorro` (nombre exacto)

| Tipo movimiento | Efecto |
|-----------------|--------|
| **Gasto** + `Ahorro` | Suma al total ahorrado (plata que deja de estar “disponible”) |
| **Ingreso** + `Ahorro` | Resta del total (retiro desde ahorros al día a día) |

**Objetivos:** descripción del movimiento **idéntica** al `nombre` del objetivo → asigna solo a ese objetivo. Si no hay match → **sin asignar**, pero el monto **sí** entra al total bruto (decisión de producto en `Prompt.md`).

**Deuda:** `MovementModal` **no** valida huérfanos ni muestra error al guardar.

### 4.3 Dólar oficial

- Clave `fin_config.dolar_oficial` — carga **manual** en panel izquierdo (config).
- Conversión ARS ↔ USD en Ahorro/Anual/portafolio.
- Sin API de cotización en runtime.

Fórmulas acordadas (spec):

- Total ARS = instrumentos ARS + instrumentos USD × dólar oficial  
- Total USD = instrumentos USD + instrumentos ARS / dólar oficial  

### 4.4 Dual schema movimientos

El mock y partes del front usan `type` / `amount` / `cat` / `desc` / `method`. La API devuelve `tipo` / `monto` / `categoria_nombre` / `descripcion` / `cuenta_nombre`. `DatosTab` y otros normalizan con helpers (`getVal`, `patchKey`). Al escribir, conviene enviar **ambas** formas o unificar en una capa `normalizeMovimiento()` en el store.

### 4.5 Cuotas

Movimientos con `cuotas > 1` alimentan `CuotasCard` y panel derecho. Cuando la última cuota del plan vence, la UI debería dejar de listarlas (lógica en componente; verificar contra datos reales).

### 4.6 Emergencia (legacy)

- API `GET /fin/emergencia`, categoría seed `Emergencia`, `fondo_emergencia_meta` en config.
- **Spec:** migrar a objetivo `Fondo de Emergencia` con categoría `Ahorro` y descripción exacta `Fondo de Emergencia`. Recategorización manual del histórico.

### 4.7 Ahorro: dos mundos de datos

1. **Movimientos** categoría `Ahorro` → total líquido ahorrado.  
2. **Instrumentos** (`fin_instrumentos`) → portafolio con P&L, plazos fijos, etc.

Existe concepto **“líquido sin invertir”** en `AhorroTab` que reconcilia parcialmente ambos. Spec futura: ledger compra/venta por ticker, ventas parciales, dividendos — **no implementado**.

### 4.8 FIRE

- Filas mensuales con proyección (aporte compuesto, interés, saldo).
- Overrides por mes en `fin_fire_filas` (`ahorrado_override`).
- Config en panel derecho: % incremento mensual de ahorro, rentabilidad.
- **Deuda:** tabla de hitos por edad debería recalcularse desde último saldo real (spec).

---

## 5. Componentes por tab (mapa rápido)

| Tab | Archivos principales |
|-----|---------------------|
| Dashboard | `CategoryDonutCard`, `MovimientosCard`, `CuotasCard`, `NotasCard`, `FinanzasRightPanel` |
| Anual | `AnualTab`, `AnualRightPanel` |
| FIRE | `FireTab`, `FireRightPanel`, `FireProjectionCard` |
| Ahorro | `AhorroTab`, `AhorroRightPanel` |
| Datos | `DatosTab`, `DatosRightPanel` |
| Global | `MovementModal`, `MovimientosTableModal` (ver todos, sort 3-clicks + filtro categoría) |
| Panel izq. | `FinanzasLeftPanel` — saldos, ingresos/gastos mes, tasa ahorro, grupos cuenta, config dólar/saldos |

**Modal movimiento:** fecha/hora, monto, gasto/ingreso, descripción, cuenta, cuotas opcional, categoría, ARS/USD, nota, audit. **Sin** `Ctrl+Enter` para guardar (sí en `CaptureModal` de Bóveda) — mejora rápida de UX.

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

### 6.1 API REST (`/fin/*`)

| Método | Ruta | Notas |
|--------|------|-------|
| GET/POST/PATCH/DELETE | `/fin/cuentas`, `.../saldo` | CRUD + actualizar saldos |
| GET/POST/DELETE | `/fin/categorias` | Auto-create categoría al crear movimiento si no existe |
| GET | `/fin/movimientos?mes=YYYY-MM` | Mes actual vs histórico completo sin query |
| POST/PATCH/DELETE | `/fin/movimientos` | PATCH resuelve cuenta/categoría por nombre |
| GET/PUT | `/fin/config` | Dict clave-valor |
| GET/POST/DELETE | `/fin/notas` | |
| GET | `/fin/emergencia` | Legacy |
| CRUD | `/fin/instrumentos`, `/fin/objetivos` | |
| GET/PUT | `/fin/fire-filas/{mes}`, `/fin/inflacion/{mes}` | |

**Comportamiento backend relevante:** al crear movimiento, si la categoría no existe se **crea automáticamente** (`fin_crear_categoria`). Útil para captura rápida; riesgo de typos y categorías duplicadas (“Comida” vs “comida” según normalización en CRUD).

---

## 7. Estado implementado vs pendiente (mayo 2026)

### Hecho

- Dashboard completo (donuts, tarjetas, modal ver todos, cuotas, notas, panel der.).
- Datos: histórico, edición inline on blur, delete sin confirmación, orden por fecha, columnas según spec reciente.
- Anual, FIRE, Ahorro con paneles y CRUD instrumentos/objetivos.
- Scrollbars tematizados (`.panel-scroll` + accent Finanzas).
- Patrón offline: update optimista + try/catch en store.

### Parcial / deuda

| Ítem | Detalle |
|------|---------|
| Bot Finanzas | No conectado |
| Validación Ahorro/objetivo | Sin error ni badge “sin asignar” en UI al guardar |
| Emergencia → objetivo | Migración pendiente |
| Config bancos en panel izq. | Incompleto vs prompt (alta de cuentas desde UI) |
| `fetchFinMovimientosAll` | No en bootstrap; puede mostrar mock hasta abrir tab |
| FIRE hitos por edad | Recálculo desde saldo real pendiente |
| Instrumentos avanzados | Ventas parciales, splits, dividendos |
| MovementModal | Sin Ctrl+Enter; sin plantillas recurrentes |
| TopBar búsqueda | `searchQuery` en FinanzasScreen **no filtra** nada aún |
| Campana notificaciones | UI decorativa (`badge` fijo), sin lógica |

---

## 8. Optimizar funcionamiento con el Bot

### 8.1 Estado actual

`mybot/bot.py` solo usa:

- `GET/POST /categorias`, `POST /hojas`, `POST /upload` (Bóveda).

No hay comandos ni flujo para movimientos financieros.

### 8.2 Propuesta: captura por mensaje natural

**Flujo mínimo viable (MVP):**

1. Usuario envía: `gasto 4500 super Coto uala` o `ing 480000 honorarios galicia`.
2. Bot parsea (regex simple primero; NLP local opcional después): tipo, monto, descripción, cuenta, categoría opcional.
3. `POST /fin/movimientos` con defaults: fecha=ahora, moneda=ARS.
4. Respuesta: resumen + enlace deep link `http://<host>:5173/finanzas` (solo informativo en Telegram).

**Flujo guiado (como Bóveda):**

```
Usuario: /mov
Bot: ¿Gasto o ingreso? (1/2)
Bot: Monto?
Bot: Descripción?
Bot: Cuenta? [lista numerada desde GET /fin/cuentas]
Bot: Categoría? [lista + crear nueva]
→ POST → confirmación
```

### 8.3 Comandos útiles

| Comando | Acción |
|---------|--------|
| `/saldo` | Suma saldos `fin_cuentas` + equivalente USD con `dolar_oficial` |
| `/mes` | Ingresos, gastos, tasa ahorro del mes (misma lógica que panel izq., sin transferencias) |
| `/ahorro` | Total categoría Ahorro + top 3 objetivos |
| `/ultimo` | Últimos 5 movimientos |
| `/foto` | Foto de ticket → OCR futuro; hoy pedir monto manual |

### 8.4 Foto / voz

- **Foto ticket:** subir a `/upload` + guardar como nota en movimiento o adjunto futuro; OCR (Tesseract / API) como fase 2.
- **Voz:** Telegram voice → Whisper local → mismo parser que texto.

### 8.5 Sincronización y conflictos

- El bot y la UI comparten SQLite vía API: **última escritura gana**.
- Tras `POST` movimiento, la UI no se entera hasta refresh: opciones:
  - WebSocket/SSE (overkill para homelab).
  - Polling ligero cada N segundos solo en `/finanzas` activo.
  - Toast al volver foco a la pestaña (“hay datos nuevos”) con `fetchFinMovimientos`.

### 8.6 Seguridad homelab

- Token Telegram + API solo en red local/VPN.
- Opcional: `BOT_ALLOWED_CHAT_IDS` en `.env` para no exponer finanzas si el token filtra.

---

## 9. Notificaciones en Finanzas

Hoy el icono **campana** en `TopBar` es visual (`badge` hardcodeado), sin store ni backend.

### 9.1 Principio offline-first

Sin depender de FCM/APNs: notificaciones **locales** (navegador `Notification API` si la PWA está abierta o en segundo plano) + **centro de avisos in-app** alimentado por reglas calculadas sobre SQLite vía API.

### 9.2 Tipos de alerta sugeridos

| Alerta | Regla | Tab relacionada |
|--------|-------|-----------------|
| Meta ahorro mes | Ahorro categoría mes &lt; meta FIRE | Dashboard / Ahorro |
| Objetivo cerca del 100% | `progreso >= 90%` | Ahorro |
| Objetivo vencido | `fecha_limite` pasada y `progreso < 100%` | Ahorro |
| Cuota próxima | Cuota N de M en los próximos 3 días | Dashboard |
| Suscripción / gasto fijo | Mismo `desc` + cat cada ~30 días sin movimiento este mes | Dashboard |
| Inflación sin cargar | Mes anterior sin entrada en `fin_inflacion` | Anual |
| FIRE desvío | `ahorrado_real` &lt; 80% plan 3 meses seguidos | FIRE |
| Dólar desactualizado | `dolar_oficial` sin cambio &gt; 7 días (timestamp en config) | Panel izq. |
| Sin asignar | Movimientos `Ahorro` sin objetivo en el mes | Ahorro |
| Saldo bajo cuenta | `saldo_ars` &lt; umbral por cuenta (config) | Panel izq. |

### 9.3 Implementación sugerida

```
fin_alertas (id, tipo, payload_json, leida, created_at)
```

- Job al abrir app o cron en backend: `POST /fin/alertas/evaluar` regenera alertas.
- UI: dropdown en campana; click navega a tab/contexto.
- Bot: `/alertas` envía las mismas reglas por Telegram (único canal “push” real fuera del navegador).

### 9.4 Recordatorios vs notificaciones

El checkbox “recordar” en `CaptureModal` está deshabilitado por spec. Para Finanzas tiene más sentido **recordatorio de acción** (“cargar resumen del mes”) que recordatorio por movimiento individual.

---

## 10. Mejoras del backend

### 10.1 API y consistencia

| Mejora | Por qué |
|--------|---------|
| **Normalizar respuestas** | Siempre mismo shape en movimientos (`tipo`, `monto`, `categoria_nombre`, …) y eliminar dual schema en clientes |
| **`GET /fin/movimientos/resumen?mes=`** | Agregados servidor-side (ingresos, gastos, por categoría) — menos datos al cliente en Dashboard |
| **Paginación** | `?limit=&offset=` o cursor en Datos con miles de filas |
| **Bulk PATCH/DELETE** | Edición masiva en Datos (cambiar categoría a selección) |
| **Validación Ahorro** | Opcional `strict_objetivos=true` en config: 400 si descripción no matchea objetivo |
| **Índices SQL** | `(fecha)`, `(categoria_id)`, `(tipo, fecha)` en `fin_movimientos` |
| **Transacciones** | Crear movimiento + actualizar saldo cuenta en una transacción (hoy saldos y movimientos pueden divergir) |
| **Auditoría** | Tabla `fin_movimientos_log` en PATCH/DELETE |
| **Import/export** | `POST /fin/import/csv`, `GET /fin/export/csv` para backup y Excel |
| **Duplicados** | `GET /fin/movimientos/duplicados?ventana_horas=24` |

### 10.2 Categorías y cuentas

- Endpoint `PATCH /fin/categorias/{id}` (renombrar, fusionar).
- `merge_categorias(origen_id, destino_id)` actualizando FKs.
- Evitar auto-create silencioso en producción: flag `allow_auto_categoria`.

### 10.3 Config ampliada

Claves sugeridas en `fin_config`:

- `dolar_oficial_updated_at`
- `alertas_habilitadas` (JSON por tipo)
- `umbral_saldo_{cuenta_id}`
- `mes_cierre` (día que “cierra” el mes contable)

### 10.4 Emergencia

- Deprecar `/fin/emergencia`; script migración one-shot a objetivo.
- Mantener compat 1 versión con warning en logs.

### 10.5 Arquitectura código

- Spec del repo: rutas planas en `main.py` + `crud.py` (OK por ahora).
- Si crece: `app/routers/finanzas.py` sin cambiar contratos.

---

## 11. Ctrl+M contextual (más allá de Tweaks)

### 11.1 Hoy

`TweaksPanel.jsx`: **global**, solo temas / tono / tipografías. Misma UI en Bóveda, Finanzas, Agenda y Hábitos. `TopBar` muestra hint `Ctrl+M` en el buscador.

### 11.2 Propuesta: panel dual

**Ctrl+M** abre panel con dos pestañas:

1. **Apariencia** — lo actual (temas, tonos, fuentes).
2. **Atajos** — depende de `location.pathname` + tab Finanzas activa.

Guardar tab activa de Finanzas en store: `finActiveTab` (hoy es `useState` local en `FinanzasScreen` — **subir a Zustand** para que atajos y menú contextual la vean).

### 11.3 Atajos por contexto Finanzas

| Contexto | Atajo | Acción |
|----------|-------|--------|
| Global Finanzas | `N` | + Movimiento |
| Global | `1`–`5` | Cambiar tab Dashboard…Datos |
| Global | `←` `→` | Mes anterior / siguiente (si tab usa selector) |
| Global | `/` | Focus buscador (cuando filtre movimientos) |
| Dashboard | `Vi` / `Ve` | Modal ver todos ingresos / gastos |
| Dashboard | `C` | Focus notas |
| Datos | `Ctrl+S` | Forzar guardado fila con foco (blur explícito) |
| Datos | `Supr` | Borrar fila seleccionada |
| MovementModal | `Ctrl+Enter` | Guardar (paridad Bóveda) |
| MovementModal | `Tab` | Ciclar gasto ↔ ingreso |
| Ahorro | `I` | Nuevo instrumento (tipo último usado) |
| FIRE | `E` | Modo edición tabla |
| Cualquiera | `D` | Abrir config dólar en panel izq. (scroll + highlight) |

Mostrar cheatsheet en pestaña **Atajos** del panel; opcional `?` para overlay rápido.

### 11.4 Implementación técnica

- `useFinanzasShortcuts({ tab, selectedMes })` hook en `FinanzasScreen`.
- `e.preventDefault()` solo si no hay input/textarea focused.
- No chocar con `Ctrl+M` (Tweaks) ni `Ctrl+Enter` global de captura.

---

## 12. Click derecho (e izquierdo) en Finanzas

### 12.1 Patrón existente en SGR

`TopBar`: **click** título → módulo siguiente; **click derecho** → módulo anterior. Buen precedente para gestos con intención.

En Finanzas **no hay** `onContextMenu` en movimientos, filas Datos, donuts ni cuentas.

### 12.2 Menú contextual universal

Componente `ContextMenu.jsx` (portal, posición x/y, cierre Escape/click fuera):

```jsx
<ContextMenu items={[
  { label: 'Editar', onClick, shortcut: 'Enter' },
  { label: 'Duplicar', onClick },
  { type: 'separator' },
  { label: 'Eliminar', danger: true },
]} />
```

### 12.3 Acciones por superficie

| Superficie | Click izq. (actual / propuesto) | Click der. (propuesto) |
|------------|----------------------------------|-------------------------|
| Fila movimiento (Dashboard card) | — | Editar en modal / Duplicar / Cambiar categoría / Eliminar |
| Fila `DatosTab` | Editar celda | Misma fila: Duplicar, Marcar transferencia, Copiar JSON |
| Donut segmento | — | Filtrar dashboard por esa categoría |
| `AccountRow` | — | Ajustar saldo, Ver movimientos de cuenta, Renombrar |
| Objetivo (Ahorro der.) | — | Editar meta, Registrar aporte rápido (abre MovementModal prellenado) |
| Instrumento | Expandir acordeón | Actualizar precio, Eliminar, Ver P&L |
| Tab FIRE celda | Editar | Reset override mes, Copiar valor |
| Nota dashboard | — | Eliminar, Fijar arriba |
| Cuota en lista | — | Ver movimiento padre, Simular cancelación anticipada |

### 12.4 “Registrar aporte rápido”

Desde objetivo → menú contextual:

```js
openMovement({
  tipo: 'expense',
  categoria: 'Ahorro',
  descripcion: objetivo.nombre,
  monto: objetivo.cuota_mensual ?? '',
})
```

Reduce fricción entre **Ahorro** y **+ Movimiento**.

### 12.5 Configuración de menú por usuario

Tabla o `localStorage`:

```json
{
  "fin.contextMenu": {
    "movimiento": ["editar", "duplicar", "eliminar"],
    "cuenta": ["ajustar_saldo", "ver_movs"]
  }
}
```

Pantalla en **Settings** o en Tweaks → Atajos → “Personalizar menú contextual”.

### 12.6 Mobile

Long-press ≈ context menu; mismo componente con trigger táctil.

---

## 13. Otras mejoras de producto

### 13.1 Búsqueda TopBar

Conectar `searchQuery` a:

- Dashboard: filtrar listas y resaltar en donuts.
- Datos: filtro client-side en `finMovimientosAll`.
- Global: panel resultados (movimientos + notas + objetivos).

### 13.2 Plantillas y recurrentes

- “Alquiler”, “SUBE”, “Spotify” → prefill categoría/cuenta/monto.
- Tabla `fin_plantillas` + bot derecho “Guardar como plantilla”.

### 13.3 Transferencias explícitas

Wizard: gasto en cuenta A + ingreso en B, categoría `transferencia`, mismo monto — evita errores manuales.

### 13.4 Reconciliación bancaria

Import CSV del banco → matching por fecha+monto → sugerir crear o vincular movimiento.

### 13.5 Export e informes

- PDF mes (dashboard snapshot).
- CSV año fiscal desde Anual.
- Gráfico exportable PNG.

### 13.6 Comparar meses

En Dashboard: overlay mes anterior (ghost bars en donuts).

### 13.7 Multi-moneda coherente

Mostrar siempre par ARS/USD en tarjetas grandes; aviso si mezclás monedas sin tipo de cambio del día del movimiento.

### 13.8 Integración Agenda

Gasto con fecha alineada a evento “Pago alquiler” en agenda (misma fecha, link opcional `agenda_evento_id` en movimiento — columna futura).

### 13.9 Captura multimódulo

`CaptureModal` tiene tabs Bóveda/Finanzas/Agenda/Hábitos deshabilitados — habilitar tab Finanzas = mismo `MovementModal` embebido para captura sin cambiar de ruta.

### 13.10 Testing y calidad

- Tests `isTransferencia`, cálculo ahorro, proyección FIRE (funciones puras extraídas de componentes).
- Seed determinístico para demo.

---

## 14. Frontend — análisis, diseño y roadmap

Análisis del código en `project/frontend/src` aplicado al módulo Finanzas: stack, sistema visual, componentes, rendimiento, accesibilidad y mejoras concretas a implementar.

### 14.1 Stack y dependencias

| Tecnología | Uso en Finanzas |
|------------|-----------------|
| React 18 + Vite 7 | SPA, sin SSR |
| React Router 6 | Ruta única `/finanzas` |
| Zustand 4 | Estado `fin*` en `useStore.js` monolítico |
| Tailwind 3 | Utilidades (`flex`, `grid`, `hidden xl:block`) |
| CSS global `index.css` | Tokens, `.panel-strong`, `.anim-card-in`, scrollbars |
| Lucide React | Iconografía |
| **Sin** Recharts / D3 / Chart.js | Gráficos = **SVG manual** (`CategoryDonutCard`, `AnualTab` BarChart) |

**Implicación:** cualquier gráfico nuevo debe seguir el patrón SVG + variables CSS, o introducir una lib con cuidado (peso del bundle, coherencia visual).

### 14.2 Dirección estética (identidad Finanzas)

**Contexto SGR:** Finanzas comparte tipografía y temas globales (`utils/themes.js`, `FONT_PAIRS`, Tweaks Ctrl+M). El módulo no tiene skin propio: hereda `--accent` ámbar vía tema **Arcoíris** en `Layout.jsx`.

**Lo que ya funciona (mantener y profundizar):**

- **Editorial + ledger:** títulos `serif italic` + cifras `mono` + `.tnum` (tabular nums) — sensación de cuaderno contable refinado, no app bancaria genérica.
- **Cards** `.panel-strong`: borde suave, highlight interior con `--accent-light`, sombra profunda — profundidad sin glassmorphism excesivo.
- **Semántica de color:** `--income` / `--expense` en `index.css` (verde/rojo; en tema claro versiones más desaturadas alineadas con `Prompt.md`).
- **Entrada escalonada** Dashboard: `anim-card-in` con `--i` por fila — una sola orquestación al cargar tab, no micro-animaciones dispersas.
- **Scrollbars** `.panel-scroll` con thumb `var(--cta-bg)` → en Finanzas con Arcoíris se tiñen de ámbar (pedido cumplido en spec).

**Dirección recomendada (frontend-design):**

| Eje | Propuesta |
|-----|-----------|
| **Tono** | *Industrial-utilitarian editorial* — densidad controlada, mucha información legible, acento ámbar como “tinta contable” |
| **Diferenciador** | Números grandes con serif + donuts/barras SVG hechos a mano (no charts de stock) |
| **Evitar** | Cards blancas tipo fintech, Inter-only, gradientes violeta, dashboards simétricos sin jerarquía |
| **Atmósfera opcional** | Grain muy sutil solo en panel izquierdo (`FinanzasLeftPanel`) o fondo del centro; rejilla de puntos al 3% en tab FIRE |

Finanzas debe sentirse **continuación de Bóveda** (mismos tokens), no un producto pegado.

### 14.3 Inventario de componentes

#### En uso (`FinanzasScreen` y hijos)

| Componente | Rol |
|------------|-----|
| `FinanzasScreen` | Orquestador tabs + layout 3 columnas |
| `DashboardTabs` | Tabs + selectores mes/año |
| `FinanzasLeftPanel` | Saldo, ingresos/gastos, cuentas, config dólar/saldos |
| `CategoryDonutCard` | Donut SVG ingresos/gastos |
| `MovimientosCard` | Lista reciente + abre `MovimientosTableModal` |
| `CuotasCard`, `NotasCard` | Dashboard inferior |
| `FinanzasRightPanel` | KPIs, cuotas, categorías, metas |
| `AnualTab` + `AnualRightPanel` | Barras SVG, inflación, tabla meses |
| `FireTab` + `FireRightPanel` | Tabla proyección, overrides |
| `AhorroTab` + `AhorroRightPanel` | Portafolio, acordeones, objetivos |
| `DatosTab` + `DatosRightPanel` | Tabla histórica editable |
| `MovementModal` | Alta global (montado en `App.jsx`) |
| `MovimientosTableModal` | Ver todos con sort 3-clicks |
| `CardHeader` | Encabezado repetido en cards |

#### Código huérfano (migración ClaudeDesign sin cablear)

| Archivo | Estado |
|---------|--------|
| `IncomeExpenseCard.jsx` | No importado |
| `SubscriptionsCard.jsx` | No importado (spec Ahorro: quitar suscripciones de esa tab) |
| `KPIsCard.jsx` | No importado (KPIs viven en `FinanzasRightPanel` / `DatosRightPanel`) |
| `FireProjectionCard.jsx` | No importado |

**Acción:** eliminar o fusionar en un solo `FinanzasKPIStrip` exportado; evita confusión para agentes.

### 14.4 Sistema de estilos

#### Tokens y clases globales (`index.css`)

```
.label          → mono 10px uppercase (metadatos)
.panel-strong   → card principal
.btn-fin / .btn-ghost / .icon-btn-fin
.anim-card-in   → stagger entrada
.panel-scroll   → scrollbar tematizada
.serif / .mono / .tnum
--income / --expense
```

#### Patrón mixto inline + Tailwind

Muchos componentes Finanzas usan **objetos `style={{}}`** para TH/TD, colores de fila, bordes focus — especialmente `DatosTab`, `FireTab`, `AhorroTab`.

| Pros | Contras |
|------|---------|
| Coherente con tokens `var(--*)` | Duplicación TH/TD entre tabs |
| Fácil `color-mix` con accent | Difícil mantener dark/light sin olvidar un archivo |
| | No hay Storybook ni tabla de variantes |

**Mejora:** extraer `finTableStyles.js` o clases `@layer components` en CSS:

```css
.fin-th { /* sticky header compartido */ }
.fin-td-mono { font-family: var(--font-mono); font-size: 12px; }
.fin-row-hover:hover { background: color-mix(in oklch, var(--accent) 6%, transparent); }
```

#### Duplicación de constantes TH/TD

`DatosTab`, `FireTab`, `AhorroTab` cada uno define `TH`, `TD`, `INPUT` casi iguales → **unificar** en `components/finanzas/finTablePrimitives.jsx`.

### 14.5 Layout responsive

```
┌─────────────────────────────────────────────────────────┐
│ TopBar (sticky 60px)                                     │
├──────────┬──────────────────────────────┬───────────────┤
│ Left     │ Centro (scroll)              │ Right         │
│ 300px    │ flex-1                       │ 260–272px     │
│ md+      │                              │ xl+           │
└──────────┴──────────────────────────────┴───────────────┘
```

| Breakpoint | Comportamiento actual | Problema |
|------------|----------------------|----------|
| `< md` | **Sin panel izquierdo** | Pérdida de saldo, ingresos/gastos, config dólar |
| `< xl` | **Sin panel derecho** | Sin cuotas/KPIs/objetivos según tab |
| Móvil nav | `Layout` bottom nav solo Bóveda + Settings | **No hay atajo a Finanzas** en barra inferior |

**Implementar:**

1. **Sheet/drawer** “Resumen” (swipe o botón) con contenido de `FinanzasLeftPanel` en `< md`.
2. **Tabs inferiores** o chip bar fija en móvil para cambiar tab sin scroll largo.
3. Panel derecho como **bottom sheet** en `lg`–`xl` intermedio (opcional).
4. Entrada en mobile nav: icono TrendingUp → `/finanzas`.

### 14.6 Estado React y datos

#### Problemas detectados

| Issue | Dónde | Impacto |
|-------|-------|---------|
| `finActiveTab` solo en `useState` local | `FinanzasScreen` | Atajos, menú contextual y Tweaks no saben la tab |
| `searchQuery` no conectado | `FinanzasScreen` → `TopBar` | Búsqueda muerta |
| `fetchFinMovimientosAll` lazy | Solo al abrir Datos/Anual/FIRE/Ahorro | Primer paint con mock pequeño |
| Suscripción Zustand amplia | `useStore(s => s.finMovimientos)` en muchos hijos | Re-render de donuts al editar una nota |
| Sin `normalizeMovimiento()` central | Dual schema | Bugs sutiles en PATCH |
| `Placeholder` tab | `FinanzasScreen` default branch | Código muerto (tabs cubren todo) |

#### Optimización store

```js
// Selectores estables
export const useFinMovMes = () => useStore(s => s.finMovimientos)
export const useFinTab = () => useStore(s => s.finActiveTab) // nuevo

// O shallow compare en componentes pesados
import { useShallow } from 'zustand/react/shallow'
```

**Prefetch:** al navegar a `/finanzas`, en `Layout` o `FinanzasScreen` mount:

```js
fetchFinMovimientosAll(); fetchFinInstrumentos(); fetchFinObjetivos();
```

### 14.7 Rendimiento

#### Tab Datos — cuello de botella principal

- Renderiza **todas** las filas en un `<table>` sin virtualización.
- Cada celda es un micro-componente (`FechaCell`, `TextCell`, …) definido **dentro** del render de `DatosTab` → nuevas funciones cada render (peor para React reconciliation).
- Cada `blur` → `updateFinMovimiento` → PATCH + actualiza **dos** arrays (`finMovimientos` + `finMovimientosAll`) → re-render global de suscriptores.

| Prioridad | Solución |
|-----------|----------|
| P0 | `@tanstack/react-virtual` o ventana manual (~40 filas visibles) |
| P1 | Extraer celdas a archivos estables; `memo` en fila |
| P2 | Debounce PATCH 300ms en edición rápida |
| P3 | Paginación servidor + “cargar más” si API pagina |

#### Donuts y Anual

- `buildCategories` en cada render de donut — ya usa `useMemo` ✓.
- `AnualTab` BarChart: SVG 12 grupos × 3 barras — liviano; recalcula en cada cambio de `finMovimientosAll` ✓ aceptable.
- **Hover en segmentos donut:** no implementado — solo visual estático.

#### Modales

- `MovimientosTableModal` usa `createPortal` ✓ — bien para z-index.
- Sin focus trap ni `aria-modal` completo en `MovementModal` / tabla.

### 14.8 Componentes clave — deuda UX/UI

#### `MovementModal`

| Hecho | Falta |
|-------|-------|
| Toggle gasto/ingreso con color semántico | `Ctrl+Enter` guardar |
| Focus inicial en monto | Autocompletar última categoría/cuenta (localStorage) |
| Cuentas/categorías desde API | Validación visual objetivo `Ahorro` (warning “sin asignar”) |
| | Plantillas rápidas (chips: Alquiler, SUBE, …) |
| | Date picker nativo vs texto ISO inconsistente con Datos |

#### `MovimientosTableModal`

| Hecho | Falta |
|-------|-------|
| Sort 3-clicks, filtro categoría | Editar fila / eliminar desde modal |
| Portal + Escape | Click en fila → abrir edición |
| Solo lectura | Export CSV del filtrado |

#### `CategoryDonutCard`

| Hecho | Falta |
|-------|-------|
| SVG donut + leyenda | Hover tooltip monto/% |
| Fallback mock si sin datos | Click segmento → filtrar dashboard |
| | Animación `stroke-dashoffset` al cambiar mes |
| | Leyenda colapsable en móvil |

#### `FinanzasLeftPanel`

| Hecho | Falta |
|-------|-------|
| Saldo hero + tasa ahorro bar | Objetivo FIRE en barra (línea meta) |
| Config dólar + saldos inline | CRUD cuentas nuevas (spec incompleto) |
| `AccountRow` solo hover | Click → movimientos de esa cuenta |
| Texto “blue” para dólar | Renombrar a “oficial” (copy) |

#### `AhorroTab`

| Hecho | Falta |
|-------|-------|
| Totales ARS/USD, `DistribBar`, acordeones | Gráfico torta distribución (spec debatida) |
| P&L básico por instrumento | Ledger compra/venta por ticker |
| `liquidoSinInvertir` en ámbar hardcoded `#f59e0b` | Usar `var(--accent)` o token `--warning` |
| Tablas inline add/edit | Menú contextual fila |

#### `FireTab`

| Hecho | Falta |
|-------|-------|
| Tabla larga scroll, celdas `AhorradoCell` | Hitos por edad (spec) |
| Proyección compuesta en cliente | Indicador visual mes actual sticky |
| | Sparkline mini de saldo en header |

### 14.9 Accesibilidad (a11y)

| Área | Estado | Mejora |
|------|--------|--------|
| Tabs `DashboardTabs` | `role="tablist"` / `tab` / `aria-selected` ✓ | Flechas ←→ entre tabs, `aria-controls` panel |
| Montos | `aria-label` en saldo ARS ✓ | Anunciar cambios tras guardar (live region) |
| Tablas Datos/FIRE | Headers sticky | `scope="col"`, caption oculto para SR |
| Modales | `aria-label` cerrar parcial | Focus trap, return focus al CTA |
| Contraste | income/expense en cards | Verificar WCAG en tema claro + Arcoíris ámbar |
| Teclado | Enter/Escape en celdas Datos ✓ | Tab order en tabla (evitar tab por celda invisible) |
| `prefers-reduced-motion` | No respetado | Desactivar `anim-card-in` |

### 14.10 Internacionalización

- Claves `fin*` en `utils/i18n.js` — cobertura buena ES/EN.
- **Hardcoded español:** “Saldos por cuenta”, “blue” en left panel, algunos placeholders en `AhorroTab` AddForm.
- Meses: duplicados en `DashboardTabs`, `AnualTab`, `FireTab` — centralizar `utils/months.js`.
- Formato fecha: Dashboard `toLocaleDateString`, Datos `DD-MM-AAAA` — unificar con `Intl.DateTimeFormat`.

### 14.11 Gráficos y visualización de datos

**Patrón actual:** funciones puras exportadas (`buildCategories`, `buildMonthly`, `computeDeflators`) mezcladas con JSX — bueno para tests si se extraen a `utils/finanzasCalc.js`.

**Mejoras visuales sin librerías:**

| Gráfico | Mejora |
|---------|--------|
| Donut | `transition` en `stroke-dasharray` 400ms al cambiar `selectedMes` |
| Barras Anual | Highlight mes actual; línea cero para ahorro negativo |
| DistribBar Ahorro | Tooltip; click → scroll a acordeón tipo |
| FIRE | Heatmap mini opcional (mes × cumplimiento meta) en panel der. |

**Si se adopta librería:** `visx` (bajo nivel, SVG) encaja mejor que Recharts para mantener identidad.

### 14.12 Nuevos componentes a implementar (frontend)

| Componente | Propósito | Prioridad |
|------------|-----------|-----------|
| `ContextMenu.jsx` | Menú contextual unificado (§12) | Alta |
| `FinanzasMobileDrawer.jsx` | Panel izq. en móvil | Alta |
| `FinShortcutsPanel.jsx` | Pestaña Atajos en Ctrl+M (§11) | Media |
| `FinSearchResults.jsx` | Resultados búsqueda TopBar | Media |
| `MovementTemplateChips.jsx` | Plantillas en modal | Media |
| `FinVirtualTable.jsx` | Datos + miles filas | Alta |
| `ObjetivoProgressList.jsx` | Extraer de `AhorroRightPanel` | Baja |
| `FinToastInline.jsx` | Warning “Ahorro sin objetivo” | Media |
| `NotificationsDropdown.jsx` | Campana TopBar (§9) | Media |
| `finTablePrimitives.jsx` | TH/TD/INPUT compartidos | Media |

### 14.13 Optimizaciones técnicas (checklist)

**Quick wins (< 1 día)**

- [ ] `Ctrl+Enter` en `MovementModal`
- [ ] Prefetch `fetchFinMovimientosAll` al entrar en `/finanzas`
- [ ] Subir `finActiveTab` + `finSearchQuery` a Zustand
- [ ] `prefers-reduced-motion` para animaciones
- [ ] Reemplazar `#f59e0b` / `#22c55e` hardcoded por tokens
- [ ] Eliminar o archivar 4 componentes huérfanos
- [ ] Quitar rama `Placeholder` en `FinanzasScreen`

**Mediano plazo**

- [ ] Virtualización `DatosTab`
- [ ] `finanzasCalc.js` + tests Vitest
- [ ] `normalizeMovimiento()` en store
- [ ] Focus trap modales
- [ ] Lazy load tabs: `React.lazy(() => import('./AnualTab'))` con `Suspense` skeleton
- [ ] Memo `DonutCard` / listas con `React.memo`

**Largo plazo / calidad producción**

- [ ] Code-split por tab (reduce bundle inicial)
- [ ] PWA offline cache de último `GET /fin/movimientos`
- [ ] Storybook módulo Finanzas (cards + tabla + modal)
- [ ] E2E Playwright: crear movimiento → ver en dashboard

### 14.14 Integración con Tweaks y temas

| Tema | Finanzas |
|------|----------|
| Arcoíris | Accent ámbar por ruta — **correcto** |
| Otros 5 temas | Accent global del tema; ingresos/gastos siguen verde/rojo |
| Tonos (`TONES`) | Solo temas oscuros — panels Finanzas se benefician de más contraste en `--surface` |
| Fuentes | `FONT_PAIRS` afectan serif de totales — probar pares con buenos números tabulares |

**Idea Tweaks específica Finanzas:** toggle “Modo densidad” (compacto para Datos/FIRE vs cómodo para Dashboard).

### 14.15 Captura multimódulo (`CaptureModal`)

```js
// CaptureModal.jsx — tab finanzas disabled
{ id: 'finanzas', enabled: false, ... }
```

Habilitar tab = incrustar formulario compacto o `openMovement()` y cerrar captura — **misma UX que Bóveda** sin cambiar de módulo mental.

### 14.16 Mapa visual por tab (wire mental)

| Tab | Jerarquía visual propuesta |
|-----|---------------------------|
| Dashboard | 1) Donuts simétricos 2) Listas movimientos 3) Cuotas 4) Notas — ritmo Z |
| Anual | Hero año + toggle nominal/real → barras anchas → tabla densa |
| FIRE | Tabla como “hoja de cálculo” — mono dominante, pocos colores |
| Ahorro | Hero totales grande → barra distribución → acordeones instrumentos |
| Datos | Tabla full-bleed — mínimo ornamento, máximo dato |

### 14.17 Referencia ClaudeDesign vs runtime

`ClaudeDesign/finanzas.jsx` es **referencia estática**, no importada. Al migrar UI:

1. Comparar espaciado y jerarquía, no copiar pegado.
2. Preferir tokens `var(--*)` sobre hex del diseño.
3. No reintroducir `SubscriptionsCard` en Ahorro salvo decisión de producto.

---

## 15. Checklist rápido para agentes

Antes de tocar Finanzas:

1. Leer sección relevante en `Prompt.md` (líneas ~200–400 y ~794+).
2. Confirmar tab y si usa `finMovimientos` vs `finMovimientosAll`.
3. Respetar `isTransferencia` y categoría exacta `Ahorro`.
4. Normalizar campos API/mock al leer y escribir.
5. Mantener patrón optimista en `useStore.js`.
6. No asumir bot conectado; si se toca bot, usar `/fin/*` existente.
7. Panel derecho solo en `xl+` — probar layout sin él.
8. Leer **§14 Frontend** antes de cambios UI (responsive, Datos performance, componentes huérfanos).

---

## 16. Referencias de archivos

```
project/frontend/src/screens/FinanzasScreen.jsx
project/frontend/src/components/finanzas/
project/frontend/src/components/finanzas/MovementModal.jsx
project/frontend/src/components/TweaksPanel.jsx
project/frontend/src/components/TopBar.jsx
project/frontend/src/store/useStore.js
project/frontend/src/data/finanzas.js
project/frontend/src/index.css           # .panel-strong, .anim-card-in, .panel-scroll
project/frontend/src/components/Layout.jsx
project/app/main.py          # líneas ~417–722
project/app/db/crud.py
project/app/db/database.py
project/mybot/bot.py
ClaudeDesign/finanzas.jsx    # referencia visual, no runtime
```

---

*Última revisión: mayo 2026 — alineado con `project/README.md` y código en repo.*
