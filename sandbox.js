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
    // Assignment topologies with example values (students substitute their own designs)
    partA: () => ({ // ECG notch: series-LC trap to ground tuned to 50 Hz hum
      branches: [{ mode: 'series', items: [part('R', 1, 1e3)] }, { mode: 'series', items: [part('L', 1, 1), part('C', 10.13, 1e-6)] }],
      unit: 'hz', gen: { type: 'dual', amp: 1, w: TWO_PI * 50, auto: true, win: null }, x10: false,
    }),
    partB: () => ({ // RFID L-match at 13.56 MHz: 500 Ω load presented as 50 Ω
      branches: [{ mode: 'series', items: [part('R', 50, 1), part('L', 1.7606, 1e-6)] }, { mode: 'parallel', items: [part('R', 500, 1), part('C', 70.423, 1e-12)] }],
      unit: 'hz', gen: { type: 'cosine', amp: 1, w: TWO_PI * 13.56e6, auto: true, win: null }, x10: false,
    }),
    partC: () => ({ // nulling resistor in series with the compensation capacitor
      branches: [{ mode: 'series', items: [part('R', 10, 1e3)] }, { mode: 'series', items: [part('R', 1, 1e3), part('C', 10, 1e-9)] }],
      unit: 'rad', gen: { type: 'step', amp: 1, w: null, auto: true, win: null }, x10: false,
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
      { text: `click to move the ${fSym()}₀ cursor here`, color: '#8a94a6' },
    ];
  };
  const setTestFreq = x => {
    state.gen.w = Number(x.toPrecision(4)) * factor();
    state.gen.auto = true;
    update();
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
    const test = state.gen.w / f, showTest = test >= lo && test <= hi;
    const vLines = [], magPts = [], phPts = [];
    if (cut) vLines.push({ x: cut / f, color: COLORS.cut, dash: [6, 4], label: fSym() + '−3dB' });
    if (showTest) {
      vLines.push({ x: test, color: COLORS.test, label: fSym() + '₀ cursor', bottom: true });
      const y = interp(xs, db, test);
      if (Number.isFinite(y)) magPts.push({ x: test, y, color: COLORS.test });
      phPts.push({ x: test, y: interp(xs, ph, test), color: COLORS.test });
    }
    if (state.gen.type === 'dual' && test / 10 >= lo && test / 10 <= hi) vLines.push({ x: test / 10, color: COLORS.test, dash: [2, 4], label: '0.1' + fSym() + '₀ (ECG)', bottom: true, row: 1 });
    const label = `${fSym()} (${fUnit()})`;
    magPlot.o.xLabel = phasePlot.o.xLabel = label;
    magPlot.o.yLabel = normed ? `|H/${current.refName}|  (dB)` : '|H|  (dB)';
    document.querySelectorAll('#sb-norm button').forEach(b => { b.classList.toggle('on', (b.dataset.norm === '1') === normed); b.disabled = !ref; });
    const lvl = (normed ? 0 : refDb) - DB3;
    magPlot.set({
      x: [lo, hi], y: [ymin, ymax], yStep: ys, series: [{ x: xs, y: db, color: COLORS.in }], vLines,
      hLines: ref ? [{ y: lvl, color: COLORS.cut, dash: [6, 4], label: normed ? '−3 dB' : `${current.refName} − 3 dB = ${num(lvl, 3)} dB` }] : [],
      points: (cut ? [{ x: cut / f, y: lvl, color: COLORS.cut }] : []).concat(magPts),
    });
    phasePlot.set({ x: [lo, hi], y: [pmin, pmax], yStep: pmax - pmin > 360 ? 90 : 45, series: [{ x: xs, y: ph, color: COLORS.in }], vLines, points: phPts });
    syncCursor();
  }

  // ---------- ω₀ cursor: impedance readout and phasor diagram ----------
  const PH = { vin: COLORS.in, vout: COLORS.out, vl: '#2563eb', i: COLORS.test, vz1: '#8a94a6' };
  const cplx = z => !(Number.isFinite(z.re) && Number.isFinite(z.im)) ? '∞' : `${num(z.re)} ${z.im < 0 ? '−' : '+'} j${num(Math.abs(z.im))}`;
  const polar = (z, unit) => !(Number.isFinite(z.re) && Number.isFinite(z.im)) ? '' : `${eng(Math.hypot(z.re, z.im), unit, 4)} ∠ ${num(Math.atan2(z.im, z.re) * 180 / Math.PI)}°`;
  function syncCursor() {
    const x = state.gen.w / factor();
    $('c-label').textContent = fSym() + '₀';
    $('c-unit').textContent = fUnit();
    if (!(x > 0)) return;
    if (document.activeElement !== $('c')) $('c').value = Number(x.toPrecision(6));
    if (current?.range && document.activeElement !== $('c-slider')) {
      const [lo, hi] = current.range;
      $('c-slider').value = Math.round(1000 * Math.log(x / lo) / Math.log(hi / lo));
    }
  }
  function drawCursor() {
    const w0 = state.gen.w, nm = names(), [b1, b2] = state.branches;
    const list = b => b.items.map(it => ({ type: it.type, value: +it.val * it.mult }));
    const serial = b => b.mode !== 'parallel' || b.items.length === 1;
    const Z1 = Engine.branchAt(list(b1), b1.mode, w0), Z2 = Engine.branchAt(list(b2), b2.mode, w0);
    const Zin = Engine.cadd(Z1, Z2), r = Engine.response(current.m, w0);
    // Phasors for V_in = 1∠0° V; the same current I₁ flows through Z₁ and Z₂
    const I1 = Engine.cdiv({ re: 1, im: 0 }, Zin), Vout = Engine.cmul(I1, Z2), VZ1 = Engine.cmul(I1, Z1);
    let VL = null, lName = '';
    [b1, b2].some((b, bi) => {
      const i = b.items.findIndex(it => it.type === 'L');
      if (i < 0) return false;
      lName = nm[bi][i];
      VL = serial(b) ? Engine.cmul(I1, { re: 0, im: w0 * list(b)[i].value }) : bi === 0 ? VZ1 : Vout;
      return true;
    });

    // Z_match: what the source resistance R_S sees looking into the rest of the network
    let match = '';
    if (serial(b1) && b1.items.some(it => it.type !== 'R')) {
      const rs = b1.items.map((it, i) => ({ it, i, v: +it.val * it.mult })).filter(x => x.it.type === 'R');
      const Rs = rs.reduce((s, x) => s + x.v, 0), Zm = { re: Z1.re - Rs + Z2.re, im: Z1.im + Z2.im };
      const reac = b1.items.map((it, i) => [it, nm[0][i]]).filter(([it]) => it.type !== 'R');
      const lhs = reac.length === 1 && reac[0][0].type === 'L' ? `jω₀${reac[0][1]} + Z₂` : (Rs ? 'Z₁ − R_S + Z₂' : 'Z₁ + Z₂');
      const rsName = rs.length === 1 ? nm[0][rs[0].i] : 'R_S';
      let check = '';
      if (Rs > 0) {
        const dev = Math.hypot(Zm.re - Rs, Zm.im) / Rs;
        check = dev < 0.01
          ? `<div class="ro-check ok">✓ Matched: Re = ${rsName} = ${eng(Rs, 'Ω', 4)} and Im ≈ 0 (within ${num(dev * 100, 2)}%)</div>`
          : `<div class="ro-check">Target Re = ${rsName} = ${eng(Rs, 'Ω', 4)}, Im = 0 Ω. Now ΔRe = ${num(Zm.re - Rs)} Ω, Im = ${num(Zm.im)} Ω</div>`;
      }
      match = `<div class="ro"><b>Z<sub>match</sub>(jω₀) = ${lhs}</b><span>${cplx(Zm)} Ω</span><small>${polar(Zm, 'Ω')}</small>${check}</div>`;
    } else match = `<div class="ro muted"><b>Z<sub>match</sub>(jω₀)</b><small>Wire Z₁ as R_S in series with L (Part B) to see the impedance R_S looks into.</small></div>`;

    const db = 20 * Math.log10(r.mag);
    $('readout').innerHTML =
      `<div class="ro"><b>${fSym()}₀</b><span>${eng(w0, 'rad/s', 5)}</span><small>${eng(w0 / TWO_PI, 'Hz', 5)}</small></div>` +
      `<div class="ro"><b>Z₁(jω₀)</b><span>${cplx(Z1)} Ω</span><small>${polar(Z1, 'Ω')}</small></div>` +
      `<div class="ro"><b>Z₂(jω₀) = R<sub>eq</sub> + jX<sub>eq</sub></b><span>${cplx(Z2)} Ω</span><small>${polar(Z2, 'Ω')}</small></div>` +
      match +
      `<div class="ro"><b>|H(jω₀)|</b><span>${num(r.mag)} V/V</span><small>${Number.isFinite(db) ? num(db, 4) + ' dB' : '−∞ dB'}</small></div>` +
      `<div class="ro"><b>∠H(jω₀)</b><span>${num(Math.abs(r.phase) < 1e-9 ? 0 : r.phase)}°</span><small>V<sub>out</sub> ${r.phase < -1e-9 ? 'lags' : r.phase > 1e-9 ? 'leads' : 'in phase with'} V<sub>in</sub></small></div>`;

    const vecs = [
      { z: VZ1, from: Vout, color: PH.vz1, label: 'V_Z1', key: `V<sub>Z₁</sub> = I₁Z₁ (closes V<sub>in</sub> = V<sub>Z₁</sub> + V<sub>out</sub>)`, dash: true },
      { z: { re: 1, im: 0 }, color: PH.vin, label: 'V_in', key: 'V<sub>in</sub> (reference)' },
      { z: Vout, color: PH.vout, label: 'V_out', key: 'V<sub>out</sub> = H·V<sub>in</sub>' },
      ...(VL ? [{ z: VL, color: PH.vl, label: 'V_L', key: `V<sub>L</sub> across ${lName}` }] : []),
      { z: I1, color: PH.i, label: 'I_1', key: 'I₁ = V<sub>in</sub>/(Z₁ + Z₂), drawn to its own scale', current: true },
    ];
    $('phasor-key').innerHTML = vecs.map(v => `<div><span class="sw" style="background:${v.color}"></span>${v.key}: <b>${polar(v.z, v.current ? 'A' : 'V') || '∞'}</b></div>`).join('') +
      (VL ? '' : '<div class="muted">No inductor in the circuit, so there is no V<sub>L</sub>.</div>');
    drawPhasor(vecs);
  }
  function drawPhasor(vecs) {
    const W = 420, H = 330, cx = 210, cy = 160, R = 128;
    const ok = z => Number.isFinite(z.re) && Number.isFinite(z.im);
    const tip = v => v.from ? Engine.cadd(v.from, v.z) : v.z;
    const vmax = Math.max(1, ...vecs.filter(v => !v.current && ok(v.z)).map(v => Math.max(Math.hypot(tip(v).re, tip(v).im), v.from ? Math.hypot(v.from.re, v.from.im) : 0)));
    const sc = R / vmax, px = z => [cx + z.re * sc, cy - z.im * sc];
    const sub = s => { const [a, b] = s.split('_'); return `${a}<tspan dy="4" font-size="11">${b}</tspan>`; };
    let s = `<rect width="${W}" height="${H}" fill="#fff"/>` +
      `<line x1="16" y1="${cy}" x2="${W - 16}" y2="${cy}" stroke="#b9c1cd"/><line x1="${cx}" y1="14" x2="${cx}" y2="${H - 24}" stroke="#b9c1cd"/>` +
      `<text x="${W - 14}" y="${cy - 6}" text-anchor="end" font-size="12" fill="#5b6578">Re</text><text x="${cx + 6}" y="24" font-size="12" fill="#5b6578">Im</text>` +
      `<circle cx="${cx}" cy="${cy}" r="${sc}" fill="none" stroke="#c8d0db" stroke-dasharray="4 4"/>` +
      `<text x="${cx - sc * 0.71 - 4}" y="${cy - sc * 0.71 - 4}" text-anchor="end" font-size="11" fill="#8a94a6">|V<tspan dy="3" font-size="9">in</tspan><tspan dy="-3">| = 1 V</tspan></text>`;
    for (const v of vecs) {
      if (!ok(v.z)) continue;
      let z = v.z;
      if (v.current) { // amps cannot share the volts scale: show direction at 55% of the plot radius
        const m = Math.hypot(z.re, z.im);
        if (!m) continue;
        z = { re: z.re / m * 0.55 * vmax, im: z.im / m * 0.55 * vmax };
      }
      const [x1, y1] = px(v.from || { re: 0, im: 0 }), [x2, y2] = px(v.from ? Engine.cadd(v.from, z) : z);
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 2) { s += `<circle cx="${x1}" cy="${y1}" r="3" fill="${v.color}"/>`; continue; }
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len, h = Math.min(11, len * 0.45), bx = x2 - ux * h, by = y2 - uy * h;
      s += `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" stroke="${v.color}" stroke-width="${v.dash ? 1.8 : 2.6}"${v.dash ? ' stroke-dasharray="5 4"' : ''}/>` +
        `<path d="M${x2} ${y2}L${bx - uy * h * 0.45} ${by + ux * h * 0.45}L${bx + uy * h * 0.45} ${by - ux * h * 0.45}Z" fill="${v.color}"/>`;
      // Dashed V_Z₁ and the current are labelled beside their midpoint/tip so they do not sit on V_in
      const side = v.dash || v.current, ax = side ? -uy : ux;
      const lx = v.dash ? (x1 + x2) / 2 - uy * 12 : v.current ? x2 - ux * h - uy * 14 : x2 + ux * 12;
      const ly = v.dash ? (y1 + y2) / 2 + ux * 12 : v.current ? y2 - uy * h + ux * 14 : y2 + uy * 12;
      s += `<text x="${lx}" y="${ly + 4}" text-anchor="${ax < -0.3 ? 'end' : ax > 0.3 ? 'start' : 'middle'}" font-size="14" font-style="italic" font-weight="600" fill="${v.color}" stroke="#fff" stroke-width="3" paint-order="stroke">${sub(v.label)}</text>`;
    }
    s += `<text x="12" y="20" font-size="11" fill="#8a94a6">${fSym()}₀ = ${eng(state.gen.w / factor(), fUnit(), 4)} · equal scales</text>` + Watermark.svg(W - 6, H - 6);
    $('phasor').innerHTML = s;
  }

  // ---------- signal generator ----------
  const niceUp = v => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(f => f * p >= v * 0.9999) * p; };
  function slowestTau() {
    const decays = current.poles.filter(p => p.re < 0).map(p => -p.re);
    return decays.length ? 1 / Math.min(...decays) : null;
  }
  function autoWindow() {
    const tau = slowestTau(), type = state.gen.type;
    if (type === 'dual') return niceUp(2 * TWO_PI / (0.1 * state.gen.w)); // two ECG periods, twenty hum periods
    if (type === 'step' || type === 'impulse') {
      if (tau) return niceUp(6 * tau);
      const osc = current.poles.find(p => p.im > 0);
      return osc ? niceUp(10 * TWO_PI / osc.im) : 1e-3;
    }
    const P = TWO_PI / state.gen.w;
    return niceUp(tau ? Math.min(Math.max(6 * tau, 4 * P), 12 * P) : 6 * P);
  }
  function syncGenerator() {
    const g = state.gen, needsF = ['sine', 'cosine', 'square', 'dual'].includes(g.type);
    document.querySelectorAll('#sb-type button').forEach(b => b.classList.toggle('on', b.dataset.type === g.type));
    document.querySelectorAll('.needs-freq').forEach(el => el.classList.toggle('off', !needsF));
    document.querySelectorAll('.needs-cut').forEach(el => el.classList.toggle('off', !needsF || g.type === 'dual'));
    document.querySelectorAll('.needs-amp').forEach(el => el.classList.toggle('off', g.type === 'dual'));
    $('amp-label').textContent = g.type === 'impulse' ? 'Area A' : 'Amplitude A';
    $('amp-unit').textContent = g.type === 'impulse' ? 'V·s' : 'V';
    $('f-label').textContent = 'Frequency ' + fSym() + '₀';
    $('f-unit').textContent = fUnit();
    if (document.activeElement !== $('amp')) $('amp').value = g.amp;
    if (document.activeElement !== $('f') && g.w) $('f').value = Number((g.w / factor()).toPrecision(6));
    $('x10').checked = !!state.x10;
    $('out-label').innerHTML = state.x10 ? 'Output ×10 &nbsp;(10·v<sub>out</sub>)' : 'Output v<sub>out</sub>(t)';
    document.querySelectorAll('#sb-unit button').forEach(b => b.classList.toggle('on', b.dataset.unit === state.unit));
    $('auto').classList.toggle('on', g.auto);
  }
  function setWindowField(win) {
    const unit = win < 1e-3 ? 1e-6 : win < 1 ? 1e-3 : 1;
    $('win-unit').value = String(unit);
    $('win').value = Number((win / unit).toPrecision(4));
  }

  // v_in = 1.0 cos(0.1ω₀t) + 5.0 sin(ω₀t + 30°), as cosines: 5 sin(x + 30°) = 5 cos(x − 60°)
  const DUAL = w0 => [{ amp: 1, w: 0.1 * w0, phase: 0 }, { amp: 5, w: w0, phase: -60 }];
  function drawDual() {
    const g = state.gen, w0 = g.w;
    if (!(w0 > 0)) throw Error('Enter a positive frequency.');
    let win = g.win;
    if (g.auto || !(win > 0)) { win = autoWindow(); g.win = win; setWindowField(win); }
    const sim = Engine.tones(current.m, DUAL(w0), win);
    const scale = win < 1e-3 ? 1e6 : win < 1 ? 1e3 : 1, tu = scale === 1e6 ? 'µs' : scale === 1e3 ? 'ms' : 's';
    const k = state.x10 ? 10 : 1;
    const t = sim.t.map(v => v * scale), yOut = sim.y.map(v => v * k);
    const vals = sim.u.concat(yOut, [0]);
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo || 1) * 0.12;
    timePlot.o.xLabel = `t (${tu})`;
    timePlot.o.hover = x => [
      `t = ${eng(x / scale, 's', 4)}`,
      { text: `v_in = ${num(interp(t, sim.u, x))} V`, color: COLORS.in },
      { text: `${state.x10 ? '10·v_out' : 'v_out'} = ${num(interp(t, yOut, x))} V`, color: COLORS.out },
    ];
    timePlot.set({ x: [0, t[t.length - 1]], y: [lo - pad, hi + pad], series: [{ x: t, y: sim.u, color: COLORS.in, width: 1.6 }, { x: t, y: yOut, color: COLORS.out, width: 2.4 }] });

    const [ecg, hum] = sim.parts;
    const arg = w => state.unit === 'hz' ? `2\\pi\\cdot ${texNum(w / TWO_PI)}\\,t` : `${texNum(w)}\\,t`;
    const shift = deg => Math.abs(deg) < 1e-9 ? '' : `${deg < 0 ? '-' : '+'}{${texNum(Math.abs(deg))}}^\\circ`;
    katex.render(`\\begin{aligned}v_{\\text{in}}(t)&=1.0\\cos(${arg(ecg.w)})+5.0\\sin(${arg(w0)}+30^\\circ)\\ \\text{V}\\\\` +
      `v_{\\text{out}}(t)&=${texNum(ecg.outAmp)}\\cos(${arg(ecg.w)}${shift(ecg.dphase)})+${texNum(hum.outAmp)}\\sin(${arg(w0)}${shift(30 + hum.dphase)})\\ \\text{V}\\end{aligned}`,
    $('input-eq'), { displayMode: true, throwOnError: false });

    const stat = (l, v, c = '') => `<div class="stat ${c}"><b>${l}</b><span>${v}</span></div>`;
    const dB = v => v > 0 ? num(20 * Math.log10(v), 3) + ' dB' : '−∞ dB';
    const fs = fSym();
    $('time-stats').innerHTML =
      stat(`ECG tone: |H(j0.1${fs}₀)|`, `${num(ecg.mag)} V/V (${dB(ecg.mag)})`) +
      stat(`Hum: |H(j${fs}₀)|`, `${num(hum.mag)} V/V (${dB(hum.mag)})`) +
      stat('ECG amplitude out', `${num(ecg.outAmp)} V`) +
      stat('Hum amplitude out', `${num(hum.outAmp)} V`, hum.outAmp < 0.01 * ecg.outAmp ? 'note' : '') +
      stat('Hum relative to ECG', `in ${dB(5)} → out ${hum.outAmp && ecg.outAmp ? dB(hum.outAmp / ecg.outAmp) : '−∞ dB'}`) +
      stat('Shown', 'AC steady state by superposition (no switch-on transient)') +
      (state.x10 ? stat('Display', 'output trace shown ×10') : '');
  }

  function drawTime() {
    if (state.gen.type === 'dual') return drawDual();
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
      drawCursor();
    } catch (e) {
      current = null;
      status.className = 'status error'; status.textContent = e.message;
      $('eq').textContent = ''; $('stats').innerHTML = ''; $('time-stats').innerHTML = ''; $('input-eq').textContent = '';
      $('readout').innerHTML = '<div class="empty">Complete the circuit to see impedances at ω₀.</div>'; $('phasor-key').innerHTML = ''; $('phasor').innerHTML = '';
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
  // ω₀ cursor: typed value or log-scale slider over the Bode range (one update per frame)
  let cursorFrame = 0;
  const setCursor = w => {
    state.gen.w = w; state.gen.auto = true;
    if (!cursorFrame) cursorFrame = requestAnimationFrame(() => { cursorFrame = 0; update(); });
  };
  $('c').addEventListener('input', () => {
    const v = +$('c').value, ok = $('c').value !== '' && v > 0 && Number.isFinite(v);
    $('c').classList.toggle('bad', !ok);
    if (ok) setCursor(v * factor());
  });
  $('c-slider').addEventListener('input', () => {
    if (!current?.range) return;
    const [lo, hi] = current.range;
    setCursor(Number((lo * (hi / lo) ** ($('c-slider').value / 1000)).toPrecision(4)) * factor());
  });
  Watermark.onChange(() => { if (current) drawCursor(); });
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
