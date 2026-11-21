/* Fair-weather cumulus — near-static, imperceptible drift; puffs deform when pushed and slowly re-form */
(function () {
  const U = M.util;
  const S = {
    id: 'clouds', name: 'Clouds',
    bgs: [
      { src: 'assets/bg/clouds-fields.jpg', label: 'Summer fields', focus: [0.5, 0.45], horizon: 0.57 },
      { src: 'assets/bg/clouds-mountains.jpg', label: 'Mountain fields', focus: [0.62, 0.45], horizon: 0.48 },
    ],
  };
  const NVAR = 4, NTONE = 9, SZ = 160;
  const LIT = [255, 254, 251], SHADE = [138, 150, 172];
  let sprites = null, clouds = [], bg, t = 0, hy = 0, top = 0, ag = 0;
  const wake = M.Wake(), wk = [0, 0];

  function buildSprites() {
    const out = [];
    for (let tone = 0; tone < NTONE; tone++) {
      const L = tone / (NTONE - 1), row = [];
      for (let v = 0; v < NVAR; v++) {
        const seed = v * 5.1 + 2;
        const map = M.densityMap(SZ, seed, 'cloud');
        row.push(M.tintSprite(map, SZ, (nx, ny) => {
          const nz = M.noise.fbm(nx * 1.6 + seed, ny * 1.6, 9 + seed, 2);
          const light = U.clamp(L * 0.85 + (-ny) * 0.14 + nz * 0.12 + 0.06, 0, 1);
          return U.mix(SHADE, LIT, Math.pow(light, 0.85));
        }));
      }
      out.push(row);
    }
    return out;
  }

  function makeCloud(env, depth, x) {
    const u = env.unit, sc = U.lerp(1, 0.3, depth);
    const w = U.rand(1100, 2100) * sc * Math.max(u, 0.6), flat = 1 - depth * 0.35;
    const puffs = [], lobes = [];
    const nl = U.randInt(4, 7);
    let maxH = 1;
    for (let l = 0; l < nl; l++) {
      const lx = U.rand(-0.4, 0.4) * w, center = 1 - Math.abs(lx) / (w * 0.5);
      const lh = w * U.rand(0.08, 0.2) * (0.4 + 0.6 * center) * flat, lr = w * U.rand(0.1, 0.17);
      lobes.push({ lx, lh, lr }); maxH = Math.max(maxH, lh + lr);
    }
    for (const lb of lobes) {
      for (let k = 0; k < 30; k++) {
        const f = Math.random(), r = lb.lr * U.rand(0.55, 1.0) * (1 - f * 0.3);
        puffs.push({ x: lb.lx + U.gauss() * lb.lr * 0.42 * (1 - f * 0.3), y: Math.min(-f * lb.lh, -r * 0.55), r });
      }
      for (let k = 0; k < 14; k++) { // cauliflower crown detail
        const a = U.rand(-2.8, -0.35), r = lb.lr * U.rand(0.3, 0.5);
        puffs.push({ x: lb.lx + Math.cos(a) * lb.lr * 0.6, y: -lb.lh + Math.sin(a) * lb.lr * 0.55, r });
      }
    }
    const nb = Math.max(8, Math.round(w / (34 * sc * Math.max(u, 0.6))));
    for (let k = 0; k < nb; k++) { const r = w * U.rand(0.08, 0.13); puffs.push({ x: U.rand(-0.47, 0.47) * w, y: -r * 0.5, r }); }
    for (const p of puffs) {
      const h = U.clamp(-p.y / maxH, 0, 1), side = p.x / w;
      const tone = U.clamp(0.28 + h * 0.85 - side * 0.3 + U.gauss() * 0.06 + (p.r < w * 0.06 ? 0.06 : 0), 0, 1);
      p.tone = Math.round(tone * (NTONE - 1)); p.v = (Math.random() * NVAR) | 0;
      p.hx = p.x; p.hy = p.y; p.vx = 0; p.vy = 0;
    }
    puffs.sort((a, b) => a.tone - b.tone || b.y - a.y);
    const baseY = U.lerp(top + (hy - top) * 0.4, hy - (hy - top) * 0.05, depth);
    return { x, y: baseY, depth, sc, w, puffs, alpha: U.lerp(0.98, 0.7, depth), drift: U.rand(1.6, 2.6) * sc * Math.max(u, 0.6), vx: 0, vy: 0, cache: null, dirty: true, ox: 0, oy: 0, cw: 0, ch: 0, active: 0 };
  }

  function render(c, env) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of c.puffs) { x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r); y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r); }
    const pad = 6;
    c.ox = x0 - pad; c.oy = y0 - pad; c.cw = x1 - x0 + pad * 2; c.ch = y1 - y0 + pad * 2;
    // soft clouds don't need full resolution; cap each cache at ~2.5 MP to keep GPU memory low
    const dpr = Math.min(1, Math.sqrt(2.5e6 / (c.cw * c.ch)));
    if (!c.cache) c.cache = document.createElement('canvas');
    const W = Math.ceil(c.cw * dpr), H = Math.ceil(c.ch * dpr);
    if (c.cache.width !== W || c.cache.height !== H) { c.cache.width = W; c.cache.height = H; }
    const g = c.cache.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.setTransform(dpr, 0, 0, dpr, -c.ox * dpr, -c.oy * dpr);
    for (const p of c.puffs) g.drawImage(sprites[p.tone][p.v], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    c.dirty = false;
  }

  S.init = function (env, meta) {
    bg = meta; t = 0;
    if (!sprites) sprites = buildSprites();
    S.resize(env, true);
  };
  S.setBg = function (env, meta) { bg = meta; S.resize(env, true); };
  S.resize = function (env, regen) {
    hy = env.map(0.5, bg.horizon)[1]; top = env.H * 0.03;
    if (regen || !clouds.length) {
      clouds = [];
      const count = U.clamp(Math.round(2 + env.W / 700), 3, 5);
      for (let i = 0; i < count; i++) {
        const depth = Math.pow(Math.random(), 0.8);
        clouds.push(makeCloud(env, depth, (i + U.rand(0.1, 0.9)) / count * env.W * 1.3 - env.W * 0.15));
      }
      clouds.sort((a, b) => b.depth - a.depth);
    } else {
      for (const c of clouds) c.y = U.lerp(top + (hy - top) * 0.4, hy - (hy - top) * 0.05, c.depth);
    }
  };

  S.update = function (dt, env) {
    t += dt;
    const inp = env.input, sp = Math.hypot(inp.vx, inp.vy);
    const R = 45 * Math.max(env.unit, 0.7), attract = env.mode === 'attract';
    ag = Math.max(ag * Math.exp(-dt * 1.2), inp.active ? Math.min(1, sp / 1600) : 0);
    // enormous masses of vapour barely notice a hand: a small, slow, lagging wake
    wake.update(dt, inp, { r: 40 * Math.max(env.unit, 0.7), gain: attract ? -0.06 : 0.09, swirl: 0.05, maxSpeed: 700, life: 4 });
    const hasWake = wake.items.length > 0;
    for (let ci = 0; ci < clouds.length; ci++) {
      let c = clouds[ci];
      // interaction: the hand moves air; puffs are carried by it and the whole cloud gains a little momentum
      if (hasWake) {
        const m = R * 4;
        if (wake.items.some((it) => it.x > c.x + c.ox - m && it.x < c.x + c.ox + c.cw + m && it.y > c.y + c.oy - m && it.y < c.y + c.oy + c.ch + m)) {
          for (const p of c.puffs) {
            wake.sample(c.x + p.x, c.y + p.y, wk);
            if (wk[0] === 0 && wk[1] === 0) continue;
            // big puffs have more inertia
            const inert = 1 / (1 + p.r / (60 * Math.max(env.unit, 0.7)));
            p.vx += wk[0] * inert * dt * 0.9; p.vy += wk[1] * inert * dt * 0.9;
            c.active = 2;
          }
        }
      }
      if (c.active > 0) {
        c.active -= dt;
        let moving = false;
        for (const p of c.puffs) {
          // very weak restoring force: torn cloud slowly gathers itself again (~30 s)
          p.vx += (p.hx - p.x) * 0.035 * dt; p.vy += (p.hy - p.y) * 0.035 * dt;
          const dmp = Math.exp(-dt * 0.85); p.vx *= dmp; p.vy *= dmp;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (Math.abs(p.vx) + Math.abs(p.vy) > 0.15 || Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) > 0.6) moving = true;
        }
        if (moving) { c.active = Math.max(c.active, 0.5); c.dirty = true; }
      }
      c.vx *= Math.exp(-dt * 0.25); c.vy *= Math.exp(-dt * 0.4);
      c.x += (c.drift + c.vx) * dt; c.y += c.vy * dt;
      const yHome = U.lerp(top + (hy - top) * 0.4, hy - (hy - top) * 0.05, c.depth);
      c.vy += (yHome - c.y) * 0.02 * dt;
      if (c.cache && c.x + c.ox > env.W + 30) {
        const nc = makeCloud(env, c.depth, 0); render(nc, env); nc.x = -(nc.ox + nc.cw) - 20; clouds[ci] = c = nc;
      } else if (c.cache && c.x + c.ox + c.cw < -200 && c.vx < 0) {
        const nc = makeCloud(env, c.depth, 0); render(nc, env); nc.x = env.W - nc.ox + 20; clouds[ci] = c = nc;
      }
    }
  };

  S.draw = function (ctx, env) {
    for (const c of clouds) {
      if (c.dirty || !c.cache) render(c, env);
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(c.cache, c.x + c.ox, c.y + c.oy, c.cw, c.ch);
    }
    ctx.globalAlpha = 1;
  };
  S.audioState = function () { return { ag }; };
  M.scenes.clouds = S;
})();
