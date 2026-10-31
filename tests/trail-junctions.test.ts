import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { routeHeight } from '../src/world/route';
import { disposeScene } from '../src/engine/dispose';

await R.init();
const context = new Proxy(
  {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
  },
  { get: (target, key) => Reflect.get(target, key) || (() => {}) },
);
const document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context }),
} as unknown as Document;
const vector = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const neutral = { up: false, down: false, left: false, right: false, handbrake: false };

test('los seis accesos no invaden el asfalto ni crean escalones o choques en la carretera', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), document);
  const sim = createDrivingPhysics(map.world);
  try {
    map.world.step();
    for (const trail of map.trailNetwork.trails) {
      const mesh = scene.getObjectByName(`mountain-shortcut-${trail.name}`) as THREE.Mesh;
      const positions = mesh.geometry.getAttribute('position'),
        indices = mesh.geometry.index!;
      // Check entire triangle edges/centres as well as vertices, so a triangle
      // crossing the road cannot pass merely by having its corners off-road.
      const point = (i: number) =>
        new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i));
      for (let i = 0; i < indices.count; i += 3) {
        const a = point(i),
          b = point(i + 1),
          c = point(i + 2);
        for (const p of [
          a,
          b,
          c,
          a.clone().lerp(b, 0.5),
          b.clone().lerp(c, 0.5),
          c.clone().lerp(a, 0.5),
          a
            .clone()
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3),
        ]) {
          const { frame } = map.nearestTrack(p);
          const inside = -p.clone().sub(frame.p).dot(frame.normal);
          assert(inside > 7.9, `${trail.name}: tierra/collider dentro de la carretera (${inside})`);
          if (inside < 12)
            assert(
              Math.abs(p.y - (routeHeight(p.x, p.z) - 0.075)) < 0.025,
              'acceso enrasado con la cuneta',
            );
        }
      }
      for (const endpoint of [trail.frames[0], trail.frames.at(-1)!]) {
        const nearest = map.nearestTrack(endpoint.p);
        assert(nearest.distance > 10 && nearest.distance < 14);
        // Raycast the actual collision world over both lanes around the junction.
        for (let offset = -12; offset <= 12; offset += 2) {
          const f = map.frames[(nearest.index + offset + map.N) % map.N];
          for (const lateral of [-3.5, -1, 1, 3.5]) {
            const p = f.p.clone().addScaledVector(f.normal, lateral),
              expected = routeHeight(p.x, p.z) + 0.075;
            const hit = map.world.castRay(
              new R.Ray({ x: p.x, y: expected + 5, z: p.z }, { x: 0, y: -1, z: 0 }),
              10,
              true,
              undefined,
              undefined,
              undefined,
              sim.body,
            );
            assert(hit, 'hay superficie de carretera');
            assert(
              Math.abs(5 - hit.timeOfImpact) < 0.025,
              `${trail.name}: obstáculo elevado sobre el asfalto`,
            );
          }
        }
        // Drive past each junction in both directions with the real car body.
        for (const direction of [1, -1]) {
          const start = map.frames[(nearest.index - direction * 9 + map.N) % map.N];
          sim.reset(
            { x: start.p.x, y: start.p.y + 0.7, z: start.p.z },
            -Math.atan2(start.tangent.z * direction, start.tangent.x * direction),
            start.grade * direction,
          );
          for (let tick = 0; tick < 60; tick++) sim.step({ ...neutral, handbrake: true }, 1 / 120);
          const initial = vector(sim.body.translation());
          sim.body.setLinvel(
            {
              x: start.tangent.x * direction * 30,
              y: start.grade * direction * 30,
              z: start.tangent.z * direction * 30,
            },
            true,
          );
          for (let tick = 0; tick < 120; tick++) sim.step(neutral, 1 / 120);
          const end = vector(sim.body.translation()),
            rotation = sim.body.rotation(),
            q = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
          const progress = end.clone().sub(initial).dot(start.tangent) * direction;
          assert(progress > 22, `${trail.name}: el coche se atasca en el cruce (${progress} m)`);
          assert(
            new THREE.Vector3(0, 1, 0).applyQuaternion(q).y > 0.85,
            'el coche no vuelca en el acceso',
          );
          assert(end.y - routeHeight(end.x, end.z) < 1.5, 'no salta por un escalón invisible');
        }
      }
    }
  } finally {
    sim.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
