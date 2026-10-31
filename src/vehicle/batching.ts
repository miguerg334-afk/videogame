import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bake static parts by material while leaving moving subtrees and glass intact. */
export function batchStaticParts(root: THREE.Object3D, moving = new Set<THREE.Object3D>()) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  function visit(object: THREE.Object3D) {
    if (moving.has(object)) return;
    if (
      object instanceof THREE.Mesh &&
      !(object instanceof THREE.InstancedMesh) &&
      !Array.isArray(object.material) &&
      !object.material.transparent
    ) {
      const signature = Object.entries((object.geometry as THREE.BufferGeometry).attributes)
        .map(([name, attr]) => `${name}:${attr.itemSize}`)
        .sort()
        .join(',');
      const key = `${object.material.uuid}:${signature}:${!!object.geometry.index}:${object.castShadow}:${object.receiveShadow}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(object);
    }
    for (const child of object.children) visit(child);
  }
  visit(root);
  const originals = new Set<THREE.BufferGeometry>();
  let before = 0,
    after = 0;
  for (const meshes of buckets.values()) {
    before += meshes.length;
    after++;
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      const part = mesh.geometry.clone().applyMatrix4(matrix);
      // Mirrored spokes previously relied on the renderer reversing front faces.
      // Once baked into a shared mesh, their winding must be reversed explicitly.
      if (matrix.determinant() < 0) {
        if (part.index) {
          for (let i = 0; i < part.index.count; i += 3) {
            const b = part.index.getX(i + 1);
            part.index.setX(i + 1, part.index.getX(i + 2));
            part.index.setX(i + 2, b);
          }
        } else {
          for (const attribute of Object.values(part.attributes) as THREE.BufferAttribute[]) {
            const size = attribute.itemSize,
              values = attribute.array as Float32Array;
            for (let i = 0; i < attribute.count; i += 3)
              for (let j = 0; j < size; j++) {
                const a = (i + 1) * size + j,
                  b = (i + 2) * size + j;
                const value = values[a];
                values[a] = values[b];
                values[b] = value;
              }
          }
        }
      }
      return part;
    });
    const geometry = BufferGeometryUtils.mergeBufferGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error('No se pudieron agrupar las piezas del coche');
    geometry.computeBoundingSphere();
    const merged = new THREE.Mesh(geometry, meshes[0].material);
    merged.name = 'batched-car-parts';
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    merged.matrixAutoUpdate = false;
    root.add(merged);
    for (const mesh of meshes) {
      originals.add(mesh.geometry);
      mesh.parent?.remove(mesh);
    }
  }
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) retained.add(object.geometry);
  });
  for (const geometry of originals) if (!retained.has(geometry)) geometry.dispose();
  return { before, after };
}
