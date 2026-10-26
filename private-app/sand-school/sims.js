/* Winter-wind fence animation + jetty one-line shoreline simulation for Hamilton Beach */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function loadImg(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function onVisible(el, cb) {
    const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
  }
  function polyLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  function pointOn(p, t) { // t in 0..1 along polyline
    const L = polyLen(p) * t; let acc = 0;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (acc + seg >= L) { const f = (L - acc) / seg; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f, (p[i][0] - p[i - 1][0]) / seg, (p[i][1] - p[i - 1][1]) / seg]; }
      acc += seg;
    }
    const n = p.length - 1; return [p[n][0], p[n][1], 1, 0];
  }
  function segCross(a, b, c, d) { // segments ab, cd intersect?
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }

  fetch('geom.json').then((r) => { if (!r.ok) throw new Error('Simulation data unavailable'); return r.json(); })
    .then((G) => Promise.all([initWind(G.base_fence), initJetty(G.base_fence)]))
    .catch(() => {
      for (const id of ['windCanvas', 'jettyCanvas']) {
        const canvas = document.getElementById(id);
        if (!canvas) continue;
        const notice = document.createElement('p');
        notice.className = 'simulation-load-error';
        notice.setAttribute('role', 'alert');
        notice.textContent = 'The simulation data or aerial image could not load. Reload this learning section to retry; the teaching text remains available.';
        canvas.before(notice);
      }
    });

  /* ---------------- Winter wind vs fences ---------------- */
  async function initWind(o) {
    const cv = document.getElementById('windCanvas'); if (!cv) return;
    const img = await loadImg('img/base_fence.webp');
    const W = o.size[0], H = o.size[1]; cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const fences = Object.values(o.fences);
    const WINDS = { NE: [-Math.SQRT1_2, Math.SQRT1_2], NW: [Math.SQRT1_2, Math.SQRT1_2] }; // blowing toward SW / SE (image is north-up)
    let wk = 'NE', WIND = WINDS.NE;
    const mpp = o.mpp, m = (x) => x / mpp;
    const monthEl = document.getElementById('windMonth');
    const months = ['Mid-Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
    let streaks = [], grains = [], dep = fences.map((f) => new Array(40).fill(0)), t0 = performance.now(), running = false, raf = 0;

    function spawnStreak() { return { x: (WIND[0] < 0 ? W * 0.2 : -W * 0.4) + Math.random() * W * 1.2, y: Math.random() * H * 1.2 - H * 0.4, life: 0, slow: 0 }; }
    for (let i = 0; i < 160; i++) { const s = spawnStreak(); s.life = Math.random() * 200; streaks.push(s); }
    function spawnGrain() {
      const fi = Math.floor(Math.random() * fences.length), f = fences[fi], u = Math.random();
      const p = pointOn(f, u), up = m(4 + Math.random() * 7); // start 4–11 m upwind of the fence
      return { x: p[0] - WIND[0] * up, y: p[1] - WIND[1] * up, fi, u, done: false, a: 1 };
    }
    function drawStatic() {
      ctx.drawImage(img, 0, 0, W, H);
      ctx.fillStyle = 'rgba(10,25,30,.18)'; ctx.fillRect(0, 0, W, H);
      // walled front: no fence
      line(o.walled, 'rgba(220,40,30,.95)', 7, [14, 10]);
      // wet point
      ctx.save(); ctx.beginPath(); o.wet_point.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = 'rgba(60,140,220,.28)'; ctx.fill(); ctx.strokeStyle = 'rgba(60,140,220,.95)'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.restore();
      Object.values(o.small).forEach((p) => line(p, 'rgba(255,150,30,.95)', 6, [6, 7]));
      // fences + deposits
      fences.forEach((f, fi) => {
        for (let k = 0; k < 40; k++) {
          const d = dep[fi][k]; if (d < 0.02) continue;
          const p = pointOn(f, (k + 0.5) / 40), r = m(1.2 + d * 3.2);
          ctx.fillStyle = `rgba(240,214,150,${Math.min(0.95, 0.35 + d)})`;
          ctx.beginPath(); ctx.ellipse(p[0] + WIND[0] * r * 0.25, p[1] + WIND[1] * r * 0.25, r, r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        }
        line(f, '#3a2410', 8); line(f, '#b07a3a', 4);
        const L = polyLen(f), n = Math.floor(L / 9);
        for (let i = 0; i <= n; i++) { const p = pointOn(f, i / n); ctx.fillStyle = '#2a1708'; ctx.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5); }
      });
      tag(o.fences.A1[1], 'A: 50 ft spur fences, east end', -150, 56);
      tag(o.fences.B4[0], 'B: 25 ft fence sections, side beach', -380, 0);
      tag(o.walled[3], 'No fence: water at the wall', -40, 34, 'rgba(220,40,30,.95)');
      tag(o.wet_point[2], 'No fence: point too wet', -150, -40, 'rgba(60,140,220,.95)');
      tag(o.small.north[0], 'Too small', 14, 6, 'rgba(255,150,30,.95)');
      tag(o.small.t2708[0], 'Too small', -90, -22, 'rgba(255,150,30,.95)');
      // big wind label
      if (wk === 'NE') { arrow(W - 70, 60, W - 190, 180); label(W - 420, 262, "Nor'easter wind from the NE", 'rgba(255,255,255,.92)'); }
      else { arrow(70, 60, 190, 180); label(40, 226, 'Winter wind from the NW', 'rgba(255,255,255,.92)'); }
    }
    function line(p, col, w, dash) { ctx.save(); ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.restore(); }
    function label(x, y, t, bg, col) { ctx.font = '600 22px "General Sans", sans-serif'; const w = ctx.measureText(t).width; ctx.fillStyle = bg; ctx.fillRect(x - 8, y - 22, w + 16, 32); ctx.fillStyle = col || '#13201f'; ctx.fillText(t, x, y + 2); }
    function tag(p, t, dx, dy, c) { ctx.font = '600 19px "General Sans", sans-serif'; const w = ctx.measureText(t).width, x = p[0] + dx, y = p[1] + dy; ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.fillRect(x - 6, y - 18, w + 12, 27); if (c) { ctx.fillStyle = c; ctx.fillRect(x - 6, y - 18, 5, 27); } ctx.fillStyle = '#13201f'; ctx.fillText(t, x + 2, y + 2); }
    function arrow(x1, y1, x2, y2) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2 + 16 * Math.cos(a), y2 + 16 * Math.sin(a)); ctx.lineTo(x2 + 18 * Math.cos(a + 2.4), y2 + 18 * Math.sin(a + 2.4)); ctx.lineTo(x2 + 18 * Math.cos(a - 2.4), y2 + 18 * Math.sin(a - 2.4)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill(); ctx.restore(); }

    function frame(now) {
      const T = ((now - t0) / 1000) % 24; // 24 s = one fence season
      if (T < 0.05) dep = fences.map(() => new Array(40).fill(0));
      const mi = Math.min(7, Math.floor(T / 3)); if (monthEl) monthEl.textContent = months[mi] + (mi === 7 ? ': fences come out, the mound and beachgrass stay' : '');
      drawStatic();
      // wind streaks
      ctx.lineCap = 'round';
      streaks.forEach((s) => {
        const v = s.slow > 0 ? 1.1 : 3.4; const ox = s.x, oy = s.y;
        s.x += WIND[0] * v; s.y += WIND[1] * v; s.life++; if (s.slow > 0) s.slow--;
        for (const f of fences) for (let i = 1; i < f.length; i++) if (segCross([ox, oy], [s.x, s.y], f[i - 1], f[i])) s.slow = 55;
        ctx.strokeStyle = s.slow > 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - WIND[0] * v * 9, s.y - WIND[1] * v * 9); ctx.lineTo(s.x, s.y); ctx.stroke();
        if (s.x < -40 || s.x > W + 40 || s.y > H + 40 || s.life > 420) Object.assign(s, spawnStreak(), { life: 0, slow: 0 });
      });
      // sand grains blown to the fence
      if (T < 21 && grains.length < 220) for (let k = 0; k < 4; k++) grains.push(spawnGrain());
      grains.forEach((g) => {
        if (!g.done) {
          const f = fences[g.fi], p = pointOn(f, g.u); const dist = (p[0] - g.x) * WIND[0] + (p[1] - g.y) * WIND[1];
          if (dist <= 0) { g.done = true; const k = Math.min(39, Math.floor(g.u * 40)); dep[g.fi][k] = Math.min(1, dep[g.fi][k] + 0.012); }
          else { g.x += WIND[0] * 1.6; g.y += WIND[1] * 1.6; }
        } else g.a -= 0.04;
        ctx.fillStyle = `rgba(247,222,160,${Math.max(0, g.a)})`; ctx.beginPath(); ctx.arc(g.x, g.y, 2.6, 0, Math.PI * 2); ctx.fill();
      });
      grains = grains.filter((g) => g.a > 0);
      if (running) raf = requestAnimationFrame(frame);
    }
    document.querySelectorAll('[data-wind]').forEach((b) => b.addEventListener('click', () => {
      wk = b.dataset.wind; WIND = WINDS[wk];
      document.querySelectorAll('[data-wind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      document.querySelectorAll('.xs-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === wk));
      dep = fences.map(() => new Array(40).fill(reduce ? 0.6 : 0)); grains = []; t0 = performance.now();
      streaks.forEach((st) => Object.assign(st, spawnStreak(), { life: Math.random() * 200, slow: 0 }));
      drawStatic();
    }));
    if (reduce) { dep = fences.map(() => new Array(40).fill(0.6)); drawStatic(); if (monthEl) monthEl.textContent = 'End of season (animation off)'; return; }
    onVisible(cv, (vis) => { if (vis && !running) { running = true; raf = requestAnimationFrame(frame); } else if (!vis) { running = false; cancelAnimationFrame(raf); } });
    drawStatic();
  }

  /* ---------------- Jetty simulation (simple one-line shoreline model) ---------------- */
  async function initJetty(o) {
    const cv = document.getElementById('jettyCanvas'); if (!cv) return;
    const img = await loadImg('img/base_fence.webp');
    const W = o.size[0], H = o.size[1]; cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const N = o.nodes.length, dx = 5, mpp = o.mpp;
    const yEl = document.getElementById('jYear'), ySl = document.getElementById('jYears'), out = document.getElementById('jOut');
    const playBtn = document.getElementById('jPlay');
    const SC = {
      today: { label: 'Doing nothing', jets: ['A'], fill: false, nour: 0, len: 30.5, fmin: 0.15 },
      cur: { jets: ['A', 'C1', 'C2'], fill: true, nour: 100, restore: 1000, len: 30.5, fmin: 0.15 },
    };
    const tJ2 = document.getElementById('jt2'), tJ3 = document.getElementById('jt3'), tSand = document.getElementById('jsand'), tDump = document.getElementById('jdump'), tPf = document.getElementById('jpf'), oPf = document.getElementById('jpfo');
    const geo=window.HBAJettyGeometry;
    const angle2=document.getElementById('jAngle2'),angle3=document.getElementById('jAngle3');
    if(angle2)angle2.value=Math.round(geo.defaults.C1.bearing);
    if(angle3)angle3.value=Math.round(geo.defaults.C2.bearing);
    function config() {
      const sand = !tSand || tSand.checked;
      SC.cur = { jets: ['A'].concat(tJ2 && tJ2.checked ? ['C1'] : [], tJ3 && tJ3.checked ? ['C2'] : []), pf: tPf ? +tPf.value / 100 : 1, fill: (tPf ? +tPf.value : 100) > 0, sand, nour: sand ? 100 : 0, restore: sand ? 1000 : 0, len: 30.5, fmin: 0.15 };
    }
    config();
    const sA = o.jetties.find((j) => j.id === 'A').s, sJ2 = o.jetties.find((j) => j.id === 'J2').s, sC1 = o.jetties.find((j) => j.id === 'C1').s;
    const zoneC = o.nodes.map((n) => n.s > sA && n.s < sC1);   // central: 1A groin to the middle circled jetty
    const zoneE = o.nodes.map((n) => n.s >= sC1);               // east end
    const zoneW2 = o.nodes.map((n) => n.s >= sC1 - 15 && n.s < sC1);
    // start in 2026: 2013 surveyed width moved forward on the 1978-2013 trend
    const yStart = o.nodes.map((n) => n.w0 + n.r * 13);
    const Qb = 45, Kd = 600, dt = 0.01; // m^2/yr of plan area (about 90 m^3/yr at 2 m active height)
    let sc = 'cur', results = {};

    function jetList(key) {
      const s = SC[key];
      const list = o.jetties.filter((j) => s.jets.includes(j.id)).map((j) => {
        const k = Math.round(j.s / dx),physicalLength=j.existing?j.len:s.len;
        const selectedAngle=j.id==='C1'?Number(angle2?.value):j.id==='C2'?Number(angle3?.value):geo.defaults.A.bearing;
        const bearing=Number.isFinite(selectedAngle)&&selectedAngle>=110&&selectedAngle<=210?selectedAngle:geo.defaults[j.id]?.bearing??160;
        return { id: j.id, k, physicalLength,bearing,len:geo.projection(physicalLength,bearing,o.nodes[k].n),fmin:s.fmin,existing:!!j.existing };
      });
      return list;
    }
    function simulate(key, years) {
      const s = SC[key], all = jetList(key), jets = all.filter((j) => !j.existing); // the 1A groin is already in the measured trend
      const eta = new Array(N).fill(0);
      if (s.fill) jets.forEach((j) => { for (let i = 0; i < N; i++) { const d = (j.k - i) * dx; if (d >= 0 && d < 4 * j.len) { const need = (s.pf == null ? 1 : s.pf) * (j.len * 0.95 * (1 - d / (4 * j.len)) - Math.max(0, yStart[i])); if (need > eta[i]) eta[i] = need; } } });
      const fillVol = eta.reduce((a, v) => a + Math.max(0, v), 0) * dx * 2 * 1.308;
      const pockets = jets.map((j) => { let i0 = j.k; while (i0 > 0 && eta[i0 - 1] > 0.05 && !jets.some((q) => q.k === i0 - 1)) i0--; let v = 0; for (let i = i0; i < j.k; i++) v += Math.max(0, eta[i]); return { id: j.id, i0, k: j.k, vol: v * dx * 2 * 1.308 }; });
      const base = (i, t) => Math.max(0, yStart[i] + o.nodes[i].r * t); // the wall stops the shoreline; extra loss lowers the beach instead
      const widths = (t) => o.nodes.map((n, i) => Math.max(0, base(i, t) + eta[i]));
      const frames = [widths(0)], held = [0], steps = Math.round(1 / dt); let blocked = 0;
      for (let yr = 1; yr <= years; yr++) {
        const kA = Math.round(sA / dx);
        if (s.restore && yr <= 3) { const kB = Math.round(sJ2 / dx) + 6, n = kB - kA; for (let i = kA + 1; i <= kB; i++) eta[i] += (s.restore / 2) / (n * dx); } // ~1,300 cu yd a fall for three falls
        else if (s.nour) { for (let i = kA + 1; i <= kA + 8; i++) eta[i] += (s.nour / 2) / (8 * dx); }
        for (let st = 0; st < steps; st++) {
          const t = yr - 1 + st * dt, F = new Array(N + 1);
          F[0] = Qb; F[N] = Qb;
          for (let i = 0; i < N - 1; i++) {
            let f = Qb - Kd * (eta[i + 1] - eta[i]) / dx;
            const j = jets.find((q) => q.k === i + 1);
            if (j) { const yUp = Math.max(0, base(i, t) + eta[i]); const r = Math.min(1, yUp / j.len); const pass = yUp >= j.len ? 1 : j.fmin + (1 - j.fmin) * r * r; if (pass < 1) { f = Qb * pass; blocked += (Qb - f) * dt; } } // a jetty blocks sand until its pocket fills to the tip
            F[i + 1] = f;
          }
          for (let i = 0; i < N; i++) eta[i] -= dt * (F[i + 1] - F[i]) / dx;
        }
        frames.push(widths(yr)); held.push(blocked * 2 * 1.308);
      }
      return { frames, held, jets: all, fillVol, pockets };
    }
    function avg(arr, mask) { let s = 0, n = 0; arr.forEach((v, i) => { if (mask[i]) { s += v; n++; } }); return s / n; }
    Object.keys(SC).forEach((k) => (results[k] = simulate(k, 20)));
    const ft = (m) => Math.round(m * 3.281);
    const y0 = results.today.frames[0];

    let grains = [];
    function draw(year) {
      const R = results[sc], y = R.frames[year];
      ctx.drawImage(img, 0, 0, W, H);
      const P = (i, w) => { const n = o.nodes[i]; return [n.wall[0] + n.n[0] * w, n.wall[1] + n.n[1] * w]; }; // n = image px per metre, seaward
      // modeled high-tide beach as a see-through tint over the real photo
      ctx.beginPath(); for (let i = 0; i < N; i++) { const p = P(i, 0); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      for (let i = N - 1; i >= 0; i--) { const p = P(i, y[i]); ctx.lineTo(p[0], p[1]); }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,214,120,.28)'; ctx.fill();
      // gain (green) and loss (red) since 2026
      for (let i = 0; i < N - 1; i++) {
        const d = (y[i] + y[i + 1]) / 2 - (y0[i] + y0[i + 1]) / 2; if (Math.abs(d) < 0.15) continue;
        const a1 = P(i, y0[i]), a2 = P(i + 1, y0[i + 1]), b2 = P(i + 1, y[i + 1]), b1 = P(i, y[i]);
        ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath();
        ctx.fillStyle = d > 0 ? 'rgba(60,200,110,.6)' : 'rgba(235,70,50,.65)'; ctx.fill();
      }
      ctx.beginPath(); for (let i = 0; i < N; i++) { const p = P(i, y[i]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < N; i++) { const p = P(i, y0[i]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.restore();
      // wall
      ctx.beginPath(); o.nodes.forEach((n, i) => (i ? ctx.lineTo(n.wall[0], n.wall[1]) : ctx.moveTo(n.wall[0], n.wall[1]))); ctx.strokeStyle = '#3b3b3b'; ctx.lineWidth = 3; ctx.stroke();
      // jetties
      R.jets.forEach((j) => {
        const n=o.nodes[j.k],a=n.wall,v=geo.axis(j.bearing),b=[a[0]+v[0]*j.physicalLength/mpp,a[1]+v[1]*j.physicalLength/mpp];
        ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = j.existing ? 9 : 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.strokeStyle = j.existing ? '#a8a8a8' : (j.id[0] === 'X' ? '#6fd0ff' : '#f2ece0'); ctx.lineWidth = j.existing ? 5 : 4; ctx.stroke();
        ctx.font = '700 15px "General Sans", sans-serif'; const t = j.existing ? '1A Worrall groin (installed)' : ({ C1: 'Jetty 2 (100 ft)', C2: 'Jetty 3 (100 ft)' }[j.id]);
        const w = ctx.measureText(t).width, lp = [b[0] + n.n[0] * 3, b[1] + n.n[1] * 3], x = Math.min(W - w - 10, Math.max(10, j.id === 'C1' ? lp[0] - w - 14 : lp[0] + 6)), yy = Math.min(H - 50, Math.max(28, lp[1] + 12 + (j.id === 'X2' || j.id === 'J3' ? 22 : 0))); ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(x - 5, yy - 16, w + 10, 22); ctx.fillStyle = '#16211f'; ctx.fillText(t, x, yy);
      });
      // where to dump sand
      if (!tDump || tDump.checked) {
        const zone = (i0, i1, w, col) => { ctx.beginPath(); for (let i = i0; i <= i1; i++) { const p = P(i, 0.5); i === i0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } for (let i = i1; i >= i0; i--) { const p = P(i, w); ctx.lineTo(p[0], p[1]); } ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.save(); ctx.setLineDash([9, 6]); ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); };
        const lab = (i, w, lines, dxp, dyp) => { const p = P(i, w); ctx.font = '700 16px "General Sans", sans-serif'; const ww = Math.max(...lines.map((t) => ctx.measureText(t).width)); const x = Math.min(W - ww - 20, Math.max(10, p[0] + dxp)), y = p[1] + dyp; ctx.fillStyle = 'rgba(255,138,0,.95)'; ctx.fillRect(x - 8, y - 20, ww + 16, lines.length * 21 + 10); ctx.fillStyle = '#1b1206'; lines.forEach((t, k) => { ctx.font = (k ? '600 14px' : '700 16px') + ' "General Sans", sans-serif'; ctx.fillText(t, x, y + k * 21); }); };
        const kA = Math.round(sA / dx), kB = Math.round(250 / dx);
        zone(kA + 1, kB, 10, 'rgba(255,138,0,.30)');
        lab(Math.round((kA + kB) / 2), 12, ['Dump zone 1: beach restoration', 'about 150 truckloads over 3 falls (50 a fall),', 'then about 5 loads each fall at the west end'], -120, 46);
        (R.pockets || []).forEach((pk, n) => { if (pk.vol < 26) return; const i0 = Math.max(pk.i0, kB + 1); if (i0 >= pk.k) return; zone(i0, pk.k - 1, 12, 'rgba(255,200,60,.38)'); lab(pk.k - 2, 14, [`Pre-fill west of ${pk.id === 'C1' ? 'Jetty 2' : 'Jetty 3'}`, `about ${Math.round(pk.vol / 26 / 5) * 5} truckloads, once, at build time`], pk.id === 'C1' ? -330 : 20, pk.id === 'C1' ? 70 : 100); });
        const e = o.nodes[Math.round(o.jetties.find((j) => j.id === 'C1').s / dx)].wall; ctx.fillStyle = '#ff8a00'; ctx.beginPath(); ctx.arc(e[0], e[1], 9, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#1b1206'; ctx.lineWidth = 2; ctx.stroke();
        ctx.font = '700 15px "General Sans", sans-serif'; const tt = 'Beach entrance: truck access'; const tw = ctx.measureText(tt).width; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(e[0] - tw - 26, e[1] - 34, tw + 12, 22); ctx.fillStyle = '#1b1206'; ctx.fillText(tt, e[0] - tw - 20, e[1] - 18);
      }
      // drift arrow
      ctx.font = '600 20px "General Sans", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillText('Waves push sand east, toward the point  →', W * 0.42, H - 24);
      const LG = [['#ffd34d', 'Model high-tide line'], ['#ffffff', '2026 high-tide line (dashed)'], ['rgba(60,200,110,.95)', 'Beach gained since 2026'], ['rgba(235,70,50,.95)', 'Beach lost since 2026'], ['#ff8a00', 'Where to dump sand']];
      ctx.font = '600 16px "General Sans", sans-serif'; ctx.fillStyle = 'rgba(14,22,24,.8)'; ctx.fillRect(14, 14, 296, LG.length * 26 + 14);
      LG.forEach(([c, t], i) => { ctx.fillStyle = c; ctx.fillRect(26, 28 + i * 26, 22, 10); ctx.fillStyle = '#fff'; ctx.fillText(t, 58, 38 + i * 26); });
      // stats
      const T = results.today.frames[year];
      const c1 = avg(y, zoneC), e1 = avg(y, zoneE), dc = c1 - avg(T, zoneC), de = e1 - avg(T, zoneE);
      const sgn = (v) => (Math.round(v * 3.281) > 0 ? '+' : '') + ft(v) + ' ft';
      const w2 = avg(y, zoneW2) - avg(T, zoneW2);
      const extra = SC[sc].restore ? ', about 3,900 cu yd over the first three falls, then about 130 cu yd each fall' : '';
      if (out) out.innerHTML = `<div><b>${ft(c1)} ft</b><span>average high-tide beach, central (1A groin to Jetty 2)${sc === 'today' ? '' : `, ${sgn(dc)} vs. doing nothing`}</span></div>`
        + `<div><b>${sc === 'today' ? '—' : sgn(w2)}</b><span>beach just west of Jetty 2, vs. doing nothing</span></div>`
        + `<div><b>${sc === 'today' ? '—' : Math.round(R.held[year] / 10) * 10 + ' cu yd'}</b><span>sand the new jetties have held back from the beach to the east${sc === 'today' ? '' : ' (that beach lowers in front of the wall)'}</span></div>`
        + `<div><b>${ft(e1)} ft</b><span>average high-tide beach, east end${sc === 'today' ? '' : `, ${sgn(de)} vs. doing nothing`}</span></div>`
        + `<div><b>${R.fillVol ? Math.round(R.fillVol / 10) * 10 + ' cu yd' : 'None'}</b><span>sand to pre-fill the jetty pockets${R.fillVol ? ` (about ${Math.round(R.fillVol / 26)} truckloads)` : ''}${extra}</span></div>`;
      return y;
    }
    // drifting grains (visual only)
    function animGrains(y) {
      const R = results[sc];
      if (grains.length < 70) grains.push({ s: Math.random() * 60, off: Math.random(), stop: 0 });
      grains.forEach((g) => {
        if (g.stop) { g.stop--; return; }
        const k0 = Math.floor(g.s / dx); const j = R.jets.find((q) => q.k === k0 + 1 && g.s + 1.2 >= q.k * dx);
        if (j && y[k0] < j.len && Math.random() > (j.fmin + 0.25)) { g.stop = 80 + Math.random() * 120; g.s = j.k * dx - 2 - Math.random() * 8; return; }
        g.s += 1.2;
        if (g.s >= (N - 1) * dx) { g.s = Math.random() * 40; }
      });
      grains.forEach((g) => {
        const k = Math.min(N - 1, Math.floor(g.s / dx)), n = o.nodes[k], yy = Math.max(1, y[k]) * (0.55 + 0.4 * g.off);
        ctx.fillStyle = g.stop ? 'rgba(150,100,40,.95)' : 'rgba(255,240,200,.95)'; ctx.beginPath();
        ctx.arc(n.wall[0] + n.n[0] * yy, n.wall[1] + n.n[1] * yy, 2.6, 0, Math.PI * 2); ctx.fill();
      });
    }
    let year = +ySl.value, playing = false, last = 0, raf = 0, vis = false;
    function setYear(v) { year = v; ySl.value = v; yEl.textContent = v === 0 ? '2026' : `${2026 + v} (year ${v})`; }
    function loop(now) {
      if (playing && now - last > 700) { last = now; setYear(year >= 20 ? 0 : year + 1); }
      const y = draw(year); if (!reduce) animGrains(y);
      if (vis) raf = requestAnimationFrame(loop);
    }
    ySl.addEventListener('input', () => { playing = false; playBtn.textContent = 'Play 20 years'; setYear(+ySl.value); if (reduce || !vis) draw(year); });
    playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play 20 years'; if (playing && year >= 20) setYear(0); });
    function pfOut() { if (!oPf) return; const v = +tPf.value, R = results.cur; oPf.textContent = v === 0 ? 'None' : `${v}% of a full pocket · ${R ? Math.round(R.fillVol / 10) * 10 : 0} cu yd · about ${R ? Math.round(R.fillVol / 26) : 0} truckloads`; }
    const rerun = () => { config(); results.cur = simulate('cur', 20); sc = 'cur'; grains = []; draw(year); updateNote(); pfOut(); };
    [tJ2, tJ3, tSand, tDump].forEach((el) => el && el.addEventListener('change', rerun));
    [angle2,angle3].forEach(el=>el?.addEventListener('input',rerun));
    document.getElementById('jAngleReset')?.addEventListener('click',()=>{
      angle2.value=Math.round(geo.defaults.C1.bearing);angle3.value=Math.round(geo.defaults.C2.bearing);rerun();
    });
    if (tPf) tPf.addEventListener('input', rerun);
    const note = document.getElementById('jNote');
    function updateNote() {
      const c = SC.cur, n2 = c.jets.includes('C1'), n3 = c.jets.includes('C2'), nj = (n2 ? 1 : 0) + (n3 ? 1 : 0);
      let t = nj === 0 ? 'Only the 1A Worrall groin, which is already installed. ' : `The 1A Worrall groin plus ${n2 && n3 ? 'Jetty 2 and Jetty 3' : n2 ? 'Jetty 2' : 'Jetty 3'}, rebuilt at 100 ft where the 1938 photo shows them. `;
      const pct = Math.round((c.pf || 0) * 100);
      if (!c.sand && !c.fill) t += nj ? 'With no new sand, each new jetty first grabs passing sand to build a pocket on its west side, and the beach east of it gets less sand until that pocket fills.' : 'With no new sand, the beach follows its measured 1978–2013 trend: the central beach keeps shrinking toward the wall and the east end keeps growing.';
      else {
        if (c.sand) t += 'Restoration: about 3,900 cu yd (150 truckloads over three falls) goes in dump zone 1 east of the 1A groin, then about 5 loads each fall. ';
        if (nj) t += pct === 0 ? 'No pre-fill: each new jetty fills its pocket by taking passing sand, so the beach east of it gets less sand until the pocket is full.' : pct < 100 ? `Pre-fill at ${pct}%: the pockets start part full, and the jetties take the rest from passing sand, so the beach east of them is short of sand for a while.` : 'Full pre-fill: each new jetty\'s pocket is filled once, when it is built, so sand keeps moving east right away.';
      }
      t+=' Angles are photo/plan estimates, not verified survey bearings. Angle changes affect the drawing and a simple cross-shore length projection only; wave diffraction, tide-driven circulation, structure height/permeability, and angle-specific sediment transport are not calibrated.';
      if (note) note.textContent = t;
    }
    updateNote(); pfOut(); setYear(0); draw(0);
    const io = new IntersectionObserver((es) => es.forEach((e) => { vis = e.isIntersecting; if (vis) raf = requestAnimationFrame(loop); else cancelAnimationFrame(raf); }), { threshold: 0.05 });
    io.observe(cv);
  }
})();
