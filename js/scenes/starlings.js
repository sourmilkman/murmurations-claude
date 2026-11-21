/* Starling murmuration — 3D boids, neighbour cap ~7–9, fear contagion → density waves */
(function () {
  const U = M.util;
  const S = {
    id: 'starlings', name: 'Starlings',
    bgs: [
      { src: 'assets/bg/starlings-marsh-sunset.jpg', label: 'Marsh sunset', focus: [0.5, 0.45], horizon: 0.6, ink: [18, 10, 22], haze: [150, 92, 118] },
      { src: 'assets/bg/starlings-lake-dusk.jpg', label: 'Lake at dusk', focus: [0.5, 0.45], horizon: 0.53, ink: [22, 22, 34], haze: [138, 138, 178] },
    ],
  };
  let fl = null, bg, t = 0, hy = 0;
  const cam = { cx: 0, cy: 0, F: 1000 };
  const T = { x: 0, y: 0, z: 150, rx: 300, ry: 90, rz: 180 };
  const falcon = { on: false, x: 0, y: 0, vx: 0, vy: 0, wait: 9, ph: 0 };
  let paths = [], cen = [0, 0];

  function want(env) { return Math.round((env.mobile ? 6500 : 13600) * env.density * env.quality); }

  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 100;
    if (!fl) fl = M.Flock(22000);
    fl.n = 0;
    S.resize(env);
    updateTarget(env, 0);
    const n = want(env);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.cbrt(Math.random()) * 170;
      fl.add(T.x + Math.cos(a) * r * 1.8, T.y + Math.sin(a) * r * 0.6, T.z + U.gauss() * 60, 140 + U.gauss() * 10, U.gauss() * 8, U.gauss() * 10);
    }
    falcon.on = false; falcon.wait = 8;
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); };
  S.resize = function (env) {
    hy = env.map(0.5, bg.horizon)[1];
    cam.cx = env.W / 2;
    cam.cy = Math.max(env.H * 0.14, hy * 0.46);
  };
  function updateTarget(env, dt) {
    const Vw = env.W / 2 / env.unit, sky = (hy - cam.cy) / env.unit;
    T.x = Vw * 0.42 * Math.sin(t * 0.027) + Vw * 0.14 * Math.sin(t * 0.071 + 1.3);
    T.y = sky * 0.18 * Math.sin(t * 0.041 + 0.4) - sky * 0.05;
    T.z = 160 + 130 * Math.sin(t * 0.021);
    T.rx = (230 + Vw * 0.3) * (1 + 0.45 * Math.sin(t * 0.093));
    T.ry = Math.max(80, sky * 0.42) * (1 + 0.45 * Math.sin(t * 0.077 + 2));
    T.rz = 240 * (1 + 0.35 * Math.sin(t * 0.05 + 1));
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
    if (env.t - inp.lastAny > 12) {
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
      if (falcon.x < -120 || falcon.x > env.W + 120 || falcon.y > env.H + 80 || falcon.y < -200) { falcon.on = false; falcon.wait = U.rand(10, 18); }
    }
    fl.step(dt, {
      r: 30, sep: 9, wSep: 950, wAli: 2.4, wCoh: 1.3, accel: 1.4, fearAli: 1.6, vmin: 95, vmax: 165, maxN: 8,
      contain: 95, fearDecay: 0.962, fearSpread: 0.93, fearBoost: 0.6, vdamp: 0.55, flap: 12,
      target: T, predators: preds, unit: env.unit, boundK: 7,
      yMin: env.H * 0.03, yMax: hy - 18 * env.unit, xMin: -80, xMax: env.W + 80, zMin: -320, zMax: 820,
    });
    fl.project(cam.cx, cam.cy, cam.F, env.unit);
    cen = fl.centroid();
  };

  S.draw = function (ctx, env) {
    for (let b = 0; b < 8; b++) paths[b] = new Path2D();
    const { sx, sy, sc, vx, vy, vz, turn, phase } = fl;
    const span = 4.2 * env.unit, W = env.W, H = env.H;
    for (let i = 0; i < fl.n; i++) {
      const x = sx[i], y = sy[i];
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      const s = sc[i];
      const hl = Math.hypot(vx[i], vy[i]) + 1e-6, hx = vx[i] / hl, hy2 = vy[i] / hl;
      const side = hl / (Math.hypot(hl, vz[i]) + 1e-6);
      const tr = Math.min(1, turn[i] * 1.4);
      const sp = span * s * (0.8 + 0.45 * tr), half = sp * 0.5;
      const ph = Math.sin(phase[i]);
      const flapY = -ph * sp * 0.3, sweep = sp * (0.12 + 0.12 * side);
      const wx = -hy2 * half, wy = hx * half, bx = -hx * sweep, by = -hy2 * sweep;
      const d = U.clamp(((s - 0.55) / 0.9) * 4, 0, 3.99) | 0;
      const p = paths[d * 2 + (tr > 0.35 ? 1 : 0)];
      p.moveTo(x + wx + bx, y + wy + by + flapY);
      p.lineTo(x, y);
      p.lineTo(x - wx + bx, y - wy + by + flapY);
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let d = 0; d < 4; d++) {
      const far = 1 - d / 3;
      const col = U.mix(bg.ink, bg.haze, far * 0.5);
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = U.rgba(col, (0.5 + 0.45 * (d / 3)) * (k ? 1 : 0.9));
        ctx.lineWidth = Math.max(0.65, env.unit * (0.75 + d * 0.28) * (k ? 1.35 : 1));
        ctx.stroke(paths[d * 2 + k]);
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

  S.audioState = function (env) {
    return { ag: U.clamp(fl.meanFear * 2.2 + fl.meanTurn * 0.25, 0, 1) };
  };
  M.scenes.starlings = S;
})();
