import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { DrivingInput, VectorLike } from '../engine/types';
import { rotateVector } from '../engine/math';
import {
  policeSpeedLimitKmh,
  PURSUIT_LEVEL_SECONDS,
  PURSUIT_RAMP_SECONDS,
  REINFORCEMENT_SECONDS,
  HELICOPTER_SECONDS,
  HEAVY_MISSILE_SECONDS,
} from '../engine/speed';
import type { PursuitNavigation } from './navigation';
import { createDrivingPhysics } from '../vehicle/physics';

export function pursuitDifficulty(seconds: number) {
  seconds = Math.max(0, seconds);
  const intensity = THREE.MathUtils.clamp(seconds / PURSUIT_RAMP_SECONDS, 0, 1);
  return {
    intensity,
    maximumAlert: seconds >= PURSUIT_RAMP_SECONDS,
    level:
      seconds >= HEAVY_MISSILE_SECONDS
        ? 8
        : seconds >= HELICOPTER_SECONDS
          ? 7
          : seconds >= REINFORCEMENT_SECONDS
            ? 6
            : 1 + Math.min(4, Math.floor(seconds / PURSUIT_LEVEL_SECONDS)),
    levelCount:
      seconds >= HEAVY_MISSILE_SECONDS
        ? 8
        : seconds >= HELICOPTER_SECONDS
          ? 7
          : seconds >= REINFORCEMENT_SECONDS
            ? 6
            : 5,
    maxSpeed: policeSpeedLimitKmh(seconds) / 3.6,
  };
}

