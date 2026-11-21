// Merges research/*.json into data/atlas.json and enriches the base layer into data/facilities.json.
// - de-duplicates campuses, entities and deals
// - normalises status / type vocabularies
// - assigns countries & continents by point-in-polygon (Natural Earth 50m)
// - links base-layer operators to known players
// - creates stub players for ids referenced but not yet researched
// - writes research/QA.md with everything that needs a human look
// Usage: node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(root, ...p);
const qa = [];
const note = (s) => qa.push(s);

// ---------- load research ----------
function loadAll(prefix, key) {
  const out = [];
  for (const f of fs.readdirSync(R('research')).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort()) {
    try {
      const j = JSON.parse(fs.readFileSync(R('research', f), 'utf8'));
      for (const rec of j[key] || []) out.push({ ...rec, _file: f });
    } catch (e) {
      note(`⚠️ Could not parse research/${f}: ${e.message}`);
    }
  }
  return out;
}
const rawCampuses = loadAll('campuses_', 'campuses');
const rawEntities = loadAll('entities_', 'entities');
const rawDeals = loadAll('deals_', 'deals');
const rawCapex = loadAll('capex', 'capex');
const rawMetrics = loadAll('returns', 'metrics');

// ---------- helpers ----------
const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-eE]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
// A record is unverified when the researcher flagged it (e.g. web-search budget ran out) or only has homepage links.
const UNVERIFIED = /un-?verified|not (re-?)?verified|not re-?checked/i;
const NOTE_FIELDS = ['powerNote', 'investmentNote', 'amountNote', 'fundingNote', 'capexNote', 'note', 'notes', 'summary'];
const isVerified = (r) => {
  const notes = NOTE_FIELDS.map((k) => r[k]).filter(Boolean).join(' ');
  if (UNVERIFIED.test(notes)) return false;
  return !arr(r.sources).some((s) => UNVERIFIED.test(s?.title || ''));
};
// Strip researcher flags like "[NOT RE-VERIFIED 2026-11-20 …]" or "UNVERIFIED-2026:" from text shown to visitors.
const stripFlags = (s) =>
  typeof s === 'string'
    ? s.replace(/^\s*\[[^\]]*verif[^\]]*\]\s*[:—-]?\s*/i, '').replace(/^\s*UNVERIFIED[-\w]*[:\s—-]*/i, '').trim() || null
    : s;
const cleanNotes = (r) => {
  for (const k of NOTE_FIELDS) if (r[k]) r[k] = stripFlags(r[k]);
  return r;
};
const filled = (o) => Object.values(o).filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).length;
const km = (a, b) => {
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ---------- countries (point in polygon) ----------
const countries = JSON.parse(fs.readFileSync(R('scripts', '.cache', 'countries-50m.geojson'), 'utf8')).features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of polys) for (const [x, y] of p[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { ...f.properties, polys, bbox: [minX, minY, maxX, maxY] };
});
const inRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function countryAt(lat, lng) {
  const offsets = [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3]];
  for (const [dy, dx] of offsets) {
    const y = lat + dy, x = lng + dx;
    for (const c of countries) {
      if (x < c.bbox[0] || x > c.bbox[2] || y < c.bbox[1] || y > c.bbox[3]) continue;
      for (const p of c.polys) if (inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h))) return c;
    }
  }
  return null;
}
const byIso = new Map(countries.filter((c) => c.iso2).map((c) => [c.iso2, c]));
const fixIso = { UK: 'GB', EL: 'GR' };

