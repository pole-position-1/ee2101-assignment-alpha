'use strict';
/*
 * Circuit and signal maths for the Assignment Alpha tool. No DOM access, so the
 * same file runs in the browser (window.Engine) and in Node (require).
 *
 * Polynomials are coefficient arrays in ASCENDING powers of s:
 *   [a0, a1, a2] means a0 + a1 s + a2 s^2.
 * All frequencies are angular (rad/s); all times are in seconds.
 */
(function (root) {
  // ---------- polynomial helpers ----------
  const add = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0));
  const mul = (a, b) => {
    const c = Array(a.length + b.length - 1).fill(0);
    a.forEach((x, i) => b.forEach((y, j) => { c[i + j] += x * y; }));
    return c;
  };
  function trim(a) {
    a = a.slice();
    while (a.length > 1 && a[a.length - 1] === 0) a.pop();
    return a;
  }
  // Remove a common factor s^k from a ratio n/d.
  function stripS(n, d) {
    n = trim(n); d = trim(d);
    while (n.length > 1 && d.length > 1 && n[0] === 0 && d[0] === 0) { n = n.slice(1); d = d.slice(1); }
    return { n, d };
  }

  // ---------- impedances and the two-branch divider ----------
  function impedance(c) {
    if (!(c.value > 0 && Number.isFinite(c.value))) throw Error('Every component needs a positive value.');
    if (c.type === 'R') return { n: [c.value], d: [1] };
    if (c.type === 'C') return { n: [1], d: [0, c.value] };
    if (c.type === 'L') return { n: [0, c.value], d: [1] };
    throw Error('Unknown component type ' + c.type);
  }
  const series = (a, b) => stripS(add(mul(a.n, b.d), mul(b.n, a.d)), mul(a.d, b.d));
  const parallel = (a, b) => stripS(mul(a.n, b.n), add(mul(a.n, b.d), mul(b.n, a.d)));

  function branch(list, mode, name) {
    if (!list.length) throw Error('Add at least one component to ' + name + '.');
    return list.map(impedance).reduce(mode === 'parallel' ? parallel : series);
  }

  // H(s) = Z2 / (Z1 + Z2), normalised so the lowest non-zero denominator coefficient is 1.
  function divider(z1List, z1Mode, z2List, z2Mode) {
    const z1 = branch(z1List, z1Mode, 'Z₁'), z2 = branch(z2List, z2Mode, 'Z₂');
    let { n, d } = stripS(mul(z2.n, z1.d), add(mul(z1.n, z2.d), mul(z2.n, z1.d)));
    const k = d.find(x => x !== 0);
    return { n: n.map(x => x / k), d: d.map(x => x / k) };
  }

  // ---------- frequency response ----------
  function evalAt(p, re, im) { // Horner with complex s = re + j im
    let a = 0, b = 0;
    for (let k = p.length - 1; k >= 0; k--) { const t = a * re - b * im + p[k]; b = a * im + b * re; a = t; }
    return { re: a, im: b };
  }
  function response(m, w) {
    const a = evalAt(m.n, 0, w), b = evalAt(m.d, 0, w), q = b.re * b.re + b.im * b.im;
    if (!q) return { re: NaN, im: NaN, mag: Infinity, phase: NaN };
    const re = (a.re * b.re + a.im * b.im) / q, im = (a.im * b.re - a.re * b.im) / q;
    return { re, im, mag: Math.hypot(re, im), phase: Math.atan2(im, re) * 180 / Math.PI };
  }
  function dcGain(m) {
    if (m.d[0] !== 0) return m.n[0] / m.d[0];
    return m.n[0] === 0 ? 0 : Infinity;
  }

  // Frequencies where |H| crosses `level`, searched on a log grid then bisected.
  function magCrossings(m, level, lo, hi) {
    const f = w => response(m, w).mag - level, out = [], N = 3000;
    let wPrev = lo, yPrev = f(lo);
    for (let i = 1; i <= N; i++) {
      const w = lo * (hi / lo) ** (i / N), y = f(w);
      if (Number.isFinite(y) && Number.isFinite(yPrev) && yPrev * y < 0) out.push(bisect(f, wPrev, w, yPrev));
      wPrev = w; yPrev = y;
    }
    return out;
  }
  // First frequency where the (unwrapped) phase crosses `deg`.
  function phaseCrossing(m, deg, lo, hi) {
    const N = 3000;
    let wPrev = lo, pPrev = response(m, lo).phase;
    for (let i = 1; i <= N; i++) {
      const w = lo * (hi / lo) ** (i / N);
      let p = response(m, w).phase;
      while (p - pPrev > 180) p -= 360;
      while (p - pPrev < -180) p += 360;
      if ((pPrev - deg) * (p - deg) < 0) {
        const base = pPrev;
        const g = x => { let q = response(m, x).phase; while (q - base > 180) q -= 360; while (q - base < -180) q += 360; return q - deg; };
        return bisect(g, wPrev, w, pPrev - deg);
      }
      wPrev = w; pPrev = p;
    }
    return null;
  }
  function bisect(f, a, b, fa) {
    for (let j = 0; j < 80; j++) {
      const c = Math.sqrt(a * b), fc = f(c);
      if (fa * fc <= 0) b = c; else { a = c; fa = fc; }
    }
    return Math.sqrt(a * b);
  }

  // ---------- polynomial roots (Durand–Kerner on a rescaled polynomial) ----------
  function roots(p) {
    p = trim(p);
    const out = [];
    while (p.length > 1 && p[0] === 0) { p = p.slice(1); out.push({ re: 0, im: 0 }); }
    const n = p.length - 1;
    if (n < 1) return out;
    const sigma = Math.pow(Math.abs(p[0] / p[n]), 1 / n); // s = sigma * x keeps coefficients O(1)
    const q = p.map((v, i) => v * sigma ** i / (p[n] * sigma ** n));
    const cm = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    const cd = (a, b) => { const s = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / s, im: (a.im * b.re - a.re * b.im) / s }; };
    const pv = x => { let r = { re: 1, im: 0 }; for (let k = n - 1; k >= 0; k--) r = { re: r.re * x.re - r.im * x.im + q[k], im: r.re * x.im + r.im * x.re }; return r; };
    let z = Array.from({ length: n }, (_, k) => {
      const a = 2 * Math.PI * k / n + 0.4;
      return { re: 1.1 * Math.cos(a), im: 1.1 * Math.sin(a) };
    });
    for (let it = 0; it < 2000; it++) {
      let delta = 0;
      z = z.map((zi, i) => {
        let den = { re: 1, im: 0 };
        z.forEach((zj, j) => { if (j !== i) den = cm(den, { re: zi.re - zj.re, im: zi.im - zj.im }); });
        const step = cd(pv(zi), den);
        delta = Math.max(delta, Math.hypot(step.re, step.im));
        return { re: zi.re - step.re, im: zi.im - step.im };
      });
      if (delta < 1e-15) break;
    }
    z.forEach(r => {
      const mag = Math.hypot(r.re, r.im);
      out.push({ re: r.re * sigma, im: Math.abs(r.im) < 1e-7 * mag ? 0 : r.im * sigma });
    });
    return out.sort((a, b) => Math.hypot(a.re, a.im) - Math.hypot(b.re, b.im) || b.im - a.im);
  }

  // ---------- time-domain simulation ----------
  const identity = k => Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => +(i === j)));
  const matmul = (A, B) => A.map(r => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const matvec = (A, x) => A.map(r => r.reduce((s, v, k) => s + v * x[k], 0));
  function expm(M) { // scaling and squaring with a Taylor series
    const k = M.length;
    const norm = Math.max(...M.map(r => r.reduce((s, v) => s + Math.abs(v), 0)));
    const sq = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1);
    const A = M.map(r => r.map(v => v / 2 ** sq));
    let E = identity(k), term = identity(k);
    for (let i = 1; i <= 30; i++) {
      term = matmul(term, A).map(r => r.map(v => v / i));
      E = E.map((r, a) => r.map((v, b) => v + term[a][b]));
      if (Math.max(...term.flat().map(Math.abs)) < 1e-20) break;
    }
    for (let i = 0; i < sq; i++) E = matmul(E, E);
    return E;
  }

  // Controllable canonical realisation with time rescaled by T so that the
  // coefficients are O(1) even for pF/MΩ values.
  function realise(m, fallbackT) {
    const n = m.d.length - 1;
    if (m.n.length > m.d.length) throw Error('This circuit has more zeros than poles (an ideal differentiator), so its time response is not finite. Add a resistor.');
    if (n === 0) return { n: 0, T: 1, a: [], C: [], D: m.n[0] / m.d[0] };
    const lead = m.d[n];
    const rate = Math.max(...m.d.slice(0, n).map((v, i) => Math.pow(Math.abs(v / lead), 1 / (n - i))));
    const T = rate > 0 ? 1 / rate : fallbackT;
    const a = m.d.map((v, i) => v / T ** i / (lead / T ** n));
    const b = Array.from({ length: n + 1 }, (_, i) => (m.n[i] || 0) / T ** i / (lead / T ** n));
    const D = b[n];
    return { n, T, a, C: b.slice(0, n).map((v, i) => v - D * a[i]), D };
  }

  /*
   * Response of an initially relaxed circuit to a causal input switched on at t = 0.
   *   input.type: 'step' | 'impulse' | 'sine' | 'cosine' | 'square'
   *   input.amp : amplitude in V (area in V·s for the impulse)
   *   input.w   : angular frequency in rad/s (sine, cosine, square)
   * The input and the circuit are combined into one autonomous linear system
   * whose exact transition matrix is applied sample by sample, so there is no
   * integration error. Square-wave edges fall exactly on samples.
   * Returns arrays t, u, y (with a short t < 0 lead-in) and `direct`, the
   * weight of any δ(t) passed straight through to the output.
   */
  function simulate(m, input, duration, opts = {}) {
    if (!(duration > 0 && Number.isFinite(duration))) throw Error('Enter a positive time window.');
    const { type, amp } = input, w = input.w || 0;
    if (!Number.isFinite(amp)) throw Error('Enter a finite amplitude.');
    if (['sine', 'cosine', 'square'].includes(type) && !(w > 0 && Number.isFinite(w))) throw Error('Enter a positive frequency.');
    const sys = realise(m, duration), n = sys.n, T = sys.T;
    const osc = type === 'sine' || type === 'cosine';
    const g = osc ? 2 : 1, size = n + g;

    // Sample spacing; square waves get an integer number of samples per half period.
    let count = opts.samples || 4000, dt = duration / count;
    if (osc) { count = Math.min(60000, Math.max(count, Math.ceil(duration * w / (2 * Math.PI) * 48))); dt = duration / count; }
    let perHalf = 0;
    if (type === 'square') {
      const half = Math.PI / w;
      if (duration / half > 8000) throw Error('Time window covers too many square-wave periods. Shorten the window.');
      perHalf = Math.max(4, Math.round(half / (duration / count)));
      dt = half / perHalf;
      count = Math.ceil(duration / dt);
    }

    const M = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < n - 1; i++) M[i][i + 1] = 1;
    for (let i = 0; i < n; i++) M[n - 1][i] = -sys.a[i];
    const uIndex = n + (type === 'cosine' ? 1 : 0);
    if (n) M[n - 1][uIndex] = 1;
    if (osc) { M[n][n + 1] = w * T; M[n + 1][n] = -w * T; } // [sin, cos] oscillator in scaled time
    const Phi = expm(M.map(r => r.map(v => v * dt / T)));

    const X = Array(size).fill(0);
    if (type === 'impulse') { if (n) X[n - 1] = amp / T; }
    else if (osc) X[n + 1] = amp; // sin = 0, cos = amp at t = 0
    else X[n] = amp;              // step, and the first half of the square wave
    const out = x => sys.C.reduce((s, c, i) => s + c * x[i], 0) + sys.D * (type === 'impulse' ? 0 : x[uIndex]);
    const inp = x => (type === 'impulse' ? 0 : x[uIndex]);

    const pre = (opts.preRoll ?? 0.06) * duration;
    const t = [-pre, 0], u = [0, 0], y = [0, 0];
    let state = X;
    for (let i = 0; i <= count; i++) {
      if (i > 0) state = matvec(Phi, state);
      if (type === 'square' && i > 0 && i % perHalf === 0) {
        t.push(i * dt); u.push(inp(state)); y.push(out(state)); // left limit at the edge
        state[n] = ((i / perHalf) % 2 ? -1 : 1) * amp;
      }
      const yi = out(state);
      if (!Number.isFinite(yi) || Math.abs(yi) > 1e12 * Math.max(1, Math.abs(amp))) throw Error('The response grows without bound in this window. Shorten the time window.');
      t.push(i * dt); u.push(inp(state)); y.push(yi);
    }
    return { t, u, y, direct: type === 'impulse' ? sys.D * amp : 0 };
  }

  const api = { add, mul, trim, impedance, divider, response, dcGain, magCrossings, phaseCrossing, roots, simulate, expm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window === 'undefined' ? {} : window);
