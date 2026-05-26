const { exec } = require('child_process');
const net  = require('net');
const dns  = require('dns').promises;
const http = require('http');
const https = require('https');
const { successResponse, errorResponse } = require('../utils/response');

const isWindows = process.platform === 'win32';

// ── sanitize input — only allow safe hostname/IP chars ─────────────────────────
const SAFE_HOST = /^[a-zA-Z0-9.\-_:]+$/;
const sanitize  = (v) => (typeof v === 'string' && SAFE_HOST.test(v.trim()) ? v.trim() : null);

// ── 1. PING ────────────────────────────────────────────────────────────────────
const pingHost = (req, res) => {
  const host  = sanitize(req.body.host);
  const count = Math.min(parseInt(req.body.count || 4, 10), 10);
  if (!host) return errorResponse(res, 'Host/IP tidak valid', 400);

  const cmd = isWindows
    ? `ping -n ${count} ${host}`
    : `ping -c ${count} -W 2 ${host}`;

  const start = Date.now();
  exec(cmd, { timeout: 20000 }, (err, stdout, stderr) => {
    const elapsed = Date.now() - start;
    const raw     = stdout || stderr || (err ? err.message : '');

    // Parse times from output (works for both Linux and Windows ping)
    const times = [];
    const timeRe = /[=<](\d+(?:\.\d+)?)\s*ms/gi;
    let m;
    while ((m = timeRe.exec(raw)) !== null) times.push(parseFloat(m[1]));

    const avg  = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) : null;
    const min  = times.length ? Math.min(...times) : null;
    const max  = times.length ? Math.max(...times) : null;

    // Determine packet loss
    let loss = null;
    const lossMatch = raw.match(/(\d+)%\s*(packet\s*loss|loss|hilang)/i);
    if (lossMatch) loss = parseInt(lossMatch[1], 10);

    const reachable = !err || times.length > 0;

    return successResponse(res, {
      host, count, reachable,
      times, avg, min, max, loss,
      elapsed,
      raw,
    });
  });
};

// ── 2. PORT SCANNER ────────────────────────────────────────────────────────────
const portScan = async (req, res) => {
  const host    = sanitize(req.body.host);
  const portsRaw = req.body.ports || '80,443,22,3306,5432,3389,8080,8443';
  const timeout  = Math.min(parseInt(req.body.timeout || 1500, 10), 5000);

  if (!host) return errorResponse(res, 'Host/IP tidak valid', 400);

  // Parse ports: "80,443,8080" or "20-25" or mix
  const portSet = new Set();
  String(portsRaw).split(',').forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      if (!isNaN(a) && !isNaN(b)) {
        const lo = Math.min(a, b), hi = Math.min(Math.max(a, b), lo + 99); // max 100 range
        for (let p = lo; p <= hi; p++) portSet.add(p);
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p > 0 && p <= 65535) portSet.add(p);
    }
  });

  if (portSet.size === 0) return errorResponse(res, 'Daftar port tidak valid', 400);
  if (portSet.size > 200)  return errorResponse(res, 'Maksimal 200 port per scan', 400);

  const checkPort = (port) => new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.on('connect', () => { sock.destroy(); resolve({ port, status: 'open' }); });
    sock.on('timeout', () => { sock.destroy(); resolve({ port, status: 'filtered' }); });
    sock.on('error',   () => { sock.destroy(); resolve({ port, status: 'closed' }); });
    sock.connect(port, host);
  });

  const results = await Promise.all([...portSet].sort((a, b) => a - b).map(checkPort));
  const open    = results.filter(r => r.status === 'open').length;

  // Common service names
  const SERVICE = {
    21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',
    80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',
    445:'SMB',3306:'MySQL',3389:'RDP',5432:'PostgreSQL',
    5900:'VNC',6379:'Redis',8080:'HTTP-Alt',8443:'HTTPS-Alt',
    27017:'MongoDB',
  };
  results.forEach(r => { r.service = SERVICE[r.port] || null; });

  return successResponse(res, { host, scanned: results.length, open, results });
};

// ── 3. DNS LOOKUP ──────────────────────────────────────────────────────────────
const dnsLookup = async (req, res) => {
  const domain   = sanitize(req.body.domain);
  const types    = req.body.types || ['A','AAAA','MX','NS','TXT','CNAME'];

  if (!domain) return errorResponse(res, 'Domain tidak valid', 400);

  const results = {};
  const errors  = {};

  await Promise.all(types.map(async (type) => {
    try {
      switch (type) {
        case 'A':
          results.A = await dns.resolve4(domain);
          break;
        case 'AAAA':
          results.AAAA = await dns.resolve6(domain);
          break;
        case 'MX':
          results.MX = await dns.resolveMx(domain);
          break;
        case 'NS':
          results.NS = await dns.resolveNs(domain);
          break;
        case 'TXT':
          results.TXT = (await dns.resolveTxt(domain)).map(r => r.join(' '));
          break;
        case 'CNAME':
          results.CNAME = await dns.resolveCname(domain);
          break;
        case 'SOA':
          results.SOA = await dns.resolveSoa(domain);
          break;
        default: break;
      }
    } catch (e) {
      errors[type] = e.code || e.message;
    }
  }));

  // Reverse lookup for A records
  let reverseMap = {};
  if (results.A) {
    await Promise.all(results.A.map(async (ip) => {
      try {
        const hosts = await dns.reverse(ip);
        reverseMap[ip] = hosts;
      } catch (_) {
        reverseMap[ip] = null;
      }
    }));
  }

  return successResponse(res, { domain, results, errors, reverseMap });
};

