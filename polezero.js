'use strict';
/*
 * Section 1: drag a real pole (and optional real zero) and watch the Bode plot.
 * A purple test point s = jω on the imaginary axis follows the Bode cursor (and
 * can be dragged), with vectors from the pole and zero showing where |H| and ∠H
 * come from: the Bode plot is H(s) evaluated as s climbs the jω axis.
 */
(function () {
  const $ = id => document.getElementById('pz-' + id);
  const { eng, num } = Plot;
  const TWO_PI = 2 * Math.PI, DB3 = 10 * Math.log10(2), DEG = 180 / Math.PI;
  const C = { pole: '#dc2626', zero: '#059669', test: '#7c3aed', cut: '#c2410c', curve: '#0f766e' };
  // s-plane geometry in viewBox units; both axes share one scale so angles are true
  const MAP = { ox: 470, oy: 372, left: 34, top: 18, w: 520 };
  let hasZero = false, norm = true, base = 1, extent = 1, drag = null, model = null, wt = null, frame = 0;
  let last = null; // inputs of the most recent full render

  const texNum = v => {
    if (v === 0 || Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return String(Number(v.toPrecision(4)));
    const [m, e] = v.toExponential(3).split('e');
    return Number(m) + '\\times10^{' + Number(e) + '}';
  };
  const niceUp = v => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find(f => f * p >= v) * p; };
  const scale = () => (MAP.ox - MAP.left) / extent;          // px per rad/s
  // Highest jω that fits comfortably, as a fraction of the real-axis extent
  const FIT = 0.9 * (MAP.oy - MAP.top) / (MAP.ox - MAP.left);
  const X = v => MAP.ox - v * scale();                         // real-axis position of s = −v
  const Y = w => MAP.oy - w * scale();                         // imaginary-axis position of s = jω

  const hover = w => {
    if (!model) return null;
    const r = Engine.response(model, w);
    return [
      `ω = ${eng(w, 'rad/s')}   (f = ${eng(w / TWO_PI, 'Hz')})`,
      { text: `|H| = ${num(r.mag)} V/V  (${num(20 * Math.log10(r.mag), 3)} dB)`, color: C.curve },
      { text: `|H/K₀| = ${num(20 * Math.log10(r.mag / last.k), 3)} dB`, color: C.curve },
      { text: `∠H = ${num(r.phase)}°`, color: C.curve },
    ];
  };
  // Moving along the Bode plot moves the test point (throttled to one update per frame)
  const onMove = w => {
    wt = w;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawTest(); });
  };
  const radTick = x => eng(x);
  const magPlot = new Plot($('mag'), { xLog: true, xLabel: 'ω (rad/s)', yLabel: '|H(jω)|  (dB)', hover, onMove, xTick: radTick });
  const phasePlot = new Plot($('phase'), { xLog: true, xLabel: 'ω (rad/s)', yLabel: '∠H(jω)  (°)', hover, onMove, xTick: radTick });

  function read() {
    const vals = { p: +$('p').value, z: +$('z').value, k: +$('k').value };
    let ok = true;
    for (const id of ['p', 'z', 'k']) {
      const bad = (id !== 'z' || hasZero) && !($(id).value !== '' && vals[id] > 0 && Number.isFinite(vals[id]));
      $(id).classList.toggle('bad', bad);
      if (bad) ok = false;
    }
    return ok ? vals : null;
  }

  function render(rescale = true) {
    $('zero-field').classList.toggle('off', !hasZero);
    $('z').disabled = !hasZero;
    document.querySelectorAll('#pz-preset button').forEach(b => b.classList.toggle('on', (b.dataset.preset === 'zero') === hasZero));
    const v = read();
    if (!v) { $('stats').innerHTML = '<div class="stat warn"><span>Enter positive numbers for the pole, zero and gain.</span></div>'; return; }
    const { p: wp, z: wz, k } = v;
    if (rescale || !drag) base = niceUp(1.25 * Math.max(wp, hasZero ? wz : 0));
    model = { n: hasZero ? [k, k / wz] : [k], d: [1, 1 / wp] };
    if (!(wt > 0)) wt = wp;

    const rad = '\\ \\text{rad/s}';
    katex.render(hasZero
      ? `H(s)=K_0\\,\\dfrac{1+s/\\omega_z}{1+s/\\omega_p}\\qquad K_0=${texNum(k)},\\quad \\omega_z=${texNum(wz)}${rad},\\quad \\omega_p=${texNum(wp)}${rad}`
      : `H(s)=\\dfrac{K_0}{1+s/\\omega_p}\\qquad K_0=${texNum(k)},\\quad \\omega_p=${texNum(wp)}${rad}`, $('eq'), { displayMode: true, throwOnError: false });

    // Plot range: fixed decades so moving the pole visibly shifts the curve
    const crit = [wp].concat(hasZero ? [wz] : []);
    const lo = Math.min(1, 10 ** (Math.floor(Math.log10(Math.min(...crit))) - 2));
    const hi = Math.max(1e7, 10 ** (Math.ceil(Math.log10(Math.max(...crit))) + 2));
    const ws = Array.from({ length: 700 }, (_, i) => lo * (hi / lo) ** (i / 699));
    const rs = ws.map(w => Engine.response(model, w));
    const k0db = 20 * Math.log10(k), off = norm ? k0db : 0; // normalised plots put K₀ at 0 dB
    const db = rs.map(r => 20 * Math.log10(r.mag) - off);
    const cut = Engine.cutoff(model, k);
    const w45 = Engine.phaseCrossing(model, -45, lo, hi);
    const cancelled = hasZero && Math.abs(wz - wp) <= 1e-9 * wp;

    let ymin = Math.min(k0db - off - 10, ...db), ymax = Math.max(k0db - off + 5, ...db);
    const step = ymax - ymin > 90 ? 20 : 10;
    ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    const vLines = [{ x: wp, color: C.pole, dash: [2, 4], label: 'ωp', bottom: true }];
    if (hasZero) vLines.push({ x: wz, color: C.zero, dash: [2, 4], label: 'ωz', bottom: true, row: 1 });
    last = {
      wp, wz, k, lo, hi, off,
      mag: { x: [lo, hi], y: [ymin, ymax], yStep: step, series: [{ x: ws, y: db, color: C.curve }],
        hLines: [{ y: k0db - off - DB3, color: C.cut, dash: [6, 4], label: norm ? '−3 dB' : `K₀ − 3 dB = ${num(k0db - DB3, 3)} dB` }],
        vLines: cut ? vLines.concat([{ x: cut, color: C.cut, dash: [6, 4], label: 'ω−3dB' }]) : vLines,
        points: cut ? [{ x: cut, y: k0db - off - DB3, color: C.cut }] : [] },
      phase: { x: [lo, hi], y: [-90, 90], yStep: 45, series: [{ x: ws, y: rs.map(r => r.phase), color: C.curve }],
        hLines: [{ y: -45, color: C.cut, dash: [6, 4], label: '−45°' }],
        vLines: w45 ? vLines.concat([{ x: w45, color: C.cut, dash: [6, 4], label: 'ω at −45°' }]) : vLines,
        points: w45 ? [{ x: w45, y: -45, color: C.cut }] : [] },
    };
    magPlot.o.yLabel = norm ? '|H/K₀|  (dB)' : '|H(jω)|  (dB)';
    document.querySelectorAll('#pz-norm button').forEach(b => b.classList.toggle('on', (b.dataset.norm === '1') === norm));
    drawTest();

    const stat = (label, value, cls = '') => `<div class="stat ${cls}"><b>${label}</b><span>${value}</span></div>`;
    $('stats').innerHTML =
      stat('−3 dB bandwidth ω−3dB', cut ? `${eng(cut, 'rad/s', 4)} (${eng(cut / TWO_PI, 'Hz', 4)})` : 'none: gain never drops 3 dB below K₀') +
      stat('Phase = −45° at', w45 ? `${eng(w45, 'rad/s', 4)} (${eng(w45 / TWO_PI, 'Hz', 4)})` : 'never reached') +
      stat('DC gain K₀', `${num(k)} V/V (${num(k0db, 3)} dB)`) +
      (hasZero ? stat('High-frequency gain', `${num(k * wp / wz)} V/V (${num(20 * Math.log10(k * wp / wz), 3)} dB)`) : '') +
      (cancelled ? stat('Pole–zero cancellation', 'Flat: |H| = K₀ and ∠H = 0° at every ω', 'note') : '');
  }

  // Redraws everything that depends on the test frequency wt: the s-plane and the Bode markers.
  function drawTest() {
    if (!last) return;
    const { wp, wz, k, lo, hi, off } = last;
    wt = Math.min(hi, Math.max(lo, wt));
    // Zoom the s-plane out (equal scales, so angles stay true) to keep jω on screen
    extent = Math.max(base, wt / FIT);
    const zoom = extent / base;
    const r = Engine.response(model, wt), db = 20 * Math.log10(r.mag);
    const marker = { x: wt, color: C.test, dash: [2, 3] };
    magPlot.set({ ...last.mag, vLines: last.mag.vLines.concat([marker]), points: last.mag.points.concat([{ x: wt, y: db - off, color: C.test }]) });
    phasePlot.set({ ...last.phase, vLines: last.phase.vLines.concat([marker]), points: last.phase.points.concat([{ x: wt, y: r.phase, color: C.test }]) });
    drawMap(wp, wz);

    // Geometry readout: lengths and angles of the vectors from each root to jω
    const lp = Math.hypot(wp, wt), tp = Math.atan2(wt, wp) * DEG;
    const lz = Math.hypot(wz, wt), tz = Math.atan2(wt, wz) * DEG;
    const head = `<b>●</b> s = j${eng(wt, 'rad/s', 4)} &nbsp;→&nbsp; |H(jω)| = ${num(r.mag)} V/V (${num(db, 3)} dB), &nbsp;∠H = ${num(r.phase)}°`;
    const geo = hasZero
      ? `|H| = K₀ (ωp/ωz) · <span class="z">${eng(lz, '', 4)}</span> / <span class="p">${eng(lp, '', 4)}</span> &nbsp;·&nbsp; ∠H = <span class="z">θz ${num(tz)}°</span> − <span class="p">θp ${num(tp)}°</span>`
      : `|H| = K₀ ωp / <span class="p">|jω − p₁|</span> = ${num(k)} × ${eng(wp, '', 4)} / <span class="p">${eng(lp, '', 4)}</span> &nbsp;·&nbsp; ∠H = −<span class="p">θp</span> = −${num(tp)}°`;
    const wLow = hasZero ? Math.min(wp, wz) : wp;
    let note = '';
    if (zoom > 2) note = `View zoomed out ×${num(zoom, 3)}. From this far up the axis ${hasZero ? 'the pole and zero both look' : 'the pole looks'} like ${hasZero ? 'they sit' : 'it sits'} at the origin: ` +
      (hasZero ? 'their vectors become equal in length and angle, so |H| → K₀ωp/ωz and ∠H → 0°.' : '|jω − p₁| ≈ ω and θp → 90°, so |H| ≈ K₀ωp/ω (−20 dB per decade) and ∠H → −90°.');
    else if (wt < 0.1 * wLow) note = `ω ≪ ${hasZero ? 'ωp, ωz' : 'ωp'}: s = jω is almost at the origin, so ${hasZero ? 'each vector length ≈ its root distance and |H| ≈ K₀' : '|jω − p₁| ≈ ωp and |H| ≈ K₀'}, ∠H ≈ 0°.`;
    $('test').innerHTML = head + '<br>' + geo + (note ? `<div class="note">${note}</div>` : '');
  }

  function drawMap(wp, wz) {
    const { ox, oy, left, top, w: W } = MAP, tick = Plot.eng;
    const raw = extent / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const wMax = (oy - top) / scale();
    let s = `<defs><clipPath id="pz-clip"><rect x="0" y="${top - 6}" width="${W}" height="${oy - top + 40}"/></clipPath></defs><rect width="${W}" height="420" fill="#fff"/>`;
    for (let v = step; v <= extent * 1.0001; v += step) {
      s += `<line x1="${X(v)}" y1="${top}" x2="${X(v)}" y2="${oy}" stroke="#eef1f5"/>` +
        `<text x="${X(v)}" y="${oy + 20}" text-anchor="middle" font-size="12" fill="#5b6578">−${tick(v)}</text>`;
    }
    for (let v = step; v <= wMax * 1.0001; v += step) {
      s += `<line x1="${left}" y1="${Y(v)}" x2="${ox}" y2="${Y(v)}" stroke="#eef1f5"/>` +
        `<text x="${ox + 7}" y="${Y(v) + 4}" font-size="12" fill="#5b6578">j${tick(v)}</text>`;
    }
    s += `<line x1="14" y1="${oy}" x2="508" y2="${oy}" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M508 ${oy}l-8 -4v8z" fill="#7d879a"/>` +
      `<line x1="${ox}" y1="${oy + 12}" x2="${ox}" y2="${top - 8}" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M${ox} ${top - 10}l-4 8h8z" fill="#7d879a"/>` +
      `<text x="${ox - 8}" y="${top + 2}" font-size="15" fill="#3c4658" font-style="italic" text-anchor="end">jω</text>` +
      `<text x="505" y="${oy - 8}" font-size="15" fill="#3c4658" font-style="italic" text-anchor="end">σ</text>` +
      `<text x="${ox + 6}" y="${oy + 18}" font-size="12" fill="#5b6578">0</text>` +
      `<text x="${left - 18}" y="${top + 4}" font-size="12" fill="#8a94a6">s-plane · rad/s · equal scales on both axes</text>`;

    // Vectors from the roots to the test point
    const ty = Y(wt), dotY = ty;
    s += `<g clip-path="url(#pz-clip)">`;
    if (hasZero) s += `<line x1="${X(wz)}" y1="${oy}" x2="${ox}" y2="${ty}" stroke="${C.zero}" stroke-width="2" stroke-dasharray="6 4"/>`;
    s += `<line x1="${X(wp)}" y1="${oy}" x2="${ox}" y2="${ty}" stroke="${C.pole}" stroke-width="2"/></g>`;
    // Angle arc at the pole
    const ang = Math.atan2(wt, wp), rArc = 30;
    s += `<path d="M${X(wp) + rArc} ${oy}A${rArc} ${rArc} 0 0 0 ${X(wp) + rArc * Math.cos(ang)} ${oy - rArc * Math.sin(ang)}" fill="none" stroke="${C.pole}" stroke-width="1.5"/>` +
      `<text x="${X(wp) + (rArc + 12) * Math.cos(ang / 2)}" y="${oy - (rArc + 12) * Math.sin(ang / 2) + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${C.pole}">θp</text>`;

    s += `<g class="drag" data-drag="p"><circle cx="${X(wp)}" cy="${oy}" r="18" fill="transparent"/>` +
      `<path d="M${X(wp) - 8} ${oy - 8}l16 16m-16 0l16 -16" stroke="${C.pole}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<text x="${X(wp)}" y="${oy + 36}" text-anchor="middle" font-size="13" font-weight="600" fill="${C.pole}">p₁ = −${tick(wp)}</text></g>`;
    if (hasZero) s += `<g class="drag" data-drag="z"><circle cx="${X(wz)}" cy="${oy}" r="16" fill="transparent"/>` +
      `<circle cx="${X(wz)}" cy="${oy}" r="9" fill="#fff" fill-opacity=".6" stroke="${C.zero}" stroke-width="3"/>` +
      `<text x="${X(wz)}" y="${oy - 16}" text-anchor="middle" font-size="13" font-weight="600" fill="${C.zero}">z₁ = −${tick(wz)}</text></g>`;

    // The test point itself, draggable up and down the imaginary axis
    s += `<g class="drag-v" data-drag="w"><circle cx="${ox}" cy="${dotY}" r="16" fill="transparent"/>` +
      `<circle cx="${ox}" cy="${dotY}" r="7" fill="${C.test}" stroke="#fff" stroke-width="2"/>` +
      `<text x="${ox - 12}" y="${dotY + 5}" text-anchor="end" font-size="13" font-weight="600" fill="${C.test}">s = j${tick(wt)}</text></g>` +
      (extent > base * 1.01 ? `<text x="${left - 18}" y="${top + 22}" font-size="13" font-weight="700" fill="${C.test}">🔍 zoomed out ×${num(extent / base, 3)} to follow jω</text>` : '');
    $('map').innerHTML = s;
  }

  // Dragging on the s-plane: pole and zero move horizontally, the test point vertically
  const map = $('map');
  const svgPoint = e => {
    let q = map.createSVGPoint(); q.x = e.clientX; q.y = e.clientY;
    return q.matrixTransform(map.getScreenCTM().inverse());
  };
  map.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-drag]');
    if (!g) return;
    drag = g.dataset.drag; map.setPointerCapture(e.pointerId); e.preventDefault();
  });
  map.addEventListener('pointermove', e => {
    if (!drag) return;
    const q = svgPoint(e);
    if (drag === 'w') {
      wt = Math.max(1e-3 * extent, (MAP.oy - Math.max(MAP.top, Math.min(MAP.oy, q.y))) / scale());
      drawTest();
      return;
    }
    let v = (MAP.ox - q.x) / scale();
    v = Math.min(extent, Math.max(extent * 0.004, v));
    v = Number(v.toPrecision(3));
    const other = +$(drag === 'p' ? 'z' : 'p').value;
    if (hasZero && Math.abs(v - other) < 0.02 * extent) v = other; // snap onto the other root
    $(drag).value = v;
    render(false);
  });
  const end = () => { if (drag) { const was = drag; drag = null; if (was !== 'w') render(true); } };
  map.addEventListener('pointerup', end);
  map.addEventListener('pointercancel', end);

  document.querySelectorAll('#pz-norm button').forEach(b => b.addEventListener('click', () => { norm = b.dataset.norm === '1'; render(false); }));
  ['p', 'z', 'k'].forEach(id => $(id).addEventListener('input', () => render(true)));
  document.querySelectorAll('#pz-preset button').forEach(b => b.addEventListener('click', () => {
    hasZero = b.dataset.preset === 'zero';
    if (!hasZero) { $('p').value = 1000; $('k').value = 1; wt = 1000; }
    else if (!(+$('z').value > 0)) $('z').value = 4 * (+$('p').value || 1000);
    render(true);
  }));
  render(true);
})();
