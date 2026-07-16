# SGR — Informe: camino al siguiente nivel

> Elaborado en julio 2026 sobre el estado real del repo: `README.md`, `Finanzas.md`, los cuatro `*-Roadmap.md`, `SYNC-WINDOWS.md`, `HOMELAB.md`, `BUILD.md` y `PLAN-NEXTLEVEL.md`. Los números de líneas y la ausencia de tests fueron verificados sobre el código, no sobre la documentación.

## 1. Executive summary (máx. 12 líneas)

**Veredicto:** SGR ya es un producto personal funcionalmente maduro — cuatro módulos completos, bot con LLM local, RAG, sync homelab, `.exe` — pero corre sobre una base de confianza frágil: **cero tests automatizados**, migraciones ad-hoc sin versionado ni backup previo, y un sync snapshot last-writer-wins que puede pisar datos del bot sin avisar. El gap no es de features (sobran); es de **confiabilidad verificable y packaging**. Un producto que gestiona tu plata y tu conocimiento no puede depender de que ninguna regresión toque `contribucionFireUSD` o `_recalcular_posicion` sin que nadie se entere.

**Las 3 palancas de mayor ROI:**
1. **Red de seguridad de datos** — tests de las reglas de negocio (FIRE, ledger PPC, reparto, rachas), guard anti-pisado en `/sync/import`, backups locales automáticos y migraciones versionadas. Esfuerzo M, elimina el 80% del riesgo existencial.
2. **Cerrar deuda que multiplica bugs** — dual schema de movimientos, IDs offline sin reconciliar en Hábitos, categorías auto-creadas con typos. Es deuda chica pero está en el camino de *cada* feature futura.
3. **Convertir lo ya construido en valor percibido** — la búsqueda semántica no tiene UI, `/fin/movimientos/duplicados` no tiene UI, el resumen semanal LLM (Fase 6) está a un endpoint de distancia. Hay "wow" ya pagado sin cobrar.

---

## 2. Diagnóstico del estado actual

### 2.1 Fortalezas reales

- **Cobertura funcional inusualmente completa para un indie.** Los cuatro módulos no son demos: Finanzas tiene ledger de instrumentos con PPC ponderado y guardrails (409 al editar campos derivados), motor FIRE en USD con overrides, reparto por cajones; Agenda tiene recurrencia expandida en backend, export ICS, notificaciones de browser; Hábitos tiene navegación por teclado y ARIA de verdad.
- **Captura sin fricción real, no aspiracional.** Telegram con `$:`, `t:`, `e:`, fuzzy match de cuentas, y encima router de intención con Ollama + fallback transparente. Este es el diferenciador más difícil de copiar: la captura funciona *desde el bolsillo* sin depender de una nube ajena.
- **Offline-first consistente.** El patrón "optimista + try/catch, catch sin reset" está aplicado en los cuatro slices, documentado como convención, y la app degrada a estado vacío sin mocks fantasma.
- **Dominio financiero argentino de primera mano.** MEP con cache offline, inflación mensual editable, nominal/real en Anual, FIRE en USD con contribuciones ARS convertidas. Ninguna alternativa comercial (YNAB, Fintonic) modela esto.
- **Documentación viva excepcional.** `README.md` + docs técnicas + roadmaps por módulo con la disciplina "al completar, mover a la doc". Esto es un activo raro y hay que decirlo: la mayoría de los proyectos indie no lo tienen, y es lo que hace viable trabajar con agentes.
- **Infra ya resuelta:** Docker en homelab, sync por HTTP sin parar contenedores (`/sync/export` + `/sync/import` con backup server-side), sandbox dev con DB efímera, `.exe` PyInstaller con rutas portables.

### 2.2 Debilidades / deuda

