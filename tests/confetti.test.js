const test = require('node:test');
const assert = require('node:assert/strict');
const { createParticles, stepParticle } = require('../effects/confetti.js');

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

test('creates the requested number of particles at the origin', () => {
  const particles = createParticles({ count: 30, x: 100, y: 50, rand: seeded(7) });
  assert.equal(particles.length, 30);
  particles.forEach((p) => {
    assert.equal(p.x, 100);
    assert.equal(p.y, 50);
    assert.ok(Object.isFrozen(p));
  });
});

test('is deterministic for the same random source', () => {
  assert.deepEqual(
    createParticles({ count: 5, x: 0, y: 0, rand: seeded(3) }),
    createParticles({ count: 5, x: 0, y: 0, rand: seeded(3) }),
  );
});

test('particles slow down and then fall gently', () => {
  const [start] = createParticles({ count: 1, x: 0, y: 0, rand: () => 0.75 });
  const after = Array.from({ length: 300 }).reduce((p) => stepParticle(p, 16), start);
  assert.ok(after.vy > 0, 'falls down eventually');
  assert.ok(after.vy < 0.2, 'falls slowly like a leaf');
  assert.ok(Math.abs(after.vx) < 0.01, 'sideways burst fades');
});

test('stepParticle does not mutate the particle', () => {
  const [p] = createParticles({ count: 1, x: 0, y: 0, rand: seeded(11) });
  const copy = { ...p };
  stepParticle(p, 16);
  assert.deepEqual({ ...p }, copy);
});
