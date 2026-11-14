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

// Skills drawer, opened by the movable bubble.
(function () {
  var tab = document.getElementById("skills-bubble");
  var drawer = document.getElementById("skills-drawer");
  var scrim = document.getElementById("skills-scrim");
  var closeBtn = document.getElementById("skills-close");
  var title = document.getElementById("skills-title");
  if (!tab || !drawer || !scrim || !closeBtn || !title) return;
  var open = false;

  function setOpen(next, returnFocus) {
    open = next;
    drawer.classList.toggle("is-open", next);
    scrim.classList.toggle("is-open", next);
    drawer.style.transform = "";
    tab.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) { drawer.removeAttribute("inert"); title.focus({ preventScroll: true }); }
    else { drawer.setAttribute("inert", ""); if (returnFocus) tab.focus({ preventScroll: true }); }
  }

  // A click comes from a tap (no drag), Enter or Space; a drag sets data-dragged and is ignored once.
  tab.addEventListener("click", function () {
    if (tab.dataset.dragged) { delete tab.dataset.dragged; return; }
    setOpen(!open, false);
  });
  closeBtn.addEventListener("click", function () { setOpen(false, true); });
  scrim.addEventListener("click", function () { setOpen(false, true); });
  document.addEventListener("keydown", function (e) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false, true); return; }
    if (e.key === "Tab") {
      var f = drawer.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])");
      var first = f[0], last = f[f.length - 1];
      if (!first) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe right on the panel closes it; the panel follows the finger.
  var sx = 0, sy = 0, dx = 0, dragging = false, decided = false;
  drawer.addEventListener("touchstart", function (e) {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; dragging = false; decided = false;
  }, { passive: true });
  drawer.addEventListener("touchmove", function (e) {
    var mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (!decided && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { decided = true; dragging = Math.abs(mx) > Math.abs(my); if (dragging) drawer.classList.add("is-dragging"); }
    if (dragging) { dx = Math.max(0, mx); drawer.style.transform = "translateX(" + dx + "px)"; }
  }, { passive: true });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    drawer.classList.remove("is-dragging");
    if (dx > Math.min(80, drawer.offsetWidth * 0.25)) setOpen(false, true);
    else drawer.style.transform = "";
  }
  drawer.addEventListener("touchend", endDrag);
  drawer.addEventListener("touchcancel", endDrag);
})();

// Skills bubble: drag with mouse or finger (pointer events, one rAF per frame), snap to the nearest
// side on release, stay inside the safe area. Movement under 6px counts as a tap.
(function () {
  var b = document.getElementById("skills-bubble");
  var safeEl = document.getElementById("x-safe");
  if (!b || !safeEl) return;
  var GAP = 12, SLOP = 6;
  var x = 0, y = 0, side = "right", yFrac = 2 / 3, inited = false;
  var id = null, sx = 0, sy = 0, ox = 0, oy = 0, moved = false, queued = false;

  function bounds() {
    var s = getComputedStyle(safeEl), w = b.offsetWidth, h = b.offsetHeight;
    var l = parseFloat(s.paddingLeft) || 0, r = parseFloat(s.paddingRight) || 0;
    var t = parseFloat(s.paddingTop) || 0, bt = parseFloat(s.paddingBottom) || 0;
    var W = window.innerWidth, H = window.innerHeight;
    return { x0: l + GAP, x1: W - r - GAP - w, y0: t + GAP, y1: H - bt - GAP - h };
  }
  function clamp(v, a, z) { return Math.max(a, Math.min(z, v)); }
  function apply() { queued = false; b.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)"; }
  function frame() { if (!queued) { queued = true; requestAnimationFrame(apply); } }
  function place() {
    var r = bounds();
    x = side === "left" ? r.x0 : r.x1;
    y = clamp(r.y0 + (r.y1 - r.y0) * yFrac, r.y0, r.y1);
    apply();
    if (!inited) { inited = true; b.classList.add("is-placed"); }
  }
  function snap() {
    var r = bounds();
    side = x + b.offsetWidth / 2 < window.innerWidth / 2 ? "left" : "right";
    y = clamp(y, r.y0, r.y1);
    yFrac = r.y1 > r.y0 ? (y - r.y0) / (r.y1 - r.y0) : 0;
    b.classList.add("is-snapping");
    x = side === "left" ? r.x0 : r.x1;
    apply();
  }
  b.addEventListener("transitionend", function () { b.classList.remove("is-snapping"); });

  b.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || id !== null) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; ox = x; oy = y; moved = false;
    b.classList.remove("is-snapping");
    try { b.setPointerCapture(id); } catch (err) { /* capture unavailable: moves still arrive on the bubble */ }
  });
  b.addEventListener("pointermove", function (e) {
    if (e.pointerId !== id) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) <= SLOP) return;
    if (!moved) { moved = true; b.classList.add("is-dragging"); }
    var r = bounds();
    x = clamp(ox + dx, r.x0, r.x1); y = clamp(oy + dy, r.y0, r.y1);
    frame();
  });
  function release(e) {
    if (e.pointerId !== id) return;
    id = null;
    b.classList.remove("is-dragging");
    if (moved) { b.dataset.dragged = "1"; snap(); setTimeout(function () { delete b.dataset.dragged; }, 400); }
  }
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", function (e) { release(e); delete b.dataset.dragged; });

  window.addEventListener("resize", place, { passive: true });
  place();
})();

// Circuit board: one connected network grown over a grid that covers the whole document
// (a single tree, so every trace joins the others, plus a few loops), drawn on one canvas.
// Runs are straight horizontal or vertical lines meeting at right angles; T junctions at most.
// Comets walk the network edge by edge and pick a random branch at every junction.
// The board scrolls at 85% of the content's speed; a pink glow follows the cursor or last touch.
(function () {
  var cv = document.getElementById("x-net");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Directions: 0 right, 1 down, 2 left, 3 up; the opposite of d is (d + 2) % 4.
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], TAIL = 120;
  var net = null, comets = [], dpr = 1, VW = 0, VH = 0, K = 0.85;
  var col = { trace: "rgba(255,119,169,0.4)", hi: "rgba(255,119,169,0.9)", glow: "rgba(255,119,169,0.1)" };
  var px = 0, py = 0, pointOn = false, lensA = 0, LR = 190;
  var lc = document.createElement("canvas"), lx = lc.getContext("2d");
  var last = 0, looping = false, drawQueued = false;

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
    if (lensOn) {
      var g = ctx.createRadialGradient(px, py, 0, px, py, LR * 1.2);
      g.addColorStop(0, col.glow); g.addColorStop(1, "rgba(255,119,169,0)");
      ctx.globalAlpha = lensA; ctx.fillStyle = g; ctx.fillRect(px - LR * 1.2, py - LR * 1.2, LR * 2.4, LR * 2.4); ctx.globalAlpha = 1;
    }
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
    K = reduce.matches ? 1 : 0.85;
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var need = VH + Math.max(0, docH - window.innerHeight) * K + 40;
    if (!net || net.W !== VW || net.H < need) { net = build(VW, need + 240); seedComets(); }
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
  measure();
  readColors();
  start();
})();