/** The route is a steering guide, never a prescribed position or velocity. */
export function createPursuit(
  world: R.World,
  groundHeight: (x: number, z: number) => number = () => 0,
  navigation?: PursuitNavigation,
) {
  const sim = createDrivingPhysics(world, policeSpeedLimitKmh);
  const { body, vehicle } = sim;
  const lastTarget = new THREE.Vector3(),
    plannedTarget = new THREE.Vector3(Infinity, 0, 0);
  const targetVelocity = new THREE.Vector3(),
    measuredVelocity = new THREE.Vector3(),
    intercept = new THREE.Vector3();
  let replanIn = 0,
    targetKnown = false;
  const point = new THREE.Vector3(),
    projection = new THREE.Vector3();
  const segment = new THREE.Vector3(),
    closest = new THREE.Vector3();
  const aim = new THREE.Vector3(),
    farAim = new THREE.Vector3();
  const controls: DrivingInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false,
  };
  let path: THREE.Vector3[] = [],
    head = 0,
    elapsed = 0,
    started = false;
  let stalled = 0,
    reversing = 0,
    escapeTurn = 0,
    escapeSteer = -1,
    turnaroundSide = 0,
    overturnedFor = 0;
  let state = { speed: 0, steering: 0, throttle: 0, contacts: 0, reverse: false, braking: false };

  function reset(seed: VectorLike[], pursuitSeconds = 0) {
    if (seed.length < 2) throw new Error('La persecución necesita una ruta inicial');
    path = seed.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    lastTarget.copy(path[path.length - 1]);
    targetVelocity.set(0, 0, 0);
    targetKnown = false;
    replanIn = 0;
    head = 0;
    elapsed = stalled = reversing = escapeTurn = turnaroundSide = overturnedFor = 0;
    escapeSteer = -1;
    started = false;
    const direction = path[1].clone().sub(path[0]);
    sim.reset(
      path[0],
      -Math.atan2(direction.z, direction.x),
      direction.y / Math.max(0.01, Math.hypot(direction.x, direction.z)),
    );
    elapsed = Math.max(0, pursuitSeconds);
    started = elapsed > 0;
    sim.setPursuitTime(elapsed);
    state = { speed: 0, steering: 0, throttle: 0, contacts: 0, reverse: false, braking: false };
  }

  function ahead(distance: number, result: THREE.Vector3) {
    result.copy(closest);
    for (let i = head + 1; i < path.length; i++) {
      const length = result.distanceTo(path[i]);
      if (length >= distance) return result.lerp(path[i], distance / Math.max(0.001, length));
      distance -= length;
      result.copy(path[i]);
    }
    return result;
  }

  function recoverIfOverturned(dt: number) {
    const up = rotateVector(body.rotation(), { x: 0, y: 1, z: 0 });
    const velocity = body.linvel(),
      spin = body.angvel();
    let settled =
      started &&
      elapsed >= 3 &&
      up.y < 0.35 &&
      Math.hypot(velocity.x, velocity.y, velocity.z) < 2 &&
      Math.hypot(spin.x, spin.y, spin.z) < 1.5;
    if (settled) {
      const p = body.translation();
      const hit = world.castRayAndGetNormal(
        new R.Ray({ x: p.x, y: p.y + 0.15, z: p.z }, { x: 0, y: -1, z: 0 }),
        2,
        false,
        R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
      );
      settled = !!hit && hit.normal.y > 0.35;
    }
    overturnedFor = settled ? overturnedFor + dt : 0;
    if (overturnedFor >= 1) {
      // The same recovery as F: preserve X/Z, heading, route, clock and speed limit.
      sim.recover(groundHeight);
      overturnedFor = stalled = reversing = escapeTurn = turnaroundSide = 0;
      state = { speed: 0, steering: 0, throttle: 0, contacts: 0, reverse: false, braking: false };
    }
  }

  /** Prepare wheel forces. The caller integrates both cars in ONE shared world step. */
  function step(dt: number, target: VectorLike, driving: boolean, offroad = false) {
    if (!path.length) return;
    started ||= driving;
    if (started) elapsed += dt;
    sim.setPursuitTime(elapsed);
    recoverIfOverturned(dt);
    const p = body.translation(),
      velocity = body.linvel();
    if (targetKnown) {
      const dx = target.x - lastTarget.x,
        dz = target.z - lastTarget.z;
      if (Math.hypot(dx, dz) < 2)
        targetVelocity.lerp(measuredVelocity.set(dx / dt, 0, dz / dt), Math.min(1, dt * 5));
      else targetVelocity.set(0, 0, 0);
      targetVelocity.clampLength(0, 40);
    }
    targetKnown = true;
    lastTarget.set(target.x, target.y, target.z);
    const gap = Math.hypot(target.x - p.x, target.z - p.z);
    const lead = Math.min(0.9, gap / 50);
    intercept.set(target.x + targetVelocity.x * lead, target.y, target.z + targetVelocity.z * lead);
    replanIn -= dt;
    if (started && (replanIn <= 0 || plannedTarget.distanceToSquared(intercept) > 12 ** 2)) {
      intercept.y =
        target.y + groundHeight(intercept.x, intercept.z) - groundHeight(target.x, target.z);
      if (navigation && !navigation.clearSegment(target, intercept))
        intercept.set(target.x, target.y, target.z);
      const route = navigation?.plan(p, intercept) ?? [p, intercept];
      path = route.map((v) => new THREE.Vector3(v.x, v.y, v.z));
      head = 0;
      plannedTarget.copy(intercept);
      replanIn = 0.75;
    } else if (started && path.length) path[path.length - 1].copy(intercept);
    point.set(p.x, p.y, p.z);
    const speed = Math.hypot(velocity.x, velocity.z);
    // Local projection preserves route order at intersections and on stacked surfaces.
    let best = Infinity,
      bestHead = head;
    const end = Math.min(path.length - 1, head + 40);
    for (let i = head; i < end; i++) {
      segment.copy(path[i + 1]).sub(path[i]);
      const t = THREE.MathUtils.clamp(
        projection.copy(point).sub(path[i]).dot(segment) / Math.max(0.001, segment.lengthSq()),
        0,
        1,
      );
      projection.copy(path[i]).addScaledVector(segment, t);
      const distance = point.distanceToSquared(projection);
      if (distance < best) {
        best = distance;
        bestHead = i;
        closest.copy(projection);
      }
    }
    head = bestHead;
    ahead(5 + speed * 0.55, aim);
    ahead(12 + speed * 1.3, farAim);
    const forward = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
    const yaw = Math.atan2(-forward.z, forward.x);
    const angleTo = (v: THREE.Vector3) => {
      const angle = Math.atan2(-(v.z - p.z), v.x - p.x) - yaw;
      return Math.atan2(Math.sin(angle), Math.cos(angle));
    };
    const angle = angleTo(aim);
    const lookDistance = Math.max(2, Math.hypot(aim.x - p.x, aim.z - p.z));
    const curvature =
      (2 * Math.sin(THREE.MathUtils.clamp(angle, -Math.PI / 2, Math.PI / 2))) / lookDistance;
    const turnAhead =
      (2 * Math.abs(Math.sin(angleTo(farAim)))) /
      Math.max(3, Math.hypot(farAim.x - p.x, farAim.z - p.z));
    const difficulty = pursuitDifficulty(elapsed);
    // Brakes and lateral grip limit cornering; higher intensity only changes driver inputs.
    const cornerSpeed = Math.sqrt(
      (5 + difficulty.intensity * 2) / Math.max(0.001, Math.abs(curvature), turnAhead),
    );
    const remaining = Math.hypot(aim.x - p.x, aim.z - p.z);
    let routeRemaining = closest.distanceTo(path[head + 1]);
    for (let i = head + 1; i < path.length - 1 && routeRemaining < 200; i++)
      routeRemaining += path[i].distanceTo(path[i + 1]);
    let desiredSpeed = Math.min(
      difficulty.maxSpeed,
      cornerSpeed,
      targetVelocity.length() + Math.sqrt(8 * Math.max(3, routeRemaining)),
    );
    const active = started && elapsed >= 3;
    const signedSpeed = velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
    const tipped = rotateVector(body.rotation(), { x: 0, y: 1, z: 0 }).y < 0.35;
    // Brake from forward velocity only. Braking from |velocity| could latch reverse forever.
    if (Math.abs(angle) > 1.8 && !turnaroundSide) turnaroundSide = Math.sign(angle) || 1;
    if (Math.abs(angle) < 0.8) turnaroundSide = 0;
    if (turnaroundSide) desiredSpeed = Math.min(desiredSpeed, 5.5);
    controls.steeringAxis =
      turnaroundSide ||
      THREE.MathUtils.clamp(Math.atan(2.756 * curvature) / (0.51 / (1 + speed * 0.035)), -1, 1);
    controls.throttleAxis = 0.72 + difficulty.intensity * 0.28;
    if (active && !tipped && reversing === 0 && speed < 1.2 && remaining > 5 && state.contacts >= 2)
      stalled += dt;
    else stalled = 0;
    if (stalled >= 0.65) {
      // Pick a free side once, then commit to a short three-point manoeuvre instead of
      // repeatedly aiming straight back at the same trunk. Only probe when actually stuck.
      const clearance = (side: number) => {
        const c = Math.cos(0.8),
          s = Math.sin(0.8) * side;
        const direction = {
          x: forward.x * c + forward.z * s,
          y: 0,
          z: forward.z * c - forward.x * s,
        };
        const hit = world.castRay(
          new R.Ray({ x: p.x, y: p.y + 0.4, z: p.z }, direction),
          8,
          true,
          R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
        );
        return hit?.timeOfImpact ?? 8;
      };
      const left = clearance(1),
        right = clearance(-1);
      escapeSteer = Math.abs(left - right) > 0.5 ? (left > right ? 1 : -1) : -escapeSteer;
      reversing = 1.1;
      escapeTurn = 1.8;
      stalled = 0;
      replanIn = 0;
    }
    if (reversing > 0) {
      reversing = Math.max(0, reversing - dt);
      controls.steeringAxis = -escapeSteer;
      controls.up = false;
      controls.down = active && !tipped && signedSpeed > -3.5;
      controls.handbrake = !active || tipped || signedSpeed <= -3.5;
    } else {
      if (escapeTurn > 0) {
        escapeTurn = Math.max(0, escapeTurn - dt);
        controls.steeringAxis = escapeSteer;
        desiredSpeed = Math.min(desiredSpeed, 6);
      }
      controls.up = active && !tipped && signedSpeed < desiredSpeed;
      controls.down = active && !tipped && signedSpeed > Math.max(0.8, desiredSpeed + 0.8);
      // Hold during the initial grace period; reverse is exclusive to the bounded escape phase.
      controls.handbrake = !active || tipped;
    }
    sim.prepare(controls, dt, offroad);
    if (head > 512) {
      path.splice(0, head);
      head = 0;
    }
  }
  function afterStep() {
    state = sim.finish();
  }
  function touches(player: R.RigidBody) {
    let touched = false;
    for (let a = 0; a < body.numColliders(); a++)
      for (let b = 0; b < player.numColliders(); b++)
        world.contactPair(body.collider(a), player.collider(b), (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            if (manifold.contactDist(i) <= 0.01) touched = true;
        });
    return touched;
  }
  return {
    body,
    vehicle,
    reset,
    step,
    afterStep,
    touches,
    get elapsed() {
      return elapsed;
    },
    get speed() {
      const v = body.linvel();
      return Math.hypot(v.x, v.z);
    },
    get state() {
      return state;
    },
    get started() {
      return started;
    },
    get difficulty() {
      return pursuitDifficulty(elapsed);
    },
    dispose() {
      sim.dispose();
      world.removeRigidBody(body);
    },
  };
}
