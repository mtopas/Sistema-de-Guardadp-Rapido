# SGR · Órbita personal

Frontend independiente para Bóveda, Finanzas, Agenda, Hábitos y Ajustes. Diseño de observatorio digital: superficies oscuras, acentos multicolor, mapas orbitales, tipografía Syne + IBM Plex Sans, animaciones suaves y una variante clara. Se adapta a escritorio, tablet y celular y respeta movimiento reducido.

## Ejecutar

Requiere Node.js 22 y npm. Desde esta carpeta:

```powershell
npm install
npm run dev
```

Abrir **http://127.0.0.1:5174**. El puerto es fijo para no ocupar el 5173 del frontend existente.

También se puede ejecutar `iniciar.ps1`, que levanta Vite en segundo plano, sin ventanas. `detener.ps1` detiene únicamente el proceso registrado por ese script y verifica su comando antes de hacerlo.

```powershell
npm run build       # genera dist/
npm run preview     # sirve el build en :5174
```

## Datos y conexión

El modo inicial es **Sistema SGR**. Vite redirige `/api/*` a `http://127.0.0.1:8765/*`, con lo cual no se necesita cambiar el CORS del backend para el puerto nuevo. El backend debe estar iniciado por separado. Este proyecto no lo arranca ni modifica.

En **Ajustes → Conectá tu universo** se puede elegir otra URL o **Espacio local**. La preferencia queda guardada. Al conectar, el cliente consulta `/openapi.json` y adapta los campos, tipos, enumeraciones, relaciones y métodos de escritura al contrato disponible. El proxy funciona tanto en desarrollo como en `npm run preview`.

El **Espacio local** funciona sin backend, con persistencia en `localStorage`, exportación y restauración JSON. Es independiente de los datos reales de SGR: cambiar de modo no importa, sincroniza ni sobrescribe el otro espacio. No hay escritura diferida ni reintentos de mutaciones automáticos. Un error de la API mantiene el formulario abierto y muestra el motivo; no se informa un guardado ficticio. Los ejemplos solo se cargan manualmente sobre un espacio local vacío.

Para alojar `dist/` en otro servidor, configurar el fallback de SPA a `index.html` y un proxy `/api` hacia el backend, o compilar con `VITE_API_URL` apuntando a una API que admita ese origen. No hace falta CDN: íconos y fuentes se empaquetan localmente.

## Funciones

| Módulo | Implementado |
|---|---|
| Bóveda | Grafo SVG con pan/zoom, tarjetas, categorías jerárquicas, búsqueda textual, notas/enlaces/imágenes, adjuntos, edición enriquecida de apuntes con TipTap, recientes y vista de detalle. Búsqueda semántica y reindexación mediante la API. |
| Finanzas | CRUD de cuentas, categorías y movimientos; ARS/USD separados; transferencias excluidas de totales; filtros y CSV; gráficos por categoría; comparación anual nominal/real; inflación; notas; proyección FIRE y saldos por mes; objetivos; instrumentos y ledger de compras/ventas con PPC. Cotización e importación CSV disponibles con API. |
| Agenda | Día con bloques horarios y columnas para solapamientos, mes de 42 celdas, semana, calendarios, tareas, listas y canvas, fijado de listas, tareas rápidas, time blocking, facultad, recurrencia, hábitos del día y revisión semanal exportable a Markdown. Exportación ICS mediante API. |
| Hábitos | Crear/editar/archivar/eliminar, frecuencia diaria o por días, registros completos/parciales con nota y deshacer, grilla mensual con navegación por teclado, rachas, progreso, heatmap, tendencia e historial por hábito. |
| Ajustes | Perfil, modos claro/oscuro, control de movimiento, conexión, recordatorios del navegador, exportación/restauración local, backup/estado del backend y feedback. |
| Global | Captura rápida, búsqueda entre módulos, atajos, enlaces directos, navegación atrás/adelante, formularios validados, confirmación de eliminación, focus trap y avisos accesibles. |

Los avisos del navegador requieren permiso explícito y la página abierta. La recurrencia local materializa hasta un año; las series del sistema conectado las administra el backend. El gráfico de Bóveda muestra hasta doce notas por colección; la vista de tarjetas permite acceder al conjunto filtrado completo. La búsqueda global abarca los datos cargados.

## Verificación por código

```powershell
npm run lint
npm test
npm run test:ui
npm run build
```

- Pruebas de dominio: fechas locales y años bisiestos, monedas, transferencias, rachas, FIRE, exportación CSV, CRUD, saldo de cuentas, ciclos de categorías, registros únicos, PPC y recurrencia.
- Pruebas HTTP con respuestas controladas: OpenAPI, esquemas referenciados, rutas parametrizadas, paginación y errores de validación.
- Pruebas de componentes con React Testing Library + jsdom: todas las vistas con datos y vacías, CRUD persistido de notas, tareas/hábitos, validación de eventos, aislamiento al fallar la API, búsqueda/atajos y escritura según el contrato.
- La suite no abre un navegador, no toma capturas, no consulta el backend real ni accede a bases de datos del sistema.

## Estructura

```text
src/
  App.jsx           Navegación, shell, búsqueda y recordatorios
  Boveda.jsx        Conocimiento y grafo
  Finanzas.jsx      Panorama, anual, FIRE, ahorro y datos
  Agenda.jsx        Tiempo, calendarios y tareas
  Habitos.jsx       Seguimiento y estadísticas
  Settings.jsx      Preferencias, conexión y respaldo
  RichEditor.jsx    Editor enriquecido cargado a demanda
  ui.jsx            Componentes y formularios adaptativos
  store.jsx         Estado, carga y mutaciones
  api.js            Cliente HTTP/OpenAPI
  local.js          Persistencia local y reglas de escritura
  domain.js         Cálculos y fechas
  resources.js      Contratos documentados y campos locales
  styles.css        Sistema visual y adaptación responsive
tests/              Lógica, cliente HTTP e interacción sin navegador
```

## Alcance de lectura

Dentro de `D:\SGR\project` se leyeron únicamente `README.md` y `requirements.txt`. No se accedió a `project/frontend`, al código del backend, a sus bases ni a sus otros documentos. El nuevo código y sus archivos generados están contenidos en `D:\SGR\Front-GPT\SGR`.

Por esa restricción, la integración se implementó usando la documentación y la adaptación al OpenAPI que entrega el servidor al abrir la aplicación. Las pruebas de integración usan contratos controlados: **no equivalen a una validación contra el backend real**. Un endpoint no ofrecido o un error de contrato se muestra en pantalla, conservando los datos existentes.
