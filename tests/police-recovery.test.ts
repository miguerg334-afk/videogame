import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createPursuit } from '../src/police/pursuit';
import { rotateVector } from '../src/engine/math';
await R.init();
const dt = 1 / 120;

test('la patrulla se endereza tras quedar volcada, conserva el progreso y vuelve a conducir', () => {
  for (const [grade, roll] of [
    [0, Math.PI],
    [0, Math.PI / 2],
    [0.27, Math.PI],
  ]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    const angle = Math.atan(grade);
    world.createCollider(
      R.ColliderDesc.cuboid(10000, 0.1, 100)
        .setTranslation(0, -0.1, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }),
    );
    const police = createPursuit(world, (x) => grade * x);
    const target = { x: 9000, y: 9000 * grade + 0.7, z: 0 };
    police.reset([{ x: 0, y: 0.7, z: 0 }, target]);
    world.timestep = dt;
    const tick = () => {
      police.step(dt, target, true);
      world.step();
      police.afterStep();
    };
    try {
      for (let i = 0; i < 31 * 120; i++) tick();
      const start = police.body.translation();
      police.body.setTranslation({ x: start.x, y: grade * start.x + 0.8, z: start.z }, true);
      const yaw = 0.15;
      const q = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
      police.body.setRotation(q, true);
      police.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      police.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const elapsed = police.elapsed,
        level = police.difficulty.level;
      for (let i = 0; i < 240; i++) tick();
      assert(
        rotateVector(police.body.rotation(), { x: 0, y: 1, z: 0 }).y < 0.35,
        'no se endereza instantáneamente',
      );
      let recovered = false;
      for (let i = 0; i < 600; i++) {
        const before = police.body.translation();
        const heading = rotateVector(police.body.rotation(), { x: 1, y: 0, z: 0 });
        tick();
        if (rotateVector(police.body.rotation(), { x: 0, y: 1, z: 0 }).y > 0.9) {
          const p = police.body.translation();
          const afterHeading = rotateVector(police.body.rotation(), { x: 1, y: 0, z: 0 });
          assert(Math.hypot(p.x - before.x, p.z - before.z) < 0.03, 'se levanta en el mismo sitio');
          assert(
            Math.abs(
              Math.atan2(heading.z, heading.x) - Math.atan2(afterHeading.z, afterHeading.x),
            ) < 0.03,
            'conserva el rumbo',
          );
          assert(rotateVector(police.body.rotation(), { x: 0, y: 1, z: 0 }).y > 0.9);
          assert(police.elapsed > elapsed + 2.5 && police.elapsed < elapsed + 8);
          assert.equal(police.difficulty.level, level, 'no reinicia la dificultad');
          assert(police.difficulty.maxSpeed * 3.6 > 105, 'conserva el límite progresivo');
          recovered = true;
          break;
        }
      }
      assert(recovered, `se recupera con pendiente ${grade} y vuelco ${roll}`);
      const p = police.body.translation();
      for (let i = 0; i < 360; i++) tick();
      assert(
        police.body.translation().x > p.x + 2 && police.speed > 1,
        'reanuda la persecución sin perder la ruta',
      );
    } finally {
      police.dispose();
      world.free();
    }
  }
});

test('no endereza en el aire ni antes de iniciar la persecución', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(100, 0.1, 100).setTranslation(0, -0.1, 0));
  const police = createPursuit(world);
  const target = { x: 100, y: 20, z: 0 };
  police.reset([{ x: 0, y: 20, z: 0 }, target]);
  police.body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
  world.timestep = dt;
  try {
    for (let i = 0; i < 1200; i++) {
      police.step(dt, target, true);
      world.step();
      police.afterStep();
    }
    assert.equal(police.body.translation().y, 20, 'no se baja al suelo durante el vuelo');
    assert(rotateVector(police.body.rotation(), { x: 0, y: 1, z: 0 }).y < 0);
    police.reset([
      { x: 0, y: 0.8, z: 0 },
      { x: 100, y: 0.8, z: 0 },
    ]);
    police.body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
    for (let i = 0; i < 600; i++) {
      police.step(dt, target, false);
      world.step();
      police.afterStep();
    }
    assert(
      rotateVector(police.body.rotation(), { x: 0, y: 1, z: 0 }).y < 0,
      'no se recupera antes de comenzar',
    );
    assert.equal(police.elapsed, 0);
  } finally {
    police.dispose();
    world.free();
  }
});
