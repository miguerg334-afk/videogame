import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMissiles, MISSILE_SPEED, MISSILE_TURN_RATE } from '../src/police/missiles';
const dt = 1 / 60,
  origin = { x: 0, y: 30, z: 0 },
  target = { x: 80, y: 0.7, z: 0 };
function launch(state: ReturnType<typeof createMissiles>) {
  for (let i = 0; i < 600 && !state.missiles.some((m) => m.active); i++)
    state.step(dt, true, origin, target);
  assert(state.missiles.some((m) => m.active));
}
test('no attacks before helicopter; warning precedes launch; pause and reset clear no time implicitly', () => {
  const state = createMissiles(() => 0);
  for (let i = 0; i < 1000; i++) state.step(dt, false, origin, target);
  assert.equal(state.warning, 0);
  assert(state.missiles.every((m) => !m.active));
  for (let i = 0; i < 365; i++) state.step(dt, true, origin, target);
  assert(state.warning > 1.6);
  const warning = state.warning;
  state.step(0, true, origin, target);
  assert.equal(state.warning, warning);
  launch(state);
  state.reset();
  assert(state.missiles.every((m) => !m.active));
  assert(state.blasts.every((b) => !b.active));
  assert.equal(state.warning, 0);
});
test('missiles obey speed and angular limits; late lateral maneuver evades terminal guidance', () => {
  const escaped = { ...target };
  const misses: number[] = [];
  const state = createMissiles(
    () => 0,
    (p) => misses.push(Math.hypot(p.x - escaped.x, p.z - escaped.z)),
  );
  launch(state);
  const missile = state.missiles.find((m) => m.active)!;
  while (
    missile.active &&
    Math.hypot(
      missile.position.x - target.x,
      missile.position.y - target.y,
      missile.position.z - target.z,
    ) > 45
  )
    state.step(dt, true, origin, target);
  assert(missile.active);
  const previous = { ...missile.position },
    direction = { ...missile.direction };
  escaped.z += 35 * dt;
  state.step(dt, true, origin, escaped);
  assert(
    Math.hypot(
      missile.position.x - previous.x,
      missile.position.y - previous.y,
      missile.position.z - previous.z,
    ) <=
      MISSILE_SPEED * dt + 1e-8,
  );
  const angle = Math.acos(
    Math.min(
      1,
      direction.x * missile.direction.x +
        direction.y * missile.direction.y +
        direction.z * missile.direction.z,
    ),
  );
  assert(angle <= MISSILE_TURN_RATE * dt + 1e-7);
  for (let i = 0; i < 180; i++) {
    escaped.z += 35 * dt;
    state.step(dt, true, origin, escaped);
  }
  assert.equal(misses.length, 1);
  assert(
    misses.every((distance) => distance > 9),
    'a continuous lateral maneuver clears the blast radius',
  );
});
test('swept ground impacts emit one explosion, expire, and keep memory bounded', () => {
  let impacts = 0;
  const state = createMissiles(
    (x) => (x > 30 ? 20 : 0),
    () => impacts++,
  );
  launch(state);
  for (let i = 0; i < 180; i++) state.step(dt, true, origin, target);
  assert.equal(impacts, 1);
  assert(state.missiles.every((m) => !m.active));
  for (let i = 0; i < 180; i++) state.step(dt, true, origin, target);
  assert(state.blasts.every((b) => !b.active));
  assert.equal(state.missiles.length, 3);
  assert.equal(state.blasts.length, 6);
});

test('a stationary target can be hit at different frame rates', () => {
  for (const hz of [30, 60, 120]) {
    let hits = 0;
    const state = createMissiles(
      () => 0,
      (p) => {
        if (Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z) < 9) hits++;
      },
    );
    for (let i = 0; i < hz * 10; i++) state.step(1 / hz, true, origin, target);
    assert.equal(hits, 1);
    state.reset();
    state.step(1 / hz, true, origin, target);
    assert(state.missiles.every((m) => !m.active));
  }
});

test('terminal guidance never reacquires after a dodge; lifetime expiry causes no phantom blast', () => {
  let hits = 0;
  const state = createMissiles(
    () => -10000,
    () => hits++,
  );
  const high = { x: 80, y: 1000, z: 0 };
  for (let i = 0; i < 14.3 * 60; i++) state.step(dt, true, origin, high);
  assert.equal(hits, 0);
  assert(state.missiles.every((m) => !m.active));
  state.reset();
  launch(state);
  const missile = state.missiles.find((m) => m.active)!;
  Object.assign(missile.position, { x: target.x - 15, y: target.y, z: target.z });
  state.step(dt, true, origin, target);
  assert(!missile.guiding);
  const direction = { ...missile.direction };
  state.step(dt, true, origin, { x: 200, y: 20, z: 100 });
  assert.deepEqual(missile.direction, direction);
});
