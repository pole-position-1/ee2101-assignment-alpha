'use strict';
/*
 * Section 4: Smith chart L-match playground, normalized to Z0 = 50 Ω.
 * A shunt C across the load moves z along the load's constant-conductance
 * circle; the series L then moves it along a constant-resistance circle. Both
 * arcs are drawn by sweeping the component from 0 to its value, so they are
 * exact rather than sketched.
 */
(function () {
  const $ = id => document.getElementById('sm-' + id);
  const { num } = Plot;
  const Z0 = 50, STEPS = 4000, LOCK = 0.5, STORE = 'ee2101-alpha-smith-v1';
  const COL = { grid: '#d5dbe5', g: 'rgba(124, 58, 237, .38)', gold: '#d4a017', load: '#1f2a3d', c: '#0891b2', l: '#c2410c', ok: '#059669' };
  const state = { RL: '500', w: '500000', C: '5', L: '0.1' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

  const niceUp = v => { const m = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].find(f => f * m >= v * (1 - 1e-9)) * m; };
  const norm = Z => ({ re: Z.re / Z0, im: Z.im / Z0 });
  const gam = z => Engine.reflect(z, 1);
  const zOf = G => Engine.cdiv({ re: 1 + G.re, im: G.im }, { re: 1 - G.re, im: -G.im });
  // drop floating-point residue such as j2.8e−14 left after an exact match
  const cx = (z, unit = '', d = 4) => {
    const tiny = 1e-9 * Math.max(1, Math.abs(z.re), Math.abs(z.im)), re = Math.abs(z.re) < tiny ? 0 : z.re, im = Math.abs(z.im) < tiny ? 0 : z.im;
    return `${num(re, d)} ${im < 0 ? '−' : '+'} j${num(Math.abs(im), d)}${unit}`;
  };
  const fix = (v, d) => v.toFixed(d).replace('-', '−');
  const short = v => String(Number(v.toPrecision(6)));

  let cur = null, mouse = null, range = { C: 50, L: 1 };

  // ---------- chart ----------
  const cv = $('chart');
  function draw() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = w / 2, oy = h / 2, R = Math.min(w, h) / 2 - 34;
    const P = G => [ox + R * G.re, oy - R * G.im];
    const circle = (a, b, r) => { g.beginPath(); g.arc(ox + R * a, oy - R * b, R * r, 0, 2 * Math.PI); };
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);

    // grid, clipped to |Γ| ≤ 1
    g.save();
    circle(0, 0, 1); g.fillStyle = '#fbfcfe'; g.fill(); g.clip();
    g.lineWidth = 1; g.strokeStyle = COL.grid;
    for (const r of [0.2, 0.5, 2, 5, 10]) { circle(r / (1 + r), 0, 1 / (1 + r)); g.stroke(); }
    for (const x of [0.2, 0.5, 1, 2, 5]) for (const s of [1, -1]) { circle(1, s / x, 1 / x); g.stroke(); }
    g.setLineDash([5, 4]); g.strokeStyle = COL.g;
    for (const c of [0.2, 0.5, 1, 2, 5]) { circle(-c / (1 + c), 0, 1 / (1 + c)); g.stroke(); }
    g.setLineDash([]);
    g.beginPath(); g.moveTo(ox - R, oy); g.lineTo(ox + R, oy); g.strokeStyle = '#9aa5b5'; g.stroke();
    g.lineWidth = 2.6; g.strokeStyle = COL.gold; circle(0.5, 0, 0.5); g.stroke();
    if (cur) { // whole paths each component can move along
      g.lineWidth = 1.4; g.setLineDash([2, 4]);
      const gl = Z0 / cur.RL, r2 = cur.z2.re;
      g.strokeStyle = COL.c; circle(-gl / (1 + gl), 0, 1 / (1 + gl)); g.stroke();
      g.strokeStyle = COL.l; circle(r2 / (1 + r2), 0, 1 / (1 + r2)); g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    g.lineWidth = 1.6; g.strokeStyle = COL.load; circle(0, 0, 1); g.stroke();

    // scale labels
    g.font = '10.5px system-ui, sans-serif'; g.textBaseline = 'bottom'; g.textAlign = 'center';
    g.fillStyle = '#6b7486';
    for (const r of [0.2, 0.5, 2, 5, 10]) { const [px, py] = P({ re: (r - 1) / (r + 1), im: 0 }); g.fillText(String(r), px, py - 3); }
    const [gx, gy] = P({ re: 0.5, im: 0.5 });
    g.font = '700 11.5px system-ui, sans-serif'; g.fillStyle = '#a37a00'; g.fillText('r = 1', gx, gy - 4);
    g.font = '10.5px system-ui, sans-serif'; g.fillStyle = '#6b7486'; g.textBaseline = 'middle';
    for (const x of [0.2, 0.5, 1, 2, 5]) for (const s of [1, -1]) {
      const d = x * x + 1, G = { re: (x * x - 1) / d, im: s * 2 * x / d };
      g.fillText((s > 0 ? '+j' : '−j') + x, ox + R * 1.09 * G.re, oy - R * 1.09 * G.im);
    }
    g.fillText('0', ox - R - 12, oy); g.fillText('∞', ox + R + 12, oy);

    // bullseye at z = 1 + j0
    const locked = cur && cur.locked;
    if (locked) { g.beginPath(); g.arc(ox, oy, 22, 0, 2 * Math.PI); g.fillStyle = 'rgba(5, 150, 105, .16)'; g.fill(); }
    g.strokeStyle = locked ? COL.ok : COL.gold; g.lineWidth = 2;
    for (const r of [14, 8]) { g.beginPath(); g.arc(ox, oy, r, 0, 2 * Math.PI); g.stroke(); }
    g.beginPath(); g.arc(ox, oy, 3, 0, 2 * Math.PI); g.fillStyle = g.strokeStyle; g.fill();

    if (cur) {
      const { RL, w0, C, L, z2 } = cur;
      const arc1 = sweep(t => norm(Engine.lmatch(RL, w0, t * C, 0, Z0).Z2));
      const arc2 = sweep(t => ({ re: z2.re, im: z2.im + t * w0 * L / Z0 }));
      path(arc1, COL.c); path(arc2, COL.l);
      dot(cur.zL, COL.load, 'z', 'L'); dot(z2, COL.c, 'z', '2'); dot(cur.zm, locked ? COL.ok : COL.l, 'z', 'match');
    }

    if (mouse) { // read the chart under the pointer
      const G = { re: (mouse.x - ox) / R, im: (oy - mouse.y) / R }, a = Math.hypot(G.re, G.im);
      if (a <= 1) {
        const z = zOf(G), lines = [`z = ${cx(z, '', 3)}`, `Z = ${cx({ re: z.re * Z0, im: z.im * Z0 }, ' Ω', 4)}`, `|Γ| = ${a.toFixed(3)}`];
        g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
        const bw = Math.max(...lines.map(s => g.measureText(s).width)) + 16;
        g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#c8d0db'; g.lineWidth = 1;
        g.beginPath(); g.roundRect(8, 8, bw, lines.length * 17 + 10, 6); g.fill(); g.stroke();
        g.fillStyle = COL.load; lines.forEach((s, i) => g.fillText(s, 16, 14 + i * 17));
      }
    }
    if (window.Watermark) Watermark.drawCanvas(g, 0, 0, w, h);

    function sweep(f, n = 160) { const pts = []; for (let i = 0; i <= n; i++) pts.push(P(gam(f(i / n)))); return pts; }
    function path(pts, color) {
      g.strokeStyle = color; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      const n = pts.length - 1, [x0, y0] = pts[0], [x1, y1] = pts[n];
      if (Math.hypot(x1 - x0, y1 - y0) < 24) return;
      const k = Math.round(n * 0.55), [ax, ay] = pts[k - 1], [bx, by] = pts[k + 1], t = Math.atan2(by - ay, bx - ax), [mx, my] = pts[k];
      g.fillStyle = color; g.beginPath();
      g.moveTo(mx + 7 * Math.cos(t), my + 7 * Math.sin(t));
      g.lineTo(mx - 6 * Math.cos(t) + 5 * Math.sin(t), my - 6 * Math.sin(t) - 5 * Math.cos(t));
      g.lineTo(mx - 6 * Math.cos(t) - 5 * Math.sin(t), my - 6 * Math.sin(t) + 5 * Math.cos(t));
      g.fill();
    }
    function dot(z, color, main, sub) {
      const G = gam(z), [x, y] = P(G);
      g.beginPath(); g.arc(x, y, 6, 0, 2 * Math.PI); g.fillStyle = color; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      // label pushed outward from the centre so it clears the arcs
      let dx = x - ox, dy = y - oy; const d = Math.hypot(dx, dy);
      let off = 16;
      if (d < 26) { dx = 0.75; dy = -0.66; off = 26 - d * 0.4; } else { dx /= d; dy /= d; }
      if (sub === 'L') { dx = 0.35; dy = 0.94; }
      const tx = x + dx * off, ty = y + dy * off;
      g.font = 'italic 600 16px KaTeX_Math, "Times New Roman", serif';
      const w1 = g.measureText(main).width;
      g.font = '600 11px KaTeX_Main, "Times New Roman", serif';
      const w2 = g.measureText(sub).width, lx = dx < -0.3 ? tx - w1 - w2 : dx > 0.3 ? tx : tx - (w1 + w2) / 2;
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.fillStyle = color;
      g.font = 'italic 600 16px KaTeX_Math, "Times New Roman", serif';
      g.strokeText(main, lx, ty); g.fillText(main, lx, ty);
      g.font = '600 11px KaTeX_Main, "Times New Roman", serif';
      g.strokeText(sub, lx + w1 + 1, ty + 5); g.fillText(sub, lx + w1 + 1, ty + 5);
    }
  }
  new ResizeObserver(draw).observe(cv);
  cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; draw(); });
  cv.addEventListener('pointerleave', () => { mouse = null; draw(); });
  if (window.Watermark) Watermark.onChange(draw);

  // ---------- schematic ----------
  function schematic() {
    const v = (label, sub, val, x, y, color, anchor = 'start') =>
      `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}"><tspan font-style="italic">${label}</tspan><tspan font-size="11" dy="4">${sub}</tspan><tspan dy="-4"> = ${val}</tspan></text>`;
    const s = cur || { RL: +state.RL, C: +state.C * 1e-9, L: +state.L * 1e-3 };
    $('schem').innerHTML = `
      <g fill="none" stroke="#1f2a3d" stroke-width="2" stroke-linecap="round">
        <path d="M30 34H110M190 34H330M30 124H330"/>
        <path d="M110 34a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0" stroke="${COL.l}" stroke-width="2.4"/>
        <path d="M250 34V72M232 72H268M232 84H268M250 84V124" stroke="${COL.c}" stroke-width="2.4"/>
        <path d="M330 34V48l9 5l-18 10l18 10l-18 10l18 10l-9 5V124"/>
      </g>
      <circle cx="30" cy="34" r="4" fill="#fff" stroke="#1f2a3d" stroke-width="2"/><circle cx="30" cy="124" r="4" fill="#fff" stroke="#1f2a3d" stroke-width="2"/>
      <circle cx="250" cy="34" r="3.5" fill="#1f2a3d"/><circle cx="250" cy="124" r="3.5" fill="#1f2a3d"/>
      <g font-family="KaTeX_Main, 'Times New Roman', serif" font-size="15">
        ${v('L', '', s.L > 0 ? num(s.L * 1e3, 4) + ' mH' : '0', 150, 18, COL.l, 'middle')}
        ${v('C', '', num(s.C * 1e9, 4) + ' nF', 224, 82, COL.c, 'end')}
        ${v('R', 'L', num(s.RL, 4) + ' Ω', 346, 82, '#1f2a3d')}
        <text x="42" y="74" fill="#5b6578"><tspan font-style="italic">Z</tspan><tspan font-size="11" dy="4">match</tspan></text>
        <text x="200" y="106" fill="#5b6578"><tspan font-style="italic">Z</tspan><tspan font-size="11" dy="4">2</tspan></text>
      </g>
      <g stroke="#5b6578" stroke-width="1.5" fill="#5b6578">
        <path d="M44 86H92"/><path d="M98 86l-8 -4v8z" stroke="none"/>
        <path d="M200 114H226"/><path d="M232 114l-8 -4v8z" stroke="none"/>
      </g>`;
  }

  // ---------- readouts ----------
  function render() {
    const RL = parseFloat(state.RL), w0 = parseFloat(state.w), C = parseFloat(state.C) * 1e-9, L = parseFloat(state.L) * 1e-3;
    const ok = { rl: RL >= 100 && RL <= 2000, w: w0 > 0 && Number.isFinite(w0), c: C >= 0 && Number.isFinite(C), l: L >= 0 && Number.isFinite(L) };
    for (const k in ok) $(k).classList.toggle('bad', !ok[k]);
    const st = $('status');
    if (!ok.rl || !ok.w || !ok.c || !ok.l) {
      cur = null;
      st.className = 'sm-status error';
      st.textContent = !ok.rl ? 'R_L must be between 100 Ω and 2000 Ω.' : !ok.w ? 'ω₀ must be a positive number.' : 'C and L must be zero or positive.';
      $('badge').innerHTML = '';
      schematic(); draw(); return;
    }
    const m = Engine.lmatch(RL, w0, C, L, Z0);
    cur = { RL, w0, C, L, m, zL: { re: RL / Z0, im: 0 }, z2: norm(m.Z2), zm: norm(m.Zm), locked: Math.hypot(m.Zm.re - Z0, m.Zm.im) < LOCK };

    range = { C: niceUp(1e9 / (w0 * Z0)), L: niceUp(8e3 * Z0 / w0) };
    $('c-max').textContent = `0 – ${short(range.C)} nF`;
    $('l-max').textContent = `0 – ${short(range.L)} mH`;
    $('c-slider').value = Math.min(STEPS, Math.round(C * 1e9 / range.C * STEPS));
    $('l-slider').value = Math.min(STEPS, Math.round(L * 1e3 / range.L * STEPS));

    const { Z2, Zm, gamma, mag, vswr } = m, rl = -20 * Math.log10(mag);
    const rlText = rl > 60 ? '> 60 dB' : rl.toFixed(1) + ' dB';
    $('badge').innerHTML = `
      <div class="ro"><b>Z₂(jω₀) = R<sub>eq</sub> − jX<sub>eq</sub></b><span>${cx(Z2, ' Ω')}</span><small>z₂ = ${cx(cur.z2)}</small></div>
      <div class="ro"><b>Z<sub>match</sub>(jω₀) = R<sub>match</sub> + jX<sub>match</sub></b><span>${cx(Zm, ' Ω')}</span><small>z<sub>match</sub> = ${cx(cur.zm)}</small></div>
      <div class="ro"><b>Reflection coefficient |Γ|</b><span>${mag.toFixed(4)}</span><small>Γ = ${cx(gamma, '', 3)} · return loss ${rlText}</small></div>
      <div class="ro"><b>VSWR = (1 + |Γ|) / (1 − |Γ|)</b><span>${Number.isFinite(vswr) ? vswr.toFixed(3) : '∞'}</span><small>1.000 is a perfect match</small></div>`;

    const r2 = cur.z2.re, xm = cur.zm.im;
    if (cur.locked) {
      st.className = 'sm-status ok';
      st.innerHTML = `<b>50-Ω Match Locked! VSWR &lt; 1.02</b><span>|Z<sub>match</sub> − 50| = ${Math.hypot(Zm.re - Z0, Zm.im).toFixed(3)} Ω · VSWR = ${vswr.toFixed(4)}</span>`;
    } else if (Math.abs(r2 - 1) > 0.01) {
      st.className = 'sm-status warn';
      st.innerHTML = `<b>Step 1 · Tune C: land z₂ on the gold r = 1 circle</b><span>Now r₂ = ${fix(r2, 3)}, so ${r2 > 1 ? 'increase' : 'decrease'} C. The shunt C slides z along the load's dashed constant-g circle.</span>`;
    } else {
      st.className = 'sm-status warn';
      st.innerHTML = `<b>Step 2 · Tune L: cancel the remaining reactance</b><span>z₂ is on r = 1. Now x<sub>match</sub> = ${fix(xm, 3)}, so ${xm < 0 ? 'increase' : 'decrease'} L. The series L slides z along the r = 1 circle into the centre.</span>`;
    }
    schematic(); draw();
  }

  // ---------- inputs ----------
  const fields = { rl: 'RL', w: 'w', c: 'C', l: 'L' };
  for (const [id, key] of Object.entries(fields)) {
    $(id).value = state[key];
    $(id).addEventListener('input', () => { state[key] = $(id).value; save(); render(); });
  }
  for (const [id, key] of [['c', 'C'], ['l', 'L']]) {
    $(id + '-slider').max = STEPS;
    $(id + '-slider').addEventListener('input', e => {
      state[key] = short(e.target.value / STEPS * range[key]);
      $(id).value = state[key]; save(); render();
    });
  }
  render();
})();