// ---------- vocabularies ----------
function normStatus(s) {
  const t = String(s || '').toLowerCase();
  if (/cancel|withdrawn|abandon|scrapp|terminated/.test(t)) return 'cancelled';
  if (/block|denied|reject|moratorium|halt/.test(t)) return 'blocked';
  if (/scaled|downsiz|reduced/.test(t)) return 'scaled-back';
  if (/pause|hold|delay|suspend|stall/.test(t)) return 'paused';
  if (/partial|phase 1 (live|operational)|ramping/.test(t)) return 'partial';
  if (/construct|building/.test(t)) return 'construction';
  if (/operat|live|active|online|complete/.test(t)) return 'operational';
  if (/announc/.test(t)) return 'announced';
  if (/plan|propos|approv|permit|develop/.test(t)) return 'planned';
  return 'planned';
}
function normType(s) {
  const t = String(s || '').toLowerCase();
  if (/cluster|market/.test(t)) return 'cluster';
  if (/crypto|bitcoin|mining/.test(t)) return 'crypto';
  if (/sovereign/.test(t)) return 'sovereign';
  if (/ai/.test(t)) return 'ai';
  if (/hyperscale|cloud/.test(t)) return 'cloud';
  if (/colo|wholesale|retail|interconnect/.test(t)) return 'colo';
  if (/enterprise/.test(t)) return 'enterprise';
  return 'cloud';
}
const kindNorm = (k) => {
  const t = String(k || '').toLowerCase();
  const known = ['hyperscaler', 'ai-lab', 'neocloud', 'colo-operator', 'developer', 'crypto-miner', 'private-equity', 'infra-fund', 'sovereign-wealth', 'pension', 'asset-manager', 'bank', 'chipmaker', 'utility', 'energy', 'government', 'conglomerate', 'telco', 'other'];
  if (known.includes(t)) return t;
  if (/sovereign|swf/.test(t)) return 'sovereign-wealth';
  if (/private equity|pe\b/.test(t)) return 'private-equity';
  if (/infra/.test(t)) return 'infra-fund';
  if (/colo|reit|data cent/.test(t)) return 'colo-operator';
  if (/lab/.test(t)) return 'ai-lab';
  if (/miner|crypto|bitcoin/.test(t)) return 'crypto-miner';
  if (/bank|lender|credit/.test(t)) return 'bank';
  if (/chip|semi/.test(t)) return 'chipmaker';
  if (/util|power/.test(t)) return 'utility';
  if (/gov|state|ministry/.test(t)) return 'government';
  if (/telco|telecom/.test(t)) return 'telco';
  return 'other';
};

// ---------- entities ----------
const entities = new Map();
for (const e of rawEntities) {
  const id = e.id ? slug(e.id) : slug(e.name);
  if (!id) continue;
  const prev = entities.get(id);
  const rec = cleanNotes({ ...e, id, kind: kindNorm(e.kind), verified: isVerified(e) });
  if (rec.hq) {
    rec.hq = { ...rec.hq, lat: num(rec.hq.lat), lng: num(rec.hq.lng) };
    if (rec.hq.lat == null || rec.hq.lng == null) rec.hq = rec.hq.city ? { ...rec.hq, lat: null, lng: null } : null;
  }
  if (!prev || filled(rec) > filled(prev)) entities.set(id, prev ? { ...prev, ...rec, sources: [...arr(prev.sources), ...arr(rec.sources)] } : rec);
}

