# ds-wifi

Punto de acceso WiFi para **Nintendo DS / DS Lite** que conecta a **[Wiimmfi](https://wiimmfi.de)** (el reemplazo fan de Nintendo WFC).

Corre sobre Linux (hostapd + dnsmasq) y se controla desde una **interfaz web** (celular/PC) con encendido/apagado, lista de clientes, logs en vivo y configuración completa.

## Por qué existe

La DS Lite solo soporta WiFi **802.11b**, con seguridad **abierta o WEP** (no WPA). Los chips WiFi modernos (Intel, etc.) **no emiten WEP** en modo AP, así que la solución estándar de la comunidad es una **red abierta + filtro por MAC** + aislamiento de red.

## Seguridad

- **Filtro MAC**: solo los dispositivos listados pueden asociarse (el SSID se ve, pero nadie más entra).
- **Aislamiento guest**: los clientes salen a internet pero **no** alcanzan tu LAN.
- **Apagada por defecto**: la red solo existe mientras la enciendes.
- **PIN opcional** para proteger la interfaz web.

## Requisitos

- Linux (probado en Ubuntu 24.04), `systemd`, `iptables`.
- Tarjeta WiFi que soporte modo AP en 2.4 GHz (`iw list` debe listar `AP`).
- Conexión a internet por cable (la WiFi se usa exclusivamente para el AP).

## Instalación

```bash
git clone <este-repo> && cd ds-wifi
sudo ./install.sh
```

El instalador:
1. Instala `hostapd`, `dnsmasq`, `iw` y `node`.
2. Crea el usuario `dswifi` (sin shell).
3. Detecta las interfaces WiFi y LAN.
4. Copia todo a `/opt/ds-wifi` y arranca el servicio web.

Después abre `http://<IP-del-servidor>:3120`.

## Conectar una DS Lite (paso a paso)

1. **Sacá la MAC**: insertá un juego con WFC (Mario Kart DS, etc.) → `NINTENDO WFC` → `Nintendo WFC Settings` → `Options` → `System Information`. El **Nintendo WFC ID** es la MAC (12 caracteres hex).
2. En la UI web: **Configuración → Acceso (filtro MAC)** → agregá la MAC con dos puntos (`00:1F:2B:3C:4D:5E`) → **Guardar**.
3. Encendé la red con el botón.
4. En la DS: `Ajustes de conexión de Nintendo Wi-Fi` → `Buscar un punto de acceso` → elegí `NDSWFC` (sin candado).
5. `Cambiar ajustes` → DNS manual:
   - **Primario:** `178.62.43.212` (Kaeru → Wiimmfi)
   - **Secundario:** `1.1.1.1`
6. `Probar conexión`. Listo.

> Algunos juegos que usan SSL necesitan además el parche NoSSL (WfcPatcher). La mayoría de los juegos grandes funcionan solo con el DNS.

## Configuración (todo desde la UI)

| Sección | Opciones |
|---|---|
| Red inalámbrica | SSID, seguridad (abierta/WEP), canal, país, ocultar SSID |
| Acceso | filtro MAC on/off + lista |
| Red/DHCP | IP del AP, subred, rango DHCP, lease time, DNS |
| Seguridad & auto | aislamiento guest, auto-apagado por inactividad, PIN |

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/status` | estado + clientes conectados |
| POST | `/api/toggle` | `{action: "on" \| "off"}` |
| GET | `/api/config` | configuración completa |
| POST | `/api/config` | guarda y aplica |
| POST/DELETE | `/api/whitelist` | agrega/quita MAC |
| GET | `/api/logs` | últimas líneas del log |

## Estructura

```
bin/ap-control.sh   # start/stop del AP (hostapd+dnsmasq+NAT+aislamiento)
bin/status.sh       # snapshot JSON de clientes
bin/log.sh          # lector de logs
web/server.js       # API + render de configs (Node, sin dependencias)
web/public/         # UI web (HTML/CSS/JS vanilla)
config/ap.json      # config editable (no se versiona)
systemd/            # unidades ds-wifi-ap.service y ds-wifi-web.service
sudoers/dswifi      # permisos acotados para el usuario dswifi
```

## Cómo funciona

```
DS Lite ──(WiFi abierta)──> hostapd ──> dnsmasq (DHCP) ──> NAT ──> LAN ──> internet ──> Wiimmfi
```

La UI corre como usuario `dswifi` con sudo acotado (solo puede arrancar/parar el AP y leer estado/logs). El AP y las reglas de firewall corren como root dentro de `ds-wifi-ap.service`.

## Licencia

MIT
