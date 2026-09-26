# Handoff General — 2026-09-26

Continuación directa de `GENERAL_HANDOFF_2026-09-21.md`. Sesión muy larga: triage del informe
de julio, laboratorio Jarvis-Research auditado y cerrado, deploy del feedback button, rediseño
completo de Settings, `DetailScreen` con edición completa (título/ícono/color/categoría/apuntes),
los 7 quick wins del triage de julio, fix del dual schema de movimientos, arreglo del token de
Telegram (con un bug real de doc encontrado en el camino: `docker-compose restart` no relee
`.env`), auditoría genérica de Jarvis (24 hallazgos, corregidos y deployados, con una corrección
mía sobre el hallazgo #18 que violaba el patrón strangler), y auditoría de los 4 módulos
restantes (Bóveda cerrada y deployada; Finanzas/Hábitos/Agenda con reportes de corrección pero
**código no recuperable todavía**, ver más abajo).

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Triage `SGR-Informe-Siguiente-Nivel.md` (julio 2026)** — verificado ítem por ítem contra el
  código real. Premisa de "cero tests" ya no aplicaba; el resto de la deuda (monolitos, cajones
  por typo, migraciones, dual schema, quick wins) se volcó a `PROXIMAMENTE.md` con evidencia. 7
  quick wins implementados después en tanda aparte (3 commits: `8317089`, `502c18d`, `3652bef`).
  Archivo original + verificación borrados una vez volcado el contenido.
- **Laboratorio Jarvis-Research** (`D:\Proyectos\Investigacion\Jarvis-Research\`, no
  `D:\Jarvis-Research\` como decía la doc vieja) — dado por perdido en el handoff anterior por
  buscar en la ruta equivocada; auditado a fondo, ola 1 completada (7/7 dossiers), 1 ADR
  (routing de agentes/modelos) anotado en `PROXIMAMENTE.md` sin implementar. Ola 2 sigue sin
  arrancar, sin decisión de retomarla.
- **Deploy feedback button + rediseño de Settings + DetailScreen completo + 7 quick wins + fix
  dual schema** — todo verificado (tests + build) y deployado al homelab, en varias tandas.
  Commits en `master` entre `12ef1b3` y `a09fa61` aprox (ver `git log`).
- **Fix token de Telegram** — el token estaba partido en dos entre `TELEGRAM_BOT_TOKEN` y
  `BOT_ALLOWED_CHAT_IDS` por un error de copiado; corregido. Bug de infra real encontrado:
  `docker-compose restart` no aplica cambios de `.env` (usa el entorno cacheado del último
  `up`), hay que usar `docker-compose up -d --no-build <servicio>` — documentado en
  `HOMELAB.md` y en memoria.
- **Auditoría genérica de Jarvis** (prompt de solo lectura → 24 hallazgos, prioridad "alto":
  fuga de privacidad en `call_reason()` sin Privacy Gateway desde auditoría/consolidación/
  triage) — otra sesión implementó los 24 sin que se le pidiera (solo se pidió el #1), commit
  `e0f02d8`. Encontré y corregí un problema real en su fix del hallazgo #18: hacía que **todo
  el backend** abortara el arranque si Jarvis fallaba al inicializar, violando el patrón
  strangler declarado en `CLAUDE.md` — revertido, commit `d66f1c5` (Jarvis se deshabilita solo,
  el resto de SGR sigue funcionando). Deployado al homelab.
- **Auditoría de Bóveda** (27 hallazgos + 1 encontrado por la propia sesión) — implementada en
  dos tandas (`21c27c1`, `3bc88be`), revisadas diff por diff antes de commitear. **Al deployar
  la primera tanda, encontré un crash real en producción** (`TypeError` en `sincronizar_vault`,
  carrera entre requests concurrentes) — diagnosticado, arreglado con test de regresión, commit
  `91202a3`, redeployado y verificado. Bóveda queda **cerrada y deployada por completo**.
- **Auditoría de Finanzas/Hábitos/Agenda** — prompts entregados (con mis aclaraciones en
  MAYÚSCULAS sobre 3 puntos ambiguos: Agenda materializa ocurrencias como filas independientes
  con `serie_id` en vez de solo avisar; Hábitos no permite marcar días futuros; Hábitos extiende
  la grilla horaria en vez de restringir el horario del hábito). **Los tres reportes finales ya
  llegaron** (`audit_finanzas.txt`, `audit_habitos.txt`, `audit_agenda.txt`, todos fecha
  2026-09-26) describiendo correcciones completas con tests — pero **el código no está en
  ningún lugar accesible**: el working tree local casi no tiene cambios, y `git fetch` no trajo
  ninguna rama nueva de esas sesiones. Ver "Pendiente/bloqueado" abajo.

## Pendiente / bloqueado

- **Bloqueante real — recuperar el código de Finanzas/Hábitos/Agenda.** Los tres reportes
  (`audit_finanzas.txt`, `audit_habitos.txt`, `audit_agenda.txt`, todos en la raíz del repo)
  describen correcciones completas y verificadas (tests + build), pero el código vive solo en
  las sesiones/sandboxes que lo hicieron — no está commiteado en este checkout ni pusheado a
  `origin` (confirmado con `git status` y `git fetch` + `git branch -r`, 2026-09-26). Hay que
  volver a esas tres sesiones y pedirles explícitamente que **commiteen y pusheen** (a una rama
  propia, no a `master` directo — mismo patrón que las sesiones en la nube anteriores, ver
  `Cerebro/project_cloud_sessions_git_flow.md` en memoria). Una vez pusheadas: `git fetch` +
  revisar cada diff (con el mismo cuidado que se le dio a Bóveda, especialmente Finanzas por los
  cálculos de plata real y Agenda por la migración de series recurrentes que corre sobre datos
  reales al próximo arranque) + mergear + verificar (tests + build) + commitear la
  documentación + deployar al homelab.
- **Alcance de más, patrón repetido a tener en cuenta**: las tres sesiones (Jarvis, Finanzas,
  Hábitos, Agenda) resolvieron más de lo que se les pidió explícitamente (ver detalle en cada
  entrada arriba). Salió bien las veces que se pudo verificar (Jarvis, Bóveda) — para
  Finanzas/Hábitos/Agenda todavía no se verificó nada porque no hay código para revisar. No
  asumir que salió igual de bien solo porque los reportes son detallados.
- **Riesgo real conocido, todavía no aplicado**: la migración de series recurrentes de Agenda
  (hallazgo #2 de `audit_agenda.txt`) corre **una sola vez al arrancar la app**, convirtiendo
  series virtuales viejas en filas materializadas — sobre datos reales de producción. Cuando se
  recupere y despliegue ese código, tratarlo con el mismo cuidado que el bug de `sincronizar_vault`
  de Bóveda: mirar los logs de arranque del homelab de cerca, tener un backup fresco antes de
  reiniciar el backend con esa imagen.
- **Working tree local**: solo un diff mínimo y legítimo en `project/app/main.py` (reordena dos
  líneas de un dict + un import nuevo — parte de lo que describe `audit_finanzas.txt` punto 3,
  pero aislado, sin el resto del cambio). No commitear esto solo — o se descarta o se recupera
  junto con el resto de Finanzas.
- **Dos archivos sueltos en la raíz sin tocar**: `Idea-1-Agenda.png`, `Idea-2-Agenda.png`
  (18/09, sin relación con esta sesión — probablemente referencia visual del usuario para
  Agenda). No se investigaron, no se borraron.

## Decisiones de coordinación (no arquitectónicas, no van a decisiones-implementacion.md)

- **Nunca asumir que "ya está commiteado y pusheado" solo porque una sesión dice que terminó** —
  pasó varias veces esta sesión que el trabajo real vivía solo en un sandbox sin pushear.
  Siempre confirmar con `git status` + `git fetch` + `git branch -r` antes de decir que algo
  está listo para deploy.
- **`docker-compose restart` nunca aplica cambios de `.env`** — usar siempre
  `docker-compose up -d --no-build <servicio>` para eso. Ya documentado en `HOMELAB.md`.
- **Después de un `docker build` + `up -d` en el homelab, esperar activamente a que el backend
  responda antes de asumir que está caído** — un rebuild que dispara backfill de embeddings
  puede tardar varios minutos en volver a aceptar conexiones sin que sea un bug (visto en vivo:
  el fix de "indexar apuntes" de Bóveda cambió la firma de las 169 hojas existentes y forzó un
  reindexado completo al primer arranque).
- **El patrón "resolver más de lo pedido" en sesiones delegadas** viene funcionando bien cuando
  se verifica cada vez (tests + revisión de diff de las partes riesgosas antes de commitear) —
  no relajar esa verificación asumiendo que "esta vez seguro también salió bien".

## Estado del working tree al momento de este handoff

`master` en `origin/master` (`c4d6b76`), sin diferencia local/remoto salvo el diff menor de
`main.py` ya descripto arriba. Bóveda, Jarvis, el fix del token de Telegram y toda la
documentación de `Cerebro/` están al día. Finanzas/Hábitos/Agenda quedan como el trabajo real
pendiente de la próxima sesión.
