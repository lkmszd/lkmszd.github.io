/* «Побег бага» — one-button mini-game. You are a bug sneaking through tests into prod. */
(() => {
  const frame = document.querySelector('[data-game]');
  if (!frame) return;

  const canvas = frame.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = frame.querySelector('[data-score]');
  const bestEl = frame.querySelector('[data-best]');
  const screens = {
    start: frame.querySelector('[data-screen="start"]'),
    over: frame.querySelector('[data-screen="over"]'),
    pause: frame.querySelector('[data-screen="pause"]'),
  };
  const out = {
    report: frame.querySelector('[data-over-report]'),
    title: frame.querySelector('[data-over-title]'),
    text: frame.querySelector('[data-over-text]'),
    best: frame.querySelector('[data-over-best]'),
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // World: height is always 1000 units, width follows the frame's aspect ratio.
  const H = 1000;
  const GRAVITY = 2600;
  const FLAP = -760;
  const MAX_FALL = 1150;
  const GATE_W = 110;
  const SPACING = 540;
  const BUG_SCALE = 1.3;
  const R = 26; // forgiving hitbox (the drawn bug is a bit bigger)
  const LABELS = ['SMOKE', 'REGRESS', 'UI', 'API', 'E2E', 'A11Y', 'PERF', 'iOS', 'ANDROID', 'WEB', 'NDA', 'BETA'];

  // light / inverted palettes follow the B/W toggle in the header
  const PALETTES = {
    light: {
      bg: '#f1f0eb', ink: [15, 15, 14], muted: [201, 200, 193], grid: 'rgba(15, 15, 14, 0.06)',
      accent: '#0f0f0e', paper: '#f1f0eb', shell: 'rgba(241, 240, 235, 0.55)', spot: 'rgba(241, 240, 235, 0.92)', eye: '#ffffff',
    },
    dark: {
      bg: '#0f0f0e', ink: [241, 240, 235], muted: [72, 72, 68], grid: 'rgba(241, 240, 235, 0.07)',
      accent: '#f1f0eb', paper: '#0f0f0e', shell: 'rgba(15, 15, 14, 0.55)', spot: 'rgba(15, 15, 14, 0.92)', eye: '#0f0f0e',
    },
  };
  const rgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  let C = PALETTES.light;
  let INK = rgb(C.ink, C.ink, 0);
  const setPalette = () => {
    C = document.documentElement.dataset.theme === 'dark' ? PALETTES.dark : PALETTES.light;
    INK = rgb(C.ink, C.ink, 0);
  };
  setPalette();

  let W = 1600;
  let scale = 1;
  let dpr = 1;
  let state = 'start'; // start | playing | dying | over | paused
  let bug;
  let gates = [];
  let score = 0;
  let best = 0;
  let speed = 330;
  let t = 0;
  let gridOffset = 0;
  let dyingT = 0;
  let reports = 1361; // continues the real report count from the resume
  let newRecord = false;
  let banner = null;
  let overShownAt = 0;
  let lastTime = 0;
  let raf = 0;
  let visible = false;
  let fresh = false; // world was just reset and nobody has played it yet

  try { best = parseInt(localStorage.getItem('bugrun.best') || '0', 10) || 0; } catch (e) { /* private mode */ }
  bestEl.textContent = String(best);

  // ---------- setup ----------

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = rect.height / H;
    W = rect.width / scale;
    if (bug && state !== 'playing') bug.x = Math.min(320, W * 0.28);
    draw();
  }

  function reset() {
    bug = { x: Math.min(320, W * 0.28), y: H * 0.45, vy: 0, rot: 0 };
    gates = [];
    score = 0;
    speed = 330;
    banner = null;
    newRecord = false;
    scoreEl.textContent = '0';
    // first gate comes quickly even on wide screens, then fill the rest of the view
    for (let x = bug.x + 640; x < W + SPACING; x += SPACING) spawn(x);
    fresh = true;
  }

  function spawn(x) {
    const gap = Math.max(240, 300 - score * 2.2);
    const prev = gates.length ? gates[gates.length - 1].center : H / 2;
    const min = 90 + gap / 2;
    const max = H - 90 - gap / 2;
    const center = Math.max(min, Math.min(max, prev + (Math.random() * 2 - 1) * 280));
    gates.push({ x, center, gap, label: LABELS[(Math.random() * LABELS.length) | 0], passed: false, fade: 0 });
  }

  // ---------- game flow ----------

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    frame.classList.toggle('is-playing', name === null);
  }

  function start() {
    if (!fresh) reset();
    fresh = false;
    state = 'playing';
    show(null);
    frame.focus({ preventScroll: true });
    bug.vy = FLAP;
    kick();
  }

  function flap() {
    if (state === 'playing') bug.vy = FLAP;
  }

  function die() {
    state = 'dying';
    dyingT = 0;
    bug.vy = -520;
    frame.classList.remove('is-hit');
    void frame.offsetWidth; // restart the shake animation
    frame.classList.add('is-hit');
    if (score > best) {
      best = score;
      newRecord = true;
      bestEl.textContent = String(best);
      try { localStorage.setItem('bugrun.best', String(best)); } catch (e) { /* ignore */ }
    }
  }

  function roast(n) {
    if (n === 0) return 'Даже smoke-тест не пройден.';
    if (n < 5) return 'Такие баги я ловлю ещё до обеда.';
    if (n < 15) return 'Неплохо, но регресс тебя нашёл.';
    if (n < 30) return 'Хитрый баг. Такие я оформляю как критические.';
    return 'Почти прорвался в прод. Похоже, вам нужен тестировщик — напишите мне.';
  }

  function showOver() {
    state = 'over';
    reports += 1;
    out.report.textContent = `Баг-репорт №${reports}`;
    // nbsp + non-breaking hyphen keep «на 1‑й» together on narrow screens
    out.title.textContent = `Пойман на ${score + 1}‑й проверке`;
    out.text.textContent = roast(score);
    out.best.textContent = newRecord ? `Новый рекорд: ${best}` : `Рекорд: ${best}`;
    show('over');
    overShownAt = performance.now();
    const btn = screens.over.querySelector('button');
    if (btn) btn.focus({ preventScroll: true });
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    show('pause');
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    show(null);
    frame.focus({ preventScroll: true });
    kick();
  }

  // ---------- simulation ----------

  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = Math.max(x, Math.min(cx, x + w));
    const ny = Math.max(y, Math.min(cy, y + h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function hitsGate(g) {
    const top = g.center - g.gap / 2;
    const bottom = g.center + g.gap / 2;
    return circleRect(bug.x, bug.y, R, g.x, -200, GATE_W, top + 200)
      || circleRect(bug.x, bug.y, R, g.x, bottom, GATE_W, H - bottom + 200);
  }

  function update(dt) {
    t += dt;

    if (state === 'start') {
      bug.y = H * 0.45 + Math.sin(t * 3) * 18;
      bug.rot = Math.sin(t * 3) * 0.08;
      gridOffset = (gridOffset + 40 * dt) % 100;
      return;
    }
    if (state !== 'playing' && state !== 'dying') return;

    bug.vy = Math.min(MAX_FALL, bug.vy + GRAVITY * dt);
    bug.y += bug.vy * dt;
    if (bug.y < R) { bug.y = R; bug.vy = Math.max(0, bug.vy); }

    if (state === 'dying') {
      bug.rot += dt * 9;
      dyingT += dt;
      if (dyingT > 0.9) showOver();
      return;
    }

    const target = Math.max(-0.45, Math.min(1.1, bug.vy / 1100));
    bug.rot += (target - bug.rot) * Math.min(1, dt * 12);

    const dx = speed * dt;
    gridOffset = (gridOffset + dx * 0.35) % 100;
    gates.forEach((g) => { g.x -= dx; });
    if (gates.length && gates[0].x + GATE_W < -40) gates.shift();
    const last = gates[gates.length - 1];
    if (!last || last.x < W - SPACING) spawn((last ? last.x : W) + SPACING);

    gates.forEach((g) => {
      if (!g.passed && g.x + GATE_W < bug.x - R) {
        g.passed = true;
        score += 1;
        scoreEl.textContent = String(score);
        speed = Math.min(540, 330 + score * 7);
        if (score % 10 === 0) banner = { text: `Спринт ${score / 10 + 1}`, life: 1.4 };
      }
      if (g.passed) g.fade = Math.min(1, g.fade + dt * 3);
    });

    if (banner) {
      banner.life -= dt;
      if (banner.life <= 0) banner = null;
    }

    if (bug.y + R >= H) { die(); return; }
    if (gates.some(hitsGate)) die();
  }

  // ---------- rendering ----------

  function drawBug() {
    ctx.save();
    ctx.translate(bug.x, bug.y);
    ctx.rotate(bug.rot);
    ctx.scale(BUG_SCALE, BUG_SCALE);

    const wiggle = Math.sin(t * 18) * 3.5;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = -1; i <= 1; i += 1) {
      const lx = i * 13;
      const w = i === 0 ? -wiggle : wiggle;
      ctx.moveTo(lx, -10); ctx.lineTo(lx + w - 4, -31);
      ctx.moveTo(lx, 10); ctx.lineTo(lx - w - 4, 31);
    }
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, -6); ctx.quadraticCurveTo(46, -24, 56, -19);
    ctx.moveTo(30, 6); ctx.quadraticCurveTo(46, 24, 56, 19);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(26, 0, 12, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.ellipse(0, 0, 28, 21, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = C.shell;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-25, 0); ctx.lineTo(20, 0); ctx.stroke();

    ctx.fillStyle = C.spot;
    [[-11, -9], [6, -10], [-11, 9], [6, 10]].forEach(([sx, sy]) => {
      ctx.beginPath(); ctx.arc(sx, sy, 3.6, 0, Math.PI * 2); ctx.fill();
    });

    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.arc(31, -4.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(31, 4.5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawGate(g) {
    const top = g.center - g.gap / 2;
    const bottom = g.center + g.gap / 2;
    ctx.fillStyle = rgb(C.ink, C.muted, g.fade);
    ctx.fillRect(g.x, 0, GATE_W, top);
    ctx.fillRect(g.x, bottom, GATE_W, H - bottom);

    // label inside the taller column, reading away from the gap
    ctx.save();
    ctx.fillStyle = C.paper;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const text = g.passed ? 'MISSED' : g.label;
    if (top > H - bottom) {
      ctx.translate(g.x + GATE_W / 2, top - 26);
      ctx.rotate(-Math.PI / 2);
    } else {
      ctx.translate(g.x + GATE_W / 2, bottom + 26);
      ctx.rotate(Math.PI / 2);
    }
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function draw() {
    if (!bug) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

    // graph-paper grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let x = -gridOffset; x < W; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 100; y < H; y += 100) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.font = '500 22px "JetBrains Mono", ui-monospace, Menlo, monospace';
    gates.forEach(drawGate);
    drawBug();

    if (banner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, banner.life * 2);
      ctx.fillStyle = C.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '500 30px "JetBrains Mono", ui-monospace, Menlo, monospace';
      ctx.fillText(banner.text.toUpperCase(), W / 2, H * 0.14);
      ctx.restore();
    }
  }

  // ---------- loop ----------

  function shouldRun() {
    if (!visible || document.hidden) return false;
    return state === 'playing' || state === 'dying' || (state === 'start' && !reduceMotion);
  }

  function loop(now) {
    raf = 0;
    const dt = Math.min(0.033, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    if (shouldRun()) raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (raf || !shouldRun()) return;
    lastTime = performance.now();
    raf = requestAnimationFrame(loop);
  }

  // ---------- input ----------

  frame.addEventListener('pointerdown', (e) => {
    if (state !== 'playing' || e.target.closest('button')) return;
    e.preventDefault();
    flap();
  });

  window.addEventListener('keydown', (e) => {
    const k = e.code;
    const flapKey = k === 'Space' || k === 'ArrowUp' || k === 'KeyW';
    if (state === 'playing') {
      if (flapKey) { e.preventDefault(); if (!e.repeat) flap(); }
      else if (k === 'Escape' || k === 'KeyP') pause();
      return;
    }
    if ((state === 'start' || state === 'over') && document.activeElement === frame && (k === 'Space' || k === 'Enter')) {
      e.preventDefault();
      start();
    }
  });

  frame.querySelectorAll('[data-action="start"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (performance.now() - overShownAt < 450) return; // swallow mashed keys right after a crash
      start();
    });
  });
  frame.querySelectorAll('[data-action="resume"]').forEach((btn) => btn.addEventListener('click', resume));

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) pause();
      kick();
    }, { threshold: 0.25 }).observe(frame);
  } else {
    visible = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else kick();
  });

  window.addEventListener('themechange', () => { setPalette(); draw(); });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  resize();
  reset();
  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  kick();
})();
