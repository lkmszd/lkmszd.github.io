/* Interactive layer: variable-weight name, cursor ring, magnetic buttons,
   B/W invert toggle, «find 5 bugs» QA mode, console hello. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. B/W invert toggle ---------- */

  const toggle = document.querySelector('[data-theme-toggle]');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const isDark = () => root.dataset.theme === 'dark';

  const applyTheme = (theme) => {
    if (theme === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    if (toggle) toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#0f0f0e' : '#f1f0eb');
    try { localStorage.setItem('theme', theme); } catch (e) { /* private mode */ }
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  };

  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark()));
    if (metaTheme && isDark()) metaTheme.setAttribute('content', '#0f0f0e');
    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      if (!document.startViewTransition || reduceMotion) { applyTheme(next); return; }
      const r = toggle.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const vt = document.startViewTransition(() => applyTheme(next));
      vt.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 700, easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      }).catch(() => {});
    });
  }

  /* ---------- 2. Hero name: letters get bolder near the cursor ---------- */

  const title = document.querySelector('.hero__title');
  const hero = document.querySelector('.hero');
  if (title && hero && !reduceMotion) {
    const chars = [];
    title.querySelectorAll('.hero__line > span').forEach((span) => {
      const text = span.textContent;
      span.textContent = '';
      for (const ch of text) {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = ch;
        span.appendChild(s);
        chars.push(s);
      }
    });
    title.setAttribute('aria-label', 'Егор Лукичев');

    const BASE = 500;
    const MAX = 860;
    const center = (el) => {
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const smooth = (k) => k * k * (3 - 2 * k);

    let px = 0;
    let py = 0;
    let active = false;
    let frame = 0;
    const render = () => {
      frame = 0;
      const radius = Math.max(140, title.getBoundingClientRect().height * 0.5);
      chars.forEach((c) => {
        const [cx, cy] = center(c);
        const k = active ? Math.max(0, 1 - Math.hypot(px - cx, py - cy) / radius) : 0;
        c.style.fontWeight = String(Math.round(BASE + (MAX - BASE) * smooth(k)));
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      px = e.clientX;
      py = e.clientY;
      active = true;
      schedule();
    });
    hero.addEventListener('pointerleave', () => { active = false; schedule(); });

    // touch: a weight wave runs out from the tap point
    let waving = false;
    title.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || waving) return;
      waving = true;
      const x0 = e.clientX;
      const y0 = e.clientY;
      const start = performance.now();
      const step = (now) => {
        const t = (now - start) / 950;
        if (t >= 1) {
          chars.forEach((c) => { c.style.fontWeight = ''; });
          waving = false;
          return;
        }
        const front = t * 900;
        chars.forEach((c) => {
          const [cx, cy] = center(c);
          const k = Math.max(0, 1 - Math.abs(Math.hypot(x0 - cx, y0 - cy) - front) / 150);
          c.style.fontWeight = String(Math.round(BASE + (MAX - BASE) * smooth(k)));
        });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- 3. Cursor ring + magnetic buttons (mouse only) ---------- */

  if (finePointer) {
    const ring = document.createElement('div');
    ring.className = 'cursor';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);

    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let shown = false;
    const follow = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(follow) : 0;
    };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!shown || reduceMotion) { x = tx; y = ty; }
      if (!shown) { shown = true; ring.classList.add('is-visible'); }
      if (!raf) raf = requestAnimationFrame(follow);
      const t = e.target instanceof Element ? e.target : null;
      const hide = !!(t && t.closest('[data-game].is-playing'));
      ring.classList.toggle('is-hidden', hide);
      ring.classList.toggle('is-link', !hide && !!(t && t.closest('a, button')));
    }, { passive: true });

    document.documentElement.addEventListener('mouseleave', () => ring.classList.remove('is-visible'));
    document.documentElement.addEventListener('mouseenter', () => { if (shown) ring.classList.add('is-visible'); });

    if (!reduceMotion) {
      document.querySelectorAll('.btn, .theme-toggle').forEach((btn) => {
        btn.addEventListener('pointermove', (e) => {
          if (e.pointerType !== 'mouse') return;
          const r = btn.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          btn.style.transform = `translate(${(dx * 0.18).toFixed(1)}px, ${(dy * 0.3).toFixed(1)}px)`;
        });
        btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
      });
    }
  }

  /* ---------- 4. QA mode: find 5 bugs on the page ---------- */

  const BUGS = {
    1: {
      sev: 'Major',
      text: 'В статистике переставлены цифры: 1316 вместо 1361.',
      on: (el) => { const n = el.querySelector('[data-count]'); n.dataset.count = '1316'; n.textContent = '1316'; },
      off: (el) => { const n = el.querySelector('[data-count]'); n.dataset.count = '1361'; n.textContent = '1361'; },
    },
    2: {
      sev: 'Minor',
      text: 'Опечатка в «О себе»: «тестировщков».',
      on: (el) => { el.textContent = 'тестировщков'; },
      off: (el) => { el.textContent = 'тестировщиков'; },
    },
    3: {
      sev: 'Minor',
      text: 'Стрелка на кнопке Telegram смотрит не в ту сторону.',
      on: (el) => { el.querySelector('[aria-hidden]').textContent = '↙'; },
      off: (el) => { el.querySelector('[aria-hidden]').textContent = '↗'; },
    },
    4: {
      sev: 'Trivial',
      text: 'Сломан порядок секций: (30) вместо (03).',
      on: (el) => { el.textContent = '(30)'; },
      off: (el) => { el.textContent = '(03)'; },
    },
    5: {
      sev: 'Minor',
      text: 'Карточка награды съехала и повёрнута на 1,4°.',
      on: (el) => el.classList.add('is-bugged'),
      off: (el) => el.classList.remove('is-bugged'),
    },
  };
  const TOTAL = Object.keys(BUGS).length;
  const bugEls = () => Array.from(document.querySelectorAll('[data-bug]'));
  const startBtns = Array.from(document.querySelectorAll('[data-qa-start]'));

  let qaOn = false;
  const found = new Set();
  let hud = null;
  let toasts = null;

  function ensureUi() {
    if (hud) return;
    toasts = document.createElement('div');
    toasts.className = 'qa-toasts';
    toasts.setAttribute('aria-live', 'polite');
    document.body.appendChild(toasts);

    hud = document.createElement('div');
    hud.className = 'qa-hud';
    hud.innerHTML = '<span class="qa-hud__label">Режим QA</span><span class="qa-hud__count"></span><button type="button">Выйти</button>';
    hud.querySelector('button').addEventListener('click', qaStop);
    document.body.appendChild(hud);
  }

  function updateHud() {
    const count = hud.querySelector('.qa-hud__count');
    count.textContent = found.size === TOTAL ? `Все ${TOTAL} найдены` : `Найдено ${found.size}/${TOTAL}`;
    hud.querySelector('button').textContent = found.size === TOTAL ? 'Готово' : 'Выйти';
  }

  function toast(title, text, withLink) {
    ensureUi();
    const t = document.createElement('div');
    t.className = 'qa-toast';
    const id = document.createElement('span');
    id.className = 'qa-toast__id';
    id.textContent = title;
    const body = document.createElement('span');
    body.textContent = text;
    t.append(id, body);
    if (withLink) {
      const a = document.createElement('a');
      a.className = 'qa-toast__link';
      a.href = 'https://t.me/lkmszd';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Написать в Telegram ↗';
      t.append(a);
      t.classList.add('is-interactive');
    }
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 450);
    }, withLink ? 8000 : 4200);
  }

  function qaStart() {
    if (qaOn) return;
    qaOn = true;
    found.clear();
    root.classList.add('qa-mode');
    bugEls().forEach((el) => BUGS[el.dataset.bug].on(el));
    ensureUi();
    updateHud();
    requestAnimationFrame(() => hud.classList.add('is-on'));
    startBtns.forEach((b) => { b.textContent = 'Режим QA включён'; b.disabled = true; });
    toast('Режим QA включён', `На странице появились ${TOTAL} багов, от первого экрана до навыков. Найдите и кликните по каждому.`);
  }

  function qaStop() {
    if (!qaOn) return;
    qaOn = false;
    root.classList.remove('qa-mode');
    bugEls().forEach((el) => { if (!found.has(el.dataset.bug)) BUGS[el.dataset.bug].off(el); });
    hud.classList.remove('is-on');
    startBtns.forEach((b) => { b.textContent = 'Включить режим QA'; b.disabled = false; });
  }

  document.addEventListener('click', (e) => {
    if (!qaOn || !(e.target instanceof Element)) return;
    const el = e.target.closest('[data-bug]');
    if (!el || found.has(el.dataset.bug)) return;
    e.preventDefault();
    const id = el.dataset.bug;
    found.add(id);
    BUGS[id].off(el);
    el.classList.remove('is-fixed');
    void el.offsetWidth; // restart the flash
    el.classList.add('is-fixed');
    toast(`BUG-0${id} · ${BUGS[id].sev} · исправлен`, BUGS[id].text);
    updateHud();
    if (found.size === TOTAL) {
      setTimeout(() => toast('Все баги найдены', 'Похоже, вы тоже тестировщик. Давайте знакомиться!', true), 500);
    }
  }, true);

  startBtns.forEach((b) => b.addEventListener('click', qaStart));

  /* ---------- 5. Hello for those who open DevTools ---------- */

  try {
    console.log('%cПривет! Раз вы открыли DevTools, вы точно из IT.', 'font: 600 14px "Inter Tight", system-ui, sans-serif;');
    console.log('%cДавайте знакомиться: t.me/lkmszd · lkmszd@vk.com', 'font: 12px "JetBrains Mono", monospace; color: #6b6b66;');
    console.log('%cПодсказка: внизу страницы есть режим QA с пятью багами.', 'font: 12px "JetBrains Mono", monospace; color: #6b6b66;');
  } catch (e) { /* no console */ }
})();