// ---------- campuses ----------
const campuses = [];
const seenIds = new Map();
let merged = 0;
for (const c of rawCampuses) {
  const lat = num(c.lat), lng = num(c.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    note(`📍 Campus without usable coordinates (skipped): ${c.name} [${c._file}]`);
    continue;
  }
  const rec = {
    ...c,
    id: slug(c.id || c.name),
    lat, lng,
    statusRaw: c.status,
    status: normStatus(c.status),
    typeRaw: c.type,
    type: normType(c.type),
    powerMW: num(c.powerMW),
    powerMWNow: num(c.powerMWNow),
    investmentUSD: num(c.investmentUSD),
    lostInvestmentUSD: num(c.lostInvestmentUSD),
    acres: num(c.acres),
    owners: arr(c.owners).map((o) => (typeof o === 'string' ? { name: o } : o)).map((o) => ({ ...o, entityId: o.entityId ? slug(o.entityId) : null, stakePct: num(o.stakePct) })),
    tenants: arr(c.tenants).map((o) => (typeof o === 'string' ? { name: o } : o)).map((o) => ({ ...o, entityId: o.entityId ? slug(o.entityId) : null })),
    capitalStack: arr(c.capitalStack).map((k) => ({ ...k, entityId: k.entityId ? slug(k.entityId) : null, amountUSD: num(k.amountUSD) })),
    sources: arr(c.sources).filter((s) => s && s.url),
  };
  if (rec.status === 'operational' && rec.powerMWNow == null && rec.powerMW != null) rec.powerMWNow = rec.powerMW;
  rec.verified = isVerified(c);
  cleanNotes(rec);
  // duplicate? same id, or within 8 km with a shared distinctive name token
  const tokens = new Set(slug(rec.name).split('-').filter((t) => t.length > 3 && !['data', 'center', 'centre', 'campus', 'park', 'project', 'site', 'phase'].includes(t)));
  // Scrapped-project records only merge on an exact id: a nearby live campus must never inherit a dead status.
  const SCRAPPED = 'campuses_scrapped.json';
  const dup = seenIds.get(rec.id) ||
    (rec._file === SCRAPPED ? null : campuses.find((o) => o._file !== SCRAPPED && km(o, rec) < 8 && slug(o.name).split('-').some((t) => tokens.has(t)) && o.type === rec.type));
  if (dup) {
    merged++;
    note(`🔁 Merged duplicate campus "${rec.name}" [${rec._file}] into "${dup.name}" [${dup._file}]`);
    const keep = filled(rec) > filled(dup) ? rec : dup;
    const other = keep === rec ? dup : rec;
    const mergedRec = { ...other, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))) };
    mergedRec.sources = [...new Map([...arr(dup.sources), ...arr(rec.sources)].map((s) => [s.url, s])).values()];
    mergedRec.id = dup.id;
    const dead = [rec, dup].find((r) => r._file === SCRAPPED);
    if (dead) Object.assign(mergedRec, { status: dead.status, statusRaw: dead.statusRaw, reason: dead.reason || mergedRec.reason, lostInvestmentUSD: dead.lostInvestmentUSD ?? mergedRec.lostInvestmentUSD });
    mergedRec.verified = rec.verified && dup.verified;
    Object.assign(dup, mergedRec);
    continue;
  }
  // unique id
  let id = rec.id, n = 2;
  while (seenIds.has(id)) id = `${rec.id}-${n++}`;
  rec.id = id;
  seenIds.set(id, rec);
  campuses.push(rec);
}
for (const c of campuses) {
  let iso = c.countryCode ? String(c.countryCode).toUpperCase() : null;
  iso = fixIso[iso] || iso;
  const hit = countryAt(c.lat, c.lng);
  if (!iso && hit) iso = hit.iso2;
  if (hit && iso && hit.iso2 && hit.iso2 !== iso) note(`🌍 ${c.name}: countryCode ${iso} but coordinates fall in ${hit.iso2} (${hit.name}) — check coordinates`);
  c.countryCode = iso;
  const meta = (iso && byIso.get(iso)) || hit;
  c.country = c.country || meta?.name || null;
  c.continent = meta?.continent || null;
  if (!c.sources.length) note(`📚 No sources: campus ${c.name}`);
  if (!c.verified) note(`❔ Unverified (flagged by researcher): campus ${c.name}`);
  delete c._file;
}

