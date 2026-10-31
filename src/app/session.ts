export const CAPTURE_SECONDS = 5;
// Ignore momentary solver gaps during a sustained collision; real separation clears the timer.
const CONTACT_GAP_SECONDS = 0.2;

export type SessionPhase = 'menu' | 'playing' | 'paused' | 'caught';

/** One phase decides whether input, simulation and the pursuit clock can advance. */
export function createGameSession() {
  let phase: SessionPhase = 'menu';
  let contactSeconds = 0,
    separatedSeconds = 0;
  function clearCapture() {
    contactSeconds = separatedSeconds = 0;
  }
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
    get captureSeconds() {
      return contactSeconds;
    },
    get captureProgress() {
      return contactSeconds / CAPTURE_SECONDS;
    },
    updateCapture(touching: boolean, dt: number) {
      if (phase !== 'playing') return false;
      if (touching) {
        separatedSeconds = 0;
        contactSeconds = Math.min(CAPTURE_SECONDS, contactSeconds + Math.max(0, dt));
      } else {
        separatedSeconds += Math.max(0, dt);
        if (separatedSeconds >= CONTACT_GAP_SECONDS - 1e-9) clearCapture();
      }
      if (contactSeconds >= CAPTURE_SECONDS - 1e-9) {
        contactSeconds = CAPTURE_SECONDS;
        phase = 'caught';
        return true;
      }
      return false;
    },
    start() {
      clearCapture();
      phase = 'playing';
    },
    openMenu() {
      clearCapture();
      phase = 'menu';
    },
    setPaused(value: boolean) {
      if (phase === 'playing' || phase === 'paused') phase = value ? 'paused' : 'playing';
    },
    lose() {
      if (phase === 'playing') phase = 'caught';
    },
    resetRound() {
      clearCapture();
      if (phase !== 'menu') phase = 'playing';
    },
  };
}
