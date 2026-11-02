import type { VectorLike } from '../engine/types';
import { HELICOPTER_SECONDS } from '../engine/speed';
export const AIR_CAPTURE_SECONDS = 5;
export const AIR_BEAM_RADIUS = 10;
export const AIR_MAX_SPEED = 230 / 3.6;
const ALTITUDE = 30;
const ACCELERATION = 10;

/** Air motion and its independent, strictly continuous searchlight capture clock. */
export function createAirPursuit(
  ground: (x: number, z: number) => number,
  obstructed: (origin: VectorLike, target: VectorLike) => boolean = () => false,
) {
  const position = { x: 0, y: 0, z: 0 },
    velocity = { x: 0, y: 0, z: 0 },
    beam = { x: 0, y: 0, z: 0 };
  let active = false,
    exposure = 0,
    inside = false,
    yaw = 0;
  return {
    position,
    velocity,
    beam,
    get active() {
      return active;
    },
    get yaw() {
      return yaw;
    },
    get exposure() {
      return exposure;
    },
    get illuminated() {
      return inside;
    },
    get caught() {
      return exposure >= AIR_CAPTURE_SECONDS - 1e-9;
    },
    reset() {
      active = false;
      exposure = 0;
      inside = false;
      yaw = 0;
      velocity.x = velocity.y = velocity.z = 0;
    },
    step(dt: number, seconds: number, target: VectorLike, targetVelocity: VectorLike) {
      if (dt <= 0 || seconds < HELICOPTER_SECONDS) return;
      if (!active) {
        position.x = target.x - 120;
        position.z = target.z - 80;
        position.y = Math.max(ground(position.x, position.z), target.y) + ALTITUDE;
        active = true;
        exposure = 0;
      }
      const dx = target.x - position.x,
        dz = target.z - position.z;
      let vx = targetVelocity.x + dx * 0.85,
        vz = targetVelocity.z + dz * 0.85;
      const wantedSpeed = Math.hypot(vx, vz);
      if (wantedSpeed > AIR_MAX_SPEED) {
        vx *= AIR_MAX_SPEED / wantedSpeed;
        vz *= AIR_MAX_SPEED / wantedSpeed;
      }
      const ax = vx - velocity.x,
        az = vz - velocity.z;
      const change = Math.hypot(ax, az),
        amount = Math.min(1, (ACCELERATION * dt) / Math.max(change, 0.001));
      velocity.x += ax * amount;
      velocity.z += az * amount;
      position.x += velocity.x * dt;
      position.z += velocity.z * dt;
      const terrain = ground(position.x, position.z);
      const desiredY = Math.max(terrain, target.y) + ALTITUDE;
      position.y += Math.max(-12 * dt, Math.min(12 * dt, desiredY - position.y));
      position.y = Math.max(position.y, terrain + 22);
      const heading =
        Math.hypot(velocity.x, velocity.z) > 1
          ? Math.atan2(-velocity.z, velocity.x)
          : Math.atan2(-dz, dx);
      const delta = Math.atan2(Math.sin(heading - yaw), Math.cos(heading - yaw));
      yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, delta));
      // The nose-mounted lamp points straight down; this is also the visible disc centre.
      beam.x = position.x + Math.cos(yaw) * 1.6;
      beam.z = position.z - Math.sin(yaw) * 1.6;
      beam.y = ground(beam.x, beam.z) + 0.08;
      const origin = { x: beam.x, y: position.y + 0.4, z: beam.z };
      inside =
        Math.hypot(target.x - beam.x, target.z - beam.z) <= AIR_BEAM_RADIUS &&
        target.y < origin.y &&
        !obstructed(origin, target);
      exposure = inside ? Math.min(AIR_CAPTURE_SECONDS, exposure + dt) : 0;
    },
  };
}
