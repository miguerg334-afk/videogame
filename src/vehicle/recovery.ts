import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { rotateVector } from '../engine/math';

/** Upright on the current physical surface, including a tunnel floor or its roof. */
export function recoveryPose(
  world: R.World,
  body: R.RigidBody,
  fallbackHeight: (x: number, z: number) => number,
) {
  const current = body.translation(),
    forward = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
  const heading = new THREE.Vector3(forward.x, 0, forward.z);
  if (heading.lengthSq() < 0.01) heading.set(1, 0, 0);
  heading.normalize();
  const ray = new R.Ray({ x: current.x, y: current.y + 0.15, z: current.z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRayAndGetNormal(
    ray,
    80,
    false,
    R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
  );
  let ground = fallbackHeight(current.x, current.z);
  const gradientX =
    (fallbackHeight(current.x + 1, current.z) - fallbackHeight(current.x - 1, current.z)) / 2;
  const gradientZ =
    (fallbackHeight(current.x, current.z + 1) - fallbackHeight(current.x, current.z - 1)) / 2;
  const up = new THREE.Vector3(-gradientX, 1, -gradientZ).normalize();
  if (up.y < 0.35) up.set(0, 1, 0);
  if (hit && hit.normal.y > 0.35) {
    ground = ray.origin.y - hit.timeOfImpact;
    up.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
  }
  // Match the supporting slope while preserving the original horizontal heading.
  heading.y = -(up.x * heading.x + up.z * heading.z) / up.y;
  heading.normalize();
  const right = new THREE.Vector3().crossVectors(heading, up).normalize();
  heading.crossVectors(up, right).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(heading, up, right),
  );
  return { position: { x: current.x, y: ground + 0.7 / up.y, z: current.z }, rotation };
}
