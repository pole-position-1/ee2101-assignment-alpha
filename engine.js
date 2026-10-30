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

  // ---------- phasors ----------
  const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
  const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const cdiv = (a, b) => { const q = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / q, im: (a.im * b.re - a.re * b.im) / q }; };
  // Impedance of one branch at s = jω as a complex number. Series parts add as
  // Z = R + jωL + 1/(jωC); parallel parts add as Y = 1/R + 1/(jωL) + jωC.
  function branchAt(list, mode, w) {
    const z = c => {
      impedance(c);
      return c.type === 'R' ? { re: c.value, im: 0 } : c.type === 'L' ? { re: 0, im: w * c.value } : { re: 0, im: -1 / (w * c.value) };
    };
    if (mode !== 'parallel') return list.map(z).reduce(cadd, { re: 0, im: 0 });
    const y = list.map(c => cdiv({ re: 1, im: 0 }, z(c))).reduce(cadd, { re: 0, im: 0 });
    return y.re === 0 && y.im === 0 ? { re: Infinity, im: 0 } : cdiv({ re: 1, im: 0 }, y);
  }

  // ---------- frequency response ----------
  // Angle (rad) of the factor (1 − s/r) at s = jω, i.e. arg(jω − r) − arg(−r),
  // both from atan2. For a root in the right half plane jω − r always points
  // left, so atan2 is taken on [0, 2π) there to stay continuous in ω: an RHP
  // zero then lags towards −90° instead of jumping by 360°.
  function factorAngle(r, w) {
    let a = Math.atan2(w - r.im, -r.re), b = Math.atan2(-r.im, -r.re);
    if (r.re > 0) { if (a < 0) a += 2 * Math.PI; if (b < 0) b += 2 * Math.PI; }
    return a - b;
  }
  // H(jω) for H(s) = K0 Π(1 − s/z) / Π(1 − s/p), built factor by factor so the
  // phase is continuous (unlike atan2 of the whole H, which wraps at ±180°).
  function zpkResponse(k, zeros, poles, w) {
    let mag = Math.abs(k), ph = k < 0 ? Math.PI : 0;
    for (const z of zeros) { mag *= Math.hypot(z.re, w - z.im) / Math.hypot(z.re, z.im); ph += factorAngle(z, w); }
    for (const p of poles) { mag /= Math.hypot(p.re, w - p.im) / Math.hypot(p.re, p.im); ph -= factorAngle(p, w); }
    return { mag, phase: ph * 180 / Math.PI };
  }

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
  function magCrossings(m, level, lo, hi, N = 3000) {
    const f = w => response(m, w).mag - level, out = [];
    let wPrev = lo, yPrev = f(lo);
    for (let i = 1; i <= N; i++) {
      const w = lo * (hi / lo) ** (i / N), y = f(w);
      if (Number.isFinite(y) && Number.isFinite(yPrev) && yPrev * y < 0) out.push(bisect(f, wPrev, w, yPrev));
      wPrev = w; yPrev = y;
    }
    return out;
  }
  // −3 dB frequency relative to `ref` (normally the DC gain). The search spans a
  // fixed, very wide band so it never depends on how the roots were estimated.
  function cutoff(m, ref) {
    if (!(ref > 0 && Number.isFinite(ref))) return null;
    return magCrossings(m, ref / Math.SQRT2, 1e-4, 1e13, 8500)[0] || null;
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

  /*
   * AC steady state for a sum of tones amp·cos(ωt + phase°), by superposition:
   * each tone comes out scaled by |H(jω)| and shifted by ∠H(jω). There is no
   * switch-on transient; the tones are taken to have been on forever.
   * Returns arrays t, u, y from t = 0, and per-tone gains in `parts`.
   */
  function tones(m, list, duration, samples = 4000) {
    if (!(duration > 0 && Number.isFinite(duration))) throw Error('Enter a positive time window.');
    if (!list.every(x => x.w > 0 && Number.isFinite(x.w))) throw Error('Enter a positive frequency.');
    const wMax = Math.max(...list.map(x => x.w));
    const count = Math.min(60000, Math.max(samples, Math.ceil(duration * wMax / (2 * Math.PI) * 48)));
    const rad = Math.PI / 180;
    const parts = list.map(x => {
      const r = response(m, x.w);
      if (!Number.isFinite(r.mag)) throw Error('The circuit has a pole on the jω axis at one of the tone frequencies.');
      return { ...x, mag: r.mag, dphase: r.phase, outAmp: x.amp * r.mag, outPhase: x.phase + r.phase };
    });
    const t = [], u = [], y = [];
    for (let i = 0; i <= count; i++) {
      const ti = duration * i / count;
      t.push(ti);
      u.push(parts.reduce((s, p) => s + p.amp * Math.cos(p.w * ti + p.phase * rad), 0));
      y.push(parts.reduce((s, p) => s + p.outAmp * Math.cos(p.w * ti + p.outPhase * rad), 0));
    }
    return { t, u, y, parts };
  }

  // Assignment parameters from a matric number such as A1234567B: the last three
  // digits give X (last), Y (second-to-last) and Z (third-to-last), with a 0
  // replaced by 4, 5 and 2 respectively. Returns null if it is not usable.
  function parseMatric(s) {
    const id = String(s || '').toUpperCase().replace(/\s+/g, ''), d = id.replace(/\D/g, '');
    if (!/^[A-Z0-9]{4,15}$/.test(id) || d.length < 3) return null;
    const pick = (i, sub) => +d[d.length - i] || sub;
    return { id, X: pick(1, 4), Y: pick(2, 5), Z: pick(3, 2) };
  }

  // ---------- two-node amplifier with a compensation branch ----------
  // V1: R1 from the source Vs, C1 to ground. V2: R2, C2 and a g_m·V1 current
  // sink to ground. The compensation branch Cc (in series with Rz) joins V1 to V2.
  // Returns the open-loop gain A(s) = −V2/Vs used in the stability test. The
  // test inverts V2 with an ideal, non-loading stage (Vo = −V2) and closes unity
  // negative feedback (Vs = Vref − Vo), so A is the loop gain and its phase
  // starts near 0°:
  //   A = G1[gm + sCc(gm·Rz − 1)] / {(1 + sRzCc)(G1 + sC1)(G2 + sC2) + sCc[G1 + G2 + gm + s(C1 + C2)]}
  // Cc = 0 is the uncompensated amplifier. Roots are in rad/s.
  function ampLoop({ R1, gm, R2, C1, C2, Cc = 0, Rz = 0 }) {
    const G1 = 1 / R1, G2 = 1 / R2;
    // gm·Rz = 1 cancels the s term exactly: no finite zero
    const kz = Math.abs(gm * Rz - 1) < 1e-9 ? 0 : gm * Rz - 1;
    const n = trim([G1 * gm, G1 * Cc * kz]);
    const d = trim(add(mul(mul([1, Rz * Cc], [G1, C1]), [G2, C2]), mul([0, Cc], [G1 + G2 + gm, C1 + C2])));
    const m = { n, d };
    return { ...m, k0: n[0] / d[0], zeros: polishedRoots(n), poles: polishedRoots(d) };
  }
  // Roots refined by a few Newton steps on the original polynomial, so roots
  // decades apart (10⁴ and 10⁹ rad/s) keep full relative accuracy.
  function polishedRoots(p) {
    return roots(p).map(r => {
      for (let i = 0; i < 8; i++) {
        const v = evalAt(p, r.re, r.im), dv = evalAt(p.slice(1).map((c, k) => c * (k + 1)), r.re, r.im);
        if (!(dv.re || dv.im)) break;
        const st = cdiv(v, dv), nr = { re: r.re - st.re, im: r.im - st.im };
        if (!Number.isFinite(nr.re) || !Number.isFinite(nr.im)) break;
        r = nr;
      }
      return Math.abs(r.im) < 1e-7 * Math.hypot(r.re, r.im) ? { re: r.re, im: 0 } : r;
    });
  }
  // Continuous phase in degrees: the exact angle of n/d, moved by whole turns to
  // the factor-by-factor (unwrapped) estimate built from the roots.
  function unwrappedPhase(m, zeros, poles, w) {
    const exact = response(m, w).phase, guide = zpkResponse(m.n[0] / m.d[0], zeros, poles, w).phase;
    return exact + 360 * Math.round((guide - exact) / 360);
  }

  // ---------- unity-gain buffer ----------
  // Open-loop A(s) = K0 / [(1 + s/p1)(1 + s/p2)²] with |A(jωu)| = 1 and
  // ∠A(jωu) = φu exactly. The dominant pole p1 sets the gain and the repeated
  // pole p2 supplies the rest of the lag; the two conditions are applied in turn
  // until they agree, which converges fast because p1 ≪ ωu. For φu ≥ −90° the
  // pair is dropped: a single-pole amplifier, whose phase at ωu is
  // −atan(√(K0² − 1)), just short of −90°.
  function bufferModel(phiDeg, wu, K0 = 100) {
    let p1 = wu / K0, p2 = Infinity;
    for (let i = 0; i < 80; i++) {
      const lag = -phiDeg * Math.PI / 180 - Math.atan(wu / p1);
      p2 = lag > 1e-12 && phiDeg < -90 ? wu / Math.tan(lag / 2) : Infinity;
      const pair = Number.isFinite(p2) ? 1 + (wu / p2) ** 2 : 1;
      p1 = wu / Math.sqrt((K0 / pair) ** 2 - 1);
    }
    const d = Number.isFinite(p2) ? mul([1, 1 / p1], mul([1, 1 / p2], [1, 1 / p2])) : [1, 1 / p1];
    const poles = [{ re: -p1, im: 0 }].concat(Number.isFinite(p2) ? [{ re: -p2, im: 0 }, { re: -p2, im: 0 }] : []);
    return { n: [K0], d, k0: K0, p1, p2, zeros: [], poles };
  }
  // Follower: V− = Vout, so Vd = Vin − Vout and Vout = F·Vd give
  // H_CL = A/(1 + A) = n/(n + d). Its poles are the roots of 1 + A(s) = 0.
  const unityFeedback = m => ({ n: m.n.slice(), d: add(m.n, m.d) });

  // Reflection coefficient Γ = (Z − Z0)/(Z + Z0); |Γ| = 1 for any lossless Z.
  const reflect = (Z, Z0 = 50) => cdiv({ re: Z.re - Z0, im: Z.im }, { re: Z.re + Z0, im: Z.im });

  // L-match of a resistive load R_L at ω: shunt C across the load first,
  // then L in series, so Z2 = R_L ∥ (1/jωC) and Zmatch = Z2 + jωL. gain is
  // |V_out/V_in| for a source V_in with R_S = Z0: |Z2| / |Z0 + Zmatch|.
  function lmatch(RL, w, C, L, Z0 = 50) {
    const Z2 = cdiv({ re: 1, im: 0 }, { re: 1 / RL, im: w * C });
    const Zm = cadd(Z2, { re: 0, im: w * L });
    const gamma = reflect(Zm, Z0), mag = Math.hypot(gamma.re, gamma.im);
    const gain = Math.hypot(Z2.re, Z2.im) / Math.hypot(Zm.re + Z0, Zm.im);
    return { Z2, Zm, gamma, mag, vswr: mag < 1 ? (1 + mag) / (1 - mag) : Infinity, gain };
  }
  // Exact design for R_L > Z0: Q = √(R_L/Z0 − 1), C = Q/(ωR_L), L = QZ0/ω.
  function lmatchDesign(RL, w, Z0 = 50) {
    const Q = Math.sqrt(RL / Z0 - 1);
    return { Q, C: Q / (w * RL), L: Q * Z0 / w };
  }

  const api = { add, mul, trim, impedance, divider, branchAt, cadd, cmul, cdiv, reflect, lmatch, lmatchDesign, ampLoop, bufferModel, unityFeedback, polishedRoots, unwrappedPhase, response, factorAngle, zpkResponse, dcGain, magCrossings, cutoff, phaseCrossing, roots, simulate, tones, parseMatric, expm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window === 'undefined' ? {} : window);
