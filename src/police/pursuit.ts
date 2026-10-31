import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { VectorLike } from '../engine/types';
import { pursuitSpeedLimitKmh } from '../engine/speed';

export function pursuitDifficulty(seconds: number) {
  seconds = Math.max(0, seconds);
  const intensity = THREE.MathUtils.clamp(seconds / 120, 0, 1);
  return {
    intensity,
    level: 1 + Math.min(4, Math.floor(seconds / 30)),
    maxSpeed: pursuitSpeedLimitKmh(seconds) / 3.6,
    acceleration: 2 + intensity,
  };
}

/** Follow the player's driven path, including mountains and tunnels, without pathfinding scans. */
export function createPursuit(world: R.World) {
  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  // Sensors give exact chassis contact without pushing or launching the player.
  const colliders = [
    world.createCollider(
      R.ColliderDesc.cuboid(1.98, 0.25, 0.82).setTranslation(0, 0.06, 0).setSensor(true),
      body,
    ),
    world.createCollider(
      R.ColliderDesc.cuboid(0.79, 0.17, 0.57).setTranslation(-0.1, 0.51, 0).setSensor(true),
      body,
    ),
  ];
  const position = new THREE.Vector3(),
    lastSample = new THREE.Vector3(),
    direction = new THREE.Vector3(1, 0, 0);
  const tiltAxis = new THREE.Vector3(0, 0, 1);
  const orientation = new THREE.Quaternion(),
    up = new THREE.Vector3(0, 1, 0),
    yawRotation = new THREE.Quaternion(),
    tiltRotation = new THREE.Quaternion();
  let path: THREE.Vector3[] = [],
    head = 0,
    elapsed = 0,
    speed = 0,
    started = false,
    yaw = 0;
  function reset(seed: VectorLike[]) {
    if (seed.length < 2) throw new Error('La persecución necesita una ruta inicial');
    path = seed.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    position.copy(path[0]);
    lastSample.copy(path[path.length - 1]);
    head = 1;
    elapsed = speed = 0;
    started = false;
    direction.copy(path[1]).sub(position).normalize();
    yaw = -Math.atan2(direction.z, direction.x);
    yawRotation.setFromAxisAngle(up, yaw);
    tiltRotation.setFromAxisAngle(
      tiltAxis,
      Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
    );
    orientation.copy(yawRotation).multiply(tiltRotation);
    body.setTranslation(position, true);
    body.setNextKinematicTranslation(position);
    body.setRotation(orientation, true);
    body.setNextKinematicRotation(orientation);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  function step(dt: number, target: VectorLike, driving: boolean) {
    if (!path.length) return;
    if (
      (lastSample.x - target.x) ** 2 +
        (lastSample.y - target.y) ** 2 +
        (lastSample.z - target.z) ** 2 >=
      1.5 ** 2
    ) {
      lastSample.set(target.x, target.y, target.z);
      path.push(lastSample.clone());
    }
    started ||= driving;
    if (!started) return;
    elapsed += dt;
    const difficulty = pursuitDifficulty(elapsed);
    const desiredSpeed = elapsed < 3 || head >= path.length ? 0 : difficulty.maxSpeed;
    speed += THREE.MathUtils.clamp(desiredSpeed - speed, -6 * dt, difficulty.acceleration * dt);
    let distance = speed * dt;
    while (distance > 0 && head < path.length) {
      direction.copy(path[head]).sub(position);
      const remaining = direction.length();
      if (remaining < 0.001) {
        head++;
        continue;
      }
      direction.multiplyScalar(1 / remaining);
      const travel = Math.min(distance, remaining);
      position.addScaledVector(direction, travel);
      distance -= travel;
      if (travel >= remaining) head++;
    }
    if (head > 512) {
      path.splice(0, head - 1);
      head = 1;
    }
    if (speed > 0.05) {
      const wanted = -Math.atan2(direction.z, direction.x);
      const delta = Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw));
      yaw += delta * Math.min(1, dt * 9);
      yawRotation.setFromAxisAngle(up, yaw);
      tiltRotation.setFromAxisAngle(
        tiltAxis,
        Math.atan2(direction.y, Math.hypot(direction.x, direction.z)),
      );
      orientation.copy(yawRotation).multiply(tiltRotation);
    }
    body.setNextKinematicTranslation(position);
    body.setNextKinematicRotation(orientation);
  }
  function touches(player: R.RigidBody) {
    for (const collider of colliders)
      for (let i = 0; i < player.numColliders(); i++)
        if (world.intersectionPair(collider, player.collider(i))) return true;
    return false;
  }
  return {
    body,
    reset,
    step,
    touches,
    get elapsed() {
      return elapsed;
    },
    get speed() {
      return speed;
    },
    get started() {
      return started;
    },
    get difficulty() {
      return pursuitDifficulty(elapsed);
    },
    dispose() {
      world.removeRigidBody(body);
    },
  };
}
