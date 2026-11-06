// Gold leaves & sparkles on a <canvas>: pseudo-3D flip via vertical scaling. Physics is pure for tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RBBConfetti = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const COLORS = Object.freeze(['#b8954a', '#e3cf86', '#f8f4c0', '#d4b46a', '#fbf8ea']);
  const GRAVITY = 0.0006; // px/ms²
  const DRAG = 0.004; // per ms → falling speed settles near GRAVITY / DRAG
  const SWAY = 0.04;

  function createParticles({ count, x, y, power = 1, rand = Math.random }) {
    return Array.from({ length: count }, () => {
      const direction = rand() * Math.PI * 2;
      const speed = (0.35 + rand() * 0.9) * power;
      return Object.freeze({
        x,
        y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed - 0.45 * power,
        size: 5 + rand() * 8,
        angle: rand() * Math.PI,
        spin: (rand() - 0.5) * 0.02,
        phase: rand() * Math.PI * 2,
        flip: 0.004 + rand() * 0.01,
        color: COLORS[Math.floor(rand() * COLORS.length)],
        leaf: rand() < 0.6,
      });
    });
  }

  function stepParticle(p, dt) {
    const keep = Math.max(0, 1 - DRAG * dt);
    return Object.freeze({
      ...p,
      x: p.x + p.vx * dt + Math.sin(p.phase) * SWAY * dt,
      y: p.y + p.vy * dt,
      vx: p.vx * keep,
      vy: p.vy * keep + GRAVITY * dt,
      angle: p.angle + p.spin * dt,
      phase: p.phase + p.flip * dt,
    });
  }

  function drawParticle(ctx, p, alpha) {
    const tilt = Math.cos(p.phase);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.scale(1, Math.max(Math.abs(tilt), 0.08));
    ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.abs(tilt));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    if (p.leaf) {
      ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
    } else {
      ctx.rect(-p.size * 0.35, -p.size * 0.35, p.size * 0.7, p.size * 0.7);
    }
    ctx.fill();
    ctx.restore();
  }

  // Runs one burst on the canvas; resolves when finished.
  function burst(canvas, { x, y, count = 120, power = 1, durationMs = 4000 }) {
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    let particles = createParticles({ count, x, y, power });
    const start = performance.now();
    let last = start;

    return new Promise((resolve) => {
      function frame(now) {
        const dt = Math.min(now - last, 40);
        last = now;
        const elapsed = now - start;
        const alpha = Math.min(1, Math.max(0, (durationMs - elapsed) / 800));
        particles = particles.map((p) => stepParticle(p, dt));
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        particles.forEach((p) => drawParticle(ctx, p, alpha));
        if (elapsed < durationMs) {
          requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  return Object.freeze({ createParticles, stepParticle, burst });
});
