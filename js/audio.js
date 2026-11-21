/* Murmurations — generative Web Audio ambience (no audio files needed).
   Drop recordings at assets/audio/<scene>.mp3 (or <scene>-night.mp3), list them in assets/audio/audio.json, and they are layered in automatically. */
(function () {
  const U = M.util;
  let ac = null, master = null, cur = null, pending = null, vol = 0.7, muted = false;
  const bufs = {};
  const A = (M.audio = {});

  function makeNoise(type) {
    const sr = ac.sampleRate, len = sr * 8, X = Math.floor(sr * 0.25);
    const b = ac.createBuffer(2, len - X, sr);
    for (let ch = 0; ch < 2; ch++) {
      const raw = new Float32Array(len);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') raw[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else { last = (last + 0.02 * w) / 1.02; raw[i] = last * 3.5; }
      }
      // seamless loop: crossfade the tail into the head
      const d = b.getChannelData(ch);
      for (let k = 0; k < len - X; k++) d[k] = k < X ? raw[k] * (k / X) + raw[len - X + k] * (1 - k / X) : raw[k];
    }
    return b;
  }

  A.start = function () {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      ac = new C();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      master = ac.createGain(); master.gain.value = muted ? 0 : vol;
      master.connect(comp); comp.connect(ac.destination);
      bufs.white = makeNoise('white'); bufs.pink = makeNoise('pink'); bufs.brown = makeNoise('brown');
    }
    if (ac.state === 'suspended') ac.resume();
    if (pending) { const p = pending; pending = null; A.setScene(p.id, p.meta); }
  };
  A.started = () => !!ac;
  A.suspend = () => { if (ac && ac.state === 'running') ac.suspend(); };
  A.resume = () => { if (ac && ac.state === 'suspended') ac.resume(); };
  A.setVolume = (v) => { vol = v; if (master) master.gain.setTargetAtTime(muted ? 0 : vol, ac.currentTime, 0.1); };
  A.setMuted = (m) => { muted = m; if (master) master.gain.setTargetAtTime(muted ? 0 : vol, ac.currentTime, 0.15); };
  A.update = (st) => { if (cur && cur.update) cur.update(st || {}); };
  A.event = (name) => { if (cur && cur.event) cur.event(name); };

  /* ---- scene context with helpers ---- */
  function Ctx() {
    const c = { alive: true, srcs: [], timers: [] };
    c.bus = ac.createGain(); c.bus.gain.value = 0; c.bus.connect(master);
    c.now = () => ac.currentTime;
    c.gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
    c.filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
    c.pan = (p) => { if (ac.createStereoPanner) { const s = ac.createStereoPanner(); s.pan.value = p; return s; } return c.gain(1); };
    c.noise = (type) => { const s = ac.createBufferSource(); s.buffer = bufs[type]; s.loop = true; s.start(0, Math.random() * 7); c.srcs.push(s); return s; };
    c.chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
    c.lfo = (freq, depth, param) => { const o = ac.createOscillator(); o.frequency.value = freq; const g = c.gain(depth); o.connect(g); g.connect(param); o.start(); c.srcs.push(o); return o; };
    c.osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(); c.srcs.push(o); return o; };
    c.every = (min, max, fn, scale) => {
      const tick = () => {
        if (!c.alive) return;
        if (ac.state === 'running') fn();
        const sc = scale ? scale() : 1;
        c.timers.push(setTimeout(tick, U.rand(min, max) * 1000 * sc));
      };
      c.timers.push(setTimeout(tick, U.rand(min, max) * 1000));
    };
    // one-shot voices
    c.chirp = (f0, f1, dur, g, pan, at, dest) => {
      const t0 = ac.currentTime + (at || 0) + 0.01;
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const e = ac.createGain(); e.gain.setValueAtTime(0.0001, t0);
      e.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.012, dur * 0.3)); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(e); e.connect(c.pan(pan || 0)).connect(dest || c.bus);
      o.start(t0); o.stop(t0 + dur + 0.05);
    };
    c.warble = (f, dur, g, pan, at) => {
      const t0 = ac.currentTime + (at || 0) + 0.01;
      const o = ac.createOscillator(); o.frequency.value = f;
      const v = ac.createOscillator(); v.frequency.value = U.rand(28, 45); const vg = c.gain(f * 0.07); v.connect(vg); vg.connect(o.frequency);
      const e = ac.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g, t0 + 0.03); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(e); e.connect(c.pan(pan || 0)).connect(c.bus);
      o.start(t0); v.start(t0); o.stop(t0 + dur + 0.05); v.stop(t0 + dur + 0.05);
    };
    c.click = (f, dur, g, pan, at, q) => {
      const t0 = ac.currentTime + (at || 0) + 0.005;
      const s = ac.createBufferSource(); s.buffer = bufs.white;
      const bp = c.filt('bandpass', f, q || 1.2);
      const e = ac.createGain(); e.gain.setValueAtTime(g, t0); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(bp); bp.connect(e); e.connect(c.pan(pan || 0)).connect(c.bus);
      s.start(t0, Math.random() * 7); s.stop(t0 + dur + 0.02);
    };
    c.bubble = (at) => {
      const t0 = ac.currentTime + (at || 0) + 0.01, f0 = U.rand(320, 1100), d = U.rand(0.04, 0.12);
      const o = ac.createOscillator(); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * U.rand(1.8, 2.7), t0 + d);
      const e = ac.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(U.rand(0.02, 0.06), t0 + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(e); e.connect(c.pan(U.rand(-0.7, 0.7))).connect(c.bus); o.start(t0); o.stop(t0 + d + 0.03);
    };
    c.crickets = (g) => {
      const f = U.rand(4300, 4900), pan = U.rand(-0.8, 0.8), pulses = U.randInt(3, 5);
      for (let k = 0; k < pulses; k++) c.chirp(f, f * 0.99, 0.022, g, pan, k * 0.048);
    };
    c.stop = () => {
      c.alive = false; c.timers.forEach(clearTimeout);
      c.bus.gain.setTargetAtTime(0, ac.currentTime, 0.6);
      setTimeout(() => { c.srcs.forEach((s) => { try { s.stop(); } catch (e) {} }); try { c.bus.disconnect(); } catch (e) {} }, 3500);
    };
    return c;
  }

  const BUILD = {
    starlings(c) {
      let ag = 0;
      const bed = c.gain(1); bed.connect(c.bus);
      const g1 = c.gain(0.45); c.chain(c.noise('brown'), c.filt('lowpass', 420), g1, bed); c.lfo(0.07, 0.15, g1.gain);
      const g2 = c.gain(0.02); c.chain(c.noise('pink'), c.filt('highpass', 2800), g2, bed); c.lfo(0.23, 0.012, g2.gain);
      const whoosh = c.gain(0); c.chain(c.noise('pink'), c.filt('bandpass', 750, 0.7), whoosh, c.bus);
      c.every(0.15, 1.2, () => {
        const p = U.rand(-0.85, 0.85), r = Math.random(), g = U.rand(0.006, 0.022) * (1 + ag * 2);
        if (r < 0.45) c.chirp(U.rand(2200, 3600), U.rand(3000, 5400), U.rand(0.06, 0.16), g, p);
        else if (r < 0.75) { for (let k = 0; k < 3; k++) c.click(U.rand(2500, 5000), 0.005, g * 1.4, p, k * 0.035, 3); }
        else c.warble(U.rand(2800, 3800), U.rand(0.15, 0.3), g * 0.8, p);
      }, () => 1.3 - ag * 0.9);
      return { bed, update(st) { ag = st.ag || 0; whoosh.gain.setTargetAtTime(0.008 + ag * 0.32, c.now(), 0.25); } };
    },
    locusts(c) {
      let ag = 0;
      const bed = c.gain(1); bed.connect(c.bus);
      const w = c.gain(0.3); c.chain(c.noise('brown'), c.filt('lowpass', 650), w, bed); c.lfo(0.06, 0.12, w.gain);
      const swarm = c.gain(0.16); swarm.connect(c.bus);
      const am1 = c.gain(0.5); c.chain(c.noise('white'), c.filt('bandpass', 2400, 0.9), am1, swarm); c.lfo(21, 0.42, am1.gain);
      const am2 = c.gain(0.32); c.chain(c.noise('white'), c.filt('bandpass', 4800, 1.4), am2, swarm); c.lfo(29, 0.28, am2.gain);
      const hum = c.gain(0.03); const lp = c.filt('lowpass', 380); lp.connect(hum); hum.connect(swarm);
      [118, 126, 133].forEach((f) => { const o = c.osc('sawtooth', f); c.lfo(U.rand(0.2, 0.5), 3, o.frequency); o.connect(lp); });
      c.every(0.02, 0.1, () => c.click(U.rand(1500, 4200), 0.003, U.rand(0.008, 0.03) * (1 + ag), U.rand(-0.9, 0.9), 0, 2));
      c.every(0.5, 1.8, () => c.crickets(0.01));
      return { bed, update(st) { ag = st.ag || 0; const fly = st.fly == null ? 1 : st.fly; swarm.gain.setTargetAtTime((0.15 + ag * 0.3) * (0.06 + 0.94 * fly), c.now(), 0.6); } };
    },
    fish(c) {
      let ag = 0;
      const bed = c.gain(1); bed.connect(c.bus);
      c.chain(c.noise('brown'), c.filt('lowpass', 240), c.gain(0.7), bed);
      const sw = c.gain(0.16); c.chain(c.noise('pink'), c.filt('lowpass', 520), sw, bed); c.lfo(0.07, 0.1, sw.gain);
      c.chain(c.noise('white'), c.filt('bandpass', 1400, 0.4), c.gain(0.012), bed);
      const swoosh = c.gain(0); c.chain(c.noise('brown'), c.filt('lowpass', 520), swoosh, c.bus);
      c.every(0.8, 4.5, () => { const n = U.randInt(1, 4); for (let k = 0; k < n; k++) c.bubble(k * U.rand(0.05, 0.15)); }, () => 1 - ag * 0.6);
      return {
        bed,
        update(st) { ag = st.ag || 0; swoosh.gain.setTargetAtTime(ag * 0.45, c.now(), 0.25); },
        event(name) { if (name === 'bubbles') for (let k = 0; k < 12; k++) c.bubble(k * U.rand(0.02, 0.07)); },
      };
    },
    smoke(c, meta) {
      let ag = 0;
      const night = !!meta.night;
      const bed = c.gain(1); bed.connect(c.bus);
      const br = c.gain(0.08); c.chain(c.noise('pink'), c.filt('lowpass', 950), br, bed); c.lfo(0.11, 0.05, br.gain);
      const ru = c.gain(0.008); c.chain(c.noise('white'), c.filt('highpass', 3200), ru, bed); c.lfo(0.31, 0.007, ru.gain);
      c.chain(c.noise('white'), c.filt('bandpass', 6500, 0.7), c.gain(0.004), bed);
      const gust = c.gain(0); c.chain(c.noise('pink'), c.filt('bandpass', 600, 0.6), gust, c.bus);
      c.every(0.04, 0.45, () => {
        if (Math.random() < 0.86) c.click(U.rand(1800, 6000), U.rand(0.002, 0.008), U.rand(0.01, 0.045) * (night ? 1.2 : 0.8), U.rand(-0.2, 0.5), 0, 1.5);
        else c.click(U.rand(500, 1200), 0.016, 0.08, U.rand(-0.1, 0.4), 0, 1);
      });
      if (night) c.every(0.25, 0.9, () => c.crickets(0.012));
      else c.every(3, 9, () => {
        let at = 0; const n = U.randInt(4, 9), p = U.rand(-0.9, 0.9);
        for (let k = 0; k < n; k++) { const f = U.rand(2400, 5600), d = U.rand(0.05, 0.16); c.chirp(f, f * U.rand(0.8, 1.25), d, U.rand(0.006, 0.014), p, at); at += d + U.rand(0.02, 0.09); }
      });
      return { bed, update(st) { ag = st.ag || 0; gust.gain.setTargetAtTime(ag * 0.35, c.now(), 0.2); } };
    },
    clouds(c) {
      let ag = 0;
      const bed = c.gain(1); bed.connect(c.bus);
      const w = c.gain(0.16); c.chain(c.noise('pink'), c.filt('bandpass', 420, 0.35), w, bed); c.lfo(0.045, 0.08, w.gain);
      c.chain(c.noise('white'), c.filt('bandpass', 2400, 0.5), c.gain(0.005), bed);
      const gr = c.gain(0.006); c.chain(c.noise('white'), c.filt('highpass', 2500), gr, bed); c.lfo(0.2, 0.005, gr.gain);
      const gust = c.gain(0); c.chain(c.noise('pink'), c.filt('bandpass', 850, 0.5), gust, c.bus);
      c.every(7, 18, () => { // skylark song high overhead
        const dur = U.rand(2, 4.5), p = U.rand(-0.6, 0.6); let at = 0;
        while (at < dur) { const f = U.rand(3200, 6200), d = U.rand(0.03, 0.07); c.chirp(f, f * U.rand(0.85, 1.2), d, 0.006, p, at); at += d + U.rand(0.005, 0.03); }
      });
      return { bed, update(st) { ag = st.ag || 0; gust.gain.setTargetAtTime(ag * 0.4, c.now(), 0.2); } };
    },
  };

  A.setScene = function (id, meta) {
    if (!ac) { pending = { id, meta }; return; }
    if (cur) cur.ctx.stop();
    const c = Ctx();
    const api = BUILD[id](c, meta || {});
    c.bus.gain.setTargetAtTime(1, ac.currentTime + 0.3, 0.9);
    cur = { ctx: c, update: api.update, event: api.event };
    // optional recorded ambience
    const name = id + (meta && meta.night ? '-night' : '') + '.mp3';
    if (location.protocol.startsWith('http')) {
      fetch('assets/audio/audio.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : []))
        .then((list) => (Array.isArray(list) && list.includes(name) ? fetch('assets/audio/' + name) : null))
        .then((r) => (r && r.ok ? r.arrayBuffer() : null)).then((ab) => (ab ? ac.decodeAudioData(ab) : null)).then((buf) => {
        if (!buf || !c.alive) return;
        const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(c.bus); s.start(); c.srcs.push(s);
        api.bed.gain.setTargetAtTime(0.3, ac.currentTime, 1);
      }).catch(() => {});
    }
  };
})();
