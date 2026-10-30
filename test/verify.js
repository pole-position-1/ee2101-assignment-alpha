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

// ---------- matric number -> X, Y, Z ----------
{
  const p = E.parseMatric(' a1234567b ');
  checks++; if (!p || p.id !== 'A1234567B' || p.X !== 7 || p.Y !== 6 || p.Z !== 5) { failures++; console.log('FAIL parseMatric A1234567B', p); }
  const q = E.parseMatric('U2000000K'); // all three digits zero -> substitutes
  checks++; if (!q || q.X !== 4 || q.Y !== 5 || q.Z !== 2) { failures++; console.log('FAIL parseMatric zero substitutes', q); }
  checks++; if (E.parseMatric('AB12') !== null || E.parseMatric('') !== null || E.parseMatric('A12-345B') !== null) { failures++; console.log('FAIL parseMatric rejects bad input'); }
}

// ---------- branch impedance at jω, series and parallel ----------
{
  const w = 2 * Math.PI * 13.56e6, Rs = 50, RL = 500, Q = Math.sqrt(RL / Rs - 1);
  const Lv = Q * Rs / w, Cv = Q / (w * RL);
  // Part B L-match: Z1 = Rs + L, Z2 = RL || C; jωL + Z2 should be exactly Rs
  const z2 = E.branchAt([R(RL), C(Cv)], 'parallel', w);
  close('B: Re{Z2}', z2.re, Rs, 1e-12);
  close('B: Im{Z2}', z2.im, -Q * Rs, 1e-12);
  const zm = E.cadd({ re: 0, im: w * Lv }, z2);
  close('B: Re{Zmatch} = Rs', zm.re, Rs, 1e-12);
  close('B: Im{Zmatch} = 0', zm.im, 0, 1e-9);
  // H from phasors agrees with H from the polynomial model
  const z1 = E.branchAt([R(Rs), L(Lv)], 'series', w);
  const h = E.cdiv(z2, E.cadd(z1, z2)), m = E.divider([R(Rs), L(Lv)], 'series', [R(RL), C(Cv)], 'parallel'), r = E.response(m, w);
  close('B: phasor H re', h.re, r.re, 1e-9);
  close('B: phasor H im', h.im, r.im, 1e-9);
  // Part A trap: series LC is a short at its resonance
  const w0 = 2 * Math.PI * 50, La = 1, Ca = 1 / (w0 * w0 * La);
  const zt = E.branchAt([L(La), C(Ca)], 'series', w0);
  close('A: series LC at resonance', Math.hypot(zt.re, zt.im), 0, 1e-9);
  const zo = E.branchAt([L(La), C(Ca)], 'parallel', w0);
  checks++; if (!(Math.hypot(zo.re, zo.im) > 1e12)) { failures++; console.log('FAIL parallel LC at resonance is open', zo); }
}