| Área | Deuda concreta | Evidencia |
|------|----------------|-----------|
| **Testing** | **Cero tests.** Ni unitarios de `habitosUtils.js` / `data/finanzas.js`, ni de `crud.py`, ni del parser `$:` del bot. El roadmap de Finanzas los lista como "largo plazo". | Búsqueda de `test_*.py` / `*.test.js` en el repo: solo aparecen tests vendored dentro de `dist/` y `venv/`. |
| **Monolitos** | `crud.py` 2.349 líneas, `main.py` 1.586, `useStore.js` 1.306, `agenda_handlers.py` 1.462. `app/routes/` y `app/services/` existen vacías. | Conteo directo. El costo ya se nota: cada feature Finanzas exige revisar "ambos slices de movimientos" a mano. |
| **Dual schema** | `type/amount/cat` vs `tipo/monto/categoria_nombre`; el optimistic add offline sigue usando el shape legacy. Cada consumidor nuevo necesita `normalizeMovimiento()` o hereda el bug. | `Finanzas.md` §4 y deuda conocida; `Finanzas-Roadmap.md`. |
| **Reconciliación offline** | Hábitos: IDs mock `h_*`/`reg_*` creados offline nunca se reconcilian al reconectar → duplicados posibles. Es el único **bug P0 declarado** en los roadmaps. | `Habitos-Roadmap.md` §Bugs P0. |
| **Modelo cajón-por-string** | La asignación FIRE/objetivos depende de coincidencia exacta de nombre de categoría *o descripción*. `POST /fin/movimientos` auto-crea categorías inexistentes → typos ("Comida"/"comida") generan cajones basura y silenciosamente sacan movimientos del reparto. | `Finanzas.md` §4 y nota de riesgo en §6. |
| **Migraciones** | Todo en `init_db()` al arrancar: sin número de versión de schema, sin backup previo automático, sin dry-run. Una migración con bug escribe directo sobre la única DB productiva. | `database.py` (`_apply_migrations`), `SYNC-WINDOWS.md` regla 4. |
| **Notificaciones** | Es la promesa incumplida transversal: los 4 roadmaps + Fase 3 del plan la piden (tabla unificada, scheduler, campana, Telegram) y no existe nada; la campana de Finanzas es un badge sin handler. | Los cuatro `*-Roadmap.md`, `PLAN-NEXTLEVEL.md` Fase 3. |
| **Legacy visible** | Categoría `Ahorro` sin migrar (aviso permanente en AhorroTab), `GET /fin/emergencia` deprecated pero consumido por el dashboard, overrides FIRE viejos en ARS "desactualizados", `seed_demo.py` desalineado del modelo nuevo, `/capture` legacy. | `Finanzas.md` deuda conocida, `README.md`. |
| **Distribución** | Rebuild del `.exe` = 5 comandos manuales + problemas conocidos de service worker cacheado (sección entera de troubleshooting en `BUILD.md`). Sin versión visible, sin changelog, sin auto-update. | `BUILD.md`. |

### 2.3 Riesgos críticos (datos, sync, mantenimiento)

Ordenados por severidad × probabilidad:

1. **Pisado silencioso en el push del sync (pérdida de datos real).** El flujo es: pull al abrir → sesión `.exe` → push al cerrar si la DB local cambió (SHA-256). Si el bot escribió en el homelab *durante* la sesión, el push **sobrescribe esos cambios** con la réplica local. Existe el `app.db.bak.<timestamp>` server-side, pero la recuperación es manual, requiere darse cuenta, y un merge a mano de dos SQLite. `SYNC-WINDOWS.md` documenta el comportamiento ("lo que guarda el bot no aparece hasta la próxima sync") pero no protege el caso inverso. Es el único escenario donde SGR puede **perder datos sin ninguna señal**.
2. **Regresión numérica invisible.** Sin tests, un refactor en `contribucionFireUSD`, `_recalcular_posicion` (PPC), `isTransferencia` o `calcStreak` puede corromper proyecciones y saldos que el usuario usa para decidir. Peor que un crash: números *plausibles pero mal*. La superficie es grande: la lógica está duplicada JS/Python (bot tiene su port de `calcStreak`/`isScheduled`) y triplicada front/bot/crud en Finanzas.
3. **Migración destructiva sin red.** `init_db()` muta el schema al arrancar sin backup previo local. En el homelab, un deploy con migración rota corrompe la canónica; en Windows, el `.exe` la aplica al doble clic. La regla "tras migración en dev, deploy + pull" vive solo en un doc.
4. **Erosión por monolito.** Con 4 módulos × ~5.200 líneas concentradas en 3 archivos, la probabilidad de efecto cruzado por edición (humana o de agente) crece con cada feature. No es urgente hoy; es interés compuesto.
5. **Divergencia de lógica JS ↔ Python.** Rachas, transferencias y cajones calculados en dos lenguajes sin tests de paridad → el bot y la web pueden reportar números distintos y nadie lo detectaría.

### 2.4 Posicionamiento vs alternativas

| Alternativa | Dónde gana | Dónde SGR gana |
|-------------|-----------|----------------|
| **Notion** | Colaboración, plantillas, ecosistema | Offline real, datos propios, finanzas AR de verdad, captura Telegram en 3 segundos, sin suscripción |
| **Obsidian** | Ecosistema de plugins, markdown portable, mobile | Módulos estructurados (Finanzas/Agenda/Hábitos con reglas de negocio, no plugins genéricos), API REST propia, bot |
| **YNAB / apps de finanzas** | Pulido comercial, conexión bancaria (EE.UU.) | MEP + inflación + FIRE en USD con aportes en ARS: el caso argentino que ninguna cubre; gratis; offline |
| **Habitica / Loop** | Gamificación / simplicidad mobile | Integración Hábitos↔Agenda↔Revisión semanal; check-in nocturno por Telegram |
| **Google Calendar + Excel** | Cero setup, ubicuidad | Un solo sistema con cross-links (tareas financieras en Agenda, hábitos en la grilla horaria), revisión semanal automática |

