// Content pages layered over the globe: Money, Players, Rankings, Patterns, About.
import { S, pulse, entity, hasHQ, isDead, isSite, pickCapex, isPledge } from './store.js';
import { $, esc, safeUrl, fmtUSD, fmtMW, fmtNum, fmtKm, fmtDate, fmtPct, yearOf, median, sum, haversine, kindInfo, typeInfo, statusInfo, flowInfo, KINDS, TYPES, flag, countryName, initials, debounce } from './util.js';
import { bars, lineChart, scatterChart, columnsChart, sankeyChart, networkChart, timelineChart, stripChart } from './charts.js';
import { fmtMetric } from './drawer.js';

const page = $('#page');
let api = {};
let cleanup = [];
let lastRoute = null;

export function initPages(a) {
  api = a;
  page.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    e.preventDefault();
    const [kind, id] = t.dataset.open.split('::');
    const item = kind === 'campus' ? S.byCampus.get(id) : kind === 'entity' ? S.byEntity.get(id) : kind === 'deal' ? S.byDeal.get(id) : kind === 'facility' ? S.byFacility.get(id) : null;
    if (item) api.select(item);
  });
  addEventListener(
    'resize',
    debounce(() => lastRoute && !page.hidden && renderPage(lastRoute, true), 300)
  );
}

export function renderPage(route, keepScroll = false) {
  cleanup.forEach((f) => f && f());
  cleanup = [];
  lastRoute = route;
  const scroll = page.scrollTop;
  const fn = { money: money, players: players, rankings: rankings, patterns: patterns, about: about }[route];
  page.innerHTML = `<div class="page-inner">${fn ? '' : ''}</div>`;
  fn?.(page.firstElementChild);
  page.scrollTop = keepScroll ? scroll : 0;
}

const head = (kicker, title, lede) => `<header class="p-head"><div class="p-kicker">${esc(kicker)}</div><h1 class="p-title">${title}</h1><p class="p-lede">${lede}</p></header>`;
const card = (inner, cls = '') => `<div class="card ${cls}">${inner}</div>`;
const sectionTitle = (t, p = '') => `<div class="section-title"><h2>${esc(t)}</h2>${p ? `<p>${p}</p>` : ''}</div>`;

// ======================================================================= MONEY
function pulseCards(p) {
  const statusMix = ['closed', 'pending', 'announced'].map((s) => ({ s, v: sum(S.deals.filter((d) => d.status === s && !isPledge(d)), (d) => d.amountUSD || 0) }));
  const mixTotal = sum(statusMix, (x) => x.v) || 1;
  const mixColors = { closed: '#3ddc97', pending: '#ffb02e', announced: '#a98bff' };
  const growth = p.capexActual && p.capexGuide ? ((p.capexGuide / p.capexActual - 1) * 100).toFixed(0) : null;
  const totalMW = p.liveMW + p.pipeMW || 1;
  const c = (k, v, s, color, extra = '') => `<div class="pulse-card" style="--c:${color}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div>${extra}</div>`;
  return `<div class="pulse">
    ${c('Deals tracked', fmtUSD(p.dealsTotal), `across <b>${fmtNum(p.dealsCount)}</b> sourced acquisitions, financings &amp; contracts`, '#ffd166', `<div class="mini">${statusMix.map((x) => `<span title="${x.s}: ${fmtUSD(x.v)}" style="width:${(x.v / mixTotal) * 100}%;background:${mixColors[x.s]}"></span>`).join('')}</div>`)}
    ${c('Deals in the works', fmtUSD(p.openUSD), `<b>${fmtNum(p.openCount)}</b> announced or pending, not yet closed`, '#ffb02e')}
    ${c('Closed deals', fmtUSD(p.closedUSD), `<b>${fmtNum(p.closedCount)}</b> deals completed`, '#3ddc97')}
    ${c('Hyperscaler capex', p.capexGuide ? fmtUSD(p.capexGuide) : '—', p.capexGuide ? `${p.guideYear} guidance vs <b>${fmtUSD(p.capexActual)}</b> in ${p.lastActual}${growth ? ` (<b>${growth > 0 ? '+' : ''}${growth}%</b>)` : ''}` : 'awaiting capex data', '#4d8dff')}
    ${c('Power live', fmtMW(p.liveMW), 'at researched campuses today', '#3ddc97', `<div class="mini"><span style="width:${(p.liveMW / totalMW) * 100}%;background:#3ddc97"></span><span style="width:${(p.pipeMW / totalMW) * 100}%;background:#ffb02e"></span></div>`)}
    ${c('Power pipeline', fmtMW(p.pipeMW), 'under construction, planned or announced', '#ffb02e')}
    ${c('Scrapped & stalled', `${fmtNum(p.deadCount)}`, `projects cancelled, paused or blocked${p.deadUSD ? ` · <b>${fmtUSD(p.deadUSD)}</b> not built` : ''}${p.eventsCount ? ` · plus <b>${p.eventsCount}</b> lease walk-aways &amp; collapsed deals` : ''}`, '#ff5a5a')}
    ${c('Cost per megawatt', fmtUSD(p.perMW), `median announced investment ÷ planned MW across <b>${p.perMWn}</b> campuses`, '#a98bff')}
    ${c('Pledged', fmtUSD(p.pledgesTotal), `<b>${fmtNum(p.pledgesCount)}</b> national &amp; corporate investment pledges. Multi-year, often overlapping, not cash moved.`, '#c38bff')}
    ${p.ratio ? c('Return check', `${p.ratio.x.toFixed(0)}×`, `<b>${esc(entity(p.ratio.id)?.name || p.ratio.id)}</b>: ${fmtUSD(p.ratio.com.value)} of compute commitments vs <b>${fmtUSD(p.ratio.rev.value)}</b> ${esc(p.ratio.rev.label?.toLowerCase().includes('run') ? 'revenue run-rate' : 'revenue')}`, '#ff5fa2') : ''}
  </div>`;
}

