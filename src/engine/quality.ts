/** Keep WebGL's pixel budget bounded even on large/high-DPI screens. DOM stays sharp. */
export function renderRatioLimit(width: number, height: number, deviceRatio = 1) {
  return Math.min(deviceRatio, 1, Math.sqrt((960 * 600) / Math.max(1, width * height)));
}

/** React quickly to severe drops; restore detail slowly to avoid oscillation. */
export function createAdaptiveQuality(maxRatio: number) {
  let maximum = maxRatio,
    minimum = maxRatio * 0.6;
  let ratio = Math.min(0.8, maximum),
    seconds = 0,
    frames = 0,
    warmup = 0.5;
  return {
    get ratio() {
      return ratio;
    },
    resize(nextMaximum: number) {
      maximum = nextMaximum;
      minimum = maximum * 0.6;
      ratio = Math.min(maximum, Math.max(minimum, ratio));
      this.reset();
    },
    reset() {
      seconds = 0;
      frames = 0;
      warmup = 0.5;
    },
    sample(dt: number) {
      if (dt <= 0 || dt > 1) return false;
      if (warmup > 0) {
        warmup -= dt;
        return false;
      }
      seconds += dt;
      frames++;
      if (seconds < 0.8) return false;
      const fps = frames / seconds;
      const next =
        fps < 24
          ? Math.max(minimum, ratio * 0.75)
          : fps < 43
            ? Math.max(minimum, ratio - 0.06 * maximum)
            : fps > 58
              ? Math.min(maximum, ratio + 0.025 * maximum)
              : ratio;
      seconds = 0;
      frames = 0;
      if (Math.abs(next - ratio) < 0.001) return false;
      ratio = next;
      return true;
    },
  };
}