**Lectura honesta:** SGR no le gana a ninguna alternativa *en su vertical aislada*. Gana en la **intersección**: es el único sistema donde el gasto del súper, la nota del libro, el bloque de estudio y la racha de correr entran por el mismo bot, viven en el mismo SQLite tuyo, y se cruzan en una revisión semanal. Esa intersección + soberanía de datos + contexto argentino es la posición defendible. Como producto para terceros compite contra "gratis y ya lo uso"; como flagship personal y pieza de portfolio (AI/ML local + DevOps + producto real, la prioridad declarada en `PLAN-NEXTLEVEL.md`) no compite contra nadie.

---

## 3. Tesis de producto de alto valor

**SGR es el sistema operativo personal offline-first para una vida en Argentina: todo lo que capturás — plata, conocimiento, tiempo, hábitos — entra sin fricción (Telegram + LLM local), vive en tu propio SQLite, y se cruza en síntesis que ninguna app aislada puede darte.**

**Anti-metas (qué NO debe convertirse):**
- **No** un clon de Notion: nada de bases de datos genéricas, plantillas ni bloques arbitrarios. Los módulos tienen opinión.
- **No** un SaaS multi-usuario: sin auth compleja, sin tenancy, sin servidor público. El Commons Clause ya define la postura.
- **No** sync en tiempo real / CRDT: el modelo pull-al-abrir/push-al-cerrar con una canónica es correcto; hay que blindarlo, no reemplazarlo.
- **No** una plataforma de plugins: la extensibilidad es la API REST, no un marketplace.
- **No** feature-first: el próximo trimestre se gana en confiabilidad y polish, no en un quinto módulo (patrimonio puede esperar como tab de Finanzas).

---

## 4. Norte profesional (definición de "listo")

Checklist verificable. SGR se puede llamar "profesional" cuando todo esto es ✔:

**Confianza en los datos**
- [ ] Suite de tests de reglas de negocio: `isTransferencia`, `contribucionFire/USD`, `acumuladoPorCategoriaNombre`, proyección FIRE, `_recalcular_posicion` (PPC compra/venta/borrado), `calcStreak`/`isScheduled`/`calcMonthPct`, parser `$:` — corriendo en CI en cada push.
- [ ] Test de paridad JS ↔ Python para rachas y cajones (mismos fixtures, mismos resultados).
- [ ] 20 ciclos open/close de sync (con escrituras del bot intercaladas) sin pérdida: verificado por script que compara `/meta` counts antes/después.
- [ ] `/sync/import` rechaza el push si la canónica cambió desde el pull (guard de divergencia) y lo explica en la UI.
- [ ] Backup local automático diario + pre-migración, rotado (últimos 14), restaurable con un comando documentado.
- [ ] `schema_version` en la DB; migración solo corre hacia adelante, con backup previo y log de qué aplicó.

**Ingeniería mantenible**
- [ ] Un solo shape de movimiento en el frontend (dual schema eliminado, optimistic add alineado).
- [ ] Bug P0 de Hábitos (IDs offline) cerrado con patrón de reconciliación documentado y reutilizable.
- [ ] `main.py` partido en `APIRouter` por módulo; `useStore.js` partido en slices por módulo (misma API pública).
- [ ] CI: lint + tests backend + tests frontend + build Vite verde en cada push.

**Producto**
- [ ] Cero avisos legacy permanentes (migración `Ahorro` ejecutada, `GET /fin/emergencia` sin consumidores).
- [ ] Notificaciones unificadas funcionando en 2 canales (campana web + Telegram) para al menos 4 tipos de alerta.
- [ ] Onboarding: primer arranque con DB vacía guía la creación de la primera cuenta/categoría/hábito/lista en cada módulo.
- [ ] Búsqueda semántica accesible desde la UI (hoy solo existe por API/bot).

**Distribución**
- [ ] Versión visible en la UI (`v0.x · build YYYY-MM-DD`) + `CHANGELOG.md`.
- [ ] Build del `.exe` en un solo script que además invalida el service worker (adiós sección de troubleshooting de `BUILD.md`).
- [ ] Para terceros (si se publica): `git clone` → `.env` → `docker compose up -d` → funcionando, verificado en máquina limpia.

