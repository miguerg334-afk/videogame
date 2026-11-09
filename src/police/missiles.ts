import type { VectorLike } from '../engine/types';

export const MISSILE_SPEED = 65;
export const MISSILE_TURN_RATE = 0.65;
export const MISSILE_WARNING_SECONDS = 1.8;
export const MISSILE_BLAST_RADIUS = 9;
export const MISSILE_LIFETIME = 6;
const COOLDOWN = 7;
const MAX_RANGE = 240;

export type Missile = {
  active: boolean;
  guiding: boolean;
  age: number;
  position: VectorLike;
  direction: VectorLike;
};
export type Blast = { active: boolean; age: number; position: VectorLike };
const point = () => ({ x: 0, y: 0, z: 0 });

/** Bounded pools; limited turning and a terminal guidance cutoff leave room to dodge. */
export function createMissiles(
  ground: (x: number, z: number) => number,
  onExplosion: (position: VectorLike) => void = () => {},
) {
  const missiles: Missile[] = Array.from({ length: 3 }, () => ({
    active: false,
    guiding: true,
    age: 0,
    position: point(),
    direction: point(),
  }));
  const blasts: Blast[] = Array.from({ length: 6 }, () => ({
    active: false,
    age: 0,
    position: point(),
  }));
  let cooldown = 6,
    warning = 0;
  function explode(m: Missile) {
    m.active = false;
    const blast = blasts.find((b) => !b.active) ?? blasts.reduce((a, b) => (a.age > b.age ? a : b));
    blast.active = true;
    blast.age = 0;
    Object.assign(blast.position, m.position);
    onExplosion(blast.position);
  }
  return {
    missiles,
    blasts,
    get warning() {
      return warning;
    },
    reset() {
      cooldown = 6;
      warning = 0;
      for (const m of missiles) m.active = false;
      for (const b of blasts) b.active = false;
    },
    step(dt: number, active: boolean, origin: VectorLike, target: VectorLike) {
      if (dt <= 0) return;
      for (const b of blasts)
        if (b.active) {
          b.age += dt;
          if (b.age >= 1.4) b.active = false;
        }
      if (!active) return;
      const range = Math.hypot(target.x - origin.x, target.z - origin.z);
      // No delayed off-screen attacks: re-acquire with a fresh warning when in range.
      if (range > MAX_RANGE) {
        warning = 0;
        cooldown = Math.max(cooldown, 2);
      } else if (warning > 0) {
        warning = Math.max(0, warning - dt);
        if (warning === 0) {
          const m = missiles.find((p) => !p.active);
          if (m) {
            Object.assign(m.position, origin);
            m.position.y -= 1.2;
            const dx = target.x - m.position.x,
              dy = target.y - m.position.y,
              dz = target.z - m.position.z;
            const length = Math.hypot(dx, dy, dz) || 1;
            Object.assign(m.direction, { x: dx / length, y: dy / length, z: dz / length });
            m.age = 0;
            m.guiding = true;
            m.active = true;
          }
          cooldown = COOLDOWN;
        }
      } else {
        cooldown -= dt;
        if (cooldown <= 0) warning = MISSILE_WARNING_SECONDS;
      }
      for (const m of missiles)
        if (m.active) {
          m.age += dt;
          const dx = target.x - m.position.x,
            dy = target.y - m.position.y,
            dz = target.z - m.position.z;
          const distance = Math.hypot(dx, dy, dz);
          // Stop guiding before impact: a sharp last-second turn makes the missile overshoot.
          if (distance <= 18 || m.age >= 3.5) m.guiding = false;
          if (m.guiding && distance > 0.001) {
            const tx = dx / distance,
              ty = dy / distance,
              tz = dz / distance;
            const dot = Math.max(
              -1,
              Math.min(1, tx * m.direction.x + ty * m.direction.y + tz * m.direction.z),
            );
            const angle = Math.acos(dot);
            if (angle > 1e-6 && dot > -0.9999) {
              const turn = Math.min(angle, MISSILE_TURN_RATE * dt);
              const a = Math.sin(angle - turn) / Math.sin(angle),
                b = Math.sin(turn) / Math.sin(angle);
              m.direction.x = m.direction.x * a + tx * b;
              m.direction.y = m.direction.y * a + ty * b;
              m.direction.z = m.direction.z * a + tz * b;
            }
          }
          // Sweep in <= 1 m increments so fast missiles cannot tunnel through a slope or car.
          const steps = Math.max(1, Math.ceil(MISSILE_SPEED * dt));
          for (let i = 0; i < steps && m.active; i++) {
            m.position.x += (m.direction.x * MISSILE_SPEED * dt) / steps;
            m.position.y += (m.direction.y * MISSILE_SPEED * dt) / steps;
            m.position.z += (m.direction.z * MISSILE_SPEED * dt) / steps;
            const floor = ground(m.position.x, m.position.z);
            if (m.position.y <= floor + 0.2) {
              m.position.y = floor + 0.2;
              explode(m);
            } else if (
              Math.hypot(
                m.position.x - target.x,
                m.position.y - target.y,
                m.position.z - target.z,
              ) < 1.8
            )
              explode(m);
          }
          if (m.active && m.age >= MISSILE_LIFETIME) m.active = false;
        }
    },
  };
}
