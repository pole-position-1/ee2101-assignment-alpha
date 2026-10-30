'use strict';
/*
 * Section 3: 2D impedance-plane bullseye game for the shunt-C, series-L
 * match. Z2 = R_L ∥ 1/(jω0C) slides round a semicircle as C grows; the series
 * L then lifts it straight up by ω0L. "Warp to Smith Chart" maps the same
 * curves through Γ = (Z/50 − 1)/(Z/50 + 1): every point is drawn at a blend of
 * its Cartesian and Smith positions, so the plane visibly bends into the circle.
 */
(function () {
  const $ = id => document.getElementById('bz-' + id);
  const { num } = Plot;
  const Z0 = 50, STEPS = 4000, TOL = 0.5, WARP_MS = 900, STORE = 'ee2101-alpha-bullseye-v1';
  const COL = { ink: '#1f2a3d', grid: '#e1e6ee', smith: '#d5dbe5', g: 'rgba(124, 58, 237, .38)', gold: '#d4a017', c: '#0891b2', l: '#c2410c', ok: '#059669', muted: '#6b7486' };
  const state = { RL: '500', w: '500000', C: '5', L: '0.1', view: 'plane' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } };

  const niceUp = v => { const m = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].find(f => f * m >= v * (1 - 1e-9)) * m; };
  const niceStep = v => { const m = 10 ** Math.floor(Math.log10(v)), f = v / m; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m; };
  const short = v => String(Number(v.toPrecision(6)));
  const fix = (v, d) => v.toFixed(d).replace('-', '−');
  const signed = (v, d) => +Math.abs(v).toFixed(d) === 0 ? (0).toFixed(d) : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);
  const cx = (z, unit = '', d = 4) => {
    const tiny = 1e-9 * Math.max(1, Math.abs(z.re), Math.abs(z.im)), re = Math.abs(z.re) < tiny ? 0 : z.re, im = Math.abs(z.im) < tiny ? 0 : z.im;
    return `${num(re, d)} ${im < 0 ? '−' : '+'} j${num(Math.abs(im), d)}${unit}`;
  };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cur = null, mouse = null, range = { C: 50, L: 1 }, top = null, viewKey = '';
  let warp = state.view === 'smith' ? 1 : 0, anim = 0;

  // ---------- curves in the Z plane (Ω), sampled so they reach towards ∞ ----------
  const spread = (n, lo, hi, f) => { const out = []; for (let i = 0; i <= n; i++) out.push(f(lo + (hi - lo) * i / n)); return out; };
  const tanq = u => Math.tan(Math.PI * u / 2);
  const lineR = (R, s) => spread(220, -0.998, 0.998, u => ({ re: R, im: s * tanq(u) }));           // constant R
  const lineX = (X, s) => spread(160, 0, 0.998, u => ({ re: s * tanq(u), im: X }));                // constant X, R ≥ 0
  const gCircle = G => spread(220, -0.998, 0.998, u => Engine.cdiv({ re: 1, im: 0 }, { re: G, im: G * tanq(u) }));
  // Z2 as C goes from 0 towards ∞: R_L/(1 + jb), b = ω0CR_L = tan θ
  const shuntArc = (RL, th1) => spread(160, 0, th1, th => Engine.cdiv({ re: RL, im: 0 }, { re: 1, im: Math.tan(th) }));

  // ---------- chart ----------
  const cv = $('chart');
  function frame(w, h) {
    const RL = cur ? cur.RL : 500, box = { L: 56, R: w - 14, T: 14, B: h - 36 };
    const r0 = -0.08 * RL, r1 = 1.1 * RL, x0 = -0.6 * RL, x1 = top || 0.32 * RL;
    const k = Math.min((box.R - box.L) / (r1 - r0), (box.B - box.T) / (x1 - x0));
    const ox = (box.L + box.R) / 2 - k * (r0 + r1) / 2, oy = (box.T + box.B) / 2 + k * (x0 + x1) / 2;
    const sr = Math.min(w, h) / 2 - 34, sx = w / 2, sy = h / 2;
    return { box, k, ox, oy, sr, sx, sy };
  }
  function draw() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const F = frame(w, h), { box, k, ox, oy, sr, sx, sy } = F, t = warp;
    const cart = Z => [ox + k * Z.re, oy - k * Z.im];
    const smith = Z => { const G = Engine.reflect(Z, Z0); return [sx + sr * G.re, sy - sr * G.im]; };
    const P = Z => { const a = cart(Z), b = smith(Z); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    const stroke = (zs, color, width = 1, dash = null, alpha = 1) => {
      if (alpha <= 0.01) return;
      g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
      if (dash) g.setLineDash(dash);
      g.beginPath(); zs.forEach((z, i) => { const [x, y] = P(z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
    };

    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.save();
    // clip blends from the plot box to the unit circle's bounding square
    const mix = (a, b) => a + t * (b - a), cl = mix(box.L, sx - sr - 3), cr = mix(box.R, sx + sr + 3), ct = mix(box.T, sy - sr - 3), cb = mix(box.B, sy + sr + 3);
    g.beginPath(); g.rect(cl, ct, cr - cl, cb - ct); g.clip();
    if (t < 1) { g.globalAlpha = 1 - t; g.fillStyle = '#fbfcfe'; g.fillRect(box.L, box.T, box.R - box.L, box.B - box.T); }
    if (t > 0) { g.globalAlpha = t; g.beginPath(); g.arc(sx, sy, sr, 0, 2 * Math.PI); g.fillStyle = '#fbfcfe'; g.fill(); }
    g.globalAlpha = 1;

    // Cartesian grid (fades out) and Smith grid (fades in); both bend with the warp
    const vis = { r0: (box.L - ox) / k, r1: (box.R - ox) / k, x0: (oy - box.B) / k, x1: (oy - box.T) / k };
    const step = niceStep(Math.max(vis.r1 - vis.r0, vis.x1 - vis.x0) / 9), s = (vis.x1 - vis.x0) / 2;
    const rTicks = [], xTicks = [];
    for (let R = step; R <= vis.r1; R += step) { rTicks.push(R); stroke(lineR(R, s), COL.grid, 1, null, 1 - t); }
    for (let X = Math.ceil(vis.x0 / step) * step; X <= vis.x1; X += step) if (Math.abs(X) > 1e-9) { xTicks.push(X); stroke(lineX(X, s), COL.grid, 1, null, 1 - t); }
    for (const r of [0.2, 0.5, 2, 5, 10]) stroke(lineR(r * Z0, Z0), COL.smith, 1, null, t);
    for (const x of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) stroke(lineX(sg * x * Z0, Z0), COL.smith, 1, null, t);
    for (const c of [0.2, 0.5, 1, 2, 5]) stroke(gCircle(c / Z0), COL.g, 1, [5, 4], t);

    // axes: R = 0 becomes the rim, X = 0 the diameter; target R = 50 Ω becomes the r = 1 circle
    stroke(lineR(0, s), COL.ink, 1.4);
    stroke([{ re: Math.min(0, vis.r0), im: 0 }, ...lineX(0, s)], '#8d97a8', 1.2);
    stroke(lineR(Z0, s), COL.gold, 2.4, [8, 5]);

    if (cur) {
      const { RL, w0, C, L, Z2, Zm, step1, hit } = cur;
      stroke(shuntArc(RL, Math.PI / 2 * 0.999), COL.c, 1.6, [6, 5], 0.7);
      stroke(shuntArc(RL, Math.atan(w0 * C * RL)), COL.c, 3.2);
      bullseye(hit);
      if (L > 0) arrow(spread(80, 0, 1, u => ({ re: Z2.re, im: Z2.im + u * w0 * L })), hit ? COL.ok : COL.l);
      dot({ re: RL, im: 0 }, COL.ink, 'Z', 'L', [0.3, 0.95]);
      dot(Z2, step1 ? COL.ok : COL.c, 'Z', '2', [-0.75, 0.66]);
      dot(Zm, hit ? COL.ok : COL.l, 'Z', 'match', [0.85, -0.5]);
    } else bullseye(false);
    g.restore();

    labels();
    hover();
    if (window.Watermark) t < 0.5 ? Watermark.drawCanvas(g, box.L, box.T, box.R, box.B) : Watermark.drawCanvas(g, 0, 0, w, h);

    function bullseye(hit) {
      const [x, y] = P({ re: Z0, im: 0 }), c = hit ? COL.ok : COL.gold;
      const glow = g.createRadialGradient(x, y, 2, x, y, hit ? 34 : 24);
      glow.addColorStop(0, hit ? 'rgba(5, 150, 105, .45)' : 'rgba(212, 160, 23, .35)'); glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = glow; g.beginPath(); g.arc(x, y, hit ? 34 : 24, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = c; g.lineWidth = 2;
      for (const r of [14, 8]) { g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.stroke(); }
      g.fillStyle = c; g.beginPath(); g.arc(x, y, 3, 0, 2 * Math.PI); g.fill();
    }
    function arrow(zs, color) {
      stroke(zs, color, 3);
      const pts = zs.map(P), n = pts.length - 1, [x1, y1] = pts[n];
      let j = n - 1;
      while (j > 0 && Math.hypot(x1 - pts[j][0], y1 - pts[j][1]) < 9) j--;
      if (Math.hypot(x1 - pts[0][0], y1 - pts[0][1]) < 12) return;
      const a = Math.atan2(y1 - pts[j][1], x1 - pts[j][0]), bx = x1 - 6 * Math.cos(a), by = y1 - 6 * Math.sin(a);
      g.fillStyle = color; g.beginPath();
      g.moveTo(bx + 4 * Math.cos(a), by + 4 * Math.sin(a));
      g.lineTo(bx - 9 * Math.cos(a) + 6 * Math.sin(a), by - 9 * Math.sin(a) - 6 * Math.cos(a));
      g.lineTo(bx - 9 * Math.cos(a) - 6 * Math.sin(a), by - 9 * Math.sin(a) + 6 * Math.cos(a));
      g.fill();
    }
    function dot(Z, color, main, sub, dir) {
      const [x, y] = P(Z);
      g.beginPath(); g.arc(x, y, 6, 0, 2 * Math.PI); g.fillStyle = color; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      // Cartesian: fixed direction per point; Smith: pushed outward from the centre
      let [dx, dy] = dir, off = 16;
      const [bx, by] = P({ re: Z0, im: 0 }), d = Math.hypot(x - bx, y - by);
      if (t > 0.5 && sub !== 'L' && d >= 26) { dx = (x - sx) / Math.hypot(x - sx, y - sy); dy = (y - sy) / Math.hypot(x - sx, y - sy); }
      if (d < 26 && sub !== 'L') { dx = 0.75; dy = -0.66; off = 28 - d * 0.4; }
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
    function labels() {
      g.save();
      if (t < 1) { // Cartesian ticks and titles
        g.globalAlpha = (1 - t) * (1 - t);
        g.font = '11px system-ui, sans-serif'; g.fillStyle = COL.muted;
        g.textAlign = 'center'; g.textBaseline = 'top';
        for (const R of [0, ...rTicks]) { const x = ox + k * R; if (x >= box.L - 1 && x <= box.R - 20) g.fillText(num(R, 4), x, box.B + 6); }
        g.textAlign = 'right'; g.textBaseline = 'middle';
        for (const X of [0, ...xTicks]) { const y = oy - k * X; if (y >= box.T + 4 && y <= box.B) g.fillText(num(X, 4), box.L - 6, y); }
        g.font = '600 12px system-ui, sans-serif'; g.fillStyle = COL.ink;
        g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('R (Ω)', box.R, box.B + 18);
        g.textAlign = 'left'; g.fillText('jX (Ω)', box.L + 6, box.T + 4);
        g.font = 'italic 11.5px system-ui, sans-serif'; g.fillStyle = COL.muted; g.textAlign = 'right';
        g.fillText('inductive  X > 0', box.R - 6, box.T + 4);
        g.textBaseline = 'bottom'; g.fillText('capacitive  X < 0', box.R - 6, box.B - 26);
        const tx = ox + k * Z0;
        g.font = '700 11.5px system-ui, sans-serif'; g.fillStyle = '#a37a00'; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText('R = 50 Ω', tx + 5, box.T + 22);
      }
      if (t > 0) { // Smith chart labels
        g.globalAlpha = t * t;
        g.font = '10.5px system-ui, sans-serif'; g.fillStyle = COL.muted; g.textAlign = 'center'; g.textBaseline = 'bottom';
        for (const r of [0.2, 0.5, 2, 5, 10]) g.fillText(String(r), sx + sr * (r - 1) / (r + 1), sy - 3);
        g.textBaseline = 'middle';
        for (const x of [0.2, 0.5, 1, 2, 5]) for (const sg of [1, -1]) {
          const d = x * x + 1;
          g.fillText((sg > 0 ? '+j' : '−j') + x, sx + sr * 1.09 * (x * x - 1) / d, sy - sr * 1.09 * sg * 2 * x / d);
        }
        g.fillText('0', sx - sr - 12, sy); g.fillText('∞', sx + sr + 12, sy);
        g.font = '700 11.5px system-ui, sans-serif'; g.fillStyle = '#a37a00'; g.textBaseline = 'bottom';
        g.fillText('r = 1  (R = 50 Ω)', sx + sr * 0.5, sy - sr * 0.5 - 4);
      }
      g.restore();
    }
    function hover() {
      if (!mouse || (t > 0 && t < 1)) return;
      let Z = null;
      if (t === 0 && mouse.x >= box.L && mouse.x <= box.R && mouse.y >= box.T && mouse.y <= box.B) Z = { re: (mouse.x - ox) / k, im: (oy - mouse.y) / k };
      if (t === 1) {
        const G = { re: (mouse.x - sx) / sr, im: (sy - mouse.y) / sr };
        if (Math.hypot(G.re, G.im) <= 1) { const z = Engine.cdiv({ re: 1 + G.re, im: G.im }, { re: 1 - G.re, im: -G.im }); Z = { re: z.re * Z0, im: z.im * Z0 }; }
      }
      if (!Z) return;
      const G = Engine.reflect(Z, Z0), lines = [`Z = ${cx(Z, ' Ω', 4)}`, `|Γ| = ${Math.hypot(G.re, G.im).toFixed(3)}`];
      g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      const bw = Math.max(...lines.map(l => g.measureText(l).width)) + 16, bx = t ? 8 : box.L + 8, by = t ? 8 : box.T + 24;
      g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#c8d0db'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(bx, by, bw, lines.length * 17 + 10, 6); g.fill(); g.stroke();
      g.fillStyle = COL.ink; lines.forEach((l, i) => g.fillText(l, bx + 8, by + 6 + i * 17));
    }
  }
  new ResizeObserver(draw).observe(cv);
  cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; draw(); });
  cv.addEventListener('pointerleave', () => { mouse = null; draw(); });
  if (window.Watermark) Watermark.onChange(draw);

  // ---------- view toggle: animate the warp between the two maps ----------
  function setView(v, animate = true) {
    state.view = v; save();
    $('view').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('chart').setAttribute('aria-label', v === 'smith' ? 'Smith chart of the Z2 and Z_match trajectory' : 'Complex impedance plane, R horizontal and jX vertical');
    const from = warp, to = v === 'smith' ? 1 : 0;
    cancelAnimationFrame(anim);
    if (!animate || reduce || from === to) { warp = to; draw(); return; }
    const t0 = performance.now();
    const tick = now => {
      const f = Math.min(1, (now - t0) / WARP_MS), e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
      warp = f < 1 ? from + (to - from) * e : to;
      draw();
      if (f < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }
  $('view').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });

  // ---------- schematic ----------
  function schematic() {
    const v = (label, sub, val, x, y, color, anchor = 'start') =>
      `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}"><tspan font-style="italic">${label}</tspan><tspan font-size="11" dy="4">${sub}</tspan><tspan dy="-4">${val === null ? '' : ' = ' + val}</tspan></text>`;
    const s = cur || { RL: +state.RL, C: +state.C * 1e-9, L: +state.L * 1e-3 };
    $('schem').innerHTML = `
      <g fill="none" stroke="${COL.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M40 30H80l5 -8l10 16l10 -16l10 16l10 -16l10 16l5 -8H170M250 30H400M40 128H400M40 30V63M40 95V128"/>
        <circle cx="40" cy="79" r="16"/><path d="M31 79q4.5 -9 9 0t9 0"/>
        <path d="M170 30a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0" stroke="${COL.l}" stroke-width="2.4"/>
        <path d="M300 30V72M282 72H318M282 84H318M300 84V128" stroke="${COL.c}" stroke-width="2.4"/>
        <path d="M400 30V48l9 5l-18 10l18 10l-18 10l18 10l-9 5V128"/>
      </g>
      <circle cx="300" cy="30" r="3.5" fill="${COL.ink}"/><circle cx="300" cy="128" r="3.5" fill="${COL.ink}"/>
      <g font-family="KaTeX_Main, 'Times New Roman', serif" font-size="15">
        ${v('V', 'in', null, 62, 84, COL.ink)}
        ${v('R', 'S', '50 Ω', 110, 14, COL.ink, 'middle')}
        ${v('L', '', s.L > 0 ? num(s.L * 1e3, 4) + ' mH' : '0', 210, 14, COL.l, 'middle')}
        ${v('C', '', num(s.C * 1e9, 4) + ' nF', 276, 82, COL.c, 'end')}
        ${v('R', 'L', num(s.RL, 4) + ' Ω', 416, 82, COL.ink)}
        ${v('V', 'out', null, 355, 84, '#5b6578', 'middle')}
        <text x="355" y="54" text-anchor="middle" fill="#5b6578">+</text><text x="355" y="118" text-anchor="middle" fill="#5b6578">−</text>
        <text x="146" y="100" fill="#5b6578"><tspan font-style="italic">Z</tspan><tspan font-size="11" dy="4">match</tspan></text>
        <text x="252" y="108" fill="#5b6578"><tspan font-style="italic">Z</tspan><tspan font-size="11" dy="4">2</tspan></text>
      </g>
      <g stroke="#5b6578" stroke-width="1.5" fill="#5b6578">
        <path d="M146 110H186"/><path d="M192 110l-8 -4v8z" stroke="none"/>
        <path d="M252 116H282"/><path d="M288 116l-8 -4v8z" stroke="none"/>
      </g>`;
  }

  // ---------- readouts ----------
  function render() {
    const RL = parseFloat(state.RL), w0 = parseFloat(state.w), C = parseFloat(state.C) * 1e-9, L = parseFloat(state.L) * 1e-3;
    const ok = { rl: RL >= 100 && RL <= 2000, w: w0 > 0 && Number.isFinite(w0), c: C >= 0 && Number.isFinite(C), l: L >= 0 && Number.isFinite(L) };
    for (const key in ok) $(key).classList.toggle('bad', !ok[key]);
    const step = $('step'), banner = $('banner');
    if (!ok.rl || !ok.w || !ok.c || !ok.l) {
      cur = null;
      step.className = 'sm-status error';
      step.textContent = !ok.rl ? 'R_L must be between 100 Ω and 2000 Ω.' : !ok.w ? 'ω₀ must be a positive number.' : 'C and L must be zero or positive.';
      banner.className = 'sm-status off'; banner.innerHTML = '';
      $('readout').innerHTML = '';
      schematic(); draw(); return;
    }
    const m = Engine.lmatch(RL, w0, C, L, Z0), { Z2, Zm } = m;
    const step1 = Math.abs(Z2.re - Z0) < TOL, hit = step1 && Math.abs(Zm.im) < TOL;
    cur = { RL, w0, C, L, Z2, Zm, step1, hit };

    // keep the view still while dragging: refit only for a new R_L or ω0, or
    // when Z_match leaves the top of the plot (or falls far below it)
    const key = RL + '|' + w0, base = 0.32 * RL, need = Math.max(base, Zm.im * 1.15);
    if (key !== viewKey) { viewKey = key; top = need; }
    else if (need > top || need < top * 0.7) top = need;

    range = { C: niceUp(1e9 / (w0 * Z0)), L: niceUp(8e3 * Z0 / w0) };
    $('c-max').textContent = `0 – ${short(range.C)} nF`;
    $('l-max').textContent = `0 – ${short(range.L)} mH`;
    $('c-slider').value = Math.min(STEPS, Math.round(C * 1e9 / range.C * STEPS));
    $('l-slider').value = Math.min(STEPS, Math.round(L * 1e3 / range.L * STEPS));

    const dR = Z2.re - Z0, Xeq = -Z2.im, miss = Math.hypot(dR, Zm.im), port = Math.hypot(Z2.re, Z2.im) / Math.hypot(Zm.re, Zm.im);
    $('readout').innerHTML = `
      <div class="ro"><b>Z₂ = R<sub>eq</sub> − jX<sub>eq</sub> &nbsp;(R<sub>L</sub> ∥ 1/jω₀C)</b><span>${cx(Z2, ' Ω')}</span><small>R<sub>eq</sub> = ${num(Z2.re, 4)} Ω, X<sub>eq</sub> = ${num(Xeq, 4)} Ω</small></div>
      <div class="ro"><b>Z<sub>match</sub> = R<sub>match</sub> + jX<sub>match</sub> &nbsp;(Z₂ + jω₀L)</b><span>${cx(Zm, ' Ω')}</span><small>jω₀L = +j${num(w0 * L, 4)} Ω, so X<sub>match</sub> = ω₀L − X<sub>eq</sub></small></div>
      <div class="ro"><b>Voltage magnification |V<sub>out</sub> / V<sub>in</sub>|</b><span>${m.gain.toFixed(4)} V/V &nbsp;(${fix(20 * Math.log10(m.gain), 2)} dB)</span><small>V<sub>in</sub> behind R<sub>S</sub> = 50 Ω; ½√(R<sub>L</sub>/R<sub>S</sub>) = ${(Math.sqrt(RL / Z0) / 2).toFixed(4)} when matched</small><small>Across Z<sub>match</sub> alone: |Z₂ / Z<sub>match</sub>| = ${port.toFixed(4)}</small></div>
      <div class="ro"><b>Distance to the bullseye</b><span>|Z<sub>match</sub> − 50| = ${num(miss < 1e-9 ? 0 : miss, 4)} Ω</span><small>ΔR = ${signed(dR, 2)} Ω · ΔX = ${signed(Zm.im, 2)} Ω · VSWR ${Number.isFinite(m.vswr) ? m.vswr.toFixed(3) : '∞'}</small></div>`;

    if (step1) {
      step.className = 'sm-status done';
      step.innerHTML = `<b>Step 1 Complete: Real Part = 50 Ω!</b><span>R<sub>eq</sub> = ${Z2.re.toFixed(3)} Ω, with X<sub>eq</sub> = ${Xeq.toFixed(2)} Ω left to cancel.</span>`;
    } else {
      step.className = 'sm-status warn';
      step.innerHTML = `<b>Step 1 · Slide C until R<sub>eq</sub> = 50 Ω</b><span>Now R<sub>eq</sub> = ${Z2.re.toFixed(2)} Ω, so ${dR > 0 ? 'increase' : 'decrease'} C. Z₂ rides the dashed semicircle towards the gold R = 50 Ω line.</span>`;
    }
    if (hit) {
      banner.className = 'sm-status ok';
      banner.innerHTML = `<b>50 + j0 Ω Bullseye Hit!</b><span>Z<sub>match</sub> = ${cx(Zm, ' Ω')} · |V<sub>out</sub>/V<sub>in</sub>| = ${m.gain.toFixed(4)}</span>`;
    } else {
      banner.className = 'sm-status idle';
      banner.innerHTML = `<b>Step 2 · Slide L to lift Z₂ straight up to X = 0</b><span>Now X<sub>match</sub> = ${fix(Zm.im, 2)} Ω, so ${Zm.im < 0 ? 'increase' : 'decrease'} L${step1 ? '.' : ' (finish Step 1 first, or the arrow lands beside the bullseye).'}</span>`;
    }
    schematic(); draw();
  }

  // ---------- inputs ----------
  for (const [id, key] of Object.entries({ rl: 'RL', w: 'w', c: 'C', l: 'L' })) {
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
  setView(state.view, false);
  render();
})();
