// The 3D globe: layers, map modes, selection arcs, camera moves.
/* global Globe, d3 */
import { S, isDead, isSite, hasHQ, entity } from './store.js';
import { esc, fmtUSD, fmtMW, fmtKm, fmtCoord, typeInfo, statusInfo, kindInfo, flowInfo, hexA, reducedMotion, countryName, flag } from './util.js';

let G;
let handlers = {};
const HYPERSCALERS = new Set(['google', 'microsoft', 'amazon', 'meta', 'apple', 'oracle', 'alibaba', 'tencent']);

export const state = {
  mode: 'facilities',
  statuses: new Set(['operational', 'partial', 'construction', 'planned', 'announced', 'paused', 'scaled-back', 'blocked', 'cancelled']),
  types: new Set(['ai', 'cloud', 'colo', 'sovereign', 'crypto', 'enterprise', 'cluster']),
  showBase: true,
  showLabels: true,
  rotate: !reducedMotion(),
  selection: null, // {kind, item}
  you: null, // {lat, lng, label}
};

const MODE_HINTS = {
  facilities: 'Dots are the ~8,500 facilities in PeeringDB and OpenStreetMap. Towers are researched campuses, and tower height is power (MW). Pulsing rings mark gigawatt-scale projects under construction.',
  density: 'Hexagon height is the number of facilities in each cell, so the tallest towers are the interconnection hubs of the internet.',
  money: 'Each arc runs from an investor’s headquarters to the project or company it funded. Arc width is dollars, color is investor type.',
  power: 'A heat surface of planned power capacity. The hot spots are where the gigawatts are going.',
};