// ── 4. SUBNET CALCULATOR ───────────────────────────────────────────────────────
const subnetCalc = (req, res) => {
  const cidr = (req.body.cidr || '').trim();
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!match) return errorResponse(res, 'Format CIDR tidak valid. Contoh: 192.168.1.0/24', 400);

  const [, a, b, c, d, prefix] = match.map(Number);
  if ([a,b,c,d].some(o => o > 255) || prefix > 32) {
    return errorResponse(res, 'Nilai IP atau prefix tidak valid', 400);
  }

  const ipNum   = (a<<24)|(b<<16)|(c<<8)|d;
  const mask    = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const bcast   = (network | (~mask >>> 0)) >>> 0;
  const wildcard = (~mask) >>> 0;
  const hosts   = prefix >= 31 ? Math.pow(2, 32 - prefix) : Math.pow(2, 32 - prefix) - 2;
  const firstH  = prefix >= 31 ? network : (network + 1) >>> 0;
  const lastH   = prefix >= 31 ? bcast   : (bcast   - 1) >>> 0;

  const toIP = (n) => [n>>>24, (n>>>16)&255, (n>>>8)&255, n&255].join('.');

  return successResponse(res, {
    input:       cidr,
    network:     toIP(network) + '/' + prefix,
    networkAddr: toIP(network),
    broadcast:   toIP(bcast),
    subnetMask:  toIP(mask),
    wildcard:    toIP(wildcard),
    firstHost:   toIP(firstH),
    lastHost:    toIP(lastH),
    totalHosts:  Math.pow(2, 32 - prefix),
    usableHosts: Math.max(hosts, 0),
    prefix,
    ipClass:     a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D (Multicast)' : 'E (Reserved)',
    isPrivate:   (a===10) || (a===172&&b>=16&&b<=31) || (a===192&&b===168),
  });
};

// ── 5. HTTP CHECKER ────────────────────────────────────────────────────────────
const httpCheck = (req, res) => {
  let url = (req.body.url || '').trim();
  if (!url) return errorResponse(res, 'URL tidak boleh kosong', 400);
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

  let parsed;
  try { parsed = new URL(url); } catch (_) {
    return errorResponse(res, 'URL tidak valid', 400);
  }

  const lib    = parsed.protocol === 'https:' ? https : http;
  const start  = Date.now();
  const reqOpts = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path:     parsed.pathname + parsed.search,
    method:   'HEAD',
    timeout:  8000,
    headers:  { 'User-Agent': 'IT-Ticketing-Tools/1.0' },
    rejectUnauthorized: false,
  };

  const request = lib.request(reqOpts, (response) => {
    const elapsed = Date.now() - start;
    const headers = response.headers;
    request.destroy();
    return successResponse(res, {
      url,
      reachable:    true,
      statusCode:   response.statusCode,
      statusText:   response.statusMessage,
      elapsed,
      server:       headers.server || null,
      contentType:  headers['content-type'] || null,
      poweredBy:    headers['x-powered-by'] || null,
      sslExpiry:    null, // HEAD doesn't expose cert info easily
      redirectUrl:  [301,302,307,308].includes(response.statusCode) ? headers.location : null,
    });
  });

  request.on('timeout', () => {
    request.destroy();
    return successResponse(res, { url, reachable: false, error: 'Timeout', elapsed: Date.now() - start });
  });
  request.on('error', (e) => {
    return successResponse(res, { url, reachable: false, error: e.message, elapsed: Date.now() - start });
  });

  request.end();
};

// ── 6. WAKE-ON-LAN (info only — needs local UDP) ───────────────────────────────
const serverInfo = (req, res) => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const nets   = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    addrs.forEach(a => {
      if (!a.internal) nets.push({ iface: name, address: a.address, family: a.family, mac: a.mac });
    });
  }
  return successResponse(res, {
    hostname:    os.hostname(),
    platform:    os.platform(),
    release:     os.release(),
    uptime:      os.uptime(),
    loadavg:     os.loadavg(),
    totalMem:    os.totalmem(),
    freeMem:     os.freemem(),
    cpus:        os.cpus().length,
    cpuModel:    os.cpus()[0]?.model || 'Unknown',
    networks:    nets,
    nodeVersion: process.version,
  });
};

module.exports = { pingHost, portScan, dnsLookup, subnetCalc, httpCheck, serverInfo };
