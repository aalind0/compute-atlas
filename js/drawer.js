// Right-hand detail drawer: campus, facility, player, deal, neighborhood, hex cell.
import { S, entity, hasHQ, neighborhood, isDead, pickCapex } from './store.js';
import { $, esc, safeUrl, fmtUSD, fmtMW, fmtKm, fmtDate, fmtNum, pill, typeInfo, statusInfo, kindInfo, flowInfo, flag, countryName, initials, haversine, sum } from './util.js';

const drawer = $('#drawer');
const body = $('#drawer-body');
const back = $('#drawer-back');
const history = [];
let current = null;
let api = {};

export function initDrawer(a) {
  api = a;
  $('#drawer-close').addEventListener('click', () => close());
  back.addEventListener('click', () => {
    history.pop();
    const prev = history.pop();
    if (prev) open(prev.kind, prev.item, { push: true });
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    e.preventDefault();
    const [kind, id] = t.dataset.open.split('::');
    const item = kind === 'campus' ? S.byCampus.get(id) : kind === 'entity' ? S.byEntity.get(id) : kind === 'deal' ? S.byDeal.get(id) : kind === 'facility' ? S.byFacility.get(id) : null;
    if (item) api.select(item);
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    api.action?.(t.dataset.act, current);
  });
}

export function open(kind, item, { push = true } = {}) {
  current = { kind, item };
  if (push) history.push(current);
  if (history.length > 30) history.shift();
  back.hidden = history.length < 2;
  const html =
    kind === 'campus' ? campusHTML(item) : kind === 'facility' ? facilityHTML(item) : kind === 'entity' ? entityHTML(item) : kind === 'deal' ? dealHTML(item) : kind === 'you' ? youHTML(item) : kind === 'hex' ? hexHTML(item) : '';
  body.innerHTML = html;
  body.scrollTop = 0;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  api.opened?.(current);
}

export function close() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  history.length = 0;
  current = null;
  api.closed?.();
}
export const currentItem = () => current;

// ---------------------------------------------------------------- pieces
const kpi = (k, v, s = '') => `<div class="kpi"><span class="k">${esc(k)}</span><span class="v ${v === '—' ? 'na' : ''}">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
const sec = (title, inner, act = '') => `<section class="d-sec"><h3>${esc(title)}${act}</h3>${inner}</section>`;
const entLink = (id, name) => (id && S.byEntity.has(id) ? `<a href="#" data-open="entity::${esc(id)}">${esc(name || entity(id).name)}</a>` : esc(name || id || ''));
function entityRow(id, name, right = '', sub = '') {
  const e = id && entity(id);
  const k = kindInfo(e?.kind);
  const tag = e ? 'button' : 'div';
  return `<${tag} class="row" ${e ? `data-open="entity::${esc(id)}"` : ''}><span class="ico" style="--c:${k.color}">${esc(initials(e?.name || name))}</span><span class="main"><span class="t">${esc(name || e?.name || id)}</span><span class="s">${esc(sub || (e ? k.label + (e.hq?.city ? ` · ${e.hq.city}` : '') : ''))}</span></span><span class="r">${right}</span></${tag}>`;
}
function campusRow(c, right = '', sub = '') {
  const t = typeInfo(c.type);
  const s = statusInfo(c.status);
  return `<button class="row" data-open="campus::${esc(c.id)}"><span class="ico" style="--c:${isDead(c) ? '#ff5a5a' : t.color}">${c.type === 'cluster' ? '◎' : '▮'}</span><span class="main"><span class="t">${esc(c.name)}</span><span class="s">${esc(sub || `${s.label} · ${[c.city, c.countryCode].filter(Boolean).join(', ')}`)}</span></span><span class="r">${right || (c.powerMW ? fmtMW(c.powerMW) : c.investmentUSD ? fmtUSD(c.investmentUSD) : '')}</span></button>`;
}
function dealRow(d) {
  return `<button class="row" data-open="deal::${esc(d.id)}"><span class="ico" style="--c:${flowInfo(d.kind).color}">$</span><span class="main"><span class="t">${esc(d.title)}</span><span class="s">${esc(flowInfo(d.kind).label)} · ${esc(fmtDate(d.date))} · ${esc(d.status)}</span></span><span class="r">${fmtUSD(d.amountUSD)}</span></button>`;
}
function sources(list) {
  if (!list?.length) return '<p class="empty">No sources recorded yet.</p>';
  return `<ol class="sources">${list
    .map((s) => `<li><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>${s.publisher ? ` · ${esc(s.publisher)}` : ''}${s.date ? ` · ${esc(fmtDate(s.date))}` : ''}</li>`)
    .join('')}</ol>`;
}
const unverified = (r) =>
  r.verified === false
    ? `<div class="callout" style="margin-top:14px"><b>Not yet re-verified.</b> This record comes from reporting up to mid-2026 and hasn't been re-checked against a live source in this research pass, so its numbers and status may be out of date.</div>`
    : '';
