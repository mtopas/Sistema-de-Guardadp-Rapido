# Sincronización homelab ↔ Windows (.exe)

## Problema a resolver

**Desincronización de la base de datos:** el mismo producto (SGR) opera sobre **dos archivos SQLite distintos** que divergen con el uso normal.

| Copia | Quién escribe | Ruta típica |
|-------|----------------|-------------|
| **Canónica (homelab)** | Bot de Telegram → API `backend` en Docker | `~/project/database/app.db` |
| **Local (Windows)** | `SGR.exe` (y uvicorn en dev) | `project/database/app.db` |

No hay un mecanismo automático que mantenga ambas copias alineadas. Cada captura por Telegram, cada edición en el `.exe` y cada prueba en desarrollo puede actualizar **solo un lado**. El usuario ve datos distintos según abra Telegram, el ejecutable o la app en otro entorno — sin que ningún componente avise explícitamente de que están viendo versiones diferentes del mismo sistema.

Síntomas habituales (todos son la misma causa):

- Un movimiento hecho con `/mov` **no aparece** en Finanzas del `.exe`.
- Algo guardado en el `.exe` **no lo ve** el bot hasta que alguien copie `app.db` a mano.
- Tras un tiempo sin `scp`, **no se sabe cuál copia es la más reciente** ni cuál debería mandar.
- Copiar en el momento equivocado (con el `.exe` abierto o con el `backend` del gabinete escribiendo) **empeora** el desorden o arriesga corrupción.

El problema de fondo **no** es de red ni de timeouts del bot: es **arquitectónico** — dos réplicas sin flujo de sincronización definido. La solución que se busca aquí es un **proceso claro y repetible** (cuándo bajar, cuándo subir, cuál copia manda) para que homelab y Windows vuelvan a representar **un solo estado** de la app, sin exigir una sola máquina ni una DB compartida por red.

---

Especificación del flujo acordado: **base de datos canónica en el homelab**, réplica local para el ejecutable, **pull al abrir** con UI “Sincronizando…”, **push opcional al cerrar**, y **sandbox efímero** para desarrollo.

---

## Objetivo final

| Prioridad | Qué debe lograr el usuario |
|-----------|---------------------------|
| **1 — Producción** | Abrir `SGR.exe` y ver la misma data que dejó el bot de Telegram (movimientos, Bóveda, Agenda, Hábitos), con una espera corta y clara al inicio. |
| **2 — Sin uvicorn 24/7 en Windows** | La PC no mantiene la API encendida todo el día; el gabinete corre `backend` + `bot` de forma continua. |
| **3 — Desarrollo aislado** | Al levantar `uvicorn` + `npm run dev`, trabajar sobre una **copia** de la DB que se **destruye** al apagar dev, sin tocar `app.db` de producción local. |
| **4 — Reglas simples** | Una sola fuente de verdad (homelab). Sin locks distribuidos ni SQLite en red compartida. |

**No es objetivo (por ahora):** sincronización en tiempo real mientras el `.exe` está abierto; push automático homelab → PC en background; una sola DB montada por SMB entre máquinas.

---

## Contexto del sistema actual

### Arquitectura de datos

```
Telegram  →  bot (Docker homelab)  →  HTTP  →  backend (Docker homelab)  →  SQLite
                                                      │
                                                      │  ~/project/database/app.db  (CANÓNICO)
                                                      │
Windows   →  SGR.exe (uvicorn embebido)  →  SQLite  →  project/database/app.db  (RÉPLICA)
```

- El bot **nunca** abre SQLite; solo llama a `API_BASE_URL`.
- El `.exe` **sí** abre SQLite local vía `DB_PATH` / `app/paths.py`.
- Vite en dev (`:5173`) habla con la API en `:8765`; no toca la DB directamente.

### Modo de despliegue elegido

**Modo A — stack completo en homelab** (`docker-compose.yml`):

- Servicios: `backend` + `bot`.
- En `~/project/.env` del gabinete: `API_BASE_URL=http://backend:8765`.
- **No** usar `docker-compose.bot-only.yml` (ese modo exige uvicorn en Windows siempre).

