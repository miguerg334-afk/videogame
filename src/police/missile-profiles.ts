export type MissileKind = 'normal' | 'heavy';

/** Immutable tuning shared by simulation, effects and physical shockwaves. */
export const MISSILE_PROFILES = {
  normal: {
    speed: 65,
    turnRate: 0.65,
    warning: 1.8,
    radius: 9,
    cutoff: 18,
    duration: 1.4,
    scale: 1,
    push: 12,
    lift: 4.2,
    tilt: 0.8,
    yaw: 0.9,
    falloff: 1.2,
  },
  heavy: {
    speed: 58,
    turnRate: 0.48,
    warning: 2.8,
    radius: 22,
    cutoff: 30,
    duration: 2.2,
    scale: 2.6,
    push: 18,
    lift: 8,
    tilt: 2.6,
    yaw: 1.5,
    falloff: 0.85,
  },
} as const;