// ---------- deals ----------
const deals = [];
const dealIds = new Set();
for (const d of rawDeals) {
  const rec = {
    ...d,
    id: slug(d.id || `${d.title}-${d.date}`),
    amountUSD: num(d.amountUSD),
    investors: arr(d.investors).map((o) => (typeof o === 'string' ? { name: o } : o)).map((o) => ({ ...o, entityId: o.entityId ? slug(o.entityId) : null })),
    sellers: arr(d.sellers).map((o) => (typeof o === 'string' ? { name: o } : o)).map((o) => ({ ...o, entityId: o.entityId ? slug(o.entityId) : null })),
    target: d.target ? (typeof d.target === 'string' ? { name: d.target } : { ...d.target, entityId: d.target.entityId ? slug(d.target.entityId) : null }) : null,
    campusIds: arr(d.campusIds).map(slug),
    status: String(d.status || 'announced').toLowerCase(),
    sources: arr(d.sources).filter((s) => s && s.url),
  };
  rec.verified = isVerified(d);
  // Announcements of money to be raised/spent over years ("pledge up to $500B") are pledges, whatever the deal type.
  rec.pledge = ['capex-commitment', 'sovereign-commitment'].includes(rec.kind) || (rec.kind === 'jv' && /pledg|up to|mobili[sz]e|aims? to/i.test(rec.title || ''));
  cleanNotes(rec);
  if (dealIds.has(rec.id)) { note(`🔁 Duplicate deal id ${rec.id} dropped`); continue; }
  // same parties + same month + amount within 5% → duplicate
  const dup = deals.find((o) => o.target?.entityId && o.target?.entityId === rec.target?.entityId && String(o.date).slice(0, 7) === String(rec.date).slice(0, 7) && o.amountUSD && rec.amountUSD && Math.abs(o.amountUSD - rec.amountUSD) / o.amountUSD < 0.05);
  if (dup) { note(`🔁 Duplicate deal "${rec.title}" merged into "${dup.title}"`); continue; }
  dealIds.add(rec.id);
  if (!rec.sources.length) note(`📚 No sources: deal ${rec.title}`);
  delete rec._file;
  deals.push(rec);
}
deals.sort((a, b) => String(b.date).localeCompare(String(a.date)));
for (const d of deals) d.campusIds = d.campusIds.filter((id) => { if (seenIds.has(id)) return true; note(`🔗 Deal ${d.id} references unknown campus ${id}`); return false; });

// ---------- capex & metrics ----------
const capex = rawCapex.map((c) => cleanNotes({ ...c, entityId: slug(c.entityId), year: num(c.year), capexUSD: num(c.capexUSD), verified: isVerified(c) })).filter((c) => c.year && c.capexUSD);
const metrics = rawMetrics.map((m) => cleanNotes({ ...m, entityId: m.entityId ? slug(m.entityId) : null, value: num(m.value), verified: m.verified === false ? false : isVerified(m) }));
// Stalled-project events (lease walk-aways, failed mergers, redesigns) and industry-wide tallies.
const events = loadAll('campuses_scrapped', 'events').map((e) => {
  const out = cleanNotes({ ...e, verified: isVerified(e), lat: num(e.lat), lng: num(e.lng), mw: num(e.mw), lostInvestmentUSD: num(e.lostInvestmentUSD), entityIds: arr(e.entityIds).map(slug), relatedCampusId: e.relatedCampusId ? slug(e.relatedCampusId) : null });
  delete out._file;
  return out;
}).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const aggregates = loadAll('campuses_scrapped', 'aggregates').map((a) => {
  const out = cleanNotes({ ...a, verified: isVerified(a), value: num(a.value) });
  delete out._file;
  return out;
});
events.forEach((e) => { if (e.relatedCampusId && !seenIds.has(e.relatedCampusId)) e.relatedCampusId = null; });
capex.forEach((c) => delete c._file);
metrics.forEach((m) => delete m._file);

