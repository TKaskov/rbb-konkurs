// Nickname entered: a gold 3D card with "@nick" spins in, shines, sparkles, then fades away.
(function () {
  'use strict';

  const SPIN_MS = 1200;
  const HOLD_MS = 1700;
  let running = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildCard(texts) {
    const scene = el('div', 'welcome-scene');
    const card = el('div', 'welcome-card');
    const logo = el('img', 'welcome-logo');
    logo.src = 'logo-gold.png';
    logo.alt = '';
    card.append(
      logo,
      el('p', 'welcome-hello', texts.hello),
      el('p', 'welcome-who', texts.who),
      el('p', 'welcome-next', texts.next),
      el('span', 'welcome-shine'),
    );
    scene.append(card);
    return scene;
  }

  async function run(texts) {
    const { open, wait } = window.RBBStage;
    if (running) return;
    running = true;
    try {
      const stage = open('fx-welcome');
      stage.root.append(buildCard(texts));
      await wait(SPIN_MS);
      stage.root.classList.add('is-landed');
      stage.confetti({ x: window.innerWidth / 2, y: window.innerHeight * 0.45, count: 70, power: 0.8, durationMs: 3000 });
      await stage.holdOrTap(HOLD_MS);
      await stage.close();
    } finally {
      running = false;
    }
  }

  window.RBBWelcome = Object.freeze({ run });
})();
