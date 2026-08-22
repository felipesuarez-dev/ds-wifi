'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 3120;
const BASE = '/opt/ds-wifi';
const CFG_PATH = path.join(BASE, 'config', 'ap.json');
const GEN_DIR = path.join(BASE, 'config', 'generated');
const PUBLIC_DIR = path.join(BASE, 'web', 'public');
const STATS_PATH = path.join(BASE, 'config', 'stats.json');
const LASTSEEN_PATH = path.join(BASE, 'config', 'lastseen.json');

const DEFAULTS = {
  ssid: 'NDSWFC', security: 'open', wepKey: '', channel: 6, hwMode: 'g',
  countryCode: 'CL', hidden: false, macFilter: true, macList: [],
  apIp: '192.168.50.1', prefix: 24, dhcpStart: '192.168.50.50',
  dhcpEnd: '192.168.50.200', leaseTime: '12h', dnsClients: '1.1.1.1',
  isolation: true, autoOffMinutes: 0, pin: '',
  wifiInterface: 'wlp2s0', lanInterface: 'enp1s0',
  stats: { enabled: true, intervalMinutes: 3, alerts: true, games: [] }
};

function ipToInt(ip) { return ip.split('.').reduce((a, b) => (a << 8) + (+b >>> 0), 0) >>> 0; }
function intToIp(n) { return [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.'); }
function maskFromPrefix(p) { return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; }
function network(ip, p) { return intToIp(ipToInt(ip) & maskFromPrefix(p)); }
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function normalizeMacList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(m => {
    if (typeof m === 'string') return { mac: m.toLowerCase(), name: '' };
    return { mac: (m.mac || '').toLowerCase(), name: m.name || '' };
  });
}

function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) {}
  const cfg = Object.assign({}, DEFAULTS, raw);
  cfg.macList = normalizeMacList(cfg.macList);
  if (!cfg.stats || typeof cfg.stats !== 'object') cfg.stats = DEFAULTS.stats;
  if (!Array.isArray(cfg.stats.games)) cfg.stats.games = [];
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

function validate(cfg) {
  const errs = [];
  if (!cfg.ssid || cfg.ssid.length > 32) errs.push('SSID inválido (1-32 chars)');
  if (!IP_RE.test(cfg.apIp)) errs.push('IP del AP inválida');
  if (!IP_RE.test(cfg.dhcpStart) || !IP_RE.test(cfg.dhcpEnd)) errs.push('Rango DHCP inválido');
  const ch = parseInt(cfg.channel, 10);
  if (isNaN(ch) || ch < 1 || ch > 13) errs.push('Canal inválido (1-13)');
  const p = parseInt(cfg.prefix, 10);
  if (isNaN(p) || p < 8 || p > 30) errs.push('Prefijo inválido (8-30)');
  if (!/^\d+[smhd]$/.test(cfg.leaseTime)) errs.push('Lease time inválido (ej: 12h)');
  if (cfg.security === 'wep' && !cfg.wepKey) errs.push('Falta la clave WEP');
  if (cfg.macFilter && cfg.macList.some(m => !MAC_RE.test(m.mac))) errs.push('MAC inválida en la whitelist');
  return errs;
}

function renderConfigs(cfg) {
  fs.mkdirSync(GEN_DIR, { recursive: true });
  const auth = cfg.security === 'wep' ? 2 : 1;
  const hostapd = [
    `interface=${cfg.wifiInterface}`, 'driver=nl80211', `ssid=${cfg.ssid}`,
    `hw_mode=${cfg.hwMode}`, `channel=${cfg.channel}`, `country_code=${cfg.countryCode}`,
    'max_num_sta=16', `ignore_broadcast_ssid=${cfg.hidden ? 1 : 0}`,
    'ieee80211n=0', 'wmm_enabled=0', `auth_algs=${auth}`
  ];
  if (cfg.security === 'wep') {
    hostapd.push(`wep_key0="${cfg.wepKey}"`, 'wep_default_key=0');
  }
  if (cfg.macFilter) {
    hostapd.push('macaddr_acl=1', `accept_mac_file=${GEN_DIR}/accept_mac`);
    fs.writeFileSync(path.join(GEN_DIR, 'accept_mac'),
      cfg.macList.map(m => m.mac.toLowerCase()).join('\n') + '\n');
  }
  fs.writeFileSync(path.join(GEN_DIR, 'hostapd.conf'), hostapd.join('\n') + '\n');

  const nm = intToIp(maskFromPrefix(cfg.prefix));
  const dnsmasq = [
    `interface=${cfg.wifiInterface}`, 'bind-interfaces', `listen-address=${cfg.apIp}`,
    'port=53', 'no-resolv',
    `dhcp-range=${cfg.dhcpStart},${cfg.dhcpEnd},${nm},${cfg.leaseTime}`,
    `dhcp-leasefile=${BASE}/config/leases`, 'dhcp-authoritative',
    'pid-file=/run/ds-wifi/dnsmasq.pid', 'log-dhcp', `log-facility=${BASE}/logs/ap.log`
  ];
  cfg.dnsClients.split(/[\s,]+/).filter(Boolean).forEach(d => {
    if (IP_RE.test(d)) dnsmasq.push(`server=${d}`);
  });
  fs.writeFileSync(path.join(GEN_DIR, 'dnsmasq.conf'), dnsmasq.join('\n') + '\n');

  const netEnv = [
    `WIFI_IF=${cfg.wifiInterface}`, `LAN_IF=${cfg.lanInterface}`,
    `AP_IP=${cfg.apIp}`, `AP_PREFIX=${cfg.prefix}`,
    `AP_NETWORK=${network(cfg.apIp, cfg.prefix)}/${cfg.prefix}`,
    `ISOLATION=${cfg.isolation ? 1 : 0}`
  ];
  fs.writeFileSync(path.join(GEN_DIR, 'net.env'), netEnv.join('\n') + '\n');
}