// ---------- stub entities for dangling references ----------
const refs = new Map();
const ref = (id, name, where) => {
  if (!id) return;
  if (!refs.has(id)) refs.set(id, { name, where: new Set() });
  refs.get(id).where.add(where);
};
for (const c of campuses) {
  c.owners.forEach((o) => ref(o.entityId, o.name, 'campus owner'));
  c.tenants.forEach((o) => ref(o.entityId, o.name, 'campus tenant'));
  c.capitalStack.forEach((o) => ref(o.entityId, o.from, 'capital stack'));
}
for (const d of deals) {
  d.investors.forEach((o) => ref(o.entityId, o.name, 'deal investor'));
  d.sellers.forEach((o) => ref(o.entityId, o.name, 'deal seller'));
  if (d.target) ref(d.target.entityId, d.target.name, 'deal target');
}
capex.forEach((c) => ref(c.entityId, c.entityId, 'capex'));
metrics.forEach((m) => ref(m.entityId, m.entityId, 'metric'));
const stubs = [];
for (const [id, r] of refs) {
  if (entities.has(id)) continue;
  stubs.push(id);
  entities.set(id, { id, name: r.name || id, kind: 'other', stub: true, hq: null, sources: [] });
}
// Well-known headquarters (city level) for players that appear in deals/campuses but have no profile yet,
// so their money arcs can be drawn. [name, kind, city, countryCode, lat, lng]
const HQ_FALLBACK = {
  'china-mobile': ['China Mobile', 'telco', 'Beijing', 'CN', 39.904, 116.407],
  'china-telecom': ['China Telecom', 'telco', 'Beijing', 'CN', 39.904, 116.407],
  'china-unicom': ['China Unicom', 'telco', 'Beijing', 'CN', 39.904, 116.407],
  'china-ndrc': ['China NDRC', 'government', 'Beijing', 'CN', 39.904, 116.407],
  coatue: ['Coatue Management', 'asset-manager', 'New York', 'US', 40.713, -74.006],
  'valor-equity-partners': ['Valor Equity Partners', 'private-equity', 'Chicago', 'US', 41.878, -87.63],
  'european-commission': ['European Commission', 'government', 'Brussels', 'BE', 50.85, 4.352],
  cisco: ['Cisco', 'other', 'San Jose', 'US', 37.338, -121.886],
  ascenty: ['Ascenty', 'colo-operator', 'São Paulo', 'BR', -23.551, -46.633],
  huawei: ['Huawei', 'other', 'Shenzhen', 'CN', 22.543, 114.058],
  fidelity: ['Fidelity Investments', 'asset-manager', 'Boston', 'US', 42.36, -71.059],
  edgecore: ['EdgeCore Digital Infrastructure', 'developer', 'Denver', 'US', 39.739, -104.99],
  coresite: ['CoreSite', 'colo-operator', 'Denver', 'US', 39.739, -104.99],
  tract: ['Tract', 'developer', 'Denver', 'US', 39.739, -104.99],
  ovhcloud: ['OVHcloud', 'colo-operator', 'Roubaix', 'FR', 50.694, 3.175],
  scala: ['Scala Data Centers', 'colo-operator', 'São Paulo', 'BR', -23.551, -46.633],
  'indiaai-mission': ['IndiaAI Mission', 'government', 'New Delhi', 'IN', 28.614, 77.209],
  'government-of-india': ['Government of India', 'government', 'New Delhi', 'IN', 28.614, 77.209],
  'colt-dcs': ['Colt DCS', 'colo-operator', 'London', 'GB', 51.507, -0.128],
  'larsen-toubro': ['Larsen & Toubro', 'conglomerate', 'Mumbai', 'IN', 19.076, 72.878],
  'hdfc-bank': ['HDFC Bank', 'bank', 'Mumbai', 'IN', 19.076, 72.878],
  'tokyo-century': ['Tokyo Century', 'other', 'Tokyo', 'JP', 35.676, 139.65],
  'japan-meti': ['Japan METI', 'government', 'Tokyo', 'JP', 35.676, 139.65],
  foxconn: ['Foxconn (Hon Hai)', 'other', 'New Taipei', 'TW', 24.994, 121.421],
  tsmc: ['TSMC', 'chipmaker', 'Hsinchu', 'TW', 24.814, 120.968],
  'taiwan-nstc': ['Taiwan NSTC', 'government', 'Taipei', 'TW', 25.033, 121.565],
  evroc: ['evroc', 'neocloud', 'Stockholm', 'SE', 59.329, 18.069],
  'deutsche-telekom': ['Deutsche Telekom', 'telco', 'Bonn', 'DE', 50.737, 7.098],
  'schwarz-group': ['Schwarz Group', 'conglomerate', 'Neckarsulm', 'DE', 49.192, 9.225],
  'israel-government': ['Government of Israel', 'government', 'Jerusalem', 'IL', 31.768, 35.214],
  dell: ['Dell Technologies', 'other', 'Round Rock', 'US', 30.508, -97.679],
  'jane-street': ['Jane Street', 'asset-manager', 'New York', 'US', 40.713, -74.006],
  a16z: ['Andreessen Horowitz', 'private-equity', 'Menlo Park', 'US', 37.453, -122.182],
  sequoia: ['Sequoia Capital', 'private-equity', 'Menlo Park', 'US', 37.453, -122.182],
  'kingdom-holding': ['Kingdom Holding', 'conglomerate', 'Riyadh', 'SA', 24.714, 46.675],
  datavolt: ['DataVolt', 'developer', 'Riyadh', 'SA', 24.714, 46.675],
  'vy-capital': ['Vy Capital', 'private-equity', 'Dubai', 'AE', 25.205, 55.271],
  sabey: ['Sabey Data Centers', 'colo-operator', 'Seattle', 'US', 47.606, -122.332],
  estruxture: ['eStruxture', 'colo-operator', 'Montreal', 'CA', 45.502, -73.567],
  bce: ['BCE (Bell Canada)', 'telco', 'Montreal', 'CA', 45.502, -73.567],
  cohere: ['Cohere', 'ai-lab', 'Toronto', 'CA', 43.653, -79.383],
  telus: ['Telus', 'telco', 'Vancouver', 'CA', 49.283, -123.121],
  kio: ['KIO Data Centers', 'colo-operator', 'Mexico City', 'MX', 19.433, -99.133],
  elea: ['Elea Data Centers', 'colo-operator', 'Rio de Janeiro', 'BR', -22.907, -43.173],
  ifc: ['IFC (World Bank Group)', 'bank', 'Washington, DC', 'US', 38.907, -77.037],
  capitaland: ['CapitaLand', 'asset-manager', 'Singapore', 'SG', 1.29, 103.85],
  keppel: ['Keppel', 'conglomerate', 'Singapore', 'SG', 1.29, 103.85],
  'bridge-data-centres': ['Bridge Data Centres', 'colo-operator', 'Singapore', 'SG', 1.29, 103.85],
  'k2-strategic': ['K2 Strategic', 'infra-fund', 'Singapore', 'SG', 1.29, 103.85],
  'singapore-imda': ['Singapore IMDA', 'government', 'Singapore', 'SG', 1.29, 103.85],
  sunevision: ['SUNeVision', 'colo-operator', 'Hong Kong', 'HK', 22.319, 114.169],
  naver: ['Naver', 'other', 'Seongnam', 'KR', 37.359, 127.105],
  gcbd: ['Guizhou-Cloud Big Data', 'other', 'Guiyang', 'CN', 26.647, 106.63],
  nwcd: ['Ningxia Western Cloud Data', 'colo-operator', 'Yinchuan', 'CN', 38.487, 106.231],
  'andhra-pradesh-govt': ['Government of Andhra Pradesh', 'government', 'Amaravati', 'IN', 16.515, 80.516],
  ukaea: ['UK Atomic Energy Authority', 'government', 'Culham', 'GB', 51.66, -1.229],
  'uk-government': ['UK Government', 'government', 'London', 'GB', 51.507, -0.128],
  'uk-national-wealth-fund': ['UK National Wealth Fund', 'government', 'London', 'GB', 51.507, -0.128],
  segro: ['SEGRO', 'other', 'London', 'GB', 51.507, -0.128],
  'cassava': ['Cassava Technologies', 'telco', 'London', 'GB', 51.507, -0.128],
};
for (const [id, [name, kind, city, cc, lat, lng]] of Object.entries(HQ_FALLBACK)) {
  const e = entities.get(id);
  if (!e || (e.hq && e.hq.lat != null)) continue;
  Object.assign(e, { name: e.stub ? name : e.name, kind: e.kind === 'other' ? kind : e.kind, hq: { city, countryCode: cc, lat, lng, precision: 'city (fallback table)' } });
}
if (stubs.length) note(`🧩 ${stubs.length} referenced players not yet researched (stubbed): ${stubs.sort().join(', ')}`);
for (const e of entities.values()) {
  e.ownedBy = arr(e.ownedBy).map((o) => ({ ...o, entityId: slug(o.entityId || o.name), stakePct: num(o.stakePct) }));
  e.ownedBy.forEach((o) => { if (!entities.has(o.entityId)) entities.set(o.entityId, { id: o.entityId, name: o.name || o.entityId, kind: 'other', stub: true, hq: null, sources: [] }); });
  if (e.hq?.countryCode) e.hq.countryCode = fixIso[e.hq.countryCode] || e.hq.countryCode;
  if (e.hq && e.hq.lat != null && !e.hq.countryCode) e.hq.countryCode = countryAt(e.hq.lat, e.hq.lng)?.iso2 || null;
  if (!e.stub && !e.hq?.lat) note(`📍 Player without HQ coordinates (no money arcs): ${e.name}`);
  delete e._file;
}