function flowsSankey() {
  const fl = S.flows.filter((f) => f.amountUSD && entity(f.from));
  const byInv = new Map();
  fl.forEach((f) => byInv.set(f.from, (byInv.get(f.from) || 0) + f.amountUSD));
  const topInv = new Set([...byInv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([id]) => id));
  const destName = (f) => countryName(f.to.cc) || 'Undisclosed';
  const byDest = new Map();
  fl.forEach((f) => byDest.set(destName(f), (byDest.get(destName(f)) || 0) + f.amountUSD));
  const topDest = new Set([...byDest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n));
  const nodes = new Map();
  const links = new Map();
  const node = (id, name, color, open) => nodes.has(id) || nodes.set(id, { id, name, color, open });
  const link = (a, b, v) => links.set(`${a}→${b}`, { source: a, target: b, value: (links.get(`${a}→${b}`)?.value || 0) + v });
  for (const f of fl) {
    const e = entity(f.from);
    const k = kindInfo(e.kind);
    const kid = `k:${e.kind}`;
    node(kid, k.label, k.color);
    const iid = topInv.has(e.id) ? `i:${e.id}` : `i:other:${e.kind}`;
    node(iid, topInv.has(e.id) ? e.name : `Other ${k.label.toLowerCase()}`, k.color, topInv.has(e.id) ? `entity::${e.id}` : null);
    const dn = topDest.has(destName(f)) ? destName(f) : 'Other countries';
    const did = `d:${dn}`;
    node(did, dn, '#e7eefb');
    link(kid, iid, f.amountUSD);
    link(iid, did, f.amountUSD);
  }
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

function moneyNetwork() {
  const edges = new Map();
  const add = (a, b, v, label) => {
    if (!a || !b || a === b || !S.byEntity.has(a) || !S.byEntity.has(b)) return;
    const k = `${a}|${b}`;
    const cur = edges.get(k) || { source: a, target: b, value: 0, labels: [] };
    cur.value += v || 0;
    if (label) cur.labels.push(label);
    edges.set(k, cur);
  };
  for (const d of S.deals) {
    if (d.status === 'cancelled' || !d.target?.entityId) continue;
    const share = d.amountUSD ? d.amountUSD / Math.max(1, d.investors.length) : 0;
    d.investors.forEach((i) => add(i.entityId, d.target.entityId, share, `${flowInfo(d.kind).label}: ${d.title}`));
  }
  for (const e of S.entities) (e.ownedBy || []).forEach((o) => add(o.entityId, e.id, 0, `owns ${o.stakePct ? o.stakePct + '%' : 'a stake'}`));
  const weight = new Map();
  for (const ed of edges.values()) {
    weight.set(ed.source, (weight.get(ed.source) || 0) + ed.value + 1e8);
    weight.set(ed.target, (weight.get(ed.target) || 0) + ed.value + 1e8);
  }
  const keep = new Set([...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 55).map(([id]) => id));
  const cycles = findCycles([...edges.values()]);
  const cycleEdges = new Set(cycles.flatMap((c) => c.map((id, i) => `${id}|${c[(i + 1) % c.length]}`)));
  const links = [...edges.values()].filter((e) => keep.has(e.source) && keep.has(e.target)).map((e) => ({ ...e, label: e.labels.slice(0, 2).join(' · '), cycle: cycleEdges.has(`${e.source}|${e.target}`) }));
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const nodes = [...used].map((id) => {
    const e = entity(id);
    return { id, name: e.name, sub: kindInfo(e.kind).label, color: kindInfo(e.kind).color, value: weight.get(id) || 0 };
  });
  return { nodes, links, cycles };
}

// Simple bounded DFS for money loops of length 2–4.
function findCycles(edges) {
  const out = new Map();
  edges.forEach((e) => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e.target);
  });
  const found = new Map();
  for (const start of out.keys()) {
    const stack = [[start, [start]]];
    while (stack.length) {
      const [n, path] = stack.pop();
      for (const nx of out.get(n) || []) {
        if (nx === start && path.length >= 2) {
          const key = [...path].sort().join('|');
          if (!found.has(key)) found.set(key, [...path]);
        } else if (!path.includes(nx) && path.length < 4) stack.push([nx, [...path, nx]]);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.length - b.length).slice(0, 12);
}

function money(root) {
  const p = pulse();
  const kinds = Object.entries(p.byKind).sort((a, b) => b[1] - a[1]);
  root.innerHTML = `
    ${head('Money pulse', 'How much money is pouring in, and where it goes', `A live snapshot built from <b>${fmtNum(S.deals.length)}</b> sourced deals, <b>${fmtNum(S.campuses.length)}</b> researched campuses and hyperscaler filings. Every number links back to its sources. Click anything to open it.`)}
    ${pulseCards(p)}
    <p class="note" style="margin-top:10px">Deal totals mix different kinds of money: acquisitions, debt, multi-year compute contracts and sovereign pledges. Treat the total as a measure of scale, not as one pot of cash. Where several investors share a deal and the split isn't disclosed, it's divided evenly.</p>

    ${sectionTitle('What kind of money', 'Tracked deal value by instrument')}
    <div class="grid g2">
      ${card(`<h3>By instrument</h3><p class="c-sub">Sum of deal amounts per deal type</p>${kinds.length ? bars(kinds.map(([k, v]) => ({ name: flowInfo(k).label, value: v, color: flowInfo(k).color })), { fmt: fmtUSD }) : '<p class="empty">Deals are still being researched.</p>'}`)}
      ${card(`<h3>Largest deals</h3><p class="c-sub">Acquisitions, financings and contracts. Click one to open it.</p>${bars(S.deals.filter((d) => d.amountUSD && d.status !== 'cancelled' && !isPledge(d)).sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 10).map((d) => ({ name: d.title, value: d.amountUSD, color: flowInfo(d.kind).color, open: `deal::${d.id}` })), { fmt: fmtUSD })}`)}
      ${S.deals.some(isPledge) ? card(`<h3>Biggest pledges</h3><p class="c-sub">Headline “we will invest” announcements by companies and governments. They span years and often overlap.</p>${bars(S.deals.filter((d) => d.amountUSD && isPledge(d)).sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 10).map((d) => ({ name: d.title, value: d.amountUSD, color: '#c38bff', open: `deal::${d.id}` })), { fmt: fmtUSD })}`, 'span2') : ''}
    </div>

    ${sectionTitle('What didn’t happen', 'Projects scrapped, paused or blocked, and the leases and deals that walked away')}
    ${stalledHTML()}

    ${sectionTitle('Where it comes from → where it lands', 'Investor type → investor → destination country')}
    ${card(`<div class="chart" id="ch-sankey"></div><div class="c-foot">Built from deal investors and campus capital stacks. Destinations are campus countries, or the target company’s home country when no campus is named.</div>`)}

    ${sectionTitle('The web of money', 'Who funds whom. Pink links are part of a loop where money comes back around.')}
    ${card(`<div class="legend" id="net-legend"></div><div class="chart" id="ch-network" style="margin-top:8px"></div><div id="cycles"></div>`)}

    ${sectionTitle('Deals explorer', 'Every tracked deal on a timeline; bubble size is the amount')}
    ${card(`<div class="chart" id="ch-timeline"></div>
      <div class="toolbar" style="margin-top:14px">
        <input class="input" id="deal-q" placeholder="Filter deals…" aria-label="Filter deals" />
        <select class="select" id="deal-kind" aria-label="Deal type"><option value="">All types</option>${[...new Set(S.deals.map((d) => d.kind))].sort().map((k) => `<option value="${esc(k)}">${esc(flowInfo(k).label)}</option>`).join('')}</select>
        <select class="select" id="deal-status" aria-label="Status"><option value="">Any status</option>${[...new Set(S.deals.map((d) => d.status))].sort().map((k) => `<option>${esc(k)}</option>`).join('')}</select>
        <span class="note" id="deal-count"></span>
      </div>
      <div class="table-wrap"><table class="t" id="deal-table"><thead><tr><th data-k="date" aria-sort="descending">Date</th><th data-k="title">Deal</th><th data-k="kind">Type</th><th data-k="amountUSD">Amount</th><th data-k="status">Status</th></tr></thead><tbody></tbody></table></div>`)}

    ${sectionTitle('The capex supercycle', 'Capital expenditure by year; dashed segments are company guidance')}
    ${card(`<div class="chart" id="ch-capex"></div><div class="c-foot">From earnings releases and annual reports. Fiscal years differ (Microsoft’s ends in June), and some figures include finance leases. Hover a point for details.</div>`)}

    ${sectionTitle('Is it earning anything?', 'Revenue, backlog, rents and yields set against the spending')}
    <div id="returns"></div>
  `;

  sankeyChart($('#ch-sankey'), flowsSankey(), { height: Math.max(420, Math.min(680, 26 * 22)), onClick: (d) => d.open && api.openRef(d.open), label: 'Sankey of capital from investor types to destination countries' });

  const net = moneyNetwork();
  const kindsUsed = [...new Set(net.nodes.map((n) => entity(n.id).kind))];
  $('#net-legend').innerHTML = kindsUsed.map((k) => `<span><i style="--c:${kindInfo(k).color}"></i>${esc(kindInfo(k).label)}</span>`).join('');
  cleanup.push(networkChart($('#ch-network'), net, { height: innerWidth < 700 ? 460 : 600, onClick: (d) => api.select(entity(d.id)), label: 'Network of investors and companies linked by deals' }));
  $('#cycles').innerHTML = net.cycles.length
    ? `<h3 style="margin-top:14px">Money loops found in the data</h3><p class="c-sub">Chains where money comes back to where it started: a supplier invests in a customer that buys from the supplier, or the like.</p><div class="list">${net.cycles
        .map((c) => `<div class="row"><span class="ico" style="--c:#ff5fa2">↻</span><span class="main"><span class="t">${[...c, c[0]].map((id) => `<a href="#" data-open="entity::${esc(id)}">${esc(entity(id)?.name || id)}</a>`).join(' → ')}</span></span><span class="r"></span></div>`)
        .join('')}</div>`
    : '';

  timelineChart($('#ch-timeline'), S.deals.filter((d) => d.status !== 'cancelled'), { height: innerWidth < 700 ? 240 : 300, colorOf: (d) => flowInfo(d.kind).color, onClick: (d) => api.select(d), label: 'Timeline of deals' });
  dealTable();

  const hyper = [['microsoft', '#4d8dff'], ['google', '#3ddc97'], ['amazon', '#ffb02e'], ['meta', '#38e1ff'], ['oracle', '#ff5a5a'], ['apple', '#c7d3e6'], ['coreweave', '#a98bff'], ['xai', '#ff5fa2'], ['alibaba', '#ff8a3d'], ['tencent', '#8cf27a']];
  const series = hyper
    .map(([id, color]) => {
      const years = [...new Set(S.capex.filter((r) => r.entityId === id).map((r) => r.year))].sort();
      const points = years.map((y) => {
        const r = pickCapex(id, y);
        return { x: y, y: r.capexUSD, guide: r.kind !== 'actual', note: [r.fiscal, r.note].filter(Boolean).join(' · ') };
      });
      return { name: entity(id)?.name || id, color, points };
    })
    .filter((s) => s.points.length >= 2);
  if (series.length) lineChart($('#ch-capex'), series, { height: innerWidth < 700 ? 280 : 360, label: 'Hyperscaler capex by year' });
  else $('#ch-capex').innerHTML = '<p class="empty">Capex data is still being researched.</p>';

  $('#returns').innerHTML = returnsHTML();
}

