// "Барабан + квиток": a gold 3D drum spins while the number is registered,
// then a ticket flies out, flips to show the number, and gold confetti falls.
(function () {
  'use strict';

  const FACES = 14;
  const RADIUS = 70;
  const SLIPS = 9;
  const MIN_SPIN_MS = 1600;
  const BRAKE_MS = 1300;
  const SPEED = 0.55; // deg per ms
  const HOLD_MS = 4200;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function buildDrum() {
    const drum = el('div', 'drum');
    const faceHeight = 2 * RADIUS * Math.tan(Math.PI / FACES) + 1;
    const faces = Array.from({ length: FACES }, (_, i) => {
      const face = el('div', 'drum-face');
      face.style.height = faceHeight + 'px';
      face.style.marginTop = -faceHeight / 2 + 'px';
      face.style.transform = `rotateX(${(i * 360) / FACES}deg) translateZ(${RADIUS}px)`;
      return face;
    });
    const caps = ['left', 'right'].map((side) => el('div', 'drum-cap drum-cap-' + side));
    const slips = Array.from({ length: SLIPS }, (_, i) => {
      const slip = el('div', 'drum-slip');
      const angle = (i / SLIPS) * Math.PI * 2;
      const r = 18 + ((i * 17) % 30);
      const x = ((i * 37) % 120) - 60;
      slip.style.transform =
        `translate3d(${x}px, ${Math.sin(angle) * r}px, ${Math.cos(angle) * r}px) ` +
        `rotateX(${i * 40}deg) rotateZ(${i * 23}deg)`;
      return slip;
    });
    drum.append(...faces, ...caps, ...slips);
    return drum;
  }

  function buildTicket(texts) {
    const ticket = el('div', 'ticket3d');
    const inner = el('div', 'ticket3d-inner');
    const front = el('div', 'ticket3d-face ticket3d-front');
    const logo = el('img');
    logo.src = 'logo-gold.png';
    logo.alt = '';
    front.append(logo);
    const back = el('div', 'ticket3d-face ticket3d-back');
    const number = el('p', 'ticket3d-number');
    number.append(el('span', 'ticket3d-no', '№'), el('span', 'ticket3d-value'));
    back.append(number, el('p', 'ticket3d-who', texts.who));
    inner.append(front, back);
    ticket.append(inner);
    return ticket;
  }

  function buildScene(texts) {
    const scene = el('div', 'drum-scene');
    const rig = el('div', 'drum-rig');
    const drum = buildDrum();
    const legs = ['left', 'right'].map((side) => el('div', 'drum-leg drum-leg-' + side));
    rig.append(drum, ...legs, el('div', 'drum-axle'));
    const ticket = buildTicket(texts);
    const label = el('p', 'fx-label', texts.spinning);
    const skip = el('p', 'fx-skip', texts.skip);
    scene.append(el('div', 'drum-shadow'), rig, ticket);
    return { scene, drum, ticket, label, skip };
  }

  function createSpinner(drum) {
    let angle = 0;
    let last = performance.now();
    let frameId = 0;

    function paint() {
      drum.style.transform = `rotateX(${angle}deg)`;
    }

    function spin(now) {
      angle += SPEED * (now - last);
      last = now;
      paint();
      frameId = requestAnimationFrame(spin);
    }

    function start() {
      last = performance.now();
      frameId = requestAnimationFrame(spin);
    }

    // Quadratic brake: speed falls linearly to zero over BRAKE_MS.
    function stop() {
      cancelAnimationFrame(frameId);
      const from = angle;
      const begin = performance.now();
      return new Promise((resolve) => {
        // rAF pauses in a background tab — never let the brake hang the flow.
        const guard = setTimeout(resolve, BRAKE_MS + 300);
        function brake(now) {
          const t = Math.min(now - begin, BRAKE_MS);
          angle = from + SPEED * t - (SPEED * t * t) / (2 * BRAKE_MS);
          paint();
          if (t < BRAKE_MS) {
            frameId = requestAnimationFrame(brake);
          } else {
            clearTimeout(guard);
            resolve();
          }
        }
        frameId = requestAnimationFrame(brake);
      });
    }

    function cancel() {
      cancelAnimationFrame(frameId);
    }

    return Object.freeze({ start, stop, cancel });
  }

  async function run(task, texts) {
    const { open, wait } = window.RBBStage;

    const stage = open('fx-drum');
    const view = buildScene(texts);
    stage.root.append(view.scene, view.label, view.skip);
    const spinner = createSpinner(view.drum);
    spinner.start();

    let result;
    try {
      [result] = await Promise.all([task, wait(MIN_SPIN_MS)]);
    } catch (error) {
      spinner.cancel();
      await stage.close();
      throw error;
    }

    await spinner.stop();
    view.ticket.querySelector('.ticket3d-value').textContent = String(result.number);
    stage.root.classList.add('is-out');
    await wait(900);
    stage.root.classList.add('is-flipped');
    await wait(500);
    const box = view.ticket.getBoundingClientRect();
    stage.confetti({ x: box.left + box.width / 2, y: box.top - 10, count: 140, durationMs: 4500 });
    view.label.textContent = texts.done;
    stage.root.classList.add('is-done');
    await stage.holdOrTap(HOLD_MS);
    await stage.close();
    return result;
  }

  window.RBBDrum = Object.freeze({ run });
})();
