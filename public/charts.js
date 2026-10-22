// Small dependency-free SVG charts: line (time series), bars, and a 100% stacked bar.
// Every chart gets a hover tooltip; colors come from CSS custom properties.

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 };

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function setupFrame(container, height) {
  container.innerHTML = '';
  container.classList.add('chart');
  const width = Math.max(container.clientWidth, 280);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' }, container);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.appendChild(tip);
  return { svg, tip, width, height, iw: width - MARGIN.left - MARGIN.right, ih: height - MARGIN.top - MARGIN.bottom };
}

function showTip(tip, container, x, y, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const cw = container.clientWidth;
  const tw = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(x - tw / 2, 0), cw - tw)}px`;
  tip.style.top = `${Math.max(y - tip.offsetHeight - 10, 0)}px`;
}

function yAxis(svg, ticks, scaleY, iw, fmt) {
  const g = el('g', { class: 'axis' }, svg);
  for (const t of ticks) {
    const y = MARGIN.top + scaleY(t);
    el('line', { x1: MARGIN.left, x2: MARGIN.left + iw, y1: y, y2: y, class: t === ticks[0] ? 'baseline' : 'grid' }, g);
    const label = el('text', { x: MARGIN.left - 6, y: y + 4, 'text-anchor': 'end' }, g);
    label.textContent = fmt(t);
  }
}

function emptyState(container, msg = 'No data for this period') {
  container.innerHTML = `<p class="empty">${msg}</p>`;
}

/**
 * Time-series line with crosshair tooltip.
 * points: [{ x: Date, y: number|null }]
 */
export function lineChart(container, { points, height = 200, color = 'var(--series-1)', yFormat = String, xFormat, label = '', yMin }) {
  const pts = points.filter((p) => p.y != null && Number.isFinite(p.y));
  if (pts.length < 2) return emptyState(container);
  const { svg, tip, iw, ih } = setupFrame(container, height);
  svg.setAttribute('aria-label', label);

  const xs = pts.map((p) => +p.x);
  const ys = pts.map((p) => p.y);
  const ticks = niceTicks(yMin ?? Math.min(...ys), Math.max(...ys));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [t0, t1] = [ticks[0], ticks[ticks.length - 1]];
  const sx = (x) => ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y) => ih - ((y - t0) / (t1 - t0 || 1)) * ih;

  yAxis(svg, ticks, sy, iw, yFormat);

  // X labels: first, middle, last.
  const xf = xFormat || ((d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const xg = el('g', { class: 'axis' }, svg);
  [0, 0.5, 1].forEach((f, i) => {
    const t = x0 + (x1 - x0) * f;
    const text = el('text', { x: MARGIN.left + sx(t), y: MARGIN.top + ih + 18, 'text-anchor': ['start', 'middle', 'end'][i] }, xg);
    text.textContent = xf(new Date(t));
  });

  // Break the line where samples are missing for a long stretch.
  const gapMs = (x1 - x0) / pts.length * 6;
  let d = '';
  pts.forEach((p, i) => {
    const cmd = i === 0 || +p.x - +pts[i - 1].x > gapMs ? 'M' : 'L';
    d += `${cmd}${(MARGIN.left + sx(+p.x)).toFixed(1)},${(MARGIN.top + sy(p.y)).toFixed(1)}`;
  });
  el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);

  const cross = el('line', { y1: MARGIN.top, y2: MARGIN.top + ih, class: 'crosshair', visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 4, fill: color, class: 'dot', visibility: 'hidden' }, svg);
  const hit = el('rect', { x: MARGIN.left, y: MARGIN.top, width: iw, height: ih, fill: 'transparent' }, svg);

  const move = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left - MARGIN.left;
    const target = x0 + (px / iw) * (x1 - x0);
    let best = pts[0];
    for (const p of pts) if (Math.abs(+p.x - target) < Math.abs(+best.x - target)) best = p;
    const cx = MARGIN.left + sx(+best.x);
    const cy = MARGIN.top + sy(best.y);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
    showTip(tip, container, cx, cy, `<strong>${yFormat(best.y)}</strong><span>${xf(new Date(+best.x))}</span>`);
  };
  const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', leave);
}

/**
 * Vertical bars, one per item, with an optional dashed goal line.
 * data: [{ label: string, value: number, tip?: string }]
 */
export function barChart(container, { data, height = 200, color = 'var(--series-1)', yFormat = String, goal, label = '' }) {
  const rows = data.filter((d) => d.value != null && Number.isFinite(d.value));
  if (!rows.length) return emptyState(container);
  const { svg, tip, iw, ih } = setupFrame(container, height);
  svg.setAttribute('aria-label', label);

  const ticks = niceTicks(0, Math.max(...rows.map((d) => d.value), goal || 0));
  const top = ticks[ticks.length - 1];
  const sy = (y) => ih - (y / (top || 1)) * ih;
  yAxis(svg, ticks, sy, iw, yFormat);

  const band = iw / data.length;
  const gap = Math.min(2, band * 0.2);
  const bw = Math.max(band - gap, 1);
  const labelEvery = Math.ceil(data.length / Math.max(Math.floor(iw / 48), 1));

  data.forEach((d, i) => {
    const x = MARGIN.left + i * band + gap / 2;
    if (i % labelEvery === 0) {
      const t = el('text', { x: x + bw / 2, y: MARGIN.top + ih + 18, 'text-anchor': 'middle', class: 'axis' }, svg);
      t.textContent = d.label;
    }
    if (d.value == null) return;
    const h = ih - sy(d.value);
    const y = MARGIN.top + sy(d.value);
    const r = Math.min(4, bw / 2, h);
    // Rounded top, square base.
    const path = `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`;
    const bar = el('path', { d: path, fill: color, class: 'bar' }, svg);
    const hit = el('rect', { x: MARGIN.left + i * band, y: MARGIN.top, width: band, height: ih, fill: 'transparent' }, svg);
    hit.addEventListener('pointerenter', () => {
      bar.classList.add('active');
      showTip(tip, container, x + bw / 2, y, d.tip || `<strong>${yFormat(d.value)}</strong><span>${d.label}</span>`);
    });
    hit.addEventListener('pointerleave', () => { bar.classList.remove('active'); tip.hidden = true; });
  });

  if (goal) {
    const gy = MARGIN.top + sy(goal);
    el('line', { x1: MARGIN.left, x2: MARGIN.left + iw, y1: gy, y2: gy, class: 'goal' }, svg);
    const t = el('text', { x: MARGIN.left + iw, y: gy - 4, 'text-anchor': 'end', class: 'axis goal-label' }, svg);
    t.textContent = `Goal ${yFormat(goal)}`;
  }
}

/**
 * One horizontal 100% stacked bar with a legend underneath.
 * parts: [{ label, value, color }]
 */
export function stackedBar(container, { parts, format = String }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0);
  if (!total) return emptyState(container);
  container.innerHTML = '';
  container.classList.add('chart');
  const bar = document.createElement('div');
  bar.className = 'stack';
  const legend = document.createElement('ul');
  legend.className = 'legend';
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;

  for (const p of parts) {
    if (!p.value) continue;
    const pct = (p.value / total) * 100;
    const seg = document.createElement('div');
    seg.className = 'stack-seg';
    seg.style.flex = `${p.value} 1 0`;
    seg.style.background = p.color;
    seg.addEventListener('pointerenter', () => {
      showTip(tip, container, seg.offsetLeft + seg.offsetWidth / 2, seg.offsetTop, `<strong>${p.label}</strong><span>${format(p.value)} · ${pct.toFixed(0)}%</span>`);
    });
    seg.addEventListener('pointerleave', () => { tip.hidden = true; });
    bar.appendChild(seg);

    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${p.color}"></i>${p.label} <b>${format(p.value)}</b> <span>${pct.toFixed(0)}%</span>`;
    legend.appendChild(li);
  }
  container.append(bar, legend, tip);
}
