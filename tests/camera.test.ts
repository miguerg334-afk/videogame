import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createRouteLookup } from '../src/world/route';
import { constrainChaseCamera, tunnelInteriorAt } from '../src/engine/camera';
import { createMountainWorld } from '../src/world/mountain.js';
import type { RouteFrame } from '../src/engine/types';
import { disposeScene } from '../src/engine/dispose';
await R.init();
const frames: RouteFrame[] = Array.from({ length: 101 }, (_, i) => ({
  p: new THREE.Vector3(i, 0, 0),
  tangent: new THREE.Vector3(1, 0, 0),
  normal: new THREE.Vector3(0, 0, 1),
  grade: 0,
  t: i / 100,
}));
const tunnel = { name: 'Galería', start: 20, end: 80, from: 20, to: 80, north: true };
const route = {
  frames,
  nearestTrack: createRouteLookup(frames),
  tunnelForIndex: (index: number) => (index >= 20 && index <= 80 ? tunnel : undefined),
  routeHeight: () => 0,
  driveGroundHeight: () => 0,
};
test('no atrae la cámara al túnel desde los lados, el techo o antes de la boca', () => {
  for (const z of [-12, -7.4, 7.4, 12]) {
    const vehicle = new THREE.Vector3(45, 0.7, z),
      camera = new THREE.Vector3(38, 4, z);
    assert(!tunnelInteriorAt(vehicle, route));
    constrainChaseCamera(camera, route, vehicle);
    assert.equal(camera.z, z);
    assert.equal(camera.y, 4);
  }
  for (const x of [19.7, 80.3]) {
    const vehicle = new THREE.Vector3(x, 0.7, 0),
      camera = new THREE.Vector3(x, 9, 9);
    assert(!tunnelInteriorAt(vehicle, route));
    constrainChaseCamera(camera, route, vehicle);
    assert.equal(camera.z, 9);
    assert.equal(camera.y, 9);
  }
  const roof = new THREE.Vector3(45, 7, 0),
    camera = new THREE.Vector3(38, 10, 9);
  assert(!tunnelInteriorAt(roof, route));
  constrainChaseCamera(camera, route, roof);
  assert.equal(camera.z, 9);
  assert.equal(camera.y, 10);
  const inside = new THREE.Vector3(45, 0.7, 0),
    wanted = new THREE.Vector3(38, 12, 9);
  assert(tunnelInteriorAt(inside, route));
  constrainChaseCamera(wanted, route, inside);
  assert(wanted.z <= 4.7 && wanted.y < 5.3);
});
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
test('ambos túneles reales: cámara exterior, paredes exteriores, techo y transición a interior', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), canvasDocument);
  try {
    map.world.step();
    for (const tunnel of map.tunnelRanges) {
      const frame = map.frames[Math.round((tunnel.start + tunnel.end) / 2)];
      const at = (lateral: number, height: number) =>
        frame.p
          .clone()
          .addScaledVector(frame.normal, lateral)
          .add(new THREE.Vector3(0, height, 0));
      const lateral = (p: THREE.Vector3) =>
        (p.x - frame.p.x) * frame.normal.x + (p.z - frame.p.z) * frame.normal.z;
      for (const side of [-1, 1]) {
        const outside = at(side * 9, 0.7),
          clear = at(side * 12, 3.5);
        constrainChaseCamera(clear, map, outside);
        assert(
          Math.abs(lateral(clear) - side * 12) < 0.01,
          'el exterior mantiene su posición lateral',
        );
        for (const target of [side * 5, side * 6.9]) {
          const blocked = at(target, 2.3);
          constrainChaseCamera(blocked, map, outside);
          assert(
            side * lateral(blocked) > 7.3,
            'se queda del lado exterior de la cubierta visible',
          );
          const origin = outside.clone().add(new THREE.Vector3(0, 0.8, 0)),
            delta = blocked.clone().sub(origin);
          assert(
            !map.world.castRay(
              new R.Ray(origin, delta.clone().normalize()),
              delta.length(),
              true,
              R.QueryFilterFlags.EXCLUDE_DYNAMIC,
            ),
            'queda línea de visión libre hasta la cámara',
          );
        }
      }
      const roof = at(0, 7),
        down = at(0, 4);
      constrainChaseCamera(down, map, roof);
      assert(down.y - frame.p.y > 6.4, 'no atraviesa el techo desde arriba');
      const inside = at(0, 0.7),
        camera = at(9, 25);
      constrainChaseCamera(camera, map, inside);
      assert(
        Math.abs(lateral(camera)) < 4.8 && camera.y - map.routeHeight(camera.x, camera.z) < 5.3,
      );
    }
  } finally {
    map.world.free();
    disposeScene(scene);
  }
});
