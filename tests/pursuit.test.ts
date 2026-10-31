import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import * as THREE from 'three';
import { createPursuit, pursuitDifficulty } from '../src/police/pursuit';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { pursuitSpeedLimitKmh } from '../src/engine/speed';
await R.init();
const dt = 1 / 120;
const neutral = { up: false, down: false, left: false, right: false, handbrake: false };

test('la presión empieza baja, aumenta gradualmente y se limita a cinco intensidades', () => {
  let previous = 0;
  for (let seconds = 0; seconds <= 600; seconds++) {
    const d = pursuitDifficulty(seconds);
    assert(d.maxSpeed >= previous);
    previous = d.maxSpeed;
    assert(d.level >= 1 && d.level <= 5);
    assert(d.intensity >= 0 && d.intensity <= 1);
  }
  assert.equal(pursuitDifficulty(0).maxSpeed * 3.6, 100);
  assert.equal(pursuitDifficulty(30).level, 2);
  assert.equal(pursuitDifficulty(60).level, 3);
  assert.equal(pursuitDifficulty(120).level, 5);
  assert(Math.abs(pursuitDifficulty(600).maxSpeed * 3.6 - 120) < 1e-8);
  assert.equal(pursuitDifficulty(-1).level, 1);
});

test('sigue curvas y pendientes por la ruta conducida; no cruza recto hacia el jugador', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }),
    police = createPursuit(world);
  world.timestep = dt;
  const seed = [
    new THREE.Vector3(0, 0.65, 0),
    new THREE.Vector3(15, 0.65, 0),
    new THREE.Vector3(15, 8, 20),
    new THREE.Vector3(40, 8, 20),
  ];
  police.reset(seed);
  try {
    for (let tick = 0; tick < 240; tick++) {
      police.step(dt, seed.at(-1)!, false);
      world.step();
    }
    assert.equal(police.elapsed, 0);
    assert.equal(police.body.translation().x, 0);
    let reachedTurn = false;
    for (let tick = 0; tick < 2400; tick++) {
      const old = police.body.translation();
      police.step(dt, seed.at(-1)!, true);
      world.step();
      const p = police.body.translation(),
        point = new THREE.Vector3(p.x, p.y, p.z);
      const distance = Math.min(
        ...seed
          .slice(0, -1)
          .map((a, i) =>
            new THREE.Line3(a, seed[i + 1])
              .closestPointToPoint(point, true, new THREE.Vector3())
              .distanceTo(point),
          ),
      );
      assert(distance < 0.0001, 'la patrulla permanece en el camino, también en altura');
      assert(
        Math.hypot(p.x - old.x, p.y - old.y, p.z - old.z) < 0.3,
        'sin teletransporte para alcanzar al jugador',
      );
      if (p.z > 1) reachedTurn = true;
    }
    assert(reachedTurn);
    assert(Math.abs(police.body.translation().x - 40) < 0.001);
    police.reset(seed);
    assert.equal(police.elapsed, 0);
    assert.equal(police.speed, 0);
    assert(!police.started);
  } finally {
    police.dispose();
    world.free();
  }
});

test('captura por contacto real, sin falsa derrota por proximidad o por pasar encima', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    police = createPursuit(world),
    sim = createDrivingPhysics(world);
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 50).setTranslation(0, -0.1, 0));
  const seed = [
    { x: -55, y: 0.65, z: 0 },
    { x: 0, y: 0.65, z: 0 },
  ];
  police.reset(seed);
  sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
  try {
    let caughtAt = 0;
    for (let tick = 0; tick < 3600; tick++) {
      police.step(dt, sim.body.translation(), true);
      sim.step(neutral, dt);
      if (police.touches(sim.body)) {
        caughtAt = tick / 120;
        break;
      }
    }
    assert(caughtAt > 3 && caughtAt < 20, 'al detenerte la policía termina tocando el chasis');
    police.reset(seed);
    sim.reset({ x: -55, y: 7, z: 0 }, 0);
    sim.step(neutral, dt);
    assert(!police.touches(sim.body), 'no captura a través del techo de un túnel');
    sim.reset({ x: -55, y: 0.65, z: 3 }, 0);
    sim.step(neutral, dt);
    assert(!police.touches(sim.body), 'cerca pero sin tocar no cuenta como derrota');
    sim.reset({ x: -55, y: 0.65, z: 0 }, 0);
    sim.step(neutral, dt);
    assert(police.touches(sim.body));
    assert(
      Math.hypot(sim.body.linvel().x, sim.body.linvel().z) < 0.01,
      'la detección no catapulta el coche',
    );
  } finally {
    sim.dispose();
    police.dispose();
    world.free();
  }
});

