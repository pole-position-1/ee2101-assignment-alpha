'use strict';
/*
 * Student identity: name and matric number at the top of the page. The matric
 * number gives the assignment parameters X, Y, Z, and the whole identity plus a
 * timestamp is stamped into every plot so each screenshot traces to one student.
 *   Watermark.drawCanvas(g, L, T, R, B)  draws the badge inside a canvas plot box
 *   Watermark.svg(x, y)                  returns markup for an SVG badge
 *   Watermark.onChange(fn)               re-render hook (identity edits, clock tick)
 */
(function (root) {
  const STORE = 'ee2101-student-v1';
  const info = { name: '', matric: '' };
  try { Object.assign(info, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { /* storage unavailable */ }
  const listeners = [];
  const pad = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const params = () => Engine.parseMatric(info.matric);
  const name = () => info.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  const verified = () => !!params() && name().length > 0;
  function text() {
    const p = params();
    if (!verified()) return 'UNVERIFIED · enter your name and Matric No. at the top of the page';
    return `Matric: ${p.id} (X=${p.X}, Y=${p.Y}, Z=${p.Z}) | ${name()} | ${stamp()}`;
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Badge in the bottom-right of the plot area, plus a faint diagonal ID across
  // the middle so cropping the badge out of a screenshot does not remove it.
  function drawCanvas(g, L, T, R, B) {
    const ok = verified(), label = text();
    g.save();
    g.beginPath(); g.rect(L, T, R - L, B - T); g.clip();
    if (ok) {
      g.save();
      g.translate((L + R) / 2, (T + B) / 2); g.rotate(-0.12);
      g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(29, 78, 216, .07)'; g.fillText(params().id + '   ·   ' + params().id, 0, 0);
      g.restore();
    }
    let size = 11;
    g.font = `600 ${size}px system-ui, sans-serif`;
    const avail = R - L - 12, wText = g.measureText(label).width;
    if (wText > avail) { size = Math.max(7, size * avail / wText); g.font = `600 ${size}px system-ui, sans-serif`; }
    const bw = Math.min(avail, g.measureText(label).width) + 10, bh = size + 8, bx = R - bw - 4, by = B - bh - 4;
    g.fillStyle = ok ? 'rgba(255, 255, 255, .62)' : 'rgba(254, 242, 242, .85)';
    g.strokeStyle = ok ? 'rgba(29, 78, 216, .35)' : 'rgba(185, 28, 28, .6)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(bx, by, bw, bh, 4); g.fill(); g.stroke();
    g.fillStyle = ok ? 'rgba(29, 78, 216, .72)' : 'rgba(185, 28, 28, .9)';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(label, bx + 5, by + bh / 2, avail);
    g.restore();
  }
  function svg(x, y, anchor = 'end') {
    const ok = verified();
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="10.5" font-weight="600" font-family="system-ui, sans-serif" fill="${ok ? 'rgba(29,78,216,.72)' : 'rgba(185,28,28,.9)'}" stroke="#fff" stroke-width="3" stroke-opacity=".8" paint-order="stroke">${esc(text())}</text>`;
  }

  // ---------- header inputs ----------
  const nameEl = document.getElementById('st-name'), matricEl = document.getElementById('st-matric');
  const paramsEl = document.getElementById('st-params');
  function show() {
    const p = params(), hasM = info.matric.trim() !== '';
    nameEl.classList.toggle('bad', !name());
    matricEl.classList.toggle('bad', !p);
    paramsEl.className = 'params ' + (verified() ? 'ok' : 'warn');
    paramsEl.innerHTML = p
      ? `<b>X = ${p.X}</b><b>Y = ${p.Y}</b><b>Z = ${p.Z}</b>${name() ? '' : '<span>Enter your name too</span>'}`
      : `<span>${hasM ? 'Matric No. needs at least 3 digits, e.g. A1234567B' : 'Required: plots are marked UNVERIFIED until you enter both'}</span>`;
  }
  function changed() {
    try { localStorage.setItem(STORE, JSON.stringify(info)); } catch (e) { /* storage unavailable */ }
    show();
    listeners.forEach(fn => fn());
  }
  nameEl.value = info.name; matricEl.value = info.matric;
  nameEl.addEventListener('input', () => { info.name = nameEl.value; changed(); });
  matricEl.addEventListener('input', () => { info.matric = matricEl.value; changed(); });
  show();
  // keep the timestamp current on screen
  setInterval(() => listeners.forEach(fn => fn()), 30000);

  root.Watermark = { text, verified, params, drawCanvas, svg, onChange: fn => listeners.push(fn) };
})(window);
