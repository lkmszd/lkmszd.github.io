(() => {
  window.__ready = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;

  // Reveal on scroll
  // first screen animates in right away, the rest on scroll
  document.querySelectorAll('.hero [data-reveal]').forEach((el) => el.classList.add('is-in'));
  const revealItems = document.querySelectorAll('[data-reveal]:not(.is-in)');
  if (canObserve && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealItems.forEach((el) => io.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('is-in'));
  }

  // Count-up numbers in stats
  const counters = document.querySelectorAll('[data-count]');
  if (canObserve && !reduceMotion) {
    const animate = (el) => {
      const target = parseInt(el.dataset.count, 10);
      const duration = 1600;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 4))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const co = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        co.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => {
      el.textContent = '0';
      co.observe(el);
    });
  }

  // Header border + scroll progress
  const header = document.querySelector('.header');
  const bar = document.querySelector('.progress');
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 8);
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    }
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  onScroll();

  // Copy e-mail
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const original = btn.textContent;
    let timer;
    const fallbackCopy = (text) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
      ta.remove();
    };
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
      btn.textContent = 'Скопировано';
      btn.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('is-done');
      }, 1800);
    });
  });
})();
