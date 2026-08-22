#!/usr/bin/env bash
# Instala el scraper de Wiimmfi (opcional). Descarga Chromium (~150 MB).
# Corre como root (mismo enfoque que los dashboards comunitarios en Docker).
set -euo pipefail
SCRAPER_DIR=/opt/ds-wifi/scraper
if [ "$(id -u)" -ne 0 ]; then echo "Ejecutar como root: sudo ./install.sh"; exit 1; fi

echo "==> Instalando Xvfb y dependencias de Chrome..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  ca-certificates fonts-liberation >/dev/null 2>&1

cd "$SCRAPER_DIR"
echo "==> Instalando dependencias npm (puppeteer)..."
PUPPETEER_CACHE_DIR="$SCRAPER_DIR/.cache" npm install --omit=dev >/dev/null 2>&1

mkdir -p "$SCRAPER_DIR/.profile"

echo "==> Activando la unit..."
NODE="$(command -v node 2>/dev/null || ls -v /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1 || echo /usr/bin/node)"
sed "s|@NODE@|$NODE|" /opt/ds-wifi/systemd/ds-wifi-scraper.service > /etc/systemd/system/ds-wifi-scraper.service
chmod 644 /etc/systemd/system/ds-wifi-scraper.service
systemctl daemon-reload
systemctl enable --now ds-wifi-scraper.service
echo "==> Scraper instalado y en ejecución."
echo "    Para que cuente jugadores online, pega tu User-Agent y la cookie"
echo "    cf_clearance en la interfaz (Wiimmfi · Mis juegos). Ver README."
