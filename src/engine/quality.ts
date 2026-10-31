/** Slow, hysteretic resolution changes avoid reallocating buffers every frame. */
export function createAdaptiveQuality(maxRatio: number) {
  let ratio = Math.min(1, maxRatio),
    seconds = 0,
    frames = 0,
    warmup = 2;
  return {
    get ratio() {
      return ratio;
    },
    reset() {
      seconds = 0;
      frames = 0;
      warmup = 2;
    },
    sample(dt: number) {
      if (dt <= 0 || dt > 0.25) return false;
      if (warmup > 0) {
        warmup -= dt;
        return false;
      }
      seconds += dt;
      frames++;
      if (seconds < 2) return false;
      const fps = frames / seconds;
      const next =
        fps < 48 ? Math.max(0.7, ratio - 0.1) : fps > 59 ? Math.min(maxRatio, ratio + 0.05) : ratio;
      seconds = 0;
      frames = 0;
      if (Math.abs(next - ratio) < 0.001) return false;
      ratio = Math.round(next * 100) / 100;
      return true;
    },
  };
}
