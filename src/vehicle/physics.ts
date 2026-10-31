import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { rotateVector } from '../engine/math';
import type { DrivingInput, DrivingState, VectorLike } from '../engine/types';

export const MAX_SPEED_KMH = 200;
export const BOOST_SPEED_KMH = 300;
export const BOOST_DURATION = 12;

export function createDrivingPhysics(world: R.World) {
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      .setLinearDamping(0.02)
      .setAngularDamping(0.45)
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(1.98, 0.25, 0.82)
      .setTranslation(0, 0.06, 0)
      .setMass(1420)
      .setFriction(0.35)
      .setRestitution(0.05),
    body,
  );
  // A small upper collider also protects the cabin if the car rolls over.
  world.createCollider(
    R.ColliderDesc.cuboid(0.79, 0.17, 0.57)
      .setTranslation(-0.1, 0.51, 0)
      .setMass(35)
      .setFriction(0.3),
    body,
  );
  const vehicle = world.createVehicleController(body);
  vehicle.indexUpAxis = 1;
  vehicle.setIndexForwardAxis = 0;
  const wheels: { connection: VectorLike; front: boolean }[] = [];
  for (const x of [-1.378, 1.378])
    for (const z of [-0.8684, 0.8684]) {
      const i = wheels.length;
      const connection = { x, y: 0.18, z };
      wheels.push({ connection, front: x > 0 });
      vehicle.addWheel(connection, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.32, 0.41184);
      vehicle.setWheelSuspensionStiffness(i, 42);
      vehicle.setWheelSuspensionCompression(i, 4.8);
      vehicle.setWheelSuspensionRelaxation(i, 5.7);
      vehicle.setWheelMaxSuspensionTravel(i, 0.24);
      vehicle.setWheelMaxSuspensionForce(i, 14000);
      vehicle.setWheelFrictionSlip(i, 1.65);
      vehicle.setWheelSideFrictionStiffness(i, 0.95);
    }
  let steering = 0,
    throttle = 0,
    reverse = false,
    speed = 0,
    braking = false,
    boostRemaining = 0;
  function step(input: DrivingInput, dt: number, offroad = false): DrivingState {
    boostRemaining = Math.max(0, boostRemaining - dt);
    const boosting = boostRemaining > 0;
    const maxSpeed = (boosting ? BOOST_SPEED_KMH : MAX_SPEED_KMH) / 3.6;
    const velocity = body.linvel(),
      q = body.rotation(),
      forward = rotateVector(q, { x: 1, y: 0, z: 0 });
    speed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
    // ArrowDown is a service brake first; reverse engages only after almost stopping.
    if (input.up) {
      reverse = false;
    } else if (!input.down) {
      reverse = false;
    } else if (Math.abs(speed) < 0.45) {
      reverse = true;
    }
    let drive = 0;
    braking = false;
    if (input.up) {
      if (speed < -0.7) braking = true;
      else drive = 1;
    } else if (input.down) {
      if (!reverse && speed > 0.45) braking = true;
      else {
        reverse = true;
        drive = -1;
      }
    }
    const desiredSteer =
      ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * (0.51 / (1 + Math.abs(speed) * 0.035));
    steering += (desiredSteer - steering) * Math.min(1, dt * (drive ? 5 : 7));
    throttle += (drive - throttle) * Math.min(1, dt * 3.8);
    const powerDrop = reverse
        ? Math.max(0.18, 1 - Math.abs(speed) / 69)
        : Math.max(boosting ? 0.8 : 0.72, 1 - Math.abs(speed) / 180),
      force = throttle * (reverse ? 2200 : boosting ? 12000 : 8000) * powerDrop;
    for (let i = 0; i < 4; i++) {
      const front = wheels[i].front;
      vehicle.setWheelSteering(i, front ? steering : 0);
      vehicle.setWheelEngineForce(
        i,
        reverse && speed < -9 ? 0 : offroad ? force * 0.58 : front ? 0 : force,
      );
      vehicle.setWheelBrake(
        i,
        braking ? (front ? 80 : 55) : input.handbrake && !front ? 70 : drive === 0 ? 1.3 : 0,
      );
      vehicle.setWheelFrictionSlip(
        i,
        (offroad ? 1.35 : 1.65) * (input.handbrake && !front ? 0.38 : 1),
      );
      vehicle.setWheelSideFrictionStiffness(i, offroad ? 0.85 : 0.95);
    }
    const v = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (v > 0.01) {
      const drag = 0.43 * v + 15;
      body.addForce(
        { x: -velocity.x * drag, y: -velocity.y * 0.15 * drag, z: -velocity.z * drag },
        true,
      );
    }
    vehicle.updateVehicle(dt, R.QueryFilterFlags.EXCLUDE_DYNAMIC);
    world.timestep = dt;
    world.step();
    body.resetForces(true);
    // Govern the actual planar velocity, including downhill acceleration and impacts.
    // Vertical motion remains physical so jumps, suspension and falls still behave normally.
    let finalVelocity = body.linvel();
    const planarSpeed = Math.hypot(finalVelocity.x, finalVelocity.z);
    if (planarSpeed > maxSpeed) {
      const ratio = maxSpeed / planarSpeed;
      body.setLinvel(
        { x: finalVelocity.x * ratio, y: finalVelocity.y, z: finalVelocity.z * ratio },
        true,
      );
      finalVelocity = body.linvel();
    }
    const finalForward = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
    speed =
      finalVelocity.x * finalForward.x +
      finalVelocity.y * finalForward.y +
      finalVelocity.z * finalForward.z;
    return {
      speed,
      steering,
      throttle,
      reverse,
      braking: braking || input.handbrake,
      contacts: wheels.map((_, i) => vehicle.wheelIsInContact(i)).filter(Boolean).length,
    };
  }
  function reset(position: VectorLike, yaw: number, grade = 0) {
    const tilt = Math.atan(grade) / 2;
    const q = {
      x: Math.sin(yaw / 2) * Math.sin(tilt),
      y: Math.sin(yaw / 2) * Math.cos(tilt),
      z: Math.cos(yaw / 2) * Math.sin(tilt),
      w: Math.cos(yaw / 2) * Math.cos(tilt),
    };
    body.setTranslation(position, true);
    body.setRotation(q, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);
    steering = throttle = speed = 0;
    reverse = false;
    boostRemaining = 0;
  }
  function dispose() {
    world.removeVehicleController(vehicle);
  }
  return {
    body,
    vehicle,
    wheels,
    step,
    reset,
    dispose,
    activateBoost() {
      boostRemaining = BOOST_DURATION;
    },
    get boostRemaining() {
      return boostRemaining;
    },
    get speedLimitKmh() {
      return boostRemaining > 0 ? BOOST_SPEED_KMH : MAX_SPEED_KMH;
    },
  };
}
