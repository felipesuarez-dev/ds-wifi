#!/usr/bin/env bash
# ds-wifi — instalador. Crea un punto de acceso WiFi para Nintendo DS (Wiimmfi).
# Uso: sudo ./install.sh
set -euo pipefail

BASE=/opt/ds-wifi
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecutar como root: sudo ./install.sh"
  exit 1
fi

log() { echo "==> $*"; }

# 1. Paquetes
log "Instalando paquetes (hostapd dnsmasq iw)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq hostapd dnsmasq iw
# desactivar el dnsmasq del sistema (ocupa el puerto 53)
systemctl disable --now dnsmasq.service >/dev/null 2>&1 || true

# 2. Node (detectar existente o instalar nodejs del sistema)
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  # nvm: elegir la versión más alta encontrada
  NODE="$(ls -v /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1 || true)"
fi
if [ -z "$NODE" ]; then
  log "Node no encontrado, instalando nodejs..."
  apt-get install -y -qq nodejs
  NODE="$(command -v node 2>/dev/null || command -v nodejs 2>/dev/null || true)"
fi
if [ -z "$NODE" ] || ! "$NODE" --version >/dev/null 2>&1; then
  echo "ERROR: no se pudo instalar/detectar node"; exit 1
fi
log "Usando node: $NODE ($("$NODE" --version))"

# 3. Usuario dedicado
if ! id dswifi >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin dswifi
  log "Usuario dswifi creado"
fi

# 4. Detección de interfaces
WIFI_IF="$(iw dev 2>/dev/null | awk '/Interface/{print $2; exit}')"
[ -z "$WIFI_IF" ] && WIFI_IF="$(ls /sys/class/net 2>/dev/null | grep -E '^wl' | head -1)"
LAN_IF="$(ls /sys/class/net 2>/dev/null | grep -E '^(enp|eth)' | head -1)"
[ -z "$WIFI_IF" ] && WIFI_IF="wlan0"
[ -z "$LAN_IF" ] && LAN_IF="eth0"
log "WiFi: $WIFI_IF | LAN: $LAN_IF"

# 5. Copiar archivos
log "Instalando en $BASE ..."
mkdir -p "$BASE"/{bin,web/public,config,logs}
install -o root -g root -m 755 "$SRC/bin/ap-control.sh" "$BASE/bin/ap-control.sh"
install -o root -g root -m 755 "$SRC/bin/status.sh" "$BASE/bin/status.sh"
install -o root -g root -m 755 "$SRC/bin/log.sh" "$BASE/bin/log.sh"
install -o dswifi -g dswifi -m 664 "$SRC/web/server.js" "$BASE/web/server.js"
install -o dswifi -g dswifi -m 664 "$SRC/web/public/index.html" "$BASE/web/public/index.html"
chmod o+x /opt 2>/dev/null || true

# 6. Config inicial
if [ ! -f "$BASE/config/ap.json" ]; then
  install -o dswifi -g dswifi -m 664 "$SRC/config/ap.json.example" "$BASE/config/ap.json"
  sed -i "s/\"wifiInterface\": \"[^\"]*\"/\"wifiInterface\": \"$WIFI_IF\"/" "$BASE/config/ap.json"
  sed -i "s/\"lanInterface\": \"[^\"]*\"/\"lanInterface\": \"$LAN_IF\"/" "$BASE/config/ap.json"
  log "Config inicial creada en $BASE/config/ap.json"
else
  log "Config existente preservada ($BASE/config/ap.json)"
fi

# 7. systemd units (con la ruta real de node)
install -o root -g root -m 644 "$SRC/systemd/ds-wifi-ap.service" /etc/systemd/system/ds-wifi-ap.service
sed "s|@NODE@|$NODE|" "$SRC/systemd/ds-wifi-web.service" > /etc/systemd/system/ds-wifi-web.service
chmod 644 /etc/systemd/system/ds-wifi-web.service

# 8. sudoers
install -o root -g root -m 440 "$SRC/sudoers/dswifi" /etc/sudoers.d/dswifi
if ! visudo -c >/dev/null 2>&1; then
  echo "ERROR: sudoers inválido"; exit 1
fi

# 9. Arrancar
systemctl daemon-reload
systemctl enable --now ds-wifi-web.service

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "=================================================="
echo " ds-wifi instalado."
echo " UI web:   http://${IP:-<IP-del-servidor>}:3120"
echo " AP:       OFF por defecto (se enciende desde la UI)"
echo " Config:   $BASE/config/ap.json"
echo "=================================================="
echo "Próximo paso: abre la UI, agrega la MAC de tu DS"
echo "(juego -> Nintendo WFC -> Opciones -> Información"
echo " del sistema) y enciende la red."
