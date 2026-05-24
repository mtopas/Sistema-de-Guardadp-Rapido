# Bóveda — Roadmap e implementación pendiente

Todo lo que falta implementar, mejorar o rediseñar en el módulo Bóveda.
Cuando algo se complete, **mover la descripción actualizada a `Boveda.md`**.

---

## Frontend — Grafo

- [ ] Zoom/pan real con SVG `viewBox` o `d3-zoom`
- [ ] Modo "solo esta rama" al click en categoría
- [ ] Segundo layout: grafo por tags (clusters) con toggle en TopBar
- [ ] Grafo navegable con teclado (roving tabindex en árbol como alternativa)

## Frontend — LeftPanel y árbol

- [ ] Drag & drop para mover hojas entre categorías (necesita DnD lib)
- [ ] Resaltar texto en búsqueda dentro de apuntes (hoy solo contenido y nombre de categoría)

## Frontend — RightPanel y edición

- [ ] TipTap: `#tag` highlight inline
- [ ] TipTap: pegar URL → card embed

## Frontend — CaptureModal

- [ ] Recordatorio: date picker + hora + "avisar por Telegram sí/no" (cuando backend listo)
- [ ] Drag & drop de imagen en el área de foto

## Frontend — Layout y responsive

- [ ] CSS variables de layout `--boveda-left-w`, `--boveda-right-w`
- [ ] Breakpoint `lg` (1024px): grafo + un panel; `xl` (1280px): tres columnas
- [ ] TopBar mínima en mobile browse: título + búsqueda + FAB captura
- [ ] Share target → abrir `CaptureModal` vía query `?text=` en `App.jsx`
- [ ] Unificar detalle: `DetailScreen` como sheet full-screen en mobile

## Frontend — Rendimiento y store

- [ ] `fetchHojas` lazy al entrar `/` (hoy en cold start de App.jsx)
- [ ] Selectores Zustand finos: `useStore(s => s.hojas, shallow)` para no re-renderizar grafo + árbol juntos
- [ ] `useDeferredValue(query)` en búsqueda + highlight async

## Frontend — Ctrl+M contextual (Command Palette)

- [ ] Panel dual: **Apariencia** (actual) + **Captura/Navegación** (contextual en `/`)
- [ ] Acciones Bóveda: nueva hoja, pegar URL del portapapeles, subir imagen, ir a categoría, filtrar por tag
- [ ] Atajo `Ctrl+K` para búsqueda con dropdown (hojas + categorías + tags)

## Frontend — Menú contextual

- [ ] `BovedaContextMenu.jsx`: portal, posición x/y, cierre Escape/click fuera
- [ ] **Categoría en árbol:** renombrar/emoji, eliminar (con aviso si tiene hojas)
- [ ] **Hoja (`NoteCard`):** copiar contenido/URL, cambiar icono, añadir recordatorio, eliminar
- [ ] **RightPanel nota abierta:** duplicar, exportar apuntes Markdown, abrir link en navegador

---

## Backend

- [ ] Paginación: `GET /hojas?offset=&limit=`
- [ ] Link preview cache por URL (tabla `link_preview_cache`)
- [ ] Tabla `notificaciones` + `GET /notificaciones/pendientes` para recordatorios de hojas
- [ ] FTS5 en contenido+apuntes para búsqueda full-text

---

## Notificaciones

- [ ] Habilitar UI de recordatorio en `CaptureModal` (date picker + hora)
- [ ] Pipeline: PATCH `fecha_recordatorio` → tabla `notificaciones_pendientes` → scheduler → Telegram/web
- [ ] UX campana: agrupar "Hoy", "Esta semana", "Archivo"
- [ ] Inline keyboard Telegram: ✅ Hecho · 🕐 Posponer · 📖 Abrir en web

---

## Producto — largo plazo

- [ ] Papelera (soft delete) antes de DELETE definitivo
- [ ] Duplicar hoja
- [ ] Historial de versiones de apuntes (`hojas_revisiones`)
- [ ] Enlace interno `[[hoja:42]]` en apuntes
- [ ] Métricas locales: hojas/semana, categoría más usada, ratio link/texto
- [ ] Export / backup: `POST /admin/export/boveda` → JSON/ZIP
- [ ] Import desde Notion, Obsidian, markdown

---

*Cuando un ítem se complete: eliminar la línea de aquí y actualizar la sección correspondiente en `Boveda.md`.*
