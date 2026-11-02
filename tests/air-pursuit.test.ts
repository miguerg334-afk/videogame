import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAirPursuit,
  AIR_BEAM_RADIUS,
  AIR_CAPTURE_SECONDS,
  AIR_MAX_SPEED,
} from '../src/police/air-pursuit';
import { pursuitDifficulty } from '../src/police/pursuit';
import { createAirVisual } from '../src/police/air-visual';
import * as THREE from 'three';
import { disposeScene } from '../src/engine/dispose';
const dt = 1 / 60,
  still = { x: 0, y: 0, z: 0 },
  target = { x: 0, y: 0.7, z: 0 };

test('el helicóptero aparece en 7/7 exactamente un minuto después del 6/6', () => {
  const air = createAirPursuit(() => 0);
  assert(AIR_MAX_SPEED * 3.6 > 200, 'el apoyo aéreo es más rápido que las patrullas');
  assert.equal(AIR_BEAM_RADIUS, 10);
  assert.equal(pursuitDifficulty(240).level, 6);
  assert.equal(pursuitDifficulty(299.999).level, 6);
  assert.equal(pursuitDifficulty(300).level, 7);
  assert.equal(pursuitDifficulty(300).levelCount, 7);
  air.step(dt, 299.999, target, still);
  assert(!air.active);
  air.step(dt, 300, target, still);
  assert(air.active);
  assert.equal(air.exposure, 0);
  assert(air.position.y > target.y + 20, 'entra desde el aire sin aparecer encima del coche');
});

test('captura después de cinco segundos continuos en el círculo y nunca por estar cerca fuera de él', () => {
  for (const hz of [30, 60, 120]) {
    const air = createAirPursuit(() => 0),
      dt = 1 / hz;
    let insideTime = 0;
    for (let tick = 0; tick < hz * 35; tick++) {
      air.step(dt, 300 + tick * dt, target, still);
      if (air.illuminated) {
        insideTime += dt;
        assert(Math.hypot(air.beam.x - target.x, air.beam.z - target.z) <= AIR_BEAM_RADIUS);
      } else {
        insideTime = 0;
        assert.equal(air.exposure, 0);
      }
      if (insideTime < AIR_CAPTURE_SECONDS - 1e-8) assert(!air.caught);
      if (air.caught) {
        assert(insideTime >= AIR_CAPTURE_SECONDS - 1e-8);
        break;
      }
    }
    assert(air.caught, 'la persecución converge al objetivo y puede capturarlo');
  }
});

test('salir del foco reinicia la cuenta; pausa y reinicio no conservan una captura anterior', () => {
  const air = createAirPursuit(() => 0);
  for (let i = 0; i < 1800 && air.exposure < 2; i++) air.step(dt, 300 + i * dt, target, still);
  assert(air.exposure >= 2 && !air.caught);
  const exposure = air.exposure;
  air.step(0, 400, target, still);
  assert.equal(air.exposure, exposure);
  const outside = { x: air.beam.x + AIR_BEAM_RADIUS + 2, y: 0.7, z: air.beam.z };
  air.step(dt, 400, outside, still);
  assert(!air.illuminated);
  assert.equal(air.exposure, 0);
  air.reset();
  assert(!air.active);
  assert.equal(air.exposure, 0);
  air.step(dt, 0, target, still);
  assert(!air.active);
});

test('el seguimiento tiene inercia, limita su velocidad y no captura a través de obstáculos', () => {
  const air = createAirPursuit(
    (x, z) => Math.sin(x * 0.01) * 20 + z * 0.1,
    () => true,
  );
  for (let i = 0; i < 1800; i++) {
    const previous = { ...air.position },
      wasActive = air.active;
    air.step(dt, 300 + i * dt, target, still);
    assert(Math.hypot(air.velocity.x, air.velocity.z) <= AIR_MAX_SPEED + 1e-8);
    if (wasActive)
      assert(
        Math.hypot(air.position.x - previous.x, air.position.z - previous.z) <=
          AIR_MAX_SPEED * dt + 1e-8,
      );
    assert.equal(air.exposure, 0);
    assert(!air.caught);
  }
});

test('el modelo aprobado conserva los dos rotores y el foco no añade luces ni sombras dinámicas', () => {
  const ctx = new Proxy({}, { get: () => () => {} });
  const doc = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  } as unknown as Document;
  const scene = new THREE.Scene(),
    visual = createAirVisual(scene, doc, () => 0),
    air = createAirPursuit(() => 0);
  try {
    assert(!visual.group.visible);
    air.step(dt, 300, target, still);
    visual.update(air, dt, 300);
    assert(visual.group.visible && visual.effects.visible);
    assert(visual.group.getObjectByName('Main_rotor'));
    assert(visual.group.getObjectByName('Tail_rotor'));
    let lights = 0,
      triangles = 0;
    scene.traverse((o) => {
      if (o instanceof THREE.Light) lights++;
      if (o instanceof THREE.Mesh) {
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        assert(!o.castShadow);
      }
    });
    console.log({ airTriangles: triangles, lights });
    assert.equal(lights, 0);
    assert(triangles < 60000);
    assert.equal(visual.effects.getObjectByName('helicopter-white-circle')!.position.x, air.beam.x);
    visual.reset();
    assert(!visual.group.visible && !visual.effects.visible);
  } finally {
    disposeScene(scene);
  }
});
