(() => {
  'use strict';
  const C = window.COPY;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI, TAU = PI * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const stage = $('#stage'), world = $('#world');
  let SH = 844, SCALE = 1;
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  /* ============================== core: springs + loop ============================== */
  class Spring {
    constructor(v = 0, k = 170, c = 20) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
    step(dt) {
      const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
      for (let i = 0; i < n; i++) { const a = -this.k * (this.v - this.t) - this.c * this.vel; this.vel += a * h; this.v += this.vel * h; }
    }
    set(v) { this.v = this.t = v; this.vel = 0; }
  }
  const springs = new Set();
  const spring = (v, k, c) => { const s = new Spring(v, k, c); springs.add(s); return s; };
  const tickers = new Set();
  const onTick = f => { tickers.add(f); return () => tickers.delete(f); };
  let last = performance.now(), T = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    springs.forEach(s => s.step(dt));
    tickers.forEach(f => { if (f(dt, T) === false) tickers.delete(f); });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  let timers = [];
  const later = (ms, f) => { const id = setTimeout(f, ms); timers.push(id); return id; };
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  /* ============================== layout ============================== */
  const layoutFns = [];
  function layout() {
    const W = innerWidth, H = innerHeight;
    if (H / W >= 1.5) { SCALE = W / 390; SH = Math.round(H / SCALE); }
    else { SCALE = Math.min(H / 844, W / 390); SH = 844; }
    stage.style.height = SH + 'px';
    stage.style.transform = `translate(-50%,-50%) scale(${SCALE})`;
    dlayer.setAttribute('viewBox', `0 0 390 ${SH}`);
    layoutFns.forEach(f => f());
  }
  const toStage = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE }; };
  // position of an element relative to its scene (ignores transforms)
  function pos(el) {
    let x = 0, y = 0, n = el;
    while (n && !n.classList.contains('scene')) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
  }
  function makeCanvas(parent) {
    const cv = document.createElement('canvas'); cv.className = 'fx'; parent.appendChild(cv);
    const ctx = cv.getContext('2d');
    const fit = () => { cv.width = Math.round(390 * SCALE * DPR); cv.height = Math.round(SH * SCALE * DPR); ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0); };
    layoutFns.push(fit);
    return { cv, ctx, fit };
  }

  /* ============================== sound ============================== */
  const SFX = ['meow1','meow2','meow3','meow4','meow5','meowangry','purr','bee','bugrun','buzz','buzzq','buglaugh','cricket','pop','bubble','pops','boing',
    'whoosh','whoosh2','sparkle','dham','dhamdrum','zoomhit','thunder','page','paperslide','horn','cheer','blow','stomp','kiss','click','badumtss','ding',
    'pspsps','psst','pingpong','pingdrop','growl','cassette','stamp'];
  const buf = {}, pend = {};
  let actx = null, master = null, muted = false;
  function unlock() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return false; }
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
    SFX.forEach(n => {
      pend[n] = fetch(`assets/v2/sfx/${n}.mp3`).then(r => r.arrayBuffer())
        .then(a => new Promise((res, rej) => actx.decodeAudioData(a, res, rej))).then(b => { buf[n] = b; }).catch(() => {});
    });
    return true;
  }
  function sfx(n, o = {}) {
    if (!actx || muted) return;
    const go = () => {
      const b = buf[n]; if (!b || muted) return;
      const s = actx.createBufferSource(); s.buffer = b;
      s.playbackRate.value = (o.rate || 1) * (1 + (o.jit || 0) * (Math.random() * 2 - 1));
      const g = actx.createGain(); g.gain.value = o.vol == null ? 1 : o.vol;
      s.connect(g); g.connect(master); s.start(actx.currentTime + (o.delay || 0));
    };
    if (buf[n]) go(); else if (pend[n]) pend[n].then(go);
  }
  const meow = (vol = 0.9) => sfx(pick(['meow1', 'meow2', 'meow3', 'meow4', 'meow5']), { vol, jit: 0.08 });

  /* ============================== shake ============================== */
  const shX = spring(0, 900, 18), shY = spring(0, 900, 18);
  function shake(a) { shX.vel += rand(-1, 1) * a * 60; shY.vel += rand(-1, 1) * a * 60; }
  onTick(() => { world.style.transform = `translate3d(${shX.v}px,${shY.v}px,0)`; });

  /* ============================== doodles (spidey-edit scribbles) ============================== */
  const dlayer = document.createElementNS(NS, 'svg');
  dlayer.setAttribute('class', 'doodles');
  Object.assign(dlayer.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: 90, overflow: 'visible' });
  stage.insertBefore(dlayer, $('.ui'));
  const doodles = new Set();
  const smooth = pts => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      d += ` Q${x.toFixed(1)} ${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)} ${((y + ny) / 2).toFixed(1)}`;
    }
    const l = pts[pts.length - 1]; return d + ` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
  };
  const poly = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  const SHAPES = {
    circle: o => { const pts = [], n = 36, turns = o.turns || 1.2, a0 = rand(0, TAU);
      for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * turns * TAU, r = 1 + (i / n) * 0.1; pts.push([o.x + Math.cos(a) * o.rx * r, o.y + Math.sin(a) * o.ry * r]); }
      return [{ pts }]; },
    star: o => { const pts = []; const a0 = rand(-0.2, 0.2);
      for (let i = 0; i <= 10; i++) { const a = a0 - PI / 2 + (i * PI) / 5, r = i % 2 ? o.r * 0.45 : o.r; pts.push([o.x + Math.cos(a) * r, o.y + Math.sin(a) * r]); }
      return [{ pts, sharp: 1 }]; },
    sparkle: o => { const r = o.r, x = o.x, y = o.y, q = r * 0.18;
      return [{ pts: [[x, y - r], [x + q, y - q], [x + r, y], [x + q, y + q], [x, y + r], [x - q, y + q], [x - r, y], [x - q, y - q], [x, y - r]], sharp: 1 }]; },
    heart: o => { const pts = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * TAU; const hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([o.x + hx * o.r / 16, o.y - hy * o.r / 16]); } return [{ pts }]; },
    burst: o => { const out = [], n = o.n || 9, a0 = rand(0, TAU);
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU + rand(-0.15, 0.15); const r1 = o.r * rand(0.9, 1.1), r2 = o.r * rand(1.45, 1.8);
        out.push({ pts: [[o.x + Math.cos(a) * r1, o.y + Math.sin(a) * r1], [o.x + Math.cos(a) * r2, o.y + Math.sin(a) * r2]], sharp: 1 }); } return out; },
    arrow: o => { const { x1, y1, x2, y2 } = o, bend = o.bend == null ? 0.3 : o.bend; const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
      const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2]); }
      const a = Math.atan2(y2 - pts[12][1], x2 - pts[12][0]), h = o.head || 14;
      return [{ pts }, { pts: [[x2 - Math.cos(a - 0.5) * h, y2 - Math.sin(a - 0.5) * h], [x2, y2], [x2 - Math.cos(a + 0.5) * h, y2 - Math.sin(a + 0.5) * h]], sharp: 1 }]; },
    zig: o => { const pts = []; const n = Math.max(4, Math.round(o.len / 14)); for (let i = 0; i <= n; i++) pts.push([o.x + (i / n) * o.len, o.y + (i % 2 ? -o.h : o.h)]); return [{ pts, sharp: 1 }]; },
    under: o => { const pts = []; for (let i = 0; i <= 10; i++) pts.push([o.x + (i / 10) * o.len, o.y + Math.sin(i * 0.9) * 2]); const p2 = []; for (let i = 0; i <= 10; i++) p2.push([o.x + 8 + (i / 10) * (o.len - 16), o.y + 7 + Math.sin(i * 0.7) * 2]); return [{ pts }, { pts: p2 }]; },
    bang: o => { const h = o.h || 34; return [0, 1].map(k => ({ pts: [[o.x + k * 16, o.y - h], [o.x + k * 16 + 3, o.y - 8]], sharp: 1 })).concat([0, 1].map(k => ({ pts: [[o.x + k * 16 + 3, o.y + 2], [o.x + k * 16 + 4, o.y + 4]], sharp: 1 }))); },
    spiral: o => { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU * 2.6, r = o.r * t; pts.push([o.x + Math.cos(a) * r, o.y + Math.sin(a) * r]); } return [{ pts }]; },
    rays: o => { const out = []; for (let i = 0; i < 3; i++) { const a = o.a + (i - 1) * 0.45; out.push({ pts: [[o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r], [o.x + Math.cos(a) * (o.r + 16), o.y + Math.sin(a) * (o.r + 16)]], sharp: 1 }); } return out; },
  };
  function doodle(type, o) {
    o = Object.assign({ c: '#fff', w: 3.4, j: 1.8, dur: 0.38, life: 1.6, delay: 0 }, o);
    const g = document.createElementNS(NS, 'g'); dlayer.appendChild(g);
    const strokes = SHAPES[type](o).map((st, i) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('pathLength', '1'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', o.c); p.setAttribute('stroke-width', o.w);
      p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      p.style.strokeDasharray = '1 1'; p.style.strokeDashoffset = '1';
      if (o.glow) p.style.filter = `drop-shadow(0 0 3px ${o.glow})`;
      g.appendChild(p);
      const gen = st.sharp ? poly : smooth;
      const vars = [0, 1, 2].map(() => gen(st.pts.map(([x, y]) => [x + rand(-o.j, o.j), y + rand(-o.j, o.j)])));
      p.setAttribute('d', vars[0]);
      return { p, vars, off: i * 0.07 };
    });
    const d = { g, strokes, t: -o.delay, o, frame: 0, ft: 0, out: -1 };
    doodles.add(d); return d;
  }
  function clearDoodles() { doodles.forEach(d => { if (d.out < 0) d.out = 0; }); }
  onTick(dt => {
    doodles.forEach(d => {
      d.t += dt; if (d.t < 0) return;
      d.ft += dt;
      if (d.ft > 0.1) { d.ft = 0; d.frame = (d.frame + 1) % 3; d.strokes.forEach(s => s.p.setAttribute('d', s.vars[d.frame])); }
      if (d.out < 0 && d.o.life > 0 && d.t > d.o.dur + d.o.life) d.out = 0;
      if (d.out >= 0) {
        d.out += dt / 0.28;
        d.strokes.forEach(s => { s.p.style.strokeDashoffset = (-Math.min(1, d.out)).toFixed(3); });
        if (d.out >= 1) { d.g.remove(); doodles.delete(d); }
      } else {
        d.strokes.forEach(s => { const k = clamp((d.t - s.off) / d.o.dur, 0, 1); s.p.style.strokeDashoffset = (1 - easeOut(k)).toFixed(3); });
      }
    });
  });
  const tapDoodle = (x, y, c) => {
    const t = pick(['sparkle', 'star', 'burst', 'sparkle']);
    if (t === 'burst') doodle('burst', { x, y, r: 12, c, w: 3, life: 0.35, n: 7 });
    else doodle(t, { x, y, r: rand(11, 17), c, w: 3, life: 0.4 });
  };

  /* ============================== scenes ============================== */
  const scenes = [];
  let cur = -1;
  function addScene(def) {
    const el = document.createElement('section');
    el.className = 'scene ' + def.cls; el.innerHTML = def.html();
    world.appendChild(el);
    const s = Object.assign({ el, sp: spring(1, 130, 19), ready: false, dc: '#fff' }, def);
    s.sp.set(1);
    if (s.init) s.init();
    if (s.layout) layoutFns.push(() => s.layout());
    scenes.push(s); return s;
  }
  // ui
  const nextBtn = $('#next'), dotsEl = $('#dots');
  nextBtn.textContent = C.next;
  const nextSp = spring(0, 260, 20);
  onTick(() => { nextBtn.style.transform = `translate(-50%,${(1 - nextSp.v) * 140}%)`; nextBtn.style.opacity = clamp(nextSp.v, 0, 1); nextBtn.style.pointerEvents = nextSp.t > 0.5 ? 'auto' : 'none'; });
  function ready() { const s = scenes[cur]; if (!s || s.ready) return; s.ready = true; if (cur < scenes.length - 1) { nextSp.t = 1; } }
  nextBtn.addEventListener('click', e => { e.stopPropagation(); sfx('pingpong', { vol: 0.7, jit: 0.1 }); go(cur + 1); });

  function go(n) {
    if (n < 0 || n >= scenes.length || n === cur) return;
    const dir = n > cur ? 1 : -1, prev = scenes[cur];
    timers.forEach(clearTimeout); timers = []; clearDoodles();
    if (prev) { prev.sp.t = -dir; if (prev.leave) prev.leave(); sfx('whoosh', { vol: 0.45, jit: 0.1 }); }
    const s = scenes[n]; cur = n;
    s.sp.set(prev ? dir : 0); s.sp.t = 0; s.el.style.visibility = 'visible'; s.ready = false; nextSp.t = 0;
    document.body.style.backgroundColor = s.bg;
    stage.style.setProperty('--ui', s.ui || '#16141c'); stage.style.setProperty('--uibg', s.uibg || '#fff');
    $$('i', dotsEl).forEach((d, i) => d.classList.toggle('on', i === n));
    mascotShow(s.mascot !== false);
    if (s.enter) s.enter();
  }
  onTick((dt) => {
    scenes.forEach(s => {
      const p = s.sp.v, active = s === scenes[cur];
      if (!active && Math.abs(p) > 0.995) { if (s.el.style.visibility !== 'hidden') s.el.style.visibility = 'hidden'; return; }
      s.el.style.transform = `translate3d(0,${(p * 100).toFixed(3)}%,0) scale(${(1 - Math.min(0.1, Math.abs(p) * 0.1)).toFixed(4)}) rotate(${(p * 3).toFixed(3)}deg)`;
      s.el.style.opacity = p < 0 ? Math.max(0, 1 + p * 1.7) : 1;
      s.el.style.zIndex = active ? 2 : 1;
      if (s.update) s.update(dt);
    });
  });

  // global input: unlock audio, swipe, tap doodles
  let down = null, firstTap = true;
  stage.addEventListener('pointerdown', e => {
    const fresh = unlock();
    if (firstTap) { firstTap = false; if (cur === 0) { sfx('pspsps', { vol: 1 }); scenes[0].perk && scenes[0].perk(); } }
    const p = toStage(e); down = { ...p, t: performance.now() };
    if (!e.target.closest('.ui')) {
      tapDoodle(p.x, p.y, scenes[cur] ? scenes[cur].dc : '#fff');
      if (!e.target.closest('button,.s0-cat,.s4-bug,.s8-candle,.s7-card,.s3-frame,.s5-story') && cur !== 1) sfx('pingpong', { vol: 0.35, jit: 0.25 });
    }
    void fresh;
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return; const p = toStage(e), dx = p.x - down.x, dy = p.y - down.y, dtm = performance.now() - down.t; down = null;
    if (dtm < 600 && Math.abs(dx) > 90 && Math.abs(dy) < 70 && cur !== 1) { if (dx < 0 && scenes[cur].ready) go(cur + 1); else if (dx > 0) go(cur - 1); }
  });
  addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });

  // sound toggle
  const sndBtn = $('#snd');
  sndBtn.addEventListener('click', e => { e.stopPropagation(); unlock(); muted = !muted; sndBtn.textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : 0.9; });

  // mascot
  const mascot = $('#mascot'), bubble = $('#bubble');
  const mY = spring(1, 160, 16), mSq = spring(0, 420, 14), bubSp = spring(0, 300, 18);
  let mLine = -1, bubT = 0;
  function mascotShow(b) { mY.t = b ? 0 : 1; if (!b) bubSp.t = 0; }
  mascot.addEventListener('click', e => {
    e.stopPropagation(); unlock();
    mLine = (mLine + 1) % C.mascot.length; bubble.textContent = C.mascot[mLine];
    if (mLine === 0) sfx('pspsps'); else meow();
    sfx('boing', { vol: 0.35, jit: 0.2 });
    mSq.vel += 9; bubSp.t = 1; bubT = 2.8;
    const r = { x: 390 - 52, y: SH - 90 };
    doodle('rays', { x: r.x, y: r.y, r: 46, a: -PI * 0.75, c: scenes[cur].dc, life: 0.5 });
  });
  onTick(dt => {
    const sq = mSq.v * 0.06;
    mascot.style.transform = `translateY(${(mY.v * 120).toFixed(1)}%) scale(${(1 - sq).toFixed(3)},${(1 + sq).toFixed(3)}) rotate(${(Math.sin(T * 1.7) * 2 + mSq.v * 3).toFixed(2)}deg)`;
    if (bubT > 0) { bubT -= dt; if (bubT <= 0) bubSp.t = 0; }
    bubble.style.opacity = clamp(bubSp.v, 0, 1); bubble.style.transform = `scale(${(0.6 + bubSp.v * 0.4).toFixed(3)})`;
  });

  /* ============================== bug swarm ============================== */
  const BUGSPR = [
    { s: 'pd029', f: 0, z: 15 }, { s: 'cbug014', f: -PI / 2, z: 20 }, { s: 'pd036', f: -PI / 2, z: 18 },
    { s: 'cbug012', f: -PI / 2, z: 20 }, { s: 'cbug004', f: -PI / 2, z: 21 }, { s: 'cbug005', f: PI, z: 17 },
  ];
  BUGSPR.forEach(b => {
    const img = new Image(); img.src = `assets/v2/cut/${b.s}.webp`;
    img.onload = () => {
      const k = Math.max(img.width, img.height); b.w = b.z * img.width / k; b.h = b.z * img.height / k;
      const off = document.createElement('canvas'); off.width = Math.ceil(b.w * 3); off.height = Math.ceil(b.h * 3);
      off.getContext('2d').drawImage(img, 0, 0, off.width, off.height); b.c = off;
    };
  });
  class Swarm {
    constructor(ctx) { this.ctx = ctx; this.bugs = []; this.mode = 'swarm'; this.ptr = { x: 0, y: 0, down: false }; this.max = 210; }
    spawn(n) {
      this.bugs = [];
      for (let i = 0; i < n; i++) {
        const side = (Math.random() * 4) | 0, sp = BUGSPR[i % BUGSPR.length];
        const x = side === 0 ? -30 : side === 1 ? 420 : rand(0, 390), y = side === 2 ? -30 : side === 3 ? SH + 30 : rand(0, SH);
        this.bugs.push({ x, y, vx: rand(-60, 60), vy: rand(-60, 60), h: rand(0, TAU), wa: rand(0, TAU), wob: rand(0, 9), sp, tx: null, ty: null, free: 0, rest: rand(0, TAU) });
      }
    }
    setTargets(pts) { this.bugs.forEach((b, i) => { const p = pts[i % pts.length]; b.tx = p[0]; b.ty = p[1]; }); this.mode = 'form'; }
    formed() { if (this.mode !== 'form') return 0; let k = 0; this.bugs.forEach(b => { if (Math.hypot(b.tx - b.x, b.ty - b.y) < 5) k++; }); return k / this.bugs.length; }
    update(dt) {
      const B = this.bugs, P = this.ptr, MAX = this.max;
      for (let i = 0; i < B.length; i++) {
        const b = B[i]; let ax = 0, ay = 0;
        b.wa += rand(-1, 1) * dt * 7;
        const seeking = this.mode === 'form' && b.tx != null && T > b.free;
        let wanderK = 1;
        if (seeking) {
          const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1, sp = d < 70 ? MAX * d / 70 : MAX;
          ax += (dx / d * sp - b.vx) * 5; ay += (dy / d * sp - b.vy) * 5; wanderK = Math.min(1, d / 60);
        } else {
          let sx = 0, sy = 0, axv = 0, ayv = 0, cx = 0, cy = 0, n = 0;
          for (let j = 0; j < B.length; j++) {
            if (i === j) continue; const o = B[j], dx = b.x - o.x, dy = b.y - o.y, d2 = dx * dx + dy * dy;
            if (d2 < 3600) { n++; axv += o.vx; ayv += o.vy; cx += o.x; cy += o.y; if (d2 < 400) { const d = Math.sqrt(d2) || 1; sx += dx / d * (20 - d); sy += dy / d * (20 - d); } }
          }
          ax += sx * 22; ay += sy * 22;
          if (n) { ax += (axv / n - b.vx) * 1.2; ay += (ayv / n - b.vy) * 1.2; ax += (cx / n - b.x) * 0.9; ay += (cy / n - b.y) * 0.9; }
          const m = 50; if (b.x < m) ax += (m - b.x) * 9; if (b.x > 390 - m) ax -= (b.x - 390 + m) * 9; if (b.y < m) ay += (m - b.y) * 9; if (b.y > SH - m) ay -= (b.y - SH + m) * 9;
        }
        ax += Math.cos(b.wa) * 90 * wanderK; ay += Math.sin(b.wa) * 90 * wanderK;
        if (P.down) { const dx = b.x - P.x, dy = b.y - P.y, d2 = dx * dx + dy * dy; if (d2 < 12100) { const d = Math.sqrt(d2) || 1, f = (110 - d) / 110 * 5200; ax += dx / d * f; ay += dy / d * f; b.free = T + 0.8; } }
        b.vx += ax * dt; b.vy += ay * dt;
        const sp = Math.hypot(b.vx, b.vy), lim = T < b.free ? MAX * 2 : MAX;
        if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
        if (seeking && Math.hypot(b.tx - b.x, b.ty - b.y) < 3) { b.vx *= 0.8; b.vy *= 0.8; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        const s2 = Math.hypot(b.vx, b.vy);
        if (s2 > 14) { let d = Math.atan2(b.vy, b.vx) - b.h; d = Math.atan2(Math.sin(d), Math.cos(d)); b.h += d * (1 - Math.exp(-dt * 12)); }
        else { let d = b.rest - b.h; d = Math.atan2(Math.sin(d), Math.cos(d)); b.h += d * dt * 1.5; if (Math.random() < dt * 0.3) b.rest += rand(-0.6, 0.6); }
        b.wob += (s2 * 0.09 + 0.6) * dt * 10;
      }
    }
    draw() {
      const c = this.ctx; c.clearRect(0, 0, 390, SH);
      for (const b of this.bugs) {
        const s = b.sp; if (!s.c) continue;
        c.save(); c.translate(b.x, b.y); c.rotate(b.h - s.f + Math.sin(b.wob) * 0.1);
        c.globalAlpha = 0.1; c.fillStyle = '#000'; c.beginPath(); c.ellipse(2, 3, s.w * 0.45, s.h * 0.45, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); c.restore();
      }
    }
  }
  function textPoints(lines, x0, y0, w, h, maxN) {
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w); cv.height = Math.ceil(h);
    const c = cv.getContext('2d'); c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const SP = 0.1; // letter spacing (em)
    const lineW = (l, sz) => { c.font = `900 ${sz}px Montserrat`; return [...l].reduce((a, ch) => a + c.measureText(ch).width, 0) + (l.length - 1) * sz * SP; };
    const mw = Math.max(...lines.map(l => lineW(l, 100)));
    const size = Math.min((w * 0.96) / mw * 100, (h / lines.length) * 0.92);
    c.font = `900 ${size}px Montserrat`; c.textAlign = 'left';
    lines.forEach((l, i) => {
      let x = (w - lineW(l, size)) / 2; const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.02;
      for (const ch of l) { c.fillText(ch, x, y); x += c.measureText(ch).width + size * SP; }
    });
    const data = c.getImageData(0, 0, cv.width, cv.height).data;
    for (let step = 6; step < 30; step++) {
      const pts = [];
      for (let y = 0; y < cv.height; y += step) for (let x = 0; x < cv.width; x += step) if (data[(y * cv.width + x) * 4 + 3] > 128) pts.push([x0 + x, y0 + y]);
      if (pts.length <= maxN) return pts;
    }
    return [];
  }
  function heartPoints(cx, cy, r, n) { const pts = []; for (let i = 0; i < n; i++) { const t = (i / n) * TAU; pts.push([cx + 16 * Math.pow(Math.sin(t), 3) * r / 16, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r / 16]); } return pts; }

  /* ============================== SCENE 0 · cold open ============================== */
  addScene({
    cls: 's0', bg: '#f3eee4', ui: '#16141c', dc: '#e0452b',
    html: () => `<div class="meta"><span>${C.s0.metaL}</span><span>${C.s0.metaR}</span></div>
      <div class="s0-big">${C.s0.big}</div><div class="s0-sub">${C.s0.sub}</div><p class="s0-body">${C.s0.body}</p>
      <div class="s0-hand">${C.s0.hand}</div>
      <button class="s0-cat" aria-label="the cat"><img class="stk" src="assets/v2/cut/ucat040.webp" alt=""></button>
      <div class="hint s0-sound">${C.sound}</div>`,
    init() {
      this.cat = $('.s0-cat', this.el); this.sq = spring(0, 380, 12); this.hop = spring(0, 300, 14);
      this.jump = null;
      this.cat.addEventListener('click', e => {
        e.stopPropagation(); if (this.jump) return; unlock();
        meow(1); sfx('boing', { vol: 0.5 }); this.sq.vel -= 10;
        const p = pos(this.cat); doodle('burst', { x: p.cx, y: p.y + 20, r: 50, c: '#e0452b', life: 0.6 });
        setTimeout(() => { this.jump = { x: 0, y: 0, vx: -260, vy: -1150, r: 0 }; sfx('whoosh2', { vol: 0.6 }); }, 170);
        setTimeout(() => go(1), 820);
      });
    },
    perk() { this.hop.vel -= 260; setTimeout(() => meow(0.7), 700); },
    enter() {
      this.jump = null; this.cat.style.opacity = 1;
      later(900, () => {
        const h = pos($('.s0-hand', this.el)), c = pos(this.cat);
        doodle('arrow', { x1: h.x + h.w * 0.55, y1: h.y + h.h + 6, x2: c.x + 14, y2: c.y + c.h * 0.55, c: '#e0452b', w: 3, life: 0, bend: 0.35, dur: 0.5 });
        const s = pos($('.s0-sub', this.el)); doodle('under', { x: s.x + 2, y: s.y + s.h + 4, len: s.w - 4, c: '#e0452b', w: 2.6, life: 0, delay: 0.3 });
        const b = pos($('.s0-big', this.el)); doodle('sparkle', { x: b.x + b.w + 6, y: b.y + 18, r: 14, c: '#16141c', w: 2.6, life: 0, delay: 0.6 });
        doodle('sparkle', { x: b.x + b.w - 14, y: b.y - 6, r: 8, c: '#16141c', w: 2.2, life: 0, delay: 0.75 });
      });
      later(2600, () => { const c = pos(this.cat); doodle('circle', { x: c.cx, y: c.cy, rx: c.w * 0.62, ry: c.h * 0.56, c: '#e0452b', w: 3, life: 0, dur: 0.6 }); });
    },
    update(dt) {
      const br = Math.sin(T * 2.3) * 0.018, sq = this.sq.v * 0.05;
      let tx = 0, ty = this.hop.v * 0.25, r = 0;
      if (this.jump) { const j = this.jump; j.vy += 2600 * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.r -= 120 * dt; tx = j.x; ty = j.y; r = j.r; }
      this.cat.style.transform = `translate(${tx}px,${ty}px) rotate(${r}deg) scale(${1 - sq},${1 + br + sq})`;
    },
  });

  /* ============================== SCENE 1 · bugs spell it ============================== */
  addScene({
    cls: 's1', bg: '#ff4a2a', ui: '#16141c', dc: '#fff',
    html: () => `<div class="meta"><span>${C.s1.metaL}</span><span>${C.s1.metaR}</span></div>
      <div class="s1-giant anton">${C.s1.giant.join('<br>')}</div>
      <img class="s1-cat stk" src="assets/v2/cut/ucat138.webp" alt="">
      <div class="s1-line">${C.s1.line}</div>
      <div class="hint s1-hint" style="color:#16141c">${C.s1.hint}</div>`,
    init() {
      this.giant = $('.s1-giant', this.el); this.catEl = $('.s1-cat', this.el); this.lineEl = $('.s1-line', this.el); this.hintEl = $('.s1-hint', this.el);
      this.fx = makeCanvas(this.el); this.swarm = new Swarm(this.fx.ctx); this.catX = spring(480, 120, 14); this.catR = spring(30, 120, 10);
      const P = this.swarm.ptr;
      this.el.addEventListener('pointerdown', e => { const p = toStage(e); P.x = p.x; P.y = p.y; P.down = true; if (this.swarm.mode === 'form') { sfx('buzz', { vol: 0.5, jit: 0.15 }); } });
      this.el.addEventListener('pointermove', e => { if (!P.down) return; const p = toStage(e); P.x = p.x; P.y = p.y; });
      const up = () => { P.down = false; }; this.el.addEventListener('pointerup', up); this.el.addEventListener('pointercancel', up); this.el.addEventListener('pointerleave', up);
    },
    layout() {
      const gs = clamp((SH - 470) / 1.72, 120, 196);
      this.gs = gs; this.giant.style.fontSize = gs + 'px';
      this.giantTop = SH - 128 - gs * 1.72; this.giant.style.top = this.giantTop + 'px';
      this.catEl.style.top = (this.giantTop + gs * 0.42) + 'px'; this.catEl.style.left = '128px'; this.catEl.style.width = clamp(gs * 1.2, 170, 260) + 'px';
      this.lineEl.style.bottom = '84px'; this.hintEl.style.top = '46px'; this.hintEl.style.padding = '0 60px';
    },
    enter() {
      this.formedOnce = false;
      this.catX.set(480); this.catX.t = 0; this.catR.set(30); this.catR.t = -8;
      later(250, () => sfx('whoosh2', { vol: 0.6 }));
      later(600, () => { meow(0.6); const c = pos(this.catEl); doodle('rays', { x: c.x + 10, y: c.y + 30, r: 40, a: PI, c: '#fff' }); });
      const top = 64, bottom = this.giantTop - 8;
      const pts = textPoints(C.s1.bugText, 12, top, 366, Math.max(80, bottom - top), 260);
      this.swarm.spawn(pts.length || 80); this.swarm.mode = 'swarm';
      sfx('bugrun', { vol: 0.8, delay: 0.2 }); sfx('buzz', { vol: 0.4, delay: 0.5 });
      later(1700, () => { this.swarm.setTargets(pts); });
    },
    leave() { this.swarm.ptr.down = false; },
    update(dt) {
      this.catEl.style.transform = `translateX(${this.catX.v}px) rotate(${this.catR.v}deg)`;
      this.swarm.update(dt); this.swarm.draw();
      if (!this.formedOnce && this.swarm.formed() > 0.86) {
        this.formedOnce = true; sfx('ding', { vol: 0.6 }); sfx('cricket', { vol: 0.35, delay: 0.4 });
        doodle('star', { x: 30, y: 74, r: 14, c: '#fff', life: 0 }); doodle('sparkle', { x: 360, y: 96, r: 12, c: '#fff', life: 0, delay: 0.2 });
        const g = pos(this.giant); doodle('zig', { x: 18, y: g.y + g.h + 6, len: 180, h: 5, c: '#fff', life: 0, delay: 0.4 });
        ready();
      }
    },
  });

  /* ============================== SCENE 2 · visa (Chat Noir) ============================== */
  addScene({
    cls: 's2', bg: '#e8d9b5', ui: '#16141c', dc: '#d61f1f', mascot: false,
    html: () => `<img class="cover" src="assets/v2/art/pd047.jpg" alt="Théophile Steinlen, Tournée du Chat Noir, 1896" style="object-position:50% 18%">
      <div class="s2-band"><p class="s2-text">${C.s2.before}</p></div>
      <button class="s2-btn" aria-label="${C.s2.hint}"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="62" fill="none" stroke="rgba(22,20,28,.18)" stroke-width="6"/><circle class="ring" cx="66" cy="66" r="62" fill="none" stroke="#16141c" stroke-width="6" stroke-linecap="round" stroke-dasharray="390" stroke-dashoffset="390" transform="rotate(-90 66 66)"/></svg><span>HOLD</span></button>
      <div class="hint s2-hint">${C.s2.hint}</div>
      <div class="s2-stamp">${C.s2.stamp.replace(' ', '<br>')}<small>${C.s2.stampSmall}</small></div>
      <div class="s2-tag"><dl>${C.s2.fields.map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join('')}</dl></div>`,
    init() {
      this.btn = $('.s2-btn', this.el); this.ring = $('.ring', this.el); this.stamp = $('.s2-stamp', this.el); this.tag = $('.s2-tag', this.el);
      this.text = $('.s2-text', this.el); this.hintEl = $('.s2-hint', this.el);
      this.sS = spring(2.6, 520, 24); this.bS = spring(1, 300, 16); this.tY = spring(1, 140, 18);
      const start = e => { e.stopPropagation(); unlock(); if (this.done) return; this.holding = true; sfx('click', { vol: 0.8 }); this.bS.t = 0.9; };
      const end = () => { this.holding = false; if (!this.done) this.bS.t = 1; };
      this.btn.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => this.btn.addEventListener(ev, end));
    },
    layout() { this.btn.style.bottom = '128px'; this.hintEl.style.bottom = '84px'; this.stamp.style.top = (SH * 0.44) + 'px'; },
    enter() {
      this.done = false; this.prog = 0; this.landed = false; this.text.textContent = C.s2.before; this.text.style.opacity = 1;
      this.sS.set(2.6); this.bS.set(1); this.tY.set(1); this.stamp.style.opacity = 0; this.btn.style.display = ''; this.hintEl.style.opacity = '';
      later(700, () => { const b = pos(this.btn); doodle('arrow', { x1: b.x - 70, y1: b.y - 40, x2: b.x - 8, y2: b.y + 30, c: '#d61f1f', life: 0, bend: -0.3 }); });
    },
    stampIt() {
      this.done = true; this.bS.t = 0; this.hintEl.style.opacity = 0; this.stamp.style.opacity = 1; this.sS.t = 1;
      clearDoodles();
    },
    update(dt) {
      if (!this.done) {
        this.prog = clamp(this.prog + (this.holding ? dt / 0.9 : -dt * 1.6), 0, 1);
        this.ring.style.strokeDashoffset = (390 * (1 - this.prog)).toFixed(1);
        if (this.prog >= 1) this.stampIt();
      }
      this.btn.style.transform = `scale(${Math.max(0, this.bS.v)}) rotate(${this.holding ? Math.sin(T * 40) * 2 : 0}deg)`;
      this.stamp.style.transform = `rotate(-12deg) scale(${this.sS.v.toFixed(4)})`;
      if (this.done && !this.landed && this.sS.v < 1.03) {
        this.landed = true; sfx('stamp', { vol: 1 }); sfx('dhamdrum', { vol: 0.45 }); shake(16);
        const s = pos(this.stamp); doodle('burst', { x: s.cx, y: s.cy, r: s.w * 0.5, c: '#d61f1f', w: 4, life: 0.8, n: 12 });
        later(250, () => doodle('circle', { x: s.cx, y: s.cy, rx: s.w * 0.62, ry: s.h * 0.75, c: '#16141c', w: 3, life: 0 }));
        later(550, () => { this.text.style.opacity = 0; later(200, () => { this.text.textContent = C.s2.after; this.text.style.opacity = 1; meow(0.6); }); });
        later(1000, () => { this.tY.t = 0; sfx('paperslide', { vol: 0.8 }); });
        later(1800, () => { doodle('star', { x: 350, y: SH - 230, r: 14, c: '#d61f1f', life: 0 }); ready(); });
      }
      this.tag.style.transform = `translateY(${(this.tY.v * 110).toFixed(2)}%)`;
      this.text.style.transition = 'opacity .2s';
    },
  });

  /* ============================== SCENE 3 · soap-opera triple zoom ============================== */
  addScene({
    cls: 's3', bg: '#050505', ui: '#fff', uibg: '#050505', dc: '#fff', mascot: false,
    html: () => `<div class="s3-title">${C.s3.title}</div>
      <div class="s3-frame"><img class="s3-img" src="assets/img/p-facetime.jpg" alt="">
        <div class="s3-flash"></div><div class="s3-hit"></div><div class="s3-cap"></div><div class="s3-wm">${C.s3.watermark}</div>
        <button class="s3-play" aria-label="play">▶</button>
        <div class="s3-end"><p>${C.s3.end}</p><button class="s3-replay">${C.s3.replay}</button></div></div>`,
    init() {
      this.frame = $('.s3-frame', this.el); this.img = $('.s3-img', this.el); this.flash = $('.s3-flash', this.el); this.hit = $('.s3-hit', this.el);
      this.cap = $('.s3-cap', this.el); this.play = $('.s3-play', this.el); this.end = $('.s3-end', this.el);
      this.z = spring(1, 700, 30); this.hS = spring(1, 500, 20); this.endS = spring(0, 120, 18); this.flashV = 0;
      this.play.addEventListener('click', e => { e.stopPropagation(); unlock(); this.run(); });
      $('.s3-replay', this.el).addEventListener('click', e => { e.stopPropagation(); this.run(); });
    },
    layout() { const h = Math.min(SH - 190, 600); this.frame.style.height = h + 'px'; this.fh = h; },
    enter() { this.reset(); later(500, () => doodle('circle', { x: 195, y: 100 + this.fh / 2, rx: 70, ry: 70, c: '#fff', life: 0 })); },
    reset() { this.z.set(1); this.endS.set(0); this.hit.style.opacity = 0; this.cap.textContent = ''; this.play.style.display = ''; this.flashV = 0; },
    run() {
      timers.forEach(clearTimeout); timers = []; clearDoodles(); this.reset(); this.play.style.display = 'none';
      const fy = 100, cx = 195, cy = fy + this.fh * 0.56;
      sfx('whoosh', { vol: 0.6 });
      const hit = (i, z, col, big) => later([550, 1450, 2350][i], () => {
        this.z.t = z; this.z.vel += 6; this.flashV = 0.85; this.flash.style.background = col;
        this.hit.textContent = C.s3.hits[i]; this.hit.style.opacity = 1; this.hS.set(2.2); this.hS.t = 1;
        sfx('dhamdrum', { vol: 1 }); sfx('dham', { vol: big ? 1 : 0.7 }); if (big) sfx('thunder', { vol: 0.7 });
        shake(big ? 26 : 16);
        doodle('circle', { x: cx, y: cy, rx: 60 + i * 18, ry: 66 + i * 18, c: i === 1 ? '#7fd7ff' : '#ff3b3b', w: 4, life: 0.7, glow: '#fff' });
        doodle('burst', { x: cx, y: cy, r: 110 + i * 10, c: '#fff', w: 4, life: 0.5, n: 14 });
        if (i === 2) { doodle('bang', { x: 300, y: fy + 120, c: '#ffeb3b', w: 5, life: 1.2 }); doodle('arrow', { x1: 60, y1: fy + 60, x2: cx - 70, y2: cy - 40, c: '#ffeb3b', w: 4, life: 1.4 }); }
      });
      hit(0, 1.6, '#ff0000'); hit(1, 2.4, '#0044ff'); hit(2, 3.5, '#ff0000', true);
      later(3200, () => { this.hit.style.opacity = 0; this.z.t = 3.7; this.z.k = 30; this.z.c = 12; });
      later(3500, () => {
        const words = C.s3.caption.split(' ');
        this.cap.innerHTML = words.map(w => `<span style="display:inline-block;opacity:0">${w}</span>`).join(' ');
        $$('span', this.cap).forEach((sp, i) => later(i * 140, () => { sp.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, fill: 'forwards' }); sfx('pop', { vol: 0.4, jit: 0.2 }); }));
        later(500, () => sfx('meowangry', { vol: 0.9 }));
      });
      later(6000, () => { this.z.k = 700; this.z.c = 30; this.endS.t = 1; sfx('badumtss', { vol: 0.8 }); sfx('sparkle', { vol: 0.5 });
        doodle('heart', { x: 80, y: fy + 120, r: 22, c: '#fff', life: 0 }); doodle('star', { x: 310, y: fy + this.fh - 150, r: 18, c: '#fff', life: 0, delay: 0.2 }); ready(); });
    },
    update(dt) {
      this.img.style.transform = `scale(${this.z.v.toFixed(4)})`;
      this.flashV = Math.max(0, this.flashV - dt * 3.2); this.flash.style.opacity = this.flashV.toFixed(3);
      this.hit.style.transform = `scale(${this.hS.v.toFixed(4)}) rotate(-4deg)`;
      this.end.style.opacity = clamp(this.endS.v, 0, 1); this.end.style.pointerEvents = this.endS.t > 0.5 ? 'auto' : 'none';
      this.end.style.transform = `scale(${(0.9 + this.endS.v * 0.1).toFixed(4)})`;
    },
  });

  /* ============================== SCENE 4 · love bugs (cobalt) ============================== */
  const FACES = { pd029: 0, pd036: -PI / 2, ubug066: 0, cbug001: -PI / 2, cbug012: -PI / 2, ubug068: 0, cbug005: PI };
  addScene({
    cls: 's4 grain', bg: '#1f3fd1', ui: '#fff', uibg: '#1f3fd1', dc: '#fff',
    html: () => `<div class="meta"><span class="s4-c1">${C.s4.counter}</span><span class="s4-c2">00 / 07</span></div>
      <div class="s4-intro anton">${C.s4.intro}</div>
      ${C.s4.reasons.map((r, i) => `<button class="s4-bug" data-i="${i}" style="--w:${r.bug === 'cbug001' ? 120 : r.bug === 'ubug066' ? 130 : 100}px"><img src="assets/v2/cut/${r.bug}.webp" alt=""></button>`).join('')}
      <div class="s4-panel"><div class="s4-big anton"></div><div class="s4-aside"><span></span><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M50 2 C85 1 99 9 98 20 C97 33 76 39 48 38 C18 37 2 31 2 19 C3 8 22 2 55 3" fill="none" stroke="#ff6a54" stroke-width="1.4" vector-effect="non-scaling-stroke" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></svg></div></div>
      <div class="s4-tray">${C.s4.reasons.map(() => '<i></i>').join('')}</div>
      <div class="s4-done anton">${C.s4.done}</div>
      <div class="hint s4-tap" style="color:#fff;opacity:0">${C.s4.tapOn}</div>`,
    init() {
      this.bugs = $$('.s4-bug', this.el).map((el, i) => ({ el, i, r: C.s4.reasons[i], f: FACES[C.s4.reasons[i].bug] || 0, w: parseFloat(el.style.getPropertyValue('--w')),
        x: 0, y: 0, h: 0, wa: rand(0, TAU), caught: false, sx: spring(0, 160, 18), sy: spring(0, 160, 18), ss: spring(1, 200, 16), sr: spring(0, 160, 16) }));
      this.panel = $('.s4-panel', this.el); this.big = $('.s4-big', this.el); this.aside = $('.s4-aside span', this.el); this.ell = $('.s4-aside path', this.el);
      this.tray = $$('.s4-tray i', this.el); this.c2 = $('.s4-c2', this.el); this.intro = $('.s4-intro', this.el); this.doneEl = $('.s4-done', this.el); this.tapEl = $('.s4-tap', this.el);
      this.pS = spring(0, 200, 20);
      this.bugs.forEach(b => b.el.addEventListener('pointerdown', e => { e.stopPropagation(); unlock(); if (this.state === 'show') { if (T - this.showT > 0.6) this.stow(); return; } this.catchBug(b); }));
      this.el.addEventListener('pointerdown', () => { if (this.state === 'show' && T - this.showT > 0.6) this.stow(); });
    },
    layout() { this.panel.style.top = (SH * 0.42) + 'px'; this.tray[0].parentNode.style.bottom = '62px'; this.doneEl.style.top = (SH * 0.36) + 'px'; this.tapEl.style.bottom = '96px'; },
    enter() {
      this.state = 'idle'; this.n = 0; this.c2.textContent = '00 / 07'; this.intro.style.opacity = 1; this.doneEl.style.opacity = 0; this.pS.set(0);
      this.tray.forEach(t => t.innerHTML = '');
      this.bugs.forEach((b, k) => { b.caught = false; b.el.style.display = ''; b.el.style.opacity = 1; b.x = 80 + (k % 3) * 115 + rand(-20, 20); b.y = 260 + Math.floor(k / 3) * ((SH - 470) / 2) + rand(-20, 20); b.h = rand(0, TAU); b.sx.set(b.x); b.sy.set(b.y); b.ss.set(1); b.sr.set(0); b.mode = 'walk'; });
      later(400, () => { sfx('bugrun', { vol: 0.6 }); const p = pos(this.intro); doodle('under', { x: p.x, y: p.y + p.h + 8, len: 230, c: '#ff6a54', life: 0 }); });
    },
    catchBug(b) {
      if (this.state !== 'idle' || b.caught) return;
      this.state = 'show'; this.showT = T; this.cur = b; b.mode = 'show'; b.caught = true; this.n++; clearDoodles();
      this.bugs.forEach(o => { if (o !== b) { o.el.style.transition = 'opacity .3s'; o.el.style.opacity = 0.18; o.el.style.zIndex = 1; } });
      this.intro.style.opacity = 0;
      b.sx.set(b.x); b.sy.set(b.y); b.sx.t = 195; b.sy.t = SH * 0.27; b.ss.t = 1.9; b.sr.set(b.h - b.f); b.sr.t = Math.round((b.h - b.f) / TAU) * TAU - 0.08; b.el.style.zIndex = 20;
      const snd = { pd036: 'bee', cbug001: 'sparkle', ubug066: 'buglaugh' }[b.r.bug] || 'buzzq'; sfx(snd, { vol: 0.8 }); sfx('pop', { vol: 0.5, delay: 0.15 });
      this.big.textContent = b.r.big; this.aside.textContent = b.r.aside; this.c2.textContent = String(this.n).padStart(2, '0') + ' / 07';
      this.pS.set(0); this.pS.t = 1; this.ell.style.transition = 'none'; this.ell.style.strokeDashoffset = '1';
      later(450, () => { this.ell.style.transition = 'stroke-dashoffset .7s cubic-bezier(.3,.7,.2,1)'; this.ell.style.strokeDashoffset = '0'; });
      later(300, () => { doodle('sparkle', { x: 195 + 90, y: SH * 0.27 - 60, r: 16, c: '#fff' , life: 1.2}); doodle('sparkle', { x: 195 - 95, y: SH * 0.27 + 40, r: 11, c: '#fff', life: 1.2 }); doodle('rays', { x: 195, y: SH * 0.27, r: 92, a: -PI / 2, c: '#fff', life: 1 }); });
      this.tapEl.style.opacity = 0.7;
    },
    stow() {
      const b = this.cur; this.state = 'stow'; this.pS.t = 0; this.tapEl.style.opacity = 0;
      const slot = this.tray[this.n - 1], sp = pos(slot);
      b.sx.t = sp.cx; b.sy.t = sp.cy; b.ss.t = 0.26; sfx('pingpong', { vol: 0.7 });
      setTimeout(() => {
        b.el.style.display = 'none'; slot.innerHTML = `<img src="assets/v2/cut/${b.r.bug}.webp" alt="">`; sfx('pop', { vol: 0.6, jit: 0.1 });
        slot.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        if (this.n >= 7) {
          this.state = 'done'; this.doneEl.style.transition = 'opacity .5s'; this.doneEl.style.opacity = 1; sfx('horn', { vol: 0.7 }); meow(0.6);
          const d = pos(this.doneEl); doodle('circle', { x: d.cx, y: d.cy, rx: d.w * 0.56, ry: d.h * 0.7, c: '#ff6a54', life: 0 });
          doodle('star', { x: 50, y: d.y - 30, r: 16, c: '#fff', life: 0, delay: 0.3 }); ready();
        } else this.state = 'idle';
        this.bugs.forEach(o => { o.el.style.opacity = 1; o.el.style.zIndex = ''; });
      }, 420);
    },
    update(dt) {
      const topLim = 210, botLim = SH - 170;
      this.bugs.forEach(b => {
        if (b.caught && b.mode === 'walk') return;
        if (b.mode === 'walk') {
          if (this.state === 'idle') {
            b.wa += rand(-1, 1) * dt * 3; const sp = 30;
            let tx = Math.cos(b.wa), ty = Math.sin(b.wa);
            if (b.x < 60) tx += 1.5; if (b.x > 330) tx -= 1.5; if (b.y < topLim) ty += 1.5; if (b.y > botLim) ty -= 1.5;
            this.bugs.forEach(o => { if (o === b || o.caught) return; const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1, min = (b.w + o.w) * 0.55;
              if (d < min) { const k = (min - d) / min; tx += dx / d * k * 4; ty += dy / d * k * 4; b.x += dx / d * k * 40 * dt; b.y += dy / d * k * 40 * dt; } });
            const target = Math.atan2(ty, tx); let d = target - b.h; d = Math.atan2(Math.sin(d), Math.cos(d)); b.h += d * dt * 2.2;
            b.x += Math.cos(b.h) * sp * dt; b.y += Math.sin(b.h) * sp * dt;
          }
          const bob = 1 + Math.sin(T * 9 + b.i) * 0.025;
          b.el.style.transform = `translate(${(b.x - b.w / 2).toFixed(1)}px,${(b.y - b.w / 2).toFixed(1)}px) rotate(${(b.h - b.f + Math.sin(T * 12 + b.i) * 0.05).toFixed(3)}rad) scale(${bob})`;
        } else {
          b.el.style.transform = `translate(${(b.sx.v - b.w / 2).toFixed(1)}px,${(b.sy.v - b.w / 2).toFixed(1)}px) rotate(${b.sr.v.toFixed(3)}rad) scale(${b.ss.v.toFixed(3)})`;
        }
      });
      this.panel.style.opacity = clamp(this.pS.v, 0, 1); this.panel.style.transform = `translateY(${((1 - this.pS.v) * 30).toFixed(1)}px)`;
    },
  });

  /* ============================== SCENE 5 · reels ============================== */
  addScene({
    cls: 's5', bg: '#000', ui: '#fff', uibg: '#000', dc: '#fff', mascot: false,
    html: () => `${C.s5.stories.map(s => `<div class="s5-story"><img src="${s.img}" style="object-position:${s.pos}" alt=""></div>`).join('')}
      <div class="s5-bars">${C.s5.stories.map(() => '<i><b></b></i>').join('')}</div>
      <div class="s5-cap"></div>
      <div class="s5-side"><b>❤️</b><span class="s5-likes">69.4K</span><b>💬</b><span>420</span><b>↗</b><span>share</span></div>
      <div class="s5-foot">${C.s5.handle}<div>♫ ${C.s5.audio}</div></div>`,
    init() {
      this.stories = $$('.s5-story', this.el); this.bars = $$('.s5-bars b', this.el); this.cap = $('.s5-cap', this.el); this.likes = $('.s5-likes', this.el);
      this.lastTap = 0;
      this.el.addEventListener('pointerdown', e => {
        const p = toStage(e), now = performance.now();
        if (now - this.lastTap < 300) { this.heart(p.x, p.y); this.lastTap = 0; return; }
        this.lastTap = now;
        setTimeout(() => { if (this.lastTap === now) { if (p.x > 150) this.show(this.idx + 1); else this.show(this.idx - 1); } }, 260);
      });
    },
    heart(x, y) {
      const h = document.createElement('div'); h.className = 'heart'; h.textContent = '❤️'; h.style.left = (x - 30) + 'px'; h.style.top = (y - 40) + 'px'; this.el.appendChild(h);
      h.animate([{ transform: 'scale(0) rotate(-20deg)', opacity: 1 }, { transform: 'scale(1.4) rotate(8deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(1) translateY(-60px)', opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => h.remove();
      sfx('kiss', { vol: 0.8 }); this.likeN += 1; doodle('heart', { x: x + 40, y: y - 30, r: 14, c: '#fff', life: 0.5 });
    },
    enter() { this.idx = -1; this.likeN = 69400; this.show(0); },
    leave() { this.idx = -1; },
    show(i) {
      if (i < 0 || i >= this.stories.length || i === this.idx) { if (i >= this.stories.length) ready(); return; }
      this.idx = i; this.t = 0; clearDoodles();
      this.stories.forEach((s, k) => { s.style.transition = 'opacity .35s'; s.style.opacity = k === i ? 1 : 0; const im = $('img', s); im.style.transition = 'none'; im.style.transform = 'scale(1)'; });
      const im = $('img', this.stories[i]); requestAnimationFrame(() => { im.style.transition = 'transform 5s linear'; im.style.transform = 'scale(1.12)'; });
      this.bars.forEach((b, k) => { b.style.width = k < i ? '100%' : '0%'; });
      sfx('whoosh2', { vol: 0.5, jit: 0.1 });
      const words = C.s5.stories[i].cap.split(' ');
      this.cap.innerHTML = words.map((w, k) => `<span class="${k === 2 ? 'y' : ''}">${w}</span>`).join('');
      $$('span', this.cap).forEach((sp, k) => setTimeout(() => {
        if (this.idx !== i) return;
        sp.animate([{ transform: 'scale(0) rotate(-8deg)', opacity: 0 }, { transform: 'scale(1.3) rotate(4deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 360, fill: 'forwards' });
        sfx('pop', { vol: 0.3, jit: 0.3 });
      }, 250 + k * 120));
      const D = [
        () => { doodle('circle', { x: 200, y: SH * 0.47, rx: 120, ry: 150, c: '#fff', life: 0, delay: 0.5 }); doodle('arrow', { x1: 40, y1: 150, x2: 110, y2: SH * 0.36, c: '#ffe600', w: 4, life: 0, delay: 0.8 }); doodle('bang', { x: 320, y: 170, c: '#ffe600', w: 5, life: 0, delay: 1 }); },
        () => { doodle('heart', { x: 90, y: 180, r: 26, c: '#fff', life: 0, delay: 0.5 }); doodle('heart', { x: 300, y: 260, r: 18, c: '#ffb3c7', life: 0, delay: 0.7 }); doodle('sparkle', { x: 320, y: 140, r: 16, c: '#fff', life: 0, delay: 0.9 }); },
        () => { doodle('arrow', { x1: 320, y1: 140, x2: 230, y2: SH * 0.33, c: '#ffe600', w: 4, life: 0, delay: 0.5, bend: -0.3 }); doodle('star', { x: 70, y: 200, r: 18, c: '#fff', life: 0, delay: 0.8 }); doodle('spiral', { x: 330, y: SH * 0.7, r: 22, c: '#fff', life: 0, delay: 1 }); },
        () => { doodle('circle', { x: 190, y: SH * 0.33, rx: 90, ry: 80, c: '#fff', life: 0, delay: 0.5 }); doodle('burst', { x: 300, y: SH * 0.38, r: 26, c: '#ffe600', life: 0, delay: 0.8 }); doodle('heart', { x: 80, y: SH * 0.62, r: 20, c: '#fff', life: 0, delay: 1 }); meow(0.8); },
      ];
      D[i]();
    },
    update(dt) {
      if (this.idx < 0) return;
      this.t += dt; const dur = 4.8, b = this.bars[this.idx]; if (b) b.style.width = Math.min(100, (this.t / dur) * 100) + '%';
      if (this.t >= dur) { if (this.idx < this.stories.length - 1) this.show(this.idx + 1); else { ready(); this.t = dur; } }
      this.likeN += dt * rand(20, 60); this.likes.textContent = (this.likeN / 1000).toFixed(1) + 'K';
    },
  });

  /* ============================== SCENE 6 · mixtape ============================== */
  addScene({
    cls: 's6', bg: '#d9d3c7', ui: '#16141c', dc: '#c4302b',
    html: () => `<div class="meta"><span>${C.s6.metaL}</span><span>${C.s6.metaR}</span></div>
      <div class="s6-cass"><div class="s6-label"><b>${C.s6.label}</b><span>${C.s6.side} · ${C.s6.tracks.map(t => t.t.toLowerCase()).join(' / ')}</span></div><div class="s6-win"><i></i><i></i></div></div>
      <div class="s6-deck">${C.s6.hint}</div>
      <div class="s6-line">${C.s6.line}</div>
      <div class="s6-tracks">${C.s6.tracks.map((t, i) => `<button data-i="${i}">${t.t}<span>${t.a}</span></button>`).join('')}</div>`,
    init() {
      this.cass = $('.s6-cass', this.el); this.reels = $$('.s6-win i', this.el); this.deck = $('.s6-deck', this.el); this.line = $('.s6-line', this.el); this.tr = $('.s6-tracks', this.el);
      this.om = spring(0, 40, 12); this.dip = spring(0, 260, 12); this.rot = 0;
      $$('button', this.tr).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); unlock(); this.playTrack(+b.dataset.i, b); }));
    },
    layout() {
      const avail = SH - 80 - 96, need = 206 + 186 + 64 + 168 + 40, f = clamp(avail / need, 0.7, 1);
      let y = 70; this.cass.style.top = y + 'px'; this.cass.style.transform = `scale(${f})`; this.cass.style.transformOrigin = '50% 0'; this.f = f;
      y += 206 * f + 18 * f; this.deck.style.top = y + 'px'; this.deck.style.left = this.deck.style.right = (30 + (1 - f) * 60) + 'px';
      y += 186 * f + 14; this.line.style.top = y + 'px'; y += 58; this.tr.style.top = y + 'px';
    },
    enter() { later(600, () => { const c = pos(this.cass); doodle('heart', { x: c.x + c.w - 30, y: c.y + 6, r: 16, c: '#c4302b', life: 0 }); doodle('sparkle', { x: c.x + 14, y: c.y - 6, r: 12, c: '#16141c', life: 0, delay: 0.2 }); }); },
    playTrack(i, btn) {
      const t = C.s6.tracks[i];
      $$('button', this.tr).forEach(b => b.classList.toggle('on', b === btn));
      sfx('cassette', { vol: 0.9 }); this.dip.vel += 300; this.om.t = 7;
      this.deck.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${t.id}?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="${t.t}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      const d = pos(this.deck); doodle('rays', { x: d.x + d.w - 10, y: d.y + 10, r: 18, a: -PI / 4, c: '#c4302b', life: 0.8 });
      later(1500, ready);
    },
    leave() { this.deck.innerHTML = C.s6.hint; this.om.t = 0; $$('button', this.tr).forEach(b => b.classList.remove('on')); },
    update(dt) {
      this.rot += this.om.v * dt * 57.3; this.reels.forEach((r, k) => { r.style.transform = `rotate(${this.rot * (k ? 1.1 : 1)}deg)`; });
      this.cass.style.transform = `translateY(${this.dip.v * 0.05}px) scale(${this.f || 1}) rotate(${-4 + Math.sin(T * 1.3) * 0.6}deg)`;
    },
  });

  /* ============================== SCENE 7 · the letter ============================== */
  addScene({
    cls: 's7 grain', bg: '#0a0705', ui: '#f3ead7', uibg: '#0a0705', dc: '#f3ead7', mascot: false,
    html: () => `<img class="s7-candle" src="assets/v2/photo/x018.jpg" alt="">
      <div class="s7-card">${C.s7.pages.slice().reverse().map((pg, ri) => { const i = C.s7.pages.length - 1 - ri; return `<div class="s7-page" data-i="${i}">${pg.map(p => `<p class="${p.k || ''}">${p.t}</p>`).join('')}<span class="s7-num">${i + 1} / ${C.s7.pages.length}${i < C.s7.pages.length - 1 ? ' · tap →' : ''}</span></div>`; }).join('')}</div>
      <img class="s7-bear" src="assets/v2/cut/bear011.webp" alt="">
      <img class="s7-bear s7-bearf" src="assets/v2/cut/bear007.webp" alt="" style="opacity:0;width:190px">
      <img class="s7-bear s7-roar" src="assets/v2/cut/roar007.webp" alt="" style="opacity:0;width:240px">
      <div class="hint s7-hint">${C.s7.hint}</div>`,
    init() {
      this.card = $('.s7-card', this.el); this.pages = $$('.s7-page', this.el).sort((a, b) => a.dataset.i - b.dataset.i);
      this.candle = $('.s7-candle', this.el); this.bear = $('.s7-bear', this.el); this.bearF = $('.s7-bearf', this.el); this.roar = $('.s7-roar', this.el); this.rS = spring(0, 220, 13); this.hintEl = $('.s7-hint', this.el);
      this.ang = this.pages.map(() => spring(0, 90, 16)); this.fS = spring(0, 260, 14);
      this.card.addEventListener('pointerdown', e => { e.stopPropagation(); unlock(); this.turn(); });
    },
    layout() { this.card.style.top = '96px'; this.card.style.height = (SH - 96 - 150) + 'px'; this.hintEl.style.bottom = '66px'; this.bearBase = SH - 70; this.fitted = false; },
    fit() {
      this.pages.forEach(pg => { let fs = 19; pg.style.fontSize = fs + 'px'; while (pg.scrollHeight > pg.clientHeight + 1 && fs > 12) { fs -= 0.5; pg.style.fontSize = fs + 'px'; } });
      this.fitted = true;
    },
    enter() {
      if (!this.fitted) this.fit();
      this.idx = 0; this.ang.forEach(a => a.set(0)); this.pages.forEach(p => p.style.visibility = 'visible'); this.bearState = null; this.bear.style.opacity = 0; this.bearF.style.opacity = 0; this.roar.style.opacity = 0;
      this.hintEl.style.opacity = '';
      later(800, () => { const c = pos(this.card); doodle('sparkle', { x: c.x + c.w - 6, y: c.y - 14, r: 12, c: '#f3ead7', life: 0 }); doodle('heart', { x: c.x + 8, y: c.y + c.h + 20, r: 12, c: '#f3ead7', life: 0, delay: 0.3 }); });
    },
    turn() {
      if (this.idx >= this.pages.length - 1 || this.turning) return;
      this.turning = true; this.ang[this.idx].t = -180; sfx('page', { vol: 0.9, jit: 0.1 });
      const k = this.idx; this.idx++;
      setTimeout(() => { this.turning = false; }, 450);
      if (this.idx === this.pages.length - 1) { this.hintEl.style.opacity = 0; later(900, () => { ready(); const c = pos(this.card); doodle('heart', { x: c.cx, y: c.y + c.h + 26, r: 18, c: '#ff7a6a', life: 0 }); }); }
      if (C.s7.pages[this.idx].some(p => p.bear)) later(900, () => this.bearGo());
      void k;
    },
    bearGo() { this.bearState = { ph: 'walk', x: -250, step: 0, t: 0, lastStep: 0 }; this.bear.style.opacity = 1; },
    update(dt) {
      const fl = 0.78 + Math.sin(T * 13) * 0.06 + Math.sin(T * 7.3) * 0.05 + rand(-0.03, 0.03);
      this.candle.style.opacity = fl.toFixed(3); this.candle.style.transform = `scale(${(1 + Math.sin(T * 5) * 0.01).toFixed(4)})`;
      this.pages.forEach((p, i) => { const a = this.ang[i].v; p.style.transform = `rotateY(${a.toFixed(2)}deg)`; p.style.visibility = a < -92 ? 'hidden' : 'visible'; p.style.zIndex = 10 - i; });
      const B = this.bearState; if (!B) return;
      B.t += dt; const base = this.bearBase;
      if (B.ph === 'walk' || B.ph === 'leave') {
        const sp = B.ph === 'walk' ? 85 : 120; B.x += sp * dt; B.step += dt * 7;
        const wob = Math.sin(B.step), bob = Math.abs(Math.sin(B.step)) * 5;
        this.bear.style.transform = `translate(${B.x.toFixed(1)}px,${(base - 129 - bob).toFixed(1)}px) rotate(${(wob * 2.5).toFixed(2)}deg)`;
        if (Math.floor(B.step / PI) !== B.lastStep) { B.lastStep = Math.floor(B.step / PI); sfx('stomp', { vol: 0.28, rate: 1.25, jit: 0.1 }); }
        if (B.ph === 'walk' && B.x >= 80) { B.ph = 'stop'; B.t = 0; }
        if (B.ph === 'leave' && B.x > 420) { this.bearState = null; this.bear.style.opacity = 0; }
      } else if (B.ph === 'stop' && B.t > 0.45) {
        B.ph = 'look'; B.t = 0; this.bear.style.opacity = 0; this.bearF.style.opacity = 1; this.fS.set(0.85); this.fS.t = 1; sfx('boing', { vol: 0.25, rate: 0.7 });
        const hx = 195, hy = base - 230; doodle('bang', { x: hx + 70, y: hy - 10, c: '#f3ead7', w: 4.5, life: 1.4 }); doodle('circle', { x: hx, y: hy + 10, rx: 70, ry: 60, c: '#f3ead7', life: 1.6 });
      } else if (B.ph === 'look' && B.t > 1.1) {
        B.ph = 'growl'; B.t = 0; this.bearF.style.opacity = 0; this.roar.style.opacity = 1; this.rS.set(0); this.rS.t = 1;
        sfx('growl', { vol: 1 }); sfx('dhamdrum', { vol: 0.35 }); shake(22);
        later(120, () => { doodle('burst', { x: 225, y: base - 330, r: 70, c: '#ffcf6a', w: 4.5, life: 1.2, n: 14 }); doodle('bang', { x: 60, y: base - 360, c: '#ffcf6a', w: 5, life: 1.4 }); doodle('rays', { x: 120, y: base - 300, r: 60, a: PI * 1.15, c: '#f3ead7', life: 1.2 }); });
      } else if (B.ph === 'growl' && B.t > 2.3) {
        B.ph = 'drop'; B.t = 0; this.rS.t = 0;
      } else if (B.ph === 'drop' && B.t > 0.45) {
        B.ph = 'leave'; B.t = 0; this.roar.style.opacity = 0; this.bear.style.opacity = 1; B.x = 80; sfx('stomp', { vol: 0.4 });
      }
      if (B && (B.ph === 'growl' || B.ph === 'drop')) {
        const r = this.rS.v, sh = B.ph === 'growl' && B.t < 1.4 ? Math.sin(T * 55) * 2.5 : 0;
        this.roar.style.transform = `translate(${(80 + sh).toFixed(1)}px,${(base - 388 + (1 - r) * 200).toFixed(1)}px) scale(${(0.85 + r * 0.15).toFixed(3)},${(0.55 + r * 0.45).toFixed(3)}) rotate(${((1 - r) * 8).toFixed(2)}deg)`;
        this.roar.style.opacity = clamp(B.ph === 'drop' ? r * 2 : 1, 0, 1);
      }
      if (B && (B.ph === 'look' || B.ph === 'growl')) {
        const sh = B.ph === 'growl' && B.t < 1.2 ? Math.sin(T * 60) * 3 : 0;
        this.bearF.style.transform = `translate(${(100 + sh).toFixed(1)}px,${(base - 300).toFixed(1)}px) scale(${this.fS.v.toFixed(4)})`;
      }
    },
  });

  /* ============================== SCENE 8 · finale ============================== */
  addScene({
    cls: 's8', bg: '#122015', ui: '#f6efdd', uibg: '#122015', dc: '#f6efdd', mascot: true,
    html: () => `<img class="cover" src="assets/v2/art/pd022.jpg" alt="Henri Rousseau, Surprised!, 1891" style="object-position:30% 50%"><div class="s8-shade"></div>
      <div class="s8-wish">${C.s8.wish}</div>
      ${[0, 1, 2, 3, 4].map(i => `<button class="s8-candle" data-i="${i}" aria-label="candle"></button>`).join('')}
      <button class="s8-mic">${C.s8.mic}</button>
      <div class="hint s8-hint" style="color:#f6efdd">${C.s8.hint}</div>
      <img class="s8-kitten stk" src="assets/v2/cut/ucat061.webp" alt="">
      <div class="s8-fin"><div class="s8-after">${C.s8.after}</div><div class="s8-afters">${C.s8.afterSmall}</div><div class="s8-big">${C.s8.big.join('<br>')}</div><div class="s8-small">${C.s8.small}</div><button class="s8-again">${C.s8.again}</button><div class="s8-credits">${C.s8.credits}</div></div>`,
    init() {
      this.fx = makeCanvas(this.el); this.fx.cv.style.zIndex = 3; this.swarm = new Swarm(this.fx.ctx);
      const cols = ['#f2c14e', '#f6a8bd', '#c7dc3a', '#7fc8f8', '#ff6b5a'];
      this.cands = $$('.s8-candle', this.el).map((el, i) => { el.style.setProperty('--c', cols[i]); return { el, i, lit: true, h: [96, 118, 130, 112, 92][i], ys: spring(0, 120, 14) }; });
      this.cands.forEach(c => c.el.addEventListener('pointerdown', e => { e.stopPropagation(); unlock(); this.blow(c); }));
      this.mic = $('.s8-mic', this.el); this.mic.addEventListener('click', e => { e.stopPropagation(); unlock(); this.micOn(); });
      this.kitten = $('.s8-kitten', this.el); this.kS = spring(0, 200, 14); this.fin = $('.s8-fin', this.el); this.wish = $('.s8-wish', this.el); this.hintEl = $('.s8-hint', this.el);
      $('.s8-again', this.el).addEventListener('click', e => { e.stopPropagation(); location.reload(); });
      this.parts = [];
    },
    layout() {
      this.baseY = SH * 0.64;
      this.cands.forEach(c => { c.x = 195 + (c.i - 2) * 36; c.el.style.left = (c.x - 6.5) + 'px'; c.el.style.top = (this.baseY - c.h) + 'px'; c.el.style.height = c.h + 'px'; });
      this.mic.style.top = (this.baseY + 30) + 'px'; this.hintEl.style.top = (this.baseY + 82) + 'px';
      this.kitten.style.top = (SH * 0.3) + 'px'; this.fin.style.top = (SH * 0.465) + 'px';
    },
    enter() {
      this.done = false; this.parts = []; this.swarm.bugs = [];
      this.cands.forEach(c => { c.lit = true; c.ys.set(0); c.el.style.opacity = 1; c.el.style.display = ''; });
      this.kS.set(0); this.kitten.style.opacity = 0; $$('.s8-fin > *', this.el).forEach(x => { x.style.transition = 'none'; x.style.opacity = 0; x.style.transform = 'translateY(14px)'; });
      this.wish.style.opacity = 1; this.mic.style.display = ''; this.hintEl.style.opacity = '';
      later(700, () => { doodle('sparkle', { x: 60, y: 120, r: 14, c: '#f6efdd', life: 0 }); doodle('sparkle', { x: 340, y: 100, r: 10, c: '#f6efdd', life: 0, delay: 0.2 }); doodle('arrow', { x1: 300, y1: this.baseY - 190, x2: 245, y2: this.baseY - 140, c: '#f6efdd', life: 0 }); });
    },
    leave() { this.micOff(); },
    blow(c) {
      if (!c.lit) return; c.lit = false; sfx('blow', { vol: 0.8, jit: 0.1 });
      for (let k = 0; k < 26; k++) this.parts.push({ x: c.x + rand(-3, 3), y: this.baseY - c.h - 10, vx: rand(-10, 10), vy: rand(-60, -30), life: 0, max: rand(1.4, 2.4), smoke: true, r: rand(3, 6) });
      doodle('spiral', { x: c.x + 14, y: this.baseY - c.h - 40, r: 12, c: '#f6efdd', life: 0.8, w: 2.4 });
      if (this.cands.every(x => !x.lit)) setTimeout(() => this.celebrate(), 650);
    },
    async micOn() {
      if (this.stream) { this.micOff(); return; }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = actx.createMediaStreamSource(this.stream); this.an = actx.createAnalyser(); this.an.fftSize = 1024; src.connect(this.an);
        this.abuf = new Uint8Array(this.an.fftSize); this.strong = 0; this.lastBlow = 0; this.mic.textContent = '🌬️ listening… blow!';
      } catch (e) { this.mic.textContent = 'mic said no. tap them 🙂'; }
    },
    micOff() { if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; this.an = null; this.mic.textContent = C.s8.mic; } },
    celebrate() {
      if (this.done) return; this.done = true; this.micOff(); this.mic.style.display = 'none'; this.hintEl.style.opacity = 0; this.wish.style.transition = 'opacity .5s'; this.wish.style.opacity = 0;
      this.cands.forEach((c, i) => { setTimeout(() => { c.ys.t = 1; }, i * 60); });
      sfx('horn', { vol: 0.7 }); sfx('cheer', { vol: 0.45, delay: 0.2 }); sfx('sparkle', { vol: 0.5, delay: 0.4 });
      const pts = heartPoints(195, SH * 0.19, 78, 64); clearDoodles(); mascotShow(false); this.swarm.spawn(64); this.swarm.max = 260; setTimeout(() => this.swarm.setTargets(pts), 900);
      setTimeout(() => { this.kS.t = 1; this.kitten.style.opacity = 1; sfx('purr', { vol: 0.6 }); meow(0.5); }, 1600);
      $$('.s8-fin > *', this.el).forEach((x, i) => setTimeout(() => { x.style.transition = 'opacity .8s, transform .8s cubic-bezier(.2,.8,.2,1)'; x.style.opacity = 1; x.style.transform = 'none'; }, 2200 + i * 450));
      setTimeout(() => { const b = pos($('.s8-big', this.el)); doodle('under', { x: b.x + 30, y: b.y + b.h + 4, len: b.w - 60, c: '#f6efdd', life: 0 }); doodle('heart', { x: 22, y: b.y - 14, r: 13, c: '#ff8f80', life: 0, delay: 0.3 }); doodle('star', { x: 350, y: b.y - 6, r: 15, c: '#f6efdd', life: 0, delay: 0.5 }); }, 3700);
    },
    update(dt) {
      const ctx = this.fx.ctx;
      if (this.an) {
        this.an.getByteTimeDomainData(this.abuf); let s = 0; for (const v of this.abuf) { const d = (v - 128) / 128; s += d * d; }
        const rms = Math.sqrt(s / this.abuf.length); this.strong = rms > 0.12 ? this.strong + 1 : 0;
        if (this.strong > 4 && T - this.lastBlow > 0.3) { const c = this.cands.find(x => x.lit); if (c) { this.blow(c); this.lastBlow = T; } }
      }
      this.cands.forEach(c => { c.el.style.transform = `translateY(${(c.ys.v * 260).toFixed(1)}px) rotate(${(c.ys.v * (c.i - 2) * 12).toFixed(1)}deg)`; c.el.style.opacity = (1 - c.ys.v).toFixed(3);
        if (c.lit) for (let k = 0; k < 3; k++) this.parts.push({ x: c.x + rand(-1.5, 1.5) + Math.sin(T * 9 + c.i) * 1.2, y: this.baseY - c.h - 8, vx: rand(-6, 6), vy: rand(-55, -25), life: 0, max: rand(0.25, 0.5), r: rand(3, 5.5) }); });
      if (this.swarm.bugs.length) this.swarm.update(dt);
      ctx.clearRect(0, 0, 390, SH);
      this.cands.forEach(c => { if (!c.lit) return; const fx = c.x, fy = this.baseY - c.h - 14; const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 46); g.addColorStop(0, 'rgba(255,200,110,.38)'); g.addColorStop(1, 'rgba(255,200,110,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, 46, 0, TAU); ctx.fill(); });
      ctx.globalCompositeOperation = 'lighter';
      this.parts = this.parts.filter(p => (p.life += dt) < p.max);
      for (const p of this.parts) {
        if (p.smoke) continue; const k = p.life / p.max; p.x += p.vx * dt; p.y += p.vy * dt;
        const r = p.r * (1 - k * 0.7); ctx.fillStyle = `rgba(255,${Math.round(220 - k * 150)},${Math.round(120 - k * 100)},${(0.55 * (1 - k)).toFixed(3)})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.7, r * 1.3, 0, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const p of this.parts) {
        if (!p.smoke) continue; const k = p.life / p.max; p.vx += Math.sin(p.y * 0.06 + T * 2) * 30 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.fillStyle = `rgba(200,205,200,${(0.28 * (1 - k)).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 2.5), 0, TAU); ctx.fill();
      }
      if (this.swarm.bugs.length) { const c = this.fx.ctx; c.save(); this.swarm.ctx = { clearRect() {}, save: () => c.save(), restore: () => c.restore(), translate: (a, b) => c.translate(a, b), rotate: a => c.rotate(a), beginPath: () => c.beginPath(), ellipse: (...a) => c.ellipse(...a), fill: () => c.fill(), drawImage: (...a) => c.drawImage(...a), set globalAlpha(v) { c.globalAlpha = v; }, set fillStyle(v) { c.fillStyle = v; } }; this.swarm.draw(); c.restore(); }
      this.kitten.style.transform = `translateY(${((1 - this.kS.v) * 60).toFixed(1)}px) scale(${(0.6 + this.kS.v * 0.4).toFixed(3)})`;
    },
  });

  /* ============================== boot ============================== */
  dotsEl.innerHTML = scenes.map(() => '<i></i>').join('');
  addEventListener('resize', layout);
  layout();
  const fontsReady = Promise.all(['100px Anton', '40px "Instrument Serif"', 'italic 40px "Instrument Serif"', '20px Ballpoint', '20px Soft', '20px Marker', '500 12px "DM Mono"', '900 20px Montserrat']
    .map(f => document.fonts.load(f).catch(() => {})));
  const firstImg = new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = 'assets/v2/cut/ucat040.webp'; });
  Promise.race([Promise.all([fontsReady, firstImg]), new Promise(r => setTimeout(r, 4000))]).then(() => {
    layout(); const L = $('#loading'); L.style.opacity = 0; setTimeout(() => L.remove(), 600);
    const start = Math.min(scenes.length - 1, parseInt(new URLSearchParams(location.search).get('s') || '0', 10) || 0);
    go(start);
  });
})();