test('el jugador conserva la ventaja con física real durante seis minutos a límites iguales', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    police = createPursuit(world),
    sim = createDrivingPhysics(world);
  world.createCollider(R.ColliderDesc.cuboid(15000, 0.1, 50).setTranslation(7000, -0.1, 0));
  sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
  police.reset([
    { x: -55, y: 0.65, z: 0 },
    { x: 0, y: 0.65, z: 0 },
  ]);
  let minimumGap = Infinity,
    maximum = 0,
    gapAtTwoMinutes = 0;
  try {
    for (let tick = 0; tick < 120 * 360; tick++) {
      police.step(dt, sim.body.translation(), true);
      sim.setPursuitTime(police.elapsed);
      sim.step({ ...neutral, up: true }, dt);
      const actual = sim.body.linvel(),
        speed = Math.hypot(actual.x, actual.z) * 3.6;
      const gap = sim.body.translation().x - police.body.translation().x;
      maximum = Math.max(maximum, speed);
      minimumGap = Math.min(minimumGap, gap);
      assert(
        Math.abs(sim.speedLimitKmh - police.difficulty.maxSpeed * 3.6) < 1e-8,
        'límite idéntico en el mismo paso de simulación',
      );
      assert(speed <= 120.0001);
      assert(police.speed * 3.6 <= sim.speedLimitKmh + 0.0001);
      assert(
        !police.touches(sim.body),
        'mantener el acelerador permite escapar; no hay captura inevitable',
      );
      if (tick === 120 * 120) gapAtTwoMinutes = gap;
    }
    console.log({
      minimumGap,
      maximum,
      endGap: sim.body.translation().x - police.body.translation().x,
      gapAtTwoMinutes,
    });
    assert(minimumGap > 50, 'la patrulla no consume la ventaja mientras se acelera');
    assert(maximum > 119.9);
    assert(
      sim.body.translation().x - police.body.translation().x >= gapAtTwoMinutes - 1,
      'la patrulla no recupera distancia a velocidad máxima',
    );
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0);
    police.reset([
      { x: -55, y: 0.65, z: 0 },
      { x: 0, y: 0.65, z: 0 },
    ]);
    assert.equal(sim.speedLimitKmh, 100);
    assert.equal(police.difficulty.maxSpeed * 3.6, 100);
  } finally {
    sim.dispose();
    police.dispose();
    world.free();
  }
});

test('progresión compartida: 100, 105, 110, 115 y 120 km/h, sin superar el máximo', () => {
  for (const [time, speed] of [
    [0, 100],
    [30, 105],
    [60, 110],
    [90, 115],
    [120, 120],
    [600, 120],
    [-1, 100],
  ]) {
    assert.equal(pursuitSpeedLimitKmh(time), speed);
    assert(Math.abs(pursuitDifficulty(time).maxSpeed * 3.6 - speed) < 1e-8);
  }
});

test('la aceleración sigue siendo suficiente para escapar en pendientes del 27 por ciento', () => {
  for (const grade of [-0.27, 0.27]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 }),
      police = createPursuit(world),
      sim = createDrivingPhysics(world),
      angle = Math.atan(grade);
    world.createCollider(
      R.ColliderDesc.cuboid(30000, 0.1, 50)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) })
        .setTranslation(0, -0.1, 0),
    );
    sim.reset({ x: 0, y: 0.65, z: 0 }, 0, grade);
    police.reset([
      { x: -55, y: 0.65 - 55 * grade, z: 0 },
      { x: 0, y: 0.65, z: 0 },
    ]);
    let minimumGap = Infinity;
    try {
      for (let tick = 0; tick < 120 * 180; tick++) {
        police.step(dt, sim.body.translation(), true);
        sim.setPursuitTime(police.elapsed);
        sim.step({ ...neutral, up: true }, dt);
        minimumGap = Math.min(minimumGap, sim.body.translation().x - police.body.translation().x);
        assert(!police.touches(sim.body), 'la pendiente no convierte la captura en inevitable');
      }
      console.log({ grade, minimumGap });
      assert(minimumGap > 40);
      const v = sim.body.linvel();
      assert(Math.hypot(v.x, v.z) * 3.6 > 119.9);
    } finally {
      sim.dispose();
      police.dispose();
      world.free();
    }
  }
});