function stalledHTML() {
  const dead = S.campuses.filter(isDead).sort((a, b) => (b.lostInvestmentUSD ?? b.investmentUSD ?? 0) - (a.lostInvestmentUSD ?? a.investmentUSD ?? 0) || (b.powerMW || 0) - (a.powerMW || 0));
  const aggs = (S.aggregates || []).filter((a) => a.value);
  const ev = S.events || [];
  const unv = (r) => (r.verified === false ? ' <span class="pill" style="--c:#ff8a3d">unverified</span>' : '');
  const aggCards = aggs
    .map((a) => `<div class="pulse-card" style="--c:#ff5a5a"><div class="k">Industry tally</div><div class="v">${a.unit === 'USD' ? fmtUSD(a.value) : fmtNum(a.value)}</div><div class="s">${esc(a.label)}${unv(a)}${a.url ? ` · <a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">source</a>` : ''}</div></div>`)
    .join('');
  const deadRows = dead
    .slice(0, 12)
    .map((c) => `<button class="row" data-open="campus::${esc(c.id)}"><span class="ico" style="--c:${statusInfo(c.status).color}">✕</span><span class="main"><span class="t">${esc(c.name)}${unv(c)}</span><span class="s wrap">${esc(statusInfo(c.status).label)} · ${esc((c.reason || c.controversy || '').slice(0, 150))}</span></span><span class="r">${fmtUSD(c.lostInvestmentUSD ?? c.investmentUSD)}${c.powerMW ? `<small>${fmtMW(c.powerMW)}</small>` : ''}</span></button>`)
    .join('');
  const evRows = ev
    .slice(0, 14)
    .map((e) => {
      const tag = e.relatedCampusId ? `button class="row" data-open="campus::${esc(e.relatedCampusId)}"` : 'div class="row"';
      return `<${tag}><span class="ico" style="--c:#ff8a3d">!</span><span class="main"><span class="t">${esc(e.title)}${unv(e)}</span><span class="s wrap">${esc(fmtDate(e.date))} · ${esc(String(e.kind || '').replace(/-/g, ' '))}${e.reason ? ` · ${esc(e.reason.slice(0, 160))}` : ''}</span></span><span class="r">${e.lostInvestmentUSD ? fmtUSD(e.lostInvestmentUSD) : e.mw ? fmtMW(e.mw) : ''}</span></${tag.split(' ')[0]}>`;
    })
    .join('');
  if (!dead.length && !ev.length) return card('<p class="empty">Scrapped projects are still being researched.</p>');
  return `${aggCards ? `<div class="pulse" style="margin-bottom:16px">${aggCards}</div>` : ''}<div class="grid g2">
    ${card(`<h3>Scrapped, paused & blocked sites</h3><p class="c-sub">${dead.length} projects · ${fmtUSD(sum(dead, (c) => c.lostInvestmentUSD ?? c.investmentUSD ?? 0))} of planned investment</p><div class="list">${deadRows}</div>`)}
    ${ev.length ? card(`<h3>Walk-aways, collapses & redesigns</h3><p class="c-sub">${ev.length} events where a lease, merger, tenant or design didn’t go ahead as planned</p><div class="list">${evRows}</div>`) : ''}
  </div>`;
}

function dealTable() {
  const tbody = $('#deal-table tbody');
  let sortK = 'date';
  let dir = -1;
  const draw = () => {
    const q = $('#deal-q').value.toLowerCase();
    const k = $('#deal-kind').value;
    const st = $('#deal-status').value;
    const rows = S.deals
      .filter((d) => (!k || d.kind === k) && (!st || d.status === st) && (!q || `${d.title} ${d.summary} ${d.investors.map((i) => i.name).join(' ')} ${d.target?.name}`.toLowerCase().includes(q)))
      .sort((a, b) => {
        const va = a[sortK] ?? '';
        const vb = b[sortK] ?? '';
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
      });
    $('#deal-count').textContent = `${rows.length} deals · ${fmtUSD(sum(rows, (d) => d.amountUSD || 0))}`;
    tbody.innerHTML = rows
      .map((d) => `<tr class="clickable" data-open="deal::${esc(d.id)}"><td class="mono dim">${esc(d.date || '')}</td><td><b style="font-weight:500">${esc(d.title)}</b>${d.verified === false ? ' <span class="pill" style="--c:#ff8a3d">unverified</span>' : ''}<div class="dim" style="font-size:12px">${esc(d.investors.map((i) => i.name).slice(0, 4).join(', '))}${d.target ? ` → ${esc(d.target.name)}` : ''}</div></td><td><span class="pill" style="--c:${flowInfo(d.kind).color}">${esc(flowInfo(d.kind).label)}</span></td><td class="num">${fmtUSD(d.amountUSD)}</td><td>${esc(d.status)}</td></tr>`)
      .join('');
  };
  ['deal-q', 'deal-kind', 'deal-status'].forEach((id) => $(`#${id}`).addEventListener('input', draw));
  $('#deal-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    if (sortK === th.dataset.k) dir *= -1;
    else {
      sortK = th.dataset.k;
      dir = sortK === 'title' || sortK === 'kind' ? 1 : -1;
    }
    [...th.parentElement.children].forEach((x) => x.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
    draw();
  });
  draw();
}

function returnsHTML() {
  const M = S.metrics;
  if (!M.length) return card('<p class="empty">Return metrics are still being researched: cloud revenue, backlog, AI-lab revenue vs. compute commitments, rents, vacancy and cap rates.</p>');
  const groups = [
    ['Cloud revenue & backlog', /cloud-revenue|backlog|rpo|revenue-run-rate|revenue$|ai-revenue/],
    ['AI labs: revenue vs. commitments', /compute-commitments|valuation/],
    ['Spending vs. cash', /capex-to-revenue|free-cash-flow|depreciation|debt-outstanding/],
    ['Real estate: rents, vacancy, cap rates', /cap-rate|rent-per-kw|vacancy|dividend-yield|cost-per-mw/],
    ['Market reaction', /stock-return|other/],
  ];
  const used = new Set();
  const blocks = groups
    .map(([title, re]) => {
      const rows = M.filter((m) => !used.has(m) && re.test(m.metric || ''));
      rows.forEach((m) => used.add(m));
      if (!rows.length) return '';
      return card(
        `<h3>${esc(title)}</h3><div class="list" style="margin-top:10px">${rows
          .slice(0, 14)
          .map(
            (m) =>
              `<${m.entityId && S.byEntity.has(m.entityId) ? `button class="row" data-open="entity::${esc(m.entityId)}"` : 'div class="row"'}><span class="ico" style="--c:${kindInfo(entity(m.entityId)?.kind).color}">${esc(initials(entity(m.entityId)?.name || m.label || '?'))}</span><span class="main"><span class="t">${esc(m.label || m.metric)}</span><span class="s">${esc([m.period, m.note].filter(Boolean).join(' · ').slice(0, 140))}</span></span><span class="r">${fmtMetric(m)}${m.url ? `<small><a href="${safeUrl(m.url)}" target="_blank" rel="noopener noreferrer">source</a></small>` : ''}</span></${m.entityId && S.byEntity.has(m.entityId) ? 'button' : 'div'}>`
          )
          .join('')}</div>`
      );
    })
    .join('');
  // derived: commitments ÷ revenue
  const ratios = [...new Set(M.map((m) => m.entityId).filter(Boolean))]
    .map((id) => {
      const com = M.filter((m) => m.entityId === id && m.metric === 'compute-commitments' && m.value).sort((a, b) => b.value - a.value)[0];
      const rev = M.filter((m) => m.entityId === id && /revenue/.test(m.metric) && m.value && m.unit !== 'pct').sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return com && rev ? { id, com, rev, x: com.value / rev.value } : null;
    })
    .filter(Boolean);
  const ratioCard = ratios.length
    ? card(`<h3>Commitments vs. revenue</h3><p class="c-sub">Compute committed, as a multiple of annual revenue or run-rate</p>${bars(ratios.map((r) => ({ name: entity(r.id)?.name || r.id, value: r.x, label: `${r.x.toFixed(0)}×`, sub: `${fmtUSD(r.com.value)} ÷ ${fmtUSD(r.rev.value)}`, color: '#ff5fa2', open: `entity::${r.id}` })), { ranked: false })}`)
    : '';
  return `<div class="grid g2">${ratioCard}${blocks}</div>`;
}

// ======================================================================= PLAYERS
function players(root) {
  const counts = {};
  S.entities.forEach((e) => (counts[e.kind] = (counts[e.kind] || 0) + 1));
  const outflow = new Map();
  S.flows.forEach((f) => outflow.set(f.from, (outflow.get(f.from) || 0) + (f.amountUSD || 0)));
  const stubs = S.entities.filter((e) => e.stub).length;
  root.innerHTML = `
    ${head('Players', 'Who builds, owns, rents and finances the world’s compute', `<b>${fmtNum(S.entities.length - stubs)}</b> profiled players, from hyperscalers and AI labs to the private equity, sovereign wealth and private credit behind them. Click a card for its ownership chain, campuses and deals.`)}
    <div class="toolbar">
      <input class="input" id="pl-q" placeholder="Search players…" aria-label="Search players" style="min-width:220px" />
      <select class="select" id="pl-sort" aria-label="Sort players"><option value="money">Sort: most money tracked</option><option value="campuses">Sort: most campuses</option><option value="name">Sort: name</option></select>
      <label class="switch" style="margin-left:6px"><input type="checkbox" id="pl-stubs" /><span></span>Show unprofiled (${stubs})</label>
    </div>
    <div class="chips" id="pl-kinds" style="margin-bottom:16px"></div>
    <div class="pgrid" id="pl-grid"></div>`;
  const sel = new Set();
  $('#pl-kinds').innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<button class="chip" aria-pressed="false" data-k="${esc(k)}" style="--c:${kindInfo(k).color}"><i></i>${esc(kindInfo(k).label)} <span class="n">${n}</span></button>`)
    .join('');
  const score = (e) => (outflow.get(e.id) || 0) + sum((S.dealsOf.get(e.id) || []), (d) => d.amountUSD || 0) * 0.5 + (S.roles.get(e.id)?.length || 0) * 1e8 + (e.capexUSD?.['2025'] || 0);
  const headline = (e) => {
    if (e.capexUSD?.['2026']) return `Capex 2026: ${fmtUSD(e.capexUSD['2026'])}`;
    if (e.capexUSD?.['2025']) return `Capex 2025: ${fmtUSD(e.capexUSD['2025'])}`;
    if (e.valuationUSD) return `Valued at ${fmtUSD(e.valuationUSD)}`;
    if (e.aumUSD) return `AUM ${fmtUSD(e.aumUSD)}`;
    if (outflow.get(e.id)) return `${fmtUSD(outflow.get(e.id))} tracked outflows`;
    if (e.fundingUSD) return `Raised ${fmtUSD(e.fundingUSD)}`;
    const n = S.roles.get(e.id)?.length;
    return n ? `${n} campus links` : '';
  };
  const draw = () => {
    const q = $('#pl-q').value.toLowerCase();
    const showStubs = $('#pl-stubs').checked;
    const sort = $('#pl-sort').value;
    const list = S.entities
      .filter((e) => (showStubs || !e.stub) && (!sel.size || sel.has(e.kind)) && (!q || `${e.name} ${e.description || ''} ${e.hq?.city || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'campuses' ? (S.roles.get(b.id)?.length || 0) - (S.roles.get(a.id)?.length || 0) : score(b) - score(a)));
    $('#pl-grid').innerHTML =
      list
        .map((e) => {
          const k = kindInfo(e.kind);
          return `<button class="pcard" data-open="entity::${esc(e.id)}" style="--c:${k.color}"><div class="pc-top"><span class="pc-logo">${esc(initials(e.name))}</span><div><div class="pc-name">${esc(e.name)}</div><div class="pc-hq">${esc(k.label)}${e.hq?.city ? ` · ${flag(e.hq.countryCode)} ${esc(e.hq.city)}` : ''}</div></div></div>${headline(e) ? `<div class="pc-num">${esc(headline(e))}</div>` : ''}${e.description ? `<div class="pc-desc">${esc(e.description)}</div>` : e.stub ? '<div class="pc-desc">Appears in deals or campus records; profile pending.</div>' : ''}</button>`;
        })
        .join('') || '<p class="empty">No players match.</p>';
  };
  $('#pl-kinds').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const k = b.dataset.k;
    sel.has(k) ? sel.delete(k) : sel.add(k);
    b.setAttribute('aria-pressed', String(sel.has(k)));
    draw();
  });
  ['pl-q', 'pl-sort', 'pl-stubs'].forEach((id) => $(`#${id}`).addEventListener('input', draw));
  draw();
}

