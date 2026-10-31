import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { createMountainWorld } from '../world/mountain.js';
import type { VectorLike } from './types';

type RouteGeometry = Pick<
  ReturnType<typeof createMountainWorld>,
  'frames' | 'nearestTrack' | 'tunnelForIndex' | 'routeHeight' | 'driveGroundHeight'
> & { world?: R.World };

/** Only a vehicle actually between the portals, walls and roof is inside. */
export function tunnelInteriorAt(position: VectorLike, route: RouteGeometry) {
  const near = route.nearestTrack(position),
    tunnel = route.tunnelForIndex(near.index);
  if (!tunnel) return undefined;
  const first = route.frames[tunnel.start],
    last = route.frames[tunnel.end];
  const longitudinal = (frame: typeof first) =>
    (position.x - frame.p.x) * frame.tangent.x + (position.z - frame.p.z) * frame.tangent.z;
  if (longitudinal(first) < 0 || longitudinal(last) > 0) return undefined;
  const lateral =
    (position.x - near.frame.p.x) * near.frame.normal.x +
    (position.z - near.frame.p.z) * near.frame.normal.z;
  if (Math.abs(lateral) >= 6.35) return undefined;
  const floor = route.routeHeight(position.x, position.z) + 0.075;
  const ceiling = 3 + 2.8 * Math.sqrt(Math.max(0, 1 - (lateral / 6.5) ** 2));
  if (position.y < floor - 0.5 || position.y >= floor + ceiling - 0.15) return undefined;
  return { tunnel, near };
}

export function constrainChaseCamera(
  point: THREE.Vector3,
  route: RouteGeometry,
  vehiclePosition: VectorLike = point,
) {
  const interior = tunnelInteriorAt(vehiclePosition, route);
  if (interior) {
    const near = route.nearestTrack(point),
      frame = near.frame;
    const lateral = (point.x - frame.p.x) * frame.normal.x + (point.z - frame.p.z) * frame.normal.z;
    const safe = THREE.MathUtils.clamp(lateral, -4.7, 4.7);
    point.addScaledVector(frame.normal, safe - lateral);
    const floor = route.routeHeight(point.x, point.z) + 0.075;
    const ceiling = 3 + 2.8 * Math.sqrt(Math.max(0, 1 - (safe / 6.5) ** 2));
    point.y = THREE.MathUtils.clamp(point.y, floor + 1.2, floor + ceiling - 0.6);
  } else {
    point.y = Math.max(point.y, route.driveGroundHeight(point.x, point.z) + 1.3);
  }
  if (!route.world) return;
  // Keep the camera on the car's side of walls, terrain and trees. The clearance
  // also covers the tunnel's decorative outer shell, beyond its inner collider.
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
