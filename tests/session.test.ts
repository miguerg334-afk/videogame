import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createGameSession } from '../src/app/session';
import { createPursuit } from '../src/police/pursuit';
await R.init();

test('menú, pausa y derrota bloquean el reloj y el movimiento; jugar y reiniciar habilitan la ronda', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    police = createPursuit(world),
    session = createGameSession(),
    dt = 1 / 120;
  const seed = [
    { x: -55, y: 0.65, z: 0 },
    { x: 0, y: 0.65, z: 0 },
  ];
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 50).setTranslation(0, -0.1, 0));
  police.reset(seed);
  const advance = () => {
    if (session.running) {
      police.step(dt, seed[1], true);
      world.timestep = dt;
      world.step();
      police.afterStep();
    }
  };
  try {
    assert.equal(session.phase, 'menu');
    session.resetRound();
    session.setPaused(false);
    session.lose();
    for (let i = 0; i < 1200; i++) advance();
    assert.equal(session.phase, 'menu');
    assert.equal(police.elapsed, 0);
    assert.equal(police.body.translation().x, -55);
    session.start();
    for (let i = 0; i < 600; i++) advance();
    assert(police.elapsed > 4.9);
    assert(police.body.translation().x > -55);
    session.setPaused(true);
    const time = police.elapsed,
      x = police.body.translation().x;
    for (let i = 0; i < 600; i++) advance();
    assert.equal(police.elapsed, time);
    assert.equal(police.body.translation().x, x);
    session.setPaused(false);
    advance();
    assert(police.elapsed > time);
    session.lose();
    const lostTime = police.elapsed;
    session.setPaused(false);
    for (let i = 0; i < 600; i++) advance();
    assert(session.caught);
    assert.equal(police.elapsed, lostTime);
    session.resetRound();
    police.reset(seed);
    assert(session.running);
    assert.equal(police.elapsed, 0);
    session.openMenu();
    session.resetRound();
    assert(session.inMenu);
    for (let i = 0; i < 600; i++) advance();
    assert.equal(police.elapsed, 0);
    session.start();
    advance();
    assert(session.running);
    assert(police.elapsed > 0);
  } finally {
    police.dispose();
    world.free();
  }
});
