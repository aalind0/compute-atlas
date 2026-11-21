// Loads the atlas, builds indexes and derives money flows + headline numbers.
import { haversine, median, sum, yearOf, STATUSES } from './util.js';

export const S = {
  campuses: [],
  entities: [],
  deals: [],
  capex: [],
  metrics: [],
  facilities: [],
  countries: null,
  byCampus: new Map(),
  byEntity: new Map(),
  byDeal: new Map(),
  byFacility: new Map(),
  roles: new Map(), // entityId -> [{campus, role, amountUSD, stakePct, kind}]
  dealsOf: new Map(), // entityId -> [deal]
  facilitiesOf: new Map(), // entityId -> count
  children: new Map(), // entityId -> [{entity, stakePct}]  (who this entity owns)
  flows: [],
  generated: null,
};

export async function loadAll() {
  const [atlas, fac, countries] = await Promise.all([
    fetch('data/atlas.json').then((r) => r.json()),
    fetch('data/facilities.json').then((r) => r.json()),
    fetch('data/countries-110m.geojson').then((r) => r.json()),
  ]);
  S.generated = atlas.generated;
  S.campuses = atlas.campuses;
  S.entities = atlas.entities;
  S.deals = atlas.deals || [];
  S.capex = atlas.capex || [];
  S.metrics = atlas.metrics || [];
  S.events = atlas.events || [];
  S.aggregates = atlas.aggregates || [];
  S.countries = countries;

  const ci = Object.fromEntries(fac.cols.map((c, i) => [c, i]));
  S.facilities = fac.rows.map((r) => ({
    kind: 'facility',
    src: r[ci.src],
    ref: r[ci.ref],
    id: `${r[ci.src]}:${r[ci.ref]}`,
    lat: r[ci.lat],
    lng: r[ci.lng],
    name: r[ci.name],
    operator: r[ci.operator],
    city: r[ci.city],
    cc: r[ci.cc],
    web: r[ci.web],
    nets: r[ci.nets],
    ixs: r[ci.ixs],
    eid: r[ci.eid],
    continent: r[ci.continent],
  }));
  S.facilityAttribution = fac.attribution;
  index();
  deriveFlows();
}

function addRole(eid, rec) {
  if (!eid) return;
  if (!S.roles.has(eid)) S.roles.set(eid, []);
  S.roles.get(eid).push(rec);
}

function index() {
  S.campuses.forEach((c) => {
    c.kind = 'campus';
    S.byCampus.set(c.id, c);
  });
  S.entities.forEach((e) => S.byEntity.set(e.id, e));
  S.deals.forEach((d) => S.byDeal.set(d.id, d));
  S.facilities.forEach((f) => S.byFacility.set(f.id, f));

  for (const c of S.campuses) {
    c.owners.forEach((o) => addRole(o.entityId, { campus: c, role: 'owner', stakePct: o.stakePct }));
    c.tenants.forEach((t) => addRole(t.entityId, { campus: c, role: t.role || 'tenant', tenant: true }));
    c.capitalStack.forEach((k) => addRole(k.entityId, { campus: c, role: 'financier', amountUSD: k.amountUSD, kind: k.kind }));
    const devId = findEntityByName(c.developer);
    if (devId) addRole(devId, { campus: c, role: 'developer' });
  }
  for (const d of S.deals) {
    const ids = new Set([...d.investors.map((i) => i.entityId), ...d.sellers.map((i) => i.entityId), d.target?.entityId].filter(Boolean));
    ids.forEach((id) => {
      if (!S.dealsOf.has(id)) S.dealsOf.set(id, []);
      S.dealsOf.get(id).push(d);
    });
  }
  for (const f of S.facilities) if (f.eid) S.facilitiesOf.set(f.eid, (S.facilitiesOf.get(f.eid) || 0) + 1);
  for (const e of S.entities)
    for (const o of e.ownedBy || []) {
      if (!S.children.has(o.entityId)) S.children.set(o.entityId, []);
      S.children.get(o.entityId).push({ entity: e, stakePct: o.stakePct, note: o.note });
    }
}

const nameIndex = new Map();
export function findEntityByName(name) {
  if (!name) return null;
  if (!nameIndex.size) S.entities.forEach((e) => nameIndex.set(e.name.toLowerCase(), e.id));
  const n = String(name).toLowerCase().trim();
  if (nameIndex.has(n)) return nameIndex.get(n);
  for (const [k, id] of nameIndex) if (k.length > 3 && (n === k || n.startsWith(k + ' ') || n.startsWith(k + ','))) return id;
  return null;
}

export const entity = (id) => S.byEntity.get(id);
export const hasHQ = (id) => {
  const e = S.byEntity.get(id);
  return !!(e && e.hq && Number.isFinite(e.hq.lat) && Number.isFinite(e.hq.lng));
};

