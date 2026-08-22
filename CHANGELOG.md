# Changelog

Todas las modificaciones notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [0.1.0] - 2026-08-22

Primera versión pública (Beta).

### Added
- Punto de acceso WiFi (hostapd + dnsmasq) con NAT y aislamiento guest para Nintendo DS/DS Lite.
- Interfaz web responsive con encendido/apagado, clientes conectados, logs en vivo y configuración completa.
- Ingreso de MAC segmentado en 6 cajas con los dos puntos fijos (genérico, no limitado a DS).
- Nombres personalizados por dispositivo (nombre + MAC como subtítulo).
- Filtro por MAC (whitelist) con estado en vivo y detección de "dispositivo conectado".
- Copiar MAC al portapapeles, exportar/importar whitelist (JSON).
- Detección de fabricante (OUI) a partir de los primeros 3 octetos.
- Guía de conexión integrada + diagnóstico de red (internet / Wiimmfi).
- Encendido con temporizador (1h / 2h / indefinido) y auto-apagado por inactividad.
- Sección "Wiimmfi · Mis juegos": seguimiento de jugadores online por juego, juegos agregables y alertas en vivo con umbral configurable (notificación del navegador).
- Worker de scraping (Puppeteer, opcional) para leer estadísticas de Wiimmfi.
- PIN opcional para proteger la interfaz.
- Branding PumaSoft (crédito en cabecera + footer).
- GitHub Action de release (tag + GitHub Release al publicar en `master`).
- Documentación de releases (`docs/RELEASING.md`).

### Changed
- `macList` ahora almacena objetos `{ mac, name }` (con migración automática del formato anterior).

## [Unreleased]

### Fixed
- Scraper de Wiimmfi: agregado camino con cookie `cf_clearance` + User-Agent (fetch simple, fiable) además del navegador headful. El headful ahora usa Chrome 24.x + perfil persistente + Xvfb y el servicio detiene limpiamente (KillMode=mixed).

### Known
- `wiimmfi.de` está detrás de Cloudflare; el navegador headful solo pasa el reto en redes donde auto-resuelve. La cookie `cf_clearance` es el camino fiable (caduca ~30–60 min).
