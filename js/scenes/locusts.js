/* Desert-locust swarm — a dense, rolling mass carried on the wind.
   Individuals: erratic flight in a turbulent curl field, own wandering speed, surge when turning.
   Left alone, the swarm settles onto the ground; after a while birds sweep in low and flush it,
   the take-off rippling outward from the disturbance. Drawn as cluster impostors (K per agent). */
(function () {
  const U = M.util;
  const S = {
    id: 'locusts', name: 'Locusts',
    bgs: [
      { src: 'assets/bg/locusts-savanna.jpg', label: 'Savanna dusk', focus: [0.62, 0.5], horizon: 0.76, body: [50, 34, 17], haze: [214, 150, 86], wing: [240, 212, 160], ground: [44, 32, 18] },
      { src: 'assets/bg/locusts-desert.jpg', label: 'Desert hills', focus: [0.55, 0.5], horizon: 0.76, body: [56, 34, 17], haze: [222, 152, 98], wing: [245, 205, 155], ground: [52, 34, 20] },
    ],
  };
  const CAP = 12000, F = 600, ZMIN = -40, ZMAX = 1500;
  const K = 4, CLL = 9, POOL = M.clusterPool(K, 0.6, 31);
  const A = {};
  ['x', 'y', 'z', 'vx', 'vy', 'vz', 'tx', 'ty', 'tz', 'ph', 'sx', 'sy', 's', 'ag', 'pref', 'prefT', 'hx', 'hy', 'turn', 'ld', 'tk'].forEach((k) => (A[k] = new Float32Array(CAP)));
  const ST = new Uint8Array(CAP); // 0 flying, 1 descending, 2 on the ground, 3 hopping
  let n = 0, bg, t = 0, hy = 0, YG = 400, frame = 0, meanAg = 0, flying = 1;
  let phase = 'fly', phaseT = 0, birdWait = 25, birds = [], flushed = false;
  const cam = { cx: 0, cy: 0 };
  const C = { x: 0, y: 0, z: 700, rx: 600, ry: 200, rz: 520 };
  const tmp = [0, 0];
  let paths = [];

  function want(env) { return Math.round((env.mobile ? 3000 : 7000) * env.density * env.quality); }
  function spawn(i) {
    const a = Math.random() * 6.283, r = Math.cbrt(Math.random());
    A.x[i] = C.x + Math.cos(a) * r * C.rx * 0.9; A.y[i] = C.y + Math.sin(a) * r * C.ry * 0.9; A.z[i] = C.z + U.gauss() * C.rz * 0.4;
    A.vx[i] = 60; A.vy[i] = 0; A.vz[i] = 0; A.ph[i] = Math.random() * 6.28; A.ag[i] = 0;
    A.pref[i] = A.prefT[i] = U.rand(0.75, 1.25); A.hx[i] = 1; A.hy[i] = 0; A.turn[i] = 0; A.s[i] = 0;
    ST[i] = 0; A.ld[i] = 0; A.tk[i] = 0;
  }
  function updateCentre(env) {
    const sc = F / (F + C.z);
    const Vw = env.W / 2 / env.unit / sc;
    const bandTop = env.H * 0.18, bandBot = hy - (hy - env.H * 0.18) * 0.1;
    C.x = Vw * 0.18 * Math.sin(t * 0.017) + Vw * 0.06 * Math.sin(t * 0.05 + 1);
    C.y = ((bandTop + bandBot) / 2 - cam.cy) / (env.unit * sc) + 20 * Math.sin(t * 0.04);
    C.rx = Vw * (0.62 + 0.12 * Math.sin(t * 0.031));
    C.ry = ((bandBot - bandTop) / 2 / (env.unit * sc)) * (0.85 + 0.15 * Math.sin(t * 0.047 + 2));
    C.rz = 520;
  }
  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 100; S.resize(env); updateCentre(env);
    n = Math.min(want(env), CAP);
    for (let i = 0; i < n; i++) spawn(i);
    phase = 'fly'; phaseT = 0; birds = []; flushed = false;
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); };
  S.resize = function (env) {
    hy = env.map(0.5, bg.horizon)[1]; cam.cx = env.W / 2; cam.cy = hy;
    YG = (env.H - hy) * 0.96 / ((F / (F + ZMIN)) * env.unit); // ground plane: near edge at the bottom of the screen
  };

  // a disturbance at screen point (fx, fy): grounded locusts take off in a wave spreading outward
  function flush(fx, fy) {
    for (let i = 0; i < n; i++) {
      if (ST[i] !== 2 && ST[i] !== 3) continue;
      const d = Math.hypot(A.sx[i] - fx, A.sy[i] - fy);
      const at = t + d / 420 + Math.random() * 0.5;
      if (!A.tk[i] || at < A.tk[i]) A.tk[i] = at;
    }
    flushed = true;
  }
  S.onPointerDown = function (env) { if (phase === 'ground' || phase === 'land') { flush(env.input.x, env.input.y); phase = 'fly'; phaseT = 0; } };

  S.update = function (dt, env) {
    t += dt; frame++; phaseT += dt;
    updateCentre(env);
    const w = Math.min(want(env), CAP);
    if (w > n) { for (let i = n; i < w; i++) spawn(i); }
    n = w;
    const inp = env.input, u = env.unit;
    const idle = env.t - inp.lastAny;
    // --- swarm life-cycle ---
    if (phase === 'fly' && idle > 25 && phaseT > 20) {
      phase = 'land'; phaseT = 0; flushed = false;
      for (let i = 0; i < n; i++) { A.ld[i] = U.rand(0, 9); A.tk[i] = 0; }
    } else if (phase === 'land' && flying < 0.04) {
      phase = 'ground'; phaseT = 0; birdWait = U.rand(18, 32);
    } else if (phase === 'ground' && phaseT > birdWait && !birds.length) {
      const L = Math.random() < 0.5, nb = U.randInt(3, 6);
      for (let b = 0; b < nb; b++) {
        birds.push({
          x: L ? -60 - b * U.rand(30, 70) : env.W + 60 + b * U.rand(30, 70),
          y: hy + (env.H - hy) * U.rand(0.25, 0.7), vx: (L ? 1 : -1) * U.rand(230, 300) * Math.max(u, 0.7),
          vy: 0, ph: Math.random() * 6, sz: U.rand(13, 19) * Math.max(u, 0.7), dip: Math.random() * 6,
        });
      }
    }
    if (inp.active && inp.down && (phase === 'ground' || phase === 'land')) { flush(inp.x, inp.y); phase = 'fly'; phaseT = 0; }
    for (let b = birds.length - 1; b >= 0; b--) {
      const B = birds[b];
      B.ph += dt * 9; B.dip += dt * 1.3;
      B.x += B.vx * dt; B.y += Math.sin(B.dip) * 30 * dt;
      // birds snap at what they flush
      if (B.x > 0 && B.x < env.W && frame % 6 === 0) { flush(B.x, B.y); if (phase !== 'fly') { phase = 'fly'; phaseT = 0; } }
      if (B.x < -300 || B.x > env.W + 300) birds.splice(b, 1);
    }

    const R = 60 * Math.max(u, 0.75), attract = env.mode === 'attract', RR = attract ? R * 1.6 : R, R2 = RR * RR;
    const gust = 1 + 0.4 * M.noise.noise3(t * 0.07, 3.1, 0);
    const wind = 42 * gust;
    let agSum = 0, nFly = 0;
    const { x, y, z, vx, vy, vz, tx, ty, tz, ph, sx, sy, s: sc, ag, pref, prefT, hx, hy: hy2, turn, ld, tk } = A;
    for (let i = 0; i < n; i++) {
      let st = ST[i];
      // scheduled take-off
      if ((st === 2 || st === 3) && tk[i] && t >= tk[i]) {
        st = ST[i] = 0; tk[i] = 0; ag[i] = 1;
        vy[i] = -U.rand(60, 130); vx[i] = U.rand(-30, 60); vz[i] = U.rand(-30, 30);
      }
      if (st === 0 && phase === 'land' && phaseT > ld[i]) st = ST[i] = 1;
      else if (st === 1 && phase === 'fly') st = ST[i] = 0;
      if (st === 2) {
        // on the ground: occasional short hop
        if (Math.random() < dt * 0.03) { st = ST[i] = 3; vy[i] = -U.rand(25, 45); vx[i] = U.rand(-15, 15); vz[i] = U.rand(-10, 10); }
        else { ph[i] += dt * 0.5; project(i, u); continue; }
      }
      if (st === 3) {
        vy[i] += 140 * dt; x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
        if (y[i] >= YG) { y[i] = YG; vx[i] = vy[i] = vz[i] = 0; ST[i] = 2; }
        project(i, u); continue;
      }
      nFly++;
      // turbulent eddies (staggered sampling)
      if ((i + frame) % 3 === 0) {
        M.noise.curl2(x[i] * 0.004 + t * 0.02, y[i] * 0.004, z[i] * 0.0025 + t * 0.06, tmp);
        tx[i] = tmp[0] * 75; ty[i] = tmp[1] * 55;
        tz[i] = M.noise.noise3(x[i] * 0.003, y[i] * 0.003 + 40, t * 0.05 + z[i] * 0.002) * 60;
      }
      let gx, gy, gz;
      if (st === 1) {
        // settling: slow, fluttering descent toward the ground
        gx = tx[i] * 0.5 + wind * 0.25; gy = 55 + ty[i] * 0.4; gz = tz[i] * 0.5;
      } else {
        const ry = (y[i] - C.y) / C.ry;
        gx = tx[i] + wind * (1 - 0.55 * ry); gy = ty[i]; gz = tz[i];
        const ex = (x[i] - C.x) / C.rx, ez = (z[i] - C.z) / C.rz, ed = Math.sqrt(ex * ex + ry * ry + ez * ez);
        if (ed > 0.85) { const k = (ed - 0.85) * 160; gx -= (ex / ed) * k; gy -= (ry / ed) * k * 1.4; gz -= (ez / ed) * k; }
      }
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
          else { const stg = 1900 * k / (s * u); ax += (dx / d) * stg; ay += (dy / d) * stg; if (k > ag[i]) ag[i] = Math.min(1, k * 1.5); }
        }
      }
      ag[i] *= Math.exp(-dt * 0.8); agSum += ag[i];
      vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
      if (z[i] < ZMIN) { z[i] = ZMIN; vz[i] = Math.abs(vz[i]); } else if (z[i] > ZMAX) { z[i] = ZMAX; vz[i] = -Math.abs(vz[i]); }
      if (st === 1 && y[i] >= YG) { y[i] = YG; vx[i] = vy[i] = vz[i] = 0; ST[i] = 2; }
      else if (y[i] > YG) { y[i] = YG; vy[i] = -Math.abs(vy[i]); }
      const hl = Math.hypot(vx[i], vy[i]) + 1e-6, nhx = vx[i] / hl, nhy = vy[i] / hl;
      turn[i] = turn[i] * 0.9 + Math.min(6, Math.abs(hx[i] * nhy - hy2[i] * nhx) / Math.max(dt, 1e-3)) * 0.1;
      hx[i] = nhx; hy2[i] = nhy;
      ph[i] += dt * (24 + ag[i] * 12);
      project(i, u);
    }
    flying = n ? nFly / n : 0;
    meanAg = n ? agSum / n : 0;
  };
  function project(i, u) {
    const ns = F / (F + A.z[i]);
    A.s[i] = ns; A.sx[i] = cam.cx + A.x[i] * ns * u; A.sy[i] = cam.cy + A.y[i] * ns * u;
  }

  S.draw = function (ctx, env) {
    M.pathBufs(paths, 6);
    const wingP = paths[5];
    const { sx, sy, s: sc, vx, vy, ph } = A, u = env.unit, W = env.W, H = env.H;
    for (let i = 0; i < n; i++) {
      const x0 = sx[i], y0 = sy[i], s = sc[i];
      if (!s || x0 < -20 || x0 > W + 20 || y0 < -20 || y0 > H + 20) continue;
      const cs = CLL * s * u, base = ((i * 2654435761) >>> 26) * K * 4;
      if (ST[i] === 2) {
        // resting on the ground: short dark marks scattered in the grass
        const p = paths[4], len = 1.6 * s * u;
        for (let k = 0; k < K; k++) {
          const o = base + k * 4, gx = x0 + POOL[o] * cs, gy = y0 + POOL[o + 2] * cs * 0.18;
          p.moveTo(gx - len, gy); p.lineTo(gx + len, gy);
        }
        continue;
      }
      const b = s < 0.45 ? 0 : s < 0.62 ? 1 : s < 0.85 ? 2 : 3;
      const svx = vx[i] * s * u, svy = vy[i] * s * u, sl = Math.hypot(svx, svy) + 1e-6;
      const hx = svx / sl, hy2 = svy / sl;
      const body = 3.6 * s * u, blur = Math.min(sl * 0.022, 10 * u);
      const p = paths[b];
      for (let k = 0; k < K; k++) {
        const o = base + k * 4, w = Math.sin(t * 3 + POOL[o + 3]) * 0.25;
        const x = x0 + (POOL[o] + w) * cs, y = y0 + (POOL[o + 1] - w) * cs;
        p.moveTo(x + hx * body * 0.5, y + hy2 * body * 0.5);
        p.lineTo(x - hx * (body * 0.5 + blur), y - hy2 * (body * 0.5 + blur));
        if (b === 3) {
          const flap = Math.abs(Math.sin(ph[i] + POOL[o + 3]));
          const rx = 3.4 * s * u * (0.5 + 0.5 * flap), ry = 1.2 * s * u, rot = Math.atan2(hy2, hx) + Math.PI / 2;
          // blurred wing disc as a 4-point lozenge (cheap, no arc tessellation)
          const c = Math.cos(rot), sn = Math.sin(rot);
          wingP.moveTo(x + rx * c, y + rx * sn); wingP.lineTo(x - ry * sn, y + ry * c);
          wingP.lineTo(x - rx * c, y - rx * sn); wingP.lineTo(x + ry * sn, y - ry * c); wingP.closePath();
        }
      }
    }
    ctx.lineCap = 'round';
    const widths = [0.7, 0.9, 1.15, 1.4], haze = [0.6, 0.42, 0.24, 0.1], alpha = [0.42, 0.58, 0.74, 0.86];
    ctx.strokeStyle = U.rgba(bg.ground, 0.75); ctx.lineWidth = Math.max(0.6, 1.1 * u); paths[4].stroke(ctx);
    for (let b = 0; b < 4; b++) {
      ctx.strokeStyle = U.rgba(U.mix(bg.body, bg.haze, haze[b]), alpha[b]);
      ctx.lineWidth = Math.max(0.55, widths[b] * u);
      paths[b].stroke(ctx);
    }
    ctx.fillStyle = U.rgba(bg.wing, 0.13); wingP.fill(ctx);
    // birds sweeping in to feed
    for (const B of birds) {
      const s = B.sz, f = Math.sin(B.ph);
      ctx.save(); ctx.translate(B.x, B.y); ctx.scale(Math.sign(B.vx), 1);
      ctx.fillStyle = 'rgba(28,22,18,0.92)';
      ctx.beginPath();
      ctx.moveTo(s * 0.75, -s * 0.05); ctx.lineTo(s * 0.35, -s * 0.12);
      ctx.lineTo(-s * 0.05, -s * (0.15 + 0.75 * Math.max(0, f))); ctx.lineTo(-s * 0.25, -s * 0.1);
      ctx.lineTo(-s * 0.85, -s * 0.18); ctx.lineTo(-s * 0.7, s * 0.04); ctx.lineTo(-s * 0.25, s * 0.08);
      ctx.lineTo(-s * 0.05, s * (0.12 + 0.6 * Math.max(0, -f))); ctx.lineTo(s * 0.35, s * 0.08);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  S.audioState = function () { return { ag: U.clamp(meanAg * 12, 0, 1), fly: flying }; };
  M.scenes.locusts = S;
})();