// ---------- zero-pole factor phase, including RHP and jω-axis zeros ----------
{
  const wp = 1000, wz = 4000, D = 180 / Math.PI;
  const rhp = w => E.zpkResponse(1, [{ re: wz, im: 0 }], [{ re: -wp, im: 0 }], w);
  const lhp = w => E.zpkResponse(1, [{ re: -wz, im: 0 }], [{ re: -wp, im: 0 }], w);
  // An RHP zero alone: +20 dB/dec like an LHP zero, but phase lags to −90°
  const z1 = w => E.zpkResponse(1, [{ re: wz, im: 0 }], [], w);
  close('RHP zero slope', 20 * Math.log10(z1(1e4 * wz).mag / z1(1e3 * wz).mag), 20, 1e-6);
  close('RHP zero phase at ωz', z1(wz).phase, -45, 1e-12);
  close('RHP zero phase at 1e4 ωz', z1(1e4 * wz).phase, -90 + Math.atan(1e-4) * D, 1e-9);
  close('LHP zero phase at ωz', E.zpkResponse(1, [{ re: -wz, im: 0 }], [], wz).phase, 45, 1e-12);
  // Same magnitude as the LHP mirror, phase −atan(ω/ωz) − atan(ω/ωp) → −180°
  [10, 1e3, 3e3, 1e5, 1e8].forEach(w => {
    close(`RHP |H| = LHP |H| at ${w}`, rhp(w).mag, lhp(w).mag, 1e-12);
    close(`RHP ∠H at ${w}`, rhp(w).phase, -(Math.atan(w / wz) + Math.atan(w / wp)) * D, 1e-9);
  });
  // Magnitude agrees with the polynomial model; phase agrees modulo 360°
  const m = { n: [1, -1 / wz], d: [1, 1 / wp] };
  [10, 2e3, 1e6].forEach(w => {
    const a = rhp(w), b = E.response(m, w);
    close(`RHP zpk vs polynomial |H| at ${w}`, a.mag, b.mag, 1e-12);
    close(`RHP zpk vs polynomial ∠H at ${w}`, ((a.phase - b.phase) % 360 + 540) % 360 - 180, 0, 1e-9);
  });
  // RHP complex pair lags to −180°, LHP pair leads to +180°, continuously
  const pair = (re, im) => [{ re, im }, { re, im: -im }];
  let prev = 0, jump = 0;
  for (let i = 0; i <= 400; i++) {
    const w = 10 ** (1 + 5 * i / 400), ph = E.zpkResponse(1, pair(500, 3000), [], w).phase;
    jump = Math.max(jump, Math.abs(ph - prev)); prev = ph;
  }
  close('RHP pair phase is continuous', jump < 20 ? 0 : jump, 0, 0);
  close('RHP pair phase → −180°', E.zpkResponse(1, pair(500, 3000), [], 1e9).phase, -180, 1e-4);
  close('LHP pair phase → +180°', E.zpkResponse(1, pair(-500, 3000), [], 1e9).phase, 180, 1e-4);
  // jω-axis pair: a perfect notch with a 180° phase step
  const notch = w => E.zpkResponse(1, pair(0, 3000), [], w);
  close('jω pair |H| at ωn', notch(3000).mag, 0, 1e-12);
  close('jω pair ∠H below ωn', notch(2999).phase, 0, 1e-12);
  close('jω pair ∠H above ωn', notch(3001).phase, 180, 1e-12);
}

// ---------- complex-conjugate poles ----------
{
  const wn = 2000, D = 180 / Math.PI;
  [0.05, 0.2, 0.5, 0.9].forEach(zeta => {
    const p = [{ re: -zeta * wn, im: wn * Math.sqrt(1 - zeta * zeta) }, { re: -zeta * wn, im: -wn * Math.sqrt(1 - zeta * zeta) }];
    const h = w => E.zpkResponse(1, [], p, w);
    // closed forms for 1/(1 + 2ζ s/ωn + (s/ωn)²)
    close(`pair ζ=${zeta}: |H(jωn)| = 1/(2ζ)`, h(wn).mag, 1 / (2 * zeta), 1e-12);
    close(`pair ζ=${zeta}: ∠H(jωn) = −90°`, h(wn).phase, -90, 1e-9);
    [0.1, 0.7, 3, 50].forEach(x => {
      const w = x * wn, want = -Math.atan2(2 * zeta * x, 1 - x * x) * D;
      close(`pair ζ=${zeta}: ∠H at ${x}ωn`, h(w).phase, want, 1e-9);
      close(`pair ζ=${zeta}: |H| at ${x}ωn`, h(w).mag, 1 / Math.hypot(1 - x * x, 2 * zeta * x), 1e-12);
    });
    close(`pair ζ=${zeta}: −40 dB/dec`, 20 * Math.log10(h(1e5 * wn).mag / h(1e4 * wn).mag), -40, 1e-6);
    if (zeta < Math.SQRT1_2) close(`pair ζ=${zeta}: peak 1/(2ζ√(1−ζ²))`, h(wn * Math.sqrt(1 - 2 * zeta * zeta)).mag, 1 / (2 * zeta * Math.sqrt(1 - zeta * zeta)), 1e-12);
  });
  // complex zeros over complex poles: equal pairs cancel exactly
  const pr = [{ re: -300, im: 1500 }, { re: -300, im: -1500 }];
  close('pair/pair cancellation', E.zpkResponse(2, pr, pr, 1234).mag, 2, 1e-12);
  close('pair/pair cancellation phase', E.zpkResponse(2, pr, pr, 1234).phase, 0, 1e-12);
}

