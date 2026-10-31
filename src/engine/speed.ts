export const START_SPEED_KMH = 100;
export const MAX_SPEED_KMH = 120;

/** Player ceiling follows the active pursuit clock. */
export function pursuitSpeedLimitKmh(seconds: number) {
  const progress = Math.max(0, Math.min(1, seconds / 120));
  return START_SPEED_KMH + (MAX_SPEED_KMH - START_SPEED_KMH) * progress;
}

/** A modest, explicit advantage; suspension, grip and forces stay identical. */
export const POLICE_SPEED_BONUS_KMH = 6;
export const POLICE_MAX_SPEED_KMH = 135;
export function policeSpeedLimitKmh(seconds: number) {
  const progress = Math.max(0, Math.min(1, seconds / 120));
  return (
    pursuitSpeedLimitKmh(seconds) +
    POLICE_SPEED_BONUS_KMH +
    (POLICE_MAX_SPEED_KMH - MAX_SPEED_KMH - POLICE_SPEED_BONUS_KMH) * progress
  );
}