---

## 5. Plan por horizontes

Formato: **problema → acción → esfuerzo (S/M/L) → impacto → DoD.**

### 5.1 Horizonte 0 — Estabilizar (2–4 semanas)

1. **Regresiones numéricas invisibles → suite de tests de reglas de negocio + CI.**
   - Backend (pytest): fixtures de movimientos → `fin_*` en `crud.py` (reparto, PPC del ledger con compra/venta/edición/borrado, saldos derivados, recurrencia `_expand_recurring`). Frontend (vitest): `data/finanzas.js`, `habitosUtils.js`, `normalizeMovimiento`, `agendaUtils`. Bot: parser `$:` (fecha/cuotas/fuzzy). GitHub Actions con ambos.
   - **M** · **Impacto alto** · DoD: ≥40 casos, CI verde obligatorio, y al menos un test de paridad racha JS↔Python con fixtures compartidos (JSON).
2. **Push del sync puede pisar escrituras del bot → guard de divergencia.**
   - `GET /sync/export` devuelve (o acompaña con `/meta`) un hash/timestamp de la canónica; el launcher lo guarda en `.sync-last.json`; `POST /sync/import` recibe `expected_hash` y responde **409** si la canónica cambió desde el pull. UI del launcher: "El homelab tiene cambios nuevos (N movimientos). Opciones: descartar push / forzar (queda backup) / cancelar".
   - **S/M** · **Impacto alto** (elimina el único escenario de pérdida silenciosa) · DoD: test manual guiado — `/mov` por Telegram con el `.exe` abierto → cerrar → el push es rechazado con mensaje claro; 20 ciclos open/close con escrituras intercaladas sin pérdida (script de verificación por counts).
3. **Migraciones sin red → versionado + backup previo.**
   - Tabla `schema_version`; `init_db()` copia `app.db` → `backups/app.db.pre-migracion-<ts>` antes de aplicar cualquier migración pendiente; log de migraciones aplicadas. Rotación de backups (14).
   - **S** · **Impacto alto** · DoD: simular migración que lanza excepción → la DB original queda intacta y el backup existe; arranque normal no crea backups redundantes.
4. **Bug P0 Hábitos (IDs offline duplicados) → reconciliación mínima.**
   - Al reconectar: entidades con id `h_*`/`reg_*` se reintentan (POST real) y se reemplazan en el store; si el POST falla se marcan visualmente "sin sincronizar". Mismo patrón queda documentado para los otros slices.
   - **S/M** · **Impacto medio-alto** · DoD: crear hábito + registro con API caída → levantar API → refresh → una sola copia con id real; sin registros fantasma.
5. **Cajones frágiles por typo → higiene de categorías en el POST.**
   - Al crear movimiento: matching case-insensitive + trim contra categorías existentes antes de auto-crear; si no existe, crear con nombre normalizado (capitalización consistente). Exponer `GET /fin/movimientos/duplicados` (ya existe) como botón en Datos.
   - **S** · **Impacto medio** · DoD: `POST` con "comida" no crea categoría nueva si existe "Comida"; botón duplicados visible en `DatosTab`.

### 5.2 Horizonte 1 — Producto confiable (1–2 meses)

1. **Dual schema → un solo shape.**
   - Barrido de consumidores para eliminar fallbacks `type/amount/cat`; optimistic add produce shape API; `normalizeMovimiento()` queda solo en la frontera (si queda). Ya está en `Finanzas-Roadmap.md`; con la suite de H0 el refactor es seguro.
   - **M** · **Impacto alto** (baja el costo de todo lo que sigue) · DoD: `grep` de `\.amount|\.cat\b|type ===` en `components/finanzas` sin hits; tests verdes; smoke manual de las 5 tabs.
2. **Monolitos → corte mecánico sin rediseño.**
   - `main.py` → `app/routes/{boveda,finanzas,agenda,habitos,sync}.py` con `APIRouter` (las carpetas ya existen); `useStore.js` → slices por módulo combinados en un store (API pública idéntica, cero cambios en componentes). `crud.py` puede esperar o partirse igual de mecánicamente.
   - **M** · **Impacto medio** (previene, no agrega) · DoD: diff de rutas de OpenAPI antes/después vacío; app funciona igual; ningún archivo backend >800 líneas.
