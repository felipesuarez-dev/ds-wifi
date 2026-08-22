#!/usr/bin/env python3
# ds-wifi scraper: obtiene el listado dinámico de juegos de Wiimmfi con su
# nº de jugadores online y lo escribe en config/stats.json.
# Usa nodriver + Google Chrome real (pasa el reto de Cloudflare).
import re, json, time, asyncio
import nodriver as uc

CFG = '/opt/ds-wifi/config/ap.json'
STATS = '/opt/ds-wifi/config/stats.json'
URL = 'https://wiimmfi.de/stat?m=c'

def load_interval():
    try:
        cfg = json.load(open(CFG))
        return max(1, int(cfg.get('stats', {}).get('intervalMinutes', 3))) * 60
    except Exception:
        return 180

def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    s = s.replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()

def parse(html):
    games = []
    for r in re.findall(r'<tr class="tr[01]">(.*?)</tr>', html, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)
        if len(tds) < 5:
            continue
        gid = clean(tds[0])
        name = clean(tds[1])
        status = clean(tds[2])
        online_raw = clean(tds[4]).replace('k', '')
        try:
            online = int(online_raw) if online_raw not in ('—', '-', '') else 0
        except ValueError:
            online = 0
        if gid and name:
            games.append({'id': gid, 'name': name, 'status': status, 'online': online})
    return games

async def scrape_once(browser):
    tab = await browser.get(URL)
    try:
        for _ in range(20):
            await asyncio.sleep(5)
            title = await tab.evaluate('document.title')
            if title and not ('moment' in title.lower() or 'verificaci' in title.lower()):
                break
        html = await tab.get_content()
        games = parse(html)
        json.dump({'updatedAt': int(time.time() * 1000), 'games': games}, open(STATS, 'w'))
        return len(games)
    finally:
        try:
            await tab.close()
        except Exception:
            pass

async def main():
    browser = await uc.start(headless=False)
    try:
        while True:
            try:
                n = await scrape_once(browser)
                print('[scraper] %d juegos' % n)
            except Exception as e:
                print('[scraper] error:', e)
            await asyncio.sleep(load_interval())
    finally:
        browser.stop()

if __name__ == '__main__':
    asyncio.run(main())
