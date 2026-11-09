import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import * as THREE from 'three';
import { createMissiles } from '../src/police/missiles';
import { MISSILE_PROFILES } from '../src/police/missile-profiles';
import { createMissileVisual } from '../src/police/missile-visual';
import { applyExplosionImpulse } from '../src/vehicle/blast';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { rotateVector } from '../src/engine/math';
import { pursuitDifficulty } from '../src/police/pursuit';
import { disposeScene } from '../src/engine/dispose';
await R.init();
const dt = 1 / 60,
  origin = { x: 0, y: 30, z: 0 },
  target = { x: 80, y: 0.7, z: 0 };

test('level eight unlocks at six minutes with a full heavy warning and alternating payloads', () => {
  assert.equal(pursuitDifficulty(359.999).level, 7);
  assert.equal(pursuitDifficulty(360).level, 8);
  assert.equal(pursuitDifficulty(360).levelCount, 8);
  assert.equal(pursuitDifficulty(360).maxSpeed, pursuitDifficulty(300).maxSpeed);
  const fired: string[] = [];
  const state = createMissiles(
    () => 0,
    (_, kind) => fired.push(kind),
  );
  state.step(dt, true, origin, target, 359.99);
  assert.equal(state.warning, 0);
  state.step(dt, true, origin, target, 360);
  assert.equal(state.warningKind, 'heavy');
  assert(state.warning > 2.7);
  const warning = state.warning;
  state.step(0, true, origin, target, 360);
  assert.equal(state.warning, warning);
  for (let i = 0; i < 25 * 60; i++) state.step(dt, true, origin, target, 360 + i * dt);
  assert.deepEqual(fired.slice(0, 3), ['heavy', 'normal', 'heavy']);
  state.reset();
  state.step(dt, true, origin, target, 300);
  assert.equal(state.warning, 0);
  assert.equal(state.warningKind, 'normal');
  assert(state.missiles.every((m) => !m.active));
});

test('heavy shockwave reaches beyond the old radius and respects its own boundary', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    car = createDrivingPhysics(world);
  try {
    const p = car.body.worldCom(),
      impact = { x: p.x, y: p.y, z: p.z - 15 };
    assert(!applyExplosionImpulse(car.body, impact, 'normal'));
    assert(applyExplosionImpulse(car.body, impact, 'heavy'));
    assert(car.body.linvel().y > 1);
    assert(Math.hypot(...Object.values(car.body.angvel())) <= 5.00001);
    assert(!applyExplosionImpulse(car.body, { x: p.x, y: p.y, z: p.z - 22 }, 'heavy'));
  } finally {
    car.dispose();
    world.free();
  }
});

test('a nearby heavy blast really overturns the vehicle using wheel physics, from side or nose', () => {
  for (const direction of ['side', 'nose']) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(R.ColliderDesc.cuboid(200, 0.2, 200).setTranslation(0, -0.2, 0));
    const car = createDrivingPhysics(world),
      input = { up: false, down: false, left: false, right: false, handbrake: false };
    try {
      car.reset({ x: 0, y: 1, z: 0 }, 0);
      for (let i = 0; i < 120; i++) car.step(input, dt);
      const p = car.body.translation();
      assert(rotateVector(car.body.rotation(), { x: 0, y: 1, z: 0 }).y > 0.95);
      applyExplosionImpulse(
        car.body,
        { x: p.x - (direction === 'nose' ? 2 : 0), y: 0, z: p.z - (direction === 'side' ? 2 : 0) },
        'heavy',
      );
      let minUp = 1;
      for (let i = 0; i < 120; i++) {
        car.step(input, dt);
        minUp = Math.min(minUp, rotateVector(car.body.rotation(), { x: 0, y: 1, z: 0 }).y);
      }
      assert(minUp < -0.1, `${direction}: must pass beyond 90 degrees, got up=${minUp}`);
    } finally {
      car.dispose();
      world.free();
    }
  }
});

test('heavy effects have a separate model, a larger blast, a bounded pool and no dynamic lights', () => {
  const scene = new THREE.Scene(),
    visual = createMissileVisual(scene, () => 0),
    state = createMissiles(() => 0);
  try {
    state.step(dt, true, origin, target, 360);
    for (let i = 0; i < 180 && !state.missiles.some((m) => m.active); i++)
      state.step(dt, true, origin, target, 360);
    const missile = state.missiles.find((m) => m.active)!;
    assert.equal(missile.kind, 'heavy');
    visual.update(state);
    const heavy = visual.root.getObjectByName('titan-missile')!;
    assert(heavy.visible);
    assert(!visual.root.getObjectByName('standard-missile')!.visible);
    for (let i = 0; i < 200 && !state.blasts.some((b) => b.active); i++)
      state.step(dt, true, origin, target, 360);
    const blast = state.blasts.find((b) => b.active)!;
    assert.equal(blast.kind, 'heavy');
    assert(MISSILE_PROFILES.heavy.radius > MISSILE_PROFILES.normal.radius * 2);
    assert(MISSILE_PROFILES.heavy.scale > 2);
    blast.age = 1.5;
    visual.update(state);
    let lights = 0;
    scene.traverse((o) => {
      if (o instanceof THREE.Light) lights++;
    });
    assert.equal(lights, 0);
    assert.equal(state.blasts.length, 6);
    state.reset();
    visual.update(state);
    assert(!visual.root.visible);
  } finally {
    disposeScene(scene);
  }
});

test('an overhead TITAN can be avoided at player speed by leaving its warned aim point', () => {
  const moving = { x: 0, y: 0.7, z: 0 },
    above = { x: 0, y: 30, z: 0 };
  const misses: number[] = [];
  const state = createMissiles(
    () => 0,
    (p) => misses.push(Math.hypot(p.x - moving.x, p.z - moving.z)),
  );
  state.step(dt, true, above, moving, 360);
  assert.equal(state.warningAim.x, 0);
  for (let i = 0; i < 6 * 60; i++) {
    moving.x += 30 * dt;
    state.step(dt, true, above, moving, 360 + i * dt);
  }
  assert.equal(misses.length, 1);
  assert(misses[0] > 22, 'driving away from the warning ring must clear the heavy blast');
});
