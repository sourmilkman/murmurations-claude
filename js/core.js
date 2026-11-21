/* Murmurations — shared utilities, procedural sprites, 3D flocking engine */
(function () {
  const M = (window.M = window.M || {});
  M.VERSION = '0.1.0';
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
            const w = fbm(nx * 1.5 + ox, ny * 1.5 + oy, seed, 3);
            const q = fbm(nx * 2.4 + w * 1.6 + ox, ny * 2.4 + w * 1.6 - oy, seed + 5.3, 4);
            const fall = Math.pow(1 - r, 1.25);
            v = U.clamp(fall * (0.15 + 1.5 * (q * 0.5 + 0.5)) * 1.35 - 0.1, 0, 1);
          } else if (kind === 'cloud') {
            const q = fbm(nx * 2.1 + ox, ny * 2.1 + oy, seed, 4);
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
    ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'fear', 'turn', 'phase', 'sx', 'sy', 'sc', 'hx', 'hy'].forEach((k) => (f[k] = new Float32Array(cap)));
    const TB = 8192, head = new Int32Array(TB), next = new Int32Array(cap);
    const OX = [0, -1, 1, 0, 0, -1, -1, 1, 1], OY = [0, 0, 0, -1, 1, -1, 1, -1, 1];
    const hash = (ix, iy) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663)) & (TB - 1);
    f.add = function (x, y, z, vx, vy, vz) {
      if (f.n >= cap) return;
      const i = f.n++;
      f.px[i] = x; f.py[i] = y; f.pz[i] = z; f.vx[i] = vx; f.vy[i] = vy; f.vz[i] = vz;
      f.fear[i] = 0; f.turn[i] = 0; f.phase[i] = Math.random() * 6.283; f.sx[i] = -1e5; f.sy[i] = -1e5; f.sc[i] = 1;
      const l = Math.hypot(vx, vy) || 1; f.hx[i] = vx / l; f.hy[i] = vy / l;
    };
    f.grow = function (target, spread) {
      if (target < f.n) { f.n = Math.max(0, target); return; }
      while (f.n < target && f.n > 0) {
        const j = (Math.random() * f.n) | 0;
        f.add(f.px[j] + U.gauss() * spread, f.py[j] + U.gauss() * spread, f.pz[j] + U.gauss() * spread, f.vx[j], f.vy[j], f.vz[j]);
      }
    };
    f.project = function (cx, cy, F, unit) {
      const { px, py, pz, sx, sy, sc } = f;
      for (let i = 0; i < f.n; i++) {
        const s = F / (F + pz[i]);
        sc[i] = s; sx[i] = cx + px[i] * s * unit; sy[i] = cy + py[i] * s * unit;
      }
    };
    f.step = function (dt, P) {
      const n = f.n, { px, py, pz, vx, vy, vz, fear, turn, phase, sx, sy, sc, hx, hy } = f;
      const inv = 1 / P.r;
      head.fill(-1);
      for (let i = 0; i < n; i++) { const h = hash(Math.floor(px[i] * inv), Math.floor(py[i] * inv)); next[i] = head[h]; head[h] = i; }
      const r2 = P.r * P.r, s2 = P.sep * P.sep, T = P.target;
      const decay = Math.pow(P.fearDecay, dt * 60);
      const preds = P.predators, np = preds.length;
      let fearSum = 0, turnSum = 0;
      for (let i = 0; i < n; i++) {
        const x = px[i], y = py[i], z = pz[i];
        const ix = Math.floor(x * inv), iy = Math.floor(y * inv);
        let cnt = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, ssx = 0, ssy = 0, ssz = 0, fm = 0, seen = 0;
        // own cell first, then the ring — so the nearest birds are found before the cap is hit
        outer: for (let o = 0; o < 9; o++) {
          let j = head[hash(ix + OX[o], iy + OY[o])];
          while (j >= 0) {
            if (j !== i) {
              const dx = px[j] - x, dy = py[j] - y, dz = pz[j] - z;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < r2) {
                if (cnt < P.maxN) { cnt++; ax += vx[j]; ay += vy[j]; az += vz[j]; cx += dx; cy += dy; cz += dz; }
                if (d2 < s2) { const q = 1 / (d2 + 0.5); ssx -= dx * q; ssy -= dy * q; ssz -= dz * q; }
                if (fear[j] > fm) fm = fear[j];
                if (++seen >= 48) break outer;
              }
            }
            j = next[j];
          }
        }
        let fx = 0, fy = 0, fz = 0;
        const fr = fear[i];
        if (cnt) {
          const wa = P.wAli * (1 + fr * P.fearAli), wc = P.wCoh * (1 + fr * 0.5);
          fx += (ax / cnt - vx[i]) * wa; fy += (ay / cnt - vy[i]) * wa; fz += (az / cnt - vz[i]) * wa;
          fx += (cx / cnt) * wc; fy += (cy / cnt) * wc; fz += (cz / cnt) * wc;
        }
        fx += ssx * P.wSep; fy += ssy * P.wSep; fz += ssz * P.wSep;
        // soft ellipsoidal home range
        const ex = (x - T.x) / T.rx, ey = (y - T.y) / T.ry, ez = (z - T.z) / T.rz;
        const ed = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (ed > 1) {
          const dx = T.x - x, dy = T.y - y, dz = T.z - z, dl = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
          const k = Math.min(ed - 1, 3) * P.contain;
          fx += (dx / dl) * k; fy += (dy / dl) * k; fz += (dz / dl) * k;
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
        // integrate
        let nvx = vx[i] + fx * dt, nvy = vy[i] + fy * dt, nvz = vz[i] + fz * dt;
        const sp = Math.sqrt(nvx * nvx + nvy * nvy + nvz * nvz) + 1e-6;
        const vmax = P.vmax * (1 + nf * P.fearBoost), vmin = P.vmin;
        if (sp > vmax) { const k = vmax / sp; nvx *= k; nvy *= k; nvz *= k; }
        else if (sp < vmin) { const k = vmin / sp; nvx *= k; nvy *= k; nvz *= k; }
        vx[i] = nvx; vy[i] = nvy; vz[i] = nvz;
        px[i] = x + nvx * dt; py[i] = y + nvy * dt; pz[i] = z + nvz * dt;
        // angular velocity (banking makes birds / fish look darker / flash)
        const hl = Math.sqrt(nvx * nvx + nvy * nvy) + 1e-6, nhx = nvx / hl, nhy = nvy / hl;
        const cr = Math.abs(hx[i] * nhy - hy[i] * nhx) / Math.max(dt, 1e-3);
        turn[i] = turn[i] * 0.9 + Math.min(cr, 6) * 0.1;
        hx[i] = nhx; hy[i] = nhy;
        phase[i] += dt * P.flap * (1 + nf * 0.8 + (Math.random() - 0.5) * 0.2);
        fearSum += nf; turnSum += turn[i];
      }
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
})();
