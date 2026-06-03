# Homelab SGR — Cheatsheet y referencia

Gabinete Ubuntu con **backend + bot** en Docker. API en **`:8765`** (no `:8000`).

### ⚠️ Dos bases de datos (causa típica: “el bot guardó pero no lo veo en Finanzas”)

| Dónde corrés | API que usa | Archivo `app.db` |
| :--- | :--- | :--- |
| **Vite en Windows** (`npm run dev`) | `http://127.0.0.1:8765` | `project/database/app.db` en la PC |
| **Bot en Docker (homelab)** | `http://backend:8765` en el gabinete | `~/project/database/app.db` en Ubuntu |

Son **dos SQLite distintas** salvo que unifiques. **Setup recomendado: Modo B (DB solo en Windows).**

### Modo B — una DB en Windows (recomendado)

**1. Windows — API en toda la interfaz ICS** (desde `project/`):

```powershell
.\venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
```

**Importante:** `--host 0.0.0.0` es obligatorio. Sin eso uvicorn solo escucha en `127.0.0.1` y el `curl` desde el homelab **cuelga**. La variable `SGR_HOST` del `.env` **no** cambia el bind de uvicorn si lo arrancás a mano.

Vite sigue en `http://127.0.0.1:8765` (`npm run dev` en `frontend/`).

**2. Homelab — solo el bot** (sin contenedor `backend`):

```bash
cd ~/project
# En .env del gabinete:
#   API_BASE_URL=http://192.168.137.1:8765
sudo docker compose down
sudo docker compose -f docker-compose.bot-only.yml up -d --build
sudo docker compose -f docker-compose.bot-only.yml logs -f bot
```

**3. Firewall Windows:** permitir entrada TCP **8765** en red **Privada** (perfil ICS).

**4. Traer movimientos que quedaron solo en el gabinete** (una vez):

```powershell
scp mtopas@192.168.137.10:~/project/database/app.db D:\Sistema-de-Guardadp-Rapido\project\database\app.db
```

(Reiniciá uvicorn si estaba corriendo.)

**5. Probar desde el gabinete:**

```bash
curl -s http://192.168.137.1:8765/fin/movimientos
```

Debe listar lo mismo que en Windows (respuesta al instante, no colgado).

#### Si `curl` a `192.168.137.1:8765` se queda colgado

**1. En Windows — comprobar en qué IP escucha la API:**

```powershell
netstat -an | findstr 8765
```

| Lo que ves | Significado |
| :--- | :--- |
| `127.0.0.1:8765` | Solo local → **reiniciá** uvicorn con `--host 0.0.0.0` |
| `0.0.0.0:8765` | Correcto para Modo B |

**2. Probar desde la misma PC (Windows):**

```powershell
curl http://127.0.0.1:8765/fin/movimientos
curl http://192.168.137.1:8765/fin/movimientos
```

El segundo debe responder igual que el primero. Si el segundo falla o cuelga, el problema es el bind o el firewall, no el homelab.

**3. Firewall Windows (PowerShell como administrador):**

```powershell
New-NetFirewallRule -DisplayName "SGR API 8765" -Direction Inbound -Protocol TCP -LocalPort 8765 -Profile Private -Action Allow
```

**4. En el homelab — timeout corto para no esperar eterno:**

```bash
curl -s --connect-timeout 5 http://192.168.137.1:8765/fin/movimientos
```

Si devuelve *Connection timed out*: Windows no acepta conexiones en ese puerto/IP.  
Si devuelve JSON: listo.

---

Otros modos:

- **UI contra homelab:** `VITE_API_URL=http://192.168.137.10:8765` en `frontend/.env.local`.
- **Stack completo en gabinete:** `docker compose up -d` con `API_BASE_URL=http://backend:8765` en `.env`.