// ======================================================================= RANKINGS
function rankings(root) {
  const live = S.campuses.filter((c) => isSite(c) && !isDead(c));
  const outflow = new Map();
  S.flows.forEach((f) => f.amountUSD && outflow.set(f.from, (outflow.get(f.from) || 0) + f.amountUSD));
  const ccCount = new Map();
  S.facilities.forEach((f) => f.cc && ccCount.set(f.cc, (ccCount.get(f.cc) || 0) + 1));
  const ccPipe = new Map();
  live.forEach((c) => c.countryCode && c.powerMW && ccPipe.set(c.countryCode, (ccPipe.get(c.countryCode) || 0) + c.powerMW));
  const ops = new Map();
  S.facilities.forEach((f) => {
    const k = f.eid ? `e:${f.eid}` : f.operator ? `r:${f.operator.trim()}` : null;
    if (k) ops.set(k, (ops.get(k) || 0) + 1);
  });
  const startups = S.entities.filter((e) => ['neocloud', 'ai-lab', 'crypto-miner', 'developer'].includes(e.kind) && (e.valuationUSD || e.fundingUSD));
  const capexYear = Math.max(...S.capex.map((c) => c.year).filter((y) => y <= new Date().getFullYear()), 0);
  const capexRows = [...new Set(S.capex.map((c) => c.entityId))].map((id) => ({ id, r: pickCapex(id, capexYear) })).filter((x) => x.r);
  const dead = S.campuses.filter(isDead);
  const pdbTop = S.facilities.filter((f) => f.nets).sort((a, b) => b.nets - a.nets).slice(0, 12);
  const clusters = S.campuses.filter((c) => c.type === 'cluster' && c.powerMW).sort((a, b) => b.powerMW - a.powerMW);
  const C = (t, sub, inner, cls = '') => card(`<h3>${esc(t)}</h3><p class="c-sub">${sub}</p>${inner}`, cls);
  root.innerHTML = `
    ${head('Rankings', 'The leaderboards of the compute economy', 'The biggest campuses, deals, spenders and hubs, computed live from the atlas. Click any row to open it.')}
    <div class="grid g2">
      ${C('Biggest campuses by planned power', 'Researched sites, excluding market clusters and dead projects', bars(live.filter((c) => c.powerMW).sort((a, b) => b.powerMW - a.powerMW).slice(0, 15).map((c) => ({ name: c.name, sub: c.countryCode, value: c.powerMW, color: typeInfo(c.type).color, open: `campus::${c.id}` })), { fmt: fmtMW }))}
      ${C('Biggest campuses by announced investment', 'What the developer or government says it will cost', bars(live.filter((c) => c.investmentUSD).sort((a, b) => b.investmentUSD - a.investmentUSD).slice(0, 15).map((c) => ({ name: c.name, sub: c.countryCode, value: c.investmentUSD, color: typeInfo(c.type).color, open: `campus::${c.id}` })), { fmt: fmtUSD }))}
      ${C('Biggest deals', 'Acquisitions, financings and compute contracts', bars(S.deals.filter((d) => d.amountUSD && d.status !== 'cancelled' && !isPledge(d)).sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 15).map((d) => ({ name: d.title, sub: yearOf(d.date), value: d.amountUSD, color: flowInfo(d.kind).color, open: `deal::${d.id}` })), { fmt: fmtUSD }))}
      ${S.deals.some(isPledge) ? C('Biggest pledges', 'Corporate and national investment announcements (multi-year)', bars(S.deals.filter((d) => d.amountUSD && isPledge(d)).sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 12).map((d) => ({ name: d.title, sub: yearOf(d.date), value: d.amountUSD, color: '#c38bff', open: `deal::${d.id}` })), { fmt: fmtUSD })) : ''}
      ${C('Most capital deployed', 'Tracked outflows into deals and campuses, by investor', bars([...outflow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, v]) => ({ name: entity(id)?.name || id, sub: kindInfo(entity(id)?.kind).label, value: v, color: kindInfo(entity(id)?.kind).color, open: `entity::${id}` })), { fmt: fmtUSD }))}
      ${capexRows.length ? C(`Hyperscaler capex, ${capexYear}`, 'Actual where reported, otherwise latest guidance', bars(capexRows.sort((a, b) => b.r.capexUSD - a.r.capexUSD).map((x) => ({ name: entity(x.id)?.name || x.id, sub: x.r.kind === 'actual' ? '' : 'guidance', value: x.r.capexUSD, color: kindInfo(entity(x.id)?.kind).color, open: `entity::${x.id}` })), { fmt: fmtUSD })) : ''}
      ${startups.length ? C('Most valuable AI infrastructure startups', 'Neoclouds, labs and builders by latest valuation (or total raised)', bars(startups.sort((a, b) => (b.valuationUSD || b.fundingUSD) - (a.valuationUSD || a.fundingUSD)).slice(0, 15).map((e) => ({ name: e.name, sub: e.valuationUSD ? 'valuation' : 'raised', value: e.valuationUSD || e.fundingUSD, color: kindInfo(e.kind).color, open: `entity::${e.id}` })), { fmt: fmtUSD })) : ''}
      ${C('Countries by number of facilities', 'Base layer: PeeringDB + OpenStreetMap', bars([...ccCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([cc, n]) => ({ name: `${flag(cc)} ${countryName(cc)}`, value: n })), { fmt: fmtNum }))}
      ${C('Countries by researched power', 'Planned MW at researched campuses (live + pipeline)', bars([...ccPipe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([cc, v]) => ({ name: `${flag(cc)} ${countryName(cc)}`, value: v, color: '#ffb02e' })), { fmt: fmtMW }))}
      ${C('Operators by facility count', 'Grouped by known player where matched', bars([...ops.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ name: k.startsWith('e:') ? entity(k.slice(2))?.name || k.slice(2) : k.slice(2), value: n, color: k.startsWith('e:') ? kindInfo(entity(k.slice(2))?.kind).color : '#5d6b85', open: k.startsWith('e:') && S.byEntity.has(k.slice(2)) ? `entity::${k.slice(2)}` : null })), { fmt: fmtNum }))}
      ${C('The internet’s busiest buildings', 'Facilities with the most networks present (PeeringDB)', bars(pdbTop.map((f) => ({ name: f.name, sub: f.cc, value: f.nets, open: `facility::${f.id}` })), { fmt: (v) => `${fmtNum(v)} nets` }))}
      ${clusters.length ? C('Largest data center markets', 'Metro clusters by capacity', bars(clusters.slice(0, 12).map((c) => ({ name: c.name, sub: c.countryCode, value: c.powerMW, color: '#e7eefb', open: `campus::${c.id}` })), { fmt: fmtMW })) : ''}
      ${dead.length ? C('Biggest scrapped & stalled projects', 'Cancelled, paused, blocked or scaled back', bars(dead.sort((a, b) => (b.powerMW || 0) - (a.powerMW || 0) || (b.lostInvestmentUSD || b.investmentUSD || 0) - (a.lostInvestmentUSD || a.investmentUSD || 0)).slice(0, 12).map((c) => ({ name: c.name, sub: statusInfo(c.status).label, value: c.powerMW || 0, label: c.powerMW ? fmtMW(c.powerMW) : fmtUSD(c.lostInvestmentUSD || c.investmentUSD), color: '#ff5a5a', open: `campus::${c.id}` })), {})) : ''}
    </div>`;
}

