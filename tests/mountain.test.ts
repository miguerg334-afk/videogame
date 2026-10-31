import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import * as THREE from 'three';
import { createMountainWorld } from '../src/world/mountain.js';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { constrainChaseCamera } from '../src/engine/camera';
import { rotateVector } from '../src/engine/math';
import { disposeScene } from '../src/engine/dispose';

await R.init();
// Only procedural texture canvases are stubbed; all meshes and Rapier colliders are real.
const context = new Proxy(
  {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
  },
  { get: (target, key) => Reflect.get(target, key) || (() => {}) },
);
const canvasDocument = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context }),
} as unknown as Document;

test('ruta de montaña: pendientes, túneles transitables y cámara dentro de la galería', () => {
  const scene = new THREE.Scene();
  const map = createMountainWorld(scene, new THREE.Group(), canvasDocument);
  const sim = createDrivingPhysics(map.world);
  const neutral = { up: false, down: false, left: false, right: false, handbrake: false };
  try {
    const heights = map.frames.map((f) => f.p.y);
    assert(map.trackLength > 5000);
    assert(Math.max(...heights) - Math.min(...heights) > 220);
    const maximumGrade = Math.max(...map.frames.map((f) => Math.abs(f.grade)));
    assert(maximumGrade > 0.25 && maximumGrade < 0.3);
    console.log({
      kilometers: map.trackLength / 1000,
      altitudeRange: Math.max(...heights) - Math.min(...heights),
      maximumGrade,
    });
    const { mesh, columns, rows } = map.terrain;
    assert.equal(
      mesh.geometry.index!.count,
      columns * rows * 6,
      'ningún triángulo del terreno se elimina',
    );
    assert(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite));
    // Spatial acceleration must preserve the original exact nearest-point result.
    for (let i = 0; i < 30; i++) {
      const point = { x: -1400 + ((i * 971) % 4200), z: -1700 + ((i * 613) % 3200) };
      const reference = Math.min(
        ...map.frames.slice(0, -1).map((f) => Math.hypot(point.x - f.p.x, point.z - f.p.z)),
      );
      assert(Math.abs(map.nearestTrack(point).distance - reference) < 1e-8);
    }
    assert.equal(map.tunnelRanges.length, 2);
    for (const tunnel of map.tunnelRanges) {
      const frame = map.frames[Math.round((tunnel.start + tunnel.end) / 2)];
      sim.reset(
        { x: frame.p.x, y: frame.p.y + 0.7, z: frame.p.z },
        -Math.atan2(frame.tangent.z, frame.tangent.x),
        frame.grade,
      );
      for (let i = 0; i < 240; i++) sim.step(neutral, 1 / 120);
      const p = sim.body.translation();
      assert.equal(sim.wheels.filter((_, i) => sim.vehicle.wheelIsInContact(i)).length, 4);
      assert(p.y - map.routeHeight(p.x, p.z) > 0.3 && p.y - map.routeHeight(p.x, p.z) < 0.9);
      for (const side of [-1, 1]) {
        const camera = frame.p.clone().addScaledVector(frame.normal, side * 9);
        camera.y += 25;
        constrainChaseCamera(camera, map, p);
        assert(map.nearestTrack(camera).distance < 5);
        assert(camera.y - map.routeHeight(camera.x, camera.z) < 5);
      }
    }
    const first = map.tunnelRanges[0],
      frame = map.frames[first.start - 25];
    sim.reset(
      { x: frame.p.x, y: frame.p.y + 0.7, z: frame.p.z },
      -Math.atan2(frame.tangent.z, frame.tangent.x),
      frame.grade,
    );
    for (let i = 0; i < 1800; i++) sim.step({ ...neutral, up: true }, 1 / 120);
    assert(sim.body.translation().x > map.frames[first.end].p.x, 'cruza el primer túnel');
    const down = map.frames[map.tunnelRanges[1].start + 20];
    sim.reset(
      { x: down.p.x, y: down.p.y + 0.7, z: down.p.z },
      -Math.atan2(down.tangent.z, down.tangent.x),
      down.grade,
    );
    for (let i = 0; i < 900; i++) sim.step({ ...neutral, up: true }, 1 / 120);
    assert(sim.body.translation().x < down.p.x - 40);
    assert(sim.body.translation().y < down.p.y, 'desciende al seguir la pendiente');
    // Start from rest on the steep ascent; test real wheel traction, then gravity on descent.
    for (const ascent of [true, false]) {
      const f = map.frames.find(
        (f) => f.p.x > 1100 && f.p.x < 1110 && (ascent ? f.p.z > 0 : f.p.z < -500),
      )!;
      assert(f, 'existe el tramo de montaña');
      assert(ascent ? f.grade > 0.24 : f.grade < -0.24);
      sim.reset(
        { x: f.p.x, y: f.p.y + 0.7, z: f.p.z },
        -Math.atan2(f.tangent.z, f.tangent.x),
        f.grade,
      );
      let minimumClearance = Infinity;
      for (let i = 0; i < 600; i++) {
        sim.step({ ...neutral, up: true }, 1 / 120);
        const p = sim.body.translation();
        minimumClearance = Math.min(minimumClearance, p.y - map.routeHeight(p.x, p.z));
      }
      const end = sim.body.translation();
      console.log(ascent ? 'Ascensión' : 'Descenso', {
        distance: end.x - f.p.x,
        elevation: end.y - f.p.y,
        minimumClearance,
      });
      assert(ascent ? end.x > f.p.x + 15 : end.x < f.p.x - 30);
      assert(ascent ? end.y > f.p.y + 4 : end.y < f.p.y - 6);
      assert(minimumClearance > 0.25, 'el chasis permanece sobre el asfalto');
    }
    const entry = map.trailNetwork.trails[0].frames[0],
      ahead = map.trailNetwork.trails[0].frames[8];
    sim.reset(
      { x: entry.p.x, y: entry.p.y + 0.8, z: entry.p.z },
      -Math.atan2(ahead.p.z - entry.p.z, ahead.p.x - entry.p.x),
    );
    for (let i = 0; i < 600; i++) sim.step({ ...neutral, up: true }, 1 / 120, true);
    assert(
      map.nearestTrack(sim.body.translation()).distance > 25,
      'se sale al interior sin encontrar una defensa invisible',
    );
    const outside = map.frames[0];
    sim.reset(
      { x: outside.p.x, y: outside.p.y + 0.8, z: outside.p.z },
      -Math.atan2(outside.normal.z, outside.normal.x),
    );
    for (let i = 0; i < 600; i++) sim.step({ ...neutral, up: true }, 1 / 120, true);
    assert(
      map.nearestTrack(sim.body.translation()).distance > 25,
      'se sale también al exterior sin defensas invisibles',
    );
    assert(!scene.getObjectByName('corrugated-guardrails'));
    assert(map.forest.count >= 1700);
    assert(map.forest.positions.every((p) => map.boundary.distance(p) > 10));
    assert.equal(map.trailNetwork.trails.length, 3);
    for (const trail of map.trailNetwork.trails) {
      const grade = Math.max(...trail.frames.map((f) => Math.abs(f.grade)));
      console.log(trail.name, { length: trail.length, maximumGrade: grade });
      assert(grade < 0.45, 'el atajo tiene pendientes transitables');
      for (const f of [trail.frames[0], trail.frames[trail.frames.length - 1]]) {
        assert(
          map.nearestTrack(f.p).distance > 10 && map.nearestTrack(f.p).distance < 14,
          'el acceso queda en la cuneta interior, fuera del asfalto',
        );
        assert(
          !map.tunnelForIndex(map.nearestTrack(f.p).index),
          'no desemboca en una pared de túnel',
        );
      }
      const f = trail.frames[18];
      sim.reset(
        { x: f.p.x, y: f.p.y + 0.8, z: f.p.z },
        -Math.atan2(f.tangent.z, f.tangent.x),
        f.grade,
      );
      let reached = 0,
        minimumY = Infinity;
      for (let tick = 0; tick < 15000; tick++) {
        const p = sim.body.translation();
        const near = map.trailNetwork.sample(p);
        const current = near.trail === trail ? near.index : reached;
        reached = Math.max(reached, current);
        if (reached > trail.frames.length - 12) break;
        const velocity = sim.body.linvel(),
          speed = Math.hypot(velocity.x, velocity.z);
        const target =
          trail.frames[
            Math.min(trail.frames.length - 1, current + Math.round((7 + speed * 0.65) / 1.6))
          ].p;
        const forward = rotateVector(sim.body.rotation(), { x: 1, y: 0, z: 0 }),
          dx = target.x - p.x,
          dz = target.z - p.z;
        const error = Math.atan2(forward.x * dz - forward.z * dx, forward.x * dx + forward.z * dz);
        const input = {
          ...neutral,
          up: speed < 9,
          down: speed > 11,
          left: error < -0.025,
          right: error > 0.025,
        };
        sim.step(input, 1 / 120, true);
        minimumY = Math.min(minimumY, p.y - map.terrainHeight(p.x, p.z));
      }
      console.log('Recorrido', trail.name, {
        progress: reached / (trail.frames.length - 1),
        minimumY,
      });
      assert(
        reached > trail.frames.length * 0.9,
        'se puede recorrer físicamente el atajo de principio a fin',
      );
    }
    for (const tree of map.forest.positions)
      assert(map.trailNetwork.sample(tree).distance >= 17, 'los accesos no tienen árboles');
  } finally {
    sim.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
