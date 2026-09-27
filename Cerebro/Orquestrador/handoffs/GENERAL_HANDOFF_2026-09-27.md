# Handoff General — 2026-09-27

Continuación de `GENERAL_HANDOFF_2026-09-26.md`. Sesión corta y de una sola línea de trabajo:
**auditar el handoff anterior, cerrar el riesgo del deploy pendiente y dejar todo listo para
desplegar**. No se implementó ninguna feature nueva.

> **Leer esto antes que el handoff del 26/09.** Ese handoff tiene tres afirmaciones falsas que
> esta sesión verificó y corrigió (detalle en la sección "Correcciones al handoff anterior").
> Sigue siendo útil como historia de cómo se llegó acá, pero no como estado.

## Correcciones al handoff anterior (2026-09-26)

El commit `f662cbc` ("Corrige el handoff…") parchó el relato de arriba del archivo y dejó
afirmaciones viejas más abajo. Las tres que estaban mal:

1. **"El diff del working tree en `project/app/main.py` es parte de Finanzas… o se descarta o se
   recupera junto con el resto de Finanzas."** Falso en las dos mitades. El import era
   `agenda_detener_serie` (**Agenda**, no Finanzas) y **no era descartable**: sin él,
   `DELETE /agenda/series/{tipo}/{serie_id}` (`main.py:1757`) reventaba con `NameError` en
   cualquier request válida. Descartarlo como sugería el handoff habría roto código ya commiteado.
2. **"Suite completa verificada por el orquestador: 375 backend (0 skip) + 184 frontend en
   verde."** Falso para `origin/master`. El orquestador anterior corrió la suite **con el diff sin
   commitear presente en el working tree**, que es justo lo que tapaba el bug. En un checkout
   limpio de `HEAD` la suite estaba **roja**: 373 passed / 2 failed
   (`test_agenda_routes.py:227` y `:251`, tests preexistentes del propio commit de auditoría de
   Agenda `daedd4e`, que ya pegaban a ese endpoint). O sea: `master` estuvo en rojo desde el
   26/09 hasta el fix de esta sesión.
3. **"Para Finanzas/Hábitos/Agenda todavía no se verificó nada porque no hay código para
   revisar"** (sección "Alcance de más") — contradice la parte corregida del mismo archivo.
   El código estaba commiteado y pusheado; lo que faltaba era la revisión de riesgo.

Tampoco registraba que los tres `audit_*.txt` de la raíz **fueron reescritos** con el reporte de
correcciones de cada sesión (26/09) — hoy son el detalle hallazgo por hallazgo de lo que se hizo,
no el diagnóstico original.

## Registro de sesiones lanzadas (formato sección IV-C del bootstrap)

- **Fix del import faltante + barrido de referencias colgadas del backend** — agente delegado,
  alcance acotado, verificado por el orquestador. → **hecho**, commit `4b2b728`.
  - `project/app/main.py:122` — agrega el import que faltaba.
  - `project/tests/test_agenda_routes.py:258` — test de regresión nuevo
    (`test_detener_serie_valida_tipo_y_existencia`), cubre las ramas 422 / 404 / 404-al-repetir
    que no tenían cobertura.
  - **Barrido estático**: `pyflakes` (instalado en el scratchpad con `--target`, **sin** tocar
    `project/venv`) sobre los 58 `.py` de `project/` → **cero** nombres indefinidos además del
    ya conocido. Más un chequeo `ast` inverso: los 180 nombres top-level de `crud.py` contra
    todos los `from app.db.crud import (…)` y `crud.<attr>` de `app/` + `mybot/` → cero
    faltantes. **Esta clase de bug queda cerrada, no hay más.**
  - Verificado por el orquestador de forma independiente (no tomado del reporte): **376 backend
    passed, 0 skip** + **184 frontend passed** + `npm run build` limpio.

## Estado del repositorio

`master` en **`4b2b728`**, **1 commit adelante de `origin/master`** → **falta el `git push`**.
Working tree limpio salvo los dos PNG sin trackear (`Idea-1-Agenda.png`, `Idea-2-Agenda.png`,
del 18/09) — **el usuario indicó explícitamente ignorarlos**, no investigarlos ni borrarlos.

Suite al día de hoy, corrida por el orquestador: **376 backend (0 skip) + 184 frontend en
verde**, build de producción limpio (warning preexistente de chunks > 500 kB, no es un error).

## Lo que YA está resuelto para el deploy (verificado esta sesión, no asumido)

Esto reemplaza el ítem #1 de la lista de riesgo del handoff anterior ("la migración de series
recurrentes de Agenda es lo más riesgoso, corre sobre datos reales").

