import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { createPursuit, pursuitDifficulty } from '../src/police/pursuit';
import { createDrivingPhysics } from '../src/vehicle/physics';
import { pursuitSpeedLimitKmh, policeSpeedLimitKmh } from '../src/engine/speed';
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
  assert.equal(pursuitDifficulty(0).maxSpeed * 3.6, 106);
  assert.equal(pursuitDifficulty(45).level, 2);
  assert.equal(pursuitDifficulty(90).level, 3);
  assert.equal(pursuitDifficulty(180).level, 5);
  assert(Math.abs(pursuitDifficulty(600).maxSpeed * 3.6 - 150) < 1e-8);
  assert.equal(pursuitDifficulty(-1).level, 1);
});

test('la patrulla conduce una curva con suspensión y no sigue una posición impuesta', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0));
  const police = createPursuit(world);
  const seed = Array.from({ length: 121 }, (_, i) => {
    const angle = ((i / 120) * Math.PI) / 2;
    return { x: 60 * Math.sin(angle), y: 0.7, z: -60 * (1 - Math.cos(angle)) };
  });
  police.reset(seed);
  world.timestep = dt;
  try {
    for (let tick = 0; tick < 240; tick++) {
      police.step(dt, seed.at(-1)!, false);
      world.step();
      police.afterStep();
    }
    assert.equal(police.elapsed, 0);
    assert(Math.abs(police.body.translation().x) < 0.1);
    assert(police.state.contacts >= 2);
    let maximum = 0,
      minimumMovingSpeed = Infinity;
    for (let tick = 0; tick < 1800; tick++) {
      const old = police.body.translation();
      police.step(dt, seed.at(-1)!, true);
      world.step();
      police.afterStep();
      const p = police.body.translation();
      assert(Math.hypot(p.x - old.x, p.y - old.y, p.z - old.z) < 0.3, 'sin teletransporte');
      assert(p.y > 0.3 && p.y < 1, 'ruedas apoyadas en el suelo real');
      maximum = Math.max(maximum, police.speed);
      if (tick > 1200) minimumMovingSpeed = Math.min(minimumMovingSpeed, police.speed);
    }
    console.log({ curvePosition: police.body.translation(), maximum, minimumMovingSpeed });
    assert(
      police.body.translation().x > 45 && police.body.translation().z < -35,
      'sigue la curva con dirección real',
    );
    assert(maximum < 22, 'frena para la curva y el final de la ruta');
    assert(police.body.isDynamic());
    assert(!police.body.collider(0).isSensor());
    police.reset(seed);
    assert.equal(police.elapsed, 0);
    assert.equal(police.speed, 0);
    assert(!police.started);
  } finally {
    police.dispose();
    world.free();
  }
});

test('detecta contacto real, sin confundir proximidad ni separación vertical', () => {
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
      police.afterStep();
      if (police.touches(sim.body)) {
        caughtAt = tick / 120;
        break;
      }
    }
    assert(caughtAt > 3 && caughtAt < 20, 'al detenerte la policía termina tocando el chasis');
    police.reset(seed);
    sim.reset({ x: -55, y: 7, z: 0 }, 0);
    sim.step(neutral, dt);
    police.afterStep();
    assert(!police.touches(sim.body), 'no confunde separación vertical con contacto');
    sim.reset({ x: -55, y: 0.65, z: 3 }, 0);
    sim.step(neutral, dt);
    police.afterStep();
    assert(!police.touches(sim.body), 'cerca pero sin tocar no cuenta como derrota');
    sim.reset({ x: -55, y: 0.65, z: 0 }, 0);
    sim.step(neutral, dt);
    police.afterStep();
    assert(police.touches(sim.body));
  } finally {
    sim.dispose();
    police.dispose();
    world.free();
  }
});

test('la patrulla alcanza 150 km/h y el jugador conserva su máximo de 130', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(15000, 0.1, 50).setTranslation(7000, -0.1, 0));
  const police = createPursuit(world),
    sim = createDrivingPhysics(world);
  sim.reset({ x: 0, y: 0.65, z: 8 }, 0);
  police.reset([
    { x: -55, y: 0.65, z: 0 },
    { x: 500, y: 0.65, z: 0 },
  ]);
  let playerMaximum = 0,
    policeMaximum = 0,
    gapAtTwoMinutes = 0;
  try {
    for (let tick = 0; tick < 120 * 240; tick++) {
      // Parallel lanes isolate each governor from inter-car contact impulses.
      police.step(dt, { x: sim.body.translation().x + 500, y: 0.65, z: 0 }, true);
      sim.setPursuitTime(police.elapsed);
      sim.step({ ...neutral, up: true }, dt);
      police.afterStep();
      const v = sim.body.linvel(),
        playerSpeed = Math.hypot(v.x, v.z) * 3.6;
      playerMaximum = Math.max(playerMaximum, playerSpeed);
      policeMaximum = Math.max(policeMaximum, police.speed * 3.6);
      assert(
        Math.abs(police.difficulty.maxSpeed * 3.6 - policeSpeedLimitKmh(police.elapsed)) < 1e-8,
      );
      assert(playerSpeed <= 130.0001);
      assert(police.speed * 3.6 <= policeSpeedLimitKmh(police.elapsed) + 0.001);
      if (tick === 120 * 120)
        gapAtTwoMinutes = sim.body.translation().x - police.body.translation().x;
    }
    assert(playerMaximum > 129.9 && policeMaximum > 149.9);
    assert(
      sim.body.translation().x - police.body.translation().x < gapAtTwoMinutes - 70,
      'la velocidad extra permite recuperar distancia',
    );
    police.reset([
      { x: -55, y: 0.65, z: 0 },
      { x: 0, y: 0.65, z: 0 },
    ]);
    assert.equal(police.difficulty.maxSpeed * 3.6, 106);
  } finally {
    sim.dispose();
    police.dispose();
    world.free();
  }
});

