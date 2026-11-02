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
test('la persecución al objetivo actual atraviesa los tramos abiertos del norte y sur con física real a 60 Hz', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), doc);
  const police = createPursuit(map.world, map.driveGroundHeight, createPursuitNavigation(map));
  const dt = 1 / 60,
    spacing = map.trackLength / map.N;
  map.world.timestep = dt;
  try {
    for (const north of [true, false]) {
      const indices = map.frames
        .map((f, i) => ({ f, i }))
        .filter(({ f }) =>
          north
            ? f.p.x > -120 && f.p.x < 70 && f.p.z > 155
            : f.p.x > -90 && f.p.x < 240 && f.p.z < -305,
        )
        .map(({ i }) => i);
      const section = {
        start: Math.min(...indices),
        end: Math.max(...indices),
        name: north ? 'Norte' : 'Sur',
      };
      const start = section.start - 30;
      const seed = map.frames
        .slice(start, start + 40)
        .map((f) => ({ x: f.p.x, y: f.p.y + 0.7, z: f.p.z }));
      police.reset(seed);
      let passed = false,
        minimumClearance = Infinity,
        routeDeviation = 0;
      for (let tick = 0; tick < 60 * 22; tick++) {
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
        if (near.index >= section.start && near.index <= section.end) {
          routeDeviation = Math.max(routeDeviation, near.distance);
          minimumClearance = Math.min(minimumClearance, p.y - map.routeHeight(p.x, p.z));
        }
        if (near.index > section.end && near.index < section.end + 300) passed = true;
      }
      console.log({
        section: section.name,
        passed,
        minimumClearance,
        routeDeviation,
        position: police.body.translation(),
      });
      assert(passed, 'continúa por la carretera abierta sin quedarse bloqueado');
      assert(
        minimumClearance > 0.25 && minimumClearance < 1,
        'mantiene contacto con la superficie física',
      );
    }
  } finally {
    police.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