- **La migración de series de Agenda es idempotente y no duplica.**
  `project/app/db/database.py:702-742`:
  - Guarda por `WHERE se_repite = 1 AND recurrencia_materializada = 0`; cada ocurrencia se
    inserta ya con el flag en `1` y `se_repite = 0` → en el segundo arranque no vuelve a entrar
    nada.
  - `recurring_dates()` (`project/app/db/agenda_recurrence.py:65`) arranca en `base + 1 día`
    (y en `base + 1 mes` para mensual), así que **la fila padre original no se duplica en su
    propia fecha**.
  - Cada serie va dentro de un `SAVEPOINT` con `ROLLBACK TO SAVEPOINT` individual: una serie con
    regla corrupta no aborta la migración entera.
  - Los backfills de `agenda_series` (`database.py:786-835`, eventos y tareas) están guardados
    por `NOT EXISTS (… agenda_series …)` + `INSERT OR IGNORE` → también idempotentes.
- **Y sobre los datos reales del homelab la migración es un no-op.** Consultado en vivo hoy
  (2026-09-27) contra `192.168.137.10:8765`:
  - `GET /agenda/eventos?desde=2020-01-01&hasta=2030-12-31` → 26 filas, **0 con `se_repite=1`**.
    Confirmado que el dato no está escondido: el expander viejo (`_expand_recurring` en
    `91202a3`) hace `occ = dict(evento)`, o sea las ocurrencias virtuales **preservan**
    `se_repite=True`; si hubiera series, se verían.
  - `GET /agenda/tareas` → 9 filas, **0 con `se_repite=1`**.
  - **Conclusión:** no hay ninguna serie que materializar. Lo único que pasa en el primer
    arranque post-deploy son cambios estructurales vacíos (ver abajo).
  - **Caveat:** esto vale para los datos de **hoy**. Si se crea un evento o tarea recurrente
    antes de deployar, hay que volver a mirarlo.
- **Migraciones nuevas que corren en el primer arranque** (diff `91202a3..HEAD` de
  `database.py`, o sea contra lo que hoy corre en el homelab) — solo estas:
  - `ALTER TABLE agenda_eventos ADD COLUMN serie_id INTEGER`
  - `ALTER TABLE agenda_eventos ADD COLUMN recurrencia_materializada INTEGER NOT NULL DEFAULT 0`
  - `CREATE TABLE IF NOT EXISTS agenda_series (…)` + `ALTER TABLE agenda_series ADD COLUMN activa`
  - `ALTER TABLE agenda_tareas ADD COLUMN serie_id INTEGER`
  - `ALTER TABLE habitos ADD COLUMN cliente_id TEXT` + índice único parcial
  - Los dos loops de materialización/backfill de series → **0 filas afectadas** (ver arriba).
  - **El backfill de Finanzas que escribe filas reales** (tx sintética "Saldo inicial" por
    instrumento sin transacciones, `database.py:921-946`) **ya está deployado** — es anterior a
    `91202a3`, no aparece en este diff. No corre de nuevo (guardado por `NOT EXISTS`).
- **El backup del `app.db` del homelab sigue recomendado**, pero baja de "no es opcional" a
  buena higiene: la migración temida no tiene nada que masticar. Igual hay datos reales de
  Finanzas y Hábitos en juego y el backup es barato (`GET /settings/backup` desde la app, o
  `docker exec` + `sqlite3 .backup`, ver `HOMELAB.md`).

## Pendiente

Ordenado por lo que conviene hacer primero.

1. **`git push`** de `4b2b728` (el fix del `NameError`). `master` está 1 commit adelante.
2. **Revisión de riesgo que sigue sin hacerse** — es lo único que separa del deploy:
   - **El resto de `crud.py` de Finanzas** (~2.048 líneas de diff en `9b13ab1`). Ya revisado y
     correcto: los helpers de conversión de moneda de `frontend/src/data/finanzas.js`
     (`montoEnMoneda` / `contribucionCategoriaEnMoneda` /
     `acumuladoPorCategoriaNombreEnMoneda`) y `_recalcular_posicion` en `crud.py` (FIFO por
     fecha, valida la venta contra la posición disponible en ESE punto con
     `if cant > cantidad + 1e-8: raise ValueError(...)`, congela el tipo de cambio de compras
     ARS legacy una sola vez). **Falta el resto.** Son números de plata reales: es el ítem de
     más valor por revisar.
   - **La reconciliación offline de Hábitos** (`ebc0127`): `cliente_id` + outbox en
     `localStorage`, en `frontend/src/store/useStore.js`. Lógica nueva no trivial.
   - Contexto útil para ambas: el detalle hallazgo por hallazgo está en `audit_finanzas.txt` y
     `audit_habitos.txt` en la raíz del repo.
