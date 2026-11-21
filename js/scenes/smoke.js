/* Smouldering leaf pile — buoyant plumes from vents, curl-noise turbulence that grows with height, wind shear, embers */
(function () {
  const U = M.util;
  const VENTS = [[0.672, 0.722, 0.6], [0.70, 0.69, 1.0], [0.724, 0.672, 1.4], [0.758, 0.69, 0.9], [0.815, 0.722, 0.55]];
  const S = {
    id: 'smoke', name: 'Smoke',
    bgs: [
      { src: 'assets/bg/smoke-garden-day.jpg', label: 'Autumn afternoon', focus: [0.7, 0.62], night: false },
      { src: 'assets/bg/smoke-garden-night.jpg', label: 'Autumn night', focus: [0.7, 0.62], night: true },
    ],
  };
  const CAP = 1400, NV = 5, NT = 6;
  const P = {};
  ['x', 'y', 'vx', 'vy', 'age', 'life', 'sz', 'gr', 'rot', 'vr', 'a0', 'oy'].forEach((k) => (P[k] = new Float32Array(CAP)));
  const V = new Uint8Array(CAP);
  let n = 0, bg, t = 0, maps = null, sprites = { day: null, night: null }, glow = null, spark = null;
  let embers = [], sparks = [], acc = 0, k = 1, pushAg = 0;
  const tmp = [0, 0];

  const TONES = {
    day: [[196, 194, 190], [208, 208, 208], [216, 218, 221], [224, 227, 231], [230, 233, 238], [234, 238, 244]],
    night: [[128, 74, 44], [86, 74, 70], [84, 86, 96], [92, 98, 114], [100, 108, 128], [104, 112, 134]],
  };
  function buildSprites(mode) {
    if (!maps) maps = Array.from({ length: NV }, (_, i) => M.densityMap(96, i * 3.7 + 1, 'smoke'));
    return TONES[mode].map((c) => maps.map((m) => M.tintSprite(m, 96, () => c)));
  }
  function surfaceV(u) { return u < 0.722 ? 0.66 + ((0.722 - u) / 0.252) * 0.23 : 0.66 + ((u - 0.722) / 0.25) * 0.085; }

  S.init = function (env, meta) {
    bg = meta; t = 0; n = 0; acc = 0;
    const mode = meta.night ? 'night' : 'day';
    if (!sprites[mode]) sprites[mode] = buildSprites(mode);
    if (!glow) { glow = M.glowSprite(64, 'rgba(255,210,140,1)', 'rgba(255,110,30,0.55)'); spark = M.glowSprite(32, 'rgba(255,230,170,1)', 'rgba(255,140,40,0.6)'); }
    embers = [];
    for (let i = 0; i < 34; i++) {
      const uu = U.rand(0.6, 0.86);
      embers.push({ u: uu, v: surfaceV(uu) + U.rand(0.004, 0.05), r: U.rand(2, 6), ph: Math.random() * 100, sp: U.rand(0.3, 1.2) });
    }
    sparks = [];
    S.resize(env);
    // pre-warm so the plume is already standing
    for (let i = 0; i < 240; i++) S.update(1 / 20, env, true);
  };
  S.setBg = function (env, meta) {
    bg = meta;
    const mode = meta.night ? 'night' : 'day';
    if (!sprites[mode]) sprites[mode] = buildSprites(mode);
    S.resize(env);
  };
  S.resize = function (env) { k = env.cover.s * (env.cover.iw / 1672); };

  function emit(env, vi) {
    if (n >= CAP) return;
    const v = VENTS[vi];
    const [x, y] = env.map(v[0] + U.rand(-0.007, 0.007), v[1] + U.rand(-0.003, 0.004));
    const i = n++;
    P.x[i] = x; P.y[i] = y; P.oy[i] = y;
    P.vx[i] = U.rand(-2, 2) * k; P.vy[i] = -U.rand(10, 18) * k;
    P.age[i] = 0; P.life[i] = U.rand(10, 17);
    P.sz[i] = U.rand(5, 10) * k; P.gr[i] = U.rand(5, 9) * k;
    P.rot[i] = Math.random() * 6.28; P.vr[i] = U.rand(-0.12, 0.12);
    P.a0[i] = U.rand(0.24, 0.4) * (bg.night ? 0.9 : 1) * (0.7 + v[2] * 0.25);
    V[i] = (Math.random() * NV) | 0;
  }
  function kill(i) {
    const j = --n;
    if (i !== j) { for (const key in P) P[key][i] = P[key][j]; V[i] = V[j]; }
  }

  S.update = function (dt, env, warm) {
    t += dt;
    const rate = 52 * env.density * env.quality;
    acc += rate * dt;
    while (acc >= 1) {
      acc -= 1;
      let r = Math.random() * 4.45, vi = 0;
      while (vi < VENTS.length - 1 && r > VENTS[vi][2]) { r -= VENTS[vi][2]; vi++; }
      emit(env, vi);
    }
    const inp = env.input, wind = (1 + 7 * M.noise.noise3(t * 0.02, 1.7, 0)) * k;
    const R = 150 * Math.max(env.unit, 0.75), R2 = R * R;
    const active = !warm && inp.active;
    pushAg *= Math.exp(-dt * 1.5);
    for (let i = n - 1; i >= 0; i--) {
      const age = (P.age[i] += dt);
      if (age > P.life[i] || P.y[i] < -200) { kill(i); continue; }
      const h = (P.oy[i] - P.y[i]) / k; // height above vent (image px)
      M.noise.curl2(P.x[i] / (95 * k), P.y[i] / (95 * k) + t * 0.05, t * 0.11, tmp);
      const turb = (3 + age * 2.2 + h * 0.02) * k;
      const buoy = 20 * k * Math.exp(-age / 9);
      const tvx = wind * (0.15 + h / 200) + tmp[0] * turb;
      const tvy = -buoy - 2 * k + tmp[1] * turb * 0.75;
      const relax = Math.min(1, dt * 0.9);
      P.vx[i] += (tvx - P.vx[i]) * relax; P.vy[i] += (tvy - P.vy[i]) * relax;
      if (active) {
        const dx = P.x[i] - inp.x, dy = P.y[i] - inp.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          // the hand drags air with it and sheds a vortex behind
          const d = Math.sqrt(d2) + 1e-3, f = 1 - d / R, sw = (inp.vx * dy - inp.vy * dx) / (d * 900);
          P.vx[i] += (inp.vx * 1.4 * f - dy * sw * f * 2) * dt * 2.2;
          P.vy[i] += (inp.vy * 1.4 * f + dx * sw * f * 2) * dt * 2.2;
          P.vr[i] += sw * f * dt * 4;
          pushAg = Math.max(pushAg, Math.min(1, Math.hypot(inp.vx, inp.vy) / 900));
        }
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt; P.vr[i] *= Math.exp(-dt * 0.5);
    }
    if (bg.night && !warm && Math.random() < dt * 1.3) {
      const v = VENTS[(Math.random() * VENTS.length) | 0];
      const [x, y] = env.map(v[0], v[1]);
      sparks.push({ x, y, vx: U.rand(-10, 10) * k, vy: -U.rand(40, 80) * k, life: U.rand(0.8, 2.4), age: 0 });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt;
      M.noise.curl2(s.x / (60 * k), s.y / (60 * k), t * 0.4, tmp);
      s.vx += tmp[0] * 60 * k * dt; s.vy += (tmp[1] * 40 * k - 10 * k) * dt;
      if (active) { const dx = s.x - inp.x, dy = s.y - inp.y; if (dx * dx + dy * dy < R2) { s.vx += inp.vx * dt * 2; s.vy += inp.vy * dt * 2; } }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.age > s.life) sparks.splice(i, 1);
    }
  };

  S.draw = function (ctx, env) {
    const dpr = env.dpr, night = bg.night;
    // embers glowing in the pile
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of embers) {
      const fl = 0.5 + 0.5 * M.noise.noise3(e.ph, t * e.sp * 2, 0);
      const [x, y] = env.map(e.u, e.v);
      const r = e.r * k * (1.1 + fl * 0.8);
      ctx.globalAlpha = Math.min(1, (night ? 1.2 : 0.14) * fl * fl);
      ctx.drawImage(glow, x - r * 2, y - r * 2, r * 4, r * 4);
    }
    ctx.restore();
    // smoke
    const set = sprites[night ? 'night' : 'day'];
    for (let i = 0; i < n; i++) {
      const age = P.age[i], life = P.life[i], lf = age / life;
      const size = P.sz[i] + P.gr[i] * age * (1 + lf * 0.6);
      const a = P.a0[i] * Math.min(1, age / 0.35) * Math.pow(1 - lf, 1.6) * (0.6 + 0.9 * Math.exp(-age / 2.2));
      if (a < 0.003) continue;
      const tone = Math.min(NT - 1, (Math.pow(lf, 0.6) * NT) | 0);
      const c = Math.cos(P.rot[i]), s = Math.sin(P.rot[i]);
      ctx.globalAlpha = a;
      ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * P.x[i], dpr * P.y[i]);
      ctx.drawImage(set[tone][V[i]], -size / 2, -size / 2, size, size);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (sparks.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        const r = 2.2 * k * (1 - s.age / s.life);
        ctx.globalAlpha = 0.9 * (1 - s.age / s.life);
        ctx.drawImage(spark, s.x - r * 2, s.y - r * 2, r * 4, r * 4);
      }
      ctx.restore();
    }
  };

  S.audioState = function () { return { ag: pushAg }; };
  M.scenes.smoke = S;
})();