function ownershipBar(owners) {
  const withStake = owners.filter((o) => o.stakePct);
  if (!withStake.length) return '';
  const colors = ['#38e1ff', '#ffb02e', '#a98bff', '#3ddc97', '#ff5fa2', '#ffd166', '#4d8dff'];
  return `<div class="stake-bar">${withStake.map((o, i) => `<span title="${esc(o.name)} ${o.stakePct}%" style="width:${o.stakePct}%;background:${colors[i % colors.length]}"></span>`).join('')}</div>`;
}
function chainUp(id, depth = 0, seen = new Set()) {
  const e = entity(id);
  if (!e || seen.has(id) || depth > 4) return '';
  seen.add(id);
  const parents = e.ownedBy || [];
  if (!parents.length) return '';
  return parents
    .map(
      (p) =>
        `<div class="lvl" style="padding-left:${depth * 16}px"><span class="arrow">${depth ? '└' : '↑'} owned by</span>${entLink(p.entityId, entity(p.entityId)?.name)}${p.stakePct ? ` <span class="mono" style="color:var(--gold)">${p.stakePct}%</span>` : ''}${p.note ? ` <span class="dim">· ${esc(p.note)}</span>` : ''}</div>${chainUp(p.entityId, depth + 1, seen)}`
    )
    .join('');
}

