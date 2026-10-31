import * as THREE from 'three';

/** Static matrices are built once; the renderer need only update moving roots. */
export function freezeWorldTransforms(scene: THREE.Scene, dynamicRoots: THREE.Object3D[]) {
  const dynamic = new Set(dynamicRoots);
  for (const root of scene.children) {
    if (dynamic.has(root)) continue;
    root.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }
  scene.updateMatrixWorld(true);
  scene.autoUpdate = false;
  return () => {
    for (const root of dynamicRoots) root.updateMatrixWorld(true);
  };
}
