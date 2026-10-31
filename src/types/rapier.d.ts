/** Rapier 0.17's package main points Node ESM to a CommonJS file; use its ESM entry. */
declare module '@dimforge/rapier3d-compat/rapier.es.js' {
  import RAPIER from '@dimforge/rapier3d-compat';
  export default RAPIER;
}
