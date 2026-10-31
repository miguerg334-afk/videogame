import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { createMountainWorld } from '../src/world/mountain.js';
import { createPursuit } from '../src/police/pursuit';
import { disposeScene } from '../src/engine/dispose';
await R.init();
const neutral = { up: false, down: false, left: false, right: false, handbrake: false };

test('enderezar mantiene X/Z, dirección y límite progresivo; estabiliza el coche en pendiente', () => {
  for (const grade of [0, 0.27, -0.27]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 }),
      sim = createDrivingPhysics(world),
      angle = Math.atan(grade),
      yaw = 0.4;
    world.createCollider(
      R.ColliderDesc.cuboid(500, 0.1, 100)
        .setTranslation(0, -0.1, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }),
    );
    try {
      sim.reset({ x: 12, y: grade * 12 + 0.8, z: 7 }, yaw);
      const upside = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      sim.body.setRotation(upside, true);
      sim.body.setLinvel({ x: 5, y: 2, z: 2 }, true);
      sim.body.setAngvel({ x: 4, y: 1, z: 3 }, true);
      world.step();
      sim.setPursuitTime(90);
      const before = sim.body.translation(),
        beforeQ = sim.body.rotation();
      const previousHeading = new THREE.Vector3(1, 0, 0).applyQuaternion(
        new THREE.Quaternion(beforeQ.x, beforeQ.y, beforeQ.z, beforeQ.w),
      );
      const expectedYaw = Math.atan2(-previousHeading.z, previousHeading.x);
      sim.recover((x) => grade * x);
      const p = sim.body.translation(),
        q = sim.body.rotation(),
        rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      assert.equal(p.x, before.x);
      assert.equal(p.z, before.z);
      assert.equal(sim.speedLimitKmh, 115, 'no reinicia la dificultad');
      assert(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).y > 0.94);
      const heading = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
      assert(Math.abs(Math.atan2(-heading.z, heading.x) - expectedYaw) < 0.02);
      assert.equal(sim.body.linvel().x, 0);
      assert.equal(sim.body.angvel().x, 0);
      for (let i = 0; i < 120; i++) sim.step(neutral, 1 / 60);
      const end = sim.body.translation();
      assert(end.y - grade * end.x > 0.3, 'no queda enterrado');
    } finally {
      sim.dispose();
      world.free();
    }
  }
});
const ctx = new Proxy(
  {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
  },
  { get: (t, k) => Reflect.get(t, k) || (() => {}) },
);
const document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
} as unknown as Document;
test('enderezar dentro y encima del túnel usa la superficie real sin reiniciar la persecución', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), document),
    sim = createDrivingPhysics(map.world),
    police = createPursuit(map.world);
  const f = map.frames[Math.round((map.tunnelRanges[0].start + map.tunnelRanges[0].end) / 2)];
  police.reset([
    { x: f.p.x - 55, y: f.p.y + 0.7, z: f.p.z },
    { x: f.p.x, y: f.p.y + 0.7, z: f.p.z },
  ]);
  try {
    for (const roof of [false, true]) {
      sim.reset({ x: f.p.x, y: f.p.y + (roof ? 8 : 1.1), z: f.p.z }, 0);
      for (let tick = 0; tick < 180; tick++) {
        police.step(1 / 120, sim.body.translation(), true);
        sim.step(neutral, 1 / 120);
        police.afterStep();
      }
      sim.body.setRotation({ x: 1, y: 0, z: 0, w: 0 }, true);
      map.world.step();
      const before = sim.body.translation(),
        time = police.elapsed;
      assert(time > 1, 'la persecución ya tiene progreso');
      sim.recover(map.driveGroundHeight);
      const p = sim.body.translation();
      assert.equal(p.x, before.x);
      assert.equal(p.z, before.z);
      assert.equal(police.elapsed, time);
      if (roof) assert(p.y > f.p.y + 5.5, 'se queda sobre el techo');
      else assert(p.y < f.p.y + 1.2, 'permanece dentro del túnel');
      for (let i = 0; i < 60; i++) sim.step(neutral, 1 / 60);
      assert(sim.body.translation().y > f.p.y + 0.3);
    }
  } finally {
    sim.dispose();
    police.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