3. **Deuda legacy Finanzas → cerrarla, no administrarla.**
   - Job one-shot `POST /fin/migrar-ahorro-legacy` (ya propuesto en el roadmap) + dashboard calcula emergencia client-side desde `finMovimientosAll` (ya propuesto) → borrar `GET /fin/emergencia`. Merge de categorías (`PATCH` fusión) para limpiar duplicados históricos. Alinear `seed_demo.py` al modelo nuevo.
   - **M** · **Impacto medio-alto** (elimina avisos permanentes = percepción de producto terminado) · DoD: AhorroTab sin banner legacy; `/fin/emergencia` sin consumidores; `seed_demo.py` genera demo coherente con FIRE/objetivos.
4. **Notificaciones (Fase 3 del plan, pedida por los 4 roadmaps) → implementación unificada.**
   - Tabla `notificaciones_pendientes(modulo, ref_id, tipo, fire_at, canal, enviado, payload_json)`; scheduler en `lifespan` (`asyncio.sleep(60)`) — en homelab corre 24/7, en `.exe` evalúa al abrir; campana TopBar unificada (reemplaza la de Hábitos y el badge muerto de Finanzas); job del bot que entrega canal `telegram` con inline keyboard ✅/🕐/📖. Tipos iniciales: evento −15 min, tarea con fecha 09:00, hábito con hora, cuota próxima, dólar desactualizado, objetivo ≥90%.
   - **L** · **Impacto alto** (es la feature transversal que los roadmaps más repiten y cierra el loop del bot) · DoD: 6 tipos disparando en ambos canales; toggles en `/settings`; roadmaps de los 4 módulos actualizados quitando sus secciones de notificaciones.
5. **Distribución → build reproducible + identidad de versión.**
   - Script único `build.ps1` (pip install → npm ci → build → PyInstaller → bump de versión → invalidación SW); constante `SGR_VERSION` servida en `/meta` y visible en Settings; `CHANGELOG.md`.
   - **S** · **Impacto medio** (percepción de calidad + fin del troubleshooting de caché) · DoD: rebuild en un comando; tras rebuild, el navegador toma el bundle nuevo sin pasos manuales de DevTools.

### 5.3 Horizonte 2 — Alto valor / diferenciación (2–4 meses)

1. **El "wow" ya pagado → cobrarlo.**
   - (a) Toggle búsqueda semántica en `LeftPanel` (backend listo, Fase 5 pendiente solo de UI). (b) **Resumen semanal LLM** (Fase 6): `GET /resumen/semanal` agregando los 4 módulos + prompt de síntesis + sección en `RevisionTab` + `/semana` enriquecido. Es la materialización visible de la tesis (la intersección de módulos).
   - **M** · **Impacto alto** · DoD: domingo a la noche el bot manda un párrafo tipo "Completaste 4/5 hábitos, gastaste 18% más que tu promedio (delivery), ejecutaste 9h de 14h agendadas, guardaste 3 notas"; `RevisionTab` lo muestra con botón Regenerar.
2. **Sync en caliente → botón "Actualizar" en la UI.**
   - Con el guard de H0, un botón en TopBar que hace pull incremental de la canónica sin cerrar el `.exe` (re-pull + reload de slices). Mata el último "comportamiento aceptado" molesto de `SYNC-WINDOWS.md`.
   - **M** · **Impacto medio-alto** · DoD: `/mov` por Telegram → botón Actualizar → el movimiento aparece sin reiniciar; con cambios locales sin push, avisa antes.
3. **Soberanía de datos demostrable → export/import completo.**
   - Export global: ZIP con `app.db` + `uploads/` + JSON por módulo desde Settings; import Bóveda desde markdown/Obsidian; export CSV de hábitos (roadmap). Complementa el CSV de Finanzas ya existente.
   - **M** · **Impacto medio** (argumento central vs Notion; requisito si se publica) · DoD: botón "Exportar todo" produce un ZIP restaurable documentado; import de una carpeta de `.md` crea hojas con categorías.
4. **Cross-módulo profundo (roadmap Agenda) → FKs reales.**
   - `hoja_id` en `agenda_eventos` (vincular nota a evento), `movimiento_id` en `agenda_tareas` (tarea "pagar X" → movimiento). Los widgets de display ya existen; esto los vuelve navegables en ambos sentidos.
   - **M** · **Impacto medio** · DoD: desde un evento se abre su nota; al completar una tarea financiera se ofrece crear el movimiento con datos precargados.
5. **Pulido de percepción (selección de los roadmaps).**
   - Bóveda: zoom/pan del grafo (`d3-zoom`) + menú contextual (es el homepage: su polish define la primera impresión). Hábitos: vista anual GitHub-style. Agenda: menús contextuales restantes. FTS5 para búsqueda no-semántica.
   - **M** · **Impacto medio** · DoD por ítem en su roadmap; criterio global: ninguna interacción principal sin hover/contexto/teclado.

