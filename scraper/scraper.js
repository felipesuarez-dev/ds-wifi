'use strict';
// ds-wifi scraper: lee los juegos de ap.json (stats.games), scrapea el nº de
// jugadores online de cada uno y escribe config/stats.json para la UI.
// Nota: wiimmfi.de está detrás de Cloudflare; ver docs/RELEASING.md.
const fs = require('fs');
const path = require('path');

const BASE = '/opt/ds-wifi';
const CFG_PATH = path.join(BASE, 'config', 'ap.json');
const STATS_PATH = path.join(BASE, 'config', 'stats.json');

function loadGames() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    if (cfg.stats && Array.isArray(cfg.stats.games)) return cfg.stats.games;
  } catch (e) {}
  return [];
}

function writeStats(results) {
  fs.writeFileSync(STATS_PATH, JSON.stringify({ updatedAt: Date.now(), results }, null, 2) + '\n');
}

// patrones heurísticos para extraer el nº de jugadores online del texto de la página
const COUNT_PATTERNS = [
  /(\d+)\s*(?:Spieler|players?|jugadores?)\s*(?:online|en línea|en linea|in game)/i,
  /online[^0-9]{0,40}(\d+)/i,
  /(\d+)\s*online/i
];

function detectBlocked(text, title) {
  const hay = `${title}\n${text}`.toLowerCase();
  return /just a moment|verificación|verificacion|un momento|challenge|cloudflare|ray id/i.test(hay);
}

async function scrapeOnce() {
  const games = loadGames();
  if (!games.length) {
    writeStats({});
    return;
  }
  let puppeteer;
  try {
    const p = require('puppeteer-extra');
    const Stealth = require('puppeteer-extra-plugin-stealth');
    p.use(Stealth());
    puppeteer = p;
  } catch (e) {
    // si no está instalado el scraper, marcar todo como no disponible
    const results = {};
    games.forEach(g => { results[g.id] = { reachable: false, error: 'scraper-no-instalado' }; });
    writeStats(results);
    return;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const results = {};
  try {
    for (const g of games) {
      if (!g.url) { results[g.id] = { reachable: false, error: 'sin-url' }; continue; }
      try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(g.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 6000));
        const title = await page.title();
        const text = await page.evaluate(() => document.body.innerText || '');
        await page.close();
        if (detectBlocked(text, title)) {
          results[g.id] = { reachable: false, error: 'cloudflare' };
          continue;
        }
        let count = null;
        for (const re of COUNT_PATTERNS) {
          const m = text.match(re);
          if (m) { count = parseInt(m[1], 10); break; }
        }
        results[g.id] = { reachable: true, onlineCount: count };
      } catch (e) {
        results[g.id] = { reachable: false, error: e.message };
      }
    }
  } finally {
    await browser.close();
  }
  writeStats(results);
}

async function run() {
  const games = loadGames();
  const intervalMs = (() => {
    try {
      const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
      const m = (cfg.stats && cfg.stats.intervalMinutes) || 3;
      return Math.max(1, m) * 60000;
    } catch (e) { return 3 * 60000; }
  })();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await scrapeOnce(); } catch (e) { console.error('[scraper]', e.message); }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

run();
