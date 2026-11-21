// Compute Atlas — bootstrap, routing and wiring.
import { S, loadAll, pulse, entity, hasHQ } from './store.js';
import * as globe from './globe.js';
import * as drawer from './drawer.js';
import { initSearch, focusSearch } from './search.js';
import { initPages, renderPage } from './pages.js';
import { $, $$, esc, fmtUSD, fmtMW, fmtNum, fmtDate, STATUSES, TYPES, flowInfo } from './util.js';

const PAGES = new Set(['money', 'players', 'rankings', 'patterns', 'about']);
let route = 'globe';

// ---------------------------------------------------------------- selection
function kindOf(item) {
  if (!item) return null;
  if (item.kind === 'facility') return 'facility';
  if (S.byCampus.get(item.id) === item) return 'campus';
  if (S.byEntity.get(item.id) === item) return 'entity';
  if (S.byDeal.get(item.id) === item) return 'deal';
  return null;
}

function select(item, { fly = true, push = true } = {}) {
  const kind = kindOf(item);
  if (!kind) return;
  hideIntro();
  // Places live on the globe: leave content pages for campuses & facilities.
  if (route !== 'globe' && (kind === 'campus' || kind === 'facility')) {
    go('globe', { [kind === 'campus' ? 'campus' : 'fac']: item.id }); // the deep-link handler selects it
    if (drawer.currentItem()?.item === item) return;
  }
  drawer.open(kind, item, { push });
  if (route === 'globe') {
    globe.setSelection({ kind, item });
    if (fly) flyFor(kind, item);
    setParam(kind, item);
  }
}

function flyFor(kind, item) {
  if (kind === 'campus') globe.flyTo(item.lat, item.lng, item.type === 'cluster' ? 1.0 : 0.85);
  else if (kind === 'facility') globe.flyTo(item.lat, item.lng, 0.45);
  else if (kind === 'entity' && hasHQ(item.id)) globe.flyTo(item.hq.lat, item.hq.lng, 2.1);
  else if (kind === 'deal') {
    const c = item.campusIds.map((id) => S.byCampus.get(id)).find(Boolean);
    const t = item.target?.entityId && entity(item.target.entityId);
    if (c) globe.flyTo(c.lat, c.lng, 2.0);
    else if (t && hasHQ(t.id)) globe.flyTo(t.hq.lat, t.hq.lng, 2.0);
  }
}

function place(p) {
  hideIntro();
  if (route !== 'globe') go('globe');
  drawer.open('you', p); // computes p.nearest
  globe.setSelection(null);
  globe.setYou(p);
  globe.flyTo(p.lat, p.lng, 0.55, 2200);
  const url = new URL(location.href);
  url.hash = `#/globe?near=${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  history.replaceState(null, '', url);
}

function setParam(kind, item) {
  const key = { campus: 'campus', facility: 'fac', entity: 'player', deal: 'deal' }[kind];
  const url = new URL(location.href);
  url.hash = `#/globe?${key}=${encodeURIComponent(item.id)}`;
  history.replaceState(null, '', url);
}

// ---------------------------------------------------------------- routing
function go(r, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  if (location.hash !== `#/${r}${q}`) {
    history.pushState(null, '', `#/${r}${q}`);
  }
  onRoute();
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, qs] = h.split('?');
  return { name: name || 'globe', params: new URLSearchParams(qs || '') };
}

function onRoute() {
  const { name, params } = parseHash();
  const next = PAGES.has(name) ? name : 'globe';
  const prev = route;
  route = next; // set first: deep-link handling below may call select(), which reads it
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === next));
  const pageEl = $('#page');
  if (next !== 'globe') {
    if (prev !== next || pageEl.hidden) {
      pageEl.hidden = false;
      document.body.classList.add('page-open');
      renderPage(next);
      pageEl.focus({ preventScroll: true });
      globe.setRotate(true);
    }
    document.title = `${next[0].toUpperCase() + next.slice(1)} · Compute Atlas`;
  } else {
    pageEl.hidden = true;
    pageEl.innerHTML = '';
    document.body.classList.remove('page-open');
    document.title = 'Compute Atlas';
    globe.setRotate($('#toggle-rotate').checked);
    // deep links
    const c = params.get('campus') && S.byCampus.get(params.get('campus'));
    const f = params.get('fac') && S.byFacility.get(params.get('fac'));
    const e = params.get('player') && S.byEntity.get(params.get('player'));
    const d = params.get('deal') && S.byDeal.get(params.get('deal'));
    const near = params.get('near');
    const target = c || f || e || d;
    if (target && drawer.currentItem()?.item !== target) select(target, { push: true });
    else if (near && !drawer.currentItem()) {
      const [lat, lng] = near.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) place({ lat, lng, label: 'Shared location' });
    }
  }
}

