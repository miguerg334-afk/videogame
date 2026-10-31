import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createCharacterModel } from '../src/character/model';
import { createCharacterPhysics, BOOST_SPEED } from '../src/character/physics';
import { disposeScene } from '../src/engine/dispose';
await R.init();
const neutral = { up: false, down: false, left: false, right: false, handbrake: false };
test('personaje articulado: rasgos, geometría finita y animación de carrera', () => {
  const scene = new THREE.Scene(),
    model = createCharacterModel(scene);
  try {
    assert(model.root.getObjectByName('quill-top'));
    assert(model.root.getObjectByName('pupil'));
    assert(
      !model.root.getObjectByName('iris'),
      'la referencia tiene pupilas negras sin iris verde',
    );
    assert(model.root.getObjectByName('red-shoe'));
    assert(model.root.getObjectByName('glove-finger'));
    const foot = model.root.getObjectByName('red-shoe')!.parent!;
    const idle = foot.position.clone();
    for (let i = 0; i < 120; i++) model.animate(1 / 60, 28, true, 0.4, true);
    assert(foot.position.distanceTo(idle) > 0.05);
    model.animate(1 / 60, 0, false, 0, false);
    assert(foot.position.y > 0.3);
    let triangles = 0;
    model.root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const p = object.geometry.attributes.position;
        assert(Array.from(p.array).every(Number.isFinite));
        triangles += (object.geometry.index?.count ?? p.count) / 3;
      }
    });
    assert(triangles < 8000, 'el personaje poligonal tiene un presupuesto bajo');
    assert(model.root.getObjectByName('shoe-buckle'));
    assert(model.root.getObjectByName('forehead'));
    const eye = model.root.getObjectByName('eye-white') as THREE.Mesh;
    assert(eye.geometry.attributes.position.count < 100);
    assert(Array.from(eye.geometry.attributes.normal.array).every(Number.isFinite));
    console.log({ characterTriangles: triangles });
  } finally {
    disposeScene(scene);
  }
});
test('caminar, acelerar, impulso, salto con aterrizaje, giro y colisión', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(1000, 0.5, 1000).setTranslation(0, -0.5, 0));
  world.createCollider(R.ColliderDesc.cuboid(0.5, 4, 30).setTranslation(150, 4, 0));
  const sim = createCharacterPhysics(world);
  try {
    sim.reset({ x: 0, y: 0.1, z: 0 }, 0);
    for (let i = 0; i < 120; i++) sim.step(neutral, 1 / 120);
    let state = sim.step(neutral, 1 / 120);
    assert.equal(state.contacts, 1);
    for (let i = 0; i < 240; i++) state = sim.step({ ...neutral, up: true, walk: true }, 1 / 120);
    assert(state.speed > 2 && state.speed < 2.6);
    for (let i = 0; i < 480; i++) state = sim.step({ ...neutral, up: true }, 1 / 120);
    assert(state.speed > 27 && state.speed < 28.1);
    sim.reset({ x: -300, y: 0.1, z: 0 }, 0);
    for (let i = 0; i < 480; i++) state = sim.step({ ...neutral, up: true, boost: true }, 1 / 120);
    assert(state.speed > BOOST_SPEED - 0.1 && state.speed < BOOST_SPEED + 0.1);
    sim.reset({ x: 0, y: 0.1, z: 0 }, 0);
    for (let i = 0; i < 60; i++) sim.step(neutral, 1 / 120);
    sim.step({ ...neutral, handbrake: true }, 1 / 120);
    let maximum = 0;
    for (let i = 0; i < 180; i++) {
      state = sim.step(neutral, 1 / 120);
      maximum = Math.max(maximum, sim.body.translation().y);
    }
    assert(maximum > 1.5, 'el salto tiene altura real');
    assert.equal(state.contacts, 1, 'vuelve al suelo');
    sim.reset({ x: 140, y: 0.1, z: 0 }, 0);
    for (let i = 0; i < 360; i++) state = sim.step({ ...neutral, up: true, boost: true }, 1 / 120);
    assert(sim.body.translation().x < 149.3, 'no atraviesa la pared');
    sim.reset({ x: 0, y: 0.1, z: 0 }, 0);
    for (let i = 0; i < 120; i++) sim.step({ ...neutral, up: true, right: true }, 1 / 120);
    assert(sim.body.translation().z > 1, 'las flechas cambian de dirección');
  } finally {
    sim.dispose();
    world.free();
  }
});
