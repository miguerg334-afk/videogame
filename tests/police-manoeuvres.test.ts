import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createPursuit } from '../src/police/pursuit';
import { rotateVector } from '../src/engine/math';
await R.init();
const dt = 1 / 60;
function fixture(target: { x: number; y: number; z: number }) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(1000, 0.1, 1000).setTranslation(0, -0.1, 0));
  const police = createPursuit(world);
  police.reset([{ x: 0, y: 0.7, z: 0 }, target]);
  world.timestep = dt;
  const tick = () => {
    police.step(dt, target, true);
    world.step();
    police.afterStep();
  };
  return {
    world,
    police,
    tick,
    dispose() {
      police.dispose();
      world.free();
    },
  };
}

test('recupera la marcha hacia delante tras recibir velocidad hacia atrás sin enganchar la reversa', () => {
  const f = fixture({ x: 400, y: 0.7, z: 0 });
  try {
    for (let i = 0; i < 240; i++) f.tick();
    f.police.body.setLinvel({ x: -12, y: 0, z: 0 }, true);
    for (let i = 0; i < 180; i++) {
      f.tick();
      assert(!f.police.state.reverse, 'el freno no se convierte en acelerador de reversa');
    }
    assert(f.police.body.linvel().x > 3, 'vuelve a acelerar de frente');
  } finally {
    f.dispose();
  }
});

test('da la vuelta y persigue de frente cuando el objetivo queda detrás', () => {
  const f = fixture({ x: -180, y: 0.7, z: 0 });
  f.police.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  let reverseRun = 0,
    longestReverse = 0;
  try {
    for (let i = 0; i < 60 * 18; i++) {
      f.tick();
      reverseRun = f.police.state.reverse ? reverseRun + dt : 0;
      longestReverse = Math.max(longestReverse, reverseRun);
    }
    const p = f.police.body.translation(),
      forward = rotateVector(f.police.body.rotation(), { x: 1, y: 0, z: 0 });
    console.log({ turnaroundPosition: p, forward, longestReverse });
    assert(p.x < -40, 'gira y cierra distancia con el objetivo');
    assert(forward.x < -0.5, 'encara la persecución con el morro');
    assert(longestReverse < 1.3, 'no convierte la persecución en una reversa prolongada');
  } finally {
    f.dispose();
  }
});

test('sale de un choque frontal con un tronco y retoma la persecución sin teletransportarse', () => {
  for (const z of [0, 0.45, -0.45]) {
    const f = fixture({ x: 200, y: 0.7, z: 0 });
    f.world.createCollider(R.ColliderDesc.cylinder(3, 0.6).setTranslation(10, 3, z));
    let passedAt = Infinity,
      longestReverse = 0,
      reverseRun = 0;
    let previous = f.police.body.translation();
    try {
      for (let i = 0; i < 60 * 20; i++) {
        f.tick();
        const p = f.police.body.translation();
        assert(
          Math.hypot(p.x - previous.x, p.z - previous.z) < 1,
          'se libera mediante fuerzas y dirección',
        );
        previous = p;
        reverseRun = f.police.state.reverse ? reverseRun + dt : 0;
        longestReverse = Math.max(longestReverse, reverseRun);
        if (p.x > 15) {
          passedAt = i * dt;
          break;
        }
      }
      console.log({
        treeOffset: z,
        passedAt,
        longestReverse,
        position: f.police.body.translation(),
      });
      assert(passedAt < 12, 'rodea el tronco con una maniobra rápida');
      assert(longestReverse < 1.3, 'cada maniobra limita el tiempo de reversa');
    } finally {
      f.dispose();
    }
  }
});