// ---------- base layer: countries + operator → player links ----------
const base = JSON.parse(fs.readFileSync(R('data', 'base-layer.json'), 'utf8'));
const ci = Object.fromEntries(base.cols.map((c, i) => [c, i]));
const aliasRules = [
  ['equinix', /\bequinix\b/i], ['digital-realty', /digital realty|interxion|\bteraco\b|digital core reit|ascenty/i],
  ['ntt-data', /\bntt\b|e-shelter|raging ?wire|netmagic/i], ['st-telemedia', /\bstt\b|st telemedia|tata communications data/i],
  ['cyrusone', /cyrusone/i], ['qts', /\bqts\b/i], ['vantage', /vantage data/i], ['switch', /^switch\b|switch, ltd|switch datacenters/i],
  ['cologix', /cologix/i], ['coresite', /coresite/i], ['iron-mountain', /iron mountain/i], ['flexential', /flexential/i],
  ['databank', /databank/i], ['global-switch', /global switch/i], ['telehouse', /telehouse/i], ['kddi', /\bkddi\b/i],
  ['data4', /\bdata ?4\b/i], ['africa-data-centres', /africa data cent/i], ['airtrunk', /airtrunk/i], ['nextdc', /nextdc/i],
  ['princeton-digital', /princeton digital/i], ['yondr', /yondr/i], ['aligned', /aligned (data|energy)/i], ['edgeconnex', /edgeconnex/i],
  ['stack-infrastructure', /stack infrastructure|^stack\b/i], ['compass', /compass datacenters/i], ['cloudhq', /cloudhq/i],
  ['google', /\bgoogle\b/i], ['microsoft', /microsoft|azure/i], ['amazon', /amazon|\baws\b/i], ['meta', /\bmeta\b|facebook/i],
  ['apple', /^apple\b/i], ['oracle', /\boracle\b/i], ['alibaba', /alibaba|aliyun/i], ['tencent', /tencent/i], ['gds', /\bgds\b|dayone/i],
  ['chindata', /chindata/i], ['yotta', /\byotta\b/i], ['sify', /\bsify\b/i], ['ctrls', /ctrls/i], ['airtel', /nxtra|airtel/i],
  ['reliance', /reliance/i], ['adani', /adani/i], ['khazna', /khazna/i], ['g42', /\bg42\b/i], ['ovhcloud', /\bovh/i],
  ['hetzner', /hetzner/i], ['leaseweb', /leaseweb/i], ['colt', /\bcolt\b/i], ['cdc-data-centres', /\bcdc data/i],
  ['keppel', /keppel/i], ['bridge-data-centres', /bridge data cent/i], ['ytl', /\bytl\b/i], ['open-access', /open access data/i],
  ['rack-centre', /rack centre/i], ['kao-data', /kao data/i], ['ark', /\bark data/i], ['virtus', /virtus/i], ['atnorth', /atnorth/i],
  ['verne', /verne/i], ['ecodatacenter', /ecodatacenter/i], ['crusoe', /crusoe/i], ['coreweave', /coreweave/i], ['nebius', /nebius/i],
  ['lambda', /lambda labs|lambda,? inc/i], ['scala', /scala data/i], ['odata', /\bodata\b/i], ['kio', /\bkio\b/i],
  ['lumen', /\blumen\b|centurylink|level ?3/i], ['zayo', /\bzayo\b/i], ['cogent', /\bcogent\b/i], ['telstra', /telstra/i],
  ['china-telecom', /china telecom/i], ['china-mobile', /china mobile/i], ['china-unicom', /china unicom/i],
  ['sakura-internet', /sakura internet/i], ['naver', /\bnaver\b/i], ['kt', /^kt\b|kt cloud/i], ['singtel', /singtel|nxera/i],
];
let linked = 0, ccFilled = 0;
base.cols.push('eid', 'continent');
// Registries sometimes carry contact emails in free-text fields; never publish them.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
for (const row of base.rows) {
  for (let i = 0; i < row.length; i++) {
    if (typeof row[i] !== 'string') continue;
    if (i === ci.web) row[i] = /^https?:\/\//i.test(row[i]) && !row[i].includes('@') ? row[i] : null;
    else if (EMAIL.test(row[i])) row[i] = row[i].replace(EMAIL, '').replace(/\s{2,}/g, ' ').trim() || null;
    EMAIL.lastIndex = 0;
  }
}
for (const row of base.rows) {
  let cc = row[ci.cc];
  if (cc) cc = fixIso[cc] || cc;
  const hit = !cc ? countryAt(row[ci.lat], row[ci.lng]) : null;
  if (!cc && hit) { cc = hit.iso2; ccFilled++; }
  row[ci.cc] = cc || null;
  const hay = `${row[ci.operator] || ''} | ${row[ci.name] || ''}`;
  const rule = aliasRules.find(([, re]) => re.test(hay));
  row.push(rule ? rule[0] : null);
  if (rule) linked++;
  row.push((cc && byIso.get(cc)?.continent) || hit?.continent || null);
}
for (const [id] of aliasRules) {
  if (!entities.has(id) && base.rows.some((r) => r[ci.cc] !== undefined && r[base.cols.length - 2] === id)) {
    const sample = base.rows.find((r) => r[base.cols.length - 2] === id);
    entities.set(id, { id, name: sample[ci.operator] || id, kind: 'colo-operator', stub: true, hq: null, sources: [] });
  }
}
fs.writeFileSync(R('data', 'facilities.json'), JSON.stringify(base));