// ---------- dual-tone steady state by superposition ----------
{
  // RC low-pass, then compare with the exact causal response long after switch-on
  const R1 = 1e3, Cv = 1e-6, wc = 1 / (R1 * Cv), w0 = 2 * wc;
  const m = E.divider([R(R1)], 'series', [C(Cv)], 'series');
  const list = [{ amp: 1, w: 0.1 * w0, phase: 0 }, { amp: 5, w: w0, phase: -60 }];
  const ss = E.tones(m, list, 1e-2);
  const H = w => 1 / Math.hypot(1, w / wc), P = w => -Math.atan(w / wc);
  const want = t => H(0.1 * w0) * Math.cos(0.1 * w0 * t + P(0.1 * w0)) + 5 * H(w0) * Math.cos(w0 * t - Math.PI / 3 + P(w0));
  close('dual-tone v_out', maxErr(ss, want, -1), 0, 1e-12);
  close('dual-tone v_in(0)', ss.u[0], 1 + 5 * Math.cos(-Math.PI / 3), 1e-12);
  // 5 sin(ω0 t + 30°) is 5 cos(ω0 t − 60°)
  close('dual-tone sine form', ss.u[7] - Math.cos(0.1 * w0 * ss.t[7]), 5 * Math.sin(w0 * ss.t[7] + Math.PI / 6), 1e-12);
  // after 40 τ the causal cosine/sine responses match the steady state
  const win = 40 / wc, a = E.simulate(m, { type: 'cosine', amp: 1, w: 0.1 * w0 }, win, { samples: 20000, preRoll: 0 });
  const b = E.simulate(m, { type: 'cosine', amp: 5, w: w0 }, win, { samples: 20000, preRoll: 0 });
  const c = E.simulate(m, { type: 'sine', amp: 5, w: w0 }, win, { samples: 20000, preRoll: 0 });
  const k = a.t.length - 1, tk = a.t[k];
  const causal = a.y[k] + Math.cos(-Math.PI / 3) * b.y[k] - Math.sin(-Math.PI / 3) * c.y[k];
  close('dual-tone vs causal at 40τ', causal, want(tk), 1e-9);
  // a series-LC trap tuned to ω0 removes the hum completely
  const w50 = 2 * Math.PI * 50, trap = E.divider([R(1e3)], 'series', [L(1), C(1 / (w50 * w50))], 'series');
  const tr = E.tones(trap, [{ amp: 1, w: 0.1 * w50, phase: 0 }, { amp: 5, w: w50, phase: -60 }], 0.4);
  close('trap: hum at output', tr.parts[1].outAmp, 0, 1e-9);
}

// ---------- Smith chart L-match: shunt C then series L ----------
{
  const w = 5e5, RL = 500, d = E.lmatchDesign(RL, w);
  close('smith: Q', d.Q, 3, 1e-12);
  close('smith: C', d.C, 12e-9, 1e-12);
  close('smith: L', d.L, 0.3e-3, 1e-12);
  const m = E.lmatch(RL, w, d.C, d.L);
  close('smith: Re Z2 = Z0', m.Z2.re, 50, 1e-9);
  close('smith: Im Z2', m.Z2.im, -150, 1e-9);
  close('smith: Zmatch = 50', Math.hypot(m.Zm.re - 50, m.Zm.im), 0, 1e-9);
  close('smith: |Γ| at match', m.mag, 0, 1e-12);
  close('smith: VSWR at match', m.vswr, 1, 1e-12);
  close('smith: |Vout/Vin| at match = ½√(R_L/R_S)', m.gain, Math.sqrt(RL / 50) / 2, 1e-12);
  close('smith: |Vout/Vin| unmatched = R_L/(R_S+R_L)', E.lmatch(RL, w, 0, 0).gain, RL / 550, 1e-12);
  // gain agrees with the sandbox divider Z1 = R_S + L, Z2 = R_L ∥ C
  close('smith: gain vs divider', E.response(E.divider([R(50), L(d.L)], 'series', [R(RL), C(d.C)], 'parallel'), w).mag, m.gain, 1e-9);
  const n = E.lmatch(RL, w, 0, 0);
  close('smith: unmatched Γ', n.gamma.re, 450 / 550, 1e-12);
  close('smith: unmatched VSWR = R_L/Z0', n.vswr, 10, 1e-9);
  for (const R of [100, 731, 2000]) {
    const g = E.lmatch(R, 2e6, E.lmatchDesign(R, 2e6).C, E.lmatchDesign(R, 2e6).L);
    close('smith: match R_L=' + R, g.mag, 0, 1e-9);
    // shunt C keeps the load conductance: Re(1/Z2) = 1/R_L
    close('smith: constant-g arc R_L=' + R, E.cdiv({ re: 1, im: 0 }, g.Z2).re, 1 / R, 1e-15);
  }
  close('smith: |Γ| = 1 for pure reactance', Math.hypot(E.reflect({ re: 0, im: 37 }).re, E.reflect({ re: 0, im: 37 }).im), 1, 1e-12);
}