### Red

- ICS: Windows `192.168.137.1`, Ubuntu `192.168.137.10`.
- Sync por `scp`/`ssh` entre gabinete y PC (misma red que ya usás para deploy).

### Rutas de datos en Windows

| Escenario | SQLite | Uploads |
|-----------|--------|---------|
| `.exe` desde repo (`project/dist/SGR/`) | `project/database/app.db` | `project/uploads/` |
| `.exe` portable (solo `dist/SGR` copiado) | `../SGR-data/database/app.db` (al lado del exe) | `../SGR-data/uploads/` |

Override: `SGR_DATA_DIR`, `DB_PATH` (ver `app/paths.py`, `BUILD.md`).

---

## Experiencia por rol

### Usuario — abrir SGR (producción)

1. Doble clic en **“Abrir SGR”** (launcher), no en `SGR.exe` a pelo.
2. Ventana o consola: **“Sincronizando con el homelab…”** (5–20 s según red y tamaño de DB).
3. Si OK → se abre `SGR.exe` como hoy (ventana de control + navegador en `http://127.0.0.1:8765/`).
4. Trabaja con datos actualizados respecto al último uso del bot.
5. Al **Salir** / cerrar ventana de control:
   - Si la sesión **modificó** datos (flag o pregunta): **“¿Subir cambios al homelab?”** → push + reinicio breve de `backend` en gabinete.
   - Si solo consultó: cerrar sin push.

**Mientras el `.exe` está abierto:** lo que guarda el bot en Telegram **no aparece** en la app hasta la próxima sincronización al abrir (comportamiento aceptado; opcional futuro: botón “Actualizar”).

### Usuario — bot Telegram

- Sigue funcionando con el homelab encendido, sin Windows.
- Escribe siempre en la DB canónica del gabinete.

### Desarrollador — modo dev

1. `dev-start` (script): copia `app.db` → `database/app.db.dev`, exporta `DB_PATH` a la copia, levanta uvicorn.
2. `npm run dev` en otra terminal (sin cambios; `VITE_API_URL` default `127.0.0.1:8765`).
3. Pruebas, migraciones, roturas de datos → solo afectan `.dev`.
4. `dev-stop`: apaga uvicorn, **borra** `app.db.dev` (y WAL/SHM si existen).

La copia dev puede generarse desde el `app.db` ya sincronizado (réplica local), no hace falta pegarle al homelab en cada dev-start.

---

## Diseño técnico del sync (pull / push)

### Principios

1. **Un escritor canónico** en el homelab (`backend` + bot).
2. **Nunca** copiar encima de `app.db` mientras `SGR.exe` la tiene abierta.
3. Copia segura: parar `backend` unos segundos **o** usar backup SQLite online (fase 2).
4. Incluir **`uploads/`** en push/pull si hay fotos en Bóveda (mismo criterio de “sesión modificada”).
5. Opcional: **`database/chroma/`** si usás búsqueda semántica (excluido de git; decidir si sync incremental o reindex en destino).

### Pull (homelab → Windows) — al abrir `.exe`

```
[Windows launcher]
    │
    ├─ ping / ssh homelab OK?
    ├─ ssh: docker compose stop backend   (bot puede seguir; ideal stop backend solo)
    ├─ scp: mtopas@192.168.137.10:~/project/database/app.db → local app.db
    ├─ scp: uploads/ (rsync -a o scp -r, según tamaño)
    ├─ ssh: docker compose start backend
    ├─ opcional: curl homelab /meta y guardar snapshot en .sync-last.json (counts, fecha)
    └─ Start-Process SGR.exe → Wait-Process → [push si hubo cambios]
```

**Archivos locales auxiliares (propuesta):**

| Archivo | Uso |
|---------|-----|
| `database/.sgr-session.json` | `{ "dirty": true, "opened_at": "..." }` — el launcher marca dirty si hubo push pendiente |
| `database/.sync-last.json` | Último `/meta` tras pull exitoso (debug y mensaje “actualizado hasta…”) |
| `database/app.db.bak` | Backup automático antes de cada pull |

### Push (Windows → homelab) — al cerrar con cambios

