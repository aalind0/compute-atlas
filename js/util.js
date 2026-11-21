// Shared helpers: formatting, colors, geo math, tiny DOM helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? esc(u) : '#');

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

// ---------- numbers ----------
export function fmtUSD(v, { short = true, digits } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = (x) => (digits != null ? x.toFixed(digits) : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/\.?0+$/, ''));
  if (a >= 1e12) return `$${d(v / 1e12)}T`;
  if (a >= 1e9) return `$${d(v / 1e9)}B`;
  if (a >= 1e6) return `$${d(v / 1e6)}M`;
  if (a >= 1e3 && short) return `$${d(v / 1e3)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
export function fmtMW(mw) {
  if (mw == null || !Number.isFinite(mw)) return '—';
  if (mw >= 1000) return `${(mw / 1000).toFixed(mw >= 10000 ? 0 : 1).replace(/\.0$/, '')} GW`;
  return `${Math.round(mw).toLocaleString()} MW`;
}
export const fmtNum = (n) => (n == null ? '—' : Math.round(n).toLocaleString());
export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`);
export const fmtPct = (p, d = 0) => (p == null ? '—' : `${(+p).toFixed(d)}%`);
export function fmtDate(s) {
  if (!s) return '';
  const str = String(s);
  const m = str.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return str;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (m[3]) return `${+m[3]} ${months[+m[2] - 1]} ${m[1]}`;
  if (m[2]) return `${months[+m[2] - 1]} ${m[1]}`;
  return m[1];
}
export const yearOf = (s) => {
  const m = String(s || '').match(/(\d{4})/);
  return m ? +m[1] : null;
};
export function median(a) {
  const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const sum = (a, f = (x) => x) => a.reduce((t, x) => t + (Number(f(x)) || 0), 0);

// ---------- geo ----------
export function haversine(a, b) {
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function fmtCoord(lat, lng) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}°${ns}  ${Math.abs(lng).toFixed(3)}°${ew}`;
}

// ---------- countries ----------
let regionNames;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}
export function countryName(cc) {
  if (!cc) return null;
  try {
    return regionNames?.of(cc) || cc;
  } catch {
    return cc;
  }
}
export function flag(cc) {
  if (!cc || !/^[A-Z]{2}$/i.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

// ---------- vocabularies & colors ----------
export const TYPES = {
  ai: { label: 'AI training / inference', short: 'AI', color: '#ffb02e' },
  cloud: { label: 'Hyperscale cloud', short: 'Cloud', color: '#4d8dff' },
  colo: { label: 'Colocation / wholesale', short: 'Colo', color: '#38e1ff' },
  sovereign: { label: 'Sovereign AI', short: 'Sovereign', color: '#a98bff' },
  crypto: { label: 'Crypto → AI conversion', short: 'Crypto→AI', color: '#b6f35c' },
  enterprise: { label: 'Enterprise', short: 'Enterprise', color: '#9fb3c8' },
  cluster: { label: 'Market cluster', short: 'Cluster', color: '#e7eefb' },
};
export const STATUSES = {
  operational: { label: 'Operational', color: '#3ddc97', group: 'live' },
  partial: { label: 'Partly live', color: '#2ec4b6', group: 'live' },
  construction: { label: 'Under construction', color: '#ffb02e', group: 'pipeline' },
  planned: { label: 'Planned', color: '#7aa2ff', group: 'pipeline' },
  announced: { label: 'Announced', color: '#a98bff', group: 'pipeline' },
  paused: { label: 'Paused', color: '#ff8a3d', group: 'dead' },
  'scaled-back': { label: 'Scaled back', color: '#ff8a3d', group: 'dead' },
  blocked: { label: 'Blocked', color: '#ff5a5a', group: 'dead' },
  cancelled: { label: 'Cancelled', color: '#ff5a5a', group: 'dead' },
};
export const KINDS = {
  hyperscaler: { label: 'Hyperscaler', color: '#4d8dff' },
  'ai-lab': { label: 'AI lab', color: '#ff5fa2' },
  neocloud: { label: 'Neocloud', color: '#ffb02e' },
  'colo-operator': { label: 'Data center operator', color: '#38e1ff' },
  developer: { label: 'Developer', color: '#2ec4b6' },
  'crypto-miner': { label: 'Crypto miner → AI', color: '#b6f35c' },
  'private-equity': { label: 'Private equity', color: '#a98bff' },
  'infra-fund': { label: 'Infrastructure fund', color: '#c38bff' },
  'sovereign-wealth': { label: 'Sovereign wealth', color: '#ffd166' },
  pension: { label: 'Pension fund', color: '#f6c48b' },
  'asset-manager': { label: 'Asset manager', color: '#d0b4ff' },
  bank: { label: 'Bank / lender', color: '#3ddc97' },
  chipmaker: { label: 'Chipmaker', color: '#8cf27a' },
  utility: { label: 'Utility', color: '#ff8a3d' },
  energy: { label: 'Energy', color: '#ff8a3d' },
  government: { label: 'Government', color: '#ff5a5a' },
  conglomerate: { label: 'Conglomerate', color: '#9fb3c8' },
  telco: { label: 'Telecom', color: '#7cc4ff' },
  other: { label: 'Other', color: '#8a9bb8' },
};
export const FLOW_KINDS = {
  equity: { label: 'Equity', color: '#a98bff' },
  debt: { label: 'Debt', color: '#3ddc97' },
  'project-finance': { label: 'Project finance', color: '#3ddc97' },
  jv: { label: 'Joint venture', color: '#38e1ff' },
  spv: { label: 'SPV', color: '#ff5fa2' },
  lease: { label: 'Lease', color: '#4d8dff' },
  'compute-contract': { label: 'Compute contract', color: '#4d8dff' },
  'public-incentive': { label: 'Public incentive', color: '#ff8a3d' },
  'vendor-financing': { label: 'Vendor financing', color: '#8cf27a' },
  capex: { label: 'Own capex', color: '#ffd166' },
  acquisition: { label: 'Acquisition', color: '#ffb02e' },
  'equity-raise': { label: 'Equity raise', color: '#a98bff' },
  'sovereign-commitment': { label: 'Sovereign commitment', color: '#ffd166' },
  'capex-commitment': { label: 'Capex commitment', color: '#ffd166' },
  ipo: { label: 'IPO', color: '#ff5fa2' },
  'power-deal': { label: 'Power deal', color: '#ff8a3d' },
  ownership: { label: 'Owner', color: '#9fb3c8' },
  tenant: { label: 'Tenant', color: '#7cc4ff' },
};
export const typeInfo = (t) => TYPES[t] || TYPES.cloud;
export const statusInfo = (s) => STATUSES[s] || STATUSES.planned;
export const kindInfo = (k) => KINDS[k] || KINDS.other;
export const flowInfo = (k) => FLOW_KINDS[String(k || '').toLowerCase()] || { label: k || 'Other', color: '#9fb3c8' };

export function pill(label, color) {
  return `<span class="pill" style="--c:${color}"><i></i>${esc(label)}</span>`;
}
export function initials(name) {
  const w = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
