'use strict';
// ds-wifi scraper: obtiene el nº de jugadores online de Wiimmfi y escribe
// config/stats.json para la UI.
//
// Dos caminos:
//  1) Si ap.json tiene stats.cfClearance + stats.userAgent (cookie válida),
//     se hace un fetch simple con esos headers (fiable, sin navegador).
//  2) Si no, Chrome headful + Xvfb + stealth + perfil persistente (la técnica
//     de los dashboards comunitarios de MKDS), que pasa Cloudflare solo en
//     redes donde el reto auto-resuelve.
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = '/opt/ds-wifi';
const CFG_PATH = path.join(BASE, 'config', 'ap.json');
const STATS_PATH = path.join(BASE, 'config', 'stats.json');
const PROFILE_DIR = path.join(BASE, 'scraper', '.profile');

function loadCfg() {
  try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) { return {}; }
}
function getGames() {
  const cfg = loadCfg();
  return (cfg.stats && Array.isArray(cfg.stats.games)) ? cfg.stats.games : [];
}
function writeStats(results) {
  fs.writeFileSync(STATS_PATH, JSON.stringify({ updatedAt: Date.now(), results }, null, 2) + '\n');
}
function countOnline(html) {
  const m = html.match(/class="tr[01]"/g);
  return m ? m.length : 0;
}
function isBlockedHtml(html) {
  return /just a moment|cf-chl|challenge-platform|__cf_chl/i.test(html) || html.indexOf('#online') === -1;
}

function fetchViaCookie(url, ua, clearance) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': ua,
        'Cookie': 'cf_clearance=' + clearance,
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', c => { if (data.length < 5e6) data += c; });
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, html: '' }); });
    req.on('error', () => resolve({ status: 0, html: '' }));
  });
}

async function scrapeViaCookie(cfg, games) {
  const ua = cfg.stats.userAgent;
  const clearance = cfg.stats.cfClearance;
  const results = {};
  for (const g of games) {
    if (!g.url) { results[g.id] = { reachable: false, error: 'sin-url' }; continue; }
    const r = await fetchViaCookie(g.url, ua, clearance);
    if (r.status === 200 && r.html && !isBlockedHtml(r.html)) {
      results[g.id] = { reachable: true, onlineCount: countOnline(r.html) };
    } else if (r.status === 0) {
      results[g.id] = { reachable: false, error: 'fetch-error' };
    } else {
      results[g.id] = { reachable: false, error: 'http-' + r.status };
    }
  }
  writeStats(results);
}

// camino 2: navegador headful + Xvfb (best-effort)
async function scrapeViaBrowser(games) {
  let puppeteer;
  try {
    const p = require('puppeteer-extra');
    const Stealth = require('puppeteer-extra-plugin-stealth');
    const UserDataDir = require('puppeteer-extra-plugin-user-data-dir');
    p.use(Stealth());
    p.use(UserDataDir({ folderPath: PROFILE_DIR }));
    puppeteer = p;
  } catch (e) {
    const results = {};
    games.forEach(g => { results[g.id] = { reachable: false, error: 'scraper-no-instalado' }; });
    writeStats(results);
    return;
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-blink-features=AutomationControlled', '--window-size=1280,800',
           '--disable-crash-reporter', '--disable-gpu']
  });
  const results = {};
  try {
    for (const g of games) {
      if (!g.url) { results[g.id] = { reachable: false, error: 'sin-url' }; continue; }
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(g.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        let ok = false;
        for (let i = 0; i < 18; i++) {
          let t = '';
          try { t = await page.title(); } catch (e) {}
          if (t && !/just a moment|un momento|verificaci/i.test(t.toLowerCase())) { ok = true; break; }
          await new Promise(r => setTimeout(r, 5000));
        }
        const count = ok ? await page.evaluate(() => document.querySelectorAll('#online .tr0, #online .tr1').length) : null;
        await page.close();
        results[g.id] = ok ? { reachable: true, onlineCount: count } : { reachable: false, error: 'cloudflare' };
      } catch (e) {
        results[g.id] = { reachable: false, error: e.message.slice(0, 60) };
      }
    }
  } finally {
    await browser.close();
  }
  writeStats(results);
}

async function scrapeOnce() {
  const cfg = loadCfg();
  const games = getGames();
  if (!games.length) { writeStats({}); return; }
  const ua = cfg.stats && cfg.stats.userAgent;
  const clearance = cfg.stats && cfg.stats.cfClearance;
  if (ua && clearance) {
    await scrapeViaCookie(cfg, games);
  } else {
    await scrapeViaBrowser(games);
  }
}

async function run() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await scrapeOnce(); } catch (e) { console.error('[scraper]', e.message); }
    let intervalMs = 3 * 60000;
    try {
      const cfg = loadCfg();
      const m = (cfg.stats && cfg.stats.intervalMinutes) || 3;
      intervalMs = Math.max(1, m) * 60000;
    } catch (e) {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

run();