// ---------------------------------------------------------------- HUD
function initHud() {
  const counts = (key) => {
    const m = {};
    S.campuses.forEach((c) => (m[c[key]] = (m[c[key]] || 0) + 1));
    return m;
  };
  const sc = counts('status');
  const tc = counts('type');
  $('#status-chips').innerHTML = Object.entries(STATUSES)
    .filter(([k]) => sc[k])
    .map(([k, v]) => `<button class="chip" aria-pressed="true" data-k="${k}" style="--c:${v.color}"><i></i>${esc(v.label)} <span class="n">${sc[k]}</span></button>`)
    .join('');
  $('#type-chips').innerHTML = Object.entries(TYPES)
    .filter(([k]) => tc[k])
    .map(([k, v]) => `<button class="chip" aria-pressed="true" data-k="${k}" style="--c:${v.color}"><i></i>${esc(v.short)} <span class="n">${tc[k]}</span></button>`)
    .join('');
  const chipHandler = (set) => (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const k = b.dataset.k;
    const on = b.getAttribute('aria-pressed') === 'true';
    b.setAttribute('aria-pressed', String(!on));
    on ? set.delete(k) : set.add(k);
    globe.render();
  };
  $('#status-chips').addEventListener('click', chipHandler(globe.state.statuses));
  $('#type-chips').addEventListener('click', chipHandler(globe.state.types));

  $$('.modes button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.modes button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      globe.setMode(b.dataset.mode);
      if (b.dataset.mode === 'money' && !globe.state.selection) globe.flyTo(35, -30, 2.7, 1400);
    })
  );
  globe.setMode('facilities');
  $('#base-count').textContent = fmtNum(S.facilities.length);
  $('#toggle-base').addEventListener('change', (e) => {
    globe.state.showBase = e.target.checked;
    globe.render();
  });
  $('#toggle-labels').addEventListener('change', (e) => {
    globe.state.showLabels = e.target.checked;
    globe.render();
  });
  const rot = $('#toggle-rotate');
  rot.checked = globe.state.rotate;
  rot.addEventListener('change', (e) => globe.setRotate(e.target.checked));

  const hud = $('.hud-left');
  if (innerWidth <= 820) hud.classList.add('collapsed');
  $('#hud-toggle').addEventListener('click', () => {
    hud.classList.toggle('collapsed');
    $('#hud-toggle').setAttribute('aria-expanded', String(!hud.classList.contains('collapsed')));
  });
}

