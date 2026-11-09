import type R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { VectorLike } from '../engine/types';
import { rotateVector } from '../engine/math';
import { MISSILE_BLAST_RADIUS } from '../police/missiles';

/** The same distance-scaled shockwave for every car; never changes capture state. */
export function applyExplosionImpulse(body: R.RigidBody, origin: VectorLike) {
  const p = body.worldCom();
  const dx = p.x - origin.x,
    dz = p.z - origin.z;
  const distance = Math.hypot(dx, p.y - origin.y, dz);
  if (distance >= MISSILE_BLAST_RADIUS) return false;
  const falloff = (1 - distance / MISSILE_BLAST_RADIUS) ** 1.2;
  const strength = body.mass() * falloff;
  if (strength <= 0) return false;
  const horizontal = Math.hypot(dx, dz);
  // A direct hit still tips the car; avoid a zero radial direction at the blast centre.
  const side = rotateVector(body.rotation(), { x: 0, y: 0, z: 1 });
  const nx = horizontal > 0.05 ? dx / horizontal : side.x;
  const nz = horizontal > 0.05 ? dz / horizontal : side.z;
  body.applyImpulse({ x: nx * strength * 12, y: strength * 4.2, z: nz * strength * 12 }, true);
  const forward = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
  const yawSign = forward.x * nz - forward.z * nx >= 0 ? 1 : -1;
  body.applyTorqueImpulse(
    { x: nz * strength * 0.8, y: yawSign * strength * 0.9, z: -nx * strength * 0.8 },
    true,
  );
  return true;
}
