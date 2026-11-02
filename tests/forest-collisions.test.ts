import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { disposeScene } from '../src/engine/dispose';
await R.init();
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
test('conserva todos los árboles y activa sus choques antes de que el coche pueda alcanzarlos', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), document),
    forest = map.forest;
  const first = forest.positions[0],
    far = forest.positions.find((p) => Math.hypot(p.x - first.x, p.z - first.z) > 1000)!;
  function trunk(p: typeof first) {
    return map.world.castRay(
      new R.Ray({ x: p.x - 1, y: p.y + p.h * 0.5, z: p.z }, { x: 1, y: 0, z: 0 }),
      2,
      true,
    );
  }
  try {
    assert.equal(forest.count, 800);
    forest.updateColliders(first);
    map.world.step();
    assert(forest.activeColliderCount > 0 && forest.activeColliderCount < 300);
    const hit = trunk(first);
    assert(hit, 'el tronco cercano tiene choque');
    const collider = hit.collider;
    forest.updateColliders({ x: first.x + 20, z: first.z });
    map.world.step();
    assert(trunk(first), 'el margen no descarga un tronco próximo al moverse');
    forest.updateColliders(far);
    map.world.step();

    assert(!collider.isValid(), 'se libera la colisión lejana');
    assert(!trunk(first), 'el tronco fuera de alcance deja de participar en las consultas');
    assert(trunk(far), 'un teletransporte activa los árboles del destino inmediatamente');
    forest.updateColliders(first);
    map.world.step();
    assert(trunk(first), 'volver restaura el choque');
    forest.updateColliders(first, far);
    map.world.step();
    assert(trunk(first) && trunk(far), 'los dos coches tienen colisiones en zonas separadas');
    const third = forest.positions.find(
      (p) =>
        Math.hypot(p.x - first.x, p.z - first.z) > 300 &&
        Math.hypot(p.x - far.x, p.z - far.z) > 300,
    );
    assert(third);
    forest.updateColliders(first, far, third);
    map.world.step();
    assert(
      trunk(first) && trunk(far) && trunk(third),
      'jugador y dos patrullas mantienen colisiones en sus regiones',
    );

    forest.updateColliders(far);
    map.world.step();
    assert(!trunk(first) && trunk(far), 'descarga la región que ya no necesita ningún coche');
    assert.equal(forest.positions.length, 800, 'no se elimina vegetación visual');
  } finally {
    map.world.free();
    disposeScene(scene);
  }
});
