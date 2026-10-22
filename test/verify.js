'use strict';
// Checks engine.js against closed-form results from the assignment and against
// independent numerical references. Run with: node test/verify.js
const E = require('../engine.js');

let failures = 0, checks = 0;
function close(label, got, want, tol = 1e-6) {
  checks++;
  const err = Math.abs(got - want) / Math.max(1e-12, Math.abs(want), tol > 1 ? 0 : 1e-300);
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want, 'relerr', err); }
}
const R = v => ({ type: 'R', value: v }), C = v => ({ type: 'C', value: v }), L = v => ({ type: 'L', value: v });
const at = (sim, time) => { // value just after `time` (right limit at edges)
  let i = sim.t.findIndex(x => x >= time - 1e-15 * Math.max(1, Math.abs(time)));
  while (i + 1 < sim.t.length && sim.t[i + 1] === sim.t[i]) i++;
  return { u: sim.u[i], y: sim.y[i], t: sim.t[i] };
};
function maxErr(sim, f, from = 0) {
  let e = 0;
  sim.t.forEach((t, i) => {
    if (t <= from) return;
    if (i + 1 < sim.t.length && sim.t[i + 1] === t) return; // skip left limits at edges
    e = Math.max(e, Math.abs(sim.y[i] - f(t)));
  });
  return e;
}

// ---------- Part A: loaded RC low-pass (Fig. 1) for a sample matric number ----------
// X = 7, Y = 6, Z = 5  ->  R1 = 17 kΩ, K0 = 0.6, ω-3dB = 5000 rad/s
{
  const R1 = 17e3, K0 = 0.6, wc = 5000;
  const R2 = K0 * R1 / (1 - K0);                 // 25.5 kΩ
  const Cv = 1 / (wc * (R1 * R2 / (R1 + R2)));   // 1/(ωp (R1||R2))
  const m = E.divider([R(R1)], 'series', [R(R2), C(Cv)], 'parallel');
  close('A: K0', E.dcGain(m), K0, 1e-12);
  const cuts = E.magCrossings(m, K0 / Math.SQRT2, 1, 1e9);
  close('A: one -3 dB crossing', cuts.length, 1, 0);
  close('A: ω-3dB', cuts[0], wc, 1e-9);
  close('A: phase -45° at ωp', E.phaseCrossing(m, -45, 1, 1e9), wc, 1e-9);
  const p = E.roots(m.d);
  close('A: pole', p[0].re, -wc, 1e-9);
  const r1 = E.response(m, wc);
  close('A: |H(jωc)|', r1.mag, K0 / Math.SQRT2, 1e-12);
  close('A: ∠H(jωc)', r1.phase, -45, 1e-9);
  const r10 = E.response(m, 10 * wc);
  close('A: |H(j10ωc)|', r10.mag, K0 / Math.sqrt(101), 1e-12);
  close('A: ∠H(j10ωc)', r10.phase, -Math.atan(10) * 180 / Math.PI, 1e-9);
  close('A: -20 dB/decade asymptote', 20 * Math.log10(E.response(m, 1e4 * wc).mag / E.response(m, 1e3 * wc).mag), -20, 1e-4);

  const tau = 1 / wc, win = 6 * tau;
  const step = E.simulate(m, { type: 'step', amp: 1 }, win);
  close('A: step error', maxErr(step, t => K0 * (1 - Math.exp(-wc * t))), 0, 1e-12);
  close('A: step v(0+)', at(step, 0).y, 0, 1e-12);
  const imp = E.simulate(m, { type: 'impulse', amp: 1 }, win);
  close('A: impulse h(0+)', at(imp, 0).y, K0 * wc, 1e-10);
  close('A: impulse error', maxErr(imp, t => K0 * wc * Math.exp(-wc * t)) / (K0 * wc), 0, 1e-12);
  close('A: impulse direct term', imp.direct, 0, 1e-15);

  // cos(ω0 t)u(t): partial fractions A/(s+ωp) + (Bs+C)/(s²+ω0²)
  for (const w0 of [wc, 10 * wc]) {
    const Acoef = -K0 * wc * wc / (wc * wc + w0 * w0);
    const r = E.response(m, w0), ph = r.phase * Math.PI / 180;
    const cosRef = t => Acoef * Math.exp(-wc * t) + r.mag * Math.cos(w0 * t + ph);
    const cs = E.simulate(m, { type: 'cosine', amp: 1, w: w0 }, 8 * tau);
    close('A: cos response ω0=' + w0, maxErr(cs, cosRef), 0, 1e-11);
    // sin(ω0 t)u(t): transient K0 ωp ω0/(ωp²+ω0²) e^{-ωp t}
    const sinRef = t => K0 * wc * w0 / (wc * wc + w0 * w0) * Math.exp(-wc * t) + r.mag * Math.sin(w0 * t + ph);
    const sn = E.simulate(m, { type: 'sine', amp: 1, w: w0 }, 8 * tau);
    close('A: sin response ω0=' + w0, maxErr(sn, sinRef), 0, 1e-11);
  }

  // Square wave ±1 V at ω0 = ωc, starting +1 at t = 0: piecewise exponential relaxation
  const w0 = wc, half = Math.PI / w0;
  const sq = E.simulate(m, { type: 'square', amp: 1, w: w0 }, 10 * half);
  const sqRef = t => {
    let y = 0, k = 0;
    for (; (k + 1) * half <= t + 1e-18; k++) { const x = k % 2 ? -1 : 1; y = K0 * x + (y - K0 * x) * Math.exp(-wc * half); }
    const x = k % 2 ? -1 : 1;
    return K0 * x + (y - K0 * x) * Math.exp(-wc * (t - k * half));
  };
  close('A: square response', maxErr(sq, sqRef), 0, 1e-11);
}