// ---------------------------------------------------------------- campus
function campusHTML(c) {
  const t = typeInfo(c.type);
  const s = statusInfo(c.status);
  const loc = [c.city, c.region, c.country].filter(Boolean).join(', ');
  const flows = S.flows.filter((f) => f.campusId === c.id);
  const stack = [...c.capitalStack].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const deals = S.deals.filter((d) => d.campusIds.includes(c.id));
  const stackTotal = sum(stack, (k) => k.amountUSD || 0);
  const near = S.campuses.filter((o) => o !== c).map((o) => ({ o, km: haversine(c, o) })).filter((x) => x.km < 150).sort((a, b) => a.km - b.km).slice(0, 4);
  const facN = S.facilities.filter((f) => Math.abs(f.lat - c.lat) < 1 && haversine(c, f) < 50).length;

  return `
    <div class="d-pills">${pill(s.label, s.color)}${pill(t.short, t.color)}${c.coordPrecision && c.coordPrecision !== 'site' ? pill(`${c.coordPrecision}-level pin`, '#8a9bb8') : ''}</div>
    <h2 class="d-title">${esc(c.name)}</h2>
    <div class="d-sub">${flag(c.countryCode)} ${esc(loc)}${c.aka?.length ? ` · aka ${esc(c.aka.join(', '))}` : ''}</div>
    ${unverified(c)}
    <div class="kpis">
      ${kpi(c.type === 'cluster' ? 'Market size' : 'Planned power', fmtMW(c.powerMW), c.powerMWNow != null && c.powerMWNow !== c.powerMW ? `${fmtMW(c.powerMWNow)} live` : '')}
      ${kpi('Investment', fmtUSD(c.investmentUSD), c.lostInvestmentUSD ? `${fmtUSD(c.lostInvestmentUSD)} lost` : '')}
      ${kpi('Online', esc(c.expectedOnline || '—'), c.announced ? `announced ${esc(fmtDate(c.announced))}` : '')}
      ${c.compute ? kpi('Compute', esc(c.compute.length > 22 ? c.compute.slice(0, 22) + '…' : c.compute), '') : ''}
      ${c.acres ? kpi('Land', `${fmtNum(c.acres)} ac`, '') : ''}
      ${c.investmentUSD && c.powerMW ? kpi('$ per MW', fmtUSD(c.investmentUSD / c.powerMW), 'announced ÷ planned') : ''}
    </div>
    ${c.powerNote || c.investmentNote ? `<p class="d-desc" style="font-size:12.5px;color:var(--muted)">${esc([c.powerNote, c.investmentNote].filter(Boolean).join(' '))}</p>` : ''}
    ${c.reason ? sec('Why it stalled', `<div class="callout red">${esc(c.reason)}</div>`) : ''}
    ${c.compute && c.compute.length > 22 ? sec('Compute', `<p class="d-desc" style="margin:0">${esc(c.compute)}</p>`) : ''}
    ${sec(
      'Who owns it',
      c.owners.length
        ? ownershipBar(c.owners) + `<div class="list">${c.owners.map((o) => entityRow(o.entityId, o.name, o.stakePct ? `${o.stakePct}%` : '')).join('')}</div>`
        : '<p class="empty">Ownership not disclosed.</p>'
    )}
    ${sec(
      'Follow the money',
      stack.length
        ? `<div class="timeline">${stack
            .map((k) => {
              const fi = flowInfo(k.kind);
              return `<div class="tl-item" style="--c:${fi.color}"><div class="tl-top"><b>${entLink(k.entityId, k.from)}</b><span class="tl-amt">${fmtUSD(k.amountUSD)}</span></div><div class="tl-meta">${esc(fi.label.toUpperCase())}${k.date ? ` · ${esc(fmtDate(k.date))}` : ''}${k.url ? ` · <a href="${safeUrl(k.url)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</div>${k.note ? `<div class="tl-note">${esc(k.note)}</div>` : ''}</div>`;
            })
            .join('')}</div>${stackTotal ? `<p class="note">Tracked capital: <b class="mono" style="color:var(--gold)">${fmtUSD(stackTotal)}</b>. Items can overlap, for example a loan that funds part of the equity commitment.</p>` : ''}`
        : '<p class="empty">No itemised financing found yet.</p>',
      flows.length ? `<button class="btn sm h-act" data-act="arcs">Show on globe</button>` : ''
    )}
    ${c.tenants.length ? sec('Who uses it', `<div class="list">${c.tenants.map((t) => entityRow(t.entityId, t.name, '', t.role || 'tenant')).join('')}</div>`) : ''}
    ${sec(
      'Builders & power',
      `<dl class="kv">${c.developer ? `<dt>Developer</dt><dd>${entLink(null, c.developer)}</dd>` : ''}${c.operator ? `<dt>Operator</dt><dd>${esc(c.operator)}</dd>` : ''}${c.energy ? `<dt>Energy</dt><dd>${esc(c.energy)}</dd>` : ''}${c.water ? `<dt>Water</dt><dd>${esc(c.water)}</dd>` : ''}${c.sizeSqft ? `<dt>Floor area</dt><dd>${fmtNum(c.sizeSqft)} sq ft</dd>` : ''}<dt>Coordinates</dt><dd class="mono">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</dd></dl>`
    )}
    ${c.highlights?.length ? sec('Highlights', `<ul class="bullets">${c.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`) : ''}
    ${c.controversy ? sec('Friction', `<div class="callout">${esc(c.controversy)}</div>`) : ''}
    ${deals.length ? sec('Related deals', `<div class="list">${deals.map(dealRow).join('')}</div>`) : ''}
    ${near.length || facN ? sec('Around it', `${facN ? `<p class="note" style="margin-top:0">${facN} other known facilities within 50 km.</p>` : ''}<div class="list">${near.map((x) => campusRow(x.o, fmtKm(x.km))).join('')}</div>`) : ''}
    ${sec('Sources', sources(c.sources))}
    <div class="drawer-foot">Campus record · research pass of ${esc(S.generated)}. Spot something wrong? Every figure has a source above; corrections are welcome.</div>`;
}

// ---------------------------------------------------------------- facility (base layer)
function facilityHTML(f) {
  const e = f.eid && entity(f.eid);
  const srcLabel = f.src === 'pdb' ? 'PeeringDB' : 'OpenStreetMap';
  const srcUrl = f.src === 'pdb' ? `https://www.peeringdb.com/${f.ref}` : `https://www.openstreetmap.org/${f.ref}`;
  const nearCamps = S.campuses.map((c) => ({ c, km: haversine(f, c) })).filter((x) => x.km < 80).sort((a, b) => a.km - b.km).slice(0, 4);
  const siblings = f.eid ? S.facilitiesOf.get(f.eid) || 0 : 0;
  return `
    <div class="d-pills">${pill(srcLabel, '#38e1ff')}${e ? pill(kindInfo(e.kind).label, kindInfo(e.kind).color) : ''}</div>
    <h2 class="d-title">${esc(f.name || 'Unnamed data center')}</h2>
    <div class="d-sub">${flag(f.cc)} ${esc([f.city, countryName(f.cc)].filter(Boolean).join(', '))}</div>
    <div class="kpis">
      ${kpi('Operator', esc((e?.name || f.operator || '—').slice(0, 24)), '')}
      ${kpi('Networks', f.nets != null ? fmtNum(f.nets) : '—', 'present on-site')}
      ${kpi('Exchanges', f.ixs != null ? fmtNum(f.ixs) : '—', 'internet exchanges')}
    </div>
    ${
      e
        ? sec(
            'Who’s behind it',
            `<div class="list">${entityRow(e.id, e.name, siblings ? `${siblings} sites` : '')}</div>${chainUp(e.id) ? `<div class="chain" style="margin-top:10px">${chainUp(e.id)}</div>` : ''}${e.dcExposure ? `<p class="d-desc">${esc(e.dcExposure)}</p>` : ''}`
          )
        : f.operator
          ? sec('Operator', `<p class="d-desc" style="margin:0">${esc(f.operator)}. Not yet linked to a researched player.</p>`)
          : ''
    }
    ${nearCamps.length ? sec('Researched campuses nearby', `<div class="list">${nearCamps.map((x) => campusRow(x.c, fmtKm(x.km))).join('')}</div>`) : ''}
    ${sec(
      'Links',
      `<dl class="kv"><dt>Registry</dt><dd><a href="${safeUrl(srcUrl)}" target="_blank" rel="noopener noreferrer">${esc(srcLabel)} record ↗</a></dd>${f.web ? `<dt>Website</dt><dd><a href="${safeUrl(f.web)}" target="_blank" rel="noopener noreferrer">${esc(f.web.replace(/^https?:\/\//, '').slice(0, 40))} ↗</a></dd>` : ''}<dt>Coordinates</dt><dd class="mono">${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}</dd></dl>`
    )}
    <div class="drawer-foot">Base-layer facility from ${esc(srcLabel)}${f.src === 'osm' ? ' (© OpenStreetMap contributors, ODbL)' : ''}. Location as published in the registry.</div>`;
}

// ---------------------------------------------------------------- entity
function entityHTML(e) {
  const k = kindInfo(e.kind);
  const roles = S.roles.get(e.id) || [];
  const byCampus = new Map();
  roles.forEach((r) => {
    const cur = byCampus.get(r.campus.id) || { c: r.campus, roles: new Set(), amount: 0, stake: null };
    cur.roles.add(r.role);
    cur.amount += r.amountUSD || 0;
    if (r.stakePct) cur.stake = r.stakePct;
    byCampus.set(r.campus.id, cur);
  });
  const camps = [...byCampus.values()].sort((a, b) => (b.c.powerMW || 0) - (a.c.powerMW || 0));
  const deals = (S.dealsOf.get(e.id) || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const outflow = sum(S.flows.filter((f) => f.from === e.id), (f) => f.amountUSD || 0);
  const kids = S.children.get(e.id) || [];
  const facN = S.facilitiesOf.get(e.id) || 0;
  const capexRows = S.capex.filter((r) => r.entityId === e.id).sort((a, b) => a.year - b.year);
  const years = [...new Set(capexRows.map((r) => r.year))];
  const capexSeries = years.map((y) => ({ y, r: pickCapex(e.id, y) }));
  const capMax = Math.max(1, ...capexSeries.map((x) => x.r?.capexUSD || 0));
  const metrics = S.metrics.filter((m) => m.entityId === e.id);
  const cap = e.capexUSD || {};
  return `
    <div class="d-pills">${pill(k.label, k.color)}${e.public && e.ticker ? pill(e.ticker, '#93a3bf') : e.public === false ? pill('Private', '#93a3bf') : ''}${e.stub ? pill('Profile pending', '#5d6b85') : ''}</div>
    <h2 class="d-title">${esc(e.name)}</h2>
    <div class="d-sub">${e.hq ? `${flag(e.hq.countryCode)} HQ ${esc([e.hq.city, e.hq.country || countryName(e.hq.countryCode)].filter(Boolean).join(', '))}` : ''}${e.founded ? ` · founded ${esc(e.founded)}` : ''}</div>
    ${unverified(e)}
    ${e.description ? `<p class="d-desc">${esc(e.description)}</p>` : ''}
    <div class="kpis">
      ${cap['2025'] || cap['2026'] ? kpi('Capex 2025', fmtUSD(cap['2025']), cap['2026'] ? `2026: ${fmtUSD(cap['2026'])}` : '') : ''}
      ${e.valuationUSD ? kpi('Valuation', fmtUSD(e.valuationUSD), '') : ''}
      ${e.fundingUSD ? kpi('Raised', fmtUSD(e.fundingUSD), '') : ''}
      ${e.aumUSD ? kpi('AUM', fmtUSD(e.aumUSD), '') : ''}
      ${outflow ? kpi('Tracked outflows', fmtUSD(outflow), 'into DCs & deals') : ''}
      ${kpi('Campuses', fmtNum(camps.length), 'owned, used or financed')}
      ${facN ? kpi('Facilities', fmtNum(facN), 'in the base layer') : ''}
      ${deals.length ? kpi('Deals', fmtNum(deals.length), '') : ''}
    </div>
    ${e.dcExposure ? sec('Data center exposure', `<p class="d-desc" style="margin:0">${esc(e.dcExposure)}</p>`) : ''}
    ${e.capexNote || e.fundingNote ? `<p class="note">${esc([e.capexNote, e.fundingNote].filter(Boolean).join(' '))}</p>` : ''}
    ${
      capexSeries.length
        ? sec(
            'Capital expenditure',
            `<div class="bars">${capexSeries
              .map(({ y, r }) => `<div class="bar"><span class="bar-name">${y}${r?.kind === 'guidance' ? ' <small>guidance</small>' : ''}</span><span class="bar-track"><span class="bar-fill" style="width:${((r?.capexUSD || 0) / capMax) * 100}%;--c:${r?.kind === 'guidance' ? '#ffb02e' : '#4d8dff'}"></span></span><span class="bar-val">${fmtUSD(r?.capexUSD)}</span></div>`)
              .join('')}</div>`
          )
        : ''
    }
    ${chainUp(e.id) || kids.length ? sec('Ownership', `${chainUp(e.id) ? `<div class="chain">${chainUp(e.id)}</div>` : ''}${kids.length ? `<div class="list" style="margin-top:10px">${kids.map((x) => entityRow(x.entity.id, x.entity.name, x.stakePct ? `${x.stakePct}%` : '', `owned${x.note ? ' · ' + x.note : ''}`)).join('')}</div>` : ''}`) : ''}
    ${camps.length ? sec('Campuses', `<div class="list">${camps.map((x) => campusRow(x.c, x.amount ? fmtUSD(x.amount) : x.stake ? `${x.stake}%` : '', `${[...x.roles].join(', ')} · ${statusInfo(x.c.status).label}`)).join('')}</div>`, hasHQ(e.id) ? `<button class="btn sm h-act" data-act="arcs">Show empire</button>` : '') : ''}
    ${deals.length ? sec('Deals', `<div class="list">${deals.slice(0, 25).map(dealRow).join('')}</div>`) : ''}
    ${metrics.length ? sec('Returns check', `<div class="list">${metrics.map((m) => `<div class="row"><span class="ico" style="--c:#3ddc97">%</span><span class="main"><span class="t">${esc(m.label || m.metric)}</span><span class="s wrap">${esc(m.note || '')}</span></span><span class="r">${fmtMetric(m)}</span></div>`).join('')}</div>`) : ''}
    ${e.keyFacts?.length ? sec('Key facts', `<ul class="bullets">${e.keyFacts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`) : ''}
    ${sec('Sources', sources(e.sources))}
    <div class="drawer-foot">${e.stub ? 'This player appears in deals or campus records but has not been profiled yet.' : `Player profile · research pass of ${esc(S.generated)}.`}</div>`;
}

export function fmtMetric(m) {
  if (m.value == null) return '—';
  const u = String(m.unit || '').toLowerCase();
  if (u === 'pct' || u === '%') return `${(+m.value).toFixed(Math.abs(m.value) < 10 ? 1 : 0)}%`;
  if (u === 'ratio') return `${(+m.value).toFixed(2)}×`;
  if (u.includes('kw')) return `$${(+m.value).toFixed(0)}/kW/mo`;
  if (u.includes('mw')) return `${fmtUSD(m.value)}/MW`;
  if (u.includes('hr') || u.includes('hour')) return `$${(+m.value).toFixed(2)}/hr`;
  if (u === 'usd' || u === '$') return fmtUSD(m.value);
  return `${fmtNum(m.value)} ${esc(m.unit || '')}`;
}

// ---------------------------------------------------------------- deal
function dealHTML(d) {
  const fi = flowInfo(d.kind);
  const camps = d.campusIds.map((id) => S.byCampus.get(id)).filter(Boolean);
  return `
    <div class="d-pills">${pill(fi.label, fi.color)}${pill(d.status, d.status === 'closed' ? '#3ddc97' : d.status === 'cancelled' ? '#ff5a5a' : '#ffb02e')}</div>
    <h2 class="d-title">${esc(d.title)}</h2>
    <div class="d-sub">${esc(fmtDate(d.date))}</div>
    ${unverified(d)}
    <div class="kpis">${kpi('Amount', fmtUSD(d.amountUSD), esc(d.amountNote || ''))}${kpi('Investors', fmtNum(d.investors.length), '')}${kpi('Status', esc(d.status), '')}</div>
    ${d.summary ? `<p class="d-desc">${esc(d.summary)}</p>` : ''}
    ${d.investors.length ? sec('Money from', `<div class="list">${d.investors.map((i) => entityRow(i.entityId, i.name)).join('')}</div>`, `<button class="btn sm h-act" data-act="arcs">Show on globe</button>`) : ''}
    ${d.target ? sec('Money to', `<div class="list">${entityRow(d.target.entityId, d.target.name)}</div>`) : ''}
    ${d.sellers.length ? sec('Sold by', `<div class="list">${d.sellers.map((i) => entityRow(i.entityId, i.name)).join('')}</div>`) : ''}
    ${camps.length ? sec('Campuses', `<div class="list">${camps.map((c) => campusRow(c)).join('')}</div>`) : ''}
    ${sec('Sources', sources(d.sources))}`;
}

// ---------------------------------------------------------------- you / neighborhood
function youHTML(you) {
  const n = neighborhood(you.lat, you.lng);
  you.nearest = n.nearest;
  const first = n.nearest[0];
  const opRows = n.operators
    .map(([key, count]) => {
      const e = key.startsWith('raw:') ? null : entity(key);
      return entityRow(e?.id, e?.name || key.replace(/^raw:/, ''), `${count}`, e ? kindInfo(e.kind).label : 'operator');
    })
    .join('');
  const moneyRows = n.money.map(([id, m]) => entityRow(id, entity(id)?.name || id, m.amountUSD ? fmtUSD(m.amountUSD) : `${m.campuses.size} site${m.campuses.size > 1 ? 's' : ''}`)).join('');
  return `
    <div class="d-pills">${pill('Your compute neighborhood', '#38e1ff')}</div>
    <h2 class="d-title">${esc(String(you.label || 'Your location').split(',').slice(0, 2).join(','))}</h2>
    <div class="d-sub mono">${you.lat.toFixed(3)}, ${you.lng.toFixed(3)}</div>
    <div class="kpis">
      ${kpi('Within 25 km', fmtNum(n.within[25]), 'facilities')}
      ${kpi('Within 100 km', fmtNum(n.within[100]), 'facilities')}
      ${kpi('Within 500 km', fmtNum(n.within[500]), 'facilities')}
      ${kpi('Nearest', first ? fmtKm(first.km) : '—', first ? esc((first.item.name || '').slice(0, 26)) : '')}
      ${kpi('Live power ≤500 km', fmtMW(n.liveMW500 || null), 'researched campuses')}
      ${kpi('Pipeline ≤500 km', fmtMW(n.pipeMW500 || null), 'being built or planned')}
    </div>
    ${n.market ? sec('Your data center market', `<div class="list">${campusRow(n.market.c, n.market.c.powerMW ? fmtMW(n.market.c.powerMW) : '', `You're ${n.market.km < 25 ? 'inside' : `${fmtKm(n.market.km)} from`} this market`)}</div>`) : ''}
    ${sec(
      'Closest to you',
      `<div class="list">${n.nearest
        .map(({ item, km }) =>
          item.kind === 'campus'
            ? campusRow(item, fmtKm(km))
            : `<button class="row" data-open="facility::${esc(item.id)}"><span class="ico" style="--c:#38e1ff">●</span><span class="main"><span class="t">${esc(item.name || 'Unnamed data center')}</span><span class="s">${esc((item.eid && entity(item.eid)?.name) || item.operator || 'Operator unknown')}${item.city ? ' · ' + esc(item.city) : ''}</span></span><span class="r">${fmtKm(km)}</span></button>`
        )
        .join('')}</div>`
    )}
    ${n.nearestAI ? sec('Nearest AI megaproject', `<div class="list">${campusRow(n.nearestAI.c, fmtKm(n.nearestAI.km), `${fmtMW(n.nearestAI.c.powerMW)} · ${statusInfo(n.nearestAI.c.status).label}`)}</div>`) : ''}
    ${opRows ? sec('Who runs the data centers around you', `<div class="list">${opRows}</div><p class="note">Facility counts within 500 km.</p>`) : ''}
    ${moneyRows ? sec('The money behind your region', `<div class="list">${moneyRows}</div><p class="note">Owners and financiers of researched campuses within 500 km.</p>`) : ''}
    <div class="drawer-foot">Distances are straight-line. Facilities come from PeeringDB and OpenStreetMap, and campuses are hand-researched. Your search text was sent only to the OpenStreetMap-based geocoder.</div>`;
}

// ---------------------------------------------------------------- hex cell
function hexHTML(h) {
  const pts = h.points;
  const ops = new Map();
  pts.forEach((f) => {
    const k = f.eid || `raw:${f.operator || 'Unknown'}`;
    ops.set(k, (ops.get(k) || 0) + 1);
  });
  const cities = new Map();
  pts.forEach((f) => f.city && cities.set(f.city, (cities.get(f.city) || 0) + 1));
  const city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return `
    <div class="d-pills">${pill('Density cell', '#7cf3ff')}</div>
    <h2 class="d-title">${esc(city || 'Facility cluster')}</h2>
    <div class="d-sub">${pts.length} facilities in this hexagon</div>
    ${sec('Operators', `<div class="list">${[...ops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => entityRow(k.startsWith('raw:') ? null : k, k.startsWith('raw:') ? k.slice(4) : entity(k)?.name, `${n}`)).join('')}</div>`)}
    ${sec('Facilities', `<div class="list">${pts.slice(0, 40).map((f) => `<button class="row" data-open="facility::${esc(f.id)}"><span class="ico" style="--c:#38e1ff">●</span><span class="main"><span class="t">${esc(f.name || 'Unnamed')}</span><span class="s">${esc(f.operator || '')}</span></span><span class="r"></span></button>`).join('')}</div>${pts.length > 40 ? `<p class="note">and ${pts.length - 40} more</p>` : ''}`)}`;
}
