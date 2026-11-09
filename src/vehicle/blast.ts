import type R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { VectorLike } from '../engine/types';
import { rotateVector } from '../engine/math';
import { MISSILE_PROFILES, type MissileKind } from '../police/missile-profiles';

/** The same distance-scaled shockwave for every car; never changes capture state. */
export function applyExplosionImpulse(
  body: R.RigidBody,
  origin: VectorLike,
  kind: MissileKind = 'normal',
) {
  const profile = MISSILE_PROFILES[kind];
  const p = body.worldCom();
  const dx = p.x - origin.x,
    dz = p.z - origin.z;
  const distance = Math.hypot(dx, p.y - origin.y, dz);
  if (distance >= profile.radius) return false;
  const falloff = (1 - distance / profile.radius) ** profile.falloff;
  const strength = body.mass() * falloff;
  if (strength <= 0) return false;
  const horizontal = Math.hypot(dx, dz);
  // A direct hit still tips the car; avoid a zero radial direction at the blast centre.
  const side = rotateVector(body.rotation(), { x: 0, y: 0, z: 1 });
  const nx = horizontal > 0.05 ? dx / horizontal : side.x;
  const nz = horizontal > 0.05 ? dz / horizontal : side.z;
  body.applyImpulse(
    {
      x: nx * strength * profile.push,
      y: strength * profile.lift,
      z: nz * strength * profile.push,
    },
    true,
  );
  const forward = rotateVector(body.rotation(), { x: 1, y: 0, z: 0 });
  const yawSign = forward.x * nz - forward.z * nx >= 0 ? 1 : -1;
  body.applyTorqueImpulse(
    {
      x: nz * strength * profile.tilt,
      y: yawSign * strength * profile.yaw,
      z: -nx * strength * profile.tilt,
    },
    true,
  );
  if (kind === 'heavy') {
    const spin = body.angvel(),
      speed = Math.hypot(spin.x, spin.y, spin.z);
    if (speed > 5)
      body.setAngvel(
        { x: (spin.x * 5) / speed, y: (spin.y * 5) / speed, z: (spin.z * 5) / speed },
        true,
      );
  }
  return true;
}