// ---------- Part B: 10× probe, R1 = 9 MΩ ∥ C1, R2 = 1 MΩ ∥ C2 = 90 pF ----------
{
  const R1 = 9e6, R2 = 1e6, C2 = 90e-12, K0 = 0.1;
  const bare = E.divider([R(R1)], 'series', [R(R2), C(C2)], 'parallel');
  const wpBare = 1 / ((R1 * R2 / (R1 + R2)) * C2);
  close('B1: K0', E.dcGain(bare), K0, 1e-12);
  close('B1: ω-3dB', E.magCrossings(bare, K0 / Math.SQRT2, 1, 1e10)[0], wpBare, 1e-9);
  close('B1: f-3dB ≈ 1.965 kHz', wpBare / (2 * Math.PI), 1964.8758, 1e-6);

  for (const [name, C1] of [['under', 2e-12], ['over', 30e-12], ['matched', 10e-12]]) {
    const m = E.divider([R(R1), C(C1)], 'parallel', [R(R2), C(C2)], 'parallel');
    const wz = 1 / (R1 * C1), wp = 1 / ((R1 * R2 / (R1 + R2)) * (C1 + C2));
    close('B3 ' + name + ': K0', E.dcGain(m), K0, 1e-12);
    // canonical form K0 (1 + s/ωz)/(1 + s/ωp)
    close('B3 ' + name + ': n1', m.n[1], K0 / wz, 1e-12);
    close('B3 ' + name + ': d1', m.d[1], 1 / wp, 1e-12);
    const win = 6 / wp;
    const step = E.simulate(m, { type: 'step', amp: 1 }, win);
    const ref = t => K0 * (1 + (wp / wz - 1) * Math.exp(-wp * t));
    close('B3 ' + name + ': step v(0+)', at(step, 0).y, K0 * wp / wz, 1e-12);
    close('B3 ' + name + ': v(0+) = C1/(C1+C2)', at(step, 0).y, C1 / (C1 + C2), 1e-12);
    close('B3 ' + name + ': step error', maxErr(step, ref), 0, 1e-12);
    close('B3 ' + name + ': final value', step.y[step.y.length - 1], ref(win), 1e-12);
    // 100 kHz sine: steady state from H(jω)
    const w0 = 2 * Math.PI * 1e5, r = E.response(m, w0);
    const Hjw = { mag: K0 * Math.hypot(1, w0 / wz) / Math.hypot(1, w0 / wp), ph: Math.atan(w0 / wz) - Math.atan(w0 / wp) };
    close('B3 ' + name + ': |H(j2π·100k)|', r.mag, Hjw.mag, 1e-12);
    close('B3 ' + name + ': ∠H', r.phase, Hjw.ph * 180 / Math.PI, 1e-9);
    // cos input: residue at -ωp is K0 (1 - ωp/ωz) ωp / (ωp² + ω0²) * (-ωp)... check against direct partial fractions
    const D = K0 * wp / wz; // direct feedthrough
    const res = (K0 * (1 - wp / wz) * wp) * (-wp) / (wp * wp + w0 * w0);
    const cosRef = t => res * Math.exp(-wp * t) + r.mag * Math.cos(w0 * t + r.phase * Math.PI / 180);
    const cs = E.simulate(m, { type: 'cosine', amp: 1, w: w0 }, 6 / wp);
    close('B3 ' + name + ': cos v(0+) = D', at(cs, 0).y, D, 1e-10);
    close('B3 ' + name + ': cos response', maxErr(cs, cosRef), 0, 1e-11);
    if (name === 'matched') {
      close('B3 matched: flat |H| at 1 GHz', E.response(m, 2 * Math.PI * 1e9).mag, K0, 1e-12);
      close('B3 matched: zero phase', E.response(m, 2 * Math.PI * 1e5).phase, 0, 1e-9);
      close('B3 matched: no -3 dB crossing', E.magCrossings(m, K0 / Math.SQRT2, 1, 1e12).length, 0, 0);
      const imp = E.simulate(m, { type: 'impulse', amp: 1 }, win);
      close('B3 matched: impulse = 0.1 δ(t) only', imp.direct, K0, 1e-12);
      close('B3 matched: no regular impulse part', Math.max(...imp.y.map(Math.abs)), 0, 1e-6);
    }
  }
}

