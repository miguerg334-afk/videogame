import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createPursuit, pursuitDifficulty } from '../src/police/pursuit';
import { createReinforcements } from '../src/police/reinforcements';
import type { VectorLike } from '../src/engine/types';
await R.init();

test('el nivel 5 dura un minuto y después entra una única patrulla idéntica con el reloj y límite actuales', () => {
  assert.equal(pursuitDifficulty(180).level, 5);
  assert.equal(pursuitDifficulty(239.999).level, 5);
  assert.equal(pursuitDifficulty(240).level, 6);
  assert.equal(pursuitDifficulty(240).levelCount, 6);
  assert.equal(pursuitDifficulty(600).level, 7);
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(1000, 0.1, 1000).setTranslation(0, -0.1, 0));
  const primary = createPursuit(world),
    target = { x: 500, y: 0.7, z: 0 };
  primary.reset([{ x: 0, y: 0.7, z: 0 }, target], 239.9);
  let spawns = 0;
  const wave = createReinforcements(
    primary,
    world,
    () => 0,
    { plan: (a: VectorLike, b: VectorLike) => [a, b], clearSegment: () => true },
    () => {
      spawns++;
      return [{ x: -80, y: 0.7, z: 0 }, target];
    },
  );
  const dt = 1 / 60;
  world.timestep = dt;
  const tick = () => {
    primary.step(dt, target, true);
    wave.prepare(dt, target, () => false);
    world.step();
    primary.afterStep();
    wave.officer?.afterStep();
  };
  try {
    for (let i = 0; i < 5; i++) tick();
    assert.equal(Boolean(wave.officer), false, 'no aparece antes de los 4 minutos');
    for (let i = 0; i < 3; i++) tick();
    const backup = wave.officer;
    assert(backup);
    assert.equal(spawns, 1);
    assert(Math.abs(backup.elapsed - primary.elapsed) < 1e-8, 'no empieza desde intensidad 1');
    assert.equal(backup.difficulty.maxSpeed, primary.difficulty.maxSpeed);
    assert.equal(backup.difficulty.maxSpeed * 3.6, 200);
    assert.equal(backup.body.mass(), primary.body.mass());
    assert.equal(backup.body.numColliders(), primary.body.numColliders());
    const start = backup.body.translation().x;
    for (let i = 0; i < 240; i++) tick();
    assert.equal(wave.officer, backup, 'solo crea un refuerzo');
    assert.equal(spawns, 1);
    assert(backup.body.translation().x > start + 10, 'persigue de frente con física real');
    const elapsed = primary.elapsed;
    wave.reset();
    assert.equal(Boolean(wave.officer), false);
    assert.equal(primary.elapsed, elapsed, 'retirar el refuerzo no modifica el reloj principal');
    primary.reset([{ x: 0, y: 0.7, z: 0 }, target]);
    tick();
    assert.equal(Boolean(wave.officer), false, 'reiniciar limpia los refuerzos y la dificultad');
    assert.equal(primary.difficulty.level, 1);
  } finally {
    wave.reset();
    primary.dispose();
    world.free();
  }
});
