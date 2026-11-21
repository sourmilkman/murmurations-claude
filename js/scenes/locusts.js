/* Desert-locust swarm — wind-borne rolling stream; erratic individuals in a turbulent curl field; deep perspective */
(function () {
  const U = M.util;
  const S = {
    id: 'locusts', name: 'Locusts',
    bgs: [
      { src: 'assets/bg/locusts-savanna.jpg', label: 'Savanna dusk', focus: [0.62, 0.5], horizon: 0.76, body: [52, 36, 18], haze: [214, 150, 86], wing: [240, 212, 160] },
      { src: 'assets/bg/locusts-desert.jpg', label: 'Desert hills', focus: [0.55, 0.5], horizon: 0.76, body: [58, 36, 18], haze: [222, 152, 98], wing: [245, 205, 155] },
    ],
  };
  const CAP = 9000, F = 600, ZMIN = -430, ZMAX = 1700;
  const A = {};
  ['x', 'y', 'z', 'vx', 'vy', 'vz', 'tx', 'ty', 'tz', 'ph', 'sx', 'sy', 's', 'ag'].forEach((k) => (A[k] = new Float32Array(CAP)));
  let n = 0, bg, t = 0, hy = 0, frame = 0, meanAg = 0;
  const cam = { cx: 0, cy: 0 };
  const tmp = [0, 0];
  let paths = [];

  function want(env) { return Math.round((env.mobile ? 2800 : 5200) * env.density * env.quality); }
  function spawn(i, env, sxOverride) {
    const z = ZMIN + (ZMAX - ZMIN) * Math.pow(Math.random(), 0.75);
    const s = F / (F + z);
    const sx = sxOverride != null ? sxOverride : U.rand(-40, env.W + 40);
    const near = s > 1.1;
    const sy = near ? U.rand(env.H * 0.02, env.H * 0.98) : U.rand(env.H * 0.06, hy + (env.H - hy) * 0.1);
    A.x[i] = (sx - cam.cx) / (s * env.unit); A.y[i] = (sy - cam.cy) / (s * env.unit); A.z[i] = z;
    A.vx[i] = 55; A.vy[i] = 0; A.vz[i] = 0; A.ph[i] = Math.random() * 6.28; A.ag[i] = 0;
  }
  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 100; S.resize(env);
    n = want(env);
    for (let i = 0; i < n; i++) spawn(i, env);
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); };
  S.resize = function (env) { hy = env.map(0.5, bg.horizon)[1]; cam.cx = env.W / 2; cam.cy = env.H * 0.45; };

  S.update = function (dt, env) {
    t += dt; frame++;
    const w = want(env);
    if (w > n) { for (let i = n; i < Math.min(w, CAP); i++) spawn(i, env); n = Math.min(w, CAP); } else n = w;
    const inp = env.input, u = env.unit, W = env.W, H = env.H;
    const R = 170 * Math.max(u, 0.75), R2 = R * R, attract = env.mode === 'attract';
    const gust = 1 + 0.35 * M.noise.noise3(t * 0.08, 3.1, 0);
    const wind = 58 * gust;
    let agSum = 0;
    const { x, y, z, vx, vy, vz, tx, ty, tz, ph, sx, sy, s: sc, ag } = A;
    const yLoFar = H * 0.05, yHiFar = hy + (H - hy) * 0.12;
    for (let i = 0; i < n; i++) {
      // turbulent eddies (staggered: half the swarm samples per frame)
      if ((i + frame) & 1) {
        M.noise.curl2(x[i] * 0.0032 + t * 0.015, y[i] * 0.0032, z[i] * 0.0021 + t * 0.05, tmp);
        tx[i] = wind + tmp[0] * 85; ty[i] = tmp[1] * 55;
        tz[i] = M.noise.noise3(x[i] * 0.003, y[i] * 0.003 + 40, t * 0.05 + z[i] * 0.002) * 70;
      }
      // individual erratic flight
      const jit = 30 + ag[i] * 140;
      let ax = (tx[i] - vx[i]) * 1.6 + (Math.random() - 0.5) * jit;
      let ay = (ty[i] - vy[i]) * 1.6 + (Math.random() - 0.5) * jit;
      let az = (tz[i] - vz[i]) * 1.2 + (Math.random() - 0.5) * jit;
      const s = sc[i] || 1, qx = sx[i], qy = sy[i];
      // band (near insects may fill the frame; far ones stay above the horizon)
      const lo = s > 1.1 ? H * 0.0 : yLoFar, hi = s > 1.1 ? H : yHiFar;
      if (qy < lo) ay += ((lo - qy) / (s * u)) * 3; else if (qy > hi) ay -= ((qy - hi) / (s * u)) * 3;
      if (z[i] < ZMIN) az += (ZMIN - z[i]) * 3; else if (z[i] > ZMAX) az -= (z[i] - ZMAX) * 3;
      // hand: startle burst (scatter) or vortex (attract)
      if (inp.active) {
        const dx = qx - inp.x, dy = qy - inp.y, d2 = dx * dx + dy * dy;
        if (d2 < R2 * (attract ? 4 : 1)) {
          const d = Math.sqrt(d2) + 1e-3, k = 1 - d / (R * (attract ? 2 : 1));
          if (attract) { ax += ((-dx / d) * 160 + (-dy / d) * 260) * k / (s * u); ay += ((-dy / d) * 160 + (dx / d) * 260) * k / (s * u); }
          else { const st = 1400 * k / (s * u); ax += (dx / d) * st + inp.vx * k * 0.8 / (s * u); ay += (dy / d) * st + inp.vy * k * 0.8 / (s * u); if (k > ag[i]) ag[i] = k; }
        }
      }
      ag[i] *= Math.exp(-dt * 0.9); agSum += ag[i];
      vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
      ph[i] += dt * (24 + ag[i] * 12);
      const ns = F / (F + z[i]);
      sc[i] = ns; sx[i] = cam.cx + x[i] * ns * u; sy[i] = cam.cy + y[i] * ns * u;
      if (sx[i] > W + 70) { spawn(i, env, -60); sc[i] = 0; }
      else if (sx[i] < -90) { spawn(i, env, W + 60); sc[i] = 0; }
    }
    meanAg = n ? agSum / n : 0;
  };

  S.draw = function (ctx, env) {
    for (let b = 0; b < 7; b++) paths[b] = new Path2D();
    const wingP = new Path2D();
    const { sx, sy, s: sc, vx, vy, ph } = A, u = env.unit, W = env.W, H = env.H;
    for (let i = 0; i < n; i++) {
      const x = sx[i], y = sy[i], s = sc[i];
      if (!s || x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const b = s < 0.42 ? 0 : s < 0.62 ? 1 : s < 0.9 ? 2 : s < 1.4 ? 3 : s < 2.3 ? 4 : 5;
      const svx = vx[i] * s * u, svy = vy[i] * s * u, sl = Math.hypot(svx, svy) + 1e-6;
      const hx = svx / sl, hy2 = svy / sl;
      const body = 3.8 * s * u, blur = Math.min(sl * 0.03, 40 * u);
      const p = paths[b];
      p.moveTo(x + hx * body * 0.5, y + hy2 * body * 0.5);
      p.lineTo(x - hx * (body * 0.5 + blur), y - hy2 * (body * 0.5 + blur));
      if (b >= 3) {
        const flap = Math.abs(Math.sin(ph[i]));
        const rx = 4.2 * s * u * (0.55 + 0.45 * flap), ry = 1.7 * s * u, rot = Math.atan2(hy2, hx) + Math.PI / 2;
        const cx = x + hx * body * 0.05, cy = y + hy2 * body * 0.05;
        wingP.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
        wingP.ellipse(cx, cy, rx, ry, rot, 0, 6.2832);
      }
    }
    ctx.lineCap = 'round';
    const widths = [0.75, 0.95, 1.2, 1.55, 2.4, 3.6];
    const haze = [0.62, 0.45, 0.28, 0.12, 0.04, 0];
    const alpha = [0.45, 0.62, 0.78, 0.9, 0.9, 0.55];
    for (let b = 0; b < 6; b++) {
      const col = U.mix(bg.body, bg.haze, haze[b]);
      if (b === 5) { // out-of-focus foreground: soft halo + core
        ctx.strokeStyle = U.rgba(col, 0.18); ctx.lineWidth = widths[b] * u * 2.6; ctx.stroke(paths[b]);
      }
      ctx.strokeStyle = U.rgba(col, alpha[b]);
      ctx.lineWidth = Math.max(0.6, widths[b] * u);
      ctx.stroke(paths[b]);
      if (b === 3) { ctx.fillStyle = U.rgba(bg.wing, 0.16); ctx.fill(wingP); }
    }
  };

  S.audioState = function () { return { ag: U.clamp(meanAg * 6, 0, 1) }; };
  M.scenes.locusts = S;
})();
