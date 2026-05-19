# Home Lab - Infraestructura Actualizada y Recovery Post-Corte de Luz

## Contexto
Después de un corte de luz, el networking de Windows quedó corrupto debido al uso de un `Network Bridge` para compartir internet entre la PC principal y el servidor Ubuntu.

El síntoma principal fue:

- Google y YouTube funcionaban.
- Git no funcionaba.
- Cursor AI no funcionaba.
- APIs HTTPS fallaban.
- `curl https://api.github.com` no conectaba.
- `ping github.com` fallaba.

---

# Diagnóstico del Problema

## Lo que encontramos

### 1. El bridge de Windows quedó corrupto
Windows estaba intentando rutear tráfico a través de:

- un bridge roto
- una IP duplicada
- una interfaz APIPA (`169.254.x.x`)

### Evidencia

```powershell
ipconfig /all
```

Mostraba:

```text
192.168.0.4 (Duplicate)
169.254.x.x
```

Y además:

```powershell
ping github.com
```

Respondía:

```text
Reply from 169.254.x.x: Destination host unreachable
```

Eso confirmaba:

- routing roto
- bridge corrupto
- stack de red inconsistente

---

# Recovery Realizado

## 1. Eliminación del Network Bridge

Se eliminó completamente:

```text
Network Bridge
```

NO se deshabilitó.
Se eliminó.

---

## 2. Reset completo del stack de red de Windows

Ejecutado en CMD administrador:

```cmd
netsh winsock reset
netsh int ip reset
netcfg -d
ipconfig /flushdns
```

Luego:

```cmd
shutdown /r /t 0
```

---

## 3. Resultado

Después del reinicio:

### Git volvió a funcionar

```powershell
curl.exe https://api.github.com
```

Respondió correctamente.

### Cursor volvió a funcionar

### El routing quedó limpio

### Desaparecieron:

- Duplicate IP
- APIPA routing inválido
- rutas zombie
- bridge corrupto

---

# Nueva Arquitectura

## Arquitectura Anterior (INestable)

```text
Router
   ↓
PC Windows
   ↓ Network Bridge
Ubuntu Server
```

Problemas:

- muy frágil
- Windows no maneja bien bridges persistentes
- cortes de luz rompen routing
- conflictos ARP
- duplicate IP
- debugging difícil

---

## Arquitectura Actual (Mucho Más Estable)

Ahora usamos:

# Internet Connection Sharing (ICS)

```text
Router
   ↓
PC Windows (NAT)
   ↓ Ethernet 2
Ubuntu Server
```

Esto convierte la PC en un mini-router NAT.

MUCHO más estable que Network Bridge.

---

# Configuración Actual

## Windows

### Adaptador principal con internet

```text
Ethernet
```

### Adaptador conectado al server

```text
Ethernet 2
```

### ICS habilitado

En:

```text
Ethernet -> Properties -> Sharing
```

Activado:

```text
Allow other network users to connect through this computer's Internet connection
```

Compartiendo hacia:

```text
Ethernet 2
```

---

# Red ICS Actual

## Gateway Windows

```text
192.168.137.1
```

## Ubuntu Server

IP obtenida:

```text
192.168.137.93
```

---

# SSH Nuevo

## Antes

```powershell
ssh mtopas@192.168.0.10
```

## Ahora

```powershell
ssh mtopas@192.168.137.93
```

---

# SCP Nuevo

## Antes

```powershell
scp -r ./project mtopas@192.168.0.10:~/
```

## Ahora

```powershell
scp -r ./project mtopas@192.168.137.93:~/
```

---

# Configuración de IP Estática en Ubuntu

## Objetivo

Evitar que la IP cambie tras reinicios.

## IP elegida

```text
192.168.137.10
```

## Gateway

```text
192.168.137.1
```

---

# Configuración Netplan

Archivo:

```bash
/etc/netplan/00-installer-config.yaml
```

Contenido:

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

Aplicar:

```bash
sudo netplan apply
```

---

# Verificaciones Útiles

## Ver IP Ubuntu

```bash
ip a
```

---

## Ver rutas

```bash
ip route
```

---

## Verificar internet

```bash
ping 8.8.8.8
```

---

## Verificar DNS

```bash
ping github.com
```

---

## Ver Docker

```bash
sudo docker ps
```

---

## Levantar stack

```bash
cd ~/project
sudo docker compose up -d
```

---

# Lecciones Aprendidas

## 1. No usar Network Bridge en Windows

Especialmente:

- home labs
- servidores persistentes
- setups post-corte de luz

Windows bridges son extremadamente frágiles.

---

## 2. ICS es muchísimo más estable

Porque:

- usa NAT
- no hace bridging Layer 2 real
- menos conflictos ARP
- menos duplicate IP
- menos corrupción de rutas

---

## 3. El stack de red de Windows puede quedar corrupto

La solución fuerte fue:

```cmd
netcfg -d
```

Esto:

- reinstala adaptadores
- limpia bindings
- elimina interfaces zombie
- reconstruye networking

---

# Próximo Upgrade Recomendado

## Comprar un switch gigabit

Arquitectura ideal:

```text
Router
  ↓
Switch
 ├── PC
 └── Ubuntu Server
```

Beneficios:

- elimina dependencia de Windows
- elimina ICS
- elimina NAT local
- networking profesional
- mucho más estable

---

# Estado Actual Final

## PC Windows

✅ Networking sano
✅ Git funcionando
✅ Cursor funcionando
✅ APIs funcionando

---

## Ubuntu Server

✅ SSH funcionando
✅ Internet funcionando
✅ Docker operativo
✅ Comunicación con PC funcionando

---

## Infraestructura

✅ Recovery exitoso
✅ Migración de Bridge → ICS completada
✅ Stack de red estabilizado

