import * as THREE from 'three';

/** Textures and materials are shared by many procedural meshes. Dispose each once. */
export function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      if ('geometry' in object) geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    }
    if (object instanceof THREE.Light && 'shadow' in object) {
      const map = (object as THREE.DirectionalLight).shadow.map as THREE.WebGLRenderTarget | null;
      map?.dispose();
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  scene.clear();
}
