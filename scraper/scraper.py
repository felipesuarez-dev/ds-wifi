#!/usr/bin/env python3
# ds-wifi scraper: listado dinámico de juegos de Wiimmfi (nodriver + Chrome real).
# Escribe config/stats.json y atiende refrescos manuales vía config/stats.refresh.
import re, json, time, asyncio, os
import nodriver as uc

BASE = '/opt/ds-wifi'
CFG = os.path.join(BASE, 'config', 'ap.json')
STATS = os.path.join(BASE, 'config', 'stats.json')
FLAG = os.path.join(BASE, 'config', 'stats.refresh')
PROFILE = os.path.join(BASE, 'config', 'chrome-profile')
URL = 'https://wiimmfi.de/stat?m=c'
MAX_CYCLES = 30

CONSOLAS = {
    'NDS-34x16.png': ['DS'],
    'Wii-34x16.png': ['WII'],
    'WiiWare-34x16.png': ['WW'],
    'DSiWare-34x16.png': ['DSI'],
    'Mix-34x16.png': ['DS', 'WII'],
}

def log(m):
    print('[scraper] %s' % m, flush=True)

def load_interval():
    try:
        cfg = json.load(open(CFG))
        return max(1, int(cfg.get('stats', {}).get('intervalMinutes', 2))) * 60
    except Exception:
        return 120

def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    s = s.replace('&nbsp;', ' ').replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()

def consoles(td_html):
    out = []
    for src in re.findall(r'src="/images/([^"]+)"', td_html):
        out += CONSOLAS.get(src.split('/')[-1], [])
    return out or ['?']

def parse(html):
    games = []
    for r in re.findall(r'<tr class="tr[01]">(.*?)</tr>', html, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
        if len(tds) < 6:
            continue
        gid = clean(tds[0])
        name = clean(tds[1])
        online_raw = clean(tds[4]).replace('k', '')
        try:
            online = int(online_raw) if online_raw not in ('—', '-', '') else 0
        except ValueError:
            online = 0
        if gid and name:
            games.append({
                'id': gid,
                'name': name,
                'status': clean(tds[2]),
                'console': consoles(tds[1]),
                'online': online,
                'profiles': clean(tds[3]).replace(' ', ''),
                'logins': clean(tds[5]).replace(' ', ''),
            })
    games.sort(key=lambda g: (-g['online'], g['name']))
    return games

def write_stats(games, error=None):
    json.dump({
        'updatedAt': int(time.time() * 1000),
        'error': error,
        'games': games,
    }, open(STATS, 'w'))

def is_blocked(html):
    low = (html or '').lower()
    return len(low) < 5000 or 'just a moment' in low or 'challenge-platform' in low

async def wait_challenge(tab, max_s=90):
    start = time.time()
    while time.time() - start < max_s:
        try:
            title = await tab.evaluate('document.title')
        except Exception:
            title = ''
        if title and not ('moment' in title.lower() or 'verificaci' in title.lower()):
            return True
        await asyncio.sleep(5)
    return False

async def scrape_once(browser):
    # Sin try/finally con tab.close(): cerrar la última pestaña apaga Chrome
    # entero. browser.get() reutiliza la primera pestaña, así el navegador
    # vive entre ciclos y solo se reconstruye de forma acotada.
    try:
        tab = await asyncio.wait_for(browser.get(URL), timeout=60)
    except (asyncio.TimeoutError, TimeoutError):
        log('timeout abriendo la página')
        return
    ok = await wait_challenge(tab)
    html = await tab.get_content()
    blocked = is_blocked(html)
    games = [] if blocked else parse(html)
    err = 'cloudflare' if blocked else None
    write_stats(games, error=err)
    log('%d juegos%s' % (len(games), (' (%s)' % err) if err else ''))

def stop_browser(browser):
    if not browser:
        return
    try:
        browser.stop()
    except Exception as e:
        log('error deteniendo navegador: %s' % e)

async def main():
    os.makedirs(PROFILE, exist_ok=True)
    next_try = 0
    ciclos = 0
    while True:
        browser = None
        try:
            browser = await uc.start(headless=False, user_data_dir=PROFILE)
            while True:
                now = time.time()
                manual = os.path.isfile(FLAG)
                if not (manual or now >= next_try):
                    await asyncio.sleep(5)
                    continue
                if manual:
                    os.remove(FLAG)
                    log('refresco manual solicitado')
                err = False
                try:
                    await scrape_once(browser)
                    next_try = now + load_interval()
                    ciclos += 1
                except Exception as e:
                    log('error de ciclo: %s' % e)
                    err = True
                    next_try = now + 5
                # Vida útil acotada: ante error o cada MAX_CYCLES éxitos se
                # reconstruye el navegador para no acumular memoria.
                if err or ciclos >= MAX_CYCLES:
                    motivo = 'error' if err else 'mantenimiento preventivo'
                    log('reconstruyendo navegador (%s)…' % motivo)
                    break
        except Exception as e:
            log('navegador: %s' % e)
        finally:
            stop_browser(browser)
        espera = max(3, min(15, int(next_try - time.time())))
        await asyncio.sleep(espera)

if __name__ == '__main__':
    asyncio.run(main())
