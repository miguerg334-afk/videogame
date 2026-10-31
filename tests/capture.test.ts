import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { CAPTURE_SECONDS, createGameSession } from '../src/app/session';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { createPursuit } from '../src/police/pursuit';
await R.init();

test('solo cinco segundos de contacto efectivo capturan; un golpe breve permite seguir jugando', () => {
  for (const hz of [60, 120]) {
    const session = createGameSession();
    session.start();
    for (let tick = 0; tick < CAPTURE_SECONDS * hz - 1; tick++) {
      assert(!session.updateCapture(true, 1 / hz));
      assert(session.running);
    }
    assert(session.updateCapture(true, 1 / hz));
    assert(session.caught);
    assert.equal(session.captureSeconds, 5);
    assert.equal(session.captureProgress, 1);
    assert(!session.updateCapture(true, 1 / hz), 'la derrota se emite una sola vez');
  }
});

test('los golpes separados no se acumulan; ignora huecos breves del solver sin contar tiempo sin tocar', () => {
  const session = createGameSession();
  session.start();
  session.updateCapture(true, 2);
  session.updateCapture(false, 0.1);
  assert.equal(session.captureSeconds, 2, 'un rebote corto conserva pero no aumenta la captura');
  assert(!session.updateCapture(true, 2.5));
  assert.equal(session.captureSeconds, 4.5);
  session.updateCapture(false, 0.2);
  assert.equal(session.captureSeconds, 0, 'escapar borra todo el progreso');
  for (let hit = 0; hit < 10; hit++) {
    session.updateCapture(true, 0.5);
    session.updateCapture(false, 0.3);
    assert(session.running, 'muchos choques breves no equivalen a quedar retenido');
    assert.equal(session.captureSeconds, 0);
  }
});

test('pausa y menú no avanzan la captura; reiniciar o comenzar una ronda la limpian', () => {
  const session = createGameSession();
  session.updateCapture(true, 10);
  assert.equal(session.captureSeconds, 0);
  session.start();
  session.updateCapture(true, 3);
  session.setPaused(true);
  session.updateCapture(true, 30);
  session.updateCapture(false, 30);
  assert.equal(session.captureSeconds, 3);
  session.setPaused(false);
  session.updateCapture(true, 1);
  assert.equal(session.captureSeconds, 4);
  session.resetRound();
  assert.equal(session.captureSeconds, 0);
  session.updateCapture(true, 2);
  session.openMenu();
  assert.equal(session.captureSeconds, 0);
  session.updateCapture(true, 30);
  session.start();
  assert(session.running);
  assert.equal(session.captureSeconds, 0);
});

test('un choque frontal real de Rapier empuja los coches sin terminar inmediatamente la partida', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 50).setTranslation(0, -0.1, 0));
  const player = createDrivingPhysics(world),
    police = createPursuit(world),
    session = createGameSession();
  const dt = 1 / 120,
    input = { up: true, down: false, left: false, right: false, handbrake: false };
  player.reset({ x: 0, y: 0.65, z: 0 }, 0);
  police.reset([
    { x: 10, y: 0.65, z: 0 },
    { x: 0, y: 0.65, z: 0 },
  ]);
  player.body.setLinvel({ x: 12, y: 0, z: 0 }, true);
  police.body.setLinvel({ x: -12, y: 0, z: 0 }, true);
  session.start();
  let contacts = 0,
    peakCapture = 0;
  try {
    for (let tick = 0; tick < 180; tick++) {
      police.step(dt, player.body.translation(), true);
      player.prepare(input, dt);
      world.timestep = dt;
      world.step();
      player.finish();
      police.afterStep();
      const touching = police.touches(player.body);
      if (touching) contacts++;
      assert(!session.updateCapture(touching, dt));
      peakCapture = Math.max(peakCapture, session.captureSeconds);
    }
    assert(contacts > 0 && peakCapture > 0, 'se detecta el contacto físico entre chasis');
    assert(session.running);
    assert(
      player.body.translation().x < police.body.translation().x,
      'los coches chocan y no se atraviesan',
    );
    assert(Math.abs(player.body.linvel().x) < 12, 'el golpe cambia la velocidad física');
  } finally {
    player.dispose();
    police.dispose();
    world.free();
  }
});