```
[Windows launcher, tras cerrar SGR.exe]
    │
    ├─ si no dirty → fin
    ├─ confirmación usuario (Sí/No)
    ├─ ssh: docker compose stop backend
    ├─ scp: local app.db → homelab ~/project/database/app.db
    ├─ scp/rsync: uploads/ → homelab
    ├─ ssh: docker compose start backend
    └─ limpiar dirty
```

### Fallos

| Caso | Comportamiento |
|------|----------------|
| Homelab inalcanzable | Avisar; ofrecer abrir `.exe` con **DB local anterior** (modo offline) o cancelar |
| `backend` no para | Timeout; abortar pull, no sobrescribir local |
| Push rechazado por usuario | Mantener réplica local; homelab sigue con versión vieja (usuario debe saberlo) |

---

## Componentes a implementar (roadmap)

### Fase 1 — Scripts Windows (MVP)

| Script | Responsabilidad |
|--------|-----------------|
| `scripts/sync-config.ps1` | Variables: `HOMELAB_HOST`, `HOMELAB_USER`, rutas `SGR_DATA_DIR`, ruta al `.exe` |
| `scripts/sgr-sync-pull.ps1` | Stop backend remoto → scp `app.db` + uploads → start backend → backup local |
| `scripts/sgr-sync-push.ps1` | Stop → scp subida → start |
| `scripts/sgr-abrir.ps1` | UI “Sincronizando…” → pull → lanza `SGR.exe` → wait → push opcional |
| `scripts/dev-start.ps1` | Copia a `app.db.dev`, `$env:DB_PATH`, uvicorn |
| `scripts/dev-stop.ps1` | Mata uvicorn, elimina `app.db.dev` |

Acceso directo en el escritorio → `sgr-abrir.ps1`.

### Fase 2 — Robustez

- Endpoint `GET /sync/export` en FastAPI que devuelve backup SQLite (`sqlite3 backup` o `VACUUM INTO`) sin parar Docker manualmente desde Windows.
- `rsync` para `uploads/` en lugar de scp completo.
- Detección “dirty” sin preguntar (hash mtime de `app.db` antes/después de sesión).

### Fase 3 — UX en el `.exe` (opcional)

- Integrar mensaje “Sincronizando…” en `run_sgr.py` pre-arranque (requiere recompilar con PyInstaller).
- O launcher en C# / tray icon — solo si scripts no alcanzan.

---

## Archivos del repo para leer (mapa de contexto)

### Despliegue y red

| Archivo | Por qué |
|---------|---------|
| [`HOMELAB.md`](../HOMELAB.md) | Modos A/B/C, ICS, `scp`, firewall, dos DBs |
| [`project/docker-compose.yml`](docker-compose.yml) | Stack canónico `backend` + `bot` |
| [`project/docker-compose.bot-only.yml`](docker-compose.bot-only.yml) | **Evitar** para este diseño |
| [`project/Bot.md`](Bot.md) | Bot → API, no SQLite |
| [`project/LevantarDev.txt`](LevantarDev.txt) | Uvicorn local (solo dev) |

### Datos y ejecutable

| Archivo | Por qué |
|---------|---------|
| [`project/app/paths.py`](app/paths.py) | `data_root()`, `resolve_db_path()`, portable `SGR-data/` |
| [`project/app/config.py`](app/config.py) | `DB_PATH`, `SGR_DATA_DIR`, `API_BASE_URL` |
| [`project/app/db/database.py`](app/db/database.py) | Conexión SQLite, `init_db()` |
| [`project/run_sgr.py`](run_sgr.py) | Arranque `.exe`, puerto 8765, ventana Salir |
| [`project/BUILD.md`](BUILD.md) | Dónde queda `app.db`, variables de entorno |
| [`project/sgr.spec`](sgr.spec) | Build PyInstaller (si se integra sync al exe) |

### API / diagnóstico

| Archivo | Por qué |
|---------|---------|
| [`project/app/main.py`](app/main.py) | `GET /meta` (verificar counts tras sync) |
| [`project/app/db/crud.py`](app/db/crud.py) | Mutaciones; referencia si se agrega `/sync/export` |

