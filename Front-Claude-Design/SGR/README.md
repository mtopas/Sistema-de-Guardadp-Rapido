# SGR — Front-Claude-Design

Frontend completo y **funcional** para SGR: Bóveda, Finanzas, Agenda y Hábitos sobre la misma
API local (`:8765`) que usa el frontend original. Estética futurista: fondo aurora animado,
paneles de vidrio, acento de color por módulo, gráficos SVG propios y transiciones suaves en
todas las interacciones.

No comparte una sola línea con `project/frontend`. Es un proyecto Vite independiente que habla
con el backend **solo por HTTP**, así que los dos pueden convivir y correr en paralelo.

---

## Arranque

```powershell
cd Front-Claude-Design\SGR    # desde la raíz del repo
npm install
npm run dev                   # http://localhost:5273
```

El backend tiene que estar corriendo aparte, como siempre:

```powershell
cd project
.\venv\Scripts\activate
uvicorn app.main:app --reload --port 8765
```

En Windows hay dos atajos: `.\iniciar.ps1` (instala si hace falta y levanta la UI) y
`.\detener.ps1`.

### Puertos

| Qué | Puerto | Nota |
|-----|--------|------|
| API SGR | **8765** | sin cambios; este front no la toca ni la reemplaza |
| Front original (Vite) | 5173 | sigue funcionando igual |
| **Este front (Vite)** | **5273** | elegido para no chocar con el de arriba |

En desarrollo, todo lo que empieza con `/api` va por el proxy de Vite a `http://127.0.0.1:8765`,
así que el navegador nunca hace una petición cross-origin y no dependemos del CORS del backend.
Se puede apuntar a otro host con `SGR_API` en `.env` (por ejemplo, el homelab por Tailscale), o
desde **Ajustes → Conexión con la API** sin tocar archivos.

### Build de producción

```powershell
npm run build        # → dist/
npm run preview      # sirve dist/ en :4173
```

En el build, `VITE_API_URL` vacío significa **mismo origen**: si algún día se sirve `dist/` desde
el propio FastAPI, funciona sin configurar nada.

---

## Qué hay implementado

### Bóveda (`/`)
- Grafo radial en SVG con zoom, paneo y filtro por categoría; alternativa en lista de tarjetas.
- Árbol de categorías con CRUD completo (crear, renombrar, mover de padre, color, emoji, borrar
  con opción de forzado cuando tiene hojas).
- Captura con autodetección de tipo (texto / link / foto), subida de archivos a `/upload`,
  color por hoja y apuntes. **Ctrl+Enter** guarda.
- Panel de detalle con editor de apuntes enriquecido, vista previa de links (y botón para
  regenerarla), imagen para las fotos y borrado a Basura.
- Búsqueda textual instantánea y búsqueda **semántica** (`/hojas/buscar-semantico`) con botón de
  reindexado.

### Finanzas (`/finanzas`)
Cinco tabs, las mismas del proyecto: **Dashboard · Anual · FIRE · Ahorro · Datos**.
- **Dashboard:** KPIs del mes, donuts de gasto e ingreso por categoría, lista de movimientos,
  cuotas activas con avance, notas, metas y reparto del gasto.
- **Anual:** ingresos vs gastos mes a mes, balance nominal y **ajustado por inflación**
  (editable mes a mes), tabla del año, comparación contra el año anterior.
- **FIRE:** proyección a N meses calculada en el cliente, curva del patrimonio, tabla mensual con
  el aportado editable (se guarda como override en `fin_fire_filas`), parámetros del plan y regla
  de retiro con renta mensual estimada.
- **Ahorro:** reparto entre cajón FIRE, objetivos y líquido sin invertir; portafolio de
  instrumentos y ledger global de operaciones con alta, edición y baja.
- **Datos:** histórico filtrable y **editable en la tabla**, selección múltiple para borrado o
  cambio de categoría masivo, exportación CSV, importación CSV, detección de duplicados y CRUD de
  categorías en el panel derecho.
- Panel izquierdo fijo: patrimonio consolidado al MEP, totales del mes, cuentas agrupadas por
  tipo y widget del dólar con actualización contra `/fin/dolar/cotizacion`.

### Agenda (`/agenda`)
- **HOY:** grilla horaria 6–23 h con eventos, bloques de tareas (time blocking), hábitos con hora
  y la capa de facultad opacada detrás; línea de la hora actual en vivo.
- **Mes:** vista 6×7 y vista semana, toggle de calendarios activos, CRUD de calendarios con
  reasignación de eventos al borrar, y panel "lo que viene".
- **Tareas:** vista Lista y vista **Canvas** (todas las listas a la vez, las fijadas arriba),
  filtros pendientes/hechas/todas, quick-add por lista y detalle en el panel derecho.
- **Revisión:** retrospectiva semanal con cumplimiento día a día, % de tiempo planificado,
  distribución por calendario y arrastres vencidos.
- **Horario de facultad:** alta y baja por día de la semana desde su propio modal.

