export const START_SPEED_KMH = 100;
export const MAX_SPEED_KMH = 120;

/** Both cars use the same pursuit clock and exactly the same speed ceiling. */
export function pursuitSpeedLimitKmh(seconds: number) {
  const progress = Math.max(0, Math.min(1, seconds / 120));
  return START_SPEED_KMH + (MAX_SPEED_KMH - START_SPEED_KMH) * progress;
}
