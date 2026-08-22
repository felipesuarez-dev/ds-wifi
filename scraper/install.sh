#!/usr/bin/env bash
# Instala el scraper de Wiimmfi (opcional). Descarga Chromium (~150 MB).
set -euo pipefail
SCRAPER_DIR=/opt/ds-wifi/scraper
if [ "$(id -u)" -ne 0 ]; then echo "Ejecutar como root: sudo ./install.sh"; exit 1; fi

cd "$SCRAPER_DIR"
echo "==> Instalando dependencias npm (puppeteer)..."
npm install --omit=dev >/dev/null 2>&1
echo "==> Descargando Chromium (esto tarda)..."
PUPPETEER_CACHE_DIR="$SCRAPER_DIR/.cache" npx puppeteer browsers install chrome 2>/dev/null || true

chown -R dswifi:dswifi "$SCRAPER_DIR"

# activar la unit con el node detectado
NODE="$(command -v node 2>/dev/null || ls -v /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1 || echo /usr/bin/node)"
sed "s|@NODE@|$NODE|" /opt/ds-wifi/systemd/ds-wifi-scraper.service > /etc/systemd/system/ds-wifi-scraper.service
chmod 644 /etc/systemd/system/ds-wifi-scraper.service
systemctl daemon-reload
systemctl enable --now ds-wifi-scraper.service
echo "==> Scraper instalado y en ejecución."