function sudo(args) {
  return new Promise((resolve) => {
    execFile('sudo', args, { timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: (stdout || '').trim(), err: (stderr || '').trim() });
    });
  });
}
const apStart = () => sudo(['systemctl', 'start', 'ds-wifi-ap']);
const apStop = () => sudo(['systemctl', 'stop', 'ds-wifi-ap']);
const apRestart = () => sudo(['systemctl', 'restart', 'ds-wifi-ap']);
function isActive() {
  return new Promise((resolve) => {
    execFile('systemctl', ['is-active', 'ds-wifi-ap'], (err, stdout) => {
      resolve(!err && (stdout || '').trim() === 'active');
    });
  });
}
async function getStatusJSON() {
  const r = await sudo([path.join(BASE, 'bin', 'status.sh')]);
  try { return JSON.parse(r.out); } catch (e) { return { active: false, clients: [] }; }
}

function readStatsFile() {
  try { return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch (e) { return null; }
}

// ---- lastSeen (última conexión por dispositivo) ----
let lastSeenMap = {};
try { lastSeenMap = JSON.parse(fs.readFileSync(LASTSEEN_PATH, 'utf8')); } catch (e) {}
function touchLastSeen(macs) {
  let changed = false;
  const now = Date.now();
  for (const m of macs) {
    if (!lastSeenMap[m]) { lastSeenMap[m] = now; changed = true; }
  }
  if (changed) {
    try { fs.writeFileSync(LASTSEEN_PATH, JSON.stringify(lastSeenMap)); } catch (e) {}
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { if (data.length < 1e6) data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
  });
}

function serveFile(res, fp) {
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fp);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}

function serveStatic(res, url) {
  if (url.startsWith('/assets/')) {
    return serveFile(res, path.join(BASE, 'assets', url.slice('/assets/'.length)));
  }
  const file = url === '/' ? '/index.html' : url;
  return serveFile(res, path.join(PUBLIC_DIR, file));
}

function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (r) => {
      resolve({ ok: true, status: r.statusCode });
      r.resume();
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, err: e.code || e.message }));
  });
}