// ---------- write ----------
const atlas = {
  generated: new Date().toISOString().slice(0, 10),
  counts: { campuses: campuses.length, entities: entities.size, deals: deals.length, capex: capex.length, metrics: metrics.length, events: events.length, facilities: base.rows.length },
  campuses,
  entities: [...entities.values()].sort((a, b) => a.name.localeCompare(b.name)),
  deals,
  capex,
  metrics,
  events,
  aggregates,
};
fs.writeFileSync(R('data', 'atlas.json'), JSON.stringify(atlas));

const report = [
  `# Data QA report — ${atlas.generated}`,
  '',
  `- Campuses: **${campuses.length}** (${merged} duplicates merged) from ${rawCampuses.length} research records`,
  `- Players: **${entities.size}** (${stubs.length} stubs)`,
  `- Deals: **${deals.length}** · Capex rows: **${capex.length}** · Return metrics: **${metrics.length}**`,
  `- Facilities: **${base.rows.length}** (${ccFilled} countries assigned by coordinates, ${linked} linked to a known operator)`,
  '',
  '## Needs attention',
  '',
  ...qa.map((q) => `- ${q}`),
].join('\n');
fs.writeFileSync(R('research', 'QA.md'), report + '\n');
console.log(report.split('\n').slice(0, 8).join('\n'));
console.log(`QA items: ${qa.length} → research/QA.md`);
