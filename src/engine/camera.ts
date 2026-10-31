import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { createMountainWorld } from '../world/mountain.js';
import type { VectorLike } from './types';

type RouteGeometry = Pick<ReturnType<typeof createMountainWorld>, 'driveGroundHeight'> & {
  world?: R.World;
};

export function constrainChaseCamera(
  point: THREE.Vector3,
  route: RouteGeometry,
  vehiclePosition: VectorLike = point,
) {
  point.y = Math.max(point.y, route.driveGroundHeight(point.x, point.z) + 1.3);
  if (!route.world) return;
  // Keep the camera on the vehicle's side of terrain, trees and the boundary wall.
  const origin = { x: vehiclePosition.x, y: vehiclePosition.y + 0.8, z: vehiclePosition.z };
  const dx = point.x - origin.x,
    dy = point.y - origin.y,
    dz = point.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) return;
  const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
  const hit = route.world.castRay(
    new R.Ray(origin, direction),
    distance,
    true,
    R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
  );
  if (hit) {
    const safeDistance = Math.max(0, hit.timeOfImpact - 0.95);
    point.set(
      origin.x + direction.x * safeDistance,
      origin.y + direction.y * safeDistance,
      origin.z + direction.z * safeDistance,
    );
  }
}