// ======================================================================= PATTERNS
function patterns(root) {
  const stories = [];
  const add = (s) => s && stories.push(s);
  const sites = S.campuses.filter(isSite);

  // 1 — gigawatt race
  {
    const pts = sites.filter((c) => c.powerMW && yearOf(c.announced) && yearOf(c.announced) >= 2010);
    if (pts.length >= 6) {
      const early = median(pts.filter((c) => yearOf(c.announced) <= 2022).map((c) => c.powerMW));
      const late = median(pts.filter((c) => yearOf(c.announced) >= 2025).map((c) => c.powerMW));
      const big = [...pts].sort((a, b) => b.powerMW - a.powerMW)[0];
      const gw = pts.filter((c) => c.powerMW >= 1000 && yearOf(c.announced) >= 2024).length;
      const gwBefore = pts.filter((c) => c.powerMW >= 1000 && yearOf(c.announced) < 2024).length;
      const gwSum = sum(pts.filter((c) => c.powerMW >= 1000 && yearOf(c.announced) >= 2024), (c) => c.powerMW);
      add({
        id: 'gw',
        title: 'The gigawatt race',
        big: `${gw} GW-scale campuses`,
        color: '#ffb02e',
        text: `Since 2024, <b>${gw}</b> campuses planned at 1 GW or more have been announced, together about <b>${fmtMW(gwSum)}</b>. ${gwBefore <= 3 ? `Before 2024 we track only <b>${gwBefore}</b>.` : `Before 2024 we track <b>${gwBefore}</b>, mostly long-running hyperscale estates that grew into gigawatts over a decade.`} ${early && late && late > early ? `The median campus announced since 2025 plans <b>${fmtMW(late)}</b>, against <b>${fmtMW(early)}</b> before 2023. ` : ''}The largest we track is <a href="#" data-open="campus::${esc(big.id)}">${esc(big.name)}</a> at <b>${fmtMW(big.powerMW)}</b> planned, more than the whole grid of many countries. A single AI campus now draws as much as a mid-size city.`,
        chart: (el) =>
          scatterChart(
            el,
            pts.map((c) => ({ x: yearOf(c.announced), jx: (Math.random() - 0.5) * 18, y: c.powerMW, r: c.investmentUSD || 0, color: isDead(c) ? '#ff5a5a' : typeInfo(c.type).color, id: c.id, tip: `<b>${esc(c.name)}</b><div class="muted" style="font-size:12px">announced ${esc(c.announced)} · ${esc(statusInfo(c.status).label)}</div><div class="mono" style="color:var(--gold)">${fmtMW(c.powerMW)}${c.investmentUSD ? ' · ' + fmtUSD(c.investmentUSD) : ''}</div>` })),
            { onClick: (p) => api.select(S.byCampus.get(p.id)), label: 'Planned campus power by year announced' }
          ),
        foot: 'Each bubble is a campus: the y-axis is planned power on a log scale, bubble size is announced investment and color is campus type. Red bubbles are dead projects.',
      });
    }
  }

  // 2 — follow the power
  {
    const pdb = S.facilities.filter((f) => f.src === 'pdb');
    const dist = (c) => {
      let best = Infinity;
      for (const f of pdb) {
        if (Math.abs(f.lat - c.lat) > 8) continue;
        const d = haversine(c, f);
        if (d < best) best = d;
      }
      return best === Infinity ? null : best;
    };
    const groups = [
      { name: 'AI & crypto→AI', color: '#ffb02e', types: ['ai', 'crypto'] },
      { name: 'Sovereign AI', color: '#a98bff', types: ['sovereign'] },
      { name: 'Hyperscale cloud', color: '#4d8dff', types: ['cloud'] },
      { name: 'Colocation', color: '#38e1ff', types: ['colo'] },
    ]
      .map((g) => {
        const values = sites.filter((c) => g.types.includes(c.type)).map((c) => ({ c, v: dist(c) })).filter((x) => x.v != null).map((x) => ({ v: Math.max(0.5, x.v), tip: `<b>${esc(x.c.name)}</b><div class="mono" style="color:var(--gold)">${fmtKm(x.v)} to nearest interconnection facility</div>` }));
        return { ...g, values, median: median(values.map((v) => v.v)) };
      })
      .filter((g) => g.values.length >= 3);
    const ai = groups.find((g) => g.types.includes('ai'));
    const colo = groups.find((g) => g.types.includes('colo')) || groups.find((g) => g.types.includes('cloud'));
    if (ai && colo)
      add({
        id: 'power',
        title: 'Follow the power, not the people',
        big: `${(ai.median / Math.max(0.5, colo.median)).toFixed(0)}× farther`,
        color: '#ff5a5a',
        text: `Classic data centers cluster around internet exchanges in big cities, because latency to users matters. AI training doesn't need that: a model being trained isn't waiting on anyone's phone. So the new campuses go wherever the megawatts are. The median AI campus we track sits <b>${fmtKm(ai.median)}</b> from the nearest interconnection facility in PeeringDB, against <b>${fmtKm(colo.median)}</b> for ${colo.name.toLowerCase()}. That's how places like rural Texas, Louisiana parishes, Wyoming and the Nordic fjords became compute hubs.`,
        chart: (el) => stripChart(el, groups, { fmt: (v) => fmtKm(v), xLabel: 'km to nearest PeeringDB facility (log)', label: 'Distance to nearest interconnection facility by campus type' }),
        foot: 'Distance from each researched campus to the closest of 5,300+ PeeringDB interconnection facilities. White ticks mark the medians.',
      });
  }

  // 3 — source vs destination
  {
    const fl = S.flows.filter((f) => f.amountUSD && hasHQ(f.from) && f.to.cc);
    if (fl.length >= 5) {
      const src = new Map();
      const dst = new Map();
      let cross = 0;
      fl.forEach((f) => {
        const s = entity(f.from).hq.countryCode;
        if (!s) return;
        src.set(s, (src.get(s) || 0) + f.amountUSD);
        dst.set(f.to.cc, (dst.get(f.to.cc) || 0) + f.amountUSD);
        if (s !== f.to.cc) cross += f.amountUSD;
      });
      const total = sum(fl, (f) => f.amountUSD);
      const foreignSrc = [...src.entries()].filter(([cc]) => cc !== 'US').sort((a, b) => b[1] - a[1]).slice(0, 4);
      const usShare = (src.get('US') || 0) / total;
      const foreign = fl.filter((f) => entity(f.from).hq.countryCode && entity(f.from).hq.countryCode !== 'US');
      const stateShare = sum(foreign.filter((f) => ['sovereign-wealth', 'pension', 'government'].includes(entity(f.from).kind)), (f) => f.amountUSD) / Math.max(1, sum(foreign, (f) => f.amountUSD));
      const row = (m, color) => bars([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cc, v]) => ({ name: `${flag(cc)} ${countryName(cc)}`, value: v, color })), { fmt: fmtUSD });
      add({
        id: 'cross',
        title: 'Where the money comes from vs. where it lands',
        big: fmtPct((cross / total) * 100),
        color: '#ffd166',
        text: `Of the capital we can trace from an investor's home country to a destination, <b>${fmtPct((cross / total) * 100)}</b> crosses a border. US investors supply <b>${fmtPct(usShare * 100)}</b> of it. The biggest sources outside the US are ${foreignSrc.map(([cc, v]) => `${flag(cc)} <b>${esc(countryName(cc))}</b> (${fmtUSD(v)})`).join(', ')}. Sovereign funds, pensions and governments supply <b>${fmtPct(stateShare * 100)}</b> of the non-US money.`,
        html: `<div class="grid g2"><div><div class="hud-label" style="margin-top:0">Money from</div>${row(src, '#ffd166')}</div><div><div class="hud-label" style="margin-top:0">Money into</div>${row(dst, '#38e1ff')}</div></div>`,
        foot: 'Investor HQ country → campus country (or target company HQ). Shares of multi-investor deals are split evenly.',
      });
    }
  }

  // 4 — sovereign wealth
  {
    const sov = S.flows.filter((f) => f.amountUSD && ['sovereign-wealth', 'government', 'pension'].includes(entity(f.from)?.kind));
    if (sov.length >= 3) {
      const by = new Map();
      sov.forEach((f) => by.set(f.from, (by.get(f.from) || 0) + f.amountUSD));
      const gulf = sum(sov.filter((f) => ['AE', 'SA', 'QA', 'KW'].includes(entity(f.from)?.hq?.countryCode)), (f) => f.amountUSD);
      add({
        id: 'sov',
        title: 'States and pensions go all-in on compute',
        big: fmtUSD(sum(sov, (f) => f.amountUSD)),
        color: '#ffd166',
        text: `Sovereign wealth funds, governments and pension funds account for <b>${fmtUSD(sum(sov, (f) => f.amountUSD))}</b> of the deal flow we can trace${gulf ? `, <b>${fmtUSD(gulf)}</b> of it from the Gulf` : ''}. For oil states, AI data centers are a way to recycle energy wealth into the next industrial base. For pensions, they look like long-dated, contracted cash flows, a lot like toll roads.`,
        html: bars([...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ name: entity(id).name, sub: flag(entity(id).hq?.countryCode), value: v, color: kindInfo(entity(id).kind).color, open: `entity::${id}` })), { fmt: fmtUSD }),
      });
    }
  }

  // 5 — circular deals
  {
    const net = moneyNetwork();
    if (net.cycles.length)
      add({
        id: 'loops',
        title: 'The circular economy of AI',
        big: `${net.cycles.length} money loops`,
        color: '#ff5fa2',
        text: `Some of the biggest deals feed back into each other. A chipmaker invests in an AI lab, the lab signs a cloud contract, and the cloud provider spends the money on the chipmaker's GPUs. Loops like these can be smart vendor financing, or they can inflate demand that only looks independent. These are the loops we found in our deal graph:`,
        html: `<div class="list">${net.cycles
          .slice(0, 8)
          .map((c) => `<div class="row"><span class="ico" style="--c:#ff5fa2">↻</span><span class="main"><span class="t" style="white-space:normal">${[...c, c[0]].map((id) => `<a href="#" data-open="entity::${esc(id)}">${esc(entity(id)?.name || id)}</a>`).join(' <span class="dim">→</span> ')}</span></span><span class="r"></span></div>`)
          .join('')}</div>`,
        foot: 'A loop is a chain of deals (investment, purchase or contract) that returns to the company where it started, within four steps. Details are in the web-of-money graph on the Money page.',
      });
  }

  // 6 — miners to AI landlords
  {
    const crypto = sites.filter((c) => c.type === 'crypto');
    const minerDeals = S.deals.filter((d) => [d.target?.entityId, ...d.investors.map((i) => i.entityId)].some((id) => entity(id)?.kind === 'crypto-miner'));
    if (crypto.length >= 3)
      add({
        id: 'miners',
        title: 'Bitcoin miners became AI landlords',
        big: fmtMW(sum(crypto, (c) => c.powerMW || 0)),
        color: '#b6f35c',
        text: `The scarcest thing in AI isn't chips, it's powered land. Bitcoin miners spent a decade collecting exactly that: grid connections, substations and cheap rural power. Now <b>${crypto.length}</b> converted sites we track add up to <b>${fmtMW(sum(crypto, (c) => c.powerMW || 0))}</b>, often leased to hyperscalers with Google or Microsoft standing behind the rent.${minerDeals.length ? ` Deals involving former miners total <b>${fmtUSD(sum(minerDeals, (d) => d.amountUSD || 0))}</b>.` : ''}`,
        html: `<div class="list">${crypto
          .sort((a, b) => (b.powerMW || 0) - (a.powerMW || 0))
          .slice(0, 8)
          .map((c) => `<button class="row" data-open="campus::${esc(c.id)}"><span class="ico" style="--c:#b6f35c">₿</span><span class="main"><span class="t">${esc(c.name)}</span><span class="s">${esc(c.tenants.map((t) => t.name).join(', ') || c.owners.map((o) => o.name).join(', '))}</span></span><span class="r">${fmtMW(c.powerMW)}</span></button>`)
          .join('')}</div>`,
      });
  }

  // 7 — SPV / private credit
  {
    const debt = S.deals.filter((d) => ['debt', 'project-finance', 'spv'].includes(d.kind) && d.amountUSD && d.status !== 'cancelled');
    if (debt.length >= 4) {
      const byYear = new Map();
      debt.forEach((d) => {
        const y = yearOf(d.date);
        if (y) byYear.set(y, (byYear.get(y) || 0) + d.amountUSD);
      });
      const top = [...debt].sort((a, b) => b.amountUSD - a.amountUSD).slice(0, 3);
      add({
        id: 'spv',
        title: 'The SPV era: building with borrowed money',
        big: fmtUSD(sum(debt.filter((d) => yearOf(d.date) >= 2024), (d) => d.amountUSD)),
        color: '#3ddc97',
        text: `Hyperscalers used to pay for data centers out of cash flow. Now the biggest builds are financed off-balance-sheet: a special-purpose vehicle owned mostly by private credit borrows against a long lease from the tech company. Since 2024 we've tracked <b>${fmtUSD(sum(debt.filter((d) => yearOf(d.date) >= 2024), (d) => d.amountUSD))}</b> in debt, project finance and SPV deals. The biggest: ${top.map((d) => `<a href="#" data-open="deal::${esc(d.id)}">${esc(d.title)}</a> (${fmtUSD(d.amountUSD)})`).join('; ')}.`,
        chart: (el) => columnsChart(el, [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x: String(x), y })), { color: '#3ddc97', label: 'Debt and SPV financing by year' }),
      });
    }
  }

  // 8 — capex supercycle
  {
    const hyper = ['microsoft', 'google', 'amazon', 'meta', 'oracle'];
    const colors = { microsoft: '#4d8dff', google: '#3ddc97', amazon: '#ffb02e', meta: '#38e1ff', oracle: '#ff5a5a' };
    const years = [...new Set(S.capex.filter((c) => hyper.includes(c.entityId)).map((c) => c.year))].sort().filter((y) => y >= 2019);
    const data = years.map((y) => {
      const row = { x: String(y) };
      hyper.forEach((id) => (row[id] = pickCapex(id, y)?.capexUSD || 0));
      row.total = hyper.reduce((t, id) => t + row[id], 0);
      return row;
    });
    if (data.length >= 3) {
      const first = data[0];
      const last = data[data.length - 1];
      add({
        id: 'capex',
        title: 'The capex supercycle',
        big: `${(last.total / first.total).toFixed(1)}×`,
        color: '#4d8dff',
        text: `Together the five biggest US cloud builders spent <b>${fmtUSD(first.total)}</b> on capital expenditure in ${first.x}. For ${last.x} the figure is <b>${fmtUSD(last.total)}</b>${+last.x > new Date().getFullYear() - 1 ? ' (including guidance)' : ''}. Most of it goes to servers, GPUs and the buildings that hold them.`,
        chart: (el) => columnsChart(el, data, { stacks: hyper.map((id) => ({ key: id, color: colors[id], label: entity(id)?.name || id })), label: 'Hyperscaler capex by year' }),
        foot: `${hyper.map((id) => `<span style="color:${colors[id]}">■</span> ${esc(entity(id)?.name || id)}`).join(' &nbsp; ')}. The latest years include company guidance, and fiscal years differ.`,
      });
    }
  }

  // 9 — concentration
  {
    const cc = new Map();
    S.facilities.forEach((f) => f.cc && cc.set(f.cc, (cc.get(f.cc) || 0) + 1));
    const sorted = [...cc.entries()].sort((a, b) => b[1] - a[1]);
    const top3 = sum(sorted.slice(0, 3), (x) => x[1]);
    const total = sum(sorted, (x) => x[1]);
    add({
      id: 'conc',
      title: 'A few countries hold most of the internet',
      big: fmtPct((top3 / total) * 100),
      color: '#38e1ff',
      text: `Of the <b>${fmtNum(total)}</b> facilities in the open registries, <b>${fmtPct((top3 / total) * 100)}</b> sit in just three countries: ${sorted
        .slice(0, 3)
        .map(([c]) => `${flag(c)} ${countryName(c)}`)
        .join(', ')}. The registries over-represent places with strong peering communities, but the shape holds in every census: a handful of metros (Ashburn, London, Frankfurt, Amsterdam, Tokyo, Singapore) carry a huge share of the world's traffic.`,
      html: bars(sorted.slice(0, 12).map(([c, n]) => ({ name: `${flag(c)} ${countryName(c)}`, value: n })), { fmt: fmtNum }),
    });
  }

  // 10 — who's the landlord
  {
    const bigOnes = sites.filter((c) => (c.powerMW || 0) >= 300 && !isDead(c));
    const mix = new Map();
    bigOnes.forEach((c) => {
      const kinds = new Set(c.owners.map((o) => entity(o.entityId)?.kind).filter(Boolean));
      if (!kinds.size) kinds.add('undisclosed');
      kinds.forEach((k) => mix.set(k, (mix.get(k) || 0) + 1));
    });
    if (bigOnes.length >= 6)
      add({
        id: 'landlord',
        title: 'Who’s the landlord?',
        big: `${bigOnes.length} campuses ≥300 MW`,
        color: '#a98bff',
        text: `Who owns the biggest campuses? Often it isn't the company that uses them. Private equity, infrastructure funds, developers and neoclouds own a large share of the 300 MW-plus sites and lease them to hyperscalers and AI labs on 15–20 year contracts. Here is the ownership mix of the ones we track (a campus with mixed owners counts once for each type):`,
        html: bars([...mix.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ name: k === 'undisclosed' ? 'Undisclosed' : kindInfo(k).label, value: n, color: k === 'undisclosed' ? '#5d6b85' : kindInfo(k).color })), { fmt: fmtNum, ranked: false }),
      });
  }

  // 11 — scrapped
  {
    const dead = S.campuses.filter(isDead);
    if (dead.length >= 3) {
      const cats = [
        ['Power & grid', /grid|power|electric|utility|interconnect|transmission|energy cost/i],
        ['Local opposition & permits', /zoning|opposit|resident|court|permit|council|referendum|lawsuit|commission|vote/i],
        ['Water', /water|drought|aquifer/i],
        ['Financing', /financ|funding|capital|debt|investor|bankrupt/i],
        ['Demand / strategy shift', /demand|lease|walk|pull|strategy|priorit|capacity|slow|reallocat|reassess/i],
        ['Policy & moratoria', /moratorium|government|regulat|ban|policy|tax/i],
      ];
      const tally = new Map();
      dead.forEach((c) => {
        const text = `${c.reason || ''} ${c.controversy || ''}`;
        const hits = cats.filter(([, re]) => re.test(text)).map(([n]) => n);
        (hits.length ? hits : ['Other / undisclosed']).forEach((h) => tally.set(h, (tally.get(h) || 0) + 1));
      });
      add({
        id: 'dead',
        title: 'Scrapped, stalled and blocked',
        big: `${dead.length} projects`,
        color: '#ff5a5a',
        text: `Not everything gets built. We track <b>${dead.length}</b> projects that were cancelled, paused, blocked or scaled back${sum(dead, (c) => c.powerMW || 0) ? `, about <b>${fmtMW(sum(dead, (c) => c.powerMW || 0))}</b> of capacity` : ''}${sum(dead, (c) => c.lostInvestmentUSD ?? c.investmentUSD ?? 0) ? ` and <b>${fmtUSD(sum(dead, (c) => c.lostInvestmentUSD ?? c.investmentUSD ?? 0))}</b> of planned investment` : ''}.${S.events?.length ? ` Another <b>${S.events.length}</b> events, such as tenants walking away from leases, a collapsed merger and redesigns forced by water protests, show the build-out isn't a straight line.` : ''}${(S.aggregates || []).filter((a) => a.unit === 'USD' && a.value).slice(0, 1).map((a) => ` One industry tally puts the total at <b>${fmtUSD(a.value)}</b>: ${esc(a.label.charAt(0).toLowerCase() + a.label.slice(1))}.`).join('')} The most common reasons are grid connections, local opposition and tenants changing their plans.`,
        html: bars([...tally.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v, color: '#ff5a5a' })), { fmt: fmtNum, ranked: false }) + `<div class="list" style="margin-top:14px">${dead.slice(0, 5).map((c) => `<button class="row" data-open="campus::${esc(c.id)}"><span class="ico" style="--c:#ff5a5a">✕</span><span class="main"><span class="t">${esc(c.name)}</span><span class="s">${esc((c.reason || statusInfo(c.status).label).slice(0, 110))}</span></span><span class="r">${c.powerMW ? fmtMW(c.powerMW) : ''}</span></button>`).join('')}</div>`,
        foot: 'Reasons are classified from the researched explanation; one project can have several.',
      });
    }
  }

  // 12 — money wave
  {
    const dated = S.deals.filter((d) => d.amountUSD && d.status !== 'cancelled' && !isPledge(d) && /^\d{4}-\d{2}/.test(d.date || ''));
    if (dated.length >= 8) {
      const q = (d) => {
        const [y, m] = d.date.split('-').map(Number);
        return `${y} Q${Math.ceil(m / 3)}`;
      };
      const groups = { 'M&A & equity': ['acquisition', 'equity-raise', 'ipo', 'jv'], 'Debt & SPVs': ['debt', 'project-finance', 'spv'], Contracts: ['compute-contract', 'lease', 'power-deal'] };
      const gcol = { 'M&A & equity': '#a98bff', 'Debt & SPVs': '#3ddc97', Contracts: '#4d8dff' };
      const gOf = (k) => Object.keys(groups).find((g) => groups[g].includes(k)) || 'Contracts';
      const byQ = new Map();
      dated.forEach((d) => {
        const k = q(d);
        const row = byQ.get(k) || { x: k };
        row[gOf(d.kind)] = (row[gOf(d.kind)] || 0) + d.amountUSD;
        byQ.set(k, row);
      });
      const rows = [...byQ.values()].sort((a, b) => a.x.localeCompare(b.x)).filter((r) => +r.x.slice(0, 4) >= 2022);
      const now = new Date();
      const cut = (months) => new Date(now.getFullYear(), now.getMonth() - months, 1).toISOString().slice(0, 7);
      const last12 = sum(dated.filter((d) => d.date.slice(0, 7) >= cut(12)), (d) => d.amountUSD);
      const prev12 = sum(dated.filter((d) => d.date.slice(0, 7) >= cut(24) && d.date.slice(0, 7) < cut(12)), (d) => d.amountUSD);
      const share = (list, g) => sum(list.filter((d) => groups[g].includes(d.kind)), (d) => d.amountUSD) / Math.max(1, sum(list, (d) => d.amountUSD));
      const early = dated.filter((d) => +d.date.slice(0, 4) <= 2023);
      const recent = dated.filter((d) => +d.date.slice(0, 4) >= 2025);
      const maEarly = share(early, 'M&A & equity');
      const maRecent = share(recent, 'M&A & equity');
      add({
        id: 'wave',
        title: 'The money wave',
        big: fmtUSD(sum(dated.filter((d) => +d.date.slice(0, 4) >= 2024), (d) => d.amountUSD)),
        color: '#ffd166',
        text: `Since 2024 we've tracked <b>${fmtUSD(sum(dated.filter((d) => +d.date.slice(0, 4) >= 2024), (d) => d.amountUSD))}</b> of acquisitions, financings and contracts, with <b>${fmtUSD(last12)}</b> in the last 12 months${prev12 ? ` and <b>${fmtUSD(prev12)}</b> in the 12 months before` : ''}.${early.length >= 3 && recent.length >= 3 ? ` Up to 2023, M&A and equity made up <b>${fmtPct(maEarly * 100)}</b> of the money; since 2025 it's <b>${fmtPct(maRecent * 100)}</b>, with the rest in compute contracts and the debt raised against them.` : ''} Pledges are left out here.`,
        chart: (el) => columnsChart(el, rows, { stacks: Object.keys(groups).map((g) => ({ key: g, color: gcol[g], label: g })), label: 'Deal value by quarter' }),
        foot: Object.keys(gcol).map((g) => `<span style="color:${gcol[g]}">■</span> ${g}`).join(' &nbsp; '),
      });
    }
  }

  root.innerHTML = `
    ${head('Patterns', 'What the data says when you step back', 'Each of these stories is computed live from the atlas, so the numbers move as the data grows. Click any name to dig in.')}
    <div class="grid" style="gap:18px">${stories
      .map(
        (s, i) => `<article class="card story" id="story-${s.id}" style="--c:${s.color}">
          <div><div class="story-n">PATTERN ${String(i + 1).padStart(2, '0')}</div><h2>${esc(s.title)}</h2><div class="big">${s.big}</div><p>${s.text}</p></div>
          <div>${s.chart ? `<div class="chart" data-chart="${i}"></div>` : ''}${s.html || ''}${s.foot ? `<p class="note" style="margin-top:10px">${s.foot}</p>` : ''}</div>
        </article>`
      )
      .join('')}</div>
    ${stories.length < 4 ? '<p class="note">More patterns appear as the research data fills in.</p>' : ''}`;
  stories.forEach((s, i) => s.chart && s.chart(root.querySelector(`[data-chart="${i}"]`)));
}

