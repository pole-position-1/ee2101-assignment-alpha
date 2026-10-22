'use strict';
/* Section 1: drag a real pole (and optional real zero) and watch the Bode plot. */
(function () {
  const $ = id => document.getElementById('pz-' + id);
  const { eng, num } = Plot;
  const TWO_PI = 2 * Math.PI, DB3 = 10 * Math.log10(2);
  const MAP = { ox: 470, oy: 118, left: 34 }; // s-plane geometry in viewBox units
  let hasZero = false, extent = 1, drag = null, model = null, info = null;

  const texNum = v => {
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return String(Number(v.toPrecision(5)));
    const [m, e] = v.toExponential(3).split('e');
    return Number(m) + '\\times10^{' + Number(e) + '}';
  };
  const niceUp = v => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find(f => f * p >= v) * p; };

  const hover = w => {
    if (!model) return null;
    const r = Engine.response(model, w);
    return [
      `ω = ${eng(w, 'rad/s')}   (f = ${eng(w / TWO_PI, 'Hz')})`,
      { text: `|H| = ${num(20 * Math.log10(r.mag))} dB   (${num(r.mag)} V/V)`, color: '#0f766e' },
      { text: `∠H = ${num(r.phase)}°`, color: '#0f766e' },
    ];
  };
  const radTick = x => eng(x);
  const magPlot = new Plot($('mag'), { xLog: true, xLabel: 'ω (rad/s)', yLabel: '|H(jω)|  (dB)', hover, xTick: radTick });
  const phasePlot = new Plot($('phase'), { xLog: true, xLabel: 'ω (rad/s)', yLabel: '∠H(jω)  (°)', hover, xTick: radTick });

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
    if (rescale || !drag) extent = niceUp(1.25 * Math.max(wp, hasZero ? wz : 0));
    model = { n: hasZero ? [k, k / wz] : [k], d: [1, 1 / wp] };
    drawMap(wp, wz);

    // Equation in canonical form
    const frac = w => `1+s/${texNum(w)}`;
    katex.render(hasZero
      ? `H(s)=K_0\\,\\dfrac{1+s/\\omega_z}{1+s/\\omega_p}=${texNum(k)}\\,\\dfrac{${frac(wz)}}{${frac(wp)}}`
      : `H(s)=\\dfrac{K_0}{1+s/\\omega_p}=\\dfrac{${texNum(k)}}{${frac(wp)}}`, $('eq'), { displayMode: true, throwOnError: false });

    // Plot range: fixed decades so moving the pole visibly shifts the curve
    const crit = [wp].concat(hasZero ? [wz] : []);
    const lo = Math.min(1, 10 ** (Math.floor(Math.log10(Math.min(...crit))) - 2));
    const hi = Math.max(1e7, 10 ** (Math.ceil(Math.log10(Math.max(...crit))) + 2));
    const ws = Array.from({ length: 700 }, (_, i) => lo * (hi / lo) ** (i / 699));
    const rs = ws.map(w => Engine.response(model, w));
    const db = rs.map(r => 20 * Math.log10(r.mag));
    const k0db = 20 * Math.log10(k);
    const cut = Engine.magCrossings(model, k / Math.SQRT2, lo, hi)[0];
    const w45 = Engine.phaseCrossing(model, -45, lo, hi);
    const cancelled = hasZero && Math.abs(wz - wp) <= 1e-9 * wp;
    info = { cut, w45 };

    let ymin = Math.min(k0db - 10, ...db), ymax = Math.max(k0db + 5, ...db);
    const step = ymax - ymin > 90 ? 20 : 10;
    ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    const vLines = [{ x: wp, color: '#dc2626', dash: [2, 4], label: 'ωp', bottom: true }];
    if (hasZero) vLines.push({ x: wz, color: '#059669', dash: [2, 4], label: 'ωz', bottom: true, row: 1 });
    if (cut) vLines.push({ x: cut, color: '#c2410c', dash: [6, 4], label: 'ω−3dB' });
    magPlot.set({
      x: [lo, hi], y: [ymin, ymax], yStep: step,
      series: [{ x: ws, y: db, color: '#0f766e' }],
      hLines: [{ y: k0db - DB3, color: '#c2410c', dash: [6, 4], label: 'K₀ − 3 dB' }],
      vLines, points: cut ? [{ x: cut, y: k0db - DB3, color: '#c2410c' }] : [],
    });
    phasePlot.set({
      x: [lo, hi], y: [-90, 90], yStep: 45,
      series: [{ x: ws, y: rs.map(r => r.phase), color: '#0f766e' }],
      hLines: [{ y: -45, color: '#c2410c', dash: [6, 4], label: '−45°' }],
      vLines: vLines.filter(l => l.label !== 'ω−3dB').concat(w45 ? [{ x: w45, color: '#c2410c', dash: [6, 4], label: 'ω at −45°' }] : []),
      points: w45 ? [{ x: w45, y: -45, color: '#c2410c' }] : [],
    });

    const stat = (label, value, cls = '') => `<div class="stat ${cls}"><b>${label}</b><span>${value}</span></div>`;
    $('stats').innerHTML =
      stat('−3 dB bandwidth ω−3dB', cut ? `${eng(cut, 'rad/s', 5)} · ${eng(cut / TWO_PI, 'Hz', 4)}` : 'none (within 3 dB of K₀)') +
      stat('Phase = −45° at', w45 ? `${eng(w45, 'rad/s', 5)} · ${eng(w45 / TWO_PI, 'Hz', 4)}` : 'never reached') +
      stat('DC gain K₀', `${num(k)} · ${num(k0db)} dB`) +
      (hasZero ? stat('High-frequency gain', `${num(k * wp / wz)} · ${num(20 * Math.log10(k * wp / wz))} dB`) : '') +
      (cancelled ? stat('Pole–zero cancellation', 'Flat: |H| = K₀ and ∠H = 0° at every ω', 'note') : '');
  }

  function drawMap(wp, wz) {
    const { ox, oy, left } = MAP, X = v => ox - v / extent * (ox - left);
    const tick = Plot.eng;
    const raw = extent / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    let s = '<rect width="520" height="250" fill="#fff"/>';
    for (let v = step; v <= extent * 1.0001; v += step) {
      s += `<line x1="${X(v)}" y1="14" x2="${X(v)}" y2="${oy + 92}" stroke="#eef1f5"/>` +
        `<text x="${X(v)}" y="${oy + 110}" text-anchor="middle" font-size="12" fill="#5b6578">−${tick(v)}</text>`;
    }
    s += `<line x1="14" y1="${oy}" x2="508" y2="${oy}" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M508 ${oy}l-8 -4v8z" fill="#7d879a"/>` +
      `<line x1="${ox}" y1="${oy + 96}" x2="${ox}" y2="10" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M${ox} 8l-4 8h8z" fill="#7d879a"/>` +
      `<text x="${ox + 8}" y="20" font-size="14" fill="#3c4658" font-style="italic">jω</text>` +
      `<text x="505" y="${oy - 8}" font-size="14" fill="#3c4658" font-style="italic" text-anchor="end">σ</text>` +
      `<text x="${ox + 6}" y="${oy + 16}" font-size="12" fill="#5b6578">0</text>` +
      `<text x="${left}" y="${oy + 128}" font-size="12" fill="#8a94a6">rad/s · stable left half-plane</text>`;
    s += `<g class="drag" data-drag="p"><circle cx="${X(wp)}" cy="${oy}" r="18" fill="transparent"/>` +
      `<path d="M${X(wp) - 8} ${oy - 8}l16 16m-16 0l16 -16" stroke="#dc2626" stroke-width="3.2" stroke-linecap="round"/>` +
      `<text x="${X(wp)}" y="${oy - 18}" text-anchor="middle" font-size="13" font-weight="600" fill="#dc2626">p₁ = −${tick(wp)}</text></g>`;
    if (hasZero) s += `<g class="drag" data-drag="z"><circle cx="${X(wz)}" cy="${oy}" r="16" fill="transparent"/>` +
      `<circle cx="${X(wz)}" cy="${oy}" r="9" fill="none" stroke="#059669" stroke-width="3"/>` +
      `<text x="${X(wz)}" y="${oy + 32}" text-anchor="middle" font-size="13" font-weight="600" fill="#059669">z₁ = −${tick(wz)}</text></g>`;
    $('map').innerHTML = s;
  }

  // Dragging on the s-plane
  const map = $('map');
  map.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-drag]');
    if (!g) return;
    drag = g.dataset.drag; map.setPointerCapture(e.pointerId); e.preventDefault();
  });
  map.addEventListener('pointermove', e => {
    if (!drag) return;
    let q = map.createSVGPoint(); q.x = e.clientX; q.y = e.clientY;
    q = q.matrixTransform(map.getScreenCTM().inverse());
    let v = (MAP.ox - q.x) / (MAP.ox - MAP.left) * extent;
    v = Math.min(extent, Math.max(extent * 0.004, v));
    v = Number(v.toPrecision(3));
    const other = +$(drag === 'p' ? 'z' : 'p').value;
    if (hasZero && Math.abs(v - other) < 0.02 * extent) v = other; // snap onto the other root
    $(drag).value = v;
    render(false);
  });
  const end = () => { if (drag) { drag = null; render(true); } };
  map.addEventListener('pointerup', end);
  map.addEventListener('pointercancel', end);

  ['p', 'z', 'k'].forEach(id => $(id).addEventListener('input', () => render(true)));
  document.querySelectorAll('#pz-preset button').forEach(b => b.addEventListener('click', () => {
    hasZero = b.dataset.preset === 'zero';
    if (!hasZero) { $('p').value = 1000; $('k').value = 1; }
    else if (!(+$('z').value > 0)) $('z').value = 4 * (+$('p').value || 1000);
    render(true);
  }));
  render(true);
})();
