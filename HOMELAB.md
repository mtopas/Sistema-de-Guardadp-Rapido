# Homelab SGR — Cheatsheet y referencia

Gabinete Ubuntu con **backend + bot** en Docker. API en **`:8765`** (no `:8000`).

### ⚠️ Dos bases de datos (causa típica: “el bot guardó pero no lo veo en Finanzas”)

| Dónde corrés | API que usa | Archivo `app.db` |
| :--- | :--- | :--- |
| **Vite en Windows** (`npm run dev`) | `http://127.0.0.1:8765` | `project/database/app.db` en la PC |
| **Bot en Docker (homelab)** | `http://backend:8765` en el gabinete | `~/project/database/app.db` en Ubuntu |

Son **dos SQLite distintas** que se sincronizan con los scripts de `project/scripts/`. La **canónica** vive en el homelab; Windows mantiene una **réplica** local para el `.exe`. Especificación completa en [`project/SYNC-WINDOWS.md`](project/SYNC-WINDOWS.md).

---

### Sync homelab ↔ Windows

Stack homelab: `backend` + `bot` en Docker, siempre encendidos. El `.exe` en Windows sincroniza al abrir y al cerrar usando los scripts de `project/scripts/`.

**Prerrequisito único: clave SSH sin contraseña** (para scp de uploads):

```powershell
# En Windows — generar clave si no existe
ssh-keygen -t ed25519 -C “sgr-sync”
# Copiar al homelab
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh mtopas@192.168.137.10 “mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys”
# Verificar (debe conectar sin pedir contraseña)
ssh mtopas@192.168.137.10 “echo OK”
```

**Configurar `project/scripts/sync-config.ps1`** (una vez):

```powershell
$HomelabHost    = “192.168.137.10”   # IP del gabinete
$HomelabUser    = “mtopas”
$HomelabProject = “~/project”
$SgrExe         = “D:\Sistema-de-Guardadp-Rapido\project\dist\SGR\SGR.exe”
$LocalDataRoot  = “D:\Sistema-de-Guardadp-Rapido\project”
$SyncToken      = “”                  # Igual al SGR_SYNC_TOKEN en .env del homelab (si se configuró)
```

**Flujo de uso diario:**

```
Doble clic en acceso directo → sgr-abrir.ps1
  ├─ Pull: GET http://homelab:8765/sync/export → app.db local   (sin parar Docker)
  ├─ Lanza SGR.exe → trabaja normalmente
  └─ Al cerrar: si la DB cambió (SHA-256) → “¿Subir cambios?” → POST /sync/import
```

**Scripts disponibles:**

| Script | Uso |
| :--- | :--- |
| `sgr-abrir.ps1` | Launcher completo (pull → exe → push opcional). Poner como acceso directo. |
| `sgr-sync-pull.ps1` | Solo pull manual (si querés actualizar sin abrir el exe). |
| `sgr-sync-push.ps1` | Solo push manual (si cerraste sin hacer push). |
| `dev-start.ps1` | Sandbox de desarrollo: copia DB a `.dev`, levanta uvicorn aislado. |
| `dev-stop.ps1` | Limpia archivos `.dev` si `dev-start` terminó de forma abrupta. |

**Desarrollo local** (para modificar el código):

```powershell
# Terminal 1 — uvicorn aislado en app.db.dev (nunca toca la DB de producción local)
.\project\scripts\dev-start.ps1   # Ctrl+C para parar; limpia .dev automáticamente

# Terminal 2 — frontend
cd project\frontend && npm run dev
```

**Verificar sync tras pull:**

```powershell
# Compara counts locales vs homelab
curl -s http://127.0.0.1:8765/meta    # local (con exe corriendo)
curl -s http://192.168.137.10:8765/meta  # homelab
```

**Backup automático en el homelab:** antes de cada push (POST /sync/import), el servidor crea `database/app.db.bak.<timestamp>`. Para limpiar backups viejos:

```bash
# En el homelab
ls ~/project/database/app.db.bak.*
rm ~/project/database/app.db.bak.<timestamp_viejo>
```

---

## Cheatsheet rápido

### Acceso SSH

