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

## [0.2.1] - 2026-08-22

Parche: corrección en el conteo de clientes conectados.

### Fixed
- **Clientes conectados**: solo se cuentan las consolas realmente asociadas al AP (`station dump`). El lease DHCP persiste horas tras apagar la consola y aparecía como conexión activa.
- Cada dispositivo de la whitelist muestra "visto hace X" cuando está desconectado.

## [0.2.0] - 2026-08-22

Segunda versión (Beta): seguimiento dinámico de juegos de Wiimmfi.

### Added
- **Listado dinámico de juegos de Wiimmfi**: el scraper descarga los ~680 juegos con su nº de jugadores online desde una sola página (`/stat?m=c`), sin configurar nada.
- **Buscador de juegos** en la interfaz: escribes el nombre, ves cuánta gente hay online y lo agregas a tus favoritos con un toque.
- Botón de cierre (X) en todos los modales, cierre al tocar fuera y con Escape.

### Changed
- **Scraper reescrito**: ahora usa **nodriver + Google Chrome real** (pasa el reto de Cloudflare) en lugar de Puppeteer + stealth, que quedaba bloqueado.
- **"Wiimmfi · Mis juegos"** pasa a listado dinámico + favoritos con umbral de alerta configurable (toca 🎯 para cambiarlo).
- El scraper corre como servicio systemd aparte (`ds-wifi-scraper.service`) con Xvfb.

### Removed
- URLs por juego y cookies `cf_clearance` / User-Agent manuales (ya no hacen falta).

## [0.1.0] - 2026-08-22
