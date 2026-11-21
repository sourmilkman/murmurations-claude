/* Murmurations — shared utilities, procedural sprites, 3D flocking engine */
(function () {
  const M = (window.M = window.M || {});
  M.VERSION = '0.6.0';
  M.scenes = M.scenes || {};
  M.sceneOrder = ['starlings', 'locusts', 'fish', 'smoke', 'clouds'];

  const U = (M.util = {
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    clamp: (x, a, b) => (x < a ? a : x > b ? b : x),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); },
    gauss: () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * Math.random()); },
    mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    rgba: (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (+a).toFixed(3) + ')',
  });

  /* ---------- procedural textures ---------- */
  const N = () => M.noise;
  M.densityMap = function (size, seed, kind) {
    const d = new Float32Array(size * size);
    const ox = seed * 17.31, oy = seed * -9.17;
    const fbm = N().fbm;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = ((x + 0.5) / size) * 2 - 1, ny = ((y + 0.5) / size) * 2 - 1;
        const r = Math.sqrt(nx * nx + ny * ny);
        let v = 0;
        if (r < 1) {
          if (kind === 'smoke') {
            // domain-warped fbm -> wispy, filamented smoke
            const w = fbm(nx * 1.3 + ox, ny * 1.3 + oy, seed, 2);
            const q = fbm(nx * 1.9 + w * 1.5 + ox, ny * 1.9 + w * 1.5 - oy, seed + 5.3, 3);
            const fall = Math.pow(1 - r, 1.25);
            v = U.clamp(fall * (0.15 + 1.5 * (q * 0.5 + 0.5)) * 1.35 - 0.1, 0, 1);
          } else if (kind === 'cloud') {
            const q = fbm(nx * 1.8 + ox, ny * 1.8 + oy, seed, 3);
            const edge = 0.72 + 0.26 * q;
            v = (1 - U.smooth(edge - 0.6, edge, r)) * 0.95;
          } else {
            v = Math.pow(1 - r, 2.2);
          }
        }
        d[y * size + x] = v;
      }
    }
    return d;
  };
  M.tintSprite = function (map, size, colorAt) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size), D = img.data;
    for (let i = 0; i < map.length; i++) {
      const a = map[i];
      if (a <= 0.003) continue;
      const x = i % size, y = (i / size) | 0;
      const col = colorAt(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1, a);
      const o = i * 4;
      D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  };
  M.glowSprite = function (size, inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  };

  /* ---------- 3D flock (boids w/ topological-ish neighbour cap + fear contagion) ---------- */
  M.Flock = function (cap) {
    const f = { cap, n: 0 };
    ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'fear', 'turn', 'phase', 'sx', 'sy', 'sc', 'hx', 'hy', 'pref', 'prefT', 'tresp', 'gdx', 'gdy', 'gdz'].forEach((k) => (f[k] = new Float32Array(cap)));
    const TB = 32768, head = new Int32Array(TB), next = new Int32Array(cap);
    const kd = new Float32Array(16), ki = new Int32Array(16);
    // 3D spatial hash, 27 cells, own cell first (a 2D hash let one crowded column dominate everyone's neighbour list)
    const OX = [], OY = [], OZ = [];
    OX.push(0); OY.push(0); OZ.push(0);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) { OX.push(a); OY.push(b); OZ.push(c); }
    const hash = (ix, iy, iz) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) & (TB - 1);
    f.add = function (x, y, z, vx, vy, vz) {
      if (f.n >= cap) return;
      const i = f.n++;
      f.px[i] = x; f.py[i] = y; f.pz[i] = z; f.vx[i] = vx; f.vy[i] = vy; f.vz[i] = vz;
      f.fear[i] = 0; f.turn[i] = 0; f.phase[i] = Math.random() * 6.283; f.sx[i] = -1e5; f.sy[i] = -1e5; f.sc[i] = 1;
      const l = Math.hypot(vx, vy) || 1; f.hx[i] = vx / l; f.hy[i] = vy / l;
      f.pref[i] = f.prefT[i] = U.rand(0.8, 1.2); f.tresp[i] = U.rand(-0.35, 0.85);
      const vl = Math.hypot(vx, vy, vz) || 1; f.gdx[i] = vx / vl; f.gdy[i] = vy / vl; f.gdz[i] = vz / vl;
    };
    f.grow = function (target, spread) {
      if (target < f.n) { f.n = Math.max(0, target); return; }
      while (f.n < target && f.n > 0) {
        const j = (Math.random() * f.n) | 0;
        f.add(f.px[j] + U.gauss() * spread, f.py[j] + U.gauss() * spread, f.pz[j] + U.gauss() * spread, f.vx[j], f.vy[j], f.vz[j]);
      }
    };
    f.project = function (cx, cy, F, unit, pitch) {
      const { px, py, pz, sx, sy, sc } = f;
      const ca = Math.cos(pitch || 0), sa = Math.sin(pitch || 0);
      for (let i = 0; i < f.n; i++) {
        // camera tilted up at the sky: distant birds sit lower, higher birds are farther away
        const yc = py[i] * ca + pz[i] * sa, zc = pz[i] * ca - py[i] * sa;
        const s = F / (F + Math.max(zc, -F * 0.7));
        sc[i] = s; sx[i] = cx + px[i] * s * unit; sy[i] = cy + yc * s * unit;
      }
    };
    f.step = function (dt, P) {
      const n = f.n, { px, py, pz, vx, vy, vz, fear, turn, phase, sx, sy, sc, hx, hy, pref, prefT, tresp, gdx, gdy, gdz } = f;
      const inv = 1 / P.r;
      head.fill(-1);
      for (let i = 0; i < n; i++) { const h = hash(Math.floor(px[i] * inv), Math.floor(py[i] * inv), Math.floor(pz[i] * inv)); next[i] = head[h]; head[h] = i; }
      const r2 = P.r * P.r, s2 = P.sep * P.sep, T = P.target, K = Math.min(16, P.maxN);
      let fxS = 0, fyS = 0, fzS = 0;
      const SPR = P.spring, FL = P.flat || 0;
      const EX = P.exam || 64, SOFT = !!P.sepSoft, MA = P.maxAcc || 0, FS = P.flockSteer;
      // flock-level steering: direction from the flock's centre to the goal; the front of the flock learns it first
      let fdx = 0, fdy = 0, fdz = 0, mvx = f.gvx || 0, mvy = f.gvy || 0, mvz = f.gvz || 0;
      const mvl = Math.sqrt(mvx * mvx + mvy * mvy + mvz * mvz) + 1e-6;
      if (FS) { fdx = FS.x - (f.gcx || 0); fdy = (FS.y - (f.gcy || 0)) * 0.7; fdz = FS.z - (f.gcz || 0); const l = Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz) + 1e-6; fdx /= l; fdy /= l; fdz /= l; }
      const BL = P.blind != null ? P.blind : -2, TU = P.turb, nz3 = M.noise.noise3;
      const decay = Math.pow(P.fearDecay, dt * 60);
      const preds = P.predators, np = preds.length;
      let fearSum = 0, turnSum = 0, gx = 0, gy = 0, gz = 0;
      const GC = P.gcoh || 0, gcx = f.gcx || 0, gcy = f.gcy || 0, gcz = f.gcz || 0;
      const GA = P.gali || 0, gvx = f.gvx || 0, gvy = f.gvy || 0, gvz = f.gvz || 0;
      let svx = 0, svy = 0, svz = 0;
      for (let i = 0; i < n; i++) {
        const x = px[i], y = py[i], z = pz[i];
        const ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv);
        let cnt = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, ssx = 0, ssy = 0, ssz = 0, fm = 0, seen = 0, exam = 0, kc = 0, km = 0;
        const vxi = vx[i], vyi = vy[i], vzi = vz[i], vli = Math.sqrt(vxi * vxi + vyi * vyi + vzi * vzi) + 1e-6;
        // own cell first, then the ring — so the nearest birds are found before the cap is hit
        outer: for (let o = 0; o < 27; o++) {
          let j = head[hash(ix + OX[o], iy + OY[o], iz + OZ[o])];
          while (j >= 0) {
            if (j !== i) {
              const dx = px[j] - x, dy = py[j] - y, dz = pz[j] - z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < r2) {
                // keep the K nearest (topological interaction, as measured in real starling flocks)
                const behind = BL > -1 && (dx * vxi + dy * vyi + dz * vzi) < BL * Math.sqrt(d2) * vli;
                if (behind) { /* in the rear blind cone: not seen */ }
                else if (kc < K) { kd[kc] = d2; ki[kc] = j; if (d2 > kd[km]) km = kc; kc++; }
                else if (d2 < kd[km]) { kd[km] = d2; ki[km] = j; km = 0; for (let q = 1; q < K; q++) if (kd[q] > kd[km]) km = q; }
                if (d2 < s2) {
                  let q;
                  if (SOFT) { const d = Math.sqrt(d2) + 1e-3; q = (1 - d / P.sep) / d; } else q = 1 / (d2 + 0.5);
                  ssx -= dx * q; ssy -= dy * q; ssz -= dz * q;
                }
                if (fear[j] > fm) fm = fear[j];
                if (++seen >= 40) break outer;
              }
            }
            if (++exam >= EX) break outer;
            j = next[j];
          }
        }
        let md = 0, spx = 0, spy = 0, spz = 0;
        for (let q = 0; q < kc; q++) {
          const j = ki[q]; cnt++; ax += vx[j]; ay += vy[j]; az += vz[j];
          const ddx = px[j] - x, ddy = py[j] - y, ddz = pz[j] - z, d = Math.sqrt(kd[q]) + 1e-3;
          cx += ddx; cy += ddy; cz += ddz; md += d;
          if (SPR) {
            // 'liquid' spacing: each of the K nearest is held at the preferred distance by a soft spring
            // (pulls when too far, pushes when too close) -> even density + surface tension at the edge
            const e = U.clamp((d - SPR.d0) / SPR.d0, -1, 1.5) / d;
            spx += ddx * e; spy += ddy * e; spz += ddz * e;
          }
        }
        if (SPR && kc) { fxS = spx * SPR.k / kc; fyS = spy * SPR.k / kc; fzS = spz * SPR.k / kc; } else { fxS = fyS = fzS = 0; }
        let fx = fxS, fy = fyS, fz = fzS;
        const fr = fear[i];
        if (cnt) {
          // border birds (neighbours all on one side) pull inward hardest -> crisp, dense flock edges
          const ol = Math.sqrt(cx * cx + cy * cy + cz * cz) / cnt, cen = ol / (md / cnt + 1e-3);
          const wa = P.wAli * (1 + fr * P.fearAli), wc = P.wCoh * (1 + fr * 0.5) * (1 + (P.border || 0) * cen * cen);
          fx += (ax / cnt - vx[i]) * wa; fy += (ay / cnt - vy[i]) * wa; fz += (az / cnt - vz[i]) * wa;
          fx += (cx / cnt) * wc; fy += (cy / cnt) * wc; fz += (cz / cnt) * wc;
        }
        fx += ssx * P.wSep; fy += ssy * P.wSep; fz += ssz * P.wSep;
        // weak whole-flock cohesion keeps one mass (birds track the flock's centre, not just 7 neighbours)
        if (GC) { fx += (gcx - x) * GC; fy += (gcy - y) * GC; fz += (gcz - z) * GC; }
        // keep the flock a thin, near-horizontal sheet (real flocks are thinnest in the vertical)
        if (FL) fy += (gcy - y) * FL;
        // ...and its mean heading, which damps sub-flocks orbiting each other so they re-merge
        if (GA) { fx += (gvx - vx[i]) * GA; fy += (gvy - vy[i]) * GA; fz += (gvz - vz[i]) * GA; }
        // gentle turbulent wind (adds slow undulation through the flock)
        if (TU) {
          const q = TU.scale;
          fx += nz3(x * q, y * q, TU.t) * TU.amp; fy += nz3(x * q + 31.7, z * q, TU.t) * TU.amp * 0.6; fz += nz3(z * q, y * q + 17.3, TU.t) * TU.amp;
        }
        // random individual perturbation
        if (P.noise) { fx += (Math.random() - 0.5) * P.noise; fy += (Math.random() - 0.5) * P.noise; fz += (Math.random() - 0.5) * P.noise; }
        if (FS) {
          // each bird's sense of 'where we're going' relaxes toward the flock's goal heading;
          // birds at the front (along the travel direction) update first -> turns roll through the flock as a wave
          const front = ((x - (f.gcx || 0)) * mvx + (y - (f.gcy || 0)) * mvy + (z - (f.gcz || 0)) * mvz) / (mvl * FS.span);
          const rate = FS.rate * U.clamp(1 + front * (FS.lead || 1.6), 0.12, 4);
          const kk = Math.min(1, dt * rate);
          gdx[i] += (fdx - gdx[i]) * kk; gdy[i] += (fdy - gdy[i]) * kk; gdz[i] += (fdz - gdz[i]) * kk;
          const vb = (P.vmin + P.vmax) * 0.5;
          fx += (gdx[i] * vb - vx[i]) * FS.w; fy += (gdy[i] * vb - vy[i]) * FS.w; fz += (gdz[i] * vb - vz[i]) * FS.w;
        }
        const G = P.goal;
        if (G) {
          // roost-seeking: each bird turns back independently once it strays past G.R -> folds, swoops, no orbiting ring
          const dx = G.x - x, dy = G.y - y, dz = G.z - z, dl = Math.sqrt(dx * dx + dy * dy * 1.6 + dz * dz) + 1e-6;
          const k = U.smooth(G.R * 0.6, G.R * 1.6, dl) * G.acc;
          fx += (dx / dl) * k; fy += (dy / dl) * k; fz += (dz / dl) * k;
        }
        const ex = T ? (x - T.x) / T.rx : 0, ey = T ? (y - T.y) / T.ry : 0, ez = T ? (z - T.z) / T.rz : 0;
        const ed = T ? Math.sqrt(ex * ex + ey * ey + ez * ez) : 0;
        if (T && ed > 1) {
          const dx = T.x - x, dy = T.y - y, dz = T.z - z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
          const k = Math.min(ed - 1, 3) * P.contain;
          fx += (dx / dl) * k; fy += (dy / dl) * k; fz += (dz / dl) * k;
        }
        if (P.mill && T) {
          // milling: circulation around the ball's vertical axis (bait-ball torus)
          const mx = x - T.x, mz = z - T.z, ml = Math.sqrt(mx * mx + mz * mz) + 1e-3;
          const k = P.mill * Math.min(1, ml / (T.rx * 0.35));
          fx += (-mz / ml) * k; fz += (mx / ml) * k;
          fx -= (mx / ml) * k * 0.25; fz -= (mz / ml) * k * 0.25;
        }
        // fear contagion (information transfer through neighbours -> waves)
        let nf = Math.max(fr * decay, fm * P.fearSpread - 0.015);
        // predators (screen space)
        const s = sc[i], qx = sx[i], qy = sy[i];
        for (let p = 0; p < np; p++) {
          const pr = preds[p], ddx = qx - pr.x, ddy = qy - pr.y, d2 = ddx * ddx + ddy * ddy;
          if (d2 < pr.r * pr.r) {
            const d = Math.sqrt(d2) + 1e-3, k = (1 - d / pr.r);
            const str = pr.str * k / (s * P.unit);
            if (pr.str > 0) {
              fx += (ddx / d) * str; fy += (ddy / d) * str;
              // dive away in depth too
              fz += (pz[i] > pr.z ? 1 : -1) * str * 0.35;
              if (k > nf) nf = Math.min(1, k * 1.3);
            } else {
              // attraction: gentle pull with orbiting swirl
              fx += (ddx / d) * str + (-ddy / d) * -str * 0.6; fy += (ddy / d) * str + (ddx / d) * -str * 0.6;
            }
          }
        }
        fear[i] = nf;
        // screen bounds
        if (qy < P.yMin) fy += ((P.yMin - qy) / (s * P.unit)) * P.boundK;
        if (qy > P.yMax) fy -= ((qy - P.yMax) / (s * P.unit)) * P.boundK * 1.6;
        if (qx < P.xMin) fx += ((P.xMin - qx) / (s * P.unit)) * P.boundK;
        if (qx > P.xMax) fx -= ((qx - P.xMax) / (s * P.unit)) * P.boundK;
        if (z < P.zMin) fz += (P.zMin - z) * 2; if (z > P.zMax) fz -= (z - P.zMax) * 2;
        fy -= vy[i] * P.vdamp; fz -= vz[i] * P.vdamp * 0.5;
        if (MA) { const fa = Math.sqrt(fx * fx + fy * fy + fz * fz); if (fa > MA * (1 + nf)) { const k = (MA * (1 + nf)) / fa; fx *= k; fy *= k; fz *= k; } }
        // integrate
        let nvx = vx[i] + fx * dt, nvy = vy[i] + fy * dt, nvz = vz[i] + fz * dt;
        // individual, wandering speed preference + surge/brake when changing direction
        const PV = P.prefVar != null ? P.prefVar : 0.3;
        if (Math.random() < dt * 0.35) prefT[i] = 1 + U.rand(-PV, PV);
        pref[i] += (prefT[i] - pref[i]) * Math.min(1, dt * (P.prefRate || 0.9));
        const sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) + 1e-6;
        const boost = 1 + nf * P.fearBoost;
        let tgt = (P.vmin + P.vmax) * 0.5 * pref[i] * (1 + tresp[i] * (P.turnResp != null ? P.turnResp : 1) * Math.min(1, turn[i] * 0.6)) * boost;
        tgt = tgt < P.vmin * 0.6 ? P.vmin * 0.6 : tgt > P.vmax * boost * 1.25 ? P.vmax * boost * 1.25 : tgt;
        const nsp = sp + (tgt - sp) * Math.min(1, dt * (P.accel || 1.6));
        { const k = nsp / sp; nvx *= k; nvy *= k; nvz *= k; }
        vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;
        px[i] = x + nvx * dt; py[i] = y + nvy * dt; pz[i] = z + nvz * dt;
        // angular velocity (banking makes birds / fish look darker / flash)
        const hl = Math.sqrt(nvx * nvx + nvy * nvy) + 1e-6, nhx = nvx / hl, nhy = nvy / hl;
        const cr = Math.abs(hx[i] * nhy - hy[i] * nhx) / Math.max(dt, 1e-3);
        turn[i] = turn[i] * 0.9 + Math.min(cr, 6) * 0.1;
        hx[i] = nhx; hy[i] = nhy;
        phase[i] += dt * P.flap * (1 + nf * 0.8 + (Math.random() - 0.5) * 0.2);
        fearSum += nf; turnSum += turn[i]; gx += px[i]; gy += py[i]; gz += pz[i]; svx += vx[i]; svy += vy[i]; svz += vz[i];
      }
      if (n) { f.gcx = gx / n; f.gcy = gy / n; f.gcz = gz / n; f.gvx = svx / n; f.gvy = svy / n; f.gvz = svz / n; }
      f.meanFear = n ? fearSum / n : 0;
      f.meanTurn = n ? turnSum / n : 0;
    };
    f.centroid = function () {
      let x = 0, y = 0, c = 0;
      for (let i = 0; i < f.n; i += 7) { if (f.sx[i] > -1e4) { x += f.sx[i]; y += f.sy[i]; c++; } }
      return c ? [x / c, y / c] : [0, 0];
    };
    return f;
  };

  /* ---------- hand wake for fluids (smoke, clouds): lagging jet + counter-rotating vortices ---------- */
  M.Wake = function () {
    const w = { items: [], lx: null, ly: null };
    w.reset = () => { w.items.length = 0; w.lx = null; };
    w.update = function (dt, inp, o) {
      const sp = Math.hypot(inp.vx, inp.vy);
      if (inp.active && sp > 25) {
        if (w.lx == null) { w.lx = inp.x; w.ly = inp.y; }
        const moved = Math.hypot(inp.x - w.lx, inp.y - w.ly);
        if (moved > o.r * 0.45) {
          w.lx = inp.x; w.ly = inp.y;
          const s = Math.min(sp, o.maxSpeed), ux = inp.vx / sp, uy = inp.vy / sp;
          const nx = -uy, ny = ux, a = o.r * 0.85, c = s * o.swirl;
          w.items.push({ x: inp.x, y: inp.y, vx: ux * s * o.gain, vy: uy * s * o.gain, r: o.r, c: 0, age: 0, life: o.life });
          w.items.push({ x: inp.x + nx * a, y: inp.y + ny * a, vx: ux * s * o.gain * 0.4, vy: uy * s * o.gain * 0.4, r: o.r * 0.8, c: c, age: 0, life: o.life * 1.4 });
          w.items.push({ x: inp.x - nx * a, y: inp.y - ny * a, vx: ux * s * o.gain * 0.4, vy: uy * s * o.gain * 0.4, r: o.r * 0.8, c: -c, age: 0, life: o.life * 1.4 });
          while (w.items.length > 90) w.items.shift();
        }
      } else w.lx = null;
      for (let i = w.items.length - 1; i >= 0; i--) {
        const it = w.items[i];
        it.age += dt;
        if (it.age > it.life) { w.items.splice(i, 1); continue; }
        it.x += it.vx * dt; it.y += it.vy * dt;
        const d = Math.exp(-dt * 1.3); it.vx *= d; it.vy *= d;
        it.r *= 1 + dt * 0.5;
      }
    };
    w.sample = function (x, y, out) {
      out[0] = 0; out[1] = 0;
      const L = w.items;
      for (let i = 0; i < L.length; i++) {
        const it = L[i], dx = x - it.x, dy = y - it.y, R2 = it.r * it.r, d2 = dx * dx + dy * dy;
        if (d2 > R2 * 6) continue;
        const fade = 1 - it.age / it.life, g = Math.exp(-d2 / R2) * fade * fade;
        out[0] += it.vx * g; out[1] += it.vy * g;
        if (it.c) { out[0] += (-dy / it.r) * it.c * g; out[1] += (dx / it.r) * it.c * g; }
      }
      return out;
    };
    return w;
  };

  /* ---------- cluster impostors: each simulated agent is drawn as K followers ----------
     A pool of 64 offset patterns (unit-sphere, flattened by fy) so neighbouring clusters never repeat. */
  M.clusterPool = function (K, fy, seed) {
    const r = M.noise.rng(seed || 7), n = 64, out = new Float32Array(n * K * 4);
    for (let p = 0; p < n; p++) {
      for (let k = 0; k < K; k++) {
        let x, y, z;
        if (k === 0) { x = y = z = 0; }
        else { do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1); }
        const o = (p * K + k) * 4;
        out[o] = x; out[o + 1] = y * fy; out[o + 2] = z; out[o + 3] = r() * 6.283; // phase offset
      }
    }
    return out;
  };

  /* ---------- reusable path buffer: same API subset as Path2D, but allocated once and reset each frame ---------- */
  M.PathBuf = function () {
    const b = { a: new Float32Array(3 * 8192), n: 0 };
    function grow(k) { if (b.n + k > b.a.length) { const na = new Float32Array(Math.max(b.a.length * 2, b.n + k)); na.set(b.a); b.a = na; } }
    b.reset = function () { b.n = 0; return b; };
    b.moveTo = function (x, y) { grow(3); const a = b.a; a[b.n++] = 0; a[b.n++] = x; a[b.n++] = y; };
    b.lineTo = function (x, y) { grow(3); const a = b.a; a[b.n++] = 1; a[b.n++] = x; a[b.n++] = y; };
    b.closePath = function () { grow(3); b.a[b.n] = 2; b.n += 3; };
    b.trace = function (ctx) {
      ctx.beginPath();
      const a = b.a, n = b.n;
      for (let i = 0; i < n; i += 3) {
        const c = a[i];
        if (c === 0) ctx.moveTo(a[i + 1], a[i + 2]); else if (c === 1) ctx.lineTo(a[i + 1], a[i + 2]); else ctx.closePath();
      }
    };
    b.stroke = function (ctx) { if (b.n) { b.trace(ctx); ctx.stroke(); } };
    b.fill = function (ctx) { if (b.n) { b.trace(ctx); ctx.fill(); } };
    return b;
  };
  M.pathBufs = function (arr, n) { for (let i = 0; i < n; i++) arr[i] = arr[i] ? arr[i].reset() : M.PathBuf(); return arr; };
})();