### Bot

| Archivo | Por qué |
|---------|---------|
| [`project/mybot/bot.py`](mybot/bot.py) | Healthcheck, `API_BASE`, arranque |
| [`project/mybot/api_config.py`](mybot/api_config.py) | Resolución de `API_BASE_URL` |

### Frontend dev

| Archivo | Por qué |
|---------|---------|
| [`project/frontend/src/config.js`](frontend/src/config.js) | `API_URL` → `:8765` en dev |

### Config de ejemplo

| Archivo | Por qué |
|---------|---------|
| [`project/.env.example`](.env.example) | `API_BASE_URL`, `DB_PATH`, homelab vs local |

### Guía agentes

| Archivo | Por qué |
|---------|---------|
| [`CLAUDE.md`](../CLAUDE.md) | Puertos, arquitectura global |

---

## Configuración recomendada (checklist)

### Homelab (`~/project/.env`)

```env
API_BASE_URL=http://backend:8765
TELEGRAM_BOT_TOKEN=...
# BOT_ALLOWED_CHAT_IDS=...
```

```bash
cd ~/project
sudo docker compose up -d
```

### Windows (`project/scripts/sync-config.ps1` o perfil usuario)

```powershell
$HomelabHost = "192.168.137.10"
$HomelabUser = "mtopas"
$HomelabProject = "~/project"
$SgrExe = "D:\Sistema-de-Guardadp-Rapido\project\dist\SGR\SGR.exe"
$SgrDataRoot = "D:\Sistema-de-Guardadp-Rapido\project"  # contiene database/ y uploads/
```

### SSH

- Clave pública Windows → `~/.ssh/authorized_keys` en homelab (sin password en scripts).
- Probar: `ssh mtopas@192.168.137.10 "cd ~/project && sudo docker compose ps"`

---

## Reglas de uso (para no desincronizar)

1. **Abrir producción** siempre con `sgr-abrir.ps1` (pull).
2. **Editar en `.exe`** y cerrar → subir si preguntó (push).
3. **No** correr `docker-compose.bot-only` + `.exe` local a la vez sobre dos DB distintas.
4. **Dev:** solo `app.db.dev`; nunca editar producción local y homelab en paralelo sin push/pull consciente.
5. Tras **migración de schema** en dev: aplicar migración en homelab (deploy backend nuevo + un pull), no copiar `.dev` a producción.

---

## Verificación

```powershell
# Tras pull, antes de abrir exe (API local apagada):
Get-Item project\database\app.db | Select LastWriteTime, Length
```

```bash
# En homelab:
curl -s http://127.0.0.1:8765/meta
```

Comparar `counts.fin_movimientos`, `counts.hojas` entre ambos lados justo después de pull/push.

---

## Alternativas descartadas (referencia)

| Idea | Motivo de descarte |
|------|-------------------|
| Modo B (bot → API en Windows 24/7) | Obliga uvicorn siempre en PC |
| Push homelab → PC en cada cambio | PC debe estar on; riesgo de pisar `.exe` abierto; más infra (SMB/SSH inverso) |
| SQLite en carpeta compartida | Corrupción en red |
| Solo frontend apuntando a homelab | No cubre el `.exe` (objetivo principal) |
| Lock distribuido entre dos archivos | No unifica datos; solo reduce escrituras simultáneas |

---

## Relación con documentación existente

- Actualizar [`HOMELAB.md`](../HOMELAB.md): Modo A + sync Windows como flujo recomendado para `.exe`.
- Mantener Modo B documentado como legado / no recomendado si usás `.exe` local.

---

## Próximo paso de implementación

1. Crear `scripts/sync-config.ps1` con rutas reales del usuario.
2. Implementar `sgr-sync-pull.ps1` / `sgr-sync-push.ps1` con `ssh` + `scp`.
3. Implementar `sgr-abrir.ps1` con `Write-Host` / ventana de progreso.
4. Implementar `dev-start.ps1` / `dev-stop.ps1`.
5. Probar ciclo: movimiento por bot → pull → visible en `.exe` → edición en `.exe` → push → visible en bot.