// ---------- money flows ----------
// Each flow: { from: entityId, to: {lat,lng,label,campusId?,entityId?}, amountUSD, kind, date, dealId?, campusId?, split }
function deriveFlows() {
  const flows = [];
  const seen = new Set();
  for (const d of S.deals) {
    if (d.status === 'cancelled' || isPledge(d)) continue; // pledges are announcements, not money moving
    const camp = d.campusIds.map((id) => S.byCampus.get(id)).find(Boolean);
    const tgt = d.target?.entityId && S.byEntity.get(d.target.entityId);
    const dest = camp
      ? { lat: camp.lat, lng: camp.lng, label: camp.name, campusId: camp.id, cc: camp.countryCode }
      : tgt && hasHQ(tgt.id)
        ? { lat: tgt.hq.lat, lng: tgt.hq.lng, label: tgt.name, entityId: tgt.id, cc: tgt.hq.countryCode }
        : null;
    const invs = d.investors.filter((i) => i.entityId && i.entityId !== d.target?.entityId);
    const share = d.amountUSD && invs.length ? d.amountUSD / invs.length : null;
    for (const i of invs) {
      flows.push({ from: i.entityId, to: dest, amountUSD: share, kind: d.kind, date: d.date, dealId: d.id, campusId: camp?.id, targetId: d.target?.entityId, split: invs.length > 1, status: d.status });
      if (camp) seen.add(`${i.entityId}|${camp.id}`);
    }
  }
  for (const c of S.campuses) {
    const dest = { lat: c.lat, lng: c.lng, label: c.name, campusId: c.id, cc: c.countryCode };
    for (const k of c.capitalStack) {
      if (!k.entityId || seen.has(`${k.entityId}|${c.id}`)) continue;
      flows.push({ from: k.entityId, to: dest, amountUSD: k.amountUSD, kind: k.kind, date: k.date, campusId: c.id, note: k.note });
      seen.add(`${k.entityId}|${c.id}`);
    }
    for (const o of c.owners) {
      if (!o.entityId || seen.has(`${o.entityId}|${c.id}`)) continue;
      flows.push({ from: o.entityId, to: dest, amountUSD: null, kind: 'ownership', campusId: c.id, stakePct: o.stakePct });
      seen.add(`${o.entityId}|${c.id}`);
    }
  }
  S.flows = flows.filter((f) => f.to);
}

// ---------- headline numbers (Money Pulse) ----------
const LIVE = new Set(['operational', 'partial']);
const PIPE = new Set(['construction', 'planned', 'announced', 'partial']);
const DEAD = new Set(['paused', 'cancelled', 'blocked', 'scaled-back']);
export const isDead = (c) => DEAD.has(c.status);
export const isSite = (c) => c.type !== 'cluster';

// Pledges (national programmes, corporate "we will invest $X" announcements) are tracked apart from deals:
// they span years, overlap each other and are not money that has moved.
const PLEDGES = new Set(['capex-commitment', 'sovereign-commitment']);
export const isPledge = (d) => !!d.pledge || PLEDGES.has(d.kind);

