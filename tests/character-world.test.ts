import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createMountainWorld } from '../src/world/mountain.js';
import { createCharacterPhysics } from '../src/character/physics';
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
const neutral = { up: false, down: false, left: false, right: false, handbrake: false };
test('personaje en el mapa real: ascensión, carretera, atajo y límite exterior', () => {
  const scene = new THREE.Scene(),
    map = createMountainWorld(scene, new THREE.Group(), canvasDocument),
    sim = createCharacterPhysics(map.world);
  try {
    const ascent = map.frames.find((f) => f.p.x > 1100 && f.p.x < 1110 && f.p.z > 0)!;
    sim.reset(
      { x: ascent.p.x, y: ascent.p.y + 0.12, z: ascent.p.z },
      -Math.atan2(ascent.tangent.z, ascent.tangent.x),
    );
    for (let i = 0; i < 480; i++) sim.step({ ...neutral, up: true }, 1 / 120);
    let p = sim.body.translation();
    assert(p.x > ascent.p.x + 35 && p.y > ascent.p.y + 8, 'sube la pendiente de montaña');
    assert(p.y > map.driveGroundHeight(p.x, p.z) - 0.2, 'permanece encima del terreno');
    const entry = map.frames.find((f) => f.p.x > -145 && f.p.x < -142 && f.p.z > 155)!;
    sim.reset(
      { x: entry.p.x, y: entry.p.y + 0.12, z: entry.p.z },
      -Math.atan2(entry.tangent.z, entry.tangent.x),
    );
    for (let i = 0; i < 1200; i++) sim.step({ ...neutral, up: true, boost: true }, 1 / 120);
    p = sim.body.translation();
    assert(p.x > 70, 'cruza el tramo abierto corriendo');
    const trail = map.trailNetwork.trails[2].frames[18];
    sim.reset(
      { x: trail.p.x, y: trail.p.y + 0.12, z: trail.p.z },
      -Math.atan2(trail.tangent.z, trail.tangent.x),
    );
    for (let i = 0; i < 240; i++) sim.step({ ...neutral, up: true }, 1 / 120);
    p = sim.body.translation();
    assert(Math.hypot(p.x - trail.p.x, p.z - trail.p.z) > 10);
    assert(p.y > map.terrainHeight(p.x, p.z) - 0.5, 'el atajo sostiene al personaje');
    const b = map.boundary.bounds,
      x = b.xmax - 6,
      z = 0;
    sim.reset({ x, y: map.terrainHeight(x, z) + 0.12, z }, 0);
    for (let i = 0; i < 240; i++) sim.step({ ...neutral, up: true, boost: true }, 1 / 120);
    p = sim.body.translation();
    assert(map.boundary.distance(p) > 0.5, 'el perímetro bloquea al personaje');
  } finally {
    sim.dispose();
    map.world.free();
    disposeScene(scene);
  }
});
