// Builds data/base-layer.json: every data-center facility we can get from open registries.
//   1. OpenStreetMap (ODbL) — features tagged telecom=data_center or building=data_center, via Overpass
//   2. PeeringDB — interconnection facilities registry (colocation sites with coordinates)
// Usage: node scripts/fetch-base-layer.mjs        (Node 16+, no dependencies)
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'data', 'base-layer.json');
const UA = 'ComputeAtlas/0.1 (open data center map; build script)';

function request(url, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { 'User-Agent': UA, ...headers }, timeout: 900000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(request(new URL(res.headers.location, url).toString(), { method, body, headers }));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        resolve(text);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const round = (x) => Math.round(x * 1e5) / 1e5;

async function fetchOSM() {
  const query = `[out:json][timeout:600];
(
  nwr["telecom"="data_center"];
  nwr["building"="data_center"];
  nwr["building"="data_centre"];
);
out center tags;`;
  const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const m of mirrors) {
    try {
      console.log('OSM: querying', m);
      const text = await request(m, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const json = JSON.parse(text);
      const rows = [];
      for (const el of json.elements || []) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (lat == null || lng == null) continue;
        const t = el.tags || {};
        rows.push({
          src: 'osm',
          ref: `${el.type}/${el.id}`,
          lat: round(lat),
          lng: round(lng),
          name: t.name || t['name:en'] || null,
          operator: t.operator || t.owner || t.brand || null,
          city: t['addr:city'] || null,
          cc: (t['addr:country'] || '').toUpperCase() || null,
          web: t.website || t['contact:website'] || null,
        });
      }
      console.log('OSM: kept', rows.length, 'features');
      return rows;
    } catch (e) {
      console.warn('OSM mirror failed:', e.message);
    }
  }
  return [];
}

async function fetchPeeringDB() {
  try {
    console.log('PeeringDB: fetching facilities');
    const text = await request('https://www.peeringdb.com/api/fac?status=ok', { headers: { Accept: 'application/json' } });
    const json = JSON.parse(text);
    const rows = [];
    for (const f of json.data || []) {
      if (f.latitude == null || f.longitude == null) continue;
      rows.push({
        src: 'pdb',
        ref: `fac/${f.id}`,
        lat: round(Number(f.latitude)),
        lng: round(Number(f.longitude)),
        name: f.name || null,
        operator: f.org_name || null,
        city: f.city || null,
        cc: f.country || null,
        web: f.website || null,
        nets: f.net_count ?? null,
        ixs: f.ix_count ?? null,
      });
    }
    console.log('PeeringDB: kept', rows.length, 'facilities');
    return rows;
  } catch (e) {
    console.warn('PeeringDB failed:', e.message);
    return [];
  }
}

const [osm, pdb] = await Promise.all([fetchOSM(), fetchPeeringDB()]);

// De-duplicate: drop an OSM feature when a PeeringDB facility sits within ~150 m (PeeringDB rows carry richer metadata).
const key = (lat, lng) => `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
const grid = new Map();
for (const p of pdb) {
  const k = key(p.lat, p.lng);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(p);
}
const near = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) < 0.00135;
const osmKept = osm.filter((o) => {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cell = grid.get(`${Math.round(o.lat * 100) + dy}:${Math.round(o.lng * 100) + dx}`);
      if (cell && cell.some((p) => near(o, p))) return false;
    }
  return true;
});

// Drop contact emails that registries sometimes carry in free-text fields, and keep only http(s) websites.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
for (const r of [...pdb, ...osmKept]) {
  for (const k of ['name', 'operator', 'city']) if (typeof r[k] === 'string') r[k] = r[k].replace(EMAIL, '').trim() || null;
  if (r.web && (!/^https?:\/\//i.test(r.web) || r.web.includes('@'))) r.web = null;
}
const rows = [...pdb, ...osmKept];
// Compact columnar encoding keeps the file small for the browser.
const cols = ['src', 'ref', 'lat', 'lng', 'name', 'operator', 'city', 'cc', 'web', 'nets', 'ixs'];
const payload = {
  generated: new Date().toISOString().slice(0, 10),
  attribution: [
    'Facility locations © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)',
    'Interconnection facilities from PeeringDB (peeringdb.com)',
  ],
  counts: { peeringdb: pdb.length, osm: osm.length, osmAfterDedupe: osmKept.length, total: rows.length },
  cols,
  rows: rows.map((r) => cols.map((c) => (r[c] === undefined ? null : r[c]))),
};
fs.writeFileSync(out, JSON.stringify(payload));
console.log('Wrote', out, payload.counts, (fs.statSync(out).size / 1e6).toFixed(2) + ' MB');
