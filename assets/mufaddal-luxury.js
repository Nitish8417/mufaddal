(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const initReveal = () => {
    const nodes = document.querySelectorAll('.mj-reveal');
    if (!nodes.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
    );

    nodes.forEach((node) => observer.observe(node));
  };

  const initHeroSlider = () => {
    document.querySelectorAll('[data-mj-hero-slider]').forEach((root) => {
      const slides = [...root.querySelectorAll('[data-mj-slide]')];
      if (slides.length < 2) return;

      let index = 0;
      const interval = Number(root.dataset.interval || 6000);
      let timer;

      const show = (next) => {
        slides[index].classList.remove('is-active');
        index = (next + slides.length) % slides.length;
        slides[index].classList.add('is-active');
      };

      const play = () => {
        if (reduceMotion) return;
        clearInterval(timer);
        timer = setInterval(() => show(index + 1), interval);
      };

      root.querySelector('[data-mj-next]')?.addEventListener('click', () => {
        show(index + 1);
        play();
      });
      root.querySelector('[data-mj-prev]')?.addEventListener('click', () => {
        show(index - 1);
        play();
      });

      play();
    });
  };

  const initCarousels = () => {
    document.querySelectorAll('[data-mj-carousel]').forEach((root) => {
      const track = root.querySelector('[data-mj-track]');
      if (!track) return;

      const scrollBy = (dir) => {
        const amount = track.clientWidth * 0.85 * dir;
        track.scrollBy({ left: amount, behavior: reduceMotion ? 'auto' : 'smooth' });
      };

      root.querySelector('[data-mj-next]')?.addEventListener('click', () => scrollBy(1));
      root.querySelector('[data-mj-prev]')?.addEventListener('click', () => scrollBy(-1));
    });
  };

  const initStickyAtc = () => {
    const bar = document.querySelector('[data-mj-sticky-atc]');
    const trigger = document.querySelector('[data-mj-sticky-trigger]');
    if (!bar || !trigger || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        bar.classList.toggle('is-visible', !entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(trigger);
  };

  const initRecentlyViewed = () => {
    const key = 'mj_recently_viewed';
    const productId = document.body.dataset.productId;
    if (productId) {
      let ids = [];
      try {
        ids = JSON.parse(localStorage.getItem(key) || '[]');
      } catch {
        ids = [];
      }
      ids = ids.filter((id) => String(id) !== String(productId));
      ids.unshift(String(productId));
      localStorage.setItem(key, JSON.stringify(ids.slice(0, 8)));
    }

    document.querySelectorAll('[data-mj-recently-viewed]').forEach((root) => {
      let ids = [];
      try {
        ids = JSON.parse(localStorage.getItem(key) || '[]');
      } catch {
        ids = [];
      }
      const current = root.dataset.excludeId;
      ids = ids.filter((id) => String(id) !== String(current)).slice(0, Number(root.dataset.limit || 4));
      if (!ids.length) {
        root.hidden = true;
        return;
      }
      root.dataset.productIds = ids.join(',');
      root.dispatchEvent(new CustomEvent('mj:recently-viewed-ready', { detail: { ids } }));
    });
  };

  const boot = () => {
    initReveal();
    initHeroSlider();
    initCarousels();
    initStickyAtc();
    initRecentlyViewed();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