// ---------------------------------------------------------------- init
export function initGlobe(el, h) {
  handlers = h;
  G = new Globe(el, { animateIn: true })
    .width(innerWidth)
    .height(innerHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#2f7dff')
    .atmosphereAltitude(0.22)
    .showGraticules(false);

  const mat = G.globeMaterial();
  mat.color.set('#050b19');
  mat.emissive.set('#0b1a3d');
  mat.emissiveIntensity = 0.55;
  mat.shininess = 4;

  // dotted continents
  G.hexPolygonsData(S.countries.features)
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.42)
    .hexPolygonUseDots(true)
    .hexPolygonAltitude(0.002)
    .hexPolygonColor(() => 'rgba(116, 170, 230, 0.34)')
    .hexPolygonLabel(() => '');

  // base facilities (particles)
  G.particlesList('list')
    .particleLat('lat')
    .particleLng('lng')
    .particleAltitude(0.0045)
    .particlesSize('size')
    .particlesSizeAttenuation(false)
    .particlesColor('color')
    .particleLabel((f) => facilityTip(f))
    .onParticleClick((f) => handlers.select?.(f))
    .onParticleHover((f) => setCursor(!!f));

  // campuses (towers) + investor HQs in money mode
  G.pointLat('lat')
    .pointLng('lng')
    .pointAltitude((d) => d._alt)
    .pointRadius((d) => d._r)
    .pointColor((d) => d._color)
    .pointResolution(16)
    .pointsMerge(false)
    .pointsTransitionDuration(700)
    .pointLabel((d) => (d?.kind === 'hq' ? hqTip(d) : campusTip(d)))
    .onPointClick((d) => handlers.select?.(d.kind === 'hq' ? entity(d.entityId) : d))
    .onPointHover((d) => setCursor(!!d));

  G.ringLat('lat')
    .ringLng('lng')
    .ringColor((r) => (t) => hexA(r.color, Math.max(0, 1 - t) * r.alpha))
    .ringMaxRadius('max')
    .ringPropagationSpeed('speed')
    .ringRepeatPeriod('period')
    .ringAltitude(0.003);

  G.labelLat('lat')
    .labelLng('lng')
    .labelText('text')
    .labelSize('size')
    .labelColor(() => 'rgba(255, 226, 170, 0.9)')
    .labelDotRadius(0.14)
    .labelAltitude(0.007)
    .labelResolution(2)
    .labelsTransitionDuration(0)
    .onLabelClick((l) => handlers.select?.(l.campus));

  G.arcStartLat('sLat')
    .arcStartLng('sLng')
    .arcEndLat('eLat')
    .arcEndLng('eLng')
    .arcColor('color')
    .arcStroke('stroke')
    .arcDashLength('dash')
    .arcDashGap('gap')
    .arcDashInitialGap((d) => d.initGap ?? Math.random())
    .arcDashAnimateTime((d) => (reducedMotion() ? 0 : d.time))
    .arcAltitudeAutoScale(0.42)
    .arcsTransitionDuration(600)
    .arcLabel('label')
    .onArcClick((a) => a.onClick?.());

  G.hexBinPointLat('lat')
    .hexBinPointLng('lng')
    .hexBinResolution(3)
    .hexMargin(0.18)
    .hexTopColor((h) => densityColor(h.points.length))
    .hexSideColor((h) => hexA(densityHex(h.points.length), 0.55))
    .hexAltitude((h) => Math.min(0.6, 0.012 + Math.sqrt(h.points.length) * 0.022))
    .hexBinMerge(false)
    .hexTransitionDuration(800)
    .hexLabel((h) => hexTip(h))
    .onHexClick((h) => handlers.hex?.(h));

  G.heatmapPointLat('lat')
    .heatmapPointLng('lng')
    .heatmapPointWeight((c) => Math.sqrt(c.powerMW || 0))
    .heatmapBandwidth(1.1)
    .heatmapColorSaturation(1.6)
    .heatmapBaseAltitude(0.004)
    .heatmapTopAltitude(0.12)
    .heatmapColorFn(() => heatColor);

  G.htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude((d) => d.alt || 0)
    .htmlElement((d) => d.el)
    .htmlTransitionDuration(0);

  G.onGlobeClick(({ lat, lng }) => handlers.globeClick?.(lat, lng));

  const controls = G.controls();
  controls.autoRotate = state.rotate;
  controls.autoRotateSpeed = 0.32;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 101.5;
  controls.addEventListener('start', () => {
    if (state.rotate) handlers.rotateChanged?.(false);
    setRotate(false);
  });
  const coordsEl = document.getElementById('coords');
  let raf = 0;
  controls.addEventListener('change', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = G.pointOfView();
      coordsEl.textContent = `${fmtCoord(p.lat, p.lng)}   ALT ${Math.round(p.altitude * 6371).toLocaleString()} KM`;
    });
  });

  G.pointOfView({ lat: 30, lng: -40, altitude: innerWidth < 600 ? 4.2 : innerWidth < 1000 ? 3.2 : 2.6 });
  addEventListener('resize', () => {
    G.width(innerWidth).height(innerHeight);
    applyOffset();
  });
  render();
  return G;
}

export const globe = () => G;

