import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { applyExplosionImpulse } from '../src/vehicle/blast';
import { createGameSession } from '../src/app/session';
await R.init();

test('player and both patrols receive identical physical shockwaves, including spin and lift', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const cars = Array.from({ length: 3 }, () => createDrivingPhysics(world));
  try {
    for (const car of cars) {
      car.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
      assert(applyExplosionImpulse(car.body, { x: 0, y: 0, z: -2 }));
      assert(car.body.linvel().z > 5, 'side impact creates a substantial sideways skid');
      assert(car.body.linvel().y > 2, 'lift unloads the wheels');
      assert(Math.abs(car.body.angvel().x) > 1, 'side impact can roll the car');
      assert(Math.abs(car.body.angvel().y) > 0.1, 'yaw disrupts the heading');
    }
    for (const car of cars.slice(1)) {
      assert.deepEqual(car.body.linvel(), cars[0].body.linvel());
      assert.deepEqual(car.body.angvel(), cars[0].body.angvel());
    }
  } finally {
    cars.forEach((c) => c.dispose());
    world.free();
  }
});

test('blast weakens with distance, leaves distant cars untouched, and direct centre hits remain finite', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const car = createDrivingPhysics(world);
  try {
    const p = car.body.worldCom();
    applyExplosionImpulse(car.body, { x: p.x, y: p.y, z: p.z - 1 });
    const near = car.body.linvel().z;
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    car.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    applyExplosionImpulse(car.body, { x: p.x, y: p.y, z: p.z - 7 });
    assert(car.body.linvel().z > 0 && car.body.linvel().z < near);
    const before = { ...car.body.linvel() },
      spin = { ...car.body.angvel() };
    assert(!applyExplosionImpulse(car.body, { x: p.x, y: p.y, z: p.z - 9 }));
    assert.deepEqual({ ...car.body.linvel() }, before);
    assert.deepEqual({ ...car.body.angvel() }, spin);
    assert(applyExplosionImpulse(car.body, p));
    assert(
      [...Object.values(car.body.linvel()), ...Object.values(car.body.angvel())].every(
        Number.isFinite,
      ),
    );
    assert(Math.hypot(car.body.angvel().x, car.body.angvel().z) > 0);
  } finally {
    car.dispose();
    world.free();
  }
});

test('missile shockwave does not defeat the player; normal sustained contact still does', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    car = createDrivingPhysics(world),
    session = createGameSession();
  try {
    session.start();
    for (let i = 0; i < 5; i++) applyExplosionImpulse(car.body, { x: 0, y: 0, z: -1 });
    assert(session.running);
    assert.equal(session.captureSeconds, 0);
    assert(!session.updateCapture(true, 4.9));
    assert(session.updateCapture(true, 0.1));
    assert(session.caught);
  } finally {
    car.dispose();
    world.free();
  }
});
