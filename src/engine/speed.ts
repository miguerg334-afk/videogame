export const PURSUIT_LEVEL_SECONDS = 45;
export const PURSUIT_RAMP_SECONDS = PURSUIT_LEVEL_SECONDS * 4;

export const START_SPEED_KMH = 100;
export const MAX_SPEED_KMH = 130;

/** Player ceiling follows the active pursuit clock. */
export function pursuitSpeedLimitKmh(seconds: number) {
  const progress = Math.max(0, Math.min(1, seconds / PURSUIT_RAMP_SECONDS));
  return START_SPEED_KMH + (MAX_SPEED_KMH - START_SPEED_KMH) * progress;
}

/** A modest, explicit advantage; suspension, grip and forces stay identical. */
export const POLICE_SPEED_BONUS_KMH = 6;
export const POLICE_MAX_SPEED_KMH = 150;
export function policeSpeedLimitKmh(seconds: number) {
  const progress = Math.max(0, Math.min(1, seconds / PURSUIT_RAMP_SECONDS));
  return (
    pursuitSpeedLimitKmh(seconds) +
    POLICE_SPEED_BONUS_KMH +
    (POLICE_MAX_SPEED_KMH - MAX_SPEED_KMH - POLICE_SPEED_BONUS_KMH) * progress
  );
}
