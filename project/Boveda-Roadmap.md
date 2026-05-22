# Bóveda — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Bóveda.
Cuando algo se complete, **mover la descripción actualizada a `Boveda.md`**.

---

## Bot — Mejoras

- [ ] Detectar URL en texto → guardar como `tipo=link` (misma regex que backend)
- [ ] Subcategorías en dos pasos: primero raíces, luego hijos
- [ ] Modo rápido: si hay categoría favorita/última usada, guardar sin menú (`/rapido on|off`)
- [ ] `/ultimas` — 5 últimas hojas con botones inline
- [ ] `/buscar <palabra>` — `GET /hojas` filtrado en bot (límite 10)
- [ ] Inline keyboards en lugar de menú numérico (menos fricción en mobile)
- [ ] Cachear lista de categorías 60s (hoy hace GET en cada mensaje)
- [ ] Healthcheck: si `/categorias` falla al arrancar, avisar una vez
- [ ] Forward de mensaje Telegram → extraer texto/URL del forward
- [ ] Enviar ubicación → rellenar `lugar` + lat/long en `POST /hojas`

---

## Frontend — Grafo

- [ ] Click en nodo → `setOpenHojaId` (abrir en RightPanel)
- [ ] Hover tooltip: título + tipo + fecha + categoría
- [ ] Zoom/pan real con SVG `viewBox` o `d3-zoom`
- [ ] Aviso "+N hojas" en rama cuando hay más de 14
- [ ] Modo "solo esta rama" al click en categoría
- [ ] Segundo layout: grafo por tags (clusters) con toggle en TopBar
- [ ] `cursor: pointer` en leaves; `cursor: grab` en fondo para pan

## Frontend — LeftPanel y árbol

- [ ] Botón "+ Hoja" en header del árbol con categoría preseleccionada
- [ ] "Expandir todo / colapsar todo"; categorías **abiertas por defecto** si hay pocas
- [ ] Estado de expansión persistido en `localStorage` (`sgr-boveda-tree-open`)
- [ ] Resaltar texto coincidente en búsqueda (hoy filtra pero no resalta)
- [ ] Drag & drop para mover hojas entre categorías
- [ ] Crear subcategoría desde el árbol (hoy solo raíz desde `CategoryPicker`)

## Frontend — RightPanel y edición

- [ ] Editar `contenido` y `categoria_id` desde el panel (hoy solo apuntes/icono)
- [ ] Breadcrumb clickeable para cambiar categoría
- [ ] Indicador "sin guardar" visible si falla la red
- [ ] TipTap: Extension Link (URLs clicables), Placeholder ("Apuntes, #tags, ideas…"), `#tag` highlight inline, pegar URL → card embed

## Frontend — CaptureModal

- [ ] Tabs Finanzas/Agenda/Hábitos: ocultar en lugar de mostrar "próximamente" hasta que estén listas
- [ ] Recordatorio: date picker + hora + "avisar por Telegram sí/no" (cuando backend listo)
- [ ] Drag & drop de imagen en el área de foto
- [ ] Pre-seleccionar última categoría usada (`localStorage`)
- [ ] `role="dialog"` + `aria-modal` + focus trap

## Frontend — Layout y responsive

- [ ] CSS variables de layout `--boveda-left-w`, `--boveda-right-w`; grafo reactivo al expandir paneles
- [ ] Breakpoint `lg` (1024px): grafo + un panel; `xl` (1280px): tres columnas
- [ ] TopBar mínima en mobile browse: título + búsqueda + FAB captura
- [ ] Share target → abrir `CaptureModal` vía query `?text=` en `App.jsx`
- [ ] Unificar detalle: `DetailScreen` como sheet full-screen en mobile (reducir duplicación con RightPanel)

## Frontend — Rendimiento y store

- [ ] Offline optimista en slice Bóveda: `crearHoja`, `updateApuntes`, `eliminarHoja` con update local + rollback en catch (paridad con otros módulos)
- [ ] `fetchHojas` lazy al entrar `/` (hoy en cold start de App.jsx)
- [ ] Selectores Zustand finos: `useStore(s => s.hojas, shallow)` para no re-renderizar grafo + árbol juntos
- [ ] `useDeferredValue(query)` en búsqueda + highlight async
- [ ] Eliminar `parseGraph.js` y `DetailPanel.jsx` (huérfanos)