function renderPulseMini() {
  const p = pulse();
  const tot = p.liveMW + p.pipeMW || 1;
  $('#pulse-mini').innerHTML = `
    <div class="pm-title">Money pulse <a href="#/money">Open →</a></div>
    <div class="pm-row"><span class="k">Deals tracked</span><span class="v">${fmtUSD(p.dealsTotal)}</span></div>
    <div class="pm-row"><span class="k">Deals in the works</span><span class="v">${fmtUSD(p.openUSD)}<small>${p.openCount}</small></span></div>
    <div class="pm-row"><span class="k">Pledged</span><span class="v">${fmtUSD(p.pledgesTotal)}</span></div>
    <div class="pm-row"><span class="k">Big-5 capex ${p.guideYear || ''}</span><span class="v">${fmtUSD(p.capexGuide)}</span></div>
    <div class="pm-row"><span class="k">Live / pipeline</span><span class="v">${fmtMW(p.liveMW)}<small>/ ${fmtMW(p.pipeMW)}</small></span></div>
    <div class="pm-bar"><span style="width:${(p.liveMW / tot) * 100}%;background:var(--green)"></span><span style="width:${(p.pipeMW / tot) * 100}%;background:var(--amber)"></span></div>
    <div class="pm-row"><span class="k">Scrapped &amp; stalled</span><span class="v" style="color:var(--red)">${fmtNum(p.deadCount)}<small>${p.deadMW ? fmtMW(p.deadMW) : ''}</small></span></div>`;
  $('#intro-stats').innerHTML = [
    [fmtNum(p.facilities), 'facilities mapped'],
    [fmtNum(p.campuses), 'campuses researched'],
    [fmtUSD(p.dealsTotal), 'in tracked deals'],
    [fmtMW(p.pipeMW), 'in the pipeline'],
  ]
    .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`)
    .join('');
}

function renderTicker() {
  const deals = [...S.deals].filter((d) => d.amountUSD && d.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 28);
  const items = deals.length
    ? deals.map((d) => `<button class="tick-item" data-deal="${esc(d.id)}"><span class="date">${esc(fmtDate(d.date))}</span><b>${esc(d.title)}</b><span class="amt">${fmtUSD(d.amountUSD)}</span><span style="color:${flowInfo(d.kind).color}">●</span></button>`)
    : S.campuses
        .filter((c) => c.investmentUSD)
        .sort((a, b) => b.investmentUSD - a.investmentUSD)
        .slice(0, 24)
        .map((c) => `<button class="tick-item" data-campus="${esc(c.id)}"><b>${esc(c.name)}</b><span class="amt">${fmtUSD(c.investmentUSD)}</span></button>`);
  $('#ticker').innerHTML = items.join('') + items.join(''); // doubled for a seamless loop
  $('#ticker').addEventListener('click', (e) => {
    const b = e.target.closest('.tick-item');
    if (!b) return;
    select(b.dataset.deal ? S.byDeal.get(b.dataset.deal) : S.byCampus.get(b.dataset.campus));
  });
}

let introGone = false;
function hideIntro() {
  if (introGone) return;
  introGone = true;
  $('#intro').classList.add('gone');
}

// A faint star field painted once onto a canvas and used as the globe backdrop.
function paintStars() {
  const c = document.createElement('canvas');
  const w = (c.width = 1600);
  const h = (c.height = 1000);
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 700; i++) {
    const r = rnd() < 0.92 ? rnd() * 0.8 + 0.2 : rnd() * 1.4 + 0.8;
    g.fillStyle = `rgba(${200 + rnd() * 55 | 0},${215 + rnd() * 40 | 0},255,${0.15 + rnd() * 0.55})`;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    g.fill();
  }
  $('#globe').style.backgroundImage = `url(${c.toDataURL()}), radial-gradient(1200px 900px at 60% 45%, #0b1530 0%, #050913 55%, #02040a 100%)`;
  $('#globe').style.backgroundSize = 'cover, auto';
}

// ---------------------------------------------------------------- main
async function main() {
  paintStars();
  try {
    await loadAll();
  } catch (err) {
    $('#loader').innerHTML = `<div class="mono" style="color:var(--red)">Couldn't load the atlas data.</div><div class="muted" style="max-width:420px;text-align:center">Serve this folder over HTTP (e.g. <code>node scripts/serve.mjs</code>) rather than opening the file directly.</div>`;
    console.error(err);
    return;
  }
  if (typeof Globe === 'undefined') {
    $('#loader').innerHTML = `<div class="mono" style="color:var(--red)">The 3D engine didn't load. Check your connection and refresh.</div>`;
    return;
  }

  globe.initGlobe($('#globe'), {
    select: (item) => select(item),
    hex: (h) => drawer.open('hex', h),
    globeClick: () => {
      const cur = drawer.currentItem();
      if (cur && cur.kind !== 'you') {
        drawer.close();
      }
    },
    rotateChanged: (on) => ($('#toggle-rotate').checked = on),
  });
  drawer.initDrawer({
    select: (item) => select(item),
    opened: () => globe.setDrawerOpen(true),
    closed: () => {
      globe.setDrawerOpen(false);
      globe.setSelection(null);
      if (route === 'globe') history.replaceState(null, '', '#/globe');
    },
    action: (act, cur) => {
      if (act !== 'arcs' || !cur) return;
      if (route !== 'globe') go('globe');
      globe.setSelection({ kind: cur.kind, item: cur.item });
      const it = cur.item;
      const lat = it.lat ?? it.hq?.lat;
      const lng = it.lng ?? it.hq?.lng;
      if (lat != null) globe.flyTo(lat, lng, 2.4, 1600);
    },
  });
  window.atlas = { S, globe: globe.globe(), select, place }; // handy for debugging in the console
  initSearch({ place, select: (item) => select(item) });
  initPages({ select: (item) => select(item), openRef: (ref) => {
    const [kind, id] = ref.split('::');
    const item = kind === 'entity' ? S.byEntity.get(id) : kind === 'campus' ? S.byCampus.get(id) : S.byDeal.get(id);
    if (item) select(item);
  } });
  initHud();
  renderPulseMini();
  renderTicker();

  $('#intro-search').addEventListener('click', () => {
    hideIntro();
    focusSearch();
  });
  $('#intro-explore').addEventListener('click', hideIntro);
  addEventListener('popstate', onRoute);
  addEventListener('hashchange', onRoute);
  onRoute();
  if (location.hash.length > 3 && parseHash().params.toString()) hideIntro();
  requestAnimationFrame(() => document.body.classList.remove('is-loading'));
}

main();
