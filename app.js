/* J'Lynn Turner portfolio: all page behavior in one file (no inline scripts, so the
   Content-Security-Policy can allow scripts from this site only). */
"use strict";

// Theme toggle: follows the system until the visitor picks; the pick is remembered on this device only.
(function () {
  var root = document.documentElement;
  var btn = document.getElementById("theme-btn");
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  try {
    var saved = localStorage.getItem("site-theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked: follow the system theme */ }
  function current() {
    var t = root.getAttribute("data-theme");
    return t === "light" || t === "dark" ? t : (mq.matches ? "dark" : "light");
  }
  function label() { btn.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme"); }
  if (!btn) return;
  btn.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("site-theme", next); } catch (e) { /* storage blocked: lasts this visit */ }
    label();
  });
  label();
})();

// Circuit board: one connected network grown over a grid that covers the whole document
// (a single tree, so every trace joins the others, plus a few loops), drawn on one canvas.
// Runs are straight horizontal or vertical lines meeting at right angles; T junctions at most.
// Comets walk the network edge by edge and pick a random branch at every junction.
// The board holds still on screen while the content scrolls over it; a pink glow follows the cursor or last touch.
// Text carries a halo in the page colour (styles.css), so lines fade out right at the letters.
(function () {
  var cv = document.getElementById("x-net");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Directions: 0 right, 1 down, 2 left, 3 up; the opposite of d is (d + 2) % 4.
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], TAIL = 120;
  var net = null, comets = [], dpr = 1, VW = 0, VH = 0, K = 0;
  var col = { trace: "rgba(255,119,169,0.4)", hi: "rgba(255,119,169,0.9)", glow: "rgba(255,119,169,0.1)" };
  var px = 0, py = 0, pointOn = false, lensA = 0, LR = 190;
  var lc = document.createElement("canvas"), lx = lc.getContext("2d");
  var last = 0, looping = false, drawQueued = false;
  // Text boxes in document coordinates, one per rendered line, with a feathered edge so lines fade out softly instead of stopping at a box.
  var TEXT = "h1, h2, h3, p, dt, dd, .x-entries ul li, .x-links a", PAD = 2, boxes = [];
  function readBoxes() {
    var els = document.querySelectorAll(TEXT), r = document.createRange(), sx = window.scrollX, sy = window.scrollY;
    boxes = [];
    for (var i = 0; i < els.length; i++) {
      r.selectNodeContents(els[i]);
      var rs = r.getClientRects();
      for (var j = 0; j < rs.length; j++) {
        var b = rs[j];
        if (b.width < 1 || b.height < 1) continue;
        boxes.push([b.left + sx - PAD, b.top + sy - PAD, b.width + PAD * 2, b.height + PAD * 2]);
      }
    }
  }

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function back(d) { return (d + 2) % 4; }
  function bits(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  function build(W, H) {
    var S = W < 600 ? 58 : W < 1000 ? 68 : 78;
    var cols = Math.ceil(W / S) + 3, rows = Math.ceil(H / S) + 3;
    var ox = (W - (cols - 1) * S) / 2, oy = -S;
    var N = cols * rows, mask = new Uint8Array(N), seen = new Uint8Array(N), lastDir = new Int8Array(N);
    var R = rng(W * 7919 + 17), i, a, d, b;
    lastDir.fill(-1);
    function nb(a, d) {
      var x = (a % cols) + DX[d], y = ((a / cols) | 0) + DY[d];
      return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x;
    }
    function can(a, d) {
      var b = nb(a, d);
      if (b < 0 || mask[a] & (1 << d)) return -1;
      if (bits(mask[a]) >= 3 || bits(mask[b]) >= 3) return -1; // T junctions at most, no crosses
      return b;
    }
    function link(a, d, b) { mask[a] |= 1 << d; mask[b] |= 1 << back(d); }

    // Grow one tree from the middle until it reaches every corner of the grid.
    var start = ((rows >> 1) * cols) + (cols >> 1), active = [start], order = [0, 1, 2, 3];
    seen[start] = 1;
    while (active.length) {
      var k = R() < 0.7 ? active.length - 1 : (R() * active.length) | 0;
      a = active[k];
      var pd = -1, pb = -1;
      if (lastDir[a] >= 0 && R() < 0.6) { b = can(a, lastDir[a]); if (b >= 0 && !seen[b]) { pd = lastDir[a]; pb = b; } }
      if (pd < 0) {
        for (i = 3; i > 0; i--) { var r = (R() * (i + 1)) | 0, t = order[i]; order[i] = order[r]; order[r] = t; }
        for (i = 0; i < 4; i++) { b = can(a, order[i]); if (b >= 0 && !seen[b]) { pd = order[i]; pb = b; break; } }
      }
      if (pd < 0) { active.splice(k, 1); continue; }
      link(a, pd, pb); seen[pb] = 1; lastDir[pb] = pd; active.push(pb);
    }
    // Trim the shortest dead ends so the board breathes; trimming leaves never disconnects it.
    for (var pass = 0; pass < 2; pass++) {
      var leaves = [];
      for (a = 0; a < N; a++) if (bits(mask[a]) === 1 && R() < 0.85) leaves.push(a);
      for (i = 0; i < leaves.length; i++) {
        a = leaves[i];
        if (bits(mask[a]) !== 1) continue;
        for (d = 0; d < 4; d++) if (mask[a] & (1 << d)) { b = nb(a, d); mask[a] = 0; mask[b] &= ~(1 << back(d)); break; }
      }
    }
    // A few extra links make loops, so comets have real choices at junctions.
    for (i = 0; i < N * 0.07; i++) {
      a = (R() * N) | 0; d = (R() * 4) | 0;
      if (!mask[a]) continue;
      b = can(a, d);
      if (b >= 0 && mask[b]) link(a, d, b);
    }

    function X(a) { return ox + (a % cols) * S; }
    function Y(a) { return oy + ((a / cols) | 0) * S; }
    var deg = new Uint8Array(N), live = [];
    for (a = 0; a < N; a++) { deg[a] = bits(mask[a]); if (deg[a]) live.push(a); }

    // Chains: runs between junctions or ends, each drawn as one path with square corners.
    var used = new Uint8Array(N), chains = [];
    function walk(a, d) {
      var pts = [a], cur = a, dir = d;
      for (;;) {
        var b = nb(cur, dir);
        used[cur] |= 1 << dir; used[b] |= 1 << back(dir);
        pts.push(b);
        if (deg[b] !== 2) break;
        var m = mask[b] & ~(1 << back(dir)), nd = 0;
        while (!(m & (1 << nd))) nd++;
        if (used[b] & (1 << nd)) break;
        cur = b; dir = nd;
      }
      return pts;
    }
    for (var loopPass = 0; loopPass < 2; loopPass++)
      for (a = 0; a < N; a++) {
        if (!deg[a] || (loopPass === 0 && deg[a] === 2)) continue;
        for (d = 0; d < 4; d++) if ((mask[a] & (1 << d)) && !(used[a] & (1 << d))) chains.push(walk(a, d));
      }
    chains = chains.map(function (pts) {
      var p = new Path2D(), y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      for (var j = 0; j < pts.length; j++) {
        var x = X(pts[j]), y = Y(pts[j]);
        if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (j) p.lineTo(x, y); else p.moveTo(x, y);
      }
      return { p: p, x0: x0, x1: x1, y0: y0, y1: y1 };
    });
    return { W: W, H: H, S: S, mask: mask, nb: nb, X: X, Y: Y, live: live, chains: chains };
  }

  function spawn(c) {
    var a = net.live[(Math.random() * net.live.length) | 0], ds = [];
    for (var d = 0; d < 4; d++) if (net.mask[a] & (1 << d)) ds.push(d);
    c.a = a; c.d = ds[(Math.random() * ds.length) | 0]; c.b = net.nb(a, c.d);
    c.len = net.S; c.t = Math.random() * c.len; c.hist = [];
    c.v = 45 + Math.random() * 65; c.dead = 0; c.age = 0;
    return c;
  }
  function seedComets() {
    var per = VW < 600 ? 7 : VW < 1000 ? 10 : 14, cap = VW < 600 ? 32 : VW < 1000 ? 56 : 80;
    var n = Math.min(cap, Math.max(per, Math.round((per * net.H) / Math.max(VH, 1))));
    comets = [];
    for (var i = 0; i < n; i++) { var c = spawn({}); c.age = 1; comets.push(c); }
  }
  function step(c, dt) {
    c.age += dt;
    if (c.dead) { c.dead += c.v * dt; if (c.dead > TAIL) spawn(c); return; }
    c.t += c.v * dt;
    while (c.t >= c.len) {
      var b = c.b, from = back(c.d), opts = [];
      for (var d = 0; d < 4; d++) if (d !== from && net.mask[b] & (1 << d)) opts.push(d);
      if (!opts.length) { c.t = c.len; c.dead = 0.001; return; }
      c.t -= c.len;
      c.hist.push(c.a); if (c.hist.length > 8) c.hist.shift();
      c.a = b; c.d = opts[(Math.random() * opts.length) | 0]; c.b = net.nb(b, c.d);
    }
  }
  function drawComet(c, oy) {
    var X = net.X, Y = net.Y, u = c.t / c.len;
    var hx = X(c.a) + (X(c.b) - X(c.a)) * u, hy = Y(c.a) + (Y(c.b) - Y(c.a)) * u;
    if (hy < oy - TAIL || hy > oy + VH + TAIL) return;
    var fade = Math.min(1, c.age / 0.8), pts = [hx, hy, X(c.a), Y(c.a)];
    for (var i = c.hist.length - 1; i >= 0; i--) pts.push(X(c.hist[i]), Y(c.hist[i]));
    var seg = 0, segStart = 0, n = pts.length / 2;
    function len(s) { return Math.hypot(pts[s * 2 + 2] - pts[s * 2], pts[s * 2 + 3] - pts[s * 2 + 1]); }
    var segLen = len(0);
    function at(s) {
      while (s > segStart + segLen) { segStart += segLen; seg++; if (seg >= n - 1) return null; segLen = len(seg); }
      var f = segLen ? (s - segStart) / segLen : 0;
      return [pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * f, pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * f];
    }
    ctx.strokeStyle = "#ff77a9"; ctx.lineWidth = 1.3; ctx.lineCap = "round";
    var s = c.dead, p = at(s);
    while (p && s < TAIL) {
      var s2 = Math.min(TAIL, s + 7), q = at(s2);
      if (!q) break;
      ctx.globalAlpha = fade * 0.75 * Math.pow(1 - s / TAIL, 1.4);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      p = q; s = s2;
    }
    if (!c.dead) {
      ctx.fillStyle = "#ff77a9"; ctx.globalAlpha = fade * 0.3;
      ctx.beginPath(); ctx.arc(hx, hy, 3.6, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!net) return;
    var oy = window.scrollY * K, ch = net.chains, i, c;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    var lensOn = lensA > 0.01 && !reduce.matches;
    ctx.translate(0, -oy);
    ctx.strokeStyle = col.trace; ctx.lineWidth = 1; ctx.lineJoin = "miter"; ctx.lineCap = "square";
    for (i = 0; i < ch.length; i++) { c = ch[i]; if (c.y1 >= oy - 2 && c.y0 <= oy + VH + 2) ctx.stroke(c.p); }
    if (lensOn) {
      var wy = py + oy;
      lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = "source-over";
      lx.clearRect(0, 0, lc.width, lc.height);
      lx.setTransform(dpr, 0, 0, dpr, dpr * (LR - px), dpr * (LR - wy));
      lx.strokeStyle = col.hi; lx.lineWidth = 1.2; lx.lineJoin = "miter"; lx.lineCap = "square";
      for (i = 0; i < ch.length; i++) { c = ch[i]; if (c.y1 >= wy - LR && c.y0 <= wy + LR && c.x1 >= px - LR && c.x0 <= px + LR) lx.stroke(c.p); }
      lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = "destination-in";
      var m = lx.createRadialGradient(LR * dpr, LR * dpr, 0, LR * dpr, LR * dpr, LR * dpr);
      m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.35, "rgba(0,0,0,0.7)"); m.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = m; lx.fillRect(0, 0, lc.width, lc.height);
      lx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = lensA; ctx.drawImage(lc, px - LR, wy - LR, LR * 2, LR * 2); ctx.globalAlpha = 1;
    }
    if (!reduce.matches) for (i = 0; i < comets.length; i++) drawComet(comets[i], oy);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fade the board out behind text with a soft, feathered edge (no hard boxes).
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000"; ctx.shadowColor = "#000"; ctx.shadowBlur = 14 * dpr;
    var vx = window.scrollX, vy = window.scrollY;
    for (i = 0; i < boxes.length; i++) {
      var bx = boxes[i], ty = bx[1] - vy;
      if (ty + bx[3] < -20 || ty > VH + 20) continue;
      ctx.fillRect(bx[0] - vx, ty, bx[2], bx[3]);
    }
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
    // The cursor glow is a soft wash, so it goes under everything rather than being cut around text.
    ctx.globalCompositeOperation = "destination-over";
    if (lensOn) {
      var g = ctx.createRadialGradient(px, py, 0, px, py, LR * 1.2);
      g.addColorStop(0, col.glow); g.addColorStop(1, "rgba(255,119,169,0)");
      ctx.globalAlpha = lensA; ctx.fillStyle = g; ctx.fillRect(px - LR * 1.2, py - LR * 1.2, LR * 2.4, LR * 2.4); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function loop(now) {
    if (reduce.matches) { looping = false; draw(); return; }
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    lensA += ((pointOn ? 1 : 0) - lensA) * Math.min(1, dt * 4);
    for (var i = 0; i < comets.length; i++) step(comets[i], dt);
    draw();
    requestAnimationFrame(loop);
  }
  function start() {
    if (reduce.matches) { requestDraw(); return; }
    if (!looping) { looping = true; last = 0; requestAnimationFrame(loop); }
  }
  function requestDraw() {
    if (looping || drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(function () { drawQueued = false; draw(); });
  }
  function readColors() {
    var s = getComputedStyle(cv); // --x-trace, --x-trace-hi, --x-trace-glow, resolved for the current theme
    if (s.color) col.trace = s.color;
    if (s.borderTopColor) col.hi = s.borderTopColor;
    if (s.outlineColor) col.glow = s.outlineColor;
    requestDraw();
  }
  function measure() {
    var w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    var nd = Math.min(2, window.devicePixelRatio || 1);
    if (w !== VW || h !== VH || nd !== dpr) {
      VW = w; VH = h; dpr = nd;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    K = 0;
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var need = VH + Math.max(0, docH - window.innerHeight) * K + 40;
    if (!net || net.W !== VW || net.H < need) { net = build(VW, need + 240); seedComets(); }
    readBoxes();
    LR = VW < 600 ? 130 : 190;
    var ls = Math.round(LR * 2 * dpr);
    if (lc.width !== ls) { lc.width = ls; lc.height = ls; }
    requestDraw();
  }
  function point(e) { px = e.clientX; py = e.clientY; pointOn = true; }

  window.addEventListener("scroll", requestDraw, { passive: true });
  window.addEventListener("resize", measure, { passive: true });
  window.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") point(e); }, { passive: true });
  window.addEventListener("pointerdown", point, { passive: true });
  document.documentElement.addEventListener("mouseleave", function () { pointOn = false; });
  if (reduce.addEventListener) reduce.addEventListener("change", function () { measure(); start(); });
  var dark = window.matchMedia("(prefers-color-scheme: dark)");
  if (dark.addEventListener) dark.addEventListener("change", readColors);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  measure();
  readColors();
  start();
})();