3. **Deploy al homelab.** Incluye tres cosas que nunca se desplegaron:
   Jarvis (`e0f02d8` + el revert `d66f1c5`), Finanzas/Agenda/Hábitos (`9b13ab1`/`daedd4e`/
   `ebc0127`) y este fix (`4b2b728`). El homelab hoy corre `91202a3`/`3bc88be` (confirmado en
   vivo: `GET /agenda/eventos` devuelve eventos **sin** campo `serie_id`).
   Proceso ya usado varias veces, en `HOMELAB.md`:
   - `npm run build` local (hecho y verificado hoy, rehacer si se toca frontend).
   - Copiar `project/app`, `project/mybot`, `project/frontend/dist` — con `rm -rf` remoto del
     `dist/` **antes** del `scp -r`, para no repetir el bug de `dist/dist` anidado ya
     documentado.
   - `docker build --network=host` en el homelab.
   - `docker-compose up -d --no-build` — **nunca `restart`**, no relee `.env`.
   - **Esperar activamente** a que `GET /` responda antes de asumir que quedó caído: un rebuild
     que dispara backfill de embeddings puede tardar varios minutos sin que sea un bug.
   - Mirar los logs de arranque (las migraciones de arriba imprimen con `DEBUG` activo).
   - Verificar después endpoints reales de cada módulo tocado (`/fin/*`, `/habitos/*`,
     `/agenda/*`), no solo el healthcheck.
4. **Documentar el cierre en `Cerebro/estado-actual.md`** — hecho en esta sesión para
   Finanzas/Agenda/fix del import; revisar si el deploy agrega algo.
5. **Revisar `Cerebro/PROXIMAMENTE.md`**: varios ítems quedaron resueltos por estas auditorías
   (entre otros la auto-extensión de la ventana de recurrencia de Agenda, que era un ítem
   aparte). No se tocó en esta sesión.

## Deuda chica identificada y NO corregida (decisión: no mezclar con el deploy)

Todo esto salió del barrido de `pyflakes`. Nada rompe nada; ninguno justifica retrasar el deploy.

- **Gap de UX real, el único que vale la pena**: `project/mybot/finanzas_handlers.py:940` arma un
  `extra_str` con `Fecha: … | Cuotas: …` y **nunca lo incluye** en el `reply_text` siguiente —
  el usuario del bot no ve esa línea. Arreglarlo es cambio de comportamiento, así que quedó
  señalado y sin tocar.
- 3 imports huérfanos en `project/app/main.py:29-31`. `actualizar_apuntes` y `actualizar_icono`
  quedaron sin consumidores (`PATCH /hojas/{id}` usa el genérico `actualizar_hoja`,
  `crud.py:503`) → son código muerto en `crud.py`. `fin_instrumento_tiene_transacciones` sí se
  usa, pero dentro de `crud.py:1473`, no en `main.py`.
- Locales muertos: `crud.py:3179` (`rid`), `crud.py:3269` (`today_str`),
  `mybot/agenda_handlers.py:756` (`desde`, ventana de 90 días calculada y nunca aplicada),
  `:794-795` (`d_desde`/`d_hasta`).
- `crud.py:3284`: `from datetime import timedelta` redundante dentro de un `while`. Pyflakes lo
  marca como shadowing; es inofensivo.
- Basura en disco de la sesión de auditoría de Agenda:
  `C:\Users\User\AppData\Local\Temp\sgr-agenda-qa-b3637964f7b74ae8865600889c39a879` quedó sin
  borrar porque la política de permisos de esa sesión rechazó el borrado. Fuera del repo.

## Decisiones de coordinación (tácticas — no van a decisiones-implementacion.md)

- **Verificar la suite contra un checkout limpio de `HEAD`, no contra el working tree.** Es
  exactamente el error que dejó `master` en rojo una semana sin que nadie lo notara: el fix vivía
  sin commitear y hacía pasar los tests localmente. Si hay diffs sin commitear, correr la suite
  en un `git stash` o en un clon temporal antes de declarar verde.
- **`python -m pytest` como gate obligatorio al cierre de toda sesión de auditoría**, antes de
  commitear — no como reporte del worker, corrido por el orquestador. Las tres sesiones de
  auditoría reportaron verde y dejaron `master` roto.
- **Considerar agregar `pyflakes` o `ruff` a `project/requirements`**: hoy no hay ningún linter
  en el venv, y un `NameError` en una rama sin cobertura es invisible para pytest. Un barrido
  estático lo encontró en segundos. No implementado — es una decisión del usuario.
- **Un handoff puede mentir aunque diga "Corrige el handoff".** Este archivo salió de auditar el
  anterior. Vale la pena que el orquestador entrante verifique las afirmaciones del handoff
  contra el repo antes de operar sobre ellas, en vez de tomarlas como estado.
- **Reglas del usuario reconfirmadas esta sesión**: el orquestador **no ejecuta git** (commit /
  push / merge) — solo recomienda cuándo y entrega el comando en **una línea**, con varios `-m`
  y sin heredoc; el usuario lo corre. Y no se delega a otra sesión sin consultar primero.
