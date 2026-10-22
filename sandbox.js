'use strict';
/* Section 2: two-branch divider sandbox, Bode plot and causal signal generator. */
(function () {
  const $ = id => document.getElementById('sb-' + id);
  const { eng, num, interp } = Plot;
  const TWO_PI = 2 * Math.PI, DB3 = 10 * Math.log10(2);
  const COLORS = { in: '#0f766e', out: '#c2410c', test: '#7c3aed', cut: '#c2410c' };
  const UNITS = {
    R: [['Ω', 1], ['kΩ', 1e3], ['MΩ', 1e6]],
    C: [['pF', 1e-12], ['nF', 1e-9], ['µF', 1e-6], ['F', 1]],
    L: [['µH', 1e-6], ['mH', 1e-3], ['H', 1]],
  };
  const NEW_PART = { R: ['10', 1e3], C: ['100', 1e-9], L: ['10', 1e-3] };
  const MAX_PARTS = 3, STORE = 'ee2101-alpha-sandbox-v1';
  const part = (type, val, mult) => ({ type, val: String(val), mult });
  const PRESETS = {
    fig1: () => ({
      branches: [{ mode: 'series', items: [part('R', 10, 1e3)] }, { mode: 'parallel', items: [part('R', 10, 1e3), part('C', 100, 1e-9)] }],
      unit: 'rad', gen: { type: 'step', amp: 1, w: null, auto: true, win: null }, x10: false,
    }),
    fig2: () => ({
      branches: [{ mode: 'parallel', items: [part('R', 9, 1e6), part('C', 2, 1e-12)] }, { mode: 'parallel', items: [part('R', 1, 1e6), part('C', 90, 1e-12)] }],
      unit: 'hz', gen: { type: 'square', amp: 1, w: TWO_PI * 1e5, auto: true, win: null }, x10: true,
    }),
    empty: () => ({
      branches: [{ mode: 'series', items: [] }, { mode: 'series', items: [] }],
      unit: state.unit, gen: { ...state.gen, auto: true }, x10: false,
    }),
  };

  let state;
  try { state = JSON.parse(localStorage.getItem(STORE)); } catch (e) { state = null; }
  if (!state || !state.branches || !state.gen) state = PRESETS.fig1();
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };
  const factor = () => (state.unit === 'hz' ? TWO_PI : 1);   // ω = factor × displayed frequency
  const fUnit = () => (state.unit === 'hz' ? 'Hz' : 'rad/s');
  const fSym = () => (state.unit === 'hz' ? 'f' : 'ω');

  let current = null; // { m, poles, zeros, K0, ref, cut, range }

  // ---------- number formatting for TeX ----------
  const texNum = v => {
    if (v === 0 || Math.abs(v) < 1e-12) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return String(Number(v.toPrecision(4)));
    const [m, e] = v.toExponential(3).split('e');
    return Number(m) + '\\times10^{' + Number(e) + '}';
  };

  // ---------- branch editors ----------
  function names() { // R₁, R₂, C₁ … numbered by type, Z₁ first
    const count = { R: 0, C: 0, L: 0 }, sub = '₀₁₂₃₄₅₆₇₈₉';
    return state.branches.map(b => b.items.map(it => it.type + String(++count[it.type]).replace(/\d/g, d => sub[d])));
  }
  function buildBranches() {
    document.querySelectorAll('.branch').forEach(el => {
      const b = state.branches[el.dataset.branch - 1], rows = el.querySelector('.rows');
      el.querySelectorAll('[data-mode]').forEach(btn => btn.classList.toggle('on', btn.dataset.mode === b.mode));
      el.querySelectorAll('[data-add]').forEach(btn => { btn.disabled = b.items.length >= MAX_PARTS; });
      rows.innerHTML = b.items.length ? '' : '<div class="empty">No components yet. Add at least one.</div>';
      b.items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span class="tag"></span><input type="number" min="0" step="any" inputmode="decimal" aria-label="Value"><select aria-label="Unit">${UNITS[it.type].map(([u, m]) => `<option value="${m}">${u}</option>`).join('')}</select><button type="button" class="x" title="Remove" aria-label="Remove">×</button>`;
        const [input, select, del] = [row.querySelector('input'), row.querySelector('select'), row.querySelector('.x')];
        input.value = it.val; select.value = String(it.mult);
        input.addEventListener('input', () => { it.val = input.value; update(); });
        select.addEventListener('change', () => { it.mult = +select.value; update(); });
        del.addEventListener('click', () => { b.items.splice(i, 1); buildBranches(); update(); });
        rows.append(row);
      });
    });
  }
  document.querySelectorAll('.branch').forEach(el => {
    const b = () => state.branches[el.dataset.branch - 1];
    el.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { b().mode = btn.dataset.mode; buildBranches(); update(); }));
    el.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
      const t = btn.dataset.add;
      b().items.push(part(t, NEW_PART[t][0], NEW_PART[t][1]));
      buildBranches(); update();
      const inputs = el.querySelectorAll('.row input'); inputs[inputs.length - 1].select();
    }));
  });

  // "R₁" -> ['R', '1'] so names can be typeset with a real subscript
  const splitName = n => [n[0], n.slice(1).replace(/[₀-₉]/g, d => String(d.charCodeAt(0) - 0x2080))];
  const svgName = n => { const [a, b] = splitName(n); return `<tspan class="nm">${a}</tspan><tspan class="sb" dy="4">${b}</tspan><tspan dy="-4"> </tspan>`; };

  // ---------- schematic ----------
  function schematic(nm) {
    const y0 = 62, yg = 252, srcX = 70, z1a = 130, z1b = 370, node = 440, out = 735;
    const [b1, b2] = state.branches;
    const label = (it) => `${it.val || '?'} ${UNITS[it.type].find(u => u[1] === it.mult)?.[0] || ''}`;
    const SYM = {
      R: 'M-25 0H-22L-18.3 -7L-11 7L-3.7 -7L3.7 7L11 -7L18.3 7L22 0H25',
      C: 'M-25 0H-5M5 0H25M-5 -13V13M5 -13V13',
      L: 'M-25 0H-22a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0a5.5 5.5 0 0 1 11 0H25',
    };
    const sym = (it, name, x, y, vertical) =>
      `<g transform="translate(${x} ${y})${vertical ? ' rotate(90)' : ''}"><rect x="-24" y="-15" width="48" height="30" fill="#fff" stroke="none"/><path d="${SYM[it.type]}" fill="none"/></g>` +
      (vertical
        ? `<text x="${x + 18}" y="${y - 4}" class="lbl">${svgName(name)}</text><text x="${x + 18}" y="${y + 18}" class="lbl">${label(it)}</text>`
        : `<text x="${x}" y="${y - 20}" text-anchor="middle" class="lbl">${svgName(name)}${label(it)}</text>`);
    const line = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}"/>`;
    const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" class="dot"/>`;
    let w = '', parts = '';

    // Z1 between z1a and z1b on the top rail
    const k1 = b1.items.length, par1 = b1.mode === 'parallel' && k1 > 1;
    let z1Bottom = y0 + 20;
    if (!k1) w += line(z1a, y0, z1b, y0) + `<text x="${(z1a + z1b) / 2}" y="${y0 - 10}" text-anchor="middle" class="missing">add Z₁ parts</text>`;
    else if (!par1) {
      w += line(z1a, y0, z1b, y0);
      b1.items.forEach((it, i) => { parts += sym(it, nm[0][i], z1a + (i + 0.5) * (z1b - z1a) / k1, y0, false); });
    } else {
      const xa = z1a + 30, xb = z1b - 30, yl = y0 + (k1 - 1) * 55;
      w += line(z1a, y0, xa, y0) + line(xb, y0, z1b, y0) + line(xa, y0, xa, yl) + line(xb, y0, xb, yl);
      b1.items.forEach((it, i) => {
        const y = y0 + i * 55;
        w += line(xa, y, xb, y);
        parts += sym(it, nm[0][i], (xa + xb) / 2, y, false);
        if (i < k1 - 1) parts += dot(xa, y) + dot(xb, y);
      });
      z1Bottom = yl + 20;
    }
    // Z2 hanging from the output node to ground
    const k2 = b2.items.length, par2 = b2.mode === 'parallel' && k2 > 1;
    let z2Right = node + 100;
    if (!k2) parts += `<text x="${node + 12}" y="${(y0 + yg) / 2}" class="missing">add Z₂ parts</text>`;
    else if (!par2) {
      w += line(node, y0, node, yg);
      b2.items.forEach((it, i) => { parts += sym(it, nm[1][i], node, y0 + (i + 0.5) * (yg - y0) / k2, true); });
    } else {
      b2.items.forEach((it, i) => {
        const x = node + i * 100;
        w += line(x, y0, x, yg);
        parts += sym(it, nm[1][i], x, (y0 + yg) / 2, true);
        if (i) parts += dot(x, y0) + dot(x, yg);
      });
      z2Right = node + (k2 - 1) * 100 + 100;
    }
    // source, rails, ground, terminals
    const cy = (y0 + yg) / 2;
    w += line(srcX, y0, z1a, y0) + line(z1b, y0, out, y0) + line(srcX, yg, out, yg) +
      line(srcX, y0, srcX, cy - 20) + line(srcX, cy + 20, srcX, yg) + line(250, yg, 250, yg + 12) +
      line(238, yg + 12, 262, yg + 12) + line(242, yg + 17, 258, yg + 17) + line(246, yg + 22, 254, yg + 22);
    const src = `<circle cx="${srcX}" cy="${cy}" r="20" fill="#fff"/><text x="${srcX}" y="${cy - 4}" text-anchor="middle" class="pm">+</text><text x="${srcX}" y="${cy + 14}" text-anchor="middle" class="pm">−</text>`;
    const term = `${dot(node, y0)}${k2 ? dot(node, yg) : ''}<circle cx="${out}" cy="${y0}" r="4.5" fill="#fff"/><circle cx="${out}" cy="${yg}" r="4.5" fill="#fff"/>`;
    const text = `<text x="${srcX - 28}" y="${cy + 5}" text-anchor="end" class="big">V<tspan class="subs" dy="4">in</tspan></text>` +
      `<text x="${out + 12}" y="${cy + 5}" class="big">V<tspan class="subs" dy="4">out</tspan></text>` +
      `<text x="${out + 10}" y="${y0 + 22}" class="pm">+</text><text x="${out + 10}" y="${yg - 10}" class="pm">−</text>` +
      `<rect x="${z1a - 8}" y="${y0 - 36}" width="${z1b - z1a + 16}" height="${z1Bottom - y0 + 36}" rx="8" class="zone"/>` +
      `<text x="${z1a - 4}" y="${y0 - 42}" class="zlabel">Z<tspan class="sb" dy="4">1</tspan></text>` +
      `<rect x="${node - 22}" y="${y0 + 14}" width="${z2Right - node + 14}" height="${yg - y0 - 28}" rx="8" class="zone"/>` +
      `<text x="${node - 28}" y="${cy + 5}" text-anchor="end" class="zlabel">Z<tspan class="sb" dy="4">2</tspan></text>`;
    $('schematic').innerHTML =
      `<style>.lbl{font:20px KaTeX_Main,'Times New Roman',serif;fill:#1f2a3d;stroke:none}.nm{font-family:KaTeX_Math,'Times New Roman',serif;font-style:italic}.sb{font-size:14px;font-style:normal;font-family:KaTeX_Main,'Times New Roman',serif}.missing{font:italic 16px system-ui,sans-serif;fill:#b91c1c}.pm{font:18px system-ui,sans-serif;fill:#1f2a3d}.big{font:italic 21px KaTeX_Math,'Times New Roman',serif;fill:#1f2a3d}.subs{font:14px KaTeX_Main,'Times New Roman',serif}.dot{fill:#1f2a3d}.zone{fill:none;stroke:#93a4c3;stroke-dasharray:5 4}.zlabel{font:italic 21px KaTeX_Math,'Times New Roman',serif;fill:#1d4ed8}</style>` +
      text + `<g stroke="#1f2a3d" stroke-width="2" fill="none">${w}${src}</g><g stroke="#1f2a3d" stroke-width="2">${parts}</g>${term}`;
  }

  // ---------- transfer function text ----------
  function factorTeX(m, zeros, poles) {
    const lead = p => p.findIndex(x => x !== 0);
    const mn = lead(m.n), md = lead(m.d), K = m.n[mn] / m.d[md], sp = mn - md;
    const factors = rs => {
      const out = [];
      rs.filter(r => r.re !== 0 || r.im !== 0).forEach(r => {
        if (r.im === 0) {
          const w = -r.re;
          out.push(`\\left(1${w > 0 ? '+' : '-'}s/${texNum(Math.abs(w))}\\right)`);
        } else if (r.im > 0) {
          const w0 = Math.hypot(r.re, r.im), mid = Math.abs(r.re) > 1e-9 * w0 ? `${r.re < 0 ? '+' : '-'}s/${texNum(w0 * w0 / Math.abs(2 * r.re))}` : '';
          out.push(`\\left(1${mid}+(s/${texNum(w0)})^2\\right)`);
        }
      });
      return out;
    };
    const strip = fs => fs.length === 1 ? [fs[0].replace(/^\\left\(/, '').replace(/\\right\)$/, '')] : fs;
    const nf = strip(factors(zeros)), df = strip(factors(poles));
    const sTerm = sp === 0 ? '' : sp === 1 ? 's' : `s^{${sp}}`;
    let body;
    if (!nf.length && sp >= 0 && (df.length || sp < 0)) return `H(s)=\\dfrac{${texNum(K)}${sTerm}}{${df.join('') || '1'}}`;
    if (!df.length && sp >= 0) body = (nf.join('') || '') + sTerm;
    else body = `\\dfrac{${(nf.join('') + (sp > 0 ? sTerm : '')) || '1'}}{${df.join('') + (sp < 0 ? (sp === -1 ? 's' : `s^{${-sp}}`) : '') || '1'}}`;
    return `H(s)=${texNum(K)}${body ? '\\,' + body : ''}`;
  }
  // First-order circuits are shown in the assignment's canonical form with the
  // values listed separately; anything else falls back to the factored form.
  function tfTeX(m, zeros, poles) {
    const n = m.n, d = m.d, rad = '\\ \\text{rad/s}', vals = list => '\\qquad ' + list.join(',\\quad ');
    if (d.length === 1 && n.length === 1) return `H(s)=K_0${vals([`K_0=${texNum(n[0] / d[0])}`])}`;
    if (d.length === 2 && d[0] !== 0 && n.length <= 2) {
      const wp = d[0] / d[1], k0 = n[0] / d[0];
      if (n.length === 1) return `H(s)=\\dfrac{K_0}{1+s/\\omega_p}${vals([`K_0=${texNum(k0)}`, `\\omega_p=${texNum(wp)}${rad}`])}`;
      if (n[0] === 0) return `H(s)=K_\\infty\\,\\dfrac{s/\\omega_p}{1+s/\\omega_p}${vals([`K_\\infty=${texNum(n[1] / d[1])}`, `\\omega_p=${texNum(wp)}${rad}`])}`;
      return `H(s)=K_0\\,\\dfrac{1+s/\\omega_z}{1+s/\\omega_p}${vals([`K_0=${texNum(k0)}`, `\\omega_z=${texNum(n[0] / n[1])}${rad}`, `\\omega_p=${texNum(wp)}${rad}`])}`;
    }
    return factorTeX(m, zeros, poles);
  }
  const rootText = r => r.im === 0 ? eng(r.re, '', 4) : `${eng(r.re, '', 4)} ± j${eng(Math.abs(r.im), '', 4)}`;

  // ---------- Bode plot ----------
  const dispTick = x => eng(x);
  const bodeHover = x => {
    if (!current) return null;
    const r = Engine.response(current.m, x * factor());
    return [
      `${fSym()} = ${eng(x, fUnit(), 4)}`,
      { text: `|H| = ${num(r.mag)} V/V  (${num(20 * Math.log10(r.mag), 3)} dB)`, color: COLORS.in },
      ...(current.ref ? [{ text: `|H/${current.refName}| = ${num(20 * Math.log10(r.mag / current.ref), 3)} dB`, color: COLORS.in }] : []),
      { text: `∠H = ${num(r.phase)}°`, color: COLORS.in },
      { text: 'click to use as test frequency', color: '#8a94a6' },
    ];
  };
  const setTestFreq = x => {
    state.gen.w = x * factor();
    if (state.gen.type === 'step' || state.gen.type === 'impulse') state.gen.type = 'cosine';
    state.gen.auto = true;
    syncGenerator(); update();
  };
  const magPlot = new Plot($('mag'), { xLog: true, xLabel: '', yLabel: '|H|  (dB)', hover: bodeHover, onClick: setTestFreq, xTick: dispTick });
  const phasePlot = new Plot($('phase'), { xLog: true, xLabel: '', yLabel: '∠H  (°)', hover: bodeHover, onClick: setTestFreq, xTick: dispTick });

  function drawBode() {
    const { m, poles, zeros, ref, cut } = current, f = factor();
    const crit = poles.concat(zeros).map(r => Math.hypot(r.re, r.im) / f).filter(v => v > 0);
    let lo = crit.length ? 10 ** (Math.floor(Math.log10(Math.min(...crit))) - 2) : 1;
    let hi = crit.length ? 10 ** (Math.ceil(Math.log10(Math.max(...crit))) + 2) : 1e6;
    if (hi / lo > 1e12) lo = hi / 1e12;
    current.range = [lo, hi];
    const xs = Array.from({ length: 900 }, (_, i) => lo * (hi / lo) ** (i / 899));
    const rs = xs.map(x => Engine.response(m, x * f));
    const normed = state.norm !== false && !!ref, refDb = ref ? 20 * Math.log10(ref) : 0;
    const db = rs.map(r => 20 * Math.log10(r.mag) - (normed ? refDb : 0));
    const ph = []; rs.forEach((r, i) => { let p = r.phase; if (i) { while (p - ph[i - 1] > 180) p -= 360; while (p - ph[i - 1] < -180) p += 360; } ph.push(p); });
    const finite = db.filter(Number.isFinite);
    let ymin = Math.min(...finite), ymax = Math.max(...finite);
    if (ymax - ymin < 20) { const c = (ymax + ymin) / 2; ymin = c - 15; ymax = c + 10; }
    if (normed) { ymax = Math.max(ymax, 5); ymin = Math.min(ymin, -10); }
    const ys = ymax - ymin > 100 ? 20 : 10;
    ymin = Math.floor((ymin - 2) / ys) * ys; ymax = Math.ceil((ymax + 2) / ys) * ys;
    let pmin = Math.floor((Math.min(...ph) - 5) / 45) * 45, pmax = Math.ceil((Math.max(...ph) + 5) / 45) * 45;
    pmin = Math.min(pmin, -45); pmax = Math.max(pmax, 45);
    const test = state.gen.w / f, showTest = ['sine', 'cosine', 'square'].includes(state.gen.type) && test >= lo && test <= hi;
    const vLines = [];
    if (cut) vLines.push({ x: cut / f, color: COLORS.cut, dash: [6, 4], label: fSym() + '−3dB' });
    if (showTest) vLines.push({ x: test, color: COLORS.test, label: fSym() + '₀ (generator)', bottom: true });
    const label = `${fSym()} (${fUnit()})`;
    magPlot.o.xLabel = phasePlot.o.xLabel = label;
    magPlot.o.yLabel = normed ? `|H/${current.refName}|  (dB)` : '|H|  (dB)';
    document.querySelectorAll('#sb-norm button').forEach(b => { b.classList.toggle('on', (b.dataset.norm === '1') === normed); b.disabled = !ref; });
    const lvl = (normed ? 0 : refDb) - DB3;
    magPlot.set({
      x: [lo, hi], y: [ymin, ymax], yStep: ys, series: [{ x: xs, y: db, color: COLORS.in }], vLines,
      hLines: ref ? [{ y: lvl, color: COLORS.cut, dash: [6, 4], label: normed ? '−3 dB' : `${current.refName} − 3 dB = ${num(lvl, 3)} dB` }] : [],
      points: cut ? [{ x: cut / f, y: lvl, color: COLORS.cut }] : [],
    });
    phasePlot.set({ x: [lo, hi], y: [pmin, pmax], yStep: pmax - pmin > 360 ? 90 : 45, series: [{ x: xs, y: ph, color: COLORS.in }], vLines });
  }

  // ---------- signal generator ----------
  const niceUp = v => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(f => f * p >= v * 0.9999) * p; };
  function slowestTau() {
    const decays = current.poles.filter(p => p.re < 0).map(p => -p.re);
    return decays.length ? 1 / Math.min(...decays) : null;
  }
  function autoWindow() {
    const tau = slowestTau(), type = state.gen.type;
    if (type === 'step' || type === 'impulse') {
      if (tau) return niceUp(6 * tau);
      const osc = current.poles.find(p => p.im > 0);
      return osc ? niceUp(10 * TWO_PI / osc.im) : 1e-3;
    }
    const P = TWO_PI / state.gen.w;
    return niceUp(tau ? Math.min(Math.max(6 * tau, 4 * P), 12 * P) : 6 * P);
  }
  function syncGenerator() {
    const g = state.gen, needsF = ['sine', 'cosine', 'square'].includes(g.type);
    document.querySelectorAll('#sb-type button').forEach(b => b.classList.toggle('on', b.dataset.type === g.type));
    document.querySelectorAll('.needs-freq').forEach(el => el.classList.toggle('off', !needsF));
    $('amp-label').textContent = g.type === 'impulse' ? 'Area A' : 'Amplitude A';
    $('amp-unit').textContent = g.type === 'impulse' ? 'V·s' : 'V';
    $('f-label').textContent = 'Frequency ' + fSym() + '₀';
    $('f-unit').textContent = fUnit();
    if (document.activeElement !== $('amp')) $('amp').value = g.amp;
    if (document.activeElement !== $('f') && g.w) $('f').value = Number((g.w / factor()).toPrecision(6));
    $('x10').checked = !!state.x10;
    $('out-label').innerHTML = state.x10 ? 'Output ×10 &nbsp;(10·v<sub>out</sub>)' : 'Output v<sub>out</sub>(t)';
    document.querySelectorAll('#sb-norm button').forEach(b => b.addEventListener('click', () => { state.norm = b.dataset.norm === '1'; update(); }));
  document.querySelectorAll('#sb-unit button').forEach(b => b.classList.toggle('on', b.dataset.unit === state.unit));
    $('auto').classList.toggle('on', g.auto);
  }
  function setWindowField(win) {
    const unit = win < 1e-3 ? 1e-6 : win < 1 ? 1e-3 : 1;
    $('win-unit').value = String(unit);
    $('win').value = Number((win / unit).toPrecision(4));
  }

  function drawTime() {
    const g = state.gen, m = current.m, f = factor();
    const needsF = ['sine', 'cosine', 'square'].includes(g.type);
    if (!(Number.isFinite(g.amp) && g.amp !== 0)) throw Error('Enter a non-zero amplitude.');
    if (needsF && !(g.w > 0)) throw Error('Enter a positive frequency.');
    let win = g.win;
    if (g.auto || !(win > 0)) { win = autoWindow(); g.win = win; setWindowField(win); }
    const sim = Engine.simulate(m, { type: g.type, amp: g.amp, w: g.w }, win);
    const scale = win < 1e-3 ? 1e6 : win < 1 ? 1e3 : 1, tu = scale === 1e6 ? 'µs' : scale === 1e3 ? 'ms' : 's';
    const k = state.x10 ? 10 : 1;
    const t = sim.t.map(v => v * scale), yOut = sim.y.map(v => v * k);
    const vals = (g.type === 'impulse' ? [] : sim.u).concat(yOut, [0]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (g.type === 'impulse') hi = Math.max(hi, Math.abs(g.amp) * 1e-12, lo + 1e-12);
    const pad = (hi - lo || Math.abs(g.amp) || 1) * 0.12;
    lo -= pad; hi += pad;
    if (g.type === 'impulse' && hi - lo < 1e-9) { lo = -1; hi = 1; }
    const arrows = [];
    if (g.type === 'impulse') {
      arrows.push({ x: 0, y0: 0, y1: hi * 0.92, color: COLORS.in, label: `${num(g.amp)}·δ(t)` });
      if (sim.direct) arrows.push({ x: 0, y0: 0, y1: hi * 0.6, color: COLORS.out, label: `output ${num(sim.direct * k)}·δ(t)` });
    }
    const series = [{ x: t, y: yOut, color: COLORS.out, width: 2.4 }];
    if (g.type !== 'impulse') series.unshift({ x: t, y: sim.u, color: COLORS.in, width: 2 });
    timePlot.o.xLabel = `t (${tu})`;
    timePlot.o.hover = x => [
      `t = ${eng(x / scale, 's', 4)}`,
      ...(g.type === 'impulse' ? [] : [{ text: `v_in = ${num(interp(t, sim.u, x))} V`, color: COLORS.in }]),
      { text: `${state.x10 ? '10·v_out' : 'v_out'} = ${num(interp(t, yOut, x))} V`, color: COLORS.out },
    ];
    timePlot.set({ x: [t[0], t[t.length - 1]], y: [lo, hi], series, arrows });

    // input formula and key numbers
    const A = texNum(g.amp), w0 = g.w;
    const arg = state.unit === 'hz' ? `2\\pi\\cdot ${texNum(w0 / TWO_PI)}\\,t` : `${texNum(w0)}\\,t`;
    const r = needsF ? Engine.response(m, w0) : null;
    if (r && Math.abs(r.phase) < 1e-9) r.phase = 0;
    let tex = {
      step: `v_{\\text{in}}(t)=${A}\\,u(t)\\ \\text{V}`,
      impulse: `v_{\\text{in}}(t)=${A}\\,\\delta(t)`,
      sine: `v_{\\text{in}}(t)=${A}\\sin(${arg})\\,u(t)\\ \\text{V}`,
      cosine: `v_{\\text{in}}(t)=${A}\\cos(${arg})\\,u(t)\\ \\text{V}`,
      square: `v_{\\text{in}}(t)=\\pm${A}\\ \\text{V square wave},\\ \\ ${state.unit === 'hz' ? 'f_0' : '\\omega_0'}=${texNum(w0 / f)}\\ \\text{${fUnit()}},\\ \\text{starting at } +${A}\\text{ V when } t=0`,
    }[g.type];
    if (g.type === 'sine' || g.type === 'cosine') {
      const fn = g.type === 'sine' ? '\\sin' : '\\cos', ph = r.phase;
      tex += `\\qquad\\Rightarrow\\qquad v_{\\text{out,ss}}(t)=${texNum(g.amp * r.mag)}${fn}\\!\\left(${arg}${ph === 0 ? '' : `${ph < 0 ? '-' : '+'}{${texNum(Math.abs(ph))}}^\\circ`}\\right)\\ \\text{V}`;
    }
    katex.render(tex, $('input-eq'), { displayMode: true, throwOnError: false });

    const y0p = sim.y[2], tau = slowestTau(), stat = (l, v, c = '') => `<div class="stat ${c}"><b>${l}</b><span>${v}</span></div>`;
    const tauStat = tau ? stat(current.poles.length === 1 ? 'Time constant τ = 1/ωp' : 'Slowest time constant τ', eng(tau, 's', 4)) : '';
    let html = '';
    if (g.type === 'step') {
      html = stat('v_out(0⁺)', `${num(y0p)} V`) + stat('Final value v_out(∞) = A·H(0)', Number.isFinite(current.K0) ? `${num(g.amp * current.K0)} V` : '—') + tauStat;
    } else if (g.type === 'impulse') {
      html = stat('h(0⁺) (regular part)', `${num(y0p)} V`) + (sim.direct ? stat('Plus impulse at t = 0', `${num(sim.direct)}·δ(t)`, 'warn') : '') + tauStat;
    } else {
      const lag = -r.phase / 360 * TWO_PI / w0;
      html = stat('|H(jω₀)|', `${num(r.mag)} · ${num(20 * Math.log10(r.mag))} dB`) +
        stat('∠H(jω₀)', `${num(r.phase)}°`) +
        (g.type === 'square'
          ? stat('v_out(0⁺)', `${num(y0p)} V`) + stat('Output peak (last period)', `${num(peakLastPeriod(sim, w0))} V`)
          : stat('Steady-state amplitude A·|H|', `${num(g.amp * r.mag)} V`) + stat(lag >= 0 ? 'Output lags by' : 'Output leads by', eng(Math.abs(lag), 's', 4))) +
        tauStat;
    }
    if (state.x10) html += stat('Display', 'output trace shown ×10');
    $('time-stats').innerHTML = html;
  }
  function peakLastPeriod(sim, w0) {
    const end = sim.t[sim.t.length - 1], start = end - TWO_PI / w0;
    let p = 0; sim.t.forEach((t, i) => { if (t >= start) p = Math.max(p, Math.abs(sim.y[i])); });
    return p;
  }
  const timePlot = new Plot($('time'), { xLog: false, xLabel: 't', yLabel: 'Voltage  (V)', hover: () => null });

  // ---------- main update ----------
  function update() {
    const nm = names();
    document.querySelectorAll('.branch').forEach((el, bi) => el.querySelectorAll('.row .tag').forEach((tag, i) => { const [a, b] = splitName(nm[bi][i]); tag.innerHTML = `<i>${a}</i><sub>${b}</sub>`; }));
    schematic(nm);
    syncGenerator();
    save();
    const status = $('status');
    try {
      // validate values
      let bad = null;
      document.querySelectorAll('.branch').forEach((el, bi) => el.querySelectorAll('.row input').forEach((inp, i) => {
        const v = +inp.value, ok = inp.value !== '' && v > 0 && Number.isFinite(v);
        inp.classList.toggle('bad', !ok);
        if (!ok && !bad) bad = nm[bi][i];
      }));
      if (bad) throw Error(`Enter a positive value for ${bad}.`);
      const list = b => b.items.map(it => ({ type: it.type, value: +it.val * it.mult }));
      const [b1, b2] = state.branches;
      const m = Engine.divider(list(b1), b1.mode, list(b2), b2.mode);
      const zeros = Engine.roots(m.n), poles = Engine.roots(m.d);
      const K0 = Engine.dcGain(m);
      const hf = m.n.length === m.d.length ? m.n[m.n.length - 1] / m.d[m.d.length - 1] : m.n.length < m.d.length ? 0 : Infinity;
      let ref = null, refName = '';
      if (K0 > 0 && Number.isFinite(K0)) { ref = K0; refName = 'K₀'; }
      else if (hf > 0 && Number.isFinite(hf)) { ref = hf; refName = 'HF gain'; }
      const cut = Engine.cutoff(m, ref);
      current = { m, zeros, poles, K0, ref, refName, cut };
      if (!state.gen.w) state.gen.w = cut || 1000;
      syncGenerator();
      status.className = 'status'; status.textContent = '';

      katex.render(tfTeX(m, zeros, poles), $('eq'), { displayMode: true, throwOnError: false });
      const f = factor(), stat = (l, v, c = '') => `<div class="stat ${c}"><b>${l}</b><span>${v}</span></div>`;
      const cancel = poles.some(p => zeros.some(z => Math.hypot(p.re - z.re, p.im - z.im) <= 1e-6 * Math.hypot(p.re, p.im)));
      $('stats').innerHTML =
        stat('DC gain K₀ = H(0)', Number.isFinite(K0) ? `${num(K0)} V/V (${K0 > 0 ? num(20 * Math.log10(K0), 3) + ' dB' : '−∞ dB'})` : '∞') +
        stat(`−3 dB ${state.unit === 'hz' ? 'frequency f−3dB' : 'bandwidth ω−3dB'}`, cut
          ? (state.unit === 'hz' ? `${eng(cut / f, 'Hz', 4)} (${eng(cut, 'rad/s', 4)})` : `${eng(cut, 'rad/s', 4)} (${eng(cut / TWO_PI, 'Hz', 4)})`)
          : (ref ? 'none: gain never drops 3 dB below ' + current.refName : '—')) +
        stat('Poles (rad/s)', poles.length ? poles.filter(p => p.im >= 0).map(rootText).join(', ') : 'none') +
        stat('Zeros (rad/s)', zeros.length ? zeros.filter(p => p.im >= 0).map(rootText).join(', ') : 'none') +
        (cancel ? stat('Pole–zero cancellation', 'Flat, distortion-free response', 'note') : '');
      $('at-cut').disabled = $('at-10').disabled = !cut;
      drawBode();
    } catch (e) {
      current = null;
      status.className = 'status error'; status.textContent = e.message;
      $('eq').textContent = ''; $('stats').innerHTML = ''; $('time-stats').innerHTML = ''; $('input-eq').textContent = '';
      magPlot.clear('Complete the circuit to see the Bode plot'); phasePlot.clear('');
      timePlot.clear('Complete the circuit to see the response');
      return;
    }
    try { drawTime(); }
    catch (e) {
      timePlot.clear(e.message);
      $('time-stats').innerHTML = ''; $('input-eq').textContent = '';
    }
  }

  // ---------- generator controls ----------
  document.querySelectorAll('#sb-type button').forEach(b => b.addEventListener('click', () => {
    state.gen.type = b.dataset.type; state.gen.auto = true; update();
  }));
  $('amp').addEventListener('input', () => {
    const v = +$('amp').value; $('amp').classList.toggle('bad', !($('amp').value !== '' && Number.isFinite(v) && v !== 0));
    state.gen.amp = v; update();
  });
  $('f').addEventListener('input', () => {
    const v = +$('f').value, ok = $('f').value !== '' && v > 0 && Number.isFinite(v);
    $('f').classList.toggle('bad', !ok);
    if (!ok) return;
    state.gen.w = v * factor(); state.gen.auto = true; update();
  });
  const readWindow = () => {
    const v = +$('win').value * +$('win-unit').value, ok = $('win').value !== '' && v > 0 && Number.isFinite(v);
    $('win').classList.toggle('bad', !ok);
    if (!ok) return;
    state.gen.win = v; state.gen.auto = false; update();
  };
  $('win').addEventListener('input', readWindow);
  $('win-unit').addEventListener('change', readWindow);
  $('auto').addEventListener('click', () => { state.gen.auto = true; update(); });
  $('x10').addEventListener('change', () => { state.x10 = $('x10').checked; update(); });
  $('at-cut').addEventListener('click', () => { if (current?.cut) { state.gen.w = current.cut; state.gen.auto = true; update(); } });
  $('at-10').addEventListener('click', () => { if (current?.cut) { state.gen.w = 10 * current.cut; state.gen.auto = true; update(); } });
  document.querySelectorAll('#sb-norm button').forEach(b => b.addEventListener('click', () => { state.norm = b.dataset.norm === '1'; update(); }));
  document.querySelectorAll('#sb-unit button').forEach(b => b.addEventListener('click', () => { state.unit = b.dataset.unit; update(); }));
  document.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
    state = PRESETS[b.dataset.load]();
    buildBranches(); update();
  }));

  buildBranches();
  update();
})();