```powershell
ssh mtopas@192.168.137.10
```

Usuario: `mtopas` · IP fija objetivo: **`192.168.137.10`**

---

### Editar archivos en el servidor (`nano`)

Ejemplos: `.env`, netplan, configs en `~/project/`.

```bash
nano ~/project/.env
```

| Acción | Atajo |
| :--- | :--- |
| **Guardar** | `Ctrl + O`, luego `Enter` (confirma el nombre del archivo) |
| **Salir** | `Ctrl + X` |
| **Guardar y salir** | `Ctrl + O` → `Enter` → `Ctrl + X` |
| **Salir sin guardar** | `Ctrl + X` → cuando pregunte *Save modified buffer?*, pulsá `N` |
| **Cancelar** (si te equivocaste) | `Ctrl + C` |

Al pie de la pantalla nano muestra `^O Write Out` y `^X Exit` (`^` = tecla **Ctrl**).

Si el archivo no existía, nano lo crea al guardar.

---

### Desde Windows — ir al repo

En **CMD**, para cambiar a otro disco hace falta `/d`:

```cmd
cd /d D:\Sistema-de-Guardadp-Rapido
```

En **PowerShell**:

```powershell
cd D:\Sistema-de-Guardadp-Rapido
```

---

### Actualizar código en el servidor

El contenedor **no** lee tu PC: primero copiás, después rebuild en el gabinete.

**1. Copiar (desde Windows, en la raíz del repo o en `project/`):**

```powershell
# Proyecto completo (sin venv ni node_modules)
cd D:\Sistema-de-Guardadp-Rapido
scp -r ./project mtopas@192.168.137.10:~/
```

```powershell
# jarvis/ también hace falta -- vive como hermano de project/, fuera del build context
# viejo (antes de 2026-08-26 no se copiaba nunca). __pycache__ e Investigacion/ no hacen
# falta en el server:
tar czf - --exclude='__pycache__' --exclude='Investigacion' -C D:\Sistema-de-Guardadp-Rapido jarvis `
  | ssh mtopas@192.168.137.10 "mkdir -p ~/jarvis && tar xzf - -C ~/jarvis --strip-components=1"
```

```powershell
# Solo un archivo (ej. fix del bot)
scp "D:\Sistema-de-Guardadp-Rapido\project\mybot\finanzas_handlers.py" mtopas@192.168.137.10:~/project/mybot/finanzas_handlers.py
```

```powershell
# Solo la base de datos (seed o migración manual — detener backend antes)
scp project/database/app.db mtopas@192.168.137.10:~/project/database/
```

**2. Rebuild y levantar (SSH en el gabinete):**

`mtopas` está en el grupo `docker` — **no hace falta `sudo`** para nada de esto.

Desde 2026-08-26 (deploy del worker de Jarvis) el build context de `docker-compose.yml`
es el root del repo (`..`), no `project/` — y `docker-compose` (sin plugin buildx) **no
aplica `--network=host` al build** aunque esté en el compose, así que hay que construir
la imagen a mano antes de `up` (el gabinete sí tiene salida real a Internet, confirmado):

```bash
ssh mtopas@192.168.137.10
```

```bash
cd ~/project
docker build --network=host -t sgr-app:latest -f Dockerfile ..
docker-compose up -d --no-build
```

`./database` es volumen: un `scp -r ./project` **no** pisa `app.db`/`jarvis.db` salvo que
copies `database/` explícitamente.

---

### Docker — gestión diaria (en el gabinete)

Sin `sudo` (grupo `docker`):

| Acción | Comando |
| :--- | :--- |
| Levantar stack | `cd ~/project && docker-compose up -d` |
| Rebuild + reiniciar (código SGR o Jarvis) | `docker build --network=host -t sgr-app:latest -f Dockerfile .. && docker-compose up -d --no-build` |
| Ver contenedores | `docker-compose ps` |
| Logs en vivo (todos) | `docker-compose logs -f` |
| Logs del bot | `docker-compose logs -f bot` |
| Logs del backend | `docker-compose logs -f backend` |
| Logs del worker de Jarvis | `docker-compose logs -f worker` |
| Apagar stack | `docker-compose down` |
| Limpiar imágenes viejas | `docker image prune -f` |
| Apagar el gabinete | `sudo shutdown now` |

---

### Verificaciones rápidas (en el gabinete)

| Qué | Comando |
| :--- | :--- |
| IP | `ip a` |
| Rutas | `ip route` |
| Internet | `ping 8.8.8.8` |
| DNS | `ping github.com` |
| DNS dentro de Docker (build/run) | `sudo docker run --rm alpine nslookup pypi.org` |
| Contenedores | `sudo-docker ps` |
| API local | `curl -s http://127.0.0.1:8765/docs` |