// ---------- amplifier compensation: A(s) = −V2/Vs, assignment acceptance values ----------
{
  const base = { R1: 10e3, gm: 1e-3, R2: 100e3, C1: 100e-12, C2: 10e-12 };
  const unity = a => {
    const ws = E.magCrossings(a, 1, 1, 1e12, 8000);
    return ws.map(w => ({ f: w / (2 * Math.PI), ph: E.unwrappedPhase(a, a.zeros, a.poles, w) }));
  };
  const table = [[0, 0, 1.5836e6, -168.5], [10e-12, 0, 905.2e3, -135.2], [20e-12, 0, 594.0e3, -120.0], [10e-12, 1e3, 909.8e3, -133.1], [10e-12, 2e3, 916.3e3, -131.0]];
  for (const [Cc, Rz, f, ph] of table) {
    const a = E.ampLoop({ ...base, Cc, Rz }), u = unity(a), tag = `amp Cc=${Cc * 1e12}p Rz=${Rz}`;
    close(tag + ': DC gain 100 V/V', a.k0, 100, 1e-12);
    close(tag + ': one unity crossing', u.length, 1, 0);
    close(tag + ': unity f', u[0].f / f, 1, 6e-5);
    close(tag + ': phase there', u[0].ph, ph, 0.05);
  }
  const p0 = E.ampLoop(base);
  close('amp off: double pole', Math.max(...p0.poles.map(p => Math.abs(p.re + 1e6) + Math.abs(p.im))), 0, 1);
  close('amp off: no zero', p0.zeros.length, 0, 0);
  const p10 = E.ampLoop({ ...base, Cc: 10e-12 });
  close('amp 10p: p1', p10.poles[0].re, -7.7294e4, 0.5);
  close('amp 10p: p2', p10.poles[1].re, -6.1608e6, 50);
  close('amp 10p: RHP zero +1e8', p10.zeros[0].re, 1e8, 1e-3);
  close('amp 1k: no finite zero', E.ampLoop({ ...base, Cc: 10e-12, Rz: 1e3 }).zeros.length, 0, 0);
  const p2k = E.ampLoop({ ...base, Cc: 10e-12, Rz: 2e3 });
  close('amp 2k: LHP zero −1e8', p2k.zeros[0].re, -1e8, 1e-3);
  close('amp 2k: three poles', p2k.poles.length, 3, 0);
  close('amp 20p: phase target met', unity(E.ampLoop({ ...base, Cc: 20e-12 }))[0].ph >= -135, 1, 0);
  close('amp 10p: phase target missed', unity(p10)[0].ph >= -135, 0, 0);
  // the closed form against direct two-node nodal analysis at complex s
  for (const p of [{ ...base, Cc: 10e-12, Rz: 2e3 }, { R1: 19e3, gm: 9e-3, R2: 100e3, C1: 100e-12, C2: 10e-12, Cc: 3.3e-12, Rz: 470 }]) {
    for (const w of [1e3, 3e5, 2e7, 1e9]) {
      const s = { re: 0.3 * w, im: w }, G1 = 1 / p.R1, G2 = 1 / p.R2;
      const Yc = E.cdiv({ re: s.re * p.Cc, im: s.im * p.Cc }, { re: 1 + s.re * p.Rz * p.Cc, im: s.im * p.Rz * p.Cc }); // sCc/(1 + sRzCc)
      // [Y11 Y12; Y21 Y22][V1; V2] = [G1·Vs; 0], with the gm·V1 sink in row 2
      const Y11 = E.cadd({ re: G1 + s.re * p.C1, im: s.im * p.C1 }, Yc), Y12 = { re: -Yc.re, im: -Yc.im };
      const Y21 = { re: p.gm - Yc.re, im: -Yc.im }, Y22 = E.cadd({ re: G2 + s.re * p.C2, im: s.im * p.C2 }, Yc);
      const det = E.cadd(E.cmul(Y11, Y22), { re: -E.cmul(Y12, Y21).re, im: -E.cmul(Y12, Y21).im });
      const V2 = E.cdiv(E.cmul({ re: -G1, im: 0 }, Y21), det); // Vs = 1
      const a = E.ampLoop(p), ev = (q, z) => q.reduceRight((acc, c) => E.cadd(E.cmul(acc, z), { re: c, im: 0 }), { re: 0, im: 0 });
      const F = E.cdiv(ev(a.n, s), ev(a.d, s));
      close('amp nodal check ω=' + w, Math.hypot(F.re + V2.re, F.im + V2.im) / Math.hypot(F.re, F.im), 0, 1e-12);
    }
  }
  // poles from the polynomial really are roots, even when they span 4 decades
  for (const r of p2k.poles) {
    const v = p2k.d.reduceRight((acc, c) => E.cadd(E.cmul(acc, r), { re: c, im: 0 }), { re: 0, im: 0 });
    const scale = p2k.d.reduce((s2, c, i) => s2 + Math.abs(c) * Math.hypot(r.re, r.im) ** i, 0);
    close('amp pole residual ' + r.re.toExponential(2), Math.hypot(v.re, v.im) / scale, 0, 1e-12);
  }
}

