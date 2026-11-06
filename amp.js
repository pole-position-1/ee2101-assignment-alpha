'use strict';
/*
 * Amplifier compensation: a two-node amplifier (R1, C1 at V1; gm·V1, R2, C2 at V2,
 * with gm and R2 set by the student) and an optional Cc + Rz branch from V1 to V2.
 * The plots show the
 * open-loop gain A(s) = −V2/Vs from Engine.ampLoop, which documents the
 * test convention. Target: phase −135° or higher wherever |A| = 1.
 */
(function () {
  const $ = id => document.getElementById('am-' + id);
  const { eng, num } = Plot;
  const TWO_PI = 2 * Math.PI, TARGET = -135, STORE = 'ee2101-alpha-amp-v1';
  const COL = { curve: '#0f766e', unity: '#7c3aed', target: '#c2410c', ref: '#6b7486', comp: '#c2410c', off: '#b9c1cd', ink: '#1f2a3d', pole: '#dc2626', zero: '#059669' };
  const FIXED = { C1: 100e-12, C2: 10e-12 };
  const COMP = { gm: '1', R2: '100', on: false, Cc: '10', Rz: '0', RzUnit: '1' };
  const state = { X: 0, ...COMP, trials: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE)) || {};
    // saved before g_m and R2 became editable: g_m was Y mS, R2 was 100 kΩ
    if (saved.Y && !saved.gm) saved.gm = String(saved.Y);
    delete saved.Y;
    (saved.trials || []).forEach(t => { t.xy = t.xy.replace(/^(\d), (\d)$/, '$1, $2 mS, 100 kΩ'); });
    Object.assign(state, saved);
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  // 5 significant figures in scientific form, e.g. −7.7294 × 10⁴
  function sci(v, sign = false) {
    if (v === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(v))), m = (Math.abs(v) / 10 ** e).toFixed(4);
    if (+m >= 10) { e += 1; m = (Math.abs(v) / 10 ** e).toFixed(4); }
    return (v < 0 ? '−' : sign ? '+' : '') + m + ' × 10' + String(e).split('').map(c => SUP[c]).join('');
  }
  // One decimal place, or two when one would hide which side of −135° it is on
  const deg = p => { let s = p.toFixed(1); if ((+s >= TARGET) !== (p >= TARGET)) s = p.toFixed(2); return s.replace('-', '−') + '°'; };
  const hz = f => eng(f, 'Hz', 5);

  // ---------- inputs ----------
  for (let i = 0; i <= 9; i++) $('x').add(new Option(i, i));
  // Leave the box being typed in alone: rewriting it would eat a trailing "0." or "1e"
  const put = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
  function syncInputs() {
    $('x').value = state.X; $('rz-unit').value = state.RzUnit;
    put('gm', state.gm); put('r2', state.R2); put('cc', state.Cc); put('rz', state.Rz);
    document.querySelectorAll('#am-on button').forEach(b => b.classList.toggle('on', (b.dataset.on === '1') === state.on));
  }
  function params() {
    const Cc = parseFloat(state.Cc), Rz = parseFloat(state.Rz) * +state.RzUnit, base = uncompensated();
    const ok = { gm: parseFloat(state.gm) > 0, r2: parseFloat(state.R2) > 0, cc: !state.on || (state.Cc !== '' && Cc >= 0), rz: !state.on || (state.Rz !== '' && Rz >= 0) };
    Object.keys(ok).forEach(k => $(k).classList.toggle('bad', !ok[k]));
    if (!base || !ok.cc || !ok.rz) return null;
    return { ...base, Cc: state.on ? Cc * 1e-12 : 0, Rz: state.on ? Rz : 0 };
  }

  // ---------- analysis ----------
  function analyse(p) {
    const a = Engine.ampLoop(p);
    const ph = w => Engine.unwrappedPhase(a, a.zeros, a.poles, w);
    const cross = Engine.magCrossings(a, 1, 1, 1e14, 12000).map(w => ({ w, f: w / TWO_PI, ph: ph(w) }));
    return { ...a, ph, cross, meets: cross.length > 0 && cross.every(c => c.ph >= TARGET) };
  }

  const hover = f => {
    if (!cur) return null;
    const w = TWO_PI * f, r = Engine.response(cur.a, w);
    return [`f = ${hz(f)}   (ω = 2πf = ${eng(w, 'rad/s', 4)})`, { text: `|A| = ${num(r.mag)} V/V  (${num(20 * Math.log10(r.mag), 4)} dB)`, color: COL.curve }, { text: `∠A = ${num(cur.a.ph(w), 4)}°`, color: COL.curve }];
  };
  const opts = { xLog: true, xLabel: 'f (Hz)      ω = 2πf', hover, xTick: x => eng(x) };
  const magPlot = new Plot($('mag'), { ...opts, yLabel: '|A(j2πf)|  (dB)' });
  const phasePlot = new Plot($('phase'), { ...opts, yLabel: '∠A(j2πf)  (°)' });
  let cur = null;

  // The Op-Amp Buffer tab reads this design and follows its edits.
  const listeners = [];
  // null until g_m and R2 are both positive numbers
  function uncompensated() {
    const gm = parseFloat(state.gm) * 1e-3, R2 = parseFloat(state.R2) * 1e3;
    return gm > 0 && R2 > 0 ? { R1: (10 + +state.X) * 1e3, gm, R2, ...FIXED } : null;
  }
  const designText = () => `X = ${state.X}, g<sub>m</sub> = ${state.gm} mS, R<sub>2</sub> = ${state.R2} kΩ`;
  window.AmpDesign = {
    params: () => cur && cur.p, uncompensated, onChange: fn => listeners.push(fn),
    describe: live => designText() + (live && cur && cur.p.Cc ? `, C<sub>c</sub> = ${num(cur.p.Cc * 1e12, 4)} pF, R<sub>z</sub> = ${eng(cur.p.Rz, 'Ω', 4)}` : live ? ', C<sub>c</sub> off' : ''),
  };
  function render() { draw(); listeners.forEach(fn => fn()); }

  function draw() {
    syncInputs();
    document.querySelectorAll('#amp .comp').forEach(el => el.classList.toggle('off', !state.on));
    $('cc').disabled = $('rz').disabled = $('rz-unit').disabled = !state.on;
    document.querySelectorAll('[data-cc]').forEach(b => { b.disabled = !state.on; b.classList.toggle('on', state.on && +state.Cc === +b.dataset.cc); });
    const p = params();
    schematic(p);
    if (!p) {
      cur = null;
      $('readout').innerHTML = '<div class="stat warn"><span>Enter g<sub>m</sub> and R<sub>2</sub> as numbers &gt; 0, and C<sub>c</sub> and R<sub>z</sub> as numbers ≥ 0.</span></div>';
      $('roots').innerHTML = '';
      magPlot.clear('Enter valid values'); phasePlot.clear('Enter valid values');
      return;
    }
    const a = analyse(p);
    cur = { p, a };
    fixedValues(p, a);
    readout(a);
    rootList(a);
    plots(a);
  }

  function fixedValues(p, a) {
    const stat = (label, value) => `<div class="stat"><b>${label}</b><span>${value}</span></div>`;
    $('fixed').innerHTML = stat('R<sub>1</sub> = (10 + X) kΩ', eng(p.R1, 'Ω', 4)) + stat('g<sub>m</sub>', eng(p.gm, 'S', 4)) +
      stat('R<sub>2</sub>', eng(p.R2, 'Ω', 4)) + stat('C<sub>1</sub>', eng(p.C1, 'F', 4)) + stat('C<sub>2</sub>', eng(p.C2, 'F', 4)) +
      stat('Low-frequency gain', `${num(a.k0, 4)} V/V (${num(20 * Math.log10(a.k0), 4)} dB)`);
  }

  function readout(a) {
    const box = (label, value, small = '', cls = '') => `<div class="ro ${cls}"><b>${label}</b><span>${value}</span>${small ? `<small>${small}</small>` : ''}</div>`;
    if (!a.cross.length) {
      $('readout').innerHTML = box('Gain = 1 at', 'Never', 'the gain does not reach 1 (0 dB)') + box('Phase there', '—') + box('Target', 'No unity-gain crossing', '', 'neutral');
      return;
    }
    const many = a.cross.length > 1;
    const fs = a.cross.map((c, i) => (many ? `${i + 1}: ` : '') + hz(c.f)).join('<br>');
    const ws = a.cross.map(c => `ω = ${eng(c.w, 'rad/s', 4)}`).join(' · ');
    const phs = a.cross.map((c, i) => (many ? `${i + 1}: ` : '') + deg(c.ph)).join('<br>');
    const worst = Math.min(...a.cross.map(c => c.ph)), margin = worst - TARGET;
    $('readout').innerHTML = box('Gain = 1 at', fs, ws + (many ? ` · ${a.cross.length} crossings` : '')) +
      box('Phase there', phs, 'target: −135° or higher') +
      box('Target', a.meets ? 'Meets target' : 'Below target', a.meets ? `${margin.toFixed(1)}° above −135°` : `${Math.max(-margin, 0.05).toFixed(1)}° short of −135°`, a.meets ? 'good' : 'short');
  }

  function rootList(a) {
    const one = (r, sign) => r.im ? `${sci(r.re, sign)} ± j${sci(Math.abs(r.im))}` : sci(r.re, sign);
    const uniq = rs => rs.filter((r, i) => !(r.im < 0 && rs.some((q, j) => j !== i && q.re === r.re && q.im === -r.im)));
    const poles = uniq(a.poles).map((r, i) => `<li><b class="c-pole">p${'₁₂₃₄'[i]}</b> = ${one(r)}</li>`).join('');
    const zeros = a.zeros.length
      ? uniq(a.zeros).map(r => `<li><b class="c-zero">z</b> = ${one(r, true)} <small>${r.re > 0 ? '(right half plane)' : r.re < 0 ? '(left half plane)' : ''}</small></li>`).join('')
      : '<li>No finite zero.</li>';
    $('roots').innerHTML = `<div><h3>Poles <small>(rad/s)</small></h3><ul>${poles}</ul></div><div><h3>Zero <small>(rad/s)</small></h3><ul>${zeros}</ul></div>`;
  }

  function plots(a) {
    // Frequency range: a decade beyond the lowest and highest finite root or crossing
    const mags = [...a.poles, ...a.zeros].map(r => Math.hypot(r.re, r.im)).concat(a.cross.map(c => c.w)).filter(v => v > 0 && Number.isFinite(v));
    let lo = 10 ** (Math.floor(Math.log10(Math.min(...mags) / TWO_PI)) - 1);
    let hi = 10 ** (Math.ceil(Math.log10(Math.max(...mags) / TWO_PI)) + 1);
    const fx = a.cross.length ? Math.max(...a.cross.map(c => c.f)) : 0;
    hi = Math.min(hi, Math.max(lo * 1e8, 10 ** Math.ceil(Math.log10(fx * 10 || 1))));
    const fs = Array.from({ length: 1400 }, (_, i) => lo * (hi / lo) ** (i / 1399));
    const db = fs.map(f => 20 * Math.log10(Engine.response(a, TWO_PI * f).mag)), ph = fs.map(f => a.ph(TWO_PI * f));

    let ymax = Math.ceil((Math.max(...db) + 10) / 20) * 20, ymin = Math.floor(Math.max(ymax - 160, Math.min(...db, -20)) / 20) * 20;
    let pmin = Math.floor(Math.min(...ph, -180) / 45 - 1e-9) * 45, pmax = Math.max(45, Math.ceil(Math.max(...ph) / 45 + 1e-9) * 45);
    if (pmin === -180) pmin = -225;
    const marks = a.cross.map((c, i) => ({ x: c.f, color: COL.unity, dash: [6, 4], label: a.cross.length > 1 ? `gain = 1 (${i + 1})` : 'gain = 1', row: i }));
    magPlot.set({ x: [lo, hi], y: [ymin, ymax], yStep: 20, series: [{ x: fs, y: db, color: COL.curve }],
      hLines: [{ y: 0, color: COL.unity, dash: [6, 4], label: '0 dB (gain = 1)' }], vLines: marks,
      points: a.cross.map(c => ({ x: c.f, y: 0, color: COL.unity })) });
    phasePlot.set({ x: [lo, hi], y: [pmin, pmax], yStep: pmax - pmin > 360 ? 90 : 45, series: [{ x: fs, y: ph, color: COL.curve }],
      hLines: [{ y: TARGET, color: COL.target, dash: [6, 4], label: '−135° target' }, { y: -180, color: COL.ref, dash: [3, 4], label: '−180°' }],
      vLines: marks.map(m => ({ ...m, label: '', bottom: true })),
      points: a.cross.map(c => ({ x: c.f, y: c.ph, color: c.ph >= TARGET ? COL.zero : COL.target })) });
  }

  // ---------- schematic ----------
  function schematic(p) {
    const on = state.on, cc = on ? COL.comp : COL.off;
    const lab = (sym, sub, val, x, y, color = COL.ink, anchor = 'start') =>
      `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}"><tspan font-style="italic">${sym}</tspan><tspan font-size="14" dy="5">${sub}</tspan><tspan dy="-5">${val ? ' = ' + val : ''}</tspan></text>`;
    // name above value, for the vertical parts
    const stack = (sym, sub, val, x, y, anchor = 'start') => lab(sym, sub, '', x, y, COL.ink, anchor) +
      `<text x="${x}" y="${y + 23}" text-anchor="${anchor}" fill="#5b6578" font-size="17">${val}</text>`;
    const R1 = (10 + +state.X) * 1e3;
    const gmText = parseFloat(state.gm) > 0 ? eng(parseFloat(state.gm) * 1e-3, 'S', 4) : '?';
    const r2Text = parseFloat(state.R2) > 0 ? eng(parseFloat(state.R2) * 1e3, 'Ω', 4) : '?';
    const ccText = on ? (state.Cc === '' ? '?' : num(+state.Cc, 4) + ' pF') : '';
    const rzVal = parseFloat(state.Rz) * +state.RzUnit, rzText = on ? (Number.isFinite(rzVal) ? eng(rzVal, 'Ω', 4) : '?') : '';
    $('schem').innerHTML = `
      <g fill="none" stroke="${COL.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M46 177V160H80l5 -8l10 16l10 -16l10 16l10 -16l10 16l5 -8H230M46 215V246H710M230 160V200M230 210V246"/>
        <path d="M212 200H248M212 210H248"/>
        <circle cx="46" cy="196" r="19"/><path d="M36 196q5 -10 10 0t10 0"/>
        <path d="M490 160H710M490 160V183M490 223V246"/>
        <path d="M490 183L510 203L490 223L470 203Z"/><path d="M490 191V213M485 207l5 7l5 -7"/>
        <path d="M600 160V176l9 5l-18 10l18 10l-18 10l18 10l-9 5V246"/>
        <path d="M710 160V198M710 208V246M692 198H728M692 208H728"/>
      </g>
      <g fill="none" stroke="${cc}" stroke-width="${on ? 2.6 : 2.2}" stroke-linecap="round" stroke-linejoin="round" ${on ? '' : 'stroke-dasharray="5 5"'}>
        <path d="M230 160V70H252M${on ? '252 70H280' : '252 70L277 55'}M280 70H306M306 57V83M316 57V83M316 70H380l5 -8l10 16l10 -16l10 16l10 -16l10 16l5 -8H490V160"/>
      </g>
      <circle cx="252" cy="70" r="3.2" fill="#fff" stroke="${cc}" stroke-width="2"/><circle cx="280" cy="70" r="3.2" fill="#fff" stroke="${cc}" stroke-width="2"/>
      <circle cx="230" cy="160" r="4.5" fill="${COL.ink}"/><circle cx="490" cy="160" r="4.5" fill="${COL.ink}"/>
      <g font-family="KaTeX_Main, 'Times New Roman', serif" font-size="20">
        ${lab('V', 's', '', 74, 203)}
        ${lab('R', '1', eng(R1, 'Ω', 4), 115, 138, COL.ink, 'middle')}
        ${lab('V', '1', '', 220, 150, COL.ink, 'end')}
        ${lab('V', '2', '', 502, 150)}
        ${stack('C', '1', '100 pF', 256, 200)}
        <text x="462" y="200" text-anchor="end" fill="${COL.ink}"><tspan font-style="italic">g</tspan><tspan font-size="14" dy="5">m</tspan><tspan dy="-5" font-style="italic">V</tspan><tspan font-size="14" dy="5">1</tspan></text>
        <text x="462" y="223" text-anchor="end" fill="#5b6578" font-size="17">${gmText}</text>
        ${stack('R', '2', r2Text, 618, 200)}
        ${stack('C', '2', '10 pF', 736, 200)}
        <g font-size="18">${lab('C', 'c', ccText, 311, 42, cc, 'middle')}${lab('R', 'z', rzText, 415, 42, cc, 'middle')}</g>
        <text x="266" y="98" text-anchor="middle" font-size="14" fill="${cc}">${on ? 'on' : 'off'}</text>
      </g>
      ${Watermark.svg(784, 276)}`;
  }

  // ---------- trials ----------
  function trials() {
    const rows = state.trials.map((t, i) => `<tr><td>${i + 1}</td><td>${t.xy}</td><td>${t.cc}</td><td>${t.rz}</td><td>${t.f}</td><td>${t.ph}</td><td class="${t.ok ? 'ok' : t.none ? '' : 'short'}">${t.status}</td></tr>`).join('');
    $('trials').innerHTML = rows || '<tr><td colspan="7" class="empty">No trials saved yet. Each saved row records the values shown above.</td></tr>';
    $('clear').disabled = !state.trials.length;
  }
  $('save').addEventListener('click', () => {
    if (!cur) return;
    const { p, a } = cur, none = !a.cross.length;
    state.trials.push({
      xy: `${state.X}, ${eng(p.gm, 'S', 4)}, ${eng(p.R2, 'Ω', 4)}`, cc: p.Cc ? num(p.Cc * 1e12, 4) + ' pF' : 'off', rz: p.Cc ? eng(p.Rz, 'Ω', 4) : '—',
      f: none ? 'none' : a.cross.map(c => hz(c.f)).join(', '), ph: none ? '—' : a.cross.map(c => deg(c.ph)).join(', '),
      status: none ? 'No unity-gain crossing' : a.meets ? 'Meets target' : 'Below target', ok: a.meets, none,
    });
    save(); trials();
  });
  $('clear').addEventListener('click', () => { state.trials = []; save(); trials(); });

  // ---------- events ----------
  const set = (k, v) => { state[k] = v; save(); render(); };
  $('x').addEventListener('change', () => set('X', +$('x').value));
  $('gm').addEventListener('input', () => set('gm', $('gm').value));
  $('r2').addEventListener('input', () => set('R2', $('r2').value));
  $('cc').addEventListener('input', () => set('Cc', $('cc').value));
  $('rz').addEventListener('input', () => set('Rz', $('rz').value));
  $('rz-unit').addEventListener('change', () => set('RzUnit', $('rz-unit').value));
  document.querySelectorAll('#am-on button').forEach(b => b.addEventListener('click', () => set('on', b.dataset.on === '1')));
  document.querySelectorAll('[data-cc]').forEach(b => b.addEventListener('click', () => set('Cc', b.dataset.cc)));
  $('reset').addEventListener('click', () => { Object.assign(state, COMP); save(); render(); });
  Watermark.onChange(() => schematic(cur && cur.p));
  render(); trials();
})();
