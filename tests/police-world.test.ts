import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disposeScene } from '../src/engine/dispose';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { createPursuit } from '../src/police/pursuit';
import { createPursuitNavigation } from '../src/police/navigation';
await R.init();
const ctx = new Proxy(
  {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
  },
  { get: (t, k) => Reflect.get(t, k) || (() => {}) },
);
const doc = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
} as unknown as Document;
test('la persecución al objetivo actual atraviesa ambos túneles con física real', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), doc);
  const police = createPursuit(map.world, map.driveGroundHeight, createPursuitNavigation(map));
  const dt = 1 / 120,
    spacing = map.trackLength / map.N;
  map.world.timestep = dt;
  try {
    for (const tunnel of map.tunnelRanges) {
      const start = tunnel.start - 30;
      const seed = map.frames
        .slice(start, start + 40)
        .map((f) => ({ x: f.p.x, y: f.p.y + 0.7, z: f.p.z }));
      police.reset(seed);
      let passed = false,
        minimumClearance = Infinity,
        tunnelDeviation = 0;
      for (let tick = 0; tick < 120 * 22; tick++) {
        const frame = map.frames[(start + Math.floor((60 + tick * dt * 27) / spacing)) % map.N];
        const p = police.body.translation(),
          near = map.nearestTrack(p);
        map.forest.updateColliders(p);
        police.step(
          dt,
          { x: frame.p.x, y: frame.p.y + 0.7, z: frame.p.z },
          true,
          near.distance > 4.2,
        );
        map.world.step();
        police.afterStep();
        if (near.index >= tunnel.start && near.index <= tunnel.end) {
          tunnelDeviation = Math.max(tunnelDeviation, near.distance);
          minimumClearance = Math.min(minimumClearance, p.y - map.routeHeight(p.x, p.z));
        }
        if (near.index > tunnel.end && near.index < tunnel.end + 300) passed = true;
      }
      console.log({
        tunnel: tunnel.name,
        passed,
        minimumClearance,
        tunnelDeviation,
        position: police.body.translation(),
      });
      assert(passed, 'no se queda bloqueado en la entrada o dentro del túnel');
      assert(minimumClearance > 0.25 && minimumClearance < 1, 'circula por el interior físico');
      // Tunnel half-width is 6.5 m; reserve at least 0.9 m for the chassis.
      assert(tunnelDeviation < 5.6, 'el chasis permanece dentro de las paredes de la galería');
    }
  } finally {
    police.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
