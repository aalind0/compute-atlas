// Search: places (OpenStreetMap geocoders) + things in the atlas (campuses, players, facilities).
import { S } from './store.js';
import { $, esc, debounce, typeInfo, kindInfo, flag, countryName, statusInfo, fmtMW } from './util.js';

const input = $('#search-input');
const box = $('#search-results');
let items = [];
let active = -1;
let api = {};
let seq = 0;

export function initSearch(a) {
  api = a;
  input.addEventListener('input', debounce(run, 220));
  input.addEventListener('focus', () => input.value.trim() && run());
  input.addEventListener('keydown', (e) => {
    if (box.hidden && e.key !== 'Enter') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') hide();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) hide(); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) choose(items[+b.dataset.i]);
  });
  $('#locate-btn').addEventListener('click', locate);
}

export function focusSearch() {
  input.focus();
}

function hide() {
  box.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  active = -1;
}
function move(d) {
  if (!items.length) return;
  active = (active + d + items.length) % items.length;
  [...box.querySelectorAll('[data-i]')].forEach((el) => el.setAttribute('aria-selected', String(+el.dataset.i === active)));
}

function localMatches(q) {
  const s = q.toLowerCase();
  const score = (name) => {
    const n = String(name || '').toLowerCase();
    if (!n) return 0;
    if (n === s) return 100;
    if (n.startsWith(s)) return 80;
    if (n.includes(' ' + s)) return 60;
    if (n.includes(s)) return 40;
    return 0;
  };
  const out = [];
  for (const c of S.campuses) {
    const sc = Math.max(score(c.name), ...(c.aka || []).map(score), score(c.city) * 0.6);
    if (sc) out.push({ kind: 'campus', item: c, score: sc + 5 });
  }
  for (const e of S.entities) {
    const sc = score(e.name) || score(e.id.replace(/-/g, ' '));
    if (sc) out.push({ kind: 'entity', item: e, score: sc + (e.stub ? 0 : 8) });
  }
  if (s.length >= 3)
    for (const f of S.facilities) {
      const sc = score(f.name);
      if (sc >= 40) out.push({ kind: 'facility', item: f, score: sc - 10 });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, 7);
}

async function geocode(q) {
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return j.features.map((f) => {
      const p = f.properties;
      const label = [p.name, p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street, p.city, p.state, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');
      return { kind: 'place', item: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label, cc: p.countrycode } };
    }).filter((x, i, a) => a.findIndex((y) => y.item.label === x.item.label) === i);
  } catch {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const j = await r.json();
      return j.map((p) => ({ kind: 'place', item: { lat: +p.lat, lng: +p.lon, label: p.display_name } }));
    } catch {
      return [];
    }
  }
}

async function run() {
  const q = input.value.trim();
  const my = ++seq;
  if (!q) return hide();
  const local = localMatches(q);
  items = local;
  draw(true);
  if (q.length < 3) return;
  const places = await geocode(q);
  if (my !== seq) return;
  items = [...places, ...local];
  draw(false);
}

function draw(loading) {
  const places = items.filter((x) => x.kind === 'place');
  const local = items.filter((x) => x.kind !== 'place');
  const row = (x) => {
    const i = items.indexOf(x);
    if (x.kind === 'place') return `<button class="sr-item" role="option" data-i="${i}"><span class="sr-ico">📍</span><span class="sr-main"><span class="sr-title">${esc(x.item.label.split(',')[0])}</span><span class="sr-sub">${esc(x.item.label.split(',').slice(1).join(',').trim())}</span></span></button>`;
    if (x.kind === 'campus') {
      const c = x.item;
      return `<button class="sr-item" role="option" data-i="${i}"><span class="sr-ico" style="color:${typeInfo(c.type).color}">▮</span><span class="sr-main"><span class="sr-title">${esc(c.name)}</span><span class="sr-sub">${flag(c.countryCode)} ${esc([c.city, c.country].filter(Boolean).join(', '))} · ${esc(statusInfo(c.status).label)}${c.powerMW ? ' · ' + fmtMW(c.powerMW) : ''}</span></span></button>`;
    }
    if (x.kind === 'entity') {
      const e = x.item;
      return `<button class="sr-item" role="option" data-i="${i}"><span class="sr-ico" style="color:${kindInfo(e.kind).color}">◆</span><span class="sr-main"><span class="sr-title">${esc(e.name)}</span><span class="sr-sub">${esc(kindInfo(e.kind).label)}${e.hq?.city ? ' · ' + esc(e.hq.city) : ''}</span></span></button>`;
    }
    const f = x.item;
    return `<button class="sr-item" role="option" data-i="${i}"><span class="sr-ico" style="color:var(--cyan)">●</span><span class="sr-main"><span class="sr-title">${esc(f.name)}</span><span class="sr-sub">${esc(f.operator || '')} · ${flag(f.cc)} ${esc([f.city, countryName(f.cc)].filter(Boolean).join(', '))}</span></span></button>`;
  };
  let html = '';
  if (places.length) html += `<div class="sr-group">Places</div>${places.map(row).join('')}`;
  else if (loading && input.value.trim().length >= 3) html += `<div class="sr-group">Places</div><div class="sr-empty">Searching places…</div>`;
  if (local.length) html += `<div class="sr-group">In the atlas</div>${local.map(row).join('')}`;
  if (!html) html = `<div class="sr-empty">No matches yet. Try a city, a street address or a company.</div>`;
  box.innerHTML = html;
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  active = -1;
}

function choose(x) {
  if (!x) return;
  hide();
  input.blur();
  if (x.kind === 'place') {
    input.value = x.item.label.split(',').slice(0, 2).join(',');
    api.place(x.item);
  } else api.select(x.item);
}

function locate() {
  if (!navigator.geolocation) return api.toast?.('Location is not available in this browser.');
  const btn = $('#locate-btn');
  btn.style.color = 'var(--cyan)';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      btn.style.color = '';
      api.place({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location' });
    },
    () => {
      btn.style.color = '';
      input.focus();
      input.placeholder = 'Location blocked. Type your city or address instead.';
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}
