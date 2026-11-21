/* Bait-fish school — tight polarised 3D school, predator vacuole + fountain effect, silver flash on turns */
(function () {
  const U = M.util;
  const S = {
    id: 'fish', name: 'Fish',
    bgs: [
      { src: 'assets/bg/fish-shallows.jpg', label: 'Sunlit shallows', focus: [0.5, 0.4], water: [40, 142, 150], top: 0.04, bottom: 0.86,
        caustics: { bed: 0.6, surf: 0.3, bedI: 0.5, surfI: 0.32, bedX: [-1, -0.5], scale: 26, col: [0.85, 1, 0.92] } },
      { src: 'assets/bg/fish-reef.jpg', label: 'Deep reef', focus: [0.42, 0.45], water: [16, 74, 116], top: 0.04, bottom: 0.78,
        caustics: { bed: 0.64, surf: 0.27, bedI: 0.34, surfI: 0.28, bedX: [0.4, 0.62], scale: 24, col: [0.7, 0.95, 1] } },
    ],
  };
  let bg, t = 0;
  const ZOOM = 1.45;
  const cam = { cx: 0, cy: 0, F: 900 };
  const NS = 2, SHARE = [0.74, 0.26];
  const schools = Array.from({ length: NS }, (_, k) => ({ fl: null, k, T: { x: 0, y: 0, z: 120, rx: 200, ry: 70, rz: 120 }, ph: k * 2.1 + Math.random(), cen: [0, 0], m: 0, dir: k ? -1 : 1 }));
  const shark = { on: false, x: 0, y: 0, vx: 0, vy: 0, wait: 10, ph: 0 };
  let snow = [], bubbles = [], rays = [], paths = [], yTop = 0, yBot = 0;

  function want(env, k) { return Math.round((env.mobile ? 4600 : 11000) * SHARE[k] * env.density * env.quality); }

  S.init = function (env, meta) {
    bg = meta; t = Math.random() * 50;
    S.resize(env);
    schools.forEach((sc, k) => {
      const n = want(env, k);
      if (!sc.fl) sc.fl = M.Flock(16000);
      sc.fl.n = 0; updateTarget(env, sc);
      const T = sc.T, dir = k % 2 ? -1 : 1;
      for (let i = 0; i < n; i++) sc.fl.add(T.x + U.gauss() * 90, T.y + U.gauss() * 50, T.z + U.gauss() * 60, 80 * dir, U.gauss() * 4, U.gauss() * 4);
    });
    M.caustics.enable(meta);
    snow = [];
    for (let i = 0; i < 160; i++) snow.push({ x: Math.random() * env.W, y: Math.random() * env.H, z: Math.random(), ph: Math.random() * 6.28, vx: 0, vy: 0 });
    bubbles = [];
    rays = [];
    for (let i = 0; i < 7; i++) rays.push({ x: U.rand(-0.1, 1.1), w: U.rand(0.04, 0.12), sk: U.rand(0.15, 0.35), ph: Math.random() * 6.28, sp: U.rand(0.15, 0.4) });
    shark.on = false; shark.wait = 10;
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env); M.caustics.enable(meta); };
  S.exit = function () { M.caustics.disable(); };
  S.resize = function (env) {
    yTop = env.map(0, bg.top)[1]; yBot = env.map(0, bg.bottom)[1];
    yTop = Math.max(yTop, env.H * 0.04); yBot = Math.min(yBot, env.H * 0.94);
    cam.cx = env.W / 2; cam.cy = (yTop + yBot) / 2;
  };
  function updateTarget(env, sc) {
    const T = sc.T, q = t + sc.ph * 37;
    const Vw = env.W / 2 / (env.unit * ZOOM), Vh = (yBot - yTop) / 2 / (env.unit * ZOOM);
    // alternate between a cruising, stretched school and a tight milling bait ball
    sc.m = U.smooth(-0.15, 0.35, M.noise.noise3(t * 0.025, sc.ph * 3.1, 0.5));
    const m = sc.m, roam = 1 - 0.75 * m;
    T.x = (Vw * 0.4 * Math.sin(q * 0.041 + sc.ph) + Vw * 0.12 * Math.sin(q * 0.13 + 2)) * (sc.k ? 1 : 0.7);
    T.y = Vh * 0.35 * Math.sin(q * 0.057 + 1 + sc.ph) * roam;
    T.z = (sc.k ? 400 : 150) + 80 * Math.sin(q * 0.033);
    const big = sc.k ? 0.6 : 1;
    T.rx = big * U.lerp((230 + Vw * 0.2) * (1 + 0.3 * Math.sin(t * 0.08)), 230, m);
    T.ry = big * U.lerp(Math.max(70, Vh * 0.32) * (1 + 0.35 * Math.sin(t * 0.11 + 1)), 190, m);
    T.rz = big * U.lerp(200, 230, m);
  }

  S.onPointerDown = function (env) {
    const inp = env.input;
    for (let i = 0; i < 14; i++) bubbles.push({ x: inp.x + U.gauss() * 6, y: inp.y + U.gauss() * 6, r: U.rand(1.5, 5) * Math.max(env.unit, 0.7), vy: -U.rand(40, 90), ph: Math.random() * 6, life: 0 });
    M.audio && M.audio.event('bubbles');
  };

  S.update = function (dt, env) {
    t += dt;
    const inp = env.input, preds = [];
    const R = 55 * Math.max(env.unit, 0.75);
    if (inp.active) preds.push({ x: inp.x, y: inp.y, z: 150, r: env.mode === 'attract' ? R * 1.6 : R, str: env.mode === 'attract' ? -280 : 1700 });
    // the predator hunts the nearest school
    let cen = schools[0].cen, best = 1e9;
    for (const sc of schools) { const d = Math.abs(sc.cen[0] - shark.x) + Math.abs(sc.cen[1] - shark.y); if (d < best) { best = d; cen = sc.cen; } }
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
      preds.push({ x: shark.x, y: shark.y, z: 150, r: 120 * Math.max(env.unit, 0.75), str: 1600 });
      if (shark.x < -200 || shark.x > env.W + 200) { shark.on = false; shark.wait = U.rand(12, 20); }
    }
    for (const sc of schools) {
      const fl = sc.fl;
      updateTarget(env, sc);
      const n = want(env, sc.k);
      if (Math.abs(fl.n - n) > 30) fl.grow(n, 4);
      fl.step(dt, {
        r: 34, sep: 11, wSep: 1100, wAli: 3.4, wCoh: 1.8, border: 2.5, gcoh: 0.05, noise: 20, fearAli: 0.6, vmin: 45, vmax: 110, maxN: 9, accel: 2.2,
        contain: 95, mill: sc.m * 70 * sc.dir, fearDecay: 0.95, fearSpread: 0.9, fearBoost: 1.5, vdamp: 0.9, flap: 15,
        target: sc.T, predators: preds, unit: env.unit * ZOOM, boundK: 8,
        yMin: yTop + 10, yMax: yBot - 10, xMin: -60, xMax: env.W + 60, zMin: -240, zMax: 700,
      });
      fl.project(cam.cx, cam.cy, cam.F, env.unit * ZOOM);
      sc.cen = fl.centroid();
    }
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
    M.caustics.render(t, env);
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
    const NB = 7;
    for (let b = 0; b < NB * 3; b++) paths[b] = new Path2D();
    const backs = [new Path2D(), new Path2D(), new Path2D()];
    const L0 = 30 * Math.max(env.unit, 0.7);
    for (const school of schools) {
      const fl = school.fl;
      const { sx, sy, sc, vx, vy, vz, turn, phase, fear, px, py, pz } = fl;
      const T = school.T;
      for (let i = 0; i < fl.n; i++) {
        const x = sx[i], y = sy[i];
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const s = sc[i];
        const hl = Math.hypot(vx[i], vy[i]) + 1e-6, side = hl / (Math.hypot(hl, vz[i]) + 1e-6);
        // value: dark silhouette (head-on / backlit) -> bright silver (flank to the light, rolling in a turn)
        const roll = 0.5 + 0.5 * Math.sin(phase[i] * 0.09 + i * 0.37);
        let v = side * side * (0.22 + 0.78 * Math.pow(roll, 6)) * 0.92 + Math.min(1, turn[i] * 0.7) * 0.3 + fear[i] * 0.06 - 0.04;
        // self-shading: light is absorbed by the fish above and around -> darker heart and underside of a dense ball
        const ex = (px[i] - T.x) / T.rx, ey = (py[i] - T.y) / T.ry, ez = (pz[i] - T.z) / T.rz;
        const inner = 1 - Math.min(1, Math.sqrt(ex * ex + ey * ey + ez * ez));
        v *= U.clamp(1 - inner * 0.4 - Math.max(0, ey) * 0.25, 0.45, 1);
        v = U.clamp(v + (((i * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.3, 0, 0.999);
        const d = s < 0.75 ? 0 : s < 1.05 ? 1 : 2;
        const hx = vx[i] / hl, hy = vy[i] / hl, L = L0 * s;
        fishPath(paths[d * NB + ((v * NB) | 0)], x, y, hx, hy, L, side, phase[i]);
        // countershading: dark dorsal line along the back (toward the light / screen-up)
        let nx = -hy, ny = hx; if (ny > 0) { nx = -nx; ny = -ny; }
        const Ls = L * (0.32 + 0.68 * side), o = L * 0.06;
        backs[d].moveTo(x + hx * Ls * 0.42 + nx * o, y + hy * Ls * 0.42 + ny * o);
        backs[d].lineTo(x - hx * Ls * 0.3 + nx * o, y - hy * Ls * 0.3 + ny * o);
      }
    }
    const dark = [22, 28, 34], silver = [236, 242, 245];
    for (let d = 0; d < 3; d++) {
      const haze = [0.36, 0.16, 0.02][d];
      for (let b = 0; b < NB; b++) {
        const col = U.mix(U.mix(dark, silver, Math.pow((b + 0.5) / NB, 1.2)), bg.water, haze);
        ctx.fillStyle = U.rgba(col, 0.82 + 0.15 * (b / NB));
        ctx.fill(paths[d * NB + b]);
      }
      ctx.strokeStyle = U.rgba(U.mix([14, 22, 30], bg.water, haze), 0.6);
      ctx.lineWidth = Math.max(0.6, env.unit * (0.8 + d * 0.35)); ctx.lineCap = 'round';
      ctx.stroke(backs[d]);
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

  S.audioState = function () { let f = 0; for (const sc of schools) f = Math.max(f, sc.fl.meanFear); return { ag: U.clamp(f * 2.5, 0, 1) }; };
  M.scenes.fish = S;
})();