export function pulse() {
  const all = S.deals.filter((d) => d.status !== 'cancelled' && d.amountUSD);
  const deals = all.filter((d) => !isPledge(d));
  const pledges = all.filter(isPledge);
  const open = deals.filter((d) => ['announced', 'pending'].includes(d.status));
  const closed = deals.filter((d) => d.status === 'closed');
  const byKind = {};
  for (const d of all) byKind[d.kind] = (byKind[d.kind] || 0) + d.amountUSD;
  // biggest "committed vs earned" gap among return metrics
  const ratio = [...new Set(S.metrics.map((m) => m.entityId).filter(Boolean))]
    .map((id) => {
      const rows = (re) => S.metrics.filter((m) => m.entityId === id && re.test(m.metric || '') && m.value && m.unit !== 'pct');
      const latest = (re) => rows(re).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      const com = rows(/compute-commitments/).sort((a, b) => b.value - a.value)[0]; // total, not one contract
      const rev = latest(/^revenue|revenue-run-rate|ai-revenue/);
      return com && rev ? { id, com, rev, x: com.value / rev.value } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.x - a.x)[0];

  const sites = S.campuses.filter(isSite);
  const liveMW = sum(sites.filter((c) => !isDead(c)), (c) => (LIVE.has(c.status) ? c.powerMWNow ?? c.powerMW : c.powerMWNow) || 0);
  const pipeMW = sum(sites.filter((c) => PIPE.has(c.status)), (c) => Math.max(0, (c.powerMW || 0) - (c.powerMWNow || 0)));
  const dead = S.campuses.filter(isDead);
  const deadMW = sum(dead, (c) => c.powerMW || 0);
  const deadUSD = sum(dead, (c) => c.lostInvestmentUSD ?? c.investmentUSD ?? 0);
  const campusInvest = sum(sites.filter((c) => !isDead(c)), (c) => c.investmentUSD || 0);

  const perMW = sites
    .filter((c) => c.investmentUSD && c.powerMW >= 50 && !isDead(c))
    .map((c) => c.investmentUSD / c.powerMW);

  // capex: latest actual year and the following guidance year across tracked hyperscalers
  const hyper = ['microsoft', 'google', 'amazon', 'meta', 'oracle'];
  const capexYear = (y, kind) => sum(hyper.map((id) => pickCapex(id, y, kind)).filter(Boolean), (r) => r.capexUSD);
  const years = [...new Set(S.capex.map((c) => c.year))].sort();
  const actualYears = years.filter((y) => hyper.every((id) => pickCapex(id, y, 'actual')));
  const lastActual = actualYears[actualYears.length - 1] || null;
  const guideYear = lastActual ? lastActual + 1 : null;
  const capexActual = lastActual ? capexYear(lastActual, 'actual') : null;
  const capexGuide = guideYear ? capexYear(guideYear) : null;

  return {
    dealsTotal: sum(deals, (d) => d.amountUSD),
    dealsCount: deals.length,
    pledgesTotal: sum(pledges, (d) => d.amountUSD),
    pledgesCount: pledges.length,
    ratio,
    openCount: open.length,
    openUSD: sum(open, (d) => d.amountUSD),
    closedCount: closed.length,
    closedUSD: sum(closed, (d) => d.amountUSD),
    byKind,
    liveMW,
    pipeMW,
    deadCount: dead.length,
    deadMW,
    deadUSD,
    eventsCount: S.events.length,
    eventsMW: sum(S.events, (e) => e.mw || 0),
    campusInvest,
    perMW: median(perMW),
    perMWn: perMW.length,
    capexActual,
    capexGuide,
    lastActual,
    guideYear,
    facilities: S.facilities.length,
    campuses: S.campuses.length,
    countries: new Set(S.facilities.map((f) => f.cc).filter(Boolean)).size,
  };
}

// Prefer an actual figure for a year; fall back to the latest guidance for it.
export function pickCapex(entityId, year, kind) {
  const rows = S.capex.filter((r) => r.entityId === entityId && r.year === year && (!kind || r.kind === kind));
  if (!rows.length) return null;
  return rows.find((r) => r.kind === 'actual') || rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
}

// ---------- spatial queries ----------
export function nearest(lat, lng, { limit = 12, maxKm = Infinity } = {}) {
  const p = { lat, lng };
  const all = [];
  for (const f of S.facilities) {
    if (Math.abs(f.lat - lat) > 25) continue;
    const d = haversine(p, f);
    if (d <= maxKm) all.push({ item: f, km: d });
  }
  for (const c of S.campuses) {
    if (c.type === 'cluster') continue; // market pins aren't buildings
    const d = haversine(p, c);
    if (d <= maxKm) all.push({ item: c, km: d });
  }
  all.sort((a, b) => a.km - b.km);
  return limit ? all.slice(0, limit) : all;
}

export function neighborhood(lat, lng) {
  const p = { lat, lng };
  const within = { 25: 0, 100: 0, 500: 0 };
  const ops = new Map();
  for (const f of S.facilities) {
    const d = haversine(p, f);
    if (d <= 25) within[25]++;
    if (d <= 100) within[100]++;
    if (d <= 500) {
      within[500]++;
      const key = f.eid || (f.operator ? `raw:${f.operator}` : null);
      if (key) ops.set(key, (ops.get(key) || 0) + 1);
    }
  }
  const camps = S.campuses
    .map((c) => ({ c, km: haversine(p, c) }))
    .sort((a, b) => a.km - b.km);
  const near500 = camps.filter((x) => x.km <= 500 && isSite(x.c));
  const nearestAI = camps.find((x) => x.c.type === 'ai' && (x.c.powerMW || 0) >= 300 && !isDead(x.c));
  const money = new Map();
  for (const { c } of near500)
    for (const f of S.flows.filter((fl) => fl.campusId === c.id)) {
      const cur = money.get(f.from) || { amountUSD: 0, campuses: new Set() };
      cur.amountUSD += f.amountUSD || 0;
      cur.campuses.add(c.id);
      money.set(f.from, cur);
    }
  const market = camps.find((x) => x.c.type === 'cluster' && x.km <= 90);
  return {
    within,
    market,
    nearest: nearest(lat, lng, { limit: 12 }),
    operators: [...ops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    campuses500: near500,
    nearestAI,
    liveMW500: sum(near500.filter((x) => !isDead(x.c)), (x) => x.c.powerMWNow || 0),
    pipeMW500: sum(near500.filter((x) => PIPE.has(x.c.status)), (x) => Math.max(0, (x.c.powerMW || 0) - (x.c.powerMWNow || 0))),
    money: [...money.entries()].sort((a, b) => b[1].amountUSD - a[1].amountUSD || b[1].campuses.size - a[1].campuses.size).slice(0, 8),
  };
}

export const statusGroup = (s) => STATUSES[s]?.group || 'pipeline';
export const campusYear = (c) => yearOf(c.announced);