// ---------- Random circuits: H(jω) vs a direct complex-impedance calculation ----------
{
  const cplx = (re, im = 0) => ({ re, im });
  const cadd = (a, b) => cplx(a.re + b.re, a.im + b.im);
  const cmul = (a, b) => cplx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => { const s = b.re * b.re + b.im * b.im; return cplx((a.re * b.re + a.im * b.im) / s, (a.im * b.re - a.re * b.im) / s); };
  const zOf = (c, w) => c.type === 'R' ? cplx(c.value) : c.type === 'L' ? cplx(0, w * c.value) : cplx(0, -1 / (w * c.value));
  const combine = (list, mode, w) => mode === 'series'
    ? list.map(c => zOf(c, w)).reduce(cadd)
    : cdiv(cplx(1), list.map(c => cdiv(cplx(1), zOf(c, w))).reduce(cadd));
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = () => {
    const t = 'RCL'[Math.floor(rnd() * 3)];
    const v = t === 'R' ? 10 ** (1 + 5 * rnd()) : t === 'C' ? 10 ** (-12 + 6 * rnd()) : 10 ** (-6 + 4 * rnd());
    return { type: t, value: v };
  };
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    const z1 = Array.from({ length: 1 + Math.floor(rnd() * 3) }, pick);
    const z2 = Array.from({ length: 1 + Math.floor(rnd() * 3) }, pick);
    const m1 = rnd() < .5 ? 'series' : 'parallel', m2 = rnd() < .5 ? 'series' : 'parallel';
    const m = E.divider(z1, m1, z2, m2);
    for (let j = 0; j < 12; j++) {
      const w = 10 ** (rnd() * 10);
      const Z1 = combine(z1, m1, w), Z2 = combine(z2, m2, w);
      const H = cdiv(Z2, cadd(Z1, Z2));
      const r = E.response(m, w);
      const e = Math.hypot(r.re - H.re, r.im - H.im) / Math.max(1e-12, Math.hypot(H.re, H.im));
      if (Number.isFinite(e)) worst = Math.max(worst, e);
    }
  }
  close('random circuits: worst relative H(jω) error', worst, 0, 1e-8);
}

// ---------- Second-order RLC: step response vs independent RK4 integration ----------
{
  // Z1 = R + L (series), Z2 = C  ->  H = 1/(LC s² + RC s + 1)
  for (const [Rv, Lv, Cv] of [[100, 10e-3, 100e-9], [1000, 10e-3, 100e-9], [20, 1e-3, 1e-6]]) {
    const m = E.divider([R(Rv), L(Lv)], 'series', [C(Cv)], 'series');
    const w0 = 1 / Math.sqrt(Lv * Cv), zeta = Rv / 2 * Math.sqrt(Cv / Lv);
    const win = Math.min(40, 12 / Math.max(1e-9, zeta)) / w0;
    const sim = E.simulate(m, { type: 'step', amp: 1 }, win);
    // RK4 on q'' = (1 - RC q' - q)/(LC), with fine steps
    const N = 200000, h = win / N;
    let q = 0, v = 0, worst = 0, idx = 2;
    const f = (q, v) => [v, (1 - Rv * Cv * v - q) / (Lv * Cv)];
    for (let i = 0; i <= N; i++) {
      const t = i * h;
      while (idx < sim.t.length && sim.t[idx] <= t + h / 2) {
        if (Math.abs(sim.t[idx] - t) < h / 2) worst = Math.max(worst, Math.abs(sim.y[idx] - q));
        idx++;
      }
      const k1 = f(q, v), k2 = f(q + h / 2 * k1[0], v + h / 2 * k1[1]), k3 = f(q + h / 2 * k2[0], v + h / 2 * k2[1]), k4 = f(q + h * k3[0], v + h * k3[1]);
      q += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); v += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    }
    close(`RLC step vs RK4 (ζ=${zeta.toFixed(3)})`, worst, 0, 1e-6);
    const p = E.roots(m.d);
    close(`RLC |p1 p2| = ω0² (ζ=${zeta.toFixed(3)})`, Math.hypot(p[0].re, p[0].im) * Math.hypot(p[1].re, p[1].im), w0 * w0, 1e-8);
  }
}

// ---------- error handling ----------
{
  let msg = '';
  try { E.divider([], 'series', [R(1)], 'series'); } catch (e) { msg = e.message; }
  checks++; if (!/Z₁/.test(msg)) { failures++; console.log('FAIL empty branch message', msg); }
  try { E.divider([R(0)], 'series', [R(1)], 'series'); msg = ''; } catch (e) { msg = e.message; }
  checks++; if (!/positive/.test(msg)) { failures++; console.log('FAIL zero value message', msg); }
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
