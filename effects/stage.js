// Shared full-screen overlay for the 3D effects: open/close, tap-to-skip, confetti layer.
(function () {
  'use strict';

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function open(className) {
    const root = document.createElement('div');
    root.className = 'fx ' + className;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-confetti';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    document.body.append(root);
    document.documentElement.classList.add('fx-lock');
    requestAnimationFrame(() => root.classList.add('is-open'));

    function confetti(options) {
      if (!window.RBBConfetti) return Promise.resolve();
      return window.RBBConfetti.burst(canvas, options).catch(() => undefined);
    }

    // Resolves after `ms` or on the first tap, whichever comes first.
    function holdOrTap(ms) {
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          root.removeEventListener('click', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        root.addEventListener('click', done);
      });
    }

    async function close() {
      root.classList.remove('is-open');
      root.classList.add('is-closing');
      await wait(450);
      root.remove();
      document.documentElement.classList.remove('fx-lock');
    }

    return Object.freeze({ root, confetti, holdOrTap, close });
  }

  window.RBBStage = Object.freeze({ open, wait, reducedMotion });
})();
