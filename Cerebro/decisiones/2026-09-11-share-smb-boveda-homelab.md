# Share SMB entre `D:\Boveda` (Windows) y el homelab (Ubuntu) — diseño y scripts listos, nada ejecutado

## Decisión

`D:\Boveda` se comparte por SMB desde Windows (usuario dedicado `sgr-homelab`, sin acceso a
"Todos") y se monta por CIFS en el homelab en `/mnt/boveda`, con persistencia real
(`/etc/fstab` + `_netdev` + `x-systemd.automount`) y un watchdog systemd que reintenta el mount
cada 60s si se cae — mismo patrón que `sgr-ensure-default-route` ya documentado en `HOMELAB.md`.
`docker-compose.yml` monta `/mnt/boveda:/app/boveda` en los 3 servicios y agrega
`VAULT_ROOT=/app/boveda`.

Scripts: `project/scripts/setup-boveda-smb-windows.ps1` (Windows, una vez, como admin),
`project/scripts/setup-boveda-cifs-homelab.sh` (homelab, una vez, con sudo),
`project/docker-compose.yml.boveda-smb.diff` (diff propuesto, no aplicado).

**Nada de esto se ejecutó todavía** — ni el share real en Windows, ni el mount en el homelab, ni
el diff de `docker-compose.yml`. Queda para el checkpoint final antes del deploy.

## Por qué

Reusa exactamente los mecanismos de resiliencia que este proyecto ya tiene probados
(`HOMELAB.md`: watchdog de systemd para la ruta default tras un corte de luz) en vez de inventar
un patrón nuevo — el mismo problema de fondo (la red del homelab depende de que Windows esté
lista) aplica también al mount del vault, así que la solución es la misma clase de watchdog.

## Riesgos dejados explícitos para decidir en el checkpoint (no resueltos acá)

1. **Mount no disponible al arrancar los contenedores**: si `/mnt/boveda` no está montado cuando
   corre `docker-compose up`, Docker hace bind-mount de una carpeta local vacía (no falla) — el
   backend arrancaría contra un vault vacío/inaccesible, sin error visible, y podría corromper el
   índice sincronizando "cero notas" como si fuera el estado real. Hay que decidir: ¿el backend
   debe verificar al arrancar que `VAULT_ROOT` tiene contenido esperado y negarse a arrancar si
   no, o alcanza con el watchdog del mount? No implementado.
2. **Precisión de `mtime` en CIFS**: los mounts CIFS suelen redondear a ~2 segundos (herencia de
   SMB), mientras NTFS nativo tiene ~100ns de precisión. Si dos escrituras caen en la misma
   ventana de 2s, la detección de cambios por `mtime` que ya usa `vault_indexer.py`/
   `app/vault/sync.py` podría dar un falso negativo (no reprocesar un archivo que sí cambió). No
   resuelto — alternativa sería sumar un hash de contenido como respaldo, no solo `mtime`.

## Alternativa descartada

Compartir con el usuario Windows normal del usuario (no uno dedicado) — se descartó por acotar el
blast radius: si las credenciales del mount se filtran o el homelab se compromete, un usuario
dedicado sin otros privilegios limita el daño posible, mismo principio de "blast radius chico" ya
usado en todo el diseño de Jarvis.

## Addendum (2026-09-14) — Riesgo 1 resuelto (código), Riesgo 2 aceptado como está (sin código)

**Riesgo 1 — implementado y verificado corriendo el código, no solo leído.** Función compartida
`ensure_vault_mounted()` en `project/app/vault/guard.py` (stdlib puro, sin depender de `jarvis` ni
de FastAPI, para no invertir la dependencia opcional que ya tiene `app/main.py` con el paquete
`jarvis` — ver docstring del archivo): verifica que existan las 6 carpetas estructurales del árbol
PARA (`00 - Sin categorizar` … `05 - Basura`) bajo la raíz dada; si falta alguna, imprime un error
claro a stderr y hace `sys.exit(1)`. Enganchada como primer paso, antes de cualquier otra cosa, en
los 3 entrypoints:
- `app/main.py::lifespan()` — antes de `init_db()`.
- `jarvis/worker/main.py::main()` — antes de `setup_observability()`/`init_db()`.
- `mybot/bot.py::main()` — antes del chequeo de `TELEGRAM_BOT_TOKEN`.

Verificado corriendo los 3 procesos reales (`uvicorn app.main:app`, `python -m jarvis.worker.main`,
`python mybot/bot.py`) con `VAULT_ROOT`/`JARVIS_BOVEDA_PATH` apuntando a una carpeta de scratch
vacía (simulando el mount roto) y `DB_PATH`/`JARVIS_DB_PATH` también redirigidos a scratch como red
de seguridad extra: los 3 se negaron a arrancar con el mensaje `[vault_guard] FATAL: ...` y exit
code != 0 (uvicorn: 3: "Application startup failed"; worker: 1; bot: 1, sin llegar siquiera al
chequeo de `TELEGRAM_BOT_TOKEN`). Corrida aparte contra el `D:\Boveda` real (`ensure_vault_mounted`
importado directo, sin arrancar el proceso completo) confirmó que pasa limpio, sin falsos
positivos. Confirmado por mtime que ni `D:\Boveda` real ni `app.db`/`jarvis.db` reales se tocaron
en ningún momento de esta verificación.

**Riesgo 2 — decisión: aceptado tal cual, sin fallback de hash de contenido todavía.** La
precisión de `mtime` en CIFS (~2s) vs. NTFS nativo (~100ns) puede dar un falso negativo si dos
escrituras al mismo archivo caen en la misma ventana de 2s — pero para uso personal (un usuario,
sin escritura concurrente real desde múltiples fuentes al mismo archivo) es un caso de borde de
frecuencia muy baja. No se implementa un hash de contenido como respaldo de `mtime` en esta sesión
— sería complejidad especulativa sin un caso real que la justifique todavía (mismo criterio que ya
usó la sesión de Milestone 1 para descartar el schema "Opción A" sin consumidor).

**Criterio explícito para revisar esto** (no antes): si alguna vez se confirma un caso real de una
nota que se editó y el índice (`vault_indexer.py` / `app/vault/sync.py`) no detectó el cambio por
esta ventana de `mtime`, ahí sí vale la pena sumar el hash de contenido como respaldo. Sin un caso
confirmado, implementarlo ahora sería resolver un problema que todavía no pasó.

Alcance de esta sesión: acotado a los 2 riesgos de arriba. No se ejecutó el deploy real — no se
activó el share de Windows, no se montó CIFS en el homelab, no se tocó `docker-compose.yml` real,
no se reiniciaron contenedores. Eso sigue pendiente para el checkpoint final (sesión aparte).
