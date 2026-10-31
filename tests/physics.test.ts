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

test('alcanza 100 km/h en recta y el limitador actúa sobre la velocidad física', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(4000, 0.1, 40).setTranslation(0, -0.1, 0));
  const sim = createDrivingPhysics(world);
  try {
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    let maximum = 0,
      timeToMaximum: number | null = null;
    for (let i = 0; i < 3600; i++) {
      sim.step({ ...neutral, up: true }, 1 / 120);
      const v = sim.body.linvel(),
        kmh = Math.hypot(v.x, v.z) * 3.6;
      maximum = Math.max(maximum, kmh);
      if (timeToMaximum === null && kmh >= 99.5) timeToMaximum = i / 120;
      assert(kmh <= 100.0001, 'la velocidad real no sobrepasa el límite');
    }
    console.log({ maximumKmh: maximum, secondsTo100: timeToMaximum });
    assert(maximum >= 99.9, 'debe alcanzar la velocidad anunciada');
    assert(
      timeToMaximum !== null && timeToMaximum < 25,
      'alcanza la máxima en un tiempo razonable',
    );
    // Verify service braking while aligned and supported, before the external impact case.
    for (let i = 0; i < 360; i++) sim.step({ ...neutral, down: true }, 1 / 120);
    const braking = sim.body.linvel();
    console.log({ kmhAfterThreeSecondsBraking: Math.hypot(braking.x, braking.z) * 3.6 });
    assert(Math.hypot(braking.x, braking.z) * 3.6 < 60, 'frena con eficacia desde la máxima');
    // External impulses must not bypass the governor either.
    sim.body.setLinvel({ x: 75, y: 0, z: 25 }, true);
    sim.step(neutral, 1 / 120);
    const capped = sim.body.linvel();
    assert(Math.hypot(capped.x, capped.z) * 3.6 <= 100.0001);
  } finally {
    sim.dispose();
    world.free();
  }
});

test('el descenso con acelerador mantiene el máximo de 100 km/h', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  const grade = -0.27,
    angle = Math.atan(grade);
  world.createCollider(
    R.ColliderDesc.cuboid(4000, 0.1, 40)
      .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) })
      .setTranslation(0, -0.1, 0),
  );
  const sim = createDrivingPhysics(world);
  try {
    sim.reset({ x: 0, y: 0.7, z: 0 }, 0, grade);
    let maximum = 0;
    for (let i = 0; i < 3600; i++) {
      sim.step({ ...neutral, up: true }, 1 / 120);
      const v = sim.body.linvel(),
        kmh = Math.hypot(v.x, v.z) * 3.6;
      maximum = Math.max(maximum, kmh);
      assert(kmh <= 100.0001, 'la gravedad no permite superar el limitador');
    }
    console.log({ downhillMaximumKmh: maximum });
    assert(maximum > 99.9);
  } finally {
    sim.dispose();
    world.free();
  }
});

test('el coche a 100 no atraviesa una pared fina', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 50).setTranslation(0, -0.1, 0));
  world.createCollider(R.ColliderDesc.cuboid(0.12, 2, 10).setTranslation(28, 2, 0));
  const sim = createDrivingPhysics(world);
  try {
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    for (let i = 0; i < 120; i++) sim.step(neutral, 1 / 120);
    sim.body.setLinvel({ x: 100 / 3.6, y: 0, z: 0 }, true);
    for (let i = 0; i < 180; i++) sim.step({ ...neutral, up: true }, 1 / 120);
    assert(sim.body.translation().x < 28, 'la colisión sigue activa a 100 km/h');
  } finally {
    sim.dispose();
    world.free();
  }
});
