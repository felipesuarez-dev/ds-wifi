#!/usr/bin/env bash
# Instala el scraper de Wiimmfi. Usa nodriver + Google Chrome real.
# Requiere: xvfb, Google Chrome, Python 3 + venv.
set -euo pipefail
SCRAPER_DIR=/opt/ds-wifi/scraper
if [ "$(id -u)" -ne 0 ]; then echo "Ejecutar como root: sudo ./install.sh"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
echo "==> Instalando Xvfb..."
apt-get update -qq
apt-get install -y -qq xvfb wget ca-certificates >/dev/null 2>&1

echo "==> Instalando Google Chrome..."
if ! command -v google-chrome-stable >/dev/null 2>&1; then
  wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb
  dpkg -i /tmp/chrome.deb >/dev/null 2>&1 || apt-get install -f -y -qq >/dev/null 2>&1
  rm -f /tmp/chrome.deb
fi

cd "$SCRAPER_DIR"
echo "==> Creando entorno Python (venv) e instalando nodriver..."
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q --upgrade pip >/dev/null 2>&1
./venv/bin/pip install -q nodriver >/dev/null 2>&1

echo "==> Activando la unit..."
cp /opt/ds-wifi/systemd/ds-wifi-scraper.service /etc/systemd/system/ds-wifi-scraper.service
chmod 644 /etc/systemd/system/ds-wifi-scraper.service
systemctl daemon-reload
systemctl enable --now ds-wifi-scraper.service
echo "==> Scraper instalado y en ejecución."
