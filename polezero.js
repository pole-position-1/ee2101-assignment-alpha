'use strict';
/*
 * Section 1: place poles and zeros and watch the Bode plot.
 * Poles: one real pole, or a complex-conjugate pair, anywhere in the left half
 * plane. Zeros: none, one real zero (either half plane), or a conjugate pair
 * anywhere (including the jω axis, a notch). A purple test point s = jω on the
 * imaginary axis follows the Bode cursor (and can be dragged), with vectors from
 * each root showing where |H| and ∠H come from: the Bode plot is H(s) evaluated
 * as s climbs the jω axis.
 */
(function () {
  const $ = id => document.getElementById('pz-' + id);
  const { eng, num } = Plot;
  const TWO_PI = 2 * Math.PI, DB3 = 10 * Math.log10(2), DEG = 180 / Math.PI;
  const C = { pole: '#dc2626', zero: '#059669', test: '#7c3aed', cut: '#c2410c', curve: '#0f766e' };
  // s-plane geometry in viewBox units; both axes share one scale so angles are true.
  // With a zero or a pole pair the origin moves to the middle so the RHP and lower half show too.
  const LAYOUT = {
    pole: { ox: 470, oy: 372, left: 34, right: 500, top: 18, bottom: 372 },
    plane: { ox: 300, oy: 250, left: 34, right: 490, top: 18, bottom: 392 },
  };
  let MAP = LAYOUT.pole;
  let poleMode = 'real', hasZero = false, norm = true, base = 1, extent = 1, drag = null, model = null, wt = null, frame = 0;
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
  const fit = () => 0.9 * (MAP.oy - MAP.top) / (MAP.ox - MAP.left);
  const X = sigma => MAP.ox + sigma * scale();                 // position of Re{s} = σ
  const Y = w => MAP.oy - w * scale();                         // position of Im{s} = ω

  // Roots of the current model: a single real root, or a conjugate pair
  const zerosOf = (zr, zi) => !hasZero ? [] : zi > 0 ? [{ re: zr, im: zi }, { re: zr, im: -zi }] : [{ re: zr, im: 0 }];
  const polesOf = (wp, pi, wp2) => poleMode === 'pair' ? [{ re: -wp, im: pi }, { re: -wp, im: -pi }]
    : poleMode === 'two' ? [{ re: -wp, im: 0 }, { re: -wp2, im: 0 }] : [{ re: -wp, im: 0 }];
  const resp = w => Engine.zpkResponse(last.k, last.zeros, last.poles, w);
  const near = (a, b, tol) => Math.abs(a.re - b.re) < tol && Math.abs(a.im - b.im) < tol;

  const hover = w => {
    if (!last) return null;
    const r = resp(w);
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
  const xLabel = 'ω (rad/s)      f = ω / 2π (Hz)';
  const magPlot = new Plot($('mag'), { xLog: true, xLabel, yLabel: '|H(jω)|  (dB)', hover, onMove, xTick: radTick });
  const phasePlot = new Plot($('phase'), { xLog: true, xLabel, yLabel: '∠H(jω)  (°)', hover, onMove, xTick: radTick });

  function read() {
    const vals = { p: +$('p').value, pi: +$('pi').value, p2: +$('p2').value, zr: +$('zr').value, zi: +$('zi').value, k: +$('k').value };
    const filled = id => $(id).value !== '' && Number.isFinite(vals[id]);
    const bad = {
      p: !(filled('p') && vals.p > 0), k: !(filled('k') && vals.k > 0),
      pi: poleMode === 'pair' && !(filled('pi') && vals.pi >= 0),
      p2: poleMode === 'two' && !(filled('p2') && vals.p2 > 0),
      zr: hasZero && !(filled('zr') && (vals.zr !== 0 || vals.zi > 0)),
      zi: hasZero && !(filled('zi') && vals.zi >= 0),
    };
    Object.keys(bad).forEach(id => $(id).classList.toggle('bad', bad[id]));
    return Object.values(bad).some(Boolean) ? null : vals;
  }

  // −45° crossing on the continuous (factor-by-factor) phase; jumps at jω-axis zeros are skipped
  function phaseCross(deg, lo, hi) {
    const N = 3000, f = w => resp(w).phase - deg;
    let wPrev = lo, yPrev = f(lo);
    for (let i = 1; i <= N; i++) {
      const w = lo * (hi / lo) ** (i / N), y = f(w);
      if (yPrev * y < 0 && Math.abs(y - yPrev) < 90) {
        let a = wPrev, b = w, fa = yPrev;
        for (let j = 0; j < 80; j++) { const c = Math.sqrt(a * b), fc = f(c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } }
        return Math.sqrt(a * b);
      }
      wPrev = w; yPrev = y;
    }
    return null;
  }
  // Highest |H| on the sampled curve, refined by golden-section search on log ω
  function peak(ws, rs) {
    let i = 0;
    rs.forEach((r, j) => { if (r.mag > rs[i].mag) i = j; });
    let a = Math.log(ws[Math.max(0, i - 1)]), b = Math.log(ws[Math.min(ws.length - 1, i + 1)]);
    const g = (Math.sqrt(5) - 1) / 2, f = x => resp(Math.exp(x)).mag;
    for (let j = 0; j < 80; j++) {
      const c = b - g * (b - a), d = a + g * (b - a);
      if (f(c) > f(d)) b = d; else a = c;
    }
    const w = Math.exp((a + b) / 2);
    return { w, mag: resp(w).mag };
  }

  function render(rescale = true) {
    const pair = poleMode === 'pair', two = poleMode === 'two';
    $('zero-field').classList.toggle('off', !hasZero);
    $('zr').disabled = $('zi').disabled = !hasZero;
    $('pi').disabled = !pair;
    $('pi').classList.toggle('off', !pair);
    $('pi-wrap').hidden = two; $('p2-wrap').hidden = !two;
    MAP = hasZero || pair ? LAYOUT.plane : LAYOUT.pole;
    const v = read();
    const kind = !hasZero ? 'none' : v && v.zi > 0 && v.zr === 0 ? 'jw' : v && v.zi > 0 ? 'pair' : v && v.zr > 0 ? 'rhp' : 'lhp';
    document.querySelectorAll('#pz-zeros button').forEach(b => b.classList.toggle('on', b.dataset.zero === kind));
    document.querySelectorAll('#pz-poles button').forEach(b => b.classList.toggle('on', b.dataset.poles === poleMode));
    if (!v) { $('stats').innerHTML = '<div class="stat warn"><span>Enter positive numbers for the pole and gain, imaginary parts ≥ 0, and a zero that is not at the origin.</span></div>'; return; }
    const { p: wp, k } = v, pi = pair ? v.pi : 0, wp2 = two ? v.p2 : 0, zr = hasZero ? v.zr : 0, zi = hasZero ? v.zi : 0;
    const zeros = zerosOf(zr, zi), poles = polesOf(wp, pi, wp2), wn = Math.hypot(zr, zi), wnp = two ? Math.sqrt(wp * wp2) : Math.hypot(wp, pi);
    if (rescale || !drag) {
      // Room needed on each side of the origin, in units of the LHP extent
      const { ox, oy, left, right, top, bottom } = MAP, lw = ox - left, up = lw / (oy - top), down = lw / Math.max(1, bottom - oy - 14);
      const need = [wp, wp2, pi * up, pi > 0 ? pi * down : 0];
      if (hasZero) need.push(-zr, zr * lw / (right - ox), zi * up, zi > 0 ? zi * down : 0);
      base = niceUp(1.25 * Math.max(...need));
    }
    model = {
      n: !hasZero ? [k] : zi > 0 ? [k, -2 * k * zr / (wn * wn), k / (wn * wn)] : [k, -k / zr],
      d: pair ? [1, 2 * wp / (wnp * wnp), 1 / (wnp * wnp)] : two ? [1, 1 / wp + 1 / wp2, 1 / (wp * wp2)] : [1, 1 / wp],
    };
    if (!(wt > 0)) wt = wnp;

    // H(s) in the normalised form, each factor equal to 1 at s = 0
    const rad = '\\ \\text{rad/s}', vals = ['K_0=' + texNum(k)];
    let numTex = '', denTex;
    if (hasZero && zi === 0) { numTex = `1${zr < 0 ? '+' : '-'}s/\\omega_z`; vals.push(`\\omega_z=${texNum(Math.abs(zr))}${rad}${zr > 0 ? '\\ (\\text{RHP})' : ''}`); }
    else if (hasZero) {
      numTex = `1${zr === 0 ? '' : '+2\\zeta_z s/\\omega_z'}+(s/\\omega_z)^2`;
      if (zr !== 0) vals.push(`\\zeta_z=${texNum(-zr / wn)}`);
      vals.push(`\\omega_z=${texNum(wn)}${rad}`);
    }
    if (two) { denTex = '(1+s/\\omega_{p1})(1+s/\\omega_{p2})'; vals.push(`\\omega_{p1}=${texNum(wp)}${rad}`, `\\omega_{p2}=${texNum(wp2)}${rad}`); }
    else if (!pair) { denTex = '1+s/\\omega_p'; vals.push(`\\omega_p=${texNum(wp)}${rad}`); }
    else if (pi === 0) { denTex = '(1+s/\\omega_p)^2'; vals.push(`\\omega_p=${texNum(wp)}${rad}`); }
    else { denTex = '1+2\\zeta_p s/\\omega_p+(s/\\omega_p)^2'; vals.push(`\\zeta_p=${texNum(wp / wnp)}`, `\\omega_p=${texNum(wnp)}${rad}`); }
    const tex = (hasZero ? `H(s)=K_0\\,\\dfrac{${numTex}}{${denTex}}` : `H(s)=\\dfrac{K_0}{${denTex}}`) + '\\qquad ' + vals.join(',\\quad ');
    katex.render(tex, $('eq'), { displayMode: true, throwOnError: false });

    last = { wp, pi, wp2, zr, zi, zeros, poles, k, wn, wnp };
    // Plot range: fixed decades so moving a root visibly shifts the curve
    const crit = (two ? [wp, wp2] : [wnp]).concat(hasZero ? [wn] : []);
    const lo = Math.min(1, 10 ** (Math.floor(Math.log10(Math.min(...crit))) - 2));
    const hi = Math.max(1e7, 10 ** (Math.ceil(Math.log10(Math.max(...crit))) + 2));
    const ws = Array.from({ length: 900 }, (_, i) => lo * (hi / lo) ** (i / 899));
    const rs = ws.map(resp);
    const k0db = 20 * Math.log10(k), off = norm ? k0db : 0; // normalised plots put K₀ at 0 dB
    const db = rs.map(r => 20 * Math.log10(r.mag) - off), ph = rs.map(r => r.phase);
    const cut = Engine.cutoff(model, k);
    const w45 = phaseCross(-45, lo, hi);
    const tol = 1e-9 * wnp;
    const cancelled = zeros.length === poles.length && zeros.every(z => poles.some(p => near(z, p, tol)));

    const finite = db.filter(Number.isFinite);
    let ymax = Math.max(k0db - off + 5, ...finite), ymin = Math.max(ymax - 120, Math.min(k0db - off - 10, ...finite));
    const step = ymax - ymin > 90 ? 20 : 10;
    ymin = Math.floor(ymin / step) * step; ymax = Math.ceil(ymax / step) * step;
    const pmin = Math.min(-90, Math.floor(Math.min(...ph) / 45 - 1e-9) * 45), pmax = Math.max(90, Math.ceil(Math.max(...ph) / 45 + 1e-9) * 45);
    const vLines = two ? [{ x: wp, color: C.pole, dash: [2, 4], label: 'ωp1', bottom: true }, { x: wp2, color: C.pole, dash: [2, 4], label: 'ωp2', bottom: true, row: 2 }]
      : [{ x: wnp, color: C.pole, dash: [2, 4], label: 'ωp', bottom: true }];
    if (hasZero) vLines.push({ x: wn, color: C.zero, dash: [2, 4], label: 'ωz', bottom: true, row: 1 });
    const pk = pair && pi > 0 ? peak(ws, rs) : null, pkDb = pk ? 20 * Math.log10(pk.mag / k) : 0;
    const points = cut ? [{ x: cut, y: k0db - off - DB3, color: C.cut }] : [];
    if (pk && pkDb > 0.01) points.push({ x: pk.w, y: 20 * Math.log10(pk.mag) - off, color: C.pole });
    Object.assign(last, {
      lo, hi, off,
      mag: { x: [lo, hi], y: [ymin, ymax], yStep: step, series: [{ x: ws, y: db, color: C.curve }],
        hLines: [{ y: k0db - off - DB3, color: C.cut, dash: [6, 4], label: norm ? '−3 dB' : `K₀ − 3 dB = ${num(k0db - DB3, 3)} dB` }],
        vLines: cut ? vLines.concat([{ x: cut, color: C.cut, dash: [6, 4], label: 'ω−3dB' }]) : vLines,
        points },
      phase: { x: [lo, hi], y: [pmin, pmax], yStep: pmax - pmin > 360 ? 90 : 45, series: [{ x: ws, y: ph, color: C.curve, breakAt: 150 }],
        hLines: [{ y: -45, color: C.cut, dash: [6, 4], label: '−45°' }],
        vLines: w45 ? vLines.concat([{ x: w45, color: C.cut, dash: [6, 4], label: 'ω at −45°' }]) : vLines,
        points: w45 ? [{ x: w45, y: -45, color: C.cut }] : [] },
    });
    magPlot.o.yLabel = norm ? '|H/K₀|  (dB)' : '|H(jω)|  (dB)';
    document.querySelectorAll('#pz-norm button').forEach(b => b.classList.toggle('on', (b.dataset.norm === '1') === norm));
    drawTest();

    const stat = (label, value, cls = '') => `<div class="stat ${cls}"><b>${label}</b><span>${value}</span></div>`;
    // H(∞) = K₀ Πp / Πz when there are as many zeros as poles; otherwise a net slope
    const slope = (zeros.length - poles.length) * 20;
    let hfStat;
    if (slope === 0) {
      const hf = k * Engine.cdiv(poles.reduce(Engine.cmul, { re: 1, im: 0 }), zeros.reduce(Engine.cmul, { re: 1, im: 0 })).re;
      hfStat = stat('High-frequency gain H(∞)', `${num(hf)} V/V (${num(20 * Math.log10(Math.abs(hf)), 3)} dB${hf < 0 ? ', ∠ −180°' : ''})`);
    } else hfStat = stat('High-frequency slope', `${slope > 0 ? '+' : '−'}${Math.abs(slope)} dB/decade (${zeros.length} zero${zeros.length === 1 ? '' : 's'}, ${poles.length} pole${poles.length === 1 ? '' : 's'})`);
    let poleStat = '';
    if (two) poleStat = stat('Two real poles', `ωp1 = ${eng(wp, 'rad/s', 4)}, ωp2 = ${eng(wp2, 'rad/s', 4)}: up to −40 dB/dec and −180° from the poles`);
    else if (pair && pi === 0) poleStat = stat('Double real pole', `ζ = 1, ωp = ${eng(wp, 'rad/s', 4)}: −40 dB/dec, −180° overall`);
    else if (pair) {
      const zeta = wp / wnp;
      poleStat = stat('Complex poles', `ζ = ${num(zeta)}, ωp = ${eng(wnp, 'rad/s', 4)}, Q = ${num(1 / (2 * zeta))}`) +
        (pkDb > 0.01 ? stat('Resonant peak', `+${num(pkDb, 3)} dB above K₀ at ${eng(pk.w, 'rad/s', 4)}`, 'warn')
          : stat('Resonant peak', zeta >= Math.SQRT1_2 ? 'none: ζ ≥ 0.707' : 'none above K₀'));
    }
    $('stats').innerHTML =
      stat('−3 dB bandwidth ω−3dB', cut ? `${eng(cut, 'rad/s', 4)} (${eng(cut / TWO_PI, 'Hz', 4)})` : 'none: gain never drops 3 dB below K₀') +
      stat('Phase = −45° at', w45 ? `${eng(w45, 'rad/s', 4)} (${eng(w45 / TWO_PI, 'Hz', 4)})` : 'never reached') +
      stat('DC gain K₀', `${num(k)} V/V (${num(k0db, 3)} dB)`) +
      hfStat + poleStat +
      (hasZero && zi > 0 && zr !== 0 ? stat('Complex zeros', `ζz = ${num(-zr / wn)}, ωz = ${eng(wn, 'rad/s', 4)}: the zero factor is 2|ζz| = ${num(20 * Math.log10(Math.abs(2 * zr / wn)), 3)} dB at ωz (asymptotes give 0 dB)`) : '') +
      (hasZero && zr > 0 ? stat(`Right-half-plane zero${zi > 0 ? 's' : ''}`, '|H| rises like an LHP zero, but the phase lags instead of leads: non-minimum phase', 'warn') : '') +
      (hasZero && zr === 0 ? stat('Zeros on the jω axis', `|H(jωz)| = 0: a perfect notch at ωz = ${eng(wn, 'rad/s', 4)}, with a 180° phase step`, 'note') : '') +
      (cancelled ? stat('Pole–zero cancellation', 'Flat: |H| = K₀ and ∠H = 0° at every ω', 'note') : '');
  }

  // Redraws everything that depends on the test frequency wt: the s-plane and the Bode markers.
  function drawTest() {
    if (!last || !last.mag) return;
    const { wp, zr, zi, zeros, poles, k, wn, wnp, lo, hi, off } = last;
    wt = Math.min(hi, Math.max(lo, wt));
    // Zoom the s-plane out (equal scales, so angles stay true) to keep jω on screen
    extent = Math.max(base, wt / fit());
    const zoom = extent / base;
    const r = resp(wt), db = 20 * Math.log10(r.mag);
    const marker = { x: wt, color: C.test, dash: [2, 3] };
    magPlot.set({ ...last.mag, vLines: last.mag.vLines.concat([marker]), points: last.mag.points.concat(Number.isFinite(db) ? [{ x: wt, y: db - off, color: C.test }] : []) });
    phasePlot.set({ ...last.phase, vLines: last.phase.vLines.concat([marker]), points: last.phase.points.concat([{ x: wt, y: r.phase, color: C.test }]) });
    drawMap();

    // Geometry readout: each factor is |jω − root| / |root|, and each root adds its angle
    const fac = rs => rs.map(q => `(${eng(Math.hypot(q.re, wt - q.im), '', 4)} / ${eng(Math.hypot(q.re, q.im), '', 4)})`).join(' · ');
    const ang = rs => rs.reduce((s, q) => s + Engine.factorAngle(q, wt), 0) * DEG;
    const phiZ = ang(zeros), thP = ang(poles);
    const head = `<b>●</b> s = j${eng(wt, 'rad/s', 4)} &nbsp;→&nbsp; |H(jω)| = ${num(r.mag)} V/V (${num(db, 3)} dB), &nbsp;∠H = ${num(r.phase)}°`;
    let geo;
    if (!hasZero && poles.length === 1) geo = `|H| = K₀ ωp / <span class="p">|jω − p₁|</span> = ${num(k)} × ${eng(wp, '', 4)} / <span class="p">${eng(Math.hypot(wp, wt), '', 4)}</span> &nbsp;·&nbsp; ∠H = −<span class="p">θp</span> = −${num(thP)}°`;
    else {
      const why = zr > 0 ? ' (RHP: jω − z points left, so each zero angle is θ − 180°, a lag)' : hasZero && zr === 0 ? ' (0° below ωz, 180° above)' : '';
      geo = `|H| = K₀${hasZero ? ` · <span class="z">${fac(zeros)}</span>` : ''} / [<span class="p">${fac(poles)}</span>] &nbsp;<small>(each factor is |jω − root| / |root|)</small><br>` +
        (hasZero ? `∠H = <span class="z">φz ${num(phiZ)}°</span> − <span class="p">θp ${num(thP)}°</span>${why}` : `∠H = −<span class="p">θp</span> = −${num(thP)}° <small>(sum of the angles from both poles)</small>`);
    }
    const wLow = Math.min(...poles.map(p => Math.hypot(p.re, p.im)), ...(hasZero ? [wn] : []));
    let note = '';
    if (zoom > 2) {
      const far = resp(1e6 * extent), slope = (zeros.length - poles.length) * 20;
      note = `View zoomed out ×${num(zoom, 3)}. From this far up the axis every root looks like it sits at the origin: each vector is about ω long and nearly vertical, so ` +
        (slope ? `|H| changes by ${slope > 0 ? '+' : '−'}${Math.abs(slope)} dB per decade` : '|H| levels off') + ` and ∠H → ${num(Math.round(far.phase))}°.`;
    } else if (wt < 0.1 * wLow) note = 'ω ≪ every root: s = jω is almost at the origin, so each vector length ≈ its root\'s distance from the origin, |H| ≈ K₀ and ∠H ≈ 0°.';
    else if (poles.length === 2 && last.pi > 0 && Math.abs(wt - last.pi) < 0.15 * last.pi && wp < 0.5 * wnp) note = 'The test point is passing the upper pole: |jω − p₁| is at its shortest here, which is where the resonant peak comes from, and θp swings quickly.';
    $('test').innerHTML = head + '<br>' + geo + (note ? `<div class="note">${note}</div>` : '');
  }

  function drawMap() {
    const { ox, oy, left, right, top, bottom } = MAP, tick = Plot.eng, W = 520, plane = MAP === LAYOUT.plane;
    const { wp, pi, zr, zi } = last;
    const raw = extent / 4, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const sc = scale(), wMax = (oy - top) / sc, wMin = (bottom - oy) / sc, sMax = (right - ox) / sc;
    let s = `<defs><clipPath id="pz-clip"><rect x="0" y="${top - 6}" width="${W}" height="${bottom - top + 12}"/></clipPath></defs><rect width="${W}" height="420" fill="#fff"/>`;
    if (plane) s += `<rect x="${ox}" y="${top - 6}" width="${right + 10 - ox}" height="${bottom - top + 12}" fill="#fdf2f2"/>` +
      `<text x="${right + 6}" y="${bottom - 2}" text-anchor="end" font-size="11" fill="#b91c1c" fill-opacity=".7">RHP</text>`;
    for (let v = step; v <= extent * 1.0001; v += step) {
      s += `<line x1="${X(-v)}" y1="${top}" x2="${X(-v)}" y2="${bottom}" stroke="#eef1f5"/>` +
        `<text x="${X(-v)}" y="${oy + 20}" text-anchor="middle" font-size="12" fill="#5b6578">−${tick(v)}</text>`;
    }
    for (let v = step; plane && v <= sMax * 1.0001; v += step) {
      s += `<line x1="${X(v)}" y1="${top}" x2="${X(v)}" y2="${bottom}" stroke="#f3e4e4"/>` +
        `<text x="${X(v)}" y="${oy + 20}" text-anchor="middle" font-size="12" fill="#5b6578">${tick(v)}</text>`;
    }
    for (let v = step; v <= wMax * 1.0001; v += step) {
      s += `<line x1="${left}" y1="${Y(v)}" x2="${right}" y2="${Y(v)}" stroke="#eef1f5" stroke-opacity=".9"/>` +
        `<text x="${ox + 7}" y="${Y(v) + 4}" font-size="12" fill="#5b6578">j${tick(v)}</text>`;
    }
    for (let v = step; v <= wMin * 1.0001; v += step) {
      s += `<line x1="${left}" y1="${Y(-v)}" x2="${right}" y2="${Y(-v)}" stroke="#eef1f5" stroke-opacity=".9"/>` +
        `<text x="${ox + 7}" y="${Y(-v) + 4}" font-size="12" fill="#5b6578">−j${tick(v)}</text>`;
    }
    s += `<line x1="14" y1="${oy}" x2="508" y2="${oy}" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M508 ${oy}l-8 -4v8z" fill="#7d879a"/>` +
      `<line x1="${ox}" y1="${bottom + (plane ? 6 : 12)}" x2="${ox}" y2="${top - 8}" stroke="#7d879a" stroke-width="1.4"/>` +
      `<path d="M${ox} ${top - 10}l-4 8h8z" fill="#7d879a"/>` +
      `<text x="${ox - 8}" y="${top + 2}" font-size="15" fill="#3c4658" font-style="italic" text-anchor="end">jω</text>` +
      `<text x="505" y="${oy - 8}" font-size="15" fill="#3c4658" font-style="italic" text-anchor="end">σ</text>` +
      `<text x="${ox + 6}" y="${oy + 18}" font-size="12" fill="#5b6578">0</text>` +
      `<text x="${left - 18}" y="${top + 4}" font-size="12" fill="#8a94a6">s-plane · rad/s · equal scales on both axes</text>`;

    // Vectors from the roots to the test point
    const ty = Y(wt);
    s += `<g clip-path="url(#pz-clip)">`;
    for (const z of last.zeros) s += `<line x1="${X(z.re)}" y1="${Y(z.im)}" x2="${ox}" y2="${ty}" stroke="${C.zero}" stroke-width="2" stroke-dasharray="6 4"/>`;
    for (const p of last.poles) s += `<line x1="${X(p.re)}" y1="${Y(p.im)}" x2="${ox}" y2="${ty}" stroke="${C.pole}" stroke-width="2"/>`;
    s += '</g>';
    // Angle arc at the (upper) pole, measured from the positive real direction
    const ang = Math.atan2(wt - pi, wp), rArc = 30, px0 = X(-wp), py0 = Y(pi);
    s += `<path d="M${px0 + rArc} ${py0}A${rArc} ${rArc} 0 0 ${ang >= 0 ? 0 : 1} ${px0 + rArc * Math.cos(ang)} ${py0 - rArc * Math.sin(ang)}" fill="none" stroke="${C.pole}" stroke-width="1.5"/>` +
      `<text x="${px0 + (rArc + 12) * Math.cos(ang / 2)}" y="${py0 - (rArc + 12) * Math.sin(ang / 2) + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${C.pole}">θp</text>`;

    const two = poleMode === 'two';
    const pText = poleMode === 'real' ? `p₁ = −${tick(wp)}` : two ? `p₁ = −${tick(wp)}` : pi > 0 ? `p₁,₂ = −${tick(wp)} ± j${tick(pi)}` : `p₁,₂ = −${tick(wp)} (double)`;
    // two real poles: each is labelled and dragged on its own; a close p₂ is labelled above the axis
    const p2Above = two && Math.abs(X(-wp) - X(-last.wp2)) < 70;
    last.poles.forEach((p, i) => {
      const x = X(p.re), y = Y(p.im);
      const label = i === 0 ? pText : two ? `p₂ = −${tick(last.wp2)}` : '';
      const ly = i === 1 && p2Above ? y - 16 : pi > 0 ? y - 16 : y + 36;
      s += `<g class="${poleMode === 'pair' ? 'drag-2d' : 'drag'}" data-drag="${two && i === 1 ? 'p2' : 'p'}"><circle cx="${x}" cy="${y}" r="18" fill="transparent"/>` +
        `<path d="M${x - 8} ${y - 8}l16 16m-16 0l16 -16" stroke="${C.pole}" stroke-width="3.2" stroke-linecap="round"/>` +
        (label ? `<text x="${x}" y="${ly}" text-anchor="middle" font-size="13" font-weight="600" fill="${C.pole}">${label}</text>` : '') + '</g>';
    });
    if (hasZero) {
      const zText = zi > 0 ? `z₁,₂ = ${zr === 0 ? '' : (zr < 0 ? '−' : '') + tick(Math.abs(zr)) + ' '}± j${tick(zi)}` : `z₁ = ${zr < 0 ? '−' : '+'}${tick(Math.abs(zr))}`;
      last.zeros.forEach((z, i) => {
        s += `<g class="drag-2d" data-drag="z"><circle cx="${X(z.re)}" cy="${Y(z.im)}" r="16" fill="transparent"/>` +
          `<circle cx="${X(z.re)}" cy="${Y(z.im)}" r="9" fill="#fff" fill-opacity=".6" stroke="${C.zero}" stroke-width="3"/>` +
          (i === 0 ? `<text x="${X(z.re)}" y="${Y(z.im) - 16}" text-anchor="middle" font-size="13" font-weight="600" fill="${C.zero}">${zText}</text>` : '') + '</g>';
      });
    }

    // The test point itself, draggable up and down the imaginary axis
    s += `<g class="drag-v" data-drag="w"><circle cx="${ox}" cy="${ty}" r="16" fill="transparent"/>` +
      `<circle cx="${ox}" cy="${ty}" r="7" fill="${C.test}" stroke="#fff" stroke-width="2"/>` +
      `<text x="${ox - 12}" y="${ty + 5}" text-anchor="end" font-size="13" font-weight="600" fill="${C.test}" pointer-events="none">s = j${tick(wt)}</text></g>` +
      (extent > base * 1.01 ? `<text x="${left - 18}" y="${top + 22}" font-size="13" font-weight="700" fill="${C.test}">🔍 zoomed out ×${num(extent / base, 3)} to follow jω</text>` : '') +
      Watermark.svg(512, 414);
    $('map').innerHTML = s;
  }

  // Dragging on the s-plane: poles stay in the LHP, zeros go anywhere, the test point moves vertically.
  // Dragging below the axis moves the conjugate, so the imaginary part is mirrored up.
  const map = $('map');
  const svgPoint = e => {
    let q = map.createSVGPoint(); q.x = e.clientX; q.y = e.clientY;
    return q.matrixTransform(map.getScreenCTM().inverse());
  };
  const round3 = v => Number(v.toPrecision(3));
  map.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-drag]');
    if (!g) return;
    drag = g.dataset.drag; map.setPointerCapture(e.pointerId); e.preventDefault();
  });
  map.addEventListener('pointermove', e => {
    if (!drag) return;
    const q = svgPoint(e), sc = scale(), { ox, oy, right, top } = MAP, tol = 0.02 * extent;
    const zero = { re: +$('zr').value, im: +$('zi').value };
    if (drag === 'w') {
      wt = Math.max(1e-3 * extent, (oy - Math.max(top, Math.min(oy, q.y))) / sc);
      drawTest();
      return;
    }
    if (drag === 'p' || drag === 'p2') {
      let v = Math.min(extent, Math.max(extent * 0.004, (ox - q.x) / sc));
      let w = poleMode === 'pair' ? Math.min((oy - top) / sc, Math.abs(oy - q.y) / sc) : 0;
      if (w < 0.025 * extent) w = 0;                                  // snap onto the real axis (a double pole)
      if (hasZero && zero.re < 0 && near({ re: -v, im: w }, zero, tol) && (poleMode === 'pair' || zero.im === 0)) { v = -zero.re; w = zero.im; } // snap onto the zero
      if (drag === 'p2') { $('p2').value = round3(v); render(false); return; }
      $('p').value = round3(v);
      if (poleMode === 'pair') $('pi').value = w === 0 ? 0 : round3(w);
      render(false);
      return;
    }
    let sigma = Math.max(-extent, Math.min((right - ox) / sc, (q.x - ox) / sc));
    let w = Math.min((oy - top) / sc, Math.abs(oy - q.y) / sc);
    if (w < 0.025 * extent) w = 0;                                   // snap onto the real axis
    if (w > 0 && Math.abs(sigma) < 0.025 * extent) sigma = 0;        // snap onto the jω axis
    if (w === 0 && Math.abs(sigma) < 0.01 * extent) sigma = (sigma < 0 ? -1 : 1) * 0.01 * extent; // never at the origin
    const pole = { re: -(+$('p').value), im: poleMode === 'pair' ? +$('pi').value : 0 };
    if (near({ re: sigma, im: w }, pole, tol)) { sigma = pole.re; w = pole.im; } // snap onto the pole
    $('zr').value = sigma === 0 ? 0 : round3(sigma);
    $('zi').value = w === 0 ? 0 : round3(w);
    render(false);
  });
  const end = () => { if (drag) { const was = drag; drag = null; if (was !== 'w') render(true); } };
  map.addEventListener('pointerup', end);
  map.addEventListener('pointercancel', end);

  document.querySelectorAll('#pz-norm button').forEach(b => b.addEventListener('click', () => { norm = b.dataset.norm === '1'; render(false); }));
  ['p', 'pi', 'p2', 'zr', 'zi', 'k'].forEach(id => $(id).addEventListener('input', () => render(true)));
  document.querySelectorAll('#pz-poles button').forEach(b => b.addEventListener('click', () => {
    poleMode = b.dataset.poles;
    if (poleMode === 'pair') { $('p').value = 500; $('pi').value = 2000; wt = 1000; }
    else if (poleMode === 'two') { $('p').value = 1000; $('p2').value = 10000; wt = 3000; }
    else { $('p').value = 1000; wt = 1000; }
    render(true);
  }));
  const ZERO = { lhp: [-4000, 0], rhp: [4000, 0], jw: [0, 3000], pair: [-1500, 5000] };
  document.querySelectorAll('#pz-zeros button').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.zero, zr = +$('zr').value, real = hasZero && +$('zi').value === 0 && zr !== 0;
    hasZero = kind !== 'none';
    // LHP ↔ RHP keeps the zero's size (and the poles and K₀), so the two are directly comparable
    if (real && (kind === 'lhp' || kind === 'rhp')) [$('zr').value, $('zi').value] = [(kind === 'lhp' ? -1 : 1) * Math.abs(zr), 0];
    else if (hasZero) [$('zr').value, $('zi').value] = ZERO[kind];
    render(true);
  }));
  Watermark.onChange(drawTest);
  render(true);
})();
