import * as THREE from 'three';
import type { createMissiles } from './missiles';

/** Reused meshes and one instanced particle pool; no lights, shadows or physics debris. */
export function createMissileVisual(scene: THREE.Scene, ground: (x: number, z: number) => number) {
  const root = new THREE.Group();
  root.name = 'helicopter-missiles';
  const bodyGeometry = new THREE.CylinderGeometry(0.14, 0.2, 1.8, 6);
  const noseGeometry = new THREE.ConeGeometry(0.2, 0.55, 6);
  const flameGeometry = new THREE.ConeGeometry(0.24, 1.5, 6);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xcbd2da });
  const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xdb4834 });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffba45 });
  const rockets = Array.from({ length: 3 }, () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 1.1;
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.rotation.z = Math.PI;
    flame.position.y = -1.5;
    group.add(body, nose, flame);
    group.visible = false;
    root.add(group);
    return group;
  });
  const particles = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    72,
  );
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  root.add(particles);
  const ringGeometry = new THREE.RingGeometry(0.88, 1, 28);
  const rings = Array.from({ length: 6 }, () => {
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffa340,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    root.add(ring);
    return ring;
  });
  const dummy = new THREE.Object3D(),
    up = new THREE.Vector3(0, 1, 0),
    direction = new THREE.Vector3(),
    color = new THREE.Color();
  scene.add(root);
  return {
    root,
    reset() {
      root.visible = false;
    },
    update(state: ReturnType<typeof createMissiles>) {
      root.visible = state.missiles.some((m) => m.active) || state.blasts.some((b) => b.active);
      if (!root.visible) return;
      state.missiles.forEach((m, i) => {
        const rocket = rockets[i];
        rocket.visible = m.active;
        if (!m.active) return;
        rocket.position.set(m.position.x, m.position.y, m.position.z);
        rocket.quaternion.setFromUnitVectors(
          up,
          direction.set(m.direction.x, m.direction.y, m.direction.z),
        );
      });
      state.blasts.forEach((blast, i) => {
        const ring = rings[i],
          t = blast.age / 1.4;
        ring.visible = blast.active;
        if (blast.active) {
          ring.position.set(
            blast.position.x,
            ground(blast.position.x, blast.position.z) + 0.12,
            blast.position.z,
          );
          ring.scale.setScalar(1 + t * 10);
          ring.material.opacity = (1 - t) * 0.75;
        }
        for (let j = 0; j < 12; j++) {
          const angle = j * 2.39996 + i;
          dummy.position.set(
            blast.position.x + Math.cos(angle) * t * (4 + (j % 3)),
            blast.position.y + 0.6 + Math.sin(j + 1) ** 2 * t * 6,
            blast.position.z + Math.sin(angle) * t * (4 + (j % 3)),
          );
          dummy.scale.setScalar(blast.active ? (1 - t) * (0.6 + (j % 3) * 0.45) : 0);
          dummy.updateMatrix();
          particles.setMatrixAt(i * 12 + j, dummy.matrix);
          color.setHSL(
            j < 8 ? 0.025 + (j % 3) * 0.035 : 0,
            j < 8 ? 1 - t * 0.8 : 0,
            j < 8 ? 0.12 + (1 - t) * (0.28 + (j % 3) * 0.1) : 0.13 + t * 0.08,
          );
          particles.setColorAt(i * 12 + j, color);
        }
      });
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
  };
}