### 5.4 Horizonte 3 — Escala opcional (solo si se publica)

1. **Onboarding de terceros:** README raíz orientado a instalador (3 comandos, screenshots, badges — Fase 2 del plan), probado en máquina limpia por alguien que no sos vos. **M**.
2. **Instalador Windows real:** Inno Setup/NSIS sobre `dist/SGR/`, acceso directo, primera ejecución guiada; auto-update simple (check contra GitHub Releases + descarga manual). **M/L**.
3. **Hardening mínimo:** token opcional en toda la API (hoy solo en `/sync/*`), rate limit en endpoints de escritura, CORS de producción. **S/M**.
4. **Monetización ética compatible con Commons Clause:** el producto gratis (portfolio); ingresos por (a) GitHub Sponsors/donaciones, (b) "SGR Pro" con permiso comercial + soporte de instalación homelab (el Commons Clause lo permite: sos el titular), (c) plantilla/curso "tu segunda cabeza self-hosted" — el activo es el know-how de la intersección Ollama+Telegram+offline, no el código. **Decisión de producto, no de código.**
5. **i18n real del pitch:** si la audiencia es portfolio internacional, la doc de instalación en inglés; la app puede seguir siendo español-first (es parte de la identidad).

---

## 6. Roadmap técnico priorizado

1. **Testing (P0):** pytest + vitest + fixtures compartidos JS/Python + GitHub Actions. Prioridad de cobertura: ledger PPC → FIRE USD → reparto/cajones → rachas → parser bot → recurrencia Agenda.
2. **Sync/backups (P0):** guard de divergencia en `/sync/import` (409 + UI) → backups locales rotados (diario + pre-migración) → botón backup manual en Settings → (H2) pull en caliente.
3. **Migraciones (P0):** `schema_version` + backup pre-migración + log. Regla dura: ninguna migración nueva sin test que la ejecute sobre una DB fixture.
4. **Consistencia de datos (P1):** dual schema fuera; reconciliación de IDs offline (patrón único para los 4 slices); normalización de categorías en POST.
5. **Arquitectura (P1):** `APIRouter` por módulo; slices de Zustand por módulo; `crud.py` partido después. **No** React Query: el patrón optimista actual funciona y está asumido; migrarlo es riesgo sin dolor que lo justifique.
6. **Observabilidad (P1, liviana):** logging estructurado con niveles reales en vez de `DEBUG` binario; `GET /meta` ampliado (versión, schema_version, counts, último sync); log de errores del bot a archivo rotado.
7. **Build/release (P1):** `build.ps1` único + versión visible + changelog + fix definitivo del service worker.
8. **Notificaciones (P1):** tabla unificada + scheduler `lifespan` + dos canales (diseño de Fase 3; reemplaza las 4 secciones duplicadas de los roadmaps).
9. **Rendimiento (P2):** FTS5 en Bóveda; paginación `GET /hojas`; virtualización grilla Hábitos >25; selectores `useShallow` restantes. Nada de esto es urgente con un solo usuario.
10. **i18n/temas (P2):** ya están a nivel; solo mantener la convención (claves nuevas en `i18n.js`, contraste WCAG del amarillo parcial de Hábitos pendiente del roadmap).

## 7. Roadmap de producto/UX priorizado

1. **Confianza visible (P0):** banner de frescura ("Sincronizado con homelab hace 2 h · 1.243 movimientos"), estado de backup en Settings, versión visible. La confiabilidad de H0 hay que *mostrarla* para que valga como percepción.
2. **Cerrar heridas abiertas (P1):** migración `Ahorro` ejecutada (chau banner), emergencia client-side, seed demo coherente, `/capture` legacy eliminado o redirigido.
3. **Onboarding (P1):** primer arranque con DB vacía → cada módulo con empty state accionable ("Creá tu primera cuenta" → abre el form). Hoy existe en Hábitos; falta parejo en los cuatro. DoD: un usuario nuevo llega a su primer movimiento/hoja/tarea/hábito sin leer docs.
4. **Momentos wow (P1/P2, en orden):** resumen semanal LLM (el mayor) → búsqueda semántica en UI → pull en caliente → duplicados en Datos → check-in nocturno enriquecido con contexto del día (agenda+hábitos+gasto).
5. **Reducción de fricción diaria (P2):** `Ctrl+K` búsqueda global unificada (hoy hay tres búsquedas por módulo en TopBar); atajos avanzados pendientes de Finanzas (Vi/Ve, Ctrl+S en Datos); wizard de transferencias (gasto A + ingreso B en un paso); drag & drop de imagen en CaptureModal.
6. **Cohesión (P2):** menús contextuales completos (Agenda los tiene a medias, Bóveda no los tiene); mismo shell de modal en los 4 módulos (extender `AgendaModalShell`); FKs cross-módulo navegables.

