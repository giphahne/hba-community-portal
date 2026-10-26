(() => {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
  const themeHooks = [];
  $('#themeBtn').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
    themeHooks.forEach((f) => f());
  });
  const ft = (m) => Math.round(m * 3.281);

  /* ---------------- Seasons profile ---------------- */
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const summer = [[60, 148], [360, 150], [430, 182], [520, 228], [640, 240], [800, 244]];
  const winter = [[60, 178], [150, 182], [260, 214], [380, 236], [520, 214], [640, 240], [800, 244]];
  function interp(f) {
    // resample both onto x grid
    const xs = []; for (let x = 60; x <= 800; x += 10) xs.push(x);
    const at = (pts, x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return pts[pts.length - 1][1]; };
    return xs.map((x) => [x, at(summer, x) * (1 - f) + at(winter, x) * f]);
  }
  const seasonMsg = (m) => {
    if (m <= 2 || m === 11) return 'Winter. Storms pull sand off the upper beach and park it offshore in a sandbar. The dry beach in front of the wall is at its narrowest, and storm waves can hit the wall directly.';
    if (m <= 4) return 'Spring. Gentle waves start pushing the sandbar back onshore. The beach rebuilds. This is also when shorebirds start nesting, so heavy work should be done before April 1.';
    if (m <= 8) return 'Summer. The beach is at its widest. Sand from the bar has rebuilt a flat, dry shelf called the berm. Southwest winds keep the sand drifting east toward the point.';
    return "Fall. The first big storms arrive. This is the best time to add sand, so a cushion is in place before winter.";
  };
  function drawProfile() {
    const m = +$('#mon').value, f = (1 + Math.cos((2 * Math.PI * (m - 1)) / 12)) / 2;
    const pts = interp(f), tide = 190;
    const path = 'M' + pts.map((p) => p.join(' ')).join(' L') + ' L800 300 L60 300 Z';
    const isDark = theme === 'dark';
    const barX = 520, barY = pts.find((p) => p[0] === barX)[1];
    $('#profile').innerHTML = `
      <rect x="0" y="${tide}" width="800" height="${300 - tide}" fill="${isDark ? '#1d5660' : '#7fb8bf'}"/>
      <path d="${path}" fill="${isDark ? '#b89a68' : '#e3c890'}" stroke="${isDark ? '#d8ad62' : '#b88a4a'}" stroke-width="2"/>
      <rect x="20" y="70" width="40" height="230" fill="#6b6f72"/>
      <line x1="60" x2="800" y1="${tide}" y2="${tide}" stroke="${isDark ? '#bfe3df' : '#1f5f69'}" stroke-dasharray="6 5" stroke-width="2"/>
      <text x="22" y="62" class="svgt" style="font-size:14px">Seawall</text>
      <text x="640" y="${tide - 8}" class="svgt" style="font-size:14px">High tide</text>
      <text x="${f < 0.5 ? 150 : 80}" y="${pts[f < 0.5 ? 10 : 3][1] - 12}" class="svgt" style="font-size:14px">${f < 0.5 ? 'Berm (dry beach)' : 'Narrow beach'}</text>
      ${f > 0.45 ? `<text x="${barX - 30}" y="${barY + 32}" class="svgt" style="font-size:14px;fill:#fff">Sandbar</text>` : ''}
      ${f > 0.6 ? `<g stroke="#fff" stroke-width="2.5" fill="none"><path d="M300 150 q 30 -30 60 0"/><path d="M300 150 l -6 -9 m 6 9 l 10 -4"/></g><text x="230" y="140" class="svgt" style="font-size:13px">Storm waves pull sand out</text>` : ''}
      <text x="660" y="40" class="svgt">${months[m]}</text>`;
    $('#monOut').textContent = months[m];
    $('#seasonText').textContent = seasonMsg(m);
  }
  $('#mon').addEventListener('input', drawProfile);
  themeHooks.push(drawProfile);
  drawProfile();

  /* ---------------- Aerial photo + hotspots ---------------- */
  const spots = [
    { n: 1, x: 6, y: 80, c: 'erode', t: 'West walled pocket', tag: 'Eroding', stats: [['Change per year', 'up to −0.5 ft'], ['High-tide beach', 'gone ~2017–2018']], p: 'Behind the walls at the west end, there\'s almost no high-tide beach left. Further erosion here makes the beach lower in front of the walls rather than moving the shoreline back. State transects 2702–2704.' },
    { n: 2, x: 24, y: 74.5, c: 'erode', t: '1A Worrall Ave groin', tag: 'Eroding', stats: [['Change per year', '−0.6 ft'], ['High-tide beach', 'gone ~2019–2021']], p: 'Erosion starts right here. The long groin catches sand on its west side, so the beach just east of it is starved. It\'s the best place to add sand, because waves then carry it east along the whole central beach. State transect 2705.' },
    { n: 3, x: 32, y: 69, c: 'erode', t: 'Central beach', tag: 'Fastest loss', stats: [['Change per year', '−0.6 to −1.1 ft'], ['High-tide beach', 'gone ~2021–2024 at 2707']], p: 'Since the post-dredge 1978 survey this is the fastest-eroding stretch. Recent photos show water reaching the walls here at high tide. This is the main zone for the yearly sand placement. State transects 2706–2707.' },
    { n: 4, x: 41, y: 63, c: 'erode', t: 'Central-east', tag: 'Next to go', stats: [['Change per year', '−0.4 ft'], ['Beach left', '~30 ft']], p: 'Still has some dry beach, but it\'s slowly losing ground. On the past trend the high-tide beach meets the back line around 2087, or around 2063 if erosion speeds up. State transect 2708.' },
    { n: 5, x: 62, y: 24, c: 'erode', t: 'Side beach, north corner', tag: 'Pinch point', stats: [['Dry beach', '~35 ft'], ['1995', '~50 ft']], p: 'A narrow strip with houses and walls close behind it, swept by tidal currents in the channel. A sand fence fits only at the very back, and only if winter high tides stay off it. Check it after storms. Photo line S1.' },
  ];
  const box = $('#spots'), panel = $('#spotPanel');
  spots.forEach((s) => {
    const b = document.createElement('button');
    b.className = `spot ${s.c}`; b.style.left = s.x + '%'; b.style.top = s.y + '%'; b.textContent = s.n;
    b.setAttribute('aria-label', `${s.n}: ${s.t}`);
    b.addEventListener('click', () => {
      box.querySelectorAll('.spot').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      panel.innerHTML = `<span class="tag ${s.c}">${s.tag}</span><h3>${s.n}. ${s.t}</h3>
        <div class="stat">${s.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><p>${s.p}</p>`;
    });
    box.appendChild(b);
  });
  const base = $('#photoBase'), clip = $('#clip'), rng = $('#cmpRange'), photo = $('#photo'), cmpBtn = $('#cmpBtn');
  document.querySelectorAll('.yr[data-y]').forEach((b) => b.addEventListener('click', () => {
    setCompare(false);
    document.querySelectorAll('.yr[data-y]').forEach((x) => x.classList.remove('active')); b.classList.add('active');
    base.src = `img/hb_${b.dataset.y}.webp`; base.alt = `Aerial photo of Hamilton Beach, Wareham, in ${b.dataset.y}`;
  }));
  function setCompare(on) {
    cmpBtn.setAttribute('aria-pressed', on); clip.hidden = !on; rng.hidden = !on; $('#cmpLabels').hidden = !on;
    photo.style.setProperty('--cutd', on ? 'block' : 'none');
    box.style.display = on ? 'none' : '';
    if (on) { base.src = 'img/hb_2025.webp'; document.querySelectorAll('.yr[data-y]').forEach((x) => x.classList.toggle('active', x.dataset.y === '2025')); upd(); }
  }
  const upd = () => { clip.style.clipPath = `inset(0 ${100 - rng.value}% 0 0)`; photo.style.setProperty('--cut', rng.value + '%'); };
  rng.addEventListener('input', upd);
  cmpBtn.addEventListener('click', () => setCompare(cmpBtn.getAttribute('aria-pressed') !== 'true'));


  /* ---------------- Historic photos ---------------- */
  const OLD = {
    u: { src: 'img/old_undated_crop.webp', full: 'img/old_undated_full.webp', w: 660, h: 540, alt: 'Black and white aerial print of Hamilton Beach and Onset Bay from 1938, showing little or no beach along the south front', cap: '1938 aerial print (frame number ending in 145). It\'s a phone photo of a print, so detail is limited. 1938 is the year of the great September hurricane.', h3: '1938: almost no beach', li: ['Along the south front there\'s little or no dry beach. The water comes right up to the edge of the land in front of the houses.', 'The east point is short and rounded. There\'s no long sandy tip.', 'The side beach along Reynolds Avenue is barely a strip.', 'Compare it with 1971: by then a wide beach had built up along the whole front. A beach can be lost and rebuilt, but only if sand keeps arriving.'] },
    71: { src: 'img/old_1971_crop.webp', full: 'img/old_1971_full.webp', w: 1100, h: 813, alt: 'Historic black and white aerial photo of Hamilton Beach dated April 28, 1971', cap: 'April 28, 1971 (frame 15544 3656). It\'s a spring photo, when beaches are often still narrow after winter, yet the sand is wide.', h3: '1971: sand all along the front', li: ['A wide, bright beach runs the whole length of the south front, including the central stretch where water now reaches the walls at high tide.', 'The point has a short, rounded corner. Compare it with the long tip in 2025.', 'The side beach is a narrow strip. Today its south end is the widest dry beach on Hamilton Beach.', 'Together, the photos show sand moving from the south front to the point and side beach. That\'s the "river of sand" from Lesson 1.'] },
    25: { src: 'img/hb_2025_matchcrop.webp', full: 'img/hb_2025.webp', w: 1100, h: 813, alt: 'Color aerial photo of Hamilton Beach in spring 2025, same area as the historic prints', cap: 'Spring 2025, MassGIS aerial photo of roughly the same area.', h3: '2025: the sand has moved east', li: ['The west and central front is narrow. In places, water reaches the walls at high tide.', 'The point now ends in a long sandy tip, with a shoal of sand underwater beyond it.', 'The south end of the side beach has grown wide. The north corner is still narrow.', 'Overall, the sand wasn\'t destroyed. It moved east and north, around the point.'] }
  };
  function showOld(k) {
    const o = OLD[k];
    document.querySelectorAll('.oldbtn').forEach((b) => b.classList.toggle('active', b.dataset.k === k));
    const img = $('#oldImg'); img.src = o.src; img.alt = o.alt; img.width = o.w; img.height = o.h;
    $('#oldCap').textContent = o.cap; $('#oldH').textContent = o.h3; $('#oldFull').href = o.full;
    $('#oldList').innerHTML = o.li.map((t) => `<li>${t}</li>`).join('');
  }
  document.querySelectorAll('.oldbtn').forEach((b) => b.addEventListener('click', () => showOld(b.dataset.k)));
  showOld('71');


  /* ---------------- 1971 vs 2025 ---------------- */
  const MK = [['A', 51, 79], ['B', 87.5, 60], ['C', 79, 40], ['D', 74, 11]];
  document.querySelectorAll('.sbs-img, #slideCmp').forEach((el) => MK.forEach(([t, x, y]) => {
    const m = document.createElement('span'); m.className = 'mk'; m.textContent = t; m.style.left = x + '%'; m.style.top = y + '%'; el.appendChild(m);
  }));
  const rings = [...document.querySelectorAll('.sbs .ring')];
  document.querySelectorAll('.sbs-img').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      rings.forEach((g) => { g.style.display = 'block'; g.style.left = x + '%'; g.style.top = y + '%'; });
    });
    el.addEventListener('pointerleave', () => rings.forEach((g) => (g.style.display = 'none')));
  });
  const slideR = $('#slideR'), slideC = $('#slideCmp');
  slideR.addEventListener('input', () => {
    slideC.querySelector('.slide-top').style.clipPath = `inset(0 ${100 - slideR.value}% 0 0)`;
    slideC.querySelector('.slide-bar').style.left = slideR.value + '%';
  });
  document.querySelectorAll('.sbsmode').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.sbsmode').forEach((x) => x.classList.toggle('active', x === b));
    const slide = b.dataset.m === 'slide'; $('#sbs').hidden = slide; slideC.hidden = !slide;
  }));


  const CMP = {
    1938: { img: 'img/cmp_1938_aligned.webp', alt: '1938 aerial photo of Hamilton Beach, aligned to the 2025 view', cap: '<b>1938</b>: little or no dry beach along the south front, and a short, rounded point.',
      keys: ['<b>A. Central south front.</b> Almost no dry beach in 1938. Today there\'s a narrow strip, and water reaches the walls at high tide.', '<b>B. The point.</b> A small rounded corner in 1938. By 2025 it has grown into a long sandy tip.', '<b>C. Side beach, south end.</b> Barely a strip in 1938. Now it\'s the widest dry beach on Hamilton Beach.', '<b>D. Side beach, north corner.</b> Narrow in both years.'] },
    1971: { img: 'img/cmp_1971_aligned.webp', alt: 'April 28, 1971 aerial photo of Hamilton Beach, aligned to the 2025 view', cap: '<b>April 28, 1971</b>: wide sand along the whole south front, and a short, rounded point.',
      keys: ['<b>A. Central south front.</b> In 1971 there was a broad band of dry sand here. By 2025 it\'s mostly gone, and water reaches the walls at high tide.', '<b>B. The point.</b> In 1971 it was a rounded corner. In 2025 it\'s a long sandy tip reaching east, built from the sand lost along the front.', '<b>C. Side beach, south end.</b> A thin strip in 1971. In 2025 it\'s the widest dry beach on Hamilton Beach.', '<b>D. Side beach, north corner.</b> Narrow in both years. Little of the drifting sand reaches this far.'] }
  };
  function setCmpYear(y) {
    const c = CMP[y];
    document.querySelectorAll('.cmpyr').forEach((b) => b.classList.toggle('active', b.dataset.y === String(y)));
    $('#sbsOldImg').src = c.img; $('#sbsOldImg').alt = c.alt; $('#sbsOldCap').innerHTML = c.cap;
    $('#slideOldImg').src = c.img; $('#slideOldImg').alt = c.alt; $('#slideOldLab').textContent = y;
    $('#sbsTitle').textContent = `${y} and 2025, side by side`;
    $('#sbsKeys').innerHTML = c.keys.map((k) => `<li>${k}</li>`).join('');
  }
  document.querySelectorAll('.cmpyr').forEach((b) => b.addEventListener('click', () => setCmpYear(b.dataset.y)));
  setCmpYear(1971);


  /* ---------------- Year-by-year scroll with live sand ---------------- */
  const TL = [
    { y: 1938, h: '1938: almost no beach', p: 'Little or no dry beach along the south front, and the point is a small rounded corner. 1938 was the year of the great September hurricane.' },
    { y: 1971, h: '1971: the beach has rebuilt', p: 'A wide band of sand runs along the whole south front. Sand has been arriving faster than it leaves. The point is still short and rounded.' },
    { y: 1995, h: '1995: the tip starts to grow', p: 'There\'s still a broad beach along the front. The east end is stretching out into a sandy tip as drifting sand piles up there.' },
    { y: 2001, h: '2001: sand on the move', p: 'A wide, bright beach shows along the front in this photo, and the tide was low. Look at the tip and the side beach as they keep collecting sand.' },
    { y: 2009, h: '2009: the front gets narrower', p: 'The west and central front is narrower than in the 1990s. More of the sand now sits at the east end and the tip.' },
    { y: 2014, h: '2014: a long tip', p: 'The central front is a thin strip. The tip reaches farther east, and the south end of the side beach is widening.' },
    { y: 2019, h: '2019: sand gathers at the point', p: 'Only a narrow band of sand is left in front of the central walls. The widest sand is now at the point and the side beach.' },
    { y: 2025, h: '2025: today', p: 'Water reaches the central walls at high tide. The point ends in a long tip with an underwater shoal, and the south end of the side beach is the widest dry beach. The sand moved; it didn\'t disappear.' }
  ];
  const stack = $('#tlStack'), dots = $('#tlDots'), tlScroll = $('#tlScroll');
  const tlImgs = TL.map((t, i) => {
    const im = document.createElement('img');
    im.src = `img/tl_${t.y}.webp`; im.width = 1100; im.height = 813; im.alt = `Hamilton Beach in ${t.y}, aligned aerial photo`; im.decoding = 'async';
    if (i > 1) im.loading = 'lazy';
    stack.appendChild(im);
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = t.y; b.addEventListener('click', () => {
      const r = tlScroll.getBoundingClientRect(), total = tlScroll.offsetHeight - window.innerHeight;
      window.scrollTo({ top: window.scrollY + r.top + (i / (TL.length - 1)) * total + 2, behavior: 'smooth' });
    });
    li.appendChild(b); dots.appendChild(li);
    return im;
  });
  let tlCur = -1;
  function tlUpdate() {
    const r = tlScroll.getBoundingClientRect(), total = tlScroll.offsetHeight - window.innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / total));
    const f = p * (TL.length - 1), i0 = Math.floor(f), fr = f - i0;
    const e = Math.min(1, Math.max(0, (fr - 0.55) / 0.4));
    tlImgs.forEach((im, i) => { im.style.opacity = i === i0 ? 1 : i === i0 + 1 ? e : 0; im.style.zIndex = i === i0 + 1 ? 2 : 1; });
    const show = e > 0.5 ? Math.min(TL.length - 1, i0 + 1) : i0;
    if (show !== tlCur) {
      tlCur = show; const t = TL[show];
      $('#tlYear').textContent = t.y; $('#tlH').textContent = t.h; $('#tlP').textContent = t.p;
      dots.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === show));
    }
    $('#tlFill').style.width = p * 100 + '%';
  }
  window.addEventListener('scroll', tlUpdate, { passive: true });
  window.addEventListener('resize', tlUpdate);
  tlUpdate();

  // live sand particles along the drift path (frame coords 1100x813)
  const tc = $('#tlCanvas'), tx = tc.getContext('2d');
  const PATH = [[150, 800], [240, 760], [320, 708], [420, 655], [520, 600], [620, 560], [720, 545], [850, 528], [980, 516], [1062, 519], [1000, 470], [945, 400], [905, 320], [872, 235], [840, 150], [810, 82]];
  const SH = [[980, 516], [1030, 545], [1085, 575]];
  function mkPath(P) {
    const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, L, len: L[L.length - 1] };
  }
  const MP = mkPath(PATH), SP = mkPath(SH);
  function at(pa, d) {
    const { P, L } = pa; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const t = Math.min(1, Math.max(0, (d - L[i - 1]) / (L[i] - L[i - 1] || 1)));
    const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t;
    const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], n = Math.hypot(dx, dy) || 1;
    return [x, y, -dy / n, dx / n];
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grains = Array.from({ length: reduce ? 60 : 170 }, () => ({ d: Math.random() * MP.len, off: (Math.random() - 0.5) * 26, v: 38 + Math.random() * 40, sh: false, a: 1 }));
  let tlLast = 0, tlVisible = false;
  new IntersectionObserver((en) => { tlVisible = en[0].isIntersecting; }).observe($('#tlPhoto'));
  function tlFit() { const r = tc.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); tc.width = Math.round(r.width * dpr); tc.height = Math.round(r.height * dpr); }
  window.addEventListener('resize', tlFit); tlFit();
  function tlLoop(t) {
    const dt = Math.min(0.05, (t - tlLast) / 1000 || 0.016); tlLast = t;
    if (tlVisible) {
      if (tc.width < 10) tlFit();
      const sx = tc.width / 1100, sy = tc.height / 813;
      tx.clearRect(0, 0, tc.width, tc.height);
      if ($('#tlSand').checked) {
        tx.lineCap = 'round';
        for (const g of grains) {
          const pa = g.sh ? SP : MP;
          const [x0, y0, nx, ny] = at(pa, g.d);
          if (!reduce) g.d += g.v * dt;
          const [x1, y1] = at(pa, g.d);
          const tail = at(pa, Math.max(0, g.d - 22));
          if (!g.sh && g.d > MP.L[8] && g.d < MP.L[8] + g.v * dt * 1.5 && Math.random() < 0.3) { g.sh = true; g.d = 0; }
          if (g.d >= pa.len) { g.sh = false; g.d = Math.random() * 40; g.off = (Math.random() - 0.5) * 26; }
          const fade = g.sh ? Math.max(0, 1 - g.d / SP.len) : Math.min(1, g.d / 60, (MP.len - g.d) / 60);
          tx.strokeStyle = `rgba(255,209,102,${0.9 * fade})`; tx.lineWidth = 3.2 * sx;
          tx.beginPath();
          tx.moveTo((tail[0] + nx * g.off) * sx, (tail[1] + ny * g.off) * sy);
          tx.lineTo((x1 + nx * g.off) * sx, (y1 + ny * g.off) * sy); tx.stroke();
        }
      }
    }
    requestAnimationFrame(tlLoop);
  }
  requestAnimationFrame(tlLoop);


})();
