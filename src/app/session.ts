export type SessionPhase = 'menu' | 'playing' | 'paused' | 'caught';

/** One phase decides whether input, simulation and the pursuit clock can advance. */
export function createGameSession() {
  let phase: SessionPhase = 'menu';
  return {
    get phase() {
      return phase;
    },
    get running() {
      return phase === 'playing';
    },
    get inMenu() {
      return phase === 'menu';
    },
    get paused() {
      return phase === 'paused';
    },
    get caught() {
      return phase === 'caught';
    },
    start() {
      phase = 'playing';
    },
    openMenu() {
      phase = 'menu';
    },
    setPaused(value: boolean) {
      if (phase === 'playing' || phase === 'paused') phase = value ? 'paused' : 'playing';
    },
    lose() {
      if (phase === 'playing') phase = 'caught';
    },
    resetRound() {
      if (phase !== 'menu') phase = 'playing';
    },
  };
}
