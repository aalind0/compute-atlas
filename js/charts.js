// Small d3 chart toolkit, styled for the dark atlas.
/* global d3 */
import { $, esc, fmtUSD, fmtMW, hexA } from './util.js';

const tip = $('#tooltip');
export function showTip(evt, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14;
  const r = tip.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
export const hideTip = () => (tip.hidden = true);

// ---------- HTML bar list ----------
export function bars(rows, { fmt = (v) => v, max, color = 'var(--cyan)', ranked = true } = {}) {
  const m = max ?? Math.max(1e-9, ...rows.map((r) => r.value || 0));
  return `<div class="bars">${rows
    .map((r, i) => {
      const tag = r.open ? 'button' : 'div';
      return `<${tag} class="bar" ${r.open ? `data-open="${esc(r.open)}"` : ''} ${r.title ? `title="${esc(r.title)}"` : ''}><span class="bar-name">${ranked ? `<span class="rank">${i + 1}</span>` : ''}${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(0.6, ((r.value || 0) / m) * 100)}%;--c:${r.color || color}"></span></span><span class="bar-val">${r.label ?? fmt(r.value)}</span></${tag}>`;
    })
    .join('')}</div>`;
}

const width = (el) => Math.max(280, el.clientWidth || 600);
function svg(el, w, h) {
  el.innerHTML = '';
  return d3.select(el).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img');
}

// ---------- multi-line (capex) ----------
export function lineChart(el, series, { fmt = fmtUSD, height = 300, label = '' } = {}) {
  const w = width(el);
  const m = { t: 16, r: 92, b: 28, l: 56 };
  const s = svg(el, w, height).attr('aria-label', label);
  const all = series.flatMap((x) => x.points);
  const x = d3.scaleLinear().domain(d3.extent(all, (p) => p.x)).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain([0, d3.max(all, (p) => p.y) * 1.08]).nice().range([height - m.b, m.t]);
  s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat('')).call((g) => g.select('.domain').remove());
  s.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(Math.min(8, all.length)).tickFormat(d3.format('d')));
  s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => fmt(v))).call((g) => g.select('.domain').remove());
  const line = d3.line().x((p) => x(p.x)).y((p) => y(p.y)).curve(d3.curveMonotoneX);
  for (const ser of series) {
    const actual = ser.points.filter((p) => !p.guide);
    const lastActual = actual[actual.length - 1];
    const guide = ser.points.filter((p) => p.guide);
    s.append('path').attr('d', line(actual)).attr('fill', 'none').attr('stroke', ser.color).attr('stroke-width', 2.4).attr('stroke-linecap', 'round');
    if (guide.length && lastActual) s.append('path').attr('d', line([lastActual, ...guide])).attr('fill', 'none').attr('stroke', ser.color).attr('stroke-width', 2).attr('stroke-dasharray', '4 4').attr('opacity', 0.85);
    s.selectAll(null)
      .data(ser.points)
      .join('circle')
      .attr('cx', (p) => x(p.x))
      .attr('cy', (p) => y(p.y))
      .attr('r', 3.6)
      .attr('fill', (p) => (p.guide ? '#04060c' : ser.color))
      .attr('stroke', ser.color)
      .attr('stroke-width', 1.6)
      .on('mousemove', (e, p) => showTip(e, `<b>${esc(ser.name)} · ${p.x}${p.guide ? ' (guidance)' : ''}</b><div class="mono" style="color:var(--gold)">${fmt(p.y)}</div>${p.note ? `<div class="muted" style="font-size:12px">${esc(p.note)}</div>` : ''}`))
      .on('mouseleave', hideTip);
    const last = ser.points[ser.points.length - 1];
    s.append('text').attr('x', x(last.x) + 8).attr('y', y(last.y) + 4).text(ser.name).style('fill', ser.color).style('font-weight', 600);
  }
}

// ---------- scatter (gigawatt race) ----------
export function scatterChart(el, pts, { height = 340, onClick, label = '' } = {}) {
  const w = width(el);
  const m = { t: 14, r: 18, b: 30, l: 58 };
  const s = svg(el, w, height).attr('aria-label', label);
  const x = d3.scaleLinear().domain([d3.min(pts, (p) => p.x) - 0.6, d3.max(pts, (p) => p.x) + 0.6]).range([m.l, w - m.r]);
  const y = d3.scaleLog().domain([Math.max(5, d3.min(pts, (p) => p.y) * 0.8), d3.max(pts, (p) => p.y) * 1.3]).range([height - m.b, m.t]);
  const r = d3.scaleSqrt().domain([0, d3.max(pts, (p) => p.r || 0) || 1]).range([3, 20]);
  s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5, '~s').tickSize(-(w - m.l - m.r)).tickFormat('')).call((g) => g.select('.domain').remove());
  s.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
  s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => ([10, 100, 1000, 10000].includes(v) || [30, 300, 3000].includes(v) ? fmtMW(v) : ''))).call((g) => g.select('.domain').remove());
  [1000, 5000].forEach((v) => {
    if (v > y.domain()[1]) return;
    s.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', hexA('#ffb02e', 0.35)).attr('stroke-dasharray', '3 5');
    s.append('text').attr('x', w - m.r).attr('y', y(v) - 5).attr('text-anchor', 'end').text(v === 1000 ? '1 GW' : '5 GW').style('fill', '#ffb02e');
  });
  s.selectAll(null)
    .data(pts.sort((a, b) => (b.r || 0) - (a.r || 0)))
    .join('circle')
    .attr('cx', (p) => x(p.x) + (p.jx || 0))
    .attr('cy', (p) => y(p.y))
    .attr('r', (p) => r(p.r || 0))
    .attr('fill', (p) => hexA(p.color, 0.45))
    .attr('stroke', (p) => p.color)
    .attr('stroke-width', 1.2)
    .style('cursor', onClick ? 'pointer' : 'default')
    .on('mousemove', (e, p) => showTip(e, p.tip))
    .on('mouseleave', hideTip)
    .on('click', (e, p) => onClick?.(p));
}

// ---------- vertical columns ----------
export function columnsChart(el, data, { height = 240, fmt = fmtUSD, color = '#ffd166', label = '', stacks } = {}) {
  const w = width(el);
  const m = { t: 14, r: 10, b: 30, l: 56 };
  const s = svg(el, w, height).attr('aria-label', label);
  const x = d3.scaleBand().domain(data.map((d) => d.x)).range([m.l, w - m.r]).padding(0.28);
  const total = (d) => (stacks ? stacks.reduce((t, k) => t + (d[k.key] || 0), 0) : d.y);
  const y = d3.scaleLinear().domain([0, d3.max(data, total) * 1.1 || 1]).nice().range([height - m.b, m.t]);
  s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.l - m.r)).tickFormat('')).call((g) => g.select('.domain').remove());
  const every = Math.ceil(data.length / Math.max(4, Math.floor(w / 60)));
  s.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).tickValues(data.map((d) => d.x).filter((_, i) => i % every === 0)));
  s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => fmt(v))).call((g) => g.select('.domain').remove());
  const layers = stacks || [{ key: 'y', color, label: '' }];
  data.forEach((d) => {
    let acc = 0;
    layers.forEach((k) => {
      const v = d[k.key] || 0;
      if (!v) return;
      s.append('rect')
        .attr('x', x(d.x))
        .attr('width', x.bandwidth())
        .attr('y', y(acc + v))
        .attr('height', Math.max(0.5, y(acc) - y(acc + v)))
        .attr('rx', 2)
        .attr('fill', k.color)
        .on('mousemove', (e) => showTip(e, `<b>${esc(d.x)}${k.label ? ' · ' + esc(k.label) : ''}</b><div class="mono" style="color:var(--gold)">${fmt(v)}</div>${d.tip ? `<div class="muted" style="font-size:12px">${d.tip}</div>` : ''}`))
        .on('mouseleave', hideTip);
      acc += v;
    });
  });
}

// ---------- sankey ----------
export function sankeyChart(el, graph, { height = 520, fmt = fmtUSD, onClick, label = '' } = {}) {
  const w = width(el);
  const s = svg(el, w, height).attr('aria-label', label);
  if (!graph.links.length) {
    s.append('text').attr('x', 10).attr('y', 30).text('Not enough linked deal data yet.');
    return;
  }
  const sk = d3.sankey().nodeId((d) => d.id).nodeWidth(12).nodePadding(9).nodeAlign(d3.sankeyJustify).extent([[1, 6], [w - 1, height - 6]]);
  const { nodes, links } = sk({ nodes: graph.nodes.map((d) => ({ ...d })), links: graph.links.map((d) => ({ ...d })) });
  s.append('g')
    .attr('fill', 'none')
    .selectAll('path')
    .data(links)
    .join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (d) => hexA(d.source.color || '#38e1ff', 0.32))
    .attr('stroke-width', (d) => Math.max(1, d.width))
    .on('mousemove', function (e, d) {
      d3.select(this).attr('stroke', hexA(d.source.color || '#38e1ff', 0.7));
      showTip(e, `<b>${esc(d.source.name)} → ${esc(d.target.name)}</b><div class="mono" style="color:var(--gold)">${fmt(d.value)}</div>`);
    })
    .on('mouseleave', function (e, d) {
      d3.select(this).attr('stroke', hexA(d.source.color || '#38e1ff', 0.32));
      hideTip();
    });
  const node = s.append('g').selectAll('g').data(nodes).join('g');
  node
    .append('rect')
    .attr('x', (d) => d.x0)
    .attr('y', (d) => d.y0)
    .attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0))
    .attr('rx', 2)
    .attr('fill', (d) => d.color || '#38e1ff')
    .style('cursor', (d) => (d.open && onClick ? 'pointer' : 'default'))
    .on('click', (e, d) => d.open && onClick?.(d))
    .on('mousemove', (e, d) => showTip(e, `<b>${esc(d.name)}</b><div class="mono" style="color:var(--gold)">${fmt(d.value)}</div>`))
    .on('mouseleave', hideTip);
  node
    .append('text')
    .attr('x', (d) => (d.x0 < w / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('dy', '0.35em')
    .attr('text-anchor', (d) => (d.x0 < w / 2 ? 'start' : 'end'))
    .text((d) => (d.y1 - d.y0 > 7 ? d.name : ''))
    .style('fill', '#d6e0ef')
    .style('font-size', '11px')
    .style('pointer-events', 'none');
}

// ---------- force network ----------
export function networkChart(el, graph, { height = 560, onClick, label = '' } = {}) {
  const w = width(el);
  const s = svg(el, w, height).attr('aria-label', label);
  const nodes = graph.nodes.map((d) => ({ ...d }));
  const links = graph.links.map((d) => ({ ...d }));
  const r = d3.scaleSqrt().domain([0, d3.max(nodes, (d) => d.value) || 1]).range([4, 26]);
  const lw = d3.scaleSqrt().domain([0, d3.max(links, (d) => d.value) || 1]).range([0.6, 6]);
  const sim = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance((l) => 60 + (l.value ? 0 : 20)).strength(0.35))
    .force('charge', d3.forceManyBody().strength(-170))
    .force('center', d3.forceCenter(w / 2, height / 2))
    .force('collide', d3.forceCollide().radius((d) => r(d.value) + 3))
    .force('x', d3.forceX(w / 2).strength(0.04))
    .force('y', d3.forceY(height / 2).strength(0.06));
  const defs = s.append('defs');
  defs.append('marker').attr('id', 'arrow').attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(255,209,102,0.6)');
  const link = s
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', (d) => (d.cycle ? 'rgba(255,95,162,0.85)' : 'rgba(255,209,102,0.28)'))
    .attr('stroke-width', (d) => lw(d.value || 0))
    .attr('marker-end', 'url(#arrow)')
    .on('mousemove', (e, d) => showTip(e, `<b>${esc(d.source.name)} → ${esc(d.target.name)}</b><div class="muted" style="font-size:12px">${esc(d.label || '')}</div>${d.value ? `<div class="mono" style="color:var(--gold)">${fmtUSD(d.value)}</div>` : ''}`))
    .on('mouseleave', hideTip);
  const node = s
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .style('cursor', 'pointer')
    .call(
      d3
        .drag()
        .on('start', (e, d) => {
          if (!e.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    )
    .on('click', (e, d) => onClick?.(d))
    .on('mousemove', (e, d) => showTip(e, `<b>${esc(d.name)}</b><div class="muted" style="font-size:12px">${esc(d.sub || '')}</div>${d.value ? `<div class="mono" style="color:var(--gold)">${fmtUSD(d.value)} in tracked deals</div>` : ''}`))
    .on('mouseleave', hideTip);
  node.append('circle').attr('r', (d) => r(d.value)).attr('fill', (d) => hexA(d.color, 0.3)).attr('stroke', (d) => d.color).attr('stroke-width', 1.5);
  node
    .append('text')
    .attr('dy', (d) => r(d.value) + 12)
    .attr('text-anchor', 'middle')
    .text((d) => (r(d.value) > 8 ? d.name : ''))
    .style('fill', '#c7d3e6')
    .style('font-size', '10.5px')
    .style('pointer-events', 'none');
  sim.on('tick', () => {
    nodes.forEach((d) => {
      d.x = Math.max(20, Math.min(w - 20, d.x));
      d.y = Math.max(20, Math.min(height - 20, d.y));
    });
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, L = Math.hypot(dx, dy) || 1;
        return d.target.x - (dx / L) * (r(d.target.value) + 2);
      })
      .attr('y2', (d) => {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, L = Math.hypot(dx, dy) || 1;
        return d.target.y - (dy / L) * (r(d.target.value) + 2);
      });
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
  return () => sim.stop();
}

// ---------- deal timeline (beeswarm) ----------
export function timelineChart(el, deals, { height = 300, onClick, colorOf, label = '' } = {}) {
  const w = width(el);
  const m = { t: 16, r: 16, b: 28, l: 16 };
  const s = svg(el, w, height).attr('aria-label', label);
  const parse = (d) => {
    const [y, mo = '06', da = '15'] = String(d.date).split('-');
    return new Date(+y, +mo - 1, +da);
  };
  const data = deals.filter((d) => d.amountUSD && d.date).map((d) => ({ d, t: parse(d) }));
  if (!data.length) return;
  const x = d3.scaleTime().domain(d3.extent(data, (p) => p.t)).nice().range([m.l, w - m.r]);
  const r = d3.scaleSqrt().domain([0, d3.max(data, (p) => p.d.amountUSD)]).range([2.5, 30]);
  s.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - m.b})`).call(d3.axisBottom(x).ticks(Math.floor(w / 90)));
  const sim = d3
    .forceSimulation(data)
    .force('x', d3.forceX((p) => x(p.t)).strength(1))
    .force('y', d3.forceY((height - m.b) / 2).strength(0.06))
    .force('collide', d3.forceCollide((p) => r(p.d.amountUSD) + 1))
    .stop();
  for (let i = 0; i < 220; i++) sim.tick();
  s.selectAll(null)
    .data(data)
    .join('circle')
    .attr('cx', (p) => p.x)
    .attr('cy', (p) => Math.max(m.t, Math.min(height - m.b - 4, p.y)))
    .attr('r', (p) => r(p.d.amountUSD))
    .attr('fill', (p) => hexA(colorOf(p.d), 0.4))
    .attr('stroke', (p) => colorOf(p.d))
    .style('cursor', 'pointer')
    .on('mousemove', (e, p) => showTip(e, `<b>${esc(p.d.title)}</b><div class="muted" style="font-size:12px">${esc(p.d.date)} · ${esc(p.d.status)}</div><div class="mono" style="color:var(--gold)">${fmtUSD(p.d.amountUSD)}</div>`))
    .on('mouseleave', hideTip)
    .on('click', (e, p) => onClick?.(p.d));
}

