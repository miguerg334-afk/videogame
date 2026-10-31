import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createPursuitNavigation } from '../src/police/navigation';
import { createPursuit } from '../src/police/pursuit';
import type { RouteFrame } from '../src/engine/types';
await R.init();
const dt = 1 / 120;
function rectangle(): RouteFrame[] {
  const points = [
    [-60, 0],
    [-60, 60],
    [60, 60],
    [60, -60],
    [-60, -60],
    [-60, 0],
  ];
  const frames: RouteFrame[] = [];
  for (let side = 0; side < points.length - 1; side++) {
    const [x, z] = points[side],
      [bx, bz] = points[side + 1],
      steps = Math.ceil(Math.hypot(bx - x, bz - z) / 2);
    for (let i = 0; i < steps; i++) {
      const tangent = new THREE.Vector3(bx - x, 0, bz - z).normalize();
      frames.push({
        p: new THREE.Vector3(x + ((bx - x) * i) / steps, 0, z + ((bz - z) * i) / steps),
        tangent,
        normal: new THREE.Vector3(-tangent.z, 0, tangent.x),
        t: 0,
        grade: 0,
      });
    }
  }
  frames.push(frames[0]);
  return frames;
}
test('ruta al objetivo actual por el camino corto, evitando muros y superficies apiladas', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0));
  world.createCollider(R.ColliderDesc.cuboid(1, 4, 30).setTranslation(0, 4, 0));
  world.step();
  const nav = createPursuitNavigation({
    world,
    frames: rectangle(),
    trailNetwork: { trails: [] },
    driveGroundHeight: () => 0,
  });
  const from = { x: -60, y: 0.7, z: 0 },
    target = { x: 60, y: 0.7, z: 0 };
  try {
    assert(!nav.clearSegment(from, target));
    const route = nav.plan(from, target);
    assert(route.length > 2);
    for (let i = 1; i < route.length; i++)
      assert(nav.clearSegment(route[i - 1], route[i]), 'los tramos no atraviesan el muro');
    const near = { x: -60, y: 0.7, z: 8 };
    assert.equal(
      nav.plan(from, near).length,
      2,
      'no recorre el circuito para ir a un objetivo cercano',
    );
    assert(!nav.clearSegment(from, { ...from, y: 8 }), 'no confunde el techo con el interior');
  } finally {
    world.free();
  }
});

test('ignora la vuelta histórica y persigue al jugador que se ha quedado cerca', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0));
  const police = createPursuit(world),
    target = { x: -30, y: 0.65, z: 12 };
  police.reset([
    { x: -40, y: 0.65, z: 0 },
    { x: 120, y: 0.65, z: 0 },
    { x: 120, y: 0.65, z: 120 },
    { x: -30, y: 0.65, z: 120 },
    target,
  ]);
  world.timestep = dt;
  let minimum = Infinity,
    maximumX = -Infinity;
  try {
    for (let tick = 0; tick < 120 * 20; tick++) {
      police.step(dt, target, true);
      world.step();
      police.afterStep();
      const p = police.body.translation();
      minimum = Math.min(minimum, Math.hypot(p.x - target.x, p.z - target.z));
      maximumX = Math.max(maximumX, p.x);
    }
    assert(minimum < 4, 'alcanza al jugador cercano');
    assert(maximumX < 0, 'no se marcha a repetir el recorrido viejo');
  } finally {
    police.dispose();
    world.free();
  }
});

test('anticipa al objetivo móvil y limita los recálculos, sin planificar a 120 Hz', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0));
  let plans = 0,
    latestGoal = 0;
  const police = createPursuit(world, () => 0, {
    clearSegment: () => true,
    plan: (from, target) => {
      plans++;
      latestGoal = target.x;
      return [from, target];
    },
  });
  police.reset([
    { x: 0, y: 0.65, z: 0 },
    { x: 100, y: 0.65, z: 20 },
  ]);
  world.timestep = dt;
  try {
    for (let tick = 0; tick < 120; tick++) {
      police.step(dt, { x: 100 + tick * dt * 10, y: 0.65, z: 20 }, true);
      world.step();
      police.afterStep();
    }
    assert(plans >= 2 && plans <= 4);
    assert(
      latestGoal > 110,
      'apunta por delante de la posición que tenía el jugador al recalcular',
    );
  } finally {
    police.dispose();
    world.free();
  }
});