---

### URLs útiles (desde la PC en la red ICS)

| Qué | URL |
| :--- | :--- |
| API SGR | `http://192.168.137.10:8765` |
| Swagger | `http://192.168.137.10:8765/docs` |
| Frontend (si servís `dist`) | mismo host `:8765` |

En dev en Windows: Vite `:5173` → API local `:8765` (sandbox con `dev-start.ps1`).

Opcional: Vite apuntando al homelab → `VITE_API_URL=http://192.168.137.10:8765` en `frontend/.env.local`.

---

### Bot Telegram — comandos útiles

| Comando | Uso |
| :--- | :--- |
| `/mov` | Alta de movimiento (flujo guiado) |
| `/dev on` | Enviar errores del bot a Telegram (si está en la imagen) |
| `/dev off` | Desactivar reportes |
| `/dev tail` | Últimas líneas de log |

Variables en `~/project/.env`: `TELEGRAM_BOT_TOKEN`, `BOT_ALLOWED_CHAT_IDS`, `API_BASE_URL` (en Docker: `http://backend:8765`).

---

## Infraestructura y red

Recuperamos hardware antiguo y lo integramos a la red actual.

* **Host (Gabinete):** Ubuntu Server 24.04 en AMD Athlon II.
* **Conectividad:** Adaptador USB-a-Ethernet (`enp0s7`) hacia la PC Windows.
* **Acceso remoto:** SSH desde PowerShell (sin teclado/monitor en el gabinete).

### Arquitectura actual (post-recovery, mayo 2026)

Tras un corte de luz, un **Network Bridge** de Windows dejó el stack corrupto (Git, Cursor, APIs HTTPS y `ping github.com` fallaban; rutas a `169.254.x.x`). Se eliminó el bridge, se reseteó la red de Windows y se migró a **Internet Connection Sharing (ICS)** — más estable (NAT, sin bridging L2).

```text
Router
   ↓
PC Windows (NAT / gateway ICS)
   ↓ Ethernet 2
Ubuntu Server
```

| Rol | Adaptador / host | Detalle |
| :--- | :--- | :--- |
| Internet en Windows | `Ethernet` | Adaptador principal |
| Enlace al gabinete | `Ethernet 2` | ICS compartido desde Ethernet → Properties → Sharing |
| Gateway ICS (Windows) | `192.168.137.1` | Mini-router NAT |
| Ubuntu (DHCP ICS, transitorio) | `192.168.137.93` | IP que asignó ICS tras el recovery |
| Ubuntu (estática objetivo) | `192.168.137.10/24` | Ver netplan abajo |

**ICS en Windows:** en `Ethernet` → Properties → Sharing → activar *Allow other network users to connect through this computer's Internet connection* y elegir **Ethernet 2**.

**No volver a usar Network Bridge** en este homelab — es frágil ante cortes de luz (duplicate IP, APIPA `169.254.x.x`, rutas zombie).

### Recovery de red en Windows (si vuelve a romperse)

Ejecutar en CMD **como administrador**, luego reiniciar:

```cmd
netsh winsock reset
netsh int ip reset
netcfg -d
ipconfig /flushdns
shutdown /r /t 0
```

### Por qué se rompe tras reboot / corte de luz

Secuencia típica:

