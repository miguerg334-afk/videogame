import * as THREE from 'three';
import type { createMountainWorld } from '../world/mountain.js';

type RouteGeometry = Pick<
  ReturnType<typeof createMountainWorld>,
  'nearestTrack' | 'tunnelForIndex' | 'routeHeight' | 'driveGroundHeight'
>;

export function constrainChaseCamera(point: THREE.Vector3, route: RouteGeometry) {
  const { nearestTrack, tunnelForIndex, routeHeight, driveGroundHeight } = route;
  const near = nearestTrack(point),
    tunnel = tunnelForIndex(near.index, 12);
  if (tunnel && near.distance < 20) {
    const frame = near.frame,
      lateral = point.clone().sub(frame.p).dot(frame.normal),
      safe = THREE.MathUtils.clamp(lateral, -4.7, 4.7);
    point.addScaledVector(frame.normal, safe - lateral);
    const floor = routeHeight(point.x, point.z) + 0.075,
      ceiling = 3 + 2.8 * Math.sqrt(Math.max(0, 1 - (safe / 6.5) ** 2));
    point.y = THREE.MathUtils.clamp(point.y, floor + 1.2, floor + ceiling - 0.6);
  } else point.y = Math.max(point.y, driveGroundHeight(point.x, point.z) + 1.3);
}
