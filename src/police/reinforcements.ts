import type R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { VectorLike } from '../engine/types';
import { REINFORCEMENT_SECONDS } from '../engine/speed';
import { createPursuit } from './pursuit';
import type { PursuitNavigation } from './navigation';

/** A single reinforcement, born on the same pursuit clock and integrated in the shared world. */
export function createReinforcements(
  primary: ReturnType<typeof createPursuit>,
  world: R.World,
  ground: (x: number, z: number) => number,
  navigation: PursuitNavigation,
  spawnSeed: () => VectorLike[],
) {
  let officer: ReturnType<typeof createPursuit> | undefined;
  return {
    get officer() {
      return officer;
    },
    prepare(dt: number, target: VectorLike, offroad: (p: VectorLike) => boolean) {
      if (!officer && primary.elapsed >= REINFORCEMENT_SECONDS) {
        officer = createPursuit(world, ground, navigation);
        officer.reset(spawnSeed(), Math.max(0, primary.elapsed - dt));
      }
      officer?.step(dt, target, true, officer ? offroad(officer.body.translation()) : false);
    },
    reset() {
      officer?.dispose();
      officer = undefined;
    },
  };
}
