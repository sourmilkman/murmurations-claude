/* Murmurations — app shell: loop, input, backgrounds, UI, PWA */
(function () {
  const U = M.util;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#c'), ctx = canvas.getContext('2d');
  const veil = $('#veil');
  $('#ver').textContent = 'v' + M.VERSION; $('#ver2').textContent = 'v' + M.VERSION;

  /* ---------- settings ---------- */
  const KEY = 'murmurations.settings';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const set = Object.assign({ scene: 'starlings', bg: {}, density: 1, speed: 1, mode: 'scatter', vol: 0.7, muted: false }, saved);
  if (!M.scenes[set.scene]) set.scene = 'starlings';
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) {} };

  /* ---------- environment shared with scenes ---------- */
  const input = { x: -1e4, y: -1e4, px: null, py: null, vx: 0, vy: 0, down: false, active: false, type: 'mouse', lastMove: -10, lastAny: -1e9, inside: false, downAt: 0, downX: 0, downY: 0, moved: 0 };
  const env = (M.env = {
    W: 0, H: 0, dpr: 1, unit: 1, mobile: false, t: 0, quality: 1, qMax: 1,
    density: set.density, speed: set.speed, mode: set.mode, input,
    cover: { s: 1, ox: 0, oy: 0, iw: 1672, ih: 941 },
    map(u, v) { const c = this.cover; return [c.ox + u * c.iw * c.s, c.oy + v * c.ih * c.s]; },
  });

  let scene = null, sceneMeta = null, ready = false, switching = false, resized = false;
  const imgs = [$('#bgA'), $('#bgB')];
  let active = 0;

  function coverFor(img, meta) {
    const iw = img.naturalWidth || 1672, ih = img.naturalHeight || 941;
    const s = Math.max(env.W / iw, env.H / ih);
    const f = (meta && meta.focus) || [0.5, 0.5];
    const ox = U.clamp(env.W / 2 - f[0] * iw * s, env.W - iw * s, 0);
    const oy = U.clamp(env.H / 2 - f[1] * ih * s, env.H - ih * s, 0);
    return { s, ox, oy, iw, ih };
  }
  function layoutImg(img, meta) {
    const c = coverFor(img, meta);
    img.style.width = c.iw * c.s + 'px'; img.style.height = c.ih * c.s + 'px';
    img.style.transform = 'translate(' + c.ox + 'px,' + c.oy + 'px)';
    return c;
  }
  function loadImg(img, src) {
    return new Promise((res) => {
      if (img.getAttribute('src') === src && img.complete && img.naturalWidth) return res();
      img.onload = () => res(); img.onerror = () => res();
      img.src = src;
    });
  }
  async function showBg(meta) {
    const next = 1 - active, img = imgs[next];
    await loadImg(img, meta.src);
    if (img.decode) { try { await img.decode(); } catch (e) {} }
    env.cover = layoutImg(img, meta);
    img.classList.add('on'); imgs[active].classList.remove('on');
    active = next;
  }

  function resize() {
    env.W = window.innerWidth; env.H = window.innerHeight;
    env.dpr = Math.min(window.devicePixelRatio || 1, 2);
    env.unit = Math.max(env.W, env.H) / 1600;
    env.mobile = Math.min(env.W, env.H) < 700 || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
    canvas.width = Math.round(env.W * env.dpr); canvas.height = Math.round(env.H * env.dpr);
    if (env.mobile && env.quality === 1 && !resized) env.quality = 0.6; // phones start conservative and work up
    resized = true;
    if (sceneMeta) env.cover = layoutImg(imgs[active], sceneMeta);
    if (scene && ready && scene.resize) scene.resize(env);
  }
  window.addEventListener('resize', resize);

  /* ---------- scenes ---------- */
  async function setScene(id, bgIndex) {
    if (switching) return;
    switching = true;
    const S = M.scenes[id];
    const idx = bgIndex != null ? bgIndex : (set.bg[id] || 0) % S.bgs.length;
    veil.classList.remove('off');
    await wait(scene ? 700 : 0);
    ready = false;
    if (scene && scene.exit) scene.exit(env);
    scene = S; sceneMeta = S.bgs[idx];
    set.scene = id; set.bg[id] = idx; persist();
    await showBg(sceneMeta);
    await wait(30);
    env.quality = env.mobile ? 0.6 : 0.85;
    S.init(env, sceneMeta);
    ready = true;
    M.audio.setScene(id, sceneMeta);
    refreshUI();
    requestAnimationFrame(() => veil.classList.add('off'));
    switching = false;
  }
  async function nextBg() {
    if (!scene || switching) return;
    const idx = ((set.bg[scene.id] || 0) + 1) % scene.bgs.length;
    await setBg(idx);
  }
  async function setBg(idx) {
    if (!scene || switching) return;
    set.bg[scene.id] = idx; persist();
    sceneMeta = scene.bgs[idx];
    await showBg(sceneMeta);
    if (scene.setBg) scene.setBg(env, sceneMeta);
    M.audio.setScene(scene.id, sceneMeta);
    refreshUI();
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- input ---------- */
  const onUI = (e) => e.target && e.target.closest && e.target.closest('.ui');
  function setPos(e) { input.x = e.clientX; input.y = e.clientY; }
  window.addEventListener('pointerdown', (e) => {
    if (onUI(e)) return;
    begin();
    input.type = e.pointerType; input.down = true; setPos(e); input.px = null;
    input.downAt = env.t; input.downX = e.clientX; input.downY = e.clientY; input.moved = 0; input.lastAny = env.t;
    if (scene && ready && scene.onPointerDown) scene.onPointerDown(env);
  });
  window.addEventListener('pointermove', (e) => {
    if (input.down || !onUI(e)) {
      input.type = e.pointerType; setPos(e); input.lastMove = env.t; input.lastAny = env.t; input.inside = true;
      if (input.down) input.moved = Math.max(input.moved, Math.hypot(e.clientX - input.downX, e.clientY - input.downY));
      if (e.pointerType === 'mouse' && (e.clientY > env.H - 110 || e.clientY < 90)) showUI();
    }
  });
  const up = (e) => {
    if (!input.down) return;
    input.down = false;
    if (env.t - input.downAt < 0.28 && input.moved < 10) toggleUI();
    if (e.pointerType !== 'mouse') { input.x = -1e4; input.y = -1e4; }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  document.addEventListener('pointerleave', () => { input.inside = false; });
  document.addEventListener('mouseleave', () => { input.inside = false; });

  function updateInput(dt) {
    if (input.px == null) { input.px = input.x; input.py = input.y; input.vx = 0; input.vy = 0; }
    const ivx = (input.x - input.px) / Math.max(dt, 1e-3), ivy = (input.y - input.py) / Math.max(dt, 1e-3);
    const k = 0.35;
    input.vx = U.clamp(input.vx + (ivx - input.vx) * k, -4000, 4000);
    input.vy = U.clamp(input.vy + (ivy - input.vy) * k, -4000, 4000);
    input.px = input.x; input.py = input.y;
    input.active = input.down || (input.type === 'mouse' && input.inside && env.t - input.lastMove < 1.2);
  }

  /* ---------- loop + adaptive quality ---------- */
  let last = performance.now(), fN = 0, fT = 0, audioT = 0, errors = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.016;
    dt = Math.min(dt, 1 / 24);
    env.t += dt;
    updateInput(dt);
    if (scene && ready) {
      try {
        scene.update(dt * env.speed, env);
        ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, env.W, env.H);
        scene.draw(ctx, env);
        errors = 0;
      } catch (err) {
        // never let one bad frame kill the app: back off quality and carry on
        console.error(err);
        env.quality = Math.max(0.25, env.quality * 0.7);
        if (++errors > 30) { ready = false; toast('Something went wrong — reloading scene'); setTimeout(() => setScene(scene.id), 300); errors = 0; }
      }
      audioT += dt;
      if (audioT > 0.12 && scene.audioState) { audioT = 0; M.audio.update(scene.audioState(env)); }
    }
    // adaptive quality: react quickly to slow frames, recover slowly
    fN++; fT += dt;
    if (fT > 1.2) {
      const fps = fN / fT; fN = 0; fT = 0;
      if (fps < 40) env.quality = Math.max(0.25, env.quality * 0.72);
      else if (fps < 52) env.quality = Math.max(0.25, env.quality * 0.88);
      else if (fps > 58 && env.quality < env.qMax) env.quality = Math.min(env.qMax, env.quality * 1.04);
    }
  }

  /* ---------- UI ---------- */
  const nav = $('#scenes');
  M.sceneOrder.forEach((id, i) => {
    const b = document.createElement('button');
    b.textContent = M.scenes[id].name; b.dataset.id = id; b.title = M.scenes[id].name + ' (' + (i + 1) + ')';
    b.onclick = () => { if (!scene || scene.id !== id) setScene(id); };
    nav.appendChild(b);
  });
  let hideT = 0;
  function showUI() {
    document.body.classList.remove('ui-off');
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!$('#panel').classList.contains('open')) document.body.classList.add('ui-off'); }, 4500);
  }
  function hideUI() { clearTimeout(hideT); $('#panel').classList.remove('open'); document.body.classList.add('ui-off'); }
  function toggleUI() { if (document.body.classList.contains('ui-off')) showUI(); else hideUI(); }
  document.querySelectorAll('.ui').forEach((el) => el.addEventListener('pointermove', showUI));

  function refreshUI() {
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', scene && b.dataset.id === scene.id));
    const bl = $('#bglist'); bl.innerHTML = '';
    if (scene) scene.bgs.forEach((m, i) => {
      const b = document.createElement('button'); b.textContent = m.label;
      b.classList.toggle('on', m === sceneMeta); b.onclick = () => setBg(i); bl.appendChild(b);
    });
    $('#mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === set.mode));
    $('#bSound').classList.toggle('off', set.muted);
    $('#dv').textContent = Math.round(set.density * 100) + '%';
    $('#sv').textContent = Math.round(set.speed * 100) + '%';
    $('#vv').textContent = Math.round(set.vol * 100) + '%';
  }
  $('#density').value = set.density; $('#speed').value = set.speed; $('#vol').value = set.vol;
  $('#density').oninput = (e) => { set.density = env.density = +e.target.value; persist(); refreshUI(); };
  $('#speed').oninput = (e) => { set.speed = env.speed = +e.target.value; persist(); refreshUI(); };
  $('#vol').oninput = (e) => { set.vol = +e.target.value; M.audio.setVolume(set.vol); persist(); refreshUI(); };
  $('#mode').querySelectorAll('button').forEach((b) => (b.onclick = () => { set.mode = env.mode = b.dataset.m; persist(); refreshUI(); }));
  $('#bSet').onclick = () => { $('#panel').classList.toggle('open'); showUI(); };
  $('#bBg').onclick = () => { begin(); nextBg(); };
  $('#bSound').onclick = () => { begin(); toggleMute(); };
  $('#bFull').onclick = toggleFull;
  $('#bShot').onclick = capture;

  function toggleMute() { set.muted = !set.muted; M.audio.setMuted(set.muted); persist(); refreshUI(); toast(set.muted ? 'Sound off' : 'Sound on'); }
  function toggleFull() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); }
    else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    begin();
    const k = e.key.toLowerCase();
    const n = parseInt(k, 10);
    if (n >= 1 && n <= M.sceneOrder.length) setScene(M.sceneOrder[n - 1]);
    else if (k === 'b') nextBg();
    else if (k === 'm') toggleMute();
    else if (k === 'f') toggleFull();
    else if (k === 'h') toggleUI();
    else if (k === 's') capture();
    else if (k === 'escape') hideUI();
  });

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function capture() {
    try {
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      const g = c.getContext('2d'), cv = env.cover, d = env.dpr;
      g.drawImage(imgs[active], cv.ox * d, cv.oy * d, cv.iw * cv.s * d, cv.ih * cv.s * d);
      g.drawImage(canvas, 0, 0);
      c.toBlob((b) => {
        if (!b) return toast('Could not save still');
        const a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = 'murmurations-' + (scene ? scene.id : 'still') + '-' + Date.now() + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Still saved');
      }, 'image/png');
    } catch (e) { toast('Saving stills needs the app served over https'); }
  }

  /* ---------- start / audio unlock ---------- */
  let begun = false;
  function begin() {
    M.audio.start();
    if (begun) return;
    begun = true;
    M.audio.setVolume(set.vol); M.audio.setMuted(set.muted);
    $('#intro').classList.add('gone');
    showUI();
    lockScreen();
  }
  $('#intro').addEventListener('pointerdown', (e) => { e.stopPropagation(); begin(); });

  // keep the screen awake while watching
  let wl = null;
  async function lockScreen() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { if (begun) { M.audio.resume(); lockScreen(); } last = performance.now(); }
    else M.audio.suspend();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  resize();
  refreshUI();
  setScene(set.scene);
  requestAnimationFrame(frame);
})();
