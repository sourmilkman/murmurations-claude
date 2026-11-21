/* Starling murmuration — after Ballerini et al. 2008 (topological 7-neighbour interaction) and
   Hemelrijk & Hildenbrandt's StarDisplay (roost attraction, banked turns, border cohesion).
   Thin 3D sheet seen from below at an angle -> density swings from veils to near-black folds. */
(function () {
  const U = M.util;
  const S = {
    id: 'starlings', name: 'Starlings',
    bgs: [
      { src: 'assets/bg/starlings-marsh-sunset.jpg', label: 'Marsh sunset', focus: [0.5, 0.45], horizon: 0.6, mirror: 0.615, ink: [18, 10, 22], haze: [150, 92, 118] },
      { src: 'assets/bg/starlings-lake-dusk.jpg', label: 'Lake at dusk', focus: [0.5, 0.45], horizon: 0.53, mirror: 0.625, ink: [22, 22, 34], haze: [138, 138, 178] },
    ],
  };
  let fl = null, bg, t = 0, hy = 0;
  const cam = { cx: 0, cy: 0, F: 1000, pitch: 0.5 };
  const ZOOM = 2.3; // world-to-screen magnification: flock spans a good part of the sky while birds stay specks
  const T = { x: 0, y: 0, z: 200 };
  const G = { x: 0, y: 0, z: 200, R: 160, acc: 55 }, WP = { x: 0, y: 0, z: 200, next: 0 };
  const falcon = { on: false, x: 0, y: 0, vx: 0, vy: 0, wait: 9, ph: 0 };
  let paths = [], cen = [0, 0];
  // ---- reflections: water is found automatically (pixels below the horizon whose colour matches the mirrored sky) ----
  const masks = {}; let rbuf = null, rctx = null, rpaths = [];
  function buildMask(meta) {
    if (masks[meta.src] !== undefined) return;
    masks[meta.src] = null;
    if (!location.protocol.startsWith('http')) return; // file:// images can't be read back
    const img = new Image();
    img.onload = () => {
      try {
        const w = 420, h = Math.round(420 * img.naturalHeight / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
        const D = g.getImageData(0, 0, w, h).data;
        const hz = Math.round((meta.mirror || meta.horizon) * h);
        const m = new Float32Array(w * h);
        for (let y = hz + 1; y < h; y++) {
          const my = 2 * hz - y; if (my < 0) break;
          for (let x = 0; x < w; x++) {
            const a = (y * w + x) * 4, b = (my * w + x) * 4;
            const l1 = D[a] + D[a + 1] + D[a + 2] + 1, l2 = D[b] + D[b + 1] + D[b + 2] + 1;
            // chromaticity distance + luminance ratio: still water mirrors the sky's hue, a little darker
            const dc = Math.abs(D[a] / l1 - D[b] / l2) + Math.abs(D[a + 1] / l1 - D[b + 1] / l2) + Math.abs(D[a + 2] / l1 - D[b + 2] / l2);
            const lr = l1 / l2;
            // fade in just below the line so misty shorelines that match the sky aren't mistaken for water
            m[y * w + x] = (1 - U.smooth(0.04, 0.12, dc)) * U.smooth(0.3, 0.55, lr) * (1 - U.smooth(1.25, 1.6, lr)) * U.smooth(0, h * 0.045, y - hz);
          }
        }
        // soften the mask (3x3 box blur, twice)
        for (let pass = 0; pass < 2; pass++) {
          const o = new Float32Array(m.length);
          for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += m[(y + dy) * w + x + dx];
            o[y * w + x] = s / 9;
          }
          m.set(o);
        }
        const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
        const mg = mc.getContext('2d'), id = mg.createImageData(w, h);
        for (let i = 0; i < m.length; i++) { id.data[i * 4 + 3] = Math.min(255, m[i] * 300); }
        mg.putImageData(id, 0, 0);
        masks[meta.src] = mc;
      } catch (e) { masks[meta.src] = null; }
    };
    img.src = meta.src;
  }

  // each simulated bird is drawn as K followers (cluster impostors) -> ~48k visible birds on desktop
  const K = 7, CL = 7.2, POOL = M.clusterPool(K, 0.45, 11);
  function want(env) { return Math.round((env.mobile ? 3000 : 6800) * env.density * env.quality); }

  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 100;
    if (!fl) fl = M.Flock(22000);
    fl.n = 0;
    S.resize(env);
    WP.next = 0; updateTarget(env, 0); G.x = WP.x; G.y = WP.y; G.z = WP.z;
    const n = want(env);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.cbrt(Math.random()) * 150;
      fl.add(G.x + Math.cos(a) * r * 1.4, G.y + U.gauss() * 25, G.z + Math.sin(a) * r, 130 + U.gauss() * 10, U.gauss() * 6, U.gauss() * 10);
    }
    falcon.on = false; falcon.wait = U.rand(40, 70);
    buildMask(meta);
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); buildMask(meta); };
  S.resize = function (env) {
    hy = env.map(0.5, bg.horizon)[1];
    cam.cx = env.W / 2;
    cam.cy = Math.max(env.H * 0.14, hy * 0.46);
  };
  // the flock is drawn toward a wandering roost point; when it changes, the whole flock banks, folds and pours after it
  function updateTarget(env, dt) {
    WP.next -= dt;
    if (WP.next <= 0) {
      WP.next = U.rand(6, 13);
      const z = U.rand(0, 260), ca = Math.cos(cam.pitch), sa = Math.sin(cam.pitch);
      const s = cam.F / (cam.F + z * ca), u = env.unit * ZOOM;
      const sxT = env.W * U.rand(0.32, 0.68), syT = Math.random() < 0.22 ? hy - (hy - env.H * 0.3) * U.rand(0.08, 0.2) : U.lerp(env.H * 0.3, hy - (hy - env.H * 0.3) * 0.35, Math.random());
      const yc = (syT - cam.cy) / (s * u);
      WP.x = (sxT - cam.cx) / (s * u); WP.y = (yc - z * sa) / ca; WP.z = z;
    }
    // if the flock drifts toward a screen edge, nudge its goal back toward the middle (collective, so no visible wall)
    const mx = env.W * 0.18, myT = env.H * 0.2;
    if (cen[0] < mx || cen[0] > env.W - mx) WP.x *= 1 - Math.min(1, dt * 0.6);
    if (cen[1] < myT) WP.y += 60 * dt;
    const k = Math.min(1, dt * 0.2);
    G.x += (WP.x - G.x) * k; G.y += (WP.y - G.y) * k; G.z += (WP.z - G.z) * k;
    G.R = 150 + 50 * Math.sin(t * 0.07);
    T.x = G.x; T.y = G.y; T.z = G.z;
  }

  S.update = function (dt, env) {
    t += dt;
    updateTarget(env, dt);
    const n = want(env);
    if (Math.abs(fl.n - n) > 40) fl.grow(n, 6);
    const inp = env.input, preds = [];
    const R = 55 * Math.max(env.unit, 0.75);
    if (inp.active) preds.push({ x: inp.x, y: inp.y, z: T.z, r: env.mode === 'attract' ? R * 1.6 : R, str: env.mode === 'attract' ? -320 : 1500 });
    // a peregrine stoops when nobody is playing
    if (env.t - inp.lastAny > 30) {
      falcon.wait -= dt;
      if (!falcon.on && falcon.wait <= 0) {
        const fromLeft = Math.random() < 0.5;
        falcon.on = true;
        falcon.x = fromLeft ? -60 : env.W + 60;
        falcon.y = cen[1] - U.rand(80, 200) * env.unit;
        const dx = cen[0] - falcon.x, dy = cen[1] + U.rand(-30, 30) * env.unit - falcon.y, dl = Math.hypot(dx, dy);
        const sp = 420 * Math.max(env.unit, 0.7);
        falcon.vx = (dx / dl) * sp; falcon.vy = (dy / dl) * sp;
      }
    }
    if (falcon.on) {
      falcon.x += falcon.vx * dt; falcon.y += falcon.vy * dt; falcon.vy += 30 * dt; falcon.ph += dt * 7;
      preds.push({ x: falcon.x, y: falcon.y, z: T.z, r: 70 * Math.max(env.unit, 0.75), str: 1500 });
      if (falcon.x < -120 || falcon.x > env.W + 120 || falcon.y > env.H + 80 || falcon.y < -200) { falcon.on = false; falcon.wait = U.rand(45, 90); }
    }
    fl.step(dt, {
      r: 24, exam: 100, sep: 9, wSep: 200, sepSoft: true, wAli: 3.2, wCoh: 0, border: 0, gcoh: 0.05, gali: 0.4, spring: { d0: 15, k: 340 }, flat: 0.26, noise: 3, accel: 0.9, fearAli: 1.6, vmin: 70, vmax: 104, maxN: 7,
      blind: -0.5, turb: { amp: 21, scale: 0.0035, t: t * 0.09 }, maxAcc: 170, prefVar: 0.07, prefRate: 0.4, turnResp: 0.25,
      flockSteer: { x: G.x, y: G.y, z: G.z, w: 0.6, rate: 0.6, span: 120, lead: 2.5 },
      fearDecay: 0.962, fearSpread: 0.93, fearBoost: 0.6, vdamp: 0.2, flap: 12,
      target: null, goal: null, predators: preds, unit: env.unit * ZOOM, boundK: 3,
      // no visible walls: per-bird limits sit well off-screen; the flock is kept in view by its collective steering instead
      yMin: -env.H * 0.3, yMax: hy - 2 * env.unit, xMin: -env.W * 0.3, xMax: env.W * 1.3, zMin: -300, zMax: 900,
    });
    fl.project(cam.cx, cam.cy, cam.F, env.unit * ZOOM, cam.pitch);
    cen = fl.centroid();
  };

  S.draw = function (ctx, env) {
    M.pathBufs(paths, 8);
    const { sx, sy, sc, vx, vy, vz, turn, phase } = fl;
    const span = 2.5 * env.unit, W = env.W, H = env.H, zu = env.unit * ZOOM;
    const ca = Math.cos(cam.pitch), sa = Math.sin(cam.pitch);
    for (let i = 0; i < fl.n; i++) {
      const x0 = sx[i], y0 = sy[i];
      if (x0 < -30 || x0 > W + 30 || y0 < -30 || y0 > H + 30) continue;
      const s = sc[i];
      const hl = Math.hypot(vx[i], vy[i]) + 1e-6, hx = vx[i] / hl, hy2 = vy[i] / hl;
      const tr = Math.min(1, turn[i] * 1.4);
      // banking: wings tilt toward the viewer in turns -> longer, darker dashes sweep through the flock
      const bank = 0.7 + 0.55 * tr;
      const d = U.clamp(((s - 0.5) / 0.85) * 4, 0, 3.99) | 0;
      const p = paths[d * 2 + (tr > 0.35 ? 1 : 0)];
      const wx = -hy2, wy = hx, cs = CL * s * zu;
      const base = ((i * 2654435761) >>> 26) * K * 4;
      for (let k = 0; k < K; k++) {
        const o = base + k * 4;
        const x = x0 + POOL[o] * cs, y = y0 + (POOL[o + 1] * ca + POOL[o + 2] * sa) * cs;
        // a starling at distance reads as a short wing-dash, flickering with the wingbeat
        const half = span * s * bank * (0.45 + 0.55 * Math.abs(Math.sin(phase[i] + POOL[o + 3]))) * 0.5;
        p.moveTo(x + wx * half - hx * half * 0.25, y + wy * half - hy2 * half * 0.25);
        p.lineTo(x - wx * half - hx * half * 0.25, y - wy * half - hy2 * half * 0.25);
      }
    }
    drawReflection(ctx, env);
    ctx.lineCap = 'round';
    for (let d = 0; d < 4; d++) {
      const far = 1 - d / 3;
      const col = U.mix(bg.ink, bg.haze, far * 0.45);
      for (let k = 0; k < 2; k++) {
        // partial opacity: overlapping birds build up density, so folds read darker (volumetric look)
        ctx.strokeStyle = U.rgba(col, (0.5 + 0.3 * (d / 3)) * (k ? 1.15 : 1));
        ctx.lineWidth = Math.max(0.7, env.unit * (0.85 + d * 0.15) * (k ? 1.25 : 1));
        paths[d * 2 + k].stroke(ctx);
      }
    }
    if (falcon.on) {
      const s = 14 * Math.max(env.unit, 0.7), a = Math.atan2(falcon.vy, falcon.vx), f = Math.sin(falcon.ph) * 0.25;
      ctx.save(); ctx.translate(falcon.x, falcon.y); ctx.rotate(a);
      ctx.fillStyle = U.rgba(bg.ink, 0.92);
      ctx.beginPath();
      ctx.moveTo(s * 0.7, 0); ctx.lineTo(-s * 0.1, -s * (0.75 + f)); ctx.lineTo(-s * 0.25, -s * 0.12);
      ctx.lineTo(-s * 0.8, -s * 0.08); ctx.lineTo(-s * 0.8, s * 0.08); ctx.lineTo(-s * 0.25, s * 0.12);
      ctx.lineTo(-s * 0.1, s * (0.75 + f)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  S.debug = function () {
    const n = fl.n; let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += fl.px[i]; cy += fl.py[i]; cz += fl.pz[i]; }
    cx /= n; cy /= n; cz /= n; let rx = 0, ry = 0, rz = 0, nn = 0, sp = 0;
    for (let i = 0; i < n; i++) { rx += Math.abs(fl.px[i] - cx); ry += Math.abs(fl.py[i] - cy); rz += Math.abs(fl.pz[i] - cz); sp += Math.hypot(fl.vx[i], fl.vy[i], fl.vz[i]); }
    for (let i = 0; i < 400; i++) { const a = (Math.random() * n) | 0; let best = 1e9; for (let j = 0; j < n; j++) { if (j === a) continue; const d = (fl.px[j] - fl.px[a]) ** 2 + (fl.py[j] - fl.py[a]) ** 2 + (fl.pz[j] - fl.pz[a]) ** 2; if (d < best) best = d; } nn += Math.sqrt(best); }
    return { n, mad: [rx / n, ry / n, rz / n].map(Math.round), nn: +(nn / 400).toFixed(1), speed: Math.round(sp / n) };
  };
  // mirror low birds about the horizon into the water, rippled and softened, clipped by the water mask
  function drawReflection(ctx, env) {
    const mask = masks[bg.src];
    if (!mask) return;
    const W = env.W, H = env.H, q = 0.5;
    const bw = Math.round(W * q), bh = Math.round(H * q);
    if (!rbuf) { rbuf = document.createElement('canvas'); rctx = rbuf.getContext('2d'); }
    if (rbuf.width !== bw || rbuf.height !== bh) { rbuf.width = bw; rbuf.height = bh; }
    const g = rctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, bw, bh);
    M.pathBufs(rpaths, 3);
    const { sx, sy, sc, vx, vy, turn, phase } = fl;
    const wl = env.map(0.5, bg.mirror || bg.horizon)[1]; // eye-level line the reflection mirrors about
    const skyH = wl - H * 0.05, near = skyH * 0.6, span = 2.5 * env.unit, zu = env.unit * ZOOM;
    const ca = Math.cos(cam.pitch), sa = Math.sin(cam.pitch);
    let any = 0;
    for (let i = 0; i < fl.n; i++) {
      const h = wl - sy[i];
      if (h < 0 || h > near) continue;
      const ry = wl + h * 0.92;            // reflection sits as far below the waterline as the bird is above it
      if (ry > H + 10) continue;
      const lvl = 1 - h / near;            // the lower the bird, the stronger its reflection
      const b = lvl > 0.66 ? 2 : lvl > 0.33 ? 1 : 0;
      const s = sc[i], hl = Math.hypot(vx[i], vy[i]) + 1e-6, hx = vx[i] / hl, hy2 = -vy[i] / hl;
      const ripple = Math.sin(ry * 0.09 + t * 2.2) * 2.2 * env.unit;
      const cs = CL * s * zu, base = ((i * 2654435761) >>> 26) * K * 4, p = rpaths[b];
      for (let k = 0; k < K; k += 2) {     // every other follower is plenty for a soft reflection
        const o = base + k * 4;
        const x = (sx[i] + POOL[o] * cs + ripple) * q, y = (ry - (POOL[o + 1] * ca + POOL[o + 2] * sa) * cs * 0.9) * q;
        const half = span * s * (0.6 + 0.4 * Math.abs(Math.sin(phase[i] + POOL[o + 3]))) * 0.5 * q;
        p.moveTo(x - hy2 * half, y + hx * half * 0.6); p.lineTo(x + hy2 * half, y - hx * half * 0.6);
      }
      any++;
    }
    if (!any) return;
    g.lineCap = 'round';
    const col = U.mix(bg.ink, bg.haze, 0.35);
    for (let b = 0; b < 3; b++) {
      g.strokeStyle = U.rgba(col, 0.3 + b * 0.25);
      g.lineWidth = Math.max(0.8, env.unit * 1.6 * q * 2);
      rpaths[b].stroke(g);
    }
    // keep only what falls on water
    const cv = env.cover;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, cv.ox * q, cv.oy * q, cv.iw * cv.s * q, cv.ih * cv.s * q);
    g.globalCompositeOperation = 'source-over';
    // vertical smear = the soft, slightly broken look of reflections on rippled water
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.drawImage(rbuf, 0, 0, W, H);
    ctx.globalAlpha = 0.35; ctx.drawImage(rbuf, 0, 2 * env.unit, W, H);
    ctx.restore();
  }
  S.testLow = function (env) { // test helper: send the flock low over the water
    const z = 120, ca = Math.cos(cam.pitch), sa = Math.sin(cam.pitch), s = cam.F / (cam.F + z * ca), u = env.unit * ZOOM;
    const yc = (hy - (hy - env.H * 0.3) * 0.12 - cam.cy) / (s * u);
    WP.x = (env.W * 0.5 - cam.cx) / (s * u); WP.y = (yc - z * sa) / ca; WP.z = z; WP.next = 999;
  };
  S.maskCanvas = function () { return masks[bg.src]; };
  S.extent = function () { // test helper: on-screen fraction and centroid
    let on = 0; for (let i = 0; i < fl.n; i++) if (fl.sx[i] >= 0 && fl.sx[i] <= M.env.W && fl.sy[i] >= 0 && fl.sy[i] <= M.env.H) on++;
    return [+(on / fl.n).toFixed(2), Math.round(cen[0]), Math.round(cen[1])];
  };
  S.audioState = function (env) {
    return { ag: U.clamp(fl.meanFear * 2.2 + fl.meanTurn * 0.25, 0, 1) };
  };
  M.scenes.starlings = S;
})();