test('progresión de 100 a 130 para el jugador y de 106 a 150 para la patrulla', () => {
  for (const [time, speed] of [
    [0, 100],
    [45, 107.5],
    [90, 115],
    [135, 122.5],
    [180, 130],
    [600, 130],
    [-1, 100],
  ]) {
    assert.equal(pursuitSpeedLimitKmh(time), speed);
    assert(
      Math.abs(
        pursuitDifficulty(time).maxSpeed * 3.6 -
          (speed + 6 + 14 * Math.max(0, Math.min(1, time / 180))),
      ) < 1e-8,
    );
  }
});

test('ambos coches mantienen tracción física y límites respectivos en pendientes del 27 por ciento', () => {
  for (const grade of [-0.27, 0.27]) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 }),
      angle = Math.atan(grade);
    world.createCollider(
      R.ColliderDesc.cuboid(30000, 0.1, 50)
        .setTranslation(0, -0.1, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }),
    );
    const sim = createDrivingPhysics(world),
      police = createPursuit(world, (x) => grade * x);
    sim.reset({ x: 0, y: 0.65, z: 8 }, 0, grade);
    police.reset([
      { x: -55, y: 0.65 - 55 * grade, z: 0 },
      { x: 0, y: 0.65, z: 0 },
    ]);
    let playerPeak = 0,
      policePeak = 0;
    try {
      for (let tick = 0; tick < 120 * 210; tick++) {
        const p = sim.body.translation();
        police.step(dt, { x: p.x + 500, y: (p.x + 500) * grade + 0.65, z: 0 }, true);
        sim.setPursuitTime(police.elapsed);
        sim.step({ ...neutral, up: true }, dt);
        police.afterStep();
        const velocity = sim.body.linvel();
        const playerSpeed = Math.hypot(velocity.x, velocity.z) * 3.6;
        const policeSpeed = police.speed * 3.6;
        playerPeak = Math.max(playerPeak, playerSpeed);
        policePeak = Math.max(policePeak, policeSpeed);
        assert(playerSpeed <= pursuitSpeedLimitKmh(police.elapsed) + 0.001);
        assert(policeSpeed <= policeSpeedLimitKmh(police.elapsed) + 0.001);
      }
      assert(playerPeak > 129.9, 'el jugador alcanza su máximo en la pendiente');
      assert(policePeak > 149.8, 'la patrulla alcanza su máximo en la pendiente');
      const p = police.body.translation();
      assert(p.y - grade * p.x > 0.3, 'la patrulla permanece apoyada en la pendiente');
    } finally {
      sim.dispose();
      police.dispose();
      world.free();
    }
  }
});

test('la patrulla cae por gravedad, choca con paredes y pierde velocidad sin atravesarlas', () => {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 50).setTranslation(0, -0.1, 0));
  world.createCollider(R.ColliderDesc.cuboid(0.12, 2, 10).setTranslation(40, 2, 0));
  const police = createPursuit(world);
  police.reset([
    { x: 0, y: 5, z: 0 },
    { x: 200, y: 0.7, z: 0 },
  ]);
  world.timestep = dt;
  try {
    for (let i = 0; i < 240; i++) {
      police.step(dt, { x: 200, y: 0.7, z: 0 }, false);
      world.step();
      police.afterStep();
    }
    assert(police.body.translation().y < 1, 'no levita siguiendo la altura de la ruta');
    let maximum = 0,
      slowAfterImpact = false;
    for (let i = 0; i < 1800; i++) {
      police.step(dt, { x: 200, y: 0.7, z: 0 }, true);
      world.step();
      police.afterStep();
      maximum = Math.max(maximum, police.speed);
      if (maximum > 8 && police.speed < 2) slowAfterImpact = true;
      assert(
        police.body.translation().x < 40,
        'el muro físico impide continuar por la ruta grabada',
      );
    }
    assert(maximum > 8 && slowAfterImpact, 'el choque reduce la velocidad real');
  } finally {
    police.dispose();
    world.free();
  }
});

test('el controlador compartido produce la misma respuesta física con teclado o entradas analógicas', () => {
  for (const offroad of [false, true]) {
    const worlds = [new R.World({ x: 0, y: -9.81, z: 0 }), new R.World({ x: 0, y: -9.81, z: 0 })];
    const cars = worlds.map((world) => {
      world.createCollider(R.ColliderDesc.cuboid(1000, 0.1, 1000).setTranslation(0, -0.1, 0));
      return createDrivingPhysics(world);
    });
    try {
      for (const car of cars) car.reset({ x: 0, y: 0.7, z: 0 }, 0);
      for (let i = 0; i < 1500; i++) {
        const up = i > 120 && i < 1000,
          down = i >= 1000 && i < 1250;
        const left = i > 500 && i < 650;
        cars[0].step({ ...neutral, up, down, left }, dt, offroad);
        cars[1].prepare(
          { ...neutral, up, down, throttleAxis: 1, steeringAxis: left ? 1 : 0 },
          dt,
          offroad,
        );
        worlds[1].timestep = dt;
        worlds[1].step();
        cars[1].finish();
        const a = cars[0].body.translation(),
          b = cars[1].body.translation();
        assert(
          Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-5,
          'mismas fuerzas, frenos, agarre, suspensión y resistencia',
        );
      }
    } finally {
      cars.forEach((car) => car.dispose());
      worlds.forEach((world) => world.free());
    }
  }
});
