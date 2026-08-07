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

  const destroyHeroSlider = (root) => {
    if (root._mjHeroCleanup) {
      root._mjHeroCleanup();
      root._mjHeroCleanup = null;
    }
  };

  const initHeroSlider = (scope = document) => {
    scope.querySelectorAll('[data-mj-hero-slider]').forEach((root) => {
      destroyHeroSlider(root);

      const slides = [...root.querySelectorAll('[data-mj-slide]')];
      if (slides.length < 2) return;

      let index = Math.max(
        0,
        slides.findIndex((slide) => slide.classList.contains('is-active'))
      );
      if (index < 0) index = 0;

      const interval = Number(root.dataset.interval || 6000);
      let timer;
      let paused = false;

      const setActive = (next) => {
        slides[index]?.classList.remove('is-active');
        slides[index]?.setAttribute('aria-hidden', 'true');

        index = (next + slides.length) % slides.length;

        slides[index].classList.add('is-active');
        slides[index].setAttribute('aria-hidden', 'false');
        slides[index].querySelector('[data-mj-slide-content]')?.classList.add('is-visible');
      };

      const play = () => {
        if (reduceMotion || paused) return;
        clearInterval(timer);
        timer = window.setInterval(() => setActive(index + 1), interval);
      };

      const pause = () => {
        paused = true;
        clearInterval(timer);
      };

      const resume = () => {
        paused = false;
        play();
      };

      const onNext = () => {
        setActive(index + 1);
        play();
      };
      const onPrev = () => {
        setActive(index - 1);
        play();
      };

      const nextBtn = root.querySelector('[data-mj-next]');
      const prevBtn = root.querySelector('[data-mj-prev]');
      nextBtn?.addEventListener('click', onNext);
      prevBtn?.addEventListener('click', onPrev);

      const onEnter = () => pause();
      const onLeave = () => resume();
      root.addEventListener('mouseenter', onEnter);
      root.addEventListener('mouseleave', onLeave);
      root.addEventListener('focusin', onEnter);
      root.addEventListener('focusout', (event) => {
        if (!root.contains(event.relatedTarget)) resume();
      });

      const onVisibility = () => {
        if (document.hidden) pause();
        else resume();
      };
      document.addEventListener('visibilitychange', onVisibility);

      setActive(index);
      play();

      root._mjHeroCleanup = () => {
        clearInterval(timer);
        nextBtn?.removeEventListener('click', onNext);
        prevBtn?.removeEventListener('click', onPrev);
        root.removeEventListener('mouseenter', onEnter);
        root.removeEventListener('mouseleave', onLeave);
        root.removeEventListener('focusin', onEnter);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    });
  };

  const initScrollNext = (scope = document) => {
    scope.querySelectorAll('[data-mj-scroll-next]').forEach((button) => {
      if (button.dataset.mjBound === 'true') return;
      button.dataset.mjBound = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const section = button.closest('.shopify-section');
        const next = section?.nextElementSibling;
        if (next) {
          next.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      });
    });
  };

  const initCarousels = (scope = document) => {
    scope.querySelectorAll('[data-mj-carousel]').forEach((root) => {
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

  const boot = (scope = document) => {
    initReveal();
    initHeroSlider(scope);
    initScrollNext(scope);
    initCarousels(scope);
    initStickyAtc();
    initRecentlyViewed();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(document));
  } else {
    boot(document);
  }

  document.addEventListener('shopify:section:load', (event) => {
    boot(event.target);
  });

  document.addEventListener('shopify:section:unload', (event) => {
    event.target.querySelectorAll('[data-mj-hero-slider]').forEach(destroyHeroSlider);
  });
})();
