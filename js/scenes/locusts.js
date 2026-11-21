/* Desert-locust swarm — a dense, rolling mass carried on the wind.
   Individuals: erratic flight in a turbulent curl field, own wandering speed, surge when turning.
   Wind shear (faster aloft) + soft containment = the swarm "rolls" like real hopper/adult swarms. */
(function () {
  const U = M.util;
  const S = {
    id: 'locusts', name: 'Locusts',
    bgs: [
      { src: 'assets/bg/locusts-savanna.jpg', label: 'Savanna dusk', focus: [0.62, 0.5], horizon: 0.76, body: [50, 34, 17], haze: [214, 150, 86], wing: [240, 212, 160] },
      { src: 'assets/bg/locusts-desert.jpg', label: 'Desert hills', focus: [0.55, 0.5], horizon: 0.76, body: [56, 34, 17], haze: [222, 152, 98], wing: [245, 205, 155] },
    ],
  };
  const CAP = 30000, F = 600, ZMIN = -40, ZMAX = 1500;
  const A = {};
  ['x', 'y', 'z', 'vx', 'vy', 'vz', 'tx', 'ty', 'tz', 'ph', 'sx', 'sy', 's', 'ag', 'pref', 'prefT', 'hx', 'hy', 'turn'].forEach((k) => (A[k] = new Float32Array(CAP)));
  let n = 0, bg, t = 0, hy = 0, frame = 0, meanAg = 0;
  const cam = { cx: 0, cy: 0 };
  const C = { x: 0, y: 0, z: 700, rx: 600, ry: 200, rz: 520 };
  const tmp = [0, 0];
  let paths = [];

  function want(env) { return Math.round((env.mobile ? 9000 : 21000) * env.density * env.quality); }
  function spawn(i) {
    const a = Math.random() * 6.283, r = Math.cbrt(Math.random());
    A.x[i] = C.x + Math.cos(a) * r * C.rx * 0.9; A.y[i] = C.y + Math.sin(a) * r * C.ry * 0.9; A.z[i] = C.z + U.gauss() * C.rz * 0.4;
    A.vx[i] = 60; A.vy[i] = 0; A.vz[i] = 0; A.ph[i] = Math.random() * 6.28; A.ag[i] = 0;
    A.pref[i] = A.prefT[i] = U.rand(0.75, 1.25); A.hx[i] = 1; A.hy[i] = 0; A.turn[i] = 0; A.s[i] = 0;
  }
  function updateCentre(env) {
    const sc = F / (F + C.z);
    const Vw = env.W / 2 / env.unit / sc;
    const bandTop = env.H * 0.2, bandBot = hy - (hy - env.H * 0.2) * 0.08;
    C.x = Vw * 0.18 * Math.sin(t * 0.017) + Vw * 0.06 * Math.sin(t * 0.05 + 1);
    C.y = (((bandTop + bandBot) / 2 - cam.cy) / (env.unit * sc)) + 20 * Math.sin(t * 0.04);
    C.rx = Vw * (0.62 + 0.12 * Math.sin(t * 0.031));
    C.ry = ((bandBot - bandTop) / 2 / (env.unit * sc)) * (0.85 + 0.15 * Math.sin(t * 0.047 + 2));
    C.rz = 520;
  }
  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 100; S.resize(env); updateCentre(env);
    n = Math.min(want(env), CAP);
    for (let i = 0; i < n; i++) spawn(i);
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); };
  S.resize = function (env) { hy = env.map(0.5, bg.horizon)[1]; cam.cx = env.W / 2; cam.cy = env.H * 0.45; };

  S.update = function (dt, env) {
    t += dt; frame++;
    updateCentre(env);
    const w = Math.min(want(env), CAP);
    if (w > n) { for (let i = n; i < w; i++) spawn(i); }
    n = w;
    const inp = env.input, u = env.unit;
    const R = 60 * Math.max(u, 0.75), attract = env.mode === 'attract', RR = attract ? R * 1.6 : R, R2 = RR * RR;
    const gust = 1 + 0.4 * M.noise.noise3(t * 0.07, 3.1, 0);
    const wind = 42 * gust;
    let agSum = 0;
    const { x, y, z, vx, vy, vz, tx, ty, tz, ph, sx, sy, s: sc, ag, pref, prefT, hx, hy: hy2, turn } = A;
    for (let i = 0; i < n; i++) {
      // turbulent eddies (staggered sampling)
      if ((i + frame) % 3 === 0) {
        M.noise.curl2(x[i] * 0.004 + t * 0.02, y[i] * 0.004, z[i] * 0.0025 + t * 0.06, tmp);
        tx[i] = tmp[0] * 75; ty[i] = tmp[1] * 55;
        tz[i] = M.noise.noise3(x[i] * 0.003, y[i] * 0.003 + 40, t * 0.05 + z[i] * 0.002) * 60;
      }
      // wind shear: faster aloft, slower near the ground -> rolling mass
      const ry = (y[i] - C.y) / C.ry;
      let gx = tx[i] + wind * (1 - 0.55 * ry), gy = ty[i], gz = tz[i];
      // soft swarm envelope
      const ex = (x[i] - C.x) / C.rx, ey = ry, ez = (z[i] - C.z) / C.rz, ed = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (ed > 0.85) { const k = (ed - 0.85) * 160; gx -= (ex / ed) * k; gy -= (ey / ed) * k * 1.4; gz -= (ez / ed) * k; }
      // individual speed: wanders, surges on direction change
      if (Math.random() < dt * 0.5) prefT[i] = U.rand(0.6, 1.45);
      pref[i] += (prefT[i] - pref[i]) * Math.min(1, dt * 1.2);
      const pf = pref[i] * (1 + Math.min(1, turn[i] * 0.4) * 0.6);
      const jit = 34 + ag[i] * 120;
      let ax = (gx * pf - vx[i]) * 1.7 + (Math.random() - 0.5) * jit;
      let ay = (gy * pf - vy[i]) * 1.7 + (Math.random() - 0.5) * jit;
      let az = (gz * pf - vz[i]) * 1.3 + (Math.random() - 0.5) * jit;
      const s = sc[i] || 0.5, qx = sx[i], qy = sy[i];
      if (inp.active && s) {
        const dx = qx - inp.x, dy = qy - inp.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 1e-3, k = 1 - d / RR;
          if (attract) { ax += ((-dx / d) * 220 + (-dy / d) * 320) * k / (s * u); ay += ((-dy / d) * 220 + (dx / d) * 320) * k / (s * u); }
          else { const st = 1900 * k / (s * u); ax += (dx / d) * st; ay += (dy / d) * st; if (k > ag[i]) ag[i] = Math.min(1, k * 1.5); }
        }
      }
      // startle spreads to near neighbours in screen space (cheap: decays + agitation jitter)
      ag[i] *= Math.exp(-dt * 0.8); agSum += ag[i];
      vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
      if (z[i] < ZMIN) { z[i] = ZMIN; vz[i] = Math.abs(vz[i]); } else if (z[i] > ZMAX) { z[i] = ZMAX; vz[i] = -Math.abs(vz[i]); }
      const hl = Math.hypot(vx[i], vy[i]) + 1e-6, nhx = vx[i] / hl, nhy = vy[i] / hl;
      turn[i] = turn[i] * 0.9 + Math.min(6, Math.abs(hx[i] * nhy - hy2[i] * nhx) / Math.max(dt, 1e-3)) * 0.1;
      hx[i] = nhx; hy2[i] = nhy;
      ph[i] += dt * (24 + ag[i] * 12);
      const ns = F / (F + z[i]);
      sc[i] = ns; sx[i] = cam.cx + x[i] * ns * u; sy[i] = cam.cy + y[i] * ns * u;
    }
    meanAg = n ? agSum / n : 0;
  };

  S.draw = function (ctx, env) {
    for (let b = 0; b < 4; b++) paths[b] = new Path2D();
    const wingP = new Path2D();
    const { sx, sy, s: sc, vx, vy, ph } = A, u = env.unit, W = env.W, H = env.H;
    for (let i = 0; i < n; i++) {
      const x = sx[i], y = sy[i], s = sc[i];
      if (!s || x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      const b = s < 0.45 ? 0 : s < 0.62 ? 1 : s < 0.85 ? 2 : 3;
      const svx = vx[i] * s * u, svy = vy[i] * s * u, sl = Math.hypot(svx, svy) + 1e-6;
      const hx = svx / sl, hy2 = svy / sl;
      const body = 3.6 * s * u, blur = Math.min(sl * 0.022, 10 * u);
      const p = paths[b];
      p.moveTo(x + hx * body * 0.5, y + hy2 * body * 0.5);
      p.lineTo(x - hx * (body * 0.5 + blur), y - hy2 * (body * 0.5 + blur));
      if (b === 3) {
        const flap = Math.abs(Math.sin(ph[i]));
        const rx = 3.4 * s * u * (0.5 + 0.5 * flap), ry = 1.2 * s * u, rot = Math.atan2(hy2, hx) + Math.PI / 2;
        wingP.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
        wingP.ellipse(x, y, rx, ry, rot, 0, 6.2832);
      }
    }
    ctx.lineCap = 'round';
    const widths = [0.7, 0.9, 1.15, 1.4], haze = [0.6, 0.42, 0.24, 0.1], alpha = [0.42, 0.58, 0.74, 0.86];
    for (let b = 0; b < 4; b++) {
      ctx.strokeStyle = U.rgba(U.mix(bg.body, bg.haze, haze[b]), alpha[b]);
      ctx.lineWidth = Math.max(0.55, widths[b] * u);
      ctx.stroke(paths[b]);
    }
    ctx.fillStyle = U.rgba(bg.wing, 0.13); ctx.fill(wingP);
  };

  S.audioState = function () { return { ag: U.clamp(meanAg * 12, 0, 1) }; };
  M.scenes.locusts = S;
})();
