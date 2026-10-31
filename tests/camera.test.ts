import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { constrainChaseCamera } from '../src/engine/camera';
import { createMountainWorld } from '../src/world/mountain.js';
import { disposeScene } from '../src/engine/dispose';
await R.init();
test('la cámara conserva su encuadre y respeta suelo y obstáculos físicos', () => {
  const route = { driveGroundHeight: () => 7 };
  const point = new THREE.Vector3(12, 2, 9);
  constrainChaseCamera(point, route, new THREE.Vector3(0, 7.7, 0));
  assert.equal(point.x, 12);
  assert.equal(point.z, 9);
  assert.equal(point.y, 8.3);
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(0.1, 4, 10).setTranslation(5, 4, 0));
  world.step();
  try {
    const camera = new THREE.Vector3(10, 3, 0);
    constrainChaseCamera(
      camera,
      { world, driveGroundHeight: () => 0 },
      new THREE.Vector3(0, 0.7, 0),
    );
    assert(camera.x > 3 && camera.x < 4.5, 'se queda del lado del coche frente al muro');
  } finally {
    world.free();
  }
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
test('la carretera liberada mantiene cielo y laterales abiertos, sin restricciones de cámara antiguas', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), canvasDocument);
  try {
    map.world.step();
    scene.traverse((object) =>
      assert(!/tunnel/i.test(object.name), 'no quedan mallas ni lámparas de túneles'),
    );
    for (const north of [true, false]) {
      const frame = map.frames
        .filter((f) => (north ? f.p.z > 155 : f.p.z < -305))
        .reduce((a, b) => (Math.abs(a.p.x + 30) < Math.abs(b.p.x + 30) ? a : b));
      const origin = frame.p.clone().add(new THREE.Vector3(0, 1.3, 0));
      assert(
        !map.world.castRay(
          new R.Ray(origin, { x: 0, y: 1, z: 0 }),
          15,
          true,
          R.QueryFilterFlags.EXCLUDE_DYNAMIC,
        ),
        'no queda techo invisible',
      );
      const side = origin.clone().addScaledVector(frame.normal, -10);
      assert(
        !map.world.castRay(
          new R.Ray(side, frame.normal),
          20,
          true,
          R.QueryFilterFlags.EXCLUDE_DYNAMIC,
        ),
        'no quedan paredes invisibles',
      );
      const desired = frame.p
        .clone()
        .addScaledVector(frame.normal, 10)
        .add(new THREE.Vector3(0, 20, 0));
      const camera = desired.clone();
      constrainChaseCamera(camera, map, frame.p.clone().add(new THREE.Vector3(0, 0.7, 0)));
      assert(camera.distanceTo(desired) < 0.01, 'el encuadre no se comprime en la antigua galería');
    }
  } finally {
    map.world.free();
    disposeScene(scene);
  }
});
