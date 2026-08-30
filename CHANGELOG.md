# Changelog

Todas las modificaciones notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [0.2.4] - 2026-08-30

Parche: la mitigación de 0.2.3 no llegaba a aplicarse y dejaba procesos huérfanos.

### Fixed
- **Reconstrucción de Chrome en cada ciclo**: el contador `ciclos` se declaraba fuera del bucle de reconstrucción y nunca volvía a cero, así que al alcanzar `MAX_CYCLES` la condición quedaba permanentemente cierta. En vez de reconstruir cada 30 ciclos, el scraper reconstruía el navegador en **cada** ciclo: 368 reconstrucciones en 24 h frente a las ~16 previstas. Ahora el contador vive junto al navegador que cuenta.
- **Procesos huérfanos de Chrome**: `browser.stop()` de nodriver solo hace `terminate()` sobre `/usr/bin/google-chrome`, que es un script envoltorio; sus hijos reales (zygotes, renderers, GPU) sobrevivían y se acumulaban en el cgroup hasta que `MemoryMax` disparaba el OOM killer (3 veces desde el 26/08, con picos de 1,4 GB de RAM y 2,8 GB de swap para un solo servicio). `stop_browser()` ahora captura el árbol de procesos **antes** de parar —al morir el padre los hijos se reparentan a init y se pierde el vínculo— y aplica SIGTERM, espera acotada y SIGKILL a lo que siga en pie.
- El árbol de procesos se lee de `/proc`, sin dependencias nuevas. No se usa `killpg` porque Chrome comparte grupo de procesos con el propio scraper y con Xvfb: matar el grupo apagaría el servicio entero.

## [0.2.3] - 2026-08-23

Parche: fuga de memoria en el scraper de Wiimmfi.

### Fixed
- **Fuga de RAM del scraper**: el proceso llegaba a ~8 GB tras horas corriendo. Causa raíz: `tab.close()` sobre la única pestaña apagaba Chrome entero en cada ciclo; el siguiente ciclo fallaba ("no close frame received or sent") y reconstruía el navegador desde cero, filtrando memoria en cada reconstrucción (~300 en 15 h).
- Ahora el navegador **vive entre ciclos** (se reutiliza la misma pestaña), usa un **perfil persistente** (`config/chrome-profile`, sin basura temporal en `/tmp` y con la sesión de Cloudflare vigente) y se reconstruye de forma acotada: ante un error o cada 30 ciclos exitosos como mantenimiento preventivo.
- **Cinturón de seguridad en systemd**: `MemoryHigh=1200M` / `MemoryMax=1500M` en `ds-wifi-scraper.service`; si el proceso volviera a desbordarse, systemd lo reinicia en vez de quedarse sin RAM el host.

## [0.2.2] - 2026-08-22

Parche: fiabilidad y claridad en la sección de juegos de Wiimmfi.

### Added
- Botón **⟳ Actualizar** (en Mis juegos y en el selector) para refrescar los jugadores online al instante, sin esperar el ciclo automático.
- **Badges por juego**: consola (`DS` / `WII` / `WW` / `DSI`) y estado (`OK` / `PRUEBAS` / `PARCIAL`); al tocar el estado se ve el detalle completo tal como lo publica Wiimmfi.
- Columnas **Perfiles** y **Logins totales** por juego.
- El listado se ordena por **más jugadores online primero**.
- Aviso visible cuando los datos están desactualizados o Cloudflare bloqueó una consulta.

### Changed
- Control de alerta reemplazado: ahora es un selector visible **"🔔 Alerta: N+ online"** por juego (antes era un botón 🎯 sin feedback que no hacía nada).
- Los presets 1h / 2h / Indefinido muestran **cuál está activo**.
- El selector de juegos refresca los datos automáticamente al abrirlo; intervalo base del scraper baja a 2 min con reintento rápido si un ciclo falla.
- Cabeceras `Cache-Control: no-store` en la interfaz para evitar UIs viejas cacheadas.

### Fixed
- Scraper colgado indefinidamente en la primera carga bajo Xvfb (timeouts en navegación + reconstrucción automática del navegador ante cualquier error de ciclo).
- Errores silenciosos: ahora todo fallo queda registrado y avisa en pantalla.

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