Comprobar en homelab: `curl -s http://127.0.0.1:8765/fin/movimientos | head`  
En Windows: `curl http://127.0.0.1:8765/fin/movimientos`

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
# Solo un archivo (ej. fix del bot)
scp "D:\Sistema-de-Guardadp-Rapido\project\mybot\finanzas_handlers.py" mtopas@192.168.137.10:~/project/mybot/finanzas_handlers.py
```

```powershell
# Solo la base de datos (Modo C — una sola DB)
scp project/database/app.db mtopas@192.168.137.10:~/project/database/
```

**2. Rebuild y levantar (SSH en el gabinete):**

```bash
cd ~/project
# Modo B — solo bot, DB en Windows (recomendado):
sudo docker compose down
sudo docker compose -f docker-compose.bot-only.yml up -d --build

# Modo gabinete completo (API + bot en Ubuntu):
# sudo docker compose up -d --build
```

`./database` es volumen: un `scp -r ./project` **no** pisa `app.db` salvo que copies `database/app.db` explícitamente.

---

### Docker — gestión diaria (en el gabinete)

| Acción | Comando |
| :--- | :--- |
| Levantar stack | `cd ~/project && sudo docker compose up -d` |
| Actualizar y reiniciar | `sudo docker compose up -d --build` |
| Ver contenedores | `sudo docker compose ps` |
| Logs en vivo (todos) | `sudo docker compose logs -f` |
| Logs del bot | `sudo docker compose logs -f bot` |
| Logs del backend | `sudo docker compose logs -f backend` |
| Apagar stack | `sudo docker compose down` |
| Limpiar imágenes viejas | `sudo docker image prune -f` |
| Apagar el gabinete | `sudo shutdown now` |

---

### Verificaciones rápidas (en el gabinete)

| Qué | Comando |
| :--- | :--- |
| IP | `ip a` |
| Rutas | `ip route` |
| Internet | `ping 8.8.8.8` |
| DNS | `ping github.com` |
| Contenedores | `sudo docker ps` |
| API local | `curl -s http://127.0.0.1:8765/docs` |

---

### URLs útiles (desde la PC en la red ICS)

| Qué | URL |
| :--- | :--- |
| API SGR | `http://192.168.137.10:8765` |
| Swagger | `http://192.168.137.10:8765/docs` |
| Frontend (si servís `dist`) | mismo host `:8765` |

En dev en Windows: Vite `:5173` → API local `:8765`.

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
| `backend` | `uvicorn app.main:app --host 0.0.0.0 --port 8765` | `8765` |
| `bot` | `python mybot/bot.py` | — (solo sale a Telegram y a la API) |

### Modos de operación

| Modo | Descripción |
| :--- | :--- |
| **A — Todo en el gabinete** | Bot + API en Docker; DB en `~/project/database/`. UI: `http://192.168.137.10:8765` o `VITE_API_URL` apuntando al gabinete. |
| **B — DB en Windows (recomendado)** | `docker-compose.bot-only.yml` en homelab + `SGR_HOST=0.0.0.0` en Windows. Ver sección arriba. |
| **C — Sincronizar DB** | `scp` de `app.db` entre PC y gabinete si hiciste pruebas en ambos lados. |

### Conceptos clave

* **Dockerfile:** imagen (Python 3.11, `requirements.txt`, código).
* **Docker Compose:** backend y bot en la misma red; el bot resuelve el host `backend`.
* **Variables:** `API_BASE_URL` en Docker apunta a `http://backend:8765`, no a `localhost`.
* **No copiar `venv`:** rutas de Windows; el entorno se construye en Linux al hacer `build`.

### Persistencia (volumes)

Los contenedores son volátiles; los datos viven en el host:

* `~/project/database/` → SQLite `app.db`
* `~/project/uploads/` → archivos subidos

Sobreviven reinicios y `docker compose up --build`.

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
* `project/Bot.md` — comandos y flujos del bot
* `project/BUILD.md` — ejecutable Windows
* `CLAUDE.md` — puertos y arranque local
