'use strict';
/*
 * Minimal canvas plotter with crisp HiDPI rendering, automatic resizing and a
 * hover crosshair. Usage:
 *   const p = new Plot(canvas, { xLog: true, xLabel: 'ω (rad/s)', yLabel: 'dB', hover: x => ['line', ...] });
 *   p.set({ series: [{ x, y, color }], x: [lo, hi], y: [lo, hi], hLines, vLines, points, arrows });
 */
(function (root) {
  const PREFIX = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function eng(v, unit = '', digits = 4) {
    if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
    if (v === 0) return '0' + (unit ? ' ' + unit : '');
    const a = Math.abs(v), [scale, p] = PREFIX.find(([s]) => a >= s * 0.9995) || PREFIX[PREFIX.length - 1];
    let s = (v / scale).toPrecision(digits);
    if (s.includes('.') && !s.includes('e')) s = s.replace(/\.?0+$/, '');
    return s.replace('-', '−') + (unit || p ? ' ' + p + unit : '');
  }
  const num = (v, digits = 4) => !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)
    ? v.toExponential(digits - 1).replace('-', '−') : Number(v.toPrecision(digits)).toString().replace('-', '−');

  function niceStep(range, target) {
    const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function interp(xs, ys, x) {
    let lo = 0, hi = xs.length - 1;
    if (!(x >= xs[lo] && x <= xs[hi])) return NaN;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const t = xs[hi] === xs[lo] ? 1 : (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }

  class Plot {
    constructor(canvas, opts) {
      this.c = canvas; this.o = opts; this.data = null; this.mouse = null;
      this.base = document.createElement('canvas');
      new ResizeObserver(() => this.render()).observe(canvas);
      canvas.addEventListener('pointermove', e => { this.mouse = this.local(e); this.overlay(); });
      canvas.addEventListener('pointerleave', () => { this.mouse = null; this.overlay(); });
      if (opts.onClick) canvas.addEventListener('click', e => {
        const m = this.local(e), x = this.toX(m.x);
        if (x !== null) opts.onClick(x);
      });
    }
    local(e) { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    get box() { const w = this.c.clientWidth, h = this.c.clientHeight; return { L: 58, R: w - 14, T: 12, B: h - 40, w, h }; }
    sx(x) { const { L, R } = this.box, [a, b] = this.data.x; return this.o.xLog ? L + (Math.log10(x) - Math.log10(a)) / (Math.log10(b) - Math.log10(a)) * (R - L) : L + (x - a) / (b - a) * (R - L); }
    sy(y) { const { T, B } = this.box, [a, b] = this.data.y; return B - (y - a) / (b - a) * (B - T); }
    toX(px) {
      if (!this.data) return null;
      const { L, R } = this.box, [a, b] = this.data.x, f = (px - L) / (R - L);
      if (f < 0 || f > 1) return null;
      return this.o.xLog ? 10 ** (Math.log10(a) + f * (Math.log10(b) - Math.log10(a))) : a + f * (b - a);
    }
    set(data) { this.data = data; this.render(); }
    clear(message) { this.data = null; this.message = message; this.render(); }

    render() {
      const dpr = window.devicePixelRatio || 1, { w, h } = this.box;
      if (!w || !h) return;
      for (const cv of [this.c, this.base]) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = this.base.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      if (this.data) this.drawBase(g);
      else if (this.message) { g.fillStyle = '#8a94a6'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(this.message, w / 2, h / 2); }
      this.overlay();
    }

    drawBase(g) {
      const d = this.data, { L, R, T, B, w } = this.box;
      g.font = '11.5px system-ui, sans-serif'; g.lineWidth = 1;
      // grid and tick labels
      g.strokeStyle = '#e6eaf0'; g.fillStyle = '#5b6578'; g.textAlign = 'center'; g.textBaseline = 'top';
      if (this.o.xLog) {
        const a = Math.floor(Math.log10(d.x[0])), b = Math.ceil(Math.log10(d.x[1]));
        const decades = b - a, every = decades > 9 ? 2 : 1;
        for (let k = a; k <= b; k++) {
          for (let m = 1; m < 10; m++) {
            const x = m * 10 ** k;
            if (x < d.x[0] * 0.999 || x > d.x[1] * 1.001) continue;
            g.strokeStyle = m === 1 ? '#d5dbe4' : '#f0f2f6';
            g.beginPath(); g.moveTo(this.sx(x), T); g.lineTo(this.sx(x), B); g.stroke();
            if (m === 1 && (k - a) % every === 0) g.fillText(this.o.xTick ? this.o.xTick(x) : eng(x), this.sx(x), B + 6);
          }
        }
      } else {
        const step = niceStep(d.x[1] - d.x[0], Math.max(3, Math.floor((R - L) / 90)));
        for (let x = Math.ceil(d.x[0] / step) * step; x <= d.x[1] + step * 1e-9; x += step) {
          const v = Math.abs(x) < step * 1e-9 ? 0 : x;
          g.strokeStyle = v === 0 ? '#b9c1cd' : '#e6eaf0';
          g.beginPath(); g.moveTo(this.sx(v), T); g.lineTo(this.sx(v), B); g.stroke();
          g.fillText(this.o.xTick ? this.o.xTick(v) : num(v, 3), this.sx(v), B + 6);
        }
      }
      g.textAlign = 'right'; g.textBaseline = 'middle';
      const ys = d.yStep || niceStep(d.y[1] - d.y[0], 5);
      for (let y = Math.ceil(d.y[0] / ys - 1e-9) * ys; y <= d.y[1] + ys * 1e-9; y += ys) {
        const v = Math.abs(y) < ys * 1e-9 ? 0 : y;
        g.strokeStyle = v === 0 ? '#b9c1cd' : '#e6eaf0';
        g.beginPath(); g.moveTo(L, this.sy(v)); g.lineTo(R, this.sy(v)); g.stroke();
        g.fillText(num(v, 3), L - 6, this.sy(v));
      }
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#3c4658';
      g.fillText(this.o.xLabel, (L + R) / 2, this.box.h - 2);
      g.save(); g.translate(13, (T + B) / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(this.o.yLabel, 0, 0); g.restore();
      g.strokeStyle = '#b9c1cd'; g.strokeRect(L, T, R - L, B - T);

      g.save(); g.beginPath(); g.rect(L, T, R - L, B - T); g.clip();
      for (const l of d.hLines || []) this.line(g, L, this.sy(l.y), R, this.sy(l.y), l.color, l.dash, 1.4);
      for (const l of d.vLines || []) this.line(g, this.sx(l.x), T, this.sx(l.x), B, l.color, l.dash, 1.6);
      for (const s of d.series) this.trace(g, s);
      for (const a of d.arrows || []) {
        const x = this.sx(a.x), y0 = this.sy(a.y0), y1 = Math.max(T + 2, this.sy(a.y1));
        this.line(g, x, y0, x, y1, a.color, null, 2.4);
        g.fillStyle = a.color; g.beginPath(); g.moveTo(x, y1 - 2); g.lineTo(x - 6, y1 + 9); g.lineTo(x + 6, y1 + 9); g.fill();
      }
      for (const p of d.points || []) {
        g.fillStyle = p.color; g.beginPath(); g.arc(this.sx(p.x), this.sy(p.y), 4.5, 0, 2 * Math.PI); g.fill();
      }
      g.restore();
      // labels for markers, drawn unclipped
      g.font = '600 11.5px system-ui, sans-serif'; g.textBaseline = 'top';
      for (const l of d.vLines || []) if (l.label) {
        const x = this.sx(l.x); if (x < L || x > R) continue;
        g.fillStyle = l.color; g.textAlign = x > R - 110 ? 'right' : 'left'; g.fillText(l.label, x + (x > R - 110 ? -5 : 5), l.bottom ? B - 18 - (l.row || 0) * 15 : T + 4 + (l.row || 0) * 15);
      }
      for (const l of d.hLines || []) if (l.label) {
        g.fillStyle = l.color; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(l.label, R - 5, this.sy(l.y) - 3);
      }
      for (const a of d.arrows || []) if (a.label) {
        g.fillStyle = a.color; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(a.label, this.sx(a.x) + 9, Math.max(T + 2, this.sy(a.y1)));
      }
      void w;
    }
    line(g, x1, y1, x2, y2, color, dash, width) {
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
    }
    // Draws a series; when there are many more points than pixels, each pixel
    // column is reduced to its min/max so sharp edges are kept.
    trace(g, s) {
      g.strokeStyle = s.color; g.lineWidth = s.width || 2.2; g.setLineDash(s.dash || []); g.lineJoin = 'round';
      g.beginPath();
      let pen = false, col = null, lo = 0, hi = 0, first = 0, last = 0;
      const flush = () => {
        if (col === null) return;
        const yf = this.sy(first), yl = this.sy(last);
        if (!pen) { g.moveTo(col, yf); pen = true; } else g.lineTo(col, yf);
        if (hi !== lo) { g.lineTo(col, this.sy(lo)); g.lineTo(col, this.sy(hi)); }
        g.lineTo(col, yl);
      };
      const dense = s.x.length > 3 * (this.box.R - this.box.L);
      for (let i = 0; i < s.x.length; i++) {
        const y = s.y[i];
        if (!Number.isFinite(y) || (s.breakAt && i && Math.abs(y - s.y[i - 1]) > s.breakAt)) { flush(); col = null; pen = false; if (!Number.isFinite(y)) continue; }
        const px = this.sx(s.x[i]);
        if (!dense) { if (!pen) { g.moveTo(px, this.sy(y)); pen = true; } else g.lineTo(px, this.sy(y)); continue; }
        const c = Math.round(px);
        if (c !== col) { flush(); col = c; lo = hi = first = last = y; }
        else { lo = Math.min(lo, y); hi = Math.max(hi, y); last = y; }
      }
      if (dense) flush();
      g.stroke(); g.setLineDash([]);
    }

    overlay() {
      const g = this.c.getContext('2d'), dpr = window.devicePixelRatio || 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.base, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!this.mouse || !this.data || !this.o.hover) return;
      const x = this.toX(this.mouse.x);
      if (x === null) return;
      const { T, B, R } = this.box, px = this.sx(x);
      this.line(g, px, T, px, B, 'rgba(30,40,60,.45)', [3, 3], 1);
      const lines = this.o.hover(x, this.data);
      if (!lines || !lines.length) return;
      g.font = '12px system-ui, sans-serif';
      const width = Math.max(...lines.map(l => g.measureText(l.text || l).width)) + 16, height = lines.length * 17 + 8;
      let bx = px + 12; if (bx + width > R) bx = px - 12 - width;
      const by = T + 6;
      g.fillStyle = 'rgba(255,255,255,.94)'; g.strokeStyle = '#c8d0db'; g.lineWidth = 1;
      g.beginPath(); g.roundRect(bx, by, width, height, 6); g.fill(); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'top';
      lines.forEach((l, i) => { g.fillStyle = l.color || '#1f2a3d'; g.fillText(l.text || l, bx + 8, by + 6 + i * 17); });
    }
  }
  Plot.eng = eng; Plot.num = num; Plot.interp = interp;
  root.Plot = Plot;
})(window);