1. Windows apaga o ICS cae → el gabinete pierde gateway.
2. Al volver el enlace, `systemd-networkd` intenta `default via 192.168.137.1` **antes** de que ICS esté listo.
3. Falla con `Nexthop has invalid gateway` y deja `enp0s7` en **degraded (failed)**.
4. Aunque después ICS responda, **networkd no reintenta** → sin internet / bot sin Telegram, pero SSH local sigue OK.
5. Además, tras un corte Windows a veces deja `Ethernet 2` en perfil **Public** → el firewall bloquea el NAT aunque SharedAccess esté Running (síntoma: ping al gateway OK, `ping 8.8.8.8` 100% loss).

Mitigación (una sola vez): watchdogs en ambos lados (abajo). Si hay ruta pero no internet: `Repair-Ics.ps1`. Solución definitiva: switch al router (sin ICS).

### Fijar la config (watchdogs — instalar una vez)

#### Ubuntu (gabinete) — restaura la ruta default cada minuto

Desde Windows (copia scripts + SSH):

```powershell
scp -r D:\Sistema-de-Guardadp-Rapido\project\scripts\homelab mtopas@192.168.137.10:~/project/scripts/
ssh mtopas@192.168.137.10
# en el gabinete:
cd ~/project && sudo bash scripts/homelab/install-default-route-watchdog.sh
```

Eso instala:

* `/usr/local/sbin/sgr-ensure-default-route` — si el gateway pingeá y falta `default`, la agrega
* timer systemd cada 60 s (+ 30 s post-boot)
* `on-link: true` en netplan (evita el fallo de nexthop)

Verificar: `systemctl status sgr-default-route.timer` · `ip route` · `ping -c2 8.8.8.8`

#### Windows — rearma NAT al arranque

PowerShell **como administrador**:

```powershell
cd D:\Sistema-de-Guardadp-Rapido\project\scripts
.\Install-IcsWatchdog.ps1   # tarea SGR-Ensure-ICS al startup (+45s)
.\Ensure-Ics.ps1            # NetNat + forwarding + 192.168.137.1 + perfil Private
```

Tras cortes de luz, preferir **NetNat** (`Ensure-Ics.ps1` / `Enable-HomelabNat.ps1`) antes que ICS clásico: ICS suele quedar con `SharingEnabled=True` pero sin NAT real (síntoma: ping al gateway OK, `8.8.8.8` 100% loss; a veces `Ethernet 2` cae a `169.254.x`).

Si el enlace local se rompe (SSH timeout / IP APIPA):

```powershell
# Admin
.\Repair-Ics.ps1            # restaura 192.168.137.1 y sharing
.\Ensure-Ics.ps1            # asegura NetNat
```

Luego en el gabinete: `ping -c2 8.8.8.8`.

### IP estática en Ubuntu (netplan)