## 8. Matriz de priorización

| Iniciativa | Impacto | Esfuerzo | Riesgo de hacerla | Prioridad |
|---|---|---|---|---|
| Tests reglas de negocio + CI | Alto | M | Bajo | **P0** |
| Guard de divergencia sync + verificación 20 ciclos | Alto | S/M | Bajo | **P0** |
| Backups locales + migraciones versionadas | Alto | S | Bajo | **P0** |
| Fix IDs offline Hábitos (bug P0 declarado) | Medio-alto | S/M | Bajo | **P0** |
| Higiene de categorías en POST + UI duplicados | Medio | S | Bajo | **P0** |
| Eliminar dual schema movimientos | Alto | M | Medio (mitigado por tests) | P1 |
| Notificaciones unificadas (2 canales) | Alto | L | Medio | P1 |
| Partir `main.py` / `useStore.js` (mecánico) | Medio | M | Bajo | P1 |
| Cerrar legacy (Ahorro, emergencia, seed) | Medio-alto | M | Bajo | P1 |
| Build script + versión visible + changelog | Medio | S | Bajo | P1 |
| Resumen semanal LLM (Fase 6) | Alto | M | Bajo | P1 |
| UI búsqueda semántica | Medio | S | Bajo | P1 |
| Pull en caliente ("Actualizar") | Medio-alto | M | Medio | P2 |
| Export/import global (ZIP, markdown) | Medio | M | Bajo | P2 |
| FKs cross-módulo (evento↔nota, tarea↔movimiento) | Medio | M | Bajo | P2 |
| Zoom/pan grafo + menús contextuales Bóveda | Medio | M | Bajo | P2 |
| Onboarding terceros + instalador (H3) | Alto*  | M/L | Bajo | P2 (*solo si se publica) |
| React Query / TypeScript / PostgreSQL | Bajo | L | Alto | Fuera |

## 9. Quick wins (10 o menos)

1. **Botón "Crear backup ahora" en Settings** — copia `app.db` con timestamp a `backups/`. 1 endpoint + 1 botón.
2. **Banner de frescura de datos** — "Sincronizado hace X · N movimientos" desde `.sync-last.json`/`/meta` en TopBar del `.exe`.
3. **Versión visible + `CHANGELOG.md`** — `SGR_VERSION` en `/meta` y en Settings. Cambia la percepción de "script" a "producto".
4. **Exponer `GET /fin/movimientos/duplicados` en Datos** — el endpoint ya existe; falta un botón.
5. **Matching case-insensitive al crear categoría en POST movimiento** — 5 líneas en `crud.py`, elimina cajones fantasma.
6. **Emergencia client-side en dashboard** — ya especificado en `Finanzas-Roadmap.md`; borra el último consumidor del endpoint deprecated.
7. **Toggle búsqueda semántica en LeftPanel** — backend completo (Fase 5); solo UI.
8. **`seed_demo.py` alineado al modelo nuevo** — la demo es la primera impresión para terceros y hoy contradice el modelo.
9. **Test de humo de sync como script** — `verify-sync.ps1` que compara counts de `/meta` local vs homelab tras pull/push (los comandos ya están escritos en `SYNC-WINDOWS.md` §Verificación).
10. **Batch de registros de Hábitos en el store** — el endpoint `POST /habitos/registros/batch` existe sin consumidor; usarlo al marcar varios en Agenda HOY.

## 10. Lo que conviene NO hacer ahora

- **Migrar a PostgreSQL** — ya descartado en `PLAN-NEXTLEVEL.md` con razón. SQLite + un escritor canónico es el diseño correcto para este producto.
- **React Query / invalidación centralizada** — el patrón optimista + try/catch está aplicado consistentemente en ~40 acciones y funciona offline. Migrarlo es semanas de riesgo para resolver un problema que no existe.
- **Reescritura a TypeScript** — valor real pero ROI malo hoy; los tests de H0 dan la mayor parte de la red de seguridad por una fracción del costo. Reconsiderar solo si el proyecto suma colaboradores.
- **Sync en tiempo real / CRDT / SQLite en red** — ya descartados en `SYNC-WINDOWS.md`. El guard de divergencia resuelve el problema real por el 5% del esfuerzo.
- **Quinto módulo (patrimonio, etc.)** — la tesis se demuestra cruzando los cuatro existentes, no sumando superficie. Patrimonio cabe como tab de Finanzas cuando toque.
- **Extensión Chrome (Fase 7)** — simpática pero es un iframe; no mueve ni confiabilidad ni diferenciación. Dejarla para después de H2.
- **Publicar/promocionar antes de H0+H1** — un tercero que pierda datos por el pisado del sync o una migración rota quema la única primera impresión.
- **Obfuscación / DRM** — ya descartado; la licencia resuelve.

