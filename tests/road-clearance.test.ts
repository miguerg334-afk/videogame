import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { disposeScene } from '../src/engine/dispose';
await R.init();
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
test('la carretera no tiene colliders elevados sobre el asfalto', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), canvasDocument);
  try {
    map.world.step();
    scene.updateMatrixWorld(true);
    const road: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith('road-') && o.visible) road.push(o);
    });
    const triangles = road.reduce(
      (sum, o) =>
        sum +
        ((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) *
          (o instanceof THREE.InstancedMesh ? o.count : 1),
      0,
    );
    // Previous dense ribbons, center lines, reflectors, grates and seam boxes.
    const oldRoadTriangles =
      14 * map.N +
      12 * Math.floor(map.trackLength / 7) +
      12 *
        (2 * Math.floor(map.trackLength / 14) +
          14 * Math.floor(map.trackLength / 35) +
          3 * Math.floor(map.trackLength / 29));
    assert(
      triangles < oldRoadTriangles * 0.3,
      'reduce al menos un 70 % de los triángulos de carretera y detalles',
    );
    const ray = new THREE.Raycaster();
    let visualError = 0;
    for (let i = 0; i < map.N; i += 11) {
      const p = map.frames[i].p;
      ray.set(new THREE.Vector3(p.x, p.y + 2, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(
        road.filter((o) => o.name === 'road-surface-tile'),
        false,
      )[0];
      assert(hit, 'el asfalto sigue cubriendo toda la ruta');
      visualError = Math.max(visualError, Math.abs(hit.point.y - p.y));
    }
    console.log({ roadTriangles: triangles, oldRoadTriangles, visualError });
    assert(
      visualError < 0.05,
      'la malla simplificada sigue la altura física con menos de 5 cm de diferencia',
    );
    let worst = 0;
    const bumps: unknown[] = [];
    for (let i = 0; i < map.N; i += 4) {
      const f = map.frames[i];
      for (const lateral of [-3.5, 0, 3.5]) {
        const p = map.offsetPoint(f, lateral),
          hit = map.world.castRay(
            new R.Ray({ x: p.x, y: p.y + 2, z: p.z }, { x: 0, y: -1, z: 0 }),
            4,
            true,
          );
        assert(hit);
        const bump = 2 - hit.timeOfImpact;
        worst = Math.max(worst, bump);
        if (bump > 0.04) bumps.push({ i, x: p.x, z: p.z, lateral, bump });
      }
    }
    console.log({ worst, bumps: bumps.slice(0, 10), count: bumps.length });
    assert(worst < 0.04, 'ningún triángulo de terreno invade el asfalto');
  } finally {
    map.world.free();
    disposeScene(scene);
  }
});