// ---------- dot strips with medians (follow the power) ----------
export function stripChart(el, groups, { height, fmt = (v) => v, label = '', xLabel = '' } = {}) {
  const w = width(el);
  const rowH = 64;
  const h = height || groups.length * rowH + 40;
  const m = { t: 10, r: 20, b: 30, l: 150 };
  const s = svg(el, w, h).attr('aria-label', label);
  const all = groups.flatMap((g) => g.values.map((v) => v.v));
  const x = d3.scaleLog().domain([Math.max(0.5, d3.min(all) * 0.8), d3.max(all) * 1.2]).range([m.l, w - m.r]).clamp(true);
  s.append('g').attr('class', 'axis').attr('transform', `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(6, '~s').tickFormat((v) => fmt(v)));
  if (xLabel) s.append('text').attr('x', w - m.r).attr('y', h - 4).attr('text-anchor', 'end').text(xLabel);
  groups.forEach((g, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    s.append('text').attr('x', 0).attr('y', cy + 4).text(g.name).style('fill', g.color).style('font-weight', 600);
    s.append('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', cy).attr('y2', cy).attr('stroke', 'rgba(130,190,255,0.08)');
    s.selectAll(null)
      .data(g.values)
      .join('circle')
      .attr('cx', (v) => x(Math.max(0.5, v.v)))
      .attr('cy', () => cy + (Math.random() - 0.5) * 30)
      .attr('r', 4)
      .attr('fill', hexA(g.color, 0.45))
      .attr('stroke', g.color)
      .on('mousemove', (e, v) => showTip(e, v.tip))
      .on('mouseleave', hideTip);
    if (g.median != null) {
      s.append('line').attr('x1', x(g.median)).attr('x2', x(g.median)).attr('y1', cy - 24).attr('y2', cy + 24).attr('stroke', '#fff').attr('stroke-width', 2);
      s.append('text').attr('x', x(g.median) + 5).attr('y', cy - 16).text(`median ${fmt(g.median)}`).style('fill', '#fff');
    }
  });
}