Archivo: `/etc/netplan/00-installer-config.yaml`

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enp0s7:
      dhcp4: no
      addresses:
        - 192.168.137.10/24
      routes:
        - to: default
          via: 192.168.137.1
          on-link: true
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
```

Aplicar: `sudo netplan apply`

**IPs históricas:** `192.168.0.10` (bridge, ya no existe) · `192.168.137.93` (transitoria ICS) · **`192.168.137.10`** (definitiva con netplan).

### Estado (post-migración Bridge → ICS)

* **Windows:** red sana; Git, Cursor y APIs HTTPS OK.
* **Ubuntu:** SSH, internet, Docker y comunicación con la PC OK.
* **Pendiente ideal:** switch gigabit — `Router → Switch → PC + Ubuntu` (sin depender de Windows ni ICS).

---

## Docker y SGR en el gabinete

En lugar de instalar dependencias en el sistema host, usamos **Docker** (`project/docker-compose.yml`).

### Servicios

| Servicio | Comando | Puerto |
| :--- | :--- | :--- |
| `backend` | `uvicorn app.main:app --host 0.0.0.0 --port 8765` | `8765` (sirve también `/jarvis/*`) |
| `bot` | `python mybot/bot.py` | `network_mode: host` (Telegram/Ollama vía red Ubuntu) |
| `worker` | `python -m jarvis.worker.main` | `network_mode: host` (Jarvis — procesa `inbox_queue`, sin puerto) |

### Arquitectura

Backend + bot + worker en Docker (`docker-compose.yml`), desplegados 2026-08-26. DB canónica en `~/project/database/`. El `.exe` en Windows mantiene una réplica local y sincroniza con `sgr-abrir.ps1` (pull al abrir, push opcional al cerrar). Ver [`project/SYNC-WINDOWS.md`](project/SYNC-WINDOWS.md).

**Jarvis vive fuera de `project/`, en `~/jarvis` (hermano de `~/project`, mismo layout que el repo — ver CLAUDE.md).** El build context de `docker-compose.yml` es por eso el **root del repo** (`context: ..` desde `project/docker-compose.yml`, `dockerfile: project/Dockerfile`), no `project/` como antes de que Jarvis existiera — el `Dockerfile` copia `project/app`, `project/mybot` **y** `jarvis` en la misma imagen. Los tres servicios comparten `jarvis.db` + `database/chroma/` vía volumes (`JARVIS_DB_PATH`/`JARVIS_CHROMA_PATH`).

**Desde 2026-09-15 (fusión Bóveda-Jarvis, ver `CLAUDE.md` y `Cerebro/decisiones-implementacion.md`):** ya no hay volumen local `./vault:/app/vault`. Los 3 servicios montan `/mnt/boveda:/app/boveda` (share SMB de `D:\Boveda` en Windows, montado por CIFS en el host — `project/scripts/setup-boveda-cifs-homelab.sh`), con `VAULT_ROOT`/`JARVIS_BOVEDA_PATH` apuntando ahí. `D:\Boveda` es la fuente de verdad real; `/mnt/boveda` **tiene que estar montado antes de** `docker-compose up` (Docker no monta CIFS solo, hace bind-mount de lo que ya exista en el host — si el mount está caído, el backend arranca contra una carpeta vacía). `project/app/vault/guard.py::ensure_vault_mounted()` falla fuerte en los 3 entrypoints si no encuentra el árbol PARA real, en vez de arrancar en silencio. Verificar mount: `mountpoint /mnt/boveda`; watchdog systemd si se cae: `systemctl status sgr-boveda-mount-watchdog.timer`.

### Conceptos clave

* **Dockerfile:** imagen (Python 3.11, `requirements.txt` + `jarvis/pyproject.toml` vía `pip install -e`, código).
* **Backend:** red bridge Docker, puerto `8765` publicado en el host.
* **Bot y worker:** `network_mode: host` — usan DNS e Internet del Ubuntu (ICS), no el bridge Docker (suele fallar DNS). Llaman a la API/Ollama en `http://127.0.0.1:8765` / `http://192.168.137.1:11434`.
* **Ollama:** en Windows → `OLLAMA_BASE_URL=http://192.168.137.1:11434` en `.env` (y como override explícito en `environment:` de los tres servicios en compose, porque `${OLLAMA_BASE_URL}` del `.env` del host suele traer `localhost`).
* **No copiar `venv`:** rutas de Windows; el entorno se construye en Linux al hacer `build`.

### CPU del gabinete no soporta numpy/onnxruntime modernos — `numpy<2` fijado (2026-08-26)

El gabinete es un **AMD Athlon II X2 245 (2009)** — sin SSSE3, SSE4.1/4.2 ni AVX (`cat /proc/cpuinfo | grep flags` lo confirma). Los wheels de PyPI de `numpy>=2` (pulled transitivamente por `chromadb` y `onnxruntime`, dependencias de Jarvis) crashean con `SIGILL` (exit code 132) apenas se importan — el backend quedaba en crash-loop reiniciándose sin ningún traceback visible en `docker logs` (una falla de hardware mata el proceso, no lanza una excepción Python capturable).

Diagnóstico: `docker run --rm sgr-app:latest python -c "import numpy"` → exit 132, aislado probando cada import de la cadena (`onnxruntime`, `chromadb.api`, etc.) uno por uno. `numpy==1.26.4` sí importa y funciona (probado con el flujo real de ChromaDB: `PersistentClient` + `upsert`/`get`/`query`).

**Fix:** `numpy<2` fijado como dependencia en `jarvis/pyproject.toml` (comentario ahí con el detalle). Si en algún momento se corre Jarvis en hardware moderno (con AVX2), este pin sigue siendo válido — solo evita el wheel roto, no fuerza una versión vieja innecesariamente restrictiva más allá de la major.

**Si esto vuelve a pasar** (backend/worker reiniciando en loop sin logs claros): `docker inspect <container> --format '{{.State.ExitCode}}'` — `132` = `SIGILL`, casi siempre una wheel compilada para un baseline de CPU que el hardware no soporta. Aislar con `docker run --rm sgr-app:latest python -c "import <paquete>"` uno por uno.

### Persistencia (volumes)

Los contenedores son volátiles; los datos viven en el host:

* `~/project/database/` → SQLite `app.db` + `jarvis.db` + `chroma/` (ChromaDB) — ambas son **índices**, la fuente de verdad de contenido está en `D:\Boveda` (ver más abajo).
* `~/project/uploads/` → archivos subidos (legacy Bóveda; adjuntos nuevos van a `D:\Boveda\_adjuntos\`)
* `/mnt/boveda` (montado por CIFS, no es un volumen Docker local) → `D:\Boveda` real, compartido desde Windows. `~/project/vault/` (notas Markdown locales de Jarvis, `RAW/`/`SEMANTIC/`/`DECISIONS/`/`PROJECTS/`/`PEOPLE/`) quedó **retirado** desde la fusión del 2026-09-15 — puede seguir existiendo en disco como resto viejo, pero ya no lo monta ningún servicio ni lo lee el código.

Sobreviven reinicios y `docker compose up --build`. `/mnt/boveda` sobrevive un reinicio del homelab solo si el mount CIFS se reconecta (watchdog systemd instalado, ver arriba) — si Windows tarda en levantar ICS tras un corte de luz, el mount puede tardar en volver.

### Wipe + reseed de `jarvis.db` con dataset de prueba (procedimiento, usado 2026-09-03)

**Histórico — de antes de la fusión del 2026-09-15.** El `vault/` que este procedimiento wipea/
reseedea es el que quedó retirado (ver "Persistencia" arriba); si hace falta un wipe de `jarvis.db`
hoy, el contenido real vive en `D:\Boveda` vía `/mnt/boveda`, no acá — no ejecutar los pasos de
`vault/RAW`/`vault/SEMANTIC`/etc. de abajo tal cual sin releer primero cómo cambió la arquitectura.

Para reemplazar `jarvis.db`/`vault`/`chroma` reales por el dataset de prueba de
`jarvis/cli/seed_test.py` sin perder los datos reales:

```bash
# 1. Backup con timestamp (confirmar contenido ANTES de seguir)
ssh mtopas@192.168.137.10
cd ~/project/database
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backup-jarvis-$TS && cp -a jarvis.db chroma backup-jarvis-$TS/ && cp -a ../vault backup-jarvis-$TS/vault
python3 -c "import sqlite3; print(sqlite3.connect('backup-jarvis-$TS/jarvis.db').execute('SELECT COUNT(*) FROM memory_entries').fetchone())"

# 2. Parar los 3 contenedores (evita escrituras a mitad del wipe)
cd ~/project && docker-compose stop backend worker bot

# 3. Wipe (NUNCA tocar database/app.db -- es la DB de SGR, no de Jarvis)
rm -f database/jarvis.db database/jarvis.db-wal database/jarvis.db-shm
rm -rf database/chroma && mkdir -p database/chroma
rm -rf vault/RAW vault/SEMANTIC vault/DECISIONS vault/PROJECTS vault/PEOPLE

# 4. Reseed -- contenedor de un solo uso con el mismo image/volumes/red/env
#    que el worker real (Ollama real via ICS, nunca embeddings inventados)
docker-compose run --rm worker python -u -m jarvis.cli.seed_test

# 5. Levantar el stack de nuevo
docker-compose up -d --no-build
```

El wipe también borra `jarvis_policies.debug_chat_id` (el chat de Telegram
que Jarvis recordó del primer `/j`) -- sin él, `run_audit()`/`_notify_run_report()`
(ver `Cerebro/decisiones-implementacion.md`, 2026-09-03) no tienen a dónde
empujar. Si hace falta seguir usando el mismo chat de antes del wipe (no uno
nuevo), restaurar esa fila puntual desde el backup por `docker exec
project-worker-1 python3 -c "..."` (el archivo es root:root dentro del
volumen -- un `sqlite3` corrido como `mtopas` desde el host da `readonly
database`, hace falta `docker exec` para escribir como el mismo usuario que
lo creó).

### Docker sin DNS (`Temporary failure in name resolution` en `pip install`)

En el gabinete **no hay salida a Internet durante `docker build`** (contenedor aislado; `build.network: host` del compose **no aplica** sin el plugin buildx — ver aviso `Docker Compose requires buildx plugin`).

**Solución recomendada — wheelhouse offline (desde Windows):**

```powershell
cd D:\Sistema-de-Guardadp-Rapido\project
.\scripts\prepare-docker-wheelhouse.ps1
scp -r .\wheelhouse mtopas@192.168.137.10:~/project/
scp .\Dockerfile .\docker-compose.yml .dockerignore mtopas@192.168.137.10:~/project/
```

En el gabinete:

```bash
cd ~/project
sudo docker compose build --no-cache
sudo docker compose up -d
```

El `Dockerfile` detecta `wheelhouse/*.whl` e instala con `pip --no-index` (sin red).

**Alternativa — build con red del host** (solo si Ubuntu tiene Internet):

```bash
cd ~/project
sudo docker build --network=host --no-cache -t sgr-app:latest .
sudo docker compose up -d --no-build
```

**Diagnóstico en el host Ubuntu:**

```bash
ping -c1 8.8.8.8
ping -c1 github.com
curl -sI https://pypi.org | head -1
```

Si el host no resuelve, arreglar ICS/netplan antes de cualquier build online.

**DNS global del daemon** (opcional, para contenedores en runtime que sigan en bridge):

```bash
sudo mkdir -p /etc/docker
printf '%s\n' '{' '  "dns": ["8.8.8.8", "1.1.1.1"]' '}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

### Un solo bot activo por token (`telegram.error.Conflict: terminated by other getUpdates request`)

Telegram solo permite **un** poller de `getUpdates` a la vez por `TELEGRAM_BOT_TOKEN`. Si corrés
`python mybot/bot.py` en Windows (dev local) mientras el bot del homelab también está `Up` — mismo
token en ambos `.env` — los dos entran en conflicto y ninguno recibe mensajes de forma confiable
(reintenta cada ~10s, no crashea el proceso pero tampoco funciona). Visto en vivo en el deploy de
2026-09-01: quedaron **6 procesos Python** corriendo en Windows (uvicorn + worker + bot, duplicados
x2 — una vez vía `project/venv`, otra vez vía un Python 3.10 global suelto) peleando con
`project-bot-1` del homelab.

Antes de asumir "el bot no anda", verificar procesos locales:

```powershell
# Windows — busca bot.py/uvicorn/jarvis.worker.main corriendo
wmic process where "name='python.exe'" get ProcessId,CommandLine
```

Si hay instancias locales sueltas y el homelab es la fuente "online": matarlas (`Stop-Process -Id
<pid> -Force`). El conflicto tarda unos segundos en drenar del lado de Telegram después de matar al
competidor — no asumir que sigue roto si el error persiste por ~30-60s más.

### `litellm` sin techo real en `jarvis/pyproject.toml` (pese a lo documentado en `Cerebro/`)

`Cerebro/decisiones-implementacion.md` (2026-08-25) documenta haber fijado `litellm==1.60.2`, pero
ese pin se aplicó **solo al `project/venv` local** (`pip install litellm==1.60.2` a mano) — la nota
ahí mismo dice explícitamente "pendiente de agregar" el techo a `jarvis/pyproject.toml`, y **nunca
se agregó**: sigue en `litellm>=1.40.0` sin límite superior. Cada `docker build` en el homelab por
lo tanto instala la última versión de PyPI (1.99.0 al 2026-09-01, no 1.60.2). No rompió nada en este
deploy porque el bug original (`typing.NotRequired`) era específico de Python 3.10 y la imagen Docker
usa `python:3.11-slim` — pero si algún día el build empieza a fallar de forma parecida, revisar acá
primero. Pendiente real: agregar el techo a `jarvis/pyproject.toml` si se quiere reproducibilidad
entre el venv local y el build de Docker.

### Crash real por carrera de migración (`_migrate()`) entre los 3 contenedores al arrancar

`project-bot-1` crasheó el 2026-09-01 (`RestartCount=1`, se auto-recuperó al reiniciar Docker) con
`sqlite3.OperationalError: duplicate column name: created_by`. Causa: `backend` (uvicorn), `worker`
y `bot` corren `init_db()` → `_migrate(conn)` cada uno al arrancar, los 3 contra el mismo
`jarvis.db` en el volumen compartido — si dos de los tres ven una columna ausente en el mismo
instante y ambos corren el `ALTER TABLE ... ADD COLUMN`, el segundo falla. La migración de
`created_by` tenía un `try/except sqlite3.OperationalError` que **interpretaba** la excepción (la
asumía "SQLite viejo sin soporte para CHECK en ADD COLUMN" y reintentaba sin CHECK) en vez de
chequear el estado real — el reintento fallaba con el mismo "duplicate column name", sin capturar,
y tumbaba el proceso. El resto de las columnas migradas ese día (`embedded_at`, `valid_to`, `title`,
`last_passive_review_at`, `last_audited_at`) ni siquiera tenían try/except: cualquier ALTER
concurrente las tumbaba directo.

Fix (`jarvis/db/database.py::_add_column_if_missing()`): mismo estándar que ya usaba
`_migrate_people_type()` para el rebuild de `memory_entries` con `'PEOPLE'` — nunca interpretar qué
significó una excepción, siempre volver a leer `PRAGMA table_info()` después de un fallo y decidir
en base al estado real (si la columna ya existe, fue la carrera benigna, se ignora; si no, es un
fallo real). Las 6 migraciones `ALTER TABLE ... ADD COLUMN` de `_migrate()` pasan ahora por este
helper. Detalle completo y reproducción con múltiples procesos reales contra una DB de scratch en
`Cerebro/decisiones-implementacion.md` (2026-09-03).

### Bot sin DNS en runtime (`api.telegram.org` no resuelve)

El bridge Docker del homelab **no resuelve nombres** aunque pongas `dns: 8.8.8.8` en compose. El bot necesita Telegram (HTTPS saliente).

**Fix en compose:** `network_mode: host` en el servicio `bot` → comparte red/DNS del Ubuntu. La API local pasa a `http://127.0.0.1:8765`.

Verificá primero **en el host** (no en el contenedor):

```bash
curl -sI https://api.telegram.org | head -1
ping -c1 github.com
```

| Host | Contenedor bridge | Acción |
| :--- | :--- | :--- |
| OK | falla | `network_mode: host` en bot (ya en compose) |
| falla | falla | Arreglar ICS/netplan en Ubuntu (gateway `192.168.137.1`) |

Tras actualizar compose:

```bash
cd ~/project
sudo docker-compose up -d
sudo docker-compose exec bot python -c "import requests; print(requests.get('https://api.telegram.org', timeout=15).status_code)"
```

Debería imprimir `302` o `200`.

---

---

## Plan para subir de nivel

### Nivel 1 — Dejar de ser frágil (urgente)

* Switch + cable al router (o IP fija en LAN del router) — sin depender de ICS/Windows.
* IP fija: netplan `192.168.137.10` o reserva DHCP en el router.
* Firewall (`ufw`): solo SSH.
* SSH: deshabilitar password; solo claves.

### Nivel 2 — Sistema real

* Logs estructurados (no solo `docker logs`).
* Backups automáticos de `database/` (cron).
* Health check — endpoint `/health`.

### Nivel 3 — Pro

* Deploy automático (script o CI; menos `scp` manual).
* Separar dev / prod en el mismo server.
* Monitoreo básico (CPU/RAM, caídas de contenedor).

---

## Referencias en el repo

* `project/docker-compose.yml` — stack homelab
* `project/SYNC-WINDOWS.md` — sync homelab ↔ `.exe`
* `project/Bot.md` — comandos y flujos del bot
* `project/BUILD.md` — ejecutable Windows
* `CLAUDE.md` — puertos y arranque local
