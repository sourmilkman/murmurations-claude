/* Bait-fish school — tight polarised 3D school, predator vacuole + fountain effect, silver flash on turns */
(function () {
  const U = M.util;
  const S = {
    id: 'fish', name: 'Fish',
    bgs: [
      { src: 'assets/bg/fish-shallows.jpg', label: 'Sunlit shallows', focus: [0.5, 0.4], water: [40, 142, 150], top: 0.04, bottom: 0.86 },
      { src: 'assets/bg/fish-reef.jpg', label: 'Deep reef', focus: [0.42, 0.45], water: [16, 74, 116], top: 0.04, bottom: 0.78 },
    ],
  };
  let fl = null, bg, t = 0;
  const cam = { cx: 0, cy: 0, F: 900 };
  const T = { x: 0, y: 0, z: 120, rx: 200, ry: 70, rz: 120 };
  const shark = { on: false, x: 0, y: 0, vx: 0, vy: 0, wait: 10, ph: 0 };
  let snow = [], bubbles = [], rays = [], paths = [], yTop = 0, yBot = 0, cen = [0, 0];

  function want(env) { return Math.round((env.mobile ? 1100 : 1900) * env.density * env.quality); }

  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 50;
    if (!fl) fl = M.Flock(4000);
    fl.n = 0;
    S.resize(env);
    updateTarget(env);
    const n = want(env);
    for (let i = 0; i < n; i++) {
      fl.add(T.x + U.gauss() * 60, T.y + U.gauss() * 25, T.z + U.gauss() * 40, 80, U.gauss() * 4, U.gauss() * 4);
    }
    snow = [];
    for (let i = 0; i < 160; i++) snow.push({ x: Math.random() * env.W, y: Math.random() * env.H, z: Math.random(), ph: Math.random() * 6.28, vx: 0, vy: 0 });
    bubbles = [];
    rays = [];
    for (let i = 0; i < 7; i++) rays.push({ x: U.rand(-0.1, 1.1), w: U.rand(0.04, 0.12), sk: U.rand(0.15, 0.35), ph: Math.random() * 6.28, sp: U.rand(0.15, 0.4) });
    shark.on = false; shark.wait = 10;
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); };
  S.resize = function (env) {
    yTop = env.map(0, bg.top)[1]; yBot = env.map(0, bg.bottom)[1];
    yTop = Math.max(yTop, env.H * 0.04); yBot = Math.min(yBot, env.H * 0.94);
    cam.cx = env.W / 2; cam.cy = (yTop + yBot) / 2;
  };
  function updateTarget(env) {
    const Vw = env.W / 2 / env.unit, Vh = (yBot - yTop) / 2 / env.unit;
    T.x = Vw * 0.38 * Math.sin(t * 0.045) + Vw * 0.12 * Math.sin(t * 0.13 + 2);
    T.y = Vh * 0.3 * Math.sin(t * 0.06 + 1);
    T.z = 120 + 90 * Math.sin(t * 0.033);
    T.rx = (170 + Vw * 0.16) * (1 + 0.3 * Math.sin(t * 0.08));
    T.ry = Math.max(60, Vh * 0.36) * (1 + 0.35 * Math.sin(t * 0.11 + 1));
    T.rz = 170;
  }

  S.onPointerDown = function (env) {
    const inp = env.input;
    for (let i = 0; i < 14; i++) bubbles.push({ x: inp.x + U.gauss() * 6, y: inp.y + U.gauss() * 6, r: U.rand(1.5, 5) * Math.max(env.unit, 0.7), vy: -U.rand(40, 90), ph: Math.random() * 6, life: 0 });
    M.audio && M.audio.event('bubbles');
  };

  S.update = function (dt, env) {
    t += dt;
    updateTarget(env);
    const n = want(env);
    if (Math.abs(fl.n - n) > 30) fl.grow(n, 5);
    const inp = env.input, preds = [];
    const R = 130 * Math.max(env.unit, 0.75);
    if (inp.active) preds.push({ x: inp.x, y: inp.y, z: T.z, r: env.mode === 'attract' ? R * 2 : R, str: env.mode === 'attract' ? -220 : 1300 });
    if (env.t - inp.lastAny > 12) {
      shark.wait -= dt;
      if (!shark.on && shark.wait <= 0) {
        const L = Math.random() < 0.5;
        shark.on = true; shark.x = L ? -120 : env.W + 120; shark.y = cen[1] + U.rand(-40, 40) * env.unit;
        shark.vx = (L ? 1 : -1) * 170 * Math.max(env.unit, 0.7); shark.vy = 0;
      }
    }
    if (shark.on) {
      // predator steers lazily toward the school, then lunges
      const dx = cen[0] - shark.x, dy = cen[1] - shark.y, d = Math.hypot(dx, dy) + 1;
      const lunge = d < 220 * env.unit ? 1.6 : 1;
      shark.vy += (dy / d) * 40 * dt; shark.vy *= 0.99;
      shark.x += shark.vx * lunge * dt; shark.y += shark.vy * dt; shark.ph += dt * 6 * lunge;
      preds.push({ x: shark.x, y: shark.y, z: T.z, r: 150 * Math.max(env.unit, 0.75), str: 1500 });
      if (shark.x < -200 || shark.x > env.W + 200) { shark.on = false; shark.wait = U.rand(12, 20); }
    }
    fl.step(dt, {
      r: 40, sep: 15, wSep: 1500, wAli: 3.4, wCoh: 1.7, fearAli: 0.6, vmin: 48, vmax: 105, maxN: 10,
      contain: 75, fearDecay: 0.95, fearSpread: 0.9, fearBoost: 1.5, vdamp: 0.9, flap: 15,
      target: T, predators: preds, unit: env.unit, boundK: 8,
      yMin: yTop + 10, yMax: yBot - 10, xMin: -60, xMax: env.W + 60, zMin: -240, zMax: 700,
    });
    fl.project(cam.cx, cam.cy, cam.F, env.unit);
    cen = fl.centroid();
    // marine snow drifts & is stirred by the hand
    for (const p of snow) {
      p.ph += dt * 0.4;
      if (inp.active) {
        const dx = p.x - inp.x, dy = p.y - inp.y, d2 = dx * dx + dy * dy, R2 = 140 * 140;
        if (d2 < R2) { const f = 1 - Math.sqrt(d2 / R2); p.vx += inp.vx * f * dt * 2; p.vy += inp.vy * f * dt * 2; }
      }
      p.vx *= Math.exp(-dt * 1.2); p.vy *= Math.exp(-dt * 1.2);
      p.x += (Math.sin(p.ph) * 3 + 2 + p.vx) * dt * (0.4 + p.z); p.y += (4 + Math.cos(p.ph * 0.7) * 2 + p.vy) * dt * (0.4 + p.z);
      if (p.y > env.H + 5) { p.y = -5; p.x = Math.random() * env.W; }
      if (p.x > env.W + 5) p.x = -5; else if (p.x < -5) p.x = env.W + 5;
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.life += dt; b.ph += dt * 9;
      b.vy -= 40 * dt; b.y += b.vy * dt; b.x += Math.sin(b.ph) * 18 * dt;
      if (b.y < -10 || b.life > 8) bubbles.splice(i, 1);
    }
  };

  function fishPath(p, x, y, hx, hy, L, side, ph) {
    const Ls = L * (0.32 + 0.68 * side), w = L * 0.11, wig = Math.sin(ph) * L * 0.08;
    const px = -hy, py = hx;
    p.moveTo(x + hx * Ls * 0.5, y + hy * Ls * 0.5);
    p.lineTo(x + hx * Ls * 0.1 + px * w, y + hy * Ls * 0.1 + py * w);
    const tbx = x - hx * Ls * 0.32 + px * wig * 0.4, tby = y - hy * Ls * 0.32 + py * wig * 0.4;
    p.lineTo(tbx, tby);
    p.lineTo(x - hx * Ls * 0.52 + px * (L * 0.12 + wig), y - hy * Ls * 0.52 + py * (L * 0.12 + wig));
    p.lineTo(x - hx * Ls * 0.47 + px * wig, y - hy * Ls * 0.47 + py * wig);
    p.lineTo(x - hx * Ls * 0.52 + px * (-L * 0.12 + wig), y - hy * Ls * 0.52 + py * (-L * 0.12 + wig));
    p.lineTo(tbx, tby);
    p.lineTo(x + hx * Ls * 0.1 - px * w, y + hy * Ls * 0.1 - py * w);
    p.closePath();
  }

  S.draw = function (ctx, env) {
    const W = env.W, H = env.H;
    // shimmering god-rays
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const r of rays) {
      const a = 0.035 * (0.5 + 0.5 * Math.sin(t * r.sp + r.ph));
      const x0 = (r.x + 0.03 * Math.sin(t * 0.1 + r.ph)) * W, w = r.w * W;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
      g.addColorStop(0, 'rgba(220,255,250,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(220,255,250,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w * 2.2 - r.sk * H, H * 0.9); ctx.lineTo(x0 - r.sk * H, H * 0.9); ctx.fill();
    }
    ctx.restore();
    // marine snow
    ctx.fillStyle = 'rgba(225,245,240,0.35)';
    for (const p of snow) { const s = 0.6 + p.z * 1.6; ctx.fillRect(p.x, p.y, s, s); }
    // shark (behind school if far)
    if (shark.on) drawShark(ctx, env);
    // school
    for (let b = 0; b < 12; b++) paths[b] = new Path2D();
    const { sx, sy, sc, vx, vy, vz, turn, phase, fear } = fl;
    const L0 = 15 * Math.max(env.unit, 0.7);
    for (let i = 0; i < fl.n; i++) {
      const x = sx[i], y = sy[i];
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const s = sc[i];
      const hl = Math.hypot(vx[i], vy[i]) + 1e-6, side = hl / (Math.hypot(hl, vz[i]) + 1e-6);
      const flash = U.clamp(side * side * 0.3 + Math.min(1, turn[i] * 0.8) * 0.6 + fear[i] * 0.12, 0, 0.999);
      const d = s < 0.75 ? 0 : s < 1.05 ? 1 : 2;
      fishPath(paths[d * 4 + ((flash * 4) | 0)], x, y, vx[i] / hl, vy[i] / hl, L0 * s, side, phase[i]);
    }
    const dark = [18, 34, 46], silver = [200, 220, 228];
    for (let d = 0; d < 3; d++) {
      const haze = [0.5, 0.28, 0.08][d];
      for (let b = 0; b < 4; b++) {
        const col = U.mix(U.mix(dark, silver, (b + 0.5) / 4), bg.water, haze);
        ctx.fillStyle = U.rgba(col, 0.94);
        ctx.fill(paths[d * 4 + b]);
      }
    }
    // bubbles
    ctx.lineWidth = 1;
    for (const b of bubbles) {
      ctx.strokeStyle = 'rgba(235,255,255,0.55)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.35, b.r * 0.35);
    }
  };
  function drawShark(ctx, env) {
    const L = 120 * Math.max(env.unit, 0.7), hx = Math.sign(shark.vx), wig = Math.sin(shark.ph) * L * 0.06;
    ctx.save(); ctx.translate(shark.x, shark.y); ctx.scale(hx, 1);
    ctx.fillStyle = U.rgba(U.mix([22, 34, 44], bg.water, 0.45), 0.9);
    ctx.beginPath();
    ctx.moveTo(L * 0.5, 0);
    ctx.quadraticCurveTo(L * 0.3, -L * 0.13, -L * 0.05, -L * 0.12);
    ctx.lineTo(-L * 0.02, -L * 0.24); ctx.lineTo(-L * 0.14, -L * 0.11);
    ctx.quadraticCurveTo(-L * 0.35, -L * 0.06, -L * 0.42, wig * 0.5);
    ctx.lineTo(-L * 0.58, -L * 0.18 + wig); ctx.lineTo(-L * 0.52, wig * 0.6); ctx.lineTo(-L * 0.6, L * 0.14 + wig);
    ctx.lineTo(-L * 0.42, wig * 0.5);
    ctx.quadraticCurveTo(-L * 0.2, L * 0.09, L * 0.05, L * 0.1);
    ctx.lineTo(-L * 0.05, L * 0.2); ctx.lineTo(L * 0.14, L * 0.09);
    ctx.quadraticCurveTo(L * 0.35, L * 0.08, L * 0.5, 0);
    ctx.fill(); ctx.restore();
  }

  S.audioState = function () { return { ag: U.clamp(fl.meanFear * 2.5, 0, 1) }; };
  M.scenes.fish = S;
})();