## 11. Preguntas abiertas para el dueño del proyecto

1. **¿Cuál es el objetivo dominante a 6 meses: flagship personal, pieza de portfolio, o producto instalable por terceros?** Cambia el peso de H3 completo. `PLAN-NEXTLEVEL.md` dice "portfolio AI/ML primero"; este informe prioriza confiabilidad — si portfolio manda, el resumen semanal LLM y el README de instalación suben un puesto.
2. **¿Hubo ya algún incidente de pérdida/pisado de datos con el sync?** Define si el guard de divergencia es P0 (preventivo) o P0-urgente (correctivo).
3. **¿Los overrides FIRE viejos en ARS se migran, se borran o se ignoran?** Hoy quedan "desactualizados" silenciosamente dentro del plan — es un número financiero mostrado como válido.
4. **¿El homelab queda como requisito o el `.exe` standalone es un modo soportado de primera clase?** Afecta dónde corre el scheduler de notificaciones y si el banner de frescura es opcional.
5. **¿Ollama es infraestructura garantizada (siempre en el homelab) o opcional?** Si es garantizada, el resumen semanal puede ser push automático; si no, todo lo LLM queda "best effort" como hoy.
6. **¿La migración manual de la categoría `Ahorro` ya se hizo en tus datos reales?** Si sí, el job one-shot es solo para el seed/demo; si no, es P1 personal.
7. **¿Interesa monetizar (sponsors, permiso comercial, servicios) o el Commons Clause es puramente defensivo?** Define si H3.4 existe.
8. **Móvil:** ¿el bot de Telegram es la respuesta definitiva a mobile, o hay apetito futuro por PWA instalable? (Hay service worker ya; una PWA de captura sería el paso natural, pero es scope nuevo.)

## 12. Plan de 30 días (semana a semana)

**Semana 1 — Red de seguridad de datos.**
- Backup pre-migración + `schema_version` + rotación en `database.py` (día 1–2).
- Botón "Backup ahora" en Settings + backup diario al arrancar (día 2).
- Guard de divergencia: hash en `/sync/export`, `expected_hash` + 409 en `/sync/import`, manejo en `sgr-abrir.ps1` (día 3–4).
- `verify-sync.ps1` + prueba real: 20 ciclos open/close con `/mov` por Telegram intercalados (día 5). **Gate: cero pérdidas.**

**Semana 2 — Tests + CI.**
- pytest: ledger PPC (compra/venta/borrado/edición), reparto y cajones, saldos derivados, `_expand_recurring` (día 1–3).
- vitest: `data/finanzas.js` (isTransferencia, contribucionFireUSD, acumulado), `habitosUtils.js` (calcStreak con días no programados, calcMonthPct), `normalizeMovimiento` (día 3–4).
- Fixtures JSON compartidos para paridad racha JS↔Python; test del parser `$:` (día 4).
- GitHub Actions: lint + pytest + vitest + `npm run build` (día 5). **Gate: CI verde obligatorio de acá en adelante.**

**Semana 3 — Deuda que multiplica bugs.**
- Reconciliación de IDs offline en Hábitos + patrón documentado (día 1–2).
- Normalización de categorías en POST + botón duplicados en Datos (día 2).
- Eliminar dual schema: barrido de consumidores + optimistic add alineado, protegido por los tests de la semana 2 (día 3–5).

**Semana 4 — Percepción de producto.**
- Emergencia client-side + job one-shot migración `Ahorro` + `seed_demo.py` alineado (día 1–2).
- `build.ps1` único + `SGR_VERSION` en `/meta`/Settings + `CHANGELOG.md` + fix SW definitivo (día 3).
- Banner de frescura de sync en TopBar (día 4).
- Toggle búsqueda semántica en LeftPanel (día 5).
- Cierre: actualizar `README.md`/roadmaps (mover lo completado, disciplina existente) y decidir el arranque de H1 (recomendado: notificaciones unificadas o resumen semanal LLM según la respuesta a la pregunta 1).

**Resultado al día 30:** SGR no pierde datos ni silenciosamente ni por migración, sus números críticos están testeados en CI, la deuda que encarecía cada feature está cerrada, y el producto *muestra* su confiabilidad (versión, frescura, backups). Recién ahí tiene sentido invertir en el siguiente "wow".