### Hábitos (`/habitos`)
- **HOY:** grilla mensual en un solo contenedor con scroll, columnas de nombre y % fijas; click en
  una celda abre el registro (Total 1.0 / Parcial 0.5 + nota corta).
- **Progreso:** resumen de 7 y 30 días, mensaje de momentum, mapa de calor de 3 meses, sparkline
  de 6 meses y tabla por hábito con racha, máxima y tendencia.
- **Historial:** calendario coloreado por % del día, notas en hover y filtro por hábito.
- Frecuencia diaria o por días de la semana, con hora opcional que lo hace aparecer en Agenda.

### Ajustes (`/ajustes`)
Estado de la conexión, cambio de la base de la API, recarga de datos, snapshot JSON de lo que hay
en memoria, apariencia completa y atajos de teclado.

### Transversal
- **Paleta de comandos (Ctrl+K):** navegación, acciones y búsqueda simultánea en hojas,
  movimientos, tareas y hábitos.
- **Panel de apariencia (Ctrl+M):** 6 temas (5 oscuros + 1 claro), 3 tonos, 3 tipografías,
  3 densidades y switches de efectos.
- **Acento por módulo:** violeta en Bóveda, ámbar en Finanzas, azul en Agenda, verde en Hábitos.
- **Indicador de conexión** en la barra superior, con latencia real contra la API.

---

## Reglas de negocio replicadas

Están todas en `src/lib/fin.js` y `src/lib/habitos.js`, con las mismas definiciones que usa el
proyecto (ver `project/README.md`):

- Una **transferencia** (tipo `transfer` o categoría `Transferencia`) no es ingreso ni gasto y
  queda fuera de todos los totales. `Ajuste` tampoco cuenta como movimiento real.
- El **cajón FIRE** es la categoría `FIRE`; cada **objetivo** tiene una categoría homónima. Dentro
  de un cajón, el gasto suma y el ingreso resta (puede quedar negativo). Si el movimiento no tiene
  categoría, alcanza con que la descripción sea igual al nombre del cajón.
- Los montos en USD se convierten con el **MEP** antes de sumarse; sin cotización, un total mixto
  queda incompleto y la UI lo avisa.
- Los **saldos de cuentas son derivados**: fijar un saldo crea un movimiento de categoría `Ajuste`
  por la diferencia, no hay PATCH de saldo.
- En **cuotas**, el monto guardado es el total de la compra y cada cuota es total/N desde el mes
  de compra.
- La **racha** de un hábito son días consecutivos con valor > 0; un parcial la mantiene viva y un
  día no programado no la corta. El día de hoy pendiente tampoco la rompe.

---

## Arquitectura

```
Componente → store Zustand → src/lib/api.js → fetch → API SGR (:8765)
                  ↓
           update optimista → re-render
```

- **Un store por módulo** (`src/store/`), no uno global: Bóveda, Finanzas, Agenda, Hábitos y UI.
- **Offline-first:** cada mutación aplica el cambio en pantalla primero y lo revierte si el
  servidor lo rechaza. Un fallo de red **no** revierte: se avisa con un toast y el dato queda en
  pantalla, igual que en el proyecto original.
- **Sin mock:** si la API no responde, las pantallas muestran su estado vacío. No se inventan
  datos nunca.
- Los cuatro módulos se cargan con `lazy()`: el grafo, las tablas de Finanzas y la grilla de
  hábitos no pesan hasta que se entra.

```
src/
├── main.jsx · App.jsx            # router, atajos globales, modales globales
├── shell/                        # rail, topbar, paleta de comandos, apariencia, toasts
├── modules/{boveda,finanzas,agenda,habitos,ajustes}/
├── store/{ui,boveda,fin,agenda,habitos}.js
├── ui/                           # primitivas, gráficos SVG, hooks, editor, fondo aurora
├── lib/{api,dates,fin,habitos,theme}.js
└── styles/base.css               # tokens CSS, animaciones, clases de componente
```

### Decisiones

| Decisión | Motivo |
|----------|--------|
| Tokens como CSS vars + alias en Tailwind | cambiar de tema no recompila ni remonta nada |
| Utilidades de Tailwind al final de `base.css` | si no, `.input` o `.overlay` pisan a `pl-9` o `items-start` |
| Gráficos SVG propios | donut, barras, área, sparkline, heatmap, gauge y anillos sin sumar una librería |
| Editor sobre `contenteditable` | mismo contrato (HTML en `apuntes`) que TipTap, sin 200 KB de dependencias |
| Un store por módulo | evita el archivo único gigante del proyecto original |
| Proxy `/api` en dev | el navegador nunca cruza de origen y no dependemos del CORS |
| Animaciones en CSS, no en JS | el hilo principal queda libre; `prefers-reduced-motion` las apaga |

---

## Dependencias

`react`, `react-dom`, `react-router-dom`, `zustand`, `lucide-react`. Y nada más en runtime.