// ======================================================================= ABOUT
function about(root) {
  const v = (arr) => `${arr.filter((x) => x.verified !== false).length} of ${arr.length}`;
  const sources = new Set();
  [...S.campuses, ...S.deals, ...S.entities].forEach((r) => (r.sources || []).forEach((s) => s.url && sources.add(s.url)));
  root.innerHTML = `
    ${head('About the data', 'How Compute Atlas is built', 'Open registries for the physical layer, hand research for the money layer, and a source link on every record.')}
    <div class="grid g4" style="margin-bottom:24px">
      ${[['Facilities', fmtNum(S.facilities.length), 'PeeringDB + OpenStreetMap'], ['Researched campuses', fmtNum(S.campuses.length), `${v(S.campuses)} re-verified this pass`], ['Players', fmtNum(S.entities.filter((e) => !e.stub).length), `${fmtNum(S.entities.filter((e) => e.stub).length)} more referenced`], ['Deals', fmtNum(S.deals.length), `${fmtNum(sources.size)} unique source links`]]
        .map(([k, n, s]) => `<div class="pulse-card"><div class="k">${k}</div><div class="v">${n}</div><div class="s">${s}</div></div>`)
        .join('')}
    </div>
    <div class="card prose">
      <h2 style="margin-top:0">Layers</h2>
      <ul>
        <li><b>Base facilities:</b> every data center with a public location, from the <a href="https://www.peeringdb.com/" target="_blank" rel="noopener">PeeringDB</a> facility registry (colocation and interconnection sites with networks present) and <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> features tagged <code>telecom=data_center</code> or <code>building=data_center</code>. Facilities within about 150 m of a PeeringDB site are de-duplicated. Operators are matched to known players by name.</li>
        <li><b>Campuses:</b> flagship sites and AI megaprojects, researched from company releases, SEC and regulator filings, government announcements, Reuters, Bloomberg, the FT, DatacenterDynamics, Data Center Frontier, Epoch AI and local reporting. Each has owners, tenants, capital stack, power, status and sources. Pins are marked <i>site</i>, <i>city</i> or <i>region</i> level.</li>
        <li><b>Players and deals:</b> ownership chains, HQ locations, capex, funding, and every deal that moves money into compute. Where a deal has several investors and the split isn't disclosed, the amount is divided evenly between them for the flow arcs. Deal totals mix acquisitions, debt, multi-year contracts and pledges, so read them as scale, not cash.</li>
        <li><b>Countries:</b> <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> boundaries (public domain).</li>
      </ul>
      <h2>Verification</h2>
      <p>Research ran on ${esc(S.generated)}. A record marked <b>“not yet re-verified”</b> comes from reporting up to mid-2026 and wasn't re-checked against a live source in this pass, because the session's web-search budget ran out. Those records link to publisher homepages instead of articles. Treat their numbers as provisional. Status: ${v(S.campuses)} campuses, ${v(S.deals)} deals and ${v(S.entities.filter((e) => !e.stub))} player profiles are verified.</p>
      <h2>Privacy</h2>
      <p>Address search sends only the text you type to <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon</a> (falling back to Nominatim), both OpenStreetMap-based geocoders. “Use my location” asks your browser and never leaves your device: the nearest-facility math runs locally.</p>
      <h2>Not advice</h2>
      <p>Compute Atlas is an information project. Nothing here is investment, legal or financial advice. Amounts are as reported. Currency conversions use the rate on the announcement date.</p>
      <h2>Attribution</h2>
      <ul>${(S.facilityAttribution || []).map((a) => `<li>${esc(a)}</li>`).join('')}<li>Country boundaries: Natural Earth (public domain)</li><li>Globe rendering: globe.gl / three.js; charts: d3</li></ul>
      <h2>Rebuild the data</h2>
      <p><code>node scripts/fetch-base-layer.mjs</code> → <code>node scripts/fetch-countries.mjs</code> → <code>node scripts/build-data.mjs</code>. Research files live in <code>research/</code>, and the build writes a QA report to <code>research/QA.md</code>.</p>
    </div>`;
}