// ---------- unity-gain buffer: three-pole model with a set phase at |A| = 1 ----------
{
  const wu = 2 * Math.PI * 1e6, K0 = 100;
  for (const phi of [-100, -135, -168, -180, -190, -195]) {
    const m = E.bufferModel(phi, wu, K0), r = E.response(m, wu);
    close(`buffer ${phi}: |A(jωu)| = 1`, r.mag, 1, 1e-12);
    close(`buffer ${phi}: ∠A(jωu)`, E.unwrappedPhase(m, m.zeros, m.poles, wu), phi, 1e-9);
    const u = E.magCrossings(m, 1, 1, 1e14, 12000);
    close(`buffer ${phi}: one unity crossing`, u.length, 1, 0);
    close(`buffer ${phi}: crossing at ωu`, u[0], wu, 1e-9);
    const cl = E.unityFeedback(m);
    close(`buffer ${phi}: closed-loop DC gain K0/(1+K0)`, E.dcGain(cl), K0 / (1 + K0), 1e-12);
    // H_CL = A/(1 + A) at a test frequency, from the open loop directly
    const w = 0.7 * wu, F = E.response(m, w), H = E.response(cl, w);
    const want = E.cdiv({ re: F.re, im: F.im }, { re: 1 + F.re, im: F.im });
    close(`buffer ${phi}: H_CL = A/(1+A)`, Math.hypot(H.re - want.re, H.im - want.im) / Math.hypot(want.re, want.im), 0, 1e-12);
    const maxRe = Math.max(...E.polishedRoots(cl.d).map(p => p.re)) / wu;
    if (phi > -180) close(`buffer ${phi}: closed loop stable`, +(maxRe < -1e-3), 1, 0);
    if (phi < -180) close(`buffer ${phi}: closed loop has RHP poles`, +(maxRe > 1e-3), 1, 0);
  }
  // −90°: a true single-pole amplifier; the step is a plain exponential, no overshoot
  {
    const m = E.bufferModel(-90, wu, K0);
    close('buffer −90: one pole', m.poles.length, 1, 0);
    close('buffer −90: |A(jωu)| = 1', E.response(m, wu).mag, 1, 1e-12);
    close('buffer −90: phase −atan(√(K0² − 1))', E.response(m, wu).phase, -Math.atan(Math.sqrt(K0 * K0 - 1)) * 180 / Math.PI, 1e-9);
    const s = E.simulate(E.unityFeedback(m), { type: 'step', amp: 1 }, 10 / 1e6);
    close('buffer −90: no overshoot', +(Math.max(...s.y) <= K0 / (1 + K0) * (1 + 1e-9)), 1, 0);
  }
  // −180°: 1 + F(jωu) = 0, so ±jωu are closed-loop poles and the step rings forever at fu
  const m = E.bufferModel(-180, wu, K0), cl = E.unityFeedback(m), Fu = E.response(m, wu);
  close('buffer −180: 1 + A(jωu) = 0', Math.hypot(1 + Fu.re, Fu.im), 0, 1e-12);
  const top = E.polishedRoots(cl.d).filter(p => p.im > 0)[0];
  close('buffer −180: pole real part', top.re / wu, 0, 1e-9);
  close('buffer −180: pole at +jωu', top.im, wu, 1e-9);
  const sim = E.simulate(cl, { type: 'step', amp: 1 }, 20 / 1e6, { samples: 8000 });
  const swing = (a, b) => { const ys = sim.y.filter((_, i) => sim.t[i] >= a && sim.t[i] < b); return Math.max(...ys) - Math.min(...ys); };
  close('buffer −180: oscillation neither grows nor decays', swing(16e-6, 20e-6), swing(12e-6, 16e-6), 1e-4);
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
