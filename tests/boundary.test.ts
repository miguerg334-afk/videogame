import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createWorldBoundary, PLAYABLE_BOUNDS as b } from '../src/world/boundary';
await R.init();
test('perímetro físico: impactos a 200 km/h, esquinas y saltos', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const boundary = createWorldBoundary(new THREE.Scene(), world, () => 0);
  try {
    for (const [x, z, vx, vz] of [
      [b.xmin + 8, 0, -200 / 3.6, 0],
      [b.xmax - 8, 0, 200 / 3.6, 0],
      [0, b.zmin + 8, 0, -200 / 3.6],
      [0, b.zmax - 8, 0, 200 / 3.6],
      [b.xmax - 8, b.zmax - 8, 39, 39],
    ]) {
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(x, 1, z).setCcdEnabled(true),
      );
      world.createCollider(R.ColliderDesc.cuboid(1, 0.5, 0.8).setDensity(300), body);
      body.setLinvel({ x: vx, y: 0, z: vz }, true);
      for (let i = 0; i < 120; i++) world.step();
      assert(boundary.distance(body.translation()) > 0, 'el muro detiene el vehículo');
      world.removeRigidBody(body);
    }
    const jumper = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(b.xmax + 20, 30, 0),
    );
    jumper.setLinvel({ x: 50, y: 2, z: 10 }, true);
    boundary.enforce(jumper);
    assert.equal(jumper.translation().x, b.xmax - 2);
    assert.equal(jumper.translation().y, 30);
    assert.equal(jumper.linvel().x, 0);
    assert.equal(jumper.linvel().z, 10);
    assert.equal(jumper.linvel().y, 2);
  } finally {
    world.free();
  }
});