## Frontend — Ctrl+M contextual (Command Palette)

- [ ] Panel dual: **Apariencia** (actual) + **Captura/Navegación** (contextual en `/`)
- [ ] Acciones Bóveda: nueva hoja, pegar URL del portapapeles, subir imagen, ir a categoría, filtrar por tag
- [ ] Atajo `Ctrl+K` para búsqueda con dropdown (hojas + categorías + tags)
- [ ] Renombrar hint en TopBar según módulo

## Frontend — Menú contextual

- [ ] `BovedaContextMenu.jsx`: portal, posición x/y, cierre Escape/click fuera
- [ ] **Categoría en árbol:** nueva subcategoría, renombrar/emoji, nueva hoja aquí, expandir/contraer, eliminar (con aviso si tiene hojas)
- [ ] **Hoja (`NoteCard`):** abrir, copiar contenido/URL, mover a categoría, cambiar icono, añadir recordatorio, eliminar
- [ ] **Grafo rama:** filtrar panel izq; nueva hoja en rama
- [ ] **Grafo hoja:** mismas acciones que NoteCard
- [ ] **RightPanel nota abierta:** duplicar, exportar apuntes Markdown, abrir link en navegador

## Frontend — Accesibilidad

- [ ] `focus-visible: ring` con `--accent` en todos los botones y cards
- [ ] Grafo navegable con teclado (roving tabindex en árbol como alternativa)
- [ ] `@media (prefers-reduced-motion: reduce)` para animaciones
- [ ] `aria-label` en botones icon-only (zoom grafo, cerrar panel)
- [ ] Focus trap en `CaptureModal`; `TweaksPanel` ya tiene `role="dialog"`

---

## Backend

- [ ] `HojaPatch` ampliado: `contenido`, `categoria_id`, `tipo`, `fecha_recordatorio`, geo
- [ ] `GET /hojas?q=&tipo=&categoria_id=&tag=` — búsqueda y filtros server-side
- [ ] `GET /hojas/recientes?limit=20` — panel derecho y bot `/ultimas`
- [ ] `PATCH /categorias/{id}` — renombrar, mover `padre_id`, `icono`
- [ ] DELETE categoría: 409 si tiene hojas, o reasignar a raíz
- [ ] Índices SQLite: `(categoria_id)`, `(fecha DESC)`, FTS5 en contenido+apuntes
- [ ] Paginación: `GET /hojas?offset=&limit=`
- [ ] Link preview cache por URL (tabla `link_preview_cache`)
- [ ] DELETE archivo huérfano al borrar hoja foto
- [ ] Tabla `notificaciones` + `GET /notificaciones/pendientes` para recordatorios de hojas

---

## Notificaciones

- [ ] Habilitar UI de recordatorio en `CaptureModal` (date picker + hora)
- [ ] Pipeline: PATCH `fecha_recordatorio` → tabla `notificaciones_pendientes` → scheduler → Telegram/web
- [ ] UX campana: agrupar "Hoy", "Esta semana", "Archivo"; click → abre RightPanel/`/hoja/:id`
- [ ] Deshabilitar badge fijo en campana hasta que esté implementado (hoy confunde al usuario)
- [ ] Inline keyboard Telegram: ✅ Hecho · 🕐 Posponer · 📖 Abrir en web

---

## Producto — largo plazo

- [ ] Papelera (soft delete) antes de DELETE definitivo
- [ ] Duplicar hoja
- [ ] Historial de versiones de apuntes (`hojas_revisiones`)
- [ ] Enlace interno `[[hoja:42]]` en apuntes (tabla `enlaces` genérica cross-módulo)
- [ ] Métricas locales: hojas/semana, categoría más usada, ratio link/texto
- [ ] Cuadro apuntes flotante: abrir link externo con panel de notas anclado (iframe o panel lateral)
- [ ] Export / backup: `POST /admin/export/boveda` → JSON/ZIP
- [ ] Import desde Notion, Obsidian, markdown
- [ ] `CaptureModal` tab Finanzas/Agenda/Hábitos cuando los modales estén listos

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Boveda.md`.*
