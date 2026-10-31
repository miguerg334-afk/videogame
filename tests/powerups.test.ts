import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { createPowerups, PICKUP_RESPAWN } from '../src/world/powerups';
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
test('power-ups repartidos, recogida rápida, altura, animación y reaparición', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), canvasDocument);
  try {
    const pickups = createPowerups(scene, map),
      counts = { road: 0, trail: 0, mountain: 0 };
    for (const e of pickups.entries) {
      counts[e.kind as keyof typeof counts]++;
      assert(map.boundary.distance(e.position) > 0);
      assert(e.object.matrixAutoUpdate);
    }
    console.log({ pickups: counts });
    assert(counts.road >= 15);
    assert(counts.trail >= 6);
    assert(counts.mountain >= 10);
    const first = pickups.entries[0],
      p = first.position;
    const from = p.clone().add(new THREE.Vector3(-8, 0, 0)),
      to = p.clone().add(new THREE.Vector3(8, 0, 0));
    assert.equal(
      pickups.collect(
        from.clone().add(new THREE.Vector3(0, 7, 0)),
        to.clone().add(new THREE.Vector3(0, 7, 0)),
        0,
      ),
      0,
      'no se recoge pasando por encima del túnel',
    );
    assert.equal(
      pickups.collect(from, to, 0),
      1,
      'la trayectoria detecta la recogida aunque el fotograma salte el centro',
    );
    assert(!first.object.visible);
    assert.equal(pickups.collect(from, to, 1), 0);
    pickups.update(PICKUP_RESPAWN - 0.1);
    assert(!first.object.visible);
    pickups.update(PICKUP_RESPAWN + 0.1);
    assert(first.object.visible);
    assert.equal(pickups.collect(from, to, PICKUP_RESPAWN + 0.1), 1);
  } finally {
    map.world.free();
    disposeScene(scene);
  }
});