// ---------------------------------------------------------------- styles
const heatColor = (t) => {
  const stops = [
    [0, [40, 20, 90, 0]],
    [0.2, [122, 31, 162, 0.55]],
    [0.45, [255, 90, 90, 0.8]],
    [0.75, [255, 176, 46, 0.92]],
    [1, [255, 246, 208, 1]],
  ];
  const x = Math.min(1, Math.max(0, Math.sqrt(t)));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const [a, ca] = stops[i];
  const [b, cb] = stops[i + 1];
  const k = (x - a) / (b - a);
  const c = ca.map((v, j) => v + (cb[j] - v) * k);
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${c[3].toFixed(3)})`;
};
let densityMax = 1;
const densityHex = (n) => d3.interpolateRgb('#1b6fa8', '#bff8ff')(Math.min(1, Math.sqrt(n / densityMax)));
const densityColor = (n) => hexA(densityHex(n), 0.92);

function campusStyle(c) {
  const sel = state.selection?.item === c;
  const dead = isDead(c);
  const t = typeInfo(c.type);
  const mw = c.powerMW || (c.investmentUSD ? c.investmentUSD / 2.5e7 : 60);
  if (c.type === 'cluster') {
    c._alt = 0.006;
    c._r = Math.min(2.4, 0.7 + Math.sqrt(mw) / 70);
    c._color = sel ? 'rgba(255,255,255,0.55)' : 'rgba(231,238,251,0.16)';
    return c;
  }
  c._alt = dead ? 0.01 : Math.min(0.24, 0.01 + Math.sqrt(mw) / 420);
  c._r = Math.min(0.6, 0.16 + Math.sqrt(mw) / 210);
  c._color = dead ? (sel ? '#ff8080' : 'rgba(255,90,90,0.75)') : sel ? '#ffffff' : t.color;
  if (state.mode === 'money' && !sel) c._color = hexA(t.color, 0.35);
  return c;
}

// ---------------------------------------------------------------- tooltips
const tipWrap = (html) => `<div class="globe-tip">${html}</div>`;
function campusTip(c) {
  if (!c) return '';
  const s = statusInfo(c.status);
  const loc = [c.city, c.region, c.country].filter(Boolean).join(', ');
  return tipWrap(`<b>${esc(c.name)}</b><div class="gt-sub">${esc(loc)}</div>
    <div class="gt-sub" style="color:${s.color}">● ${esc(s.label)} · ${esc(typeInfo(c.type).short)}</div>
    <div class="gt-num">${c.powerMW ? fmtMW(c.powerMW) : ''}${c.powerMW && c.investmentUSD ? ' · ' : ''}${c.investmentUSD ? fmtUSD(c.investmentUSD) : ''}</div>`);
}
function facilityTip(f) {
  if (!f) return ''; // globe.gl can ask for a label while a layer is being swapped out
  const e = f.eid && entity(f.eid);
  return tipWrap(`<b>${esc(f.name || 'Unnamed data center')}</b><div class="gt-sub">${esc(e?.name || f.operator || 'Operator unknown')}</div>
    <div class="gt-sub">${flag(f.cc)} ${esc([f.city, countryName(f.cc)].filter(Boolean).join(', '))}</div>`);
}
function hqTip(d) {
  if (!d) return '';
  const e = entity(d.entityId);
  return tipWrap(`<b>${esc(e?.name || d.entityId)}</b><div class="gt-sub">${esc(kindInfo(e?.kind).label)} · HQ ${esc(e?.hq?.city || '')}</div><div class="gt-num">${fmtUSD(d.total)} tracked outflows</div>`);
}
function hexTip(h) {
  if (!h) return '';
  const ops = new Map();
  h.points.forEach((f) => {
    const k = (f.eid && entity(f.eid)?.name) || f.operator;
    if (k) ops.set(k, (ops.get(k) || 0) + 1);
  });
  const top = [...ops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const cities = new Map();
  h.points.forEach((f) => f.city && cities.set(f.city, (cities.get(f.city) || 0) + 1));
  const city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return tipWrap(`<b>${h.points.length} facilities</b><div class="gt-sub">${esc(city || '')}</div>${top.map(([n, k]) => `<div class="gt-sub">${esc(n)} <span class="gt-num">${k}</span></div>`).join('')}`);
}
let cursorEl;
function setCursor(on) {
  cursorEl = cursorEl || document.getElementById('globe');
  cursorEl.style.cursor = on ? 'pointer' : '';
}

// ---------------------------------------------------------------- data selection
export function visibleCampuses() {
  return S.campuses.filter((c) => state.statuses.has(c.status) && state.types.has(c.type));
}

function baseSets() {
  if (!state.showBase || state.mode !== 'facilities') return [];
  const hyper = [];
  const rest = [];
  for (const f of S.facilities) (f.eid && HYPERSCALERS.has(f.eid) ? hyper : rest).push(f);
  return [
    { list: rest, color: '#5fe3ff', size: 2.4 * Math.min(2, devicePixelRatio || 1) },
    { list: hyper, color: '#8fb0ff', size: 3.2 * Math.min(2, devicePixelRatio || 1) },
  ];
}

function moneyFlows() {
  // aggregate by (investor, destination) so arcs stay readable
  const agg = new Map();
  for (const f of S.flows) {
    if (!f.amountUSD || !hasHQ(f.from)) continue;
    const dest = f.to;
    const key = `${f.from}|${dest.campusId || dest.entityId}`;
    const cur = agg.get(key) || { from: f.from, to: dest, amountUSD: 0, kinds: new Set(), n: 0 };
    cur.amountUSD += f.amountUSD;
    cur.kinds.add(f.kind);
    cur.n++;
    agg.set(key, cur);
  }
  return [...agg.values()].sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 220);
}

function arcFrom(from, to, { color, amountUSD, label, max = 1, kind, onClick }) {
  const w = amountUSD ? Math.sqrt(amountUSD / max) : 0.15;
  return {
    sLat: from.lat,
    sLng: from.lng,
    eLat: to.lat,
    eLng: to.lng,
    color: [hexA(color, 0.15), hexA(color, 0.95)],
    stroke: 0.18 + w * 1.1,
    dash: 0.35,
    gap: 0.12,
    time: 2600 + Math.random() * 1800,
    label,
    kind,
    onClick,
  };
}

function selectionArcs() {
  const sel = state.selection;
  if (!sel) return [];
  const arcs = [];
  const mk = (eid, dest, f) => {
    const e = entity(eid);
    if (!hasHQ(eid)) return;
    const flowLabel = flowInfo(f.kind).label;
    arcs.push(
      arcFrom(e.hq, dest, {
        color: f.kind === 'tenant' ? '#7cc4ff' : kindInfo(e.kind).color,
        amountUSD: f.amountUSD,
        max: f.max,
        kind: f.kind,
        label: tipWrap(`<b>${esc(e.name)} → ${esc(dest.label || '')}</b><div class="gt-sub">${esc(flowLabel)}${f.stakePct ? ` · ${f.stakePct}% stake` : ''}</div>${f.amountUSD ? `<div class="gt-num">${fmtUSD(f.amountUSD)}${f.split ? ' (split evenly)' : ''}</div>` : ''}`),
        onClick: () => handlers.select?.(e),
      })
    );
  };
  if (sel.kind === 'campus') {
    const c = sel.item;
    const fl = S.flows.filter((f) => f.campusId === c.id && f.to.campusId === c.id);
    const max = Math.max(1, ...fl.map((f) => f.amountUSD || 0));
    const seen = new Set();
    fl.forEach((f) => {
      seen.add(f.from);
      mk(f.from, c, { ...f, max });
    });
    c.tenants.forEach((t) => t.entityId && !seen.has(t.entityId) && mk(t.entityId, c, { kind: 'tenant' }));
  } else if (sel.kind === 'entity') {
    const e = sel.item;
    if (!hasHQ(e.id)) return arcs;
    const fl = S.flows.filter((f) => f.from === e.id);
    const max = Math.max(1, ...fl.map((f) => f.amountUSD || 0));
    const seen = new Set();
    fl.forEach((f) => {
      const k = f.to.campusId || f.to.entityId;
      if (seen.has(k)) return;
      seen.add(k);
      arcs.push(arcFrom(e.hq, f.to, { color: kindInfo(e.kind).color, amountUSD: f.amountUSD, max, label: tipWrap(`<b>${esc(e.name)} → ${esc(f.to.label)}</b><div class="gt-sub">${esc(flowInfo(f.kind).label)}</div>${f.amountUSD ? `<div class="gt-num">${fmtUSD(f.amountUSD)}</div>` : ''}`) }));
    });
    (S.roles.get(e.id) || []).forEach((r) => {
      if (seen.has(r.campus.id)) return;
      seen.add(r.campus.id);
      arcs.push(arcFrom(e.hq, r.campus, { color: r.tenant ? '#7cc4ff' : kindInfo(e.kind).color, label: tipWrap(`<b>${esc(e.name)} → ${esc(r.campus.name)}</b><div class="gt-sub">${esc(r.role)}</div>`) }));
    });
    (S.children.get(e.id) || []).forEach(({ entity: ch, stakePct }) => {
      if (!hasHQ(ch.id) || seen.has(ch.id)) return;
      seen.add(ch.id);
      arcs.push(arcFrom(e.hq, ch.hq, { color: '#c38bff', label: tipWrap(`<b>${esc(e.name)} owns ${esc(ch.name)}</b>${stakePct ? `<div class="gt-num">${stakePct}%</div>` : ''}`) }));
    });
  } else if (sel.kind === 'deal') {
    const d = sel.item;
    const camp = d.campusIds.map((id) => S.byCampus.get(id)).find(Boolean);
    const tgt = d.target?.entityId && entity(d.target.entityId);
    const dest = camp || (tgt && hasHQ(tgt.id) ? { ...tgt.hq, label: tgt.name } : null);
    if (dest) d.investors.forEach((i) => i.entityId && mk(i.entityId, { lat: dest.lat, lng: dest.lng, label: camp?.name || tgt?.name }, { kind: d.kind, amountUSD: d.amountUSD / Math.max(1, d.investors.length), max: d.amountUSD, split: d.investors.length > 1 }));
  } else if (sel.kind === 'facility') {
    const f = sel.item;
    if (f.eid && hasHQ(f.eid)) mk(f.eid, { lat: f.lat, lng: f.lng, label: f.name }, { kind: 'ownership' });
  }
  return arcs;
}

function youArcs() {
  if (!state.you || !state.you.nearest) return [];
  return state.you.nearest.slice(0, 8).map((n, i) =>
    Object.assign(arcFrom(state.you, n.item, { color: '#38e1ff', label: tipWrap(`<b>${esc(n.item.name || 'Data center')}</b><div class="gt-num">${fmtKm(n.km)} away</div>`) }), {
      stroke: 0.25,
      dash: 0.06,
      gap: 0.03,
      time: 1400 + i * 120,
      initGap: 1,
    })
  );
}

// ---------------------------------------------------------------- render
export function render() {
  if (!G) return;
  const camps = visibleCampuses().map(campusStyle);
  const sel = state.selection;

  // base particles
  G.particlesData(baseSets());

  // points
  let points = state.mode === 'density' ? camps.filter((c) => c === sel?.item) : camps;
  if (state.mode === 'power') points = camps.filter((c) => c.type !== 'cluster').map((c) => Object.assign(c, { _alt: Math.min(c._alt, 0.05), _r: Math.min(c._r, 0.3) }));
  let arcs = [];
  if (state.mode === 'money') {
    const flows = moneyFlows();
    const max = Math.max(1, ...flows.map((f) => f.amountUSD));
    const hqTotals = new Map();
    flows.forEach((f) => hqTotals.set(f.from, (hqTotals.get(f.from) || 0) + f.amountUSD));
    const hqs = [...hqTotals.entries()].map(([id, total]) => {
      const e = entity(id);
      return { kind: 'hq', entityId: id, lat: e.hq.lat, lng: e.hq.lng, total, _alt: 0.015, _r: Math.min(0.9, 0.25 + Math.sqrt(total / max) * 0.7), _color: kindInfo(e.kind).color };
    });
    points = [...points.filter((c) => c.type !== 'cluster'), ...hqs];
    arcs = sel ? selectionArcs() : flows.map((f) => {
      const e = entity(f.from);
      return arcFrom(e.hq, f.to, {
        color: kindInfo(e.kind).color,
        amountUSD: f.amountUSD,
        max,
        label: tipWrap(`<b>${esc(e.name)} → ${esc(f.to.label)}</b><div class="gt-sub">${esc([...f.kinds].map((k) => flowInfo(k).label).join(', '))}</div><div class="gt-num">${fmtUSD(f.amountUSD)}</div>`),
        onClick: () => handlers.select?.(e),
      });
    });
  } else {
    arcs = [...selectionArcs(), ...youArcs()];
  }
  G.pointsData(points);
  G.arcsData(arcs);

  // density
  if (state.mode === 'density') {
    densityMax = 1;
    G.hexBinPointsData(S.facilities);
    // find the max bin cheaply after layout: approximate with a 2° grid
    const grid = new Map();
    S.facilities.forEach((f) => {
      const k = `${Math.round(f.lat / 1.6)}:${Math.round(f.lng / 1.6)}`;
      grid.set(k, (grid.get(k) || 0) + 1);
    });
    densityMax = Math.max(...grid.values());
  } else G.hexBinPointsData([]);

  // power
  G.heatmapsData(state.mode === 'power' ? [S.campuses.filter((c) => isSite(c) && !isDead(c) && c.powerMW && state.types.has(c.type) && state.statuses.has(c.status))] : []);

  // rings: gigawatt builds under construction + selection + you
  const rings = [];
  if (state.mode === 'facilities' && !reducedMotion())
    camps
      .filter((c) => (c.status === 'construction' || c.status === 'partial') && (c.powerMW || 0) >= 900)
      .forEach((c) => rings.push({ lat: c.lat, lng: c.lng, color: '#ffb02e', alpha: 0.7, max: 2.2 + Math.min(2.5, c.powerMW / 2500), speed: 1.1, period: 1900 }));
  if (sel && sel.item?.lat != null) rings.push({ lat: sel.item.lat, lng: sel.item.lng, color: '#ffffff', alpha: 0.9, max: 1.6, speed: 1.6, period: 1100 });
  if (state.you) rings.push({ lat: state.you.lat, lng: state.you.lng, color: '#38e1ff', alpha: 0.8, max: 4.5, speed: 2.4, period: 1400 });
  G.ringsData(rings);

  // labels
  const labels =
    state.showLabels && state.mode !== 'density'
      ? camps
          .filter((c) => c.type !== 'cluster' && !isDead(c))
          .sort((a, b) => (b.powerMW || 0) - (a.powerMW || 0))
          .slice(0, 24)
          .map((c) => ({ lat: c.lat, lng: c.lng, text: shortName(c.name), size: 0.32 + Math.min(0.3, (c.powerMW || 0) / 12000), campus: c }))
      : [];
  G.labelsData(labels);

  // html markers
  const html = [];
  if (state.you) html.push({ lat: state.you.lat, lng: state.you.lng, el: youEl(state.you.label) });
  if (sel && sel.item?.lat != null && sel.kind !== 'entity') html.push({ lat: sel.item.lat, lng: sel.item.lng, alt: sel.kind === 'campus' ? sel.item._alt || 0 : 0.005, el: selEl(sel) });
  G.htmlElementsData(html);
}

const shortName = (n) => String(n).replace(/\s*\(.*?\)\s*/g, ' ').replace(/data cent(er|re) campus|data cent(er|re)s?|campus/gi, '').replace(/\s+/g, ' ').trim().slice(0, 30);

let youNode;
function youEl(label) {
  youNode = youNode || document.createElement('div');
  youNode.className = 'you-marker';
  youNode.innerHTML = `<div class="radar"></div><div class="ring"></div><div class="ring r2"></div><div class="dot"></div><div class="tag">YOU · ${esc(String(label || '').split(',')[0].slice(0, 26).toUpperCase())}</div>`;
  return youNode;
}
let selNode;
function selEl(sel) {
  selNode = selNode || document.createElement('div');
  selNode.className = 'sel-marker';
  const c = sel.kind === 'campus' ? (isDead(sel.item) ? '#ff5a5a' : typeInfo(sel.item.type).color) : sel.kind === 'facility' ? '#38e1ff' : '#ffd166';
  selNode.style.setProperty('--c', c);
  selNode.innerHTML = `<div class="ret"></div><div class="cross"></div>`;
  return selNode;
}

// ---------------------------------------------------------------- public API
export function setMode(mode) {
  state.mode = mode;
  document.getElementById('mode-hint').textContent = MODE_HINTS[mode];
  render();
}
export function setSelection(sel) {
  state.selection = sel;
  render();
}
export function setYou(you) {
  state.you = you;
  render();
}
export function setRotate(on) {
  state.rotate = on;
  if (G) G.controls().autoRotate = on;
}
export function flyTo(lat, lng, altitude = 1.1, ms = 1800) {
  if (!G) return;
  setRotate(false);
  G.pointOfView({ lat, lng, altitude }, reducedMotion() ? 0 : ms);
}
let drawerOpen = false;
export function setDrawerOpen(open) {
  drawerOpen = open;
  applyOffset();
}
function applyOffset() {
  if (!G) return;
  const mobile = innerWidth <= 820;
  G.globeOffset(drawerOpen ? (mobile ? [0, -innerHeight * 0.28] : [-Math.min(240, innerWidth * 0.17), 0]) : [0, 0]);
}
export function pauseGlobe(p) {
  if (!G) return;
  if (p) G.pauseAnimation();
  else G.resumeAnimation();
}
export { MODE_HINTS };
