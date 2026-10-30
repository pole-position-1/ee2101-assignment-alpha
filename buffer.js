'use strict';
/*
 * Unity-gain buffer: the open-loop amplifier A(s) wired as a follower (V+ = Vin,
 * V− = Vout), so Vout = A(V+ − V−) and H_CL = A/(1 + A). Where |A| = 1 the
 * denominator is 1 + 1∠φu, which is zero at φu = −180°. A comes from a three-pole
 * model with a chosen phase at unity gain (Engine.bufferModel), the uncompensated
 * amplifier for the X, Y set below, or the live design from the compensation
 * section (window.AmpDesign).
 */
(function () {
  const $ = id => document.getElementById('bf-' + id);
  const { eng, num } = Plot;
  const TWO_PI = 2 * Math.PI, FU = 1e6, K0 = 100, TARGET = -135, STORE = 'ee2101-alpha-buffer-v1';
  const COL = { open: '#0f766e', closed: '#c2410c', vin: '#5b6578', unity: '#7c3aed', crit: '#dc2626', ink: '#1f2a3d', muted: '#5b6578', trail: '#b9c1cd', ok: '#059669' };
  const PRESETS = { 1: { mode: 'model', lag: 90 }, 2: { mode: 'model', lag: 135 }, 3: { mode: 'uncomp' }, 4: { mode: 'model', lag: 180 } };
  const STATUS = {
    single: 'Unconditionally Stable · No Overshoot', good: 'Stable & Well-Damped', ring: 'Ringing · below −135° target', severe: 'Severe Ringing / Peaking',
    osc: 'UNSTABLE OSCILLATOR!', grow: 'UNSTABLE OSCILLATOR!',
  };
  const state = { mode: 'model', lag: 135 };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

  const deg = p => p.toFixed(Math.abs(p - Math.round(p)) < 0.05 ? 0 : 1).replace('-', '−') + '°';
  const fix = (v, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
  const cplx = (re, im) => `${fix(re)} ${im < 0 && fix(im) !== '0.000' ? '−' : '+'} j${fix(Math.abs(im))}`;
  const hz = f => eng(f, 'Hz', 4);

  // ---------- open loop ----------
  function openLoop() {
    if (state.mode === 'model') return Engine.bufferModel(-state.lag, TWO_PI * FU, K0);
    if (!window.AmpDesign) return null;
    const p = state.mode === 'live' ? AmpDesign.params() : AmpDesign.uncompensated();
    return p ? Engine.ampLoop(p) : null;
  }

  // Unity-gain crossing (the worst one if there are several), the denominator
  // 1 + A there, and the closed-loop poles that decide what the step does.
  function analyse(A) {
    const ph = w => Engine.unwrappedPhase(A, A.zeros, A.poles, w);
    const cross = Engine.magCrossings(A, 1, 1, 1e14, 12000).map(w => ({ w, ph: ph(w) }));
    if (!cross.length) return null;
    const u = cross.reduce((a, b) => (b.ph < a.ph ? b : a));
    const Au = Engine.response(A, u.w), den = { re: 1 + Au.re, im: Au.im };
    const dmag = Math.hypot(den.re, den.im);
    const CL = Engine.unityFeedback(A), poles = Engine.polishedRoots(CL.d);
    const maxRe = Math.max(...poles.map(p => p.re)), tol = 1e-6 * u.w;
    const kind = maxRe > tol ? 'grow' : maxRe > -tol ? 'osc' : u.ph >= TARGET - 1e-9 ? 'good' : 180 + u.ph < 30 ? 'severe' : 'ring';
    // dominant pole: the one nearest the jω axis among the oscillatory ones
    const osc = poles.filter(p => p.im > 0);
    const dom = osc.length ? osc.reduce((a, b) => (b.re > a.re ? b : a)) : null;
    return { A, ph, cross, u, fu: u.w / TWO_PI, Au, den, dmag, CL, poles, maxRe, kind: kind === 'good' && !dom ? 'single' : kind, dom, final: Engine.dcGain(CL) };
  }

  // ---------- plots ----------
  const step = { t: [], y: [] };
  const stepPlot = new Plot($('step'), {
    xLabel: 't', yLabel: 'v (V)', xTick: t => eng(t, 's', 3),
    hover: t => step.t.length ? [`t = ${eng(t, 's', 4)}`, { text: `v_out = ${num(Plot.interp(step.t, step.y, t), 4)} V`, color: COL.closed }, { text: `v_in = ${t < 0 ? 0 : 1} V`, color: COL.vin }] : null,
  });
  let cur = null;
  const magPlot = new Plot($('mag'), {
    xLog: true, xLabel: 'f (Hz)', yLabel: '|H_CL(j2πf)|  (dB)', xTick: x => eng(x),
    hover: f => {
      if (!cur) return null;
      const w = TWO_PI * f, h = Engine.response(cur.CL, w).mag, o = Engine.response(cur.A, w).mag;
      return [`f = ${hz(f)}`, { text: `|H_CL| = ${num(h, 4)} V/V  (${num(20 * Math.log10(h), 4)} dB)`, color: COL.closed }, { text: `|A| = ${num(o, 4)} V/V  (${num(20 * Math.log10(o), 4)} dB)`, color: COL.open }];
    },
  });

  // Path of the closed-loop poles of the model as φu sweeps −90° → −195°, in units of ωu.
  const TRAIL = [];
  for (let lag = 90; lag <= 195.01; lag += 1.5) {
    const m = Engine.bufferModel(-lag, TWO_PI * FU, K0);
    Engine.polishedRoots(Engine.unityFeedback(m).d).forEach(p => TRAIL.push({ re: p.re / (TWO_PI * FU), im: p.im / (TWO_PI * FU) }));
  }

  // ---------- render ----------
  function render() {
    syncControls();
    schematic();
    const A = openLoop(), a = A && analyse(A);
    cur = a;
    if (!a) {
      const msg = !A ? 'Enter a valid Cc and Rz in Amplifier Compensation below.' : 'The gain never reaches 1, so there is no unity-gain frequency.';
      $('readout').innerHTML = `<div class="ro"><b>No unity-gain crossing</b><span>—</span><small>${msg}</small></div>`;
      $('step-stats').innerHTML = ''; $('poles').textContent = ''; $('mag-note').textContent = '';
      $('phasor').innerHTML = Watermark.svg(474, 244); $('splane').innerHTML = Watermark.svg(474, 264);
      stepPlot.clear(msg); magPlot.clear(msg);
      return;
    }
    if (state.mode !== 'model') $('lag').value = Math.min(195, Math.max(90, -a.u.ph));
    $('phi').textContent = `φᵤ = ${deg(a.u.ph)}`;
    readout(a);
    phasor(a);
    stepResponse(a);
    magnitude(a);
    splane(a);
  }

  function syncControls() {
    const live = state.mode === 'live';
    document.querySelectorAll('#bf-presets button').forEach(b => {
      const p = PRESETS[b.dataset.preset];
      b.classList.toggle('on', p.mode === state.mode && (p.mode !== 'model' || p.lag === state.lag));
    });
    $('live').classList.toggle('on', live);
    if (state.mode === 'model') $('lag').value = state.lag;
    $('slider').classList.toggle('measured', state.mode !== 'model');
    let src = `Three-pole model: K₀ = ${K0}, |A| = 1 at fᵤ = ${hz(FU)}`;
    if (state.mode !== 'model' && window.AmpDesign) {
      const d = AmpDesign.describe(live);
      src = live ? `Live design from below: ${d}. Edits below update this buffer.` : `Uncompensated amplifier with ${d} from below (C<sub>c</sub> off).`;
    }
    $('source').innerHTML = src;
  }

  function readout(a) {
    const box = (label, value, small, cls = '') => `<div class="ro ${cls}"><b>${label}</b><span>${value}</span>${small}</div>`;
    const { Au, den, dmag, kind } = a, zero = dmag < 1e-6;
    const h = zero ? '∞' : `${num(1 / dmag, 4)} V/V`, hdb = zero ? '∞ dB' : `${num(-20 * Math.log10(dmag), 4)} dB`;
    const unstable = kind === 'osc' || kind === 'grow';
    const good = kind === 'good' || kind === 'single';
    const why = kind === 'osc' ? 'poles on the jω axis: rings forever at fᵤ' : kind === 'grow' ? 'poles in the right half plane: oscillation grows'
      : kind === 'single' ? 'all closed-loop poles real: no ringing' : good ? `phase margin ${num(180 + a.u.ph, 3)}° ≥ 45°` : `phase margin only ${num(180 + a.u.ph, 3)}°`;
    const d = deg(a.u.ph);
    $('readout').innerHTML =
      box('Open-loop phasor A(jωᵤ) = 1∠φᵤ', `A(jωᵤ) = ${num(Math.hypot(Au.re, Au.im), 3)}∠${d}`,
        `<small>= cos(${d}) + j sin(${d})</small><small>= ${cplx(Au.re, Au.im)}</small><small>|A| = 1 (0 dB) at fᵤ = ${hz(a.fu)}, ωᵤ = 2πfᵤ</small>`) +
      box('Feedback denominator |1 + A(jωᵤ)|', zero ? '0.00' : num(dmag, 3),
        `<small>|1 + (${cplx(Au.re, Au.im)})|</small><small>= |${cplx(den.re, den.im)}|</small>${zero ? '<small><b>1 + A(jωᵤ) = 0: division by zero!</b></small>' : ''}`, zero ? 'crit' : dmag < 0.25 ? 'short' : '') +
      box('Closed-loop gain |H<sub>CL</sub>(jωᵤ)| = 1 / |1 + A(jωᵤ)|', `${h} · ${hdb}`,
        `<small>${zero ? 'infinite peaking at fᵤ' : 1 / dmag > 1.01 ? `peaks ${num(-20 * Math.log10(dmag), 3)} dB above the 0 dB passband` : 'no peaking above the 0 dB passband'}</small><em class="bf-badge ${unstable ? 'bad' : good ? 'good' : 'warn'}">${STATUS[kind]}</em><small>${why}</small>`,
        unstable ? 'crit' : good ? 'good' : 'short');
  }

  function stepResponse(a) {
    const fu = a.fu, stable = a.poles.filter(p => p.re < 0);
    let T;
    if (a.kind === 'grow') T = Math.min(12 / fu, Math.max(3 / fu, Math.log(40) / a.maxRe));
    else if (a.kind === 'osc') T = 10 / fu;
    else T = Math.min(40 / fu, Math.max(5 / fu, 4.6 / Math.min(...stable.map(p => -p.re))));
    let sim = null;
    for (let i = 0; i < 6 && !sim; i++) { try { sim = Engine.simulate(a.CL, { type: 'step', amp: 1 }, T); } catch (e) { T /= 2; } }
    if (!sim) { step.t = []; step.y = []; stepPlot.clear('The response grows too fast to plot.'); return; }
    step.t = sim.t; step.y = sim.y;
    let lo = Math.min(0, ...sim.y), hi = Math.max(1.1, ...sim.y);
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const hLines = a.kind === 'osc' || a.kind === 'grow' ? [] : [{ y: a.final, color: COL.open, dash: [3, 4], label: `final value K₀/(1 + K₀) = ${num(a.final, 4)} V` }];
    stepPlot.set({
      x: [sim.t[0], T], y: [lo, hi], hLines,
      series: [{ x: sim.t, y: sim.u, color: COL.vin, dash: [6, 4], width: 1.6 }, { x: sim.t, y: sim.y, color: COL.closed }],
    });

    const stat = (label, value, cls = '') => `<div class="stat ${cls}"><b>${label}</b><span>${value}</span></div>`;
    const d = a.dom, fd = d ? d.im / TWO_PI : 0;
    let html = stat('Unity-gain frequency fᵤ', hz(fu));
    if (a.kind === 'osc') html += stat('Sustained oscillation', `${hz(fd)} (= fᵤ), amplitude never decays`, 'warn');
    else if (a.kind === 'grow') html += stat('Envelope grows as e^(+σt)', `σ = ${fix(a.maxRe / a.u.w, 4)} ωᵤ`, 'warn') + stat('Doubles every', eng(Math.LN2 / a.maxRe, 's', 3), 'warn') + (d ? stat('Oscillates at', hz(fd)) : '');
    else {
      const peak = Math.max(...sim.y), os = Math.max(0, (peak / a.final - 1) * 100);
      html += stat('Final value', `${num(a.final, 4)} V`) + stat('Peak overshoot', `${num(os, 3)} %`, os > 40 ? 'warn' : '') +
        (d ? stat('Rings at', hz(fd)) + stat('Decay time constant', eng(-1 / d.re, 's', 3)) : stat('Ringing', 'none (real poles)', 'note'));
    }
    $('step-stats').innerHTML = html;
  }

  function magnitude(a) {
    const lo = 10 ** (Math.floor(Math.log10(a.fu)) - 3), hi = 10 ** (Math.ceil(Math.log10(a.fu)) + 2);
    const fs = Array.from({ length: 1500 }, (_, i) => lo * (hi / lo) ** (i / 1499)).concat(a.fu).sort((x, y) => x - y);
    const dB = m => (Number.isFinite(m) && m > 0 ? Math.min(400, 20 * Math.log10(m)) : 400);
    const cl = fs.map(f => dB(Engine.response(a.CL, TWO_PI * f).mag)), ol = fs.map(f => dB(Engine.response(a.A, TWO_PI * f).mag));
    const peak = a.dmag < 1e-6 ? Infinity : -20 * Math.log10(a.dmag);
    const top = Math.max(20, Math.ceil(Math.min(peak, 50) / 10) * 10 + 10);
    magPlot.set({
      x: [lo, hi], y: [-60, top], yStep: 20,
      series: [{ x: fs, y: ol, color: COL.open, dash: [6, 4], width: 1.6 }, { x: fs, y: cl, color: COL.closed }],
      hLines: [{ y: 0, color: COL.muted, dash: [3, 4], label: '0 dB' }],
      vLines: [{ x: a.fu, color: COL.unity, dash: [6, 4], label: `fᵤ = ${hz(a.fu)}` + (Number.isFinite(peak) && peak < top ? '' : '   |H_CL| → ∞'), row: 0 }],
      points: Number.isFinite(peak) && peak < top ? [{ x: a.fu, y: peak, color: COL.closed }] : [],
      arrows: Number.isFinite(peak) && peak < top ? [] : [{ x: a.fu, y0: top - 14, y1: top, color: COL.crit }],
    });
    $('mag-note').textContent = a.kind === 'grow' ? 'Unstable loop: there is no steady state, so |H_CL(jω)| is shown only as a formula.' : '';
  }

  // ---------- SVG drawings ----------
  const arrowDefs = cols => `<defs>${Object.entries(cols).map(([k, c]) => `<marker id="bf-ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c}"/></marker>`).join('')}</defs>`;
  const T_ = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" stroke="#fff" stroke-width="3" stroke-opacity=".85" paint-order="stroke" ${attrs}>${s}</text>`;
  const sub = (sym, s) => `<tspan font-style="italic">${sym}</tspan><tspan font-size="0.72em" dy="4">${s}</tspan><tspan dy="-4"> </tspan>`;

  // A(jωu) on the unit circle, the critical point −1 and the vector 1 + A = A − (−1).
  function phasor(a) {
    const ox = 300, oy = 122, k = 92, phi = a.u.ph * Math.PI / 180;
    const fx = ox + k * Math.cos(phi), fy = oy - k * Math.sin(phi), mx = ox - k;
    const zero = a.dmag < 1e-6, r = 28;
    const ax = ox + r * Math.cos(phi), ay = oy - r * Math.sin(phi), large = -a.u.ph > 180 ? 1 : 0;
    // label pushed outward from the chord's midpoint, along the line from the origin
    const cx = (mx + fx) / 2, cy = (oy + fy) / 2, cl = Math.hypot(cx - ox, cy - oy) || 1;
    const lx = cx + 24 * (cx - ox) / cl, ly = cy + 24 * (cy - oy) / cl + 4, la = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle';
    $('phasor').innerHTML = `${arrowDefs({ o: COL.open, c: COL.closed })}
      <g stroke="#d5dbe4" stroke-width="1.2"><path d="M150 ${oy}H470M${ox} 16V230"/></g>
      <circle cx="${ox}" cy="${oy}" r="${k}" fill="none" stroke="#b9c1cd" stroke-dasharray="4 4"/>
      <g font-family="system-ui, sans-serif" font-size="12" fill="${COL.muted}">
        ${T_(462, oy - 6, 'Re', 'text-anchor="end"')}${T_(ox + 6, 26, 'Im')}${T_(ox + k + 4, oy + 15, '+1')}
        ${T_(ox + k * 0.72, oy - k * 0.72 - 6, '|A| = 1', 'text-anchor="start"')}
      </g>
      <path d="M${ox + r} ${oy}A${r} ${r} 0 ${large} 1 ${ax} ${ay}" fill="none" stroke="${COL.unity}" stroke-width="1.6"/>
      ${T_(ox + 34, oy + (a.u.ph < -180 ? -30 : 36), `φᵤ = ${deg(a.u.ph)}`, `font-family="system-ui, sans-serif" font-size="12.5" font-weight="600" fill="${COL.unity}"`)}
      <line x1="${ox}" y1="${oy}" x2="${fx}" y2="${fy}" stroke="${COL.open}" stroke-width="2.6" marker-end="url(#bf-ar-o)"/>
      ${zero ? '' : `<line x1="${mx}" y1="${oy}" x2="${fx}" y2="${fy}" stroke="${COL.closed}" stroke-width="2.6" marker-end="url(#bf-ar-c)"/>`}
      <g stroke="${COL.crit}" stroke-width="2.6"><path d="M${mx - 7} ${oy - 7}l14 14M${mx - 7} ${oy + 7}l14 -14"/></g>
      ${zero ? `<circle cx="${mx}" cy="${oy}" r="13" fill="none" stroke="${COL.crit}" stroke-width="2"/>` : ''}
      <g font-family="system-ui, sans-serif" font-size="13" font-weight="600">
        ${T_(mx - 10, oy + (fy > oy ? -12 : 22), '−1', `text-anchor="end" fill="${COL.crit}"`)}
        ${T_(fx + (fx > ox ? 8 : -8), fy + (fy > oy ? 16 : -8), 'A(j2πfᵤ)', `text-anchor="${fx > ox ? 'start' : 'end'}" fill="${COL.open}"`)}
        ${zero ? T_(mx, oy + 34, 'A lands on −1: 1 + A = 0', `text-anchor="middle" fill="${COL.crit}"`) : T_(lx, ly, `|1 + A| = ${num(a.dmag, 3)}`, `text-anchor="${la}" fill="${COL.closed}"`)}
      </g>
      ${T_(10, 20, 'Phasor at fᵤ: 1 + A is the arrow from −1 to A', `font-family="system-ui, sans-serif" font-size="12.5" font-weight="600" fill="${COL.ink}"`)}
      ${Watermark.svg(474, 244)}`;
  }

  // Closed-loop poles (roots of 1 + A(s) = 0) in units of ωu, with the model's
  // pole path as φu sweeps, and the right half plane shaded.
  function splane(a) {
    const wu = a.u.w, ps = a.poles.map(p => ({ re: p.re / wu, im: p.im / wu }));
    const L = 34, R = 472, Tp = 22, B = 236;
    const near = ps.filter(p => Math.hypot(p.re, p.im) < 10);
    const xMin = -Math.max(2.4, Math.min(9, Math.max(0, ...near.map(p => -p.re * 1.15)))), xMax = 0.7;
    const yHalf = Math.max(1.4, ...near.map(p => Math.abs(p.im) * 1.15));
    const k = Math.min((R - L) / (xMax - xMin), (B - Tp) / (2 * yHalf)), ox = R - xMax * k, oy = (Tp + B) / 2;
    const X = re => ox + re * k, Y = im => oy - im * k;
    const cross = (p, c, s = 6) => `<path d="M${X(p.re) - s} ${Y(p.im) - s}l${2 * s} ${2 * s}M${X(p.re) - s} ${Y(p.im) + s}l${2 * s} ${-2 * s}" stroke="${c}" stroke-width="2.6"/>`;
    const trail = state.mode === 'model' ? TRAIL.filter(p => X(p.re) > L && X(p.re) < R && Math.abs(Y(p.im) - oy) < (B - Tp) / 2)
      .map(p => `<circle cx="${X(p.re).toFixed(1)}" cy="${Y(p.im).toFixed(1)}" r="1.6" fill="${COL.trail}"/>`).join('') : '';
    const inView = p => X(p.re) >= L && Math.abs(Y(p.im) - oy) <= (B - Tp) / 2;
    const off = ps.filter(p => !inView(p));
    const shown = ps.filter(inView).map(p => cross(p, p.re > 1e-6 ? COL.crit : Math.abs(p.re) <= 1e-6 ? COL.unity : COL.ink)).join('');
    const tick = (im, label) => `<path d="M${ox - 6} ${Y(im)}h12" stroke="${COL.unity}" stroke-width="2"/>${T_(ox + 9, Y(im) + 4, label, `fill="${COL.unity}" font-size="12" font-weight="600"`)}`;
    $('splane').innerHTML = `${arrowDefs({ k: COL.ink })}
      <rect x="${ox}" y="${Tp}" width="${R - ox}" height="${B - Tp}" fill="#fef2f2"/>
      ${T_(ox + 5, oy + 18, 'RHP', `text-anchor="start" font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" fill="#b91c1c"`)}
      <g stroke="#b9c1cd" stroke-width="1.2"><path d="M${L} ${oy}H${R}M${ox} ${Tp}V${B}"/></g>
      <path d="M${X(-1)} ${oy - 5}v10" stroke="#b9c1cd" stroke-width="1.2"/>
      ${trail}
      <g font-family="system-ui, sans-serif">
        ${tick(1, '+jωᵤ')}${tick(-1, '−jωᵤ')}
        ${T_(X(-1), oy + 17, '−ωᵤ', `text-anchor="middle" font-size="11.5" fill="${COL.muted}"`)}
        ${T_(ox + 5, oy + 32, 'unstable', `font-family="system-ui, sans-serif" font-size="11.5" font-weight="600" fill="#b91c1c"`)}
        ${T_(R - 4, oy - 6, 'σ', `text-anchor="end" font-size="13" font-style="italic" fill="${COL.muted}"`)}
        ${T_(ox - 6, Tp + 12, 'jω', `text-anchor="end" font-size="13" font-style="italic" fill="${COL.muted}"`)}
        ${off.length ? `<line x1="${L + 34}" y1="${oy + 22}" x2="${L + 4}" y2="${oy + 22}" stroke="${COL.ink}" stroke-width="1.6" marker-end="url(#bf-ar-k)"/>${T_(L + 38, oy + 26, `${off.length} pole${off.length > 1 ? 's' : ''} off scale`, `font-size="11.5" fill="${COL.ink}"`)}` : ''}
        ${state.mode === 'model' ? T_(L + 2, B + 18, '· · · path of these poles as φᵤ sweeps −90° → −195°', `font-size="11.5" fill="${COL.muted}"`) : ''}
      </g>
      ${shown}
      ${T_(L, 14, 'Closed-loop poles: roots of 1 + A(s) = 0  (axes in units of ωᵤ = 2πfᵤ)', `font-family="system-ui, sans-serif" font-size="12.5" font-weight="600" fill="${COL.ink}"`)}
      ${Watermark.svg(474, 264)}`;
    // a real part below 10⁻⁶ of the pole's size is rounding: show it as exactly 0
    const uniq = a.poles.filter(p => p.im >= 0).map(p => (Math.abs(p.re) < 1e-6 * Math.hypot(p.re, p.im) ? { ...p, re: 0 } : p));
    $('poles').innerHTML = uniq.map(p => `s = ${eng(p.re, '', 4)}${p.im ? ` ± j${eng(p.im, '', 4)}` : ''} rad/s  <small>(${fix(p.re / wu, 3)}${p.im ? ` ± j${fix(p.im / wu, 3)}` : ''} ωᵤ)</small>`).join('<br>');
  }

  function schematic() {
    const ink = COL.ink, fb = COL.unity;
    $('schem').innerHTML = `
      <g fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M222 40L472 150L222 260Z"/>
        <path d="M90 214V205H222M90 256V272M74 272H106M80 279H100M86 286H94"/>
        <circle cx="90" cy="235" r="21"/><path d="M90 225v20M80 235h20"/>
        <path d="M472 150H572"/>
      </g>
      <g fill="none" stroke="${fb}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M532 150V16H172V95H222"/>
      </g>
      <circle cx="532" cy="150" r="4.5" fill="${ink}"/><circle cx="572" cy="150" r="4" fill="#fff" stroke="${ink}" stroke-width="2"/>
      <g font-family="KaTeX_Main, 'Times New Roman', serif" font-size="20" fill="${ink}">
        <text x="236" y="102" font-size="24">−</text><text x="234" y="213" font-size="22">+</text>
        <text x="6" y="270" font-size="18">${sub('V', 'in')}(<tspan font-style="italic">s</tspan>)</text>
        <text x="122" y="196" font-size="17">${sub('V', '+')}= ${sub('V', 'in')}</text>
        <text x="580" y="140">${sub('V', 'out')}</text><text x="580" y="164">(<tspan font-style="italic">s</tspan>)</text>
        <text x="258" y="158" font-size="17">${sub('V', 'out')}= <tspan font-style="italic">A</tspan>(<tspan font-style="italic">s</tspan>)(${sub('V', '+')}− <tspan font-style="italic">V</tspan><tspan font-size="0.72em" dy="4">−</tspan><tspan dy="-4">)</tspan></text>
        <text x="352" y="36" font-size="17" text-anchor="middle" fill="${fb}">${sub('V', '−')}= ${sub('V', 'out')}  (unity feedback)</text>
      </g>
      ${Watermark.svg(634, 294)}`;
  }

  // ---------- events ----------
  const set = patch => { Object.assign(state, patch); save(); render(); };
  document.querySelectorAll('#bf-presets button').forEach(b => b.addEventListener('click', () => set({ ...PRESETS[b.dataset.preset] })));
  $('lag').addEventListener('input', () => set({ mode: 'model', lag: +$('lag').value }));
  $('live').addEventListener('click', () => set({ mode: 'live' }));
  if (window.AmpDesign) AmpDesign.onChange(() => { if (state.mode !== 'model') render(); });
  Watermark.onChange(() => { schematic(); if (cur) { phasor(cur); splane(cur); } });
  katex.render('\\text{Closed-loop gain: }H_{CL}(s)=\\frac{V_{out}(s)}{V_{in}(s)}=\\frac{A(s)}{1+A(s)}', $('eq'), { displayMode: true, throwOnError: false });
  render();
})();