let lastSeen = Date.now();

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const cfg = loadConfig();

  const isApi = url.startsWith('/api/');
  const isPublic = url === '/api/status' || url === '/api/logs' || url === '/api/stats';
  if (isApi && !isPublic && cfg.pin) {
    const pin = req.headers['x-pin'] || '';
    if (pin !== cfg.pin) return send(res, 401, { error: 'PIN inválido' });
  }

  try {
    if (url === '/api/status') {
      const [active, snap] = await Promise.all([isActive(), getStatusJSON()]);
      return send(res, 200, {
        active,
        clientCount: (snap.clients || []).length,
        clients: snap.clients || [],
        lastSeen: lastSeenMap,
        config: {
          ssid: cfg.ssid, security: cfg.security, channel: cfg.channel,
          apIp: cfg.apIp, prefix: cfg.prefix, isolation: cfg.isolation,
          macFilter: cfg.macFilter, hidden: cfg.hidden,
          autoOffMinutes: cfg.autoOffMinutes, hasPin: !!cfg.pin
        }
      });
    }
    if (url === '/api/stats') {
      const raw = readStatsFile();
      const results = (raw && raw.results) || {};
      const games = cfg.stats.games.map(g => {
        const r = results[g.id] || {};
        const onlineCount = typeof r.onlineCount === 'number' ? r.onlineCount : null;
        return {
          id: g.id, name: g.name, url: g.url, threshold: g.threshold || 0,
          onlineCount, reachable: !!r.reachable, overThreshold: onlineCount !== null && onlineCount >= (g.threshold || 0)
        };
      });
      return send(res, 200, {
        enabled: !!cfg.stats.enabled,
        alertsEnabled: !!cfg.stats.alerts,
        updatedAt: (raw && raw.updatedAt) || null,
        games
      });
    }
    if (url === '/api/toggle' && req.method === 'POST') {
      const body = await readBody(req);
      const wantOn = body.action === 'on';
      const r = wantOn ? await apStart() : await apStop();
      lastSeen = Date.now();
      if (r.ok) return send(res, 200, { ok: true, active: wantOn });
      return send(res, 500, { ok: false, error: r.err || r.out || 'Error' });
    }
    if (url === '/api/diag') {
      const inet = await httpGet('https://1.1.1.1', 4000);
      const wifi = await httpGet('https://wiimmfi.de', 6000);
      return send(res, 200, {
        internet: inet.ok,
        wiimmfiReachable: wifi.ok,
        wifiStatus: wifi.status || null
      });
    }
    if (url === '/api/config' && req.method === 'GET') {
      return send(res, 200, cfg);
    }
    if (url === '/api/logs') {
      const m = (req.url.split('?')[1] || '').match(/n=(\d+)/);
      const n = m ? parseInt(m[1], 10) : 200;
      const r = await sudo([path.join(BASE, 'bin', 'log.sh'), String(n)]);
      const lines = r.out ? r.out.split('\n') : [];
      return send(res, 200, { ok: true, lines });
    }
    if (url === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      const merged = Object.assign({}, cfg, body);
      merged.macList = normalizeMacList(merged.macList);
      const errs = validate(merged);
      if (errs.length) return send(res, 400, { ok: false, errors: errs });
      saveConfig(merged);
      renderConfigs(merged);
      const active = await isActive();
      if (active) await apRestart();
      return send(res, 200, { ok: true, restarted: active });
    }
    if (url === '/api/whitelist' && req.method === 'POST') {
      const body = await readBody(req);
      const mac = (body.mac || '').toLowerCase();
      if (!MAC_RE.test(mac)) return send(res, 400, { ok: false, error: 'MAC inválida' });
      const cfg2 = loadConfig();
      if (!cfg2.macList.some(m => m.mac === mac)) {
        cfg2.macList.push({ mac, name: (body.name || '').trim() });
        saveConfig(cfg2); renderConfigs(cfg2);
      }
      if (await isActive()) await apRestart();
      return send(res, 200, { ok: true, macList: cfg2.macList });
    }
    if (url.startsWith('/api/whitelist/') && req.method === 'DELETE') {
      const mac = decodeURIComponent(url.split('/').pop()).toLowerCase();
      const cfg2 = loadConfig();
      cfg2.macList = cfg2.macList.filter(m => m.mac !== mac);
      saveConfig(cfg2); renderConfigs(cfg2);
      if (await isActive()) await apRestart();
      return send(res, 200, { ok: true, macList: cfg2.macList });
    }
    if (url.startsWith('/api/whitelist/') && req.method === 'PUT') {
      const mac = decodeURIComponent(url.split('/').pop()).toLowerCase();
      const body = await readBody(req);
      const cfg2 = loadConfig();
      const entry = cfg2.macList.find(m => m.mac === mac);
      if (entry) { entry.name = (body.name || '').trim(); saveConfig(cfg2); }
      return send(res, 200, { ok: true, macList: cfg2.macList });
    }
    if (url === '/api/whitelist/export' && req.method === 'GET') {
      return send(res, 200, { macList: cfg.macList });
    }
    if (url === '/api/whitelist/import' && req.method === 'POST') {
      const body = await readBody(req);
      const list = normalizeMacList(body.macList);
      if (!list.length) return send(res, 400, { ok: false, error: 'Lista vacía' });
      const cfg2 = loadConfig();
      cfg2.macList = list;
      saveConfig(cfg2); renderConfigs(cfg2);
      if (await isActive()) await apRestart();
      return send(res, 200, { ok: true, macList: cfg2.macList });
    }
    if (isApi) return send(res, 404, { error: 'Not found' });
    return serveStatic(res, url);
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

renderConfigs(loadConfig());

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ds-wifi] UI en http://0.0.0.0:${PORT}`);
});

// poll: última conexión + auto-off por inactividad
setInterval(async () => {
  const cfg = loadConfig();
  const snap = await getStatusJSON();
  const clients = snap.clients || [];
  touchLastSeen(clients.map(c => c.mac));
  if (!cfg.autoOffMinutes || cfg.autoOffMinutes <= 0) return;
  if (!(await isActive())) return;
  if (clients.length > 0) { lastSeen = Date.now(); return; }
  if (Date.now() - lastSeen > cfg.autoOffMinutes * 60000) {
    console.log('[ds-wifi] auto-off por inactividad');
    await apStop();
  }
}, 30000);
