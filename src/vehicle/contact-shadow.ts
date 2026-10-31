import * as THREE from 'three';

/** A soft, two-triangle contact shadow replaces additional shadow-map passes. */
export function createContactShadow(parent: THREE.Group) {
  const data = new Uint8Array(64 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 64; x++) {
      const radius = ((x - 31.5) / 31.5) ** 2 + ((y - 15.5) / 15.5) ** 2;
      data[(y * 64 + x) * 4 + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 110);
    }
  const texture = new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat);
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 2.4),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.name = 'vehicle-contact-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.55;
  parent.add(mesh);
  return mesh;
}
