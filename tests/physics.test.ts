import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createDrivingPhysics } from '../src/vehicle/physics';
import type { DrivingInput } from '../src/engine/types';

await R.init();
const neutral: DrivingInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  handbrake: false,
};

test('suspensión, aceleración, frenado, reversa, dirección y barreras', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0));
  const sim = createDrivingPhysics(world);
  const step = (input: DrivingInput, ticks: number) => {
    for (let i = 0; i < ticks; i++) sim.step(input, 1 / 120);
  };
  try {
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    step(neutral, 240);
    assert(sim.body.translation().y > 0.35 && sim.body.translation().y < 0.8);
    step({ ...neutral, up: true }, 360);
    const peak = sim.body.linvel().x;
    assert(peak > 5, 'acelera hacia adelante');
    step({ ...neutral, down: true }, 240);
    assert(Math.abs(sim.body.linvel().x) < peak * 0.5, 'frena antes de invertir la marcha');
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    step({ ...neutral, down: true }, 180);
    assert(sim.body.linvel().x < -0.5, 'retrocede desde reposo');
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    step({ ...neutral, up: true }, 240);
    step({ ...neutral, up: true, left: true }, 240);
    assert(Math.abs(sim.body.translation().z) > 1, 'la dirección curva la trayectoria');
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    world.createCollider(R.ColliderDesc.cuboid(0.12, 1.2, 5).setTranslation(28, 1.2, 0));
    step({ ...neutral, up: true }, 960);
    assert(sim.body.translation().x < 28, 'CCD impide atravesar la barrera');
    assert(sim.body.translation().y > -0.2);
  } finally {
    sim.dispose();
    world.free();
  }
});
