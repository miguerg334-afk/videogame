import * as THREE from 'three';
import type { createMissiles } from './missiles';
import { MISSILE_PROFILES } from './missile-profiles';

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
  const heavyBodyGeometry = new THREE.CylinderGeometry(0.35, 0.42, 2.6, 8);
  const heavyNoseGeometry = new THREE.ConeGeometry(0.35, 0.85, 8);
  const finGeometry = new THREE.BoxGeometry(0.06, 0.9, 1.3);
  const bandGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.22, 8);
  const heavyMaterial = new THREE.MeshBasicMaterial({ color: 0x373b42 });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: 0xffb629 });
  const rockets = Array.from({ length: 3 }, () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 1.1;
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.rotation.z = Math.PI;
    flame.position.y = -1.5;
    const normal = new THREE.Group();
    normal.name = 'standard-missile';
    normal.add(body, nose, flame);
    const heavy = new THREE.Group();
    heavy.name = 'titan-missile';
    const casing = new THREE.Mesh(heavyBodyGeometry, heavyMaterial);
    const warhead = new THREE.Mesh(heavyNoseGeometry, bandMaterial);
    warhead.position.y = 1.7;
    heavy.add(casing, warhead);
    for (const y of [-0.8, 0.65]) {
      const band = new THREE.Mesh(bandGeometry, bandMaterial);
      band.position.y = y;
      heavy.add(band);
    }
    for (let i = 0; i < 2; i++) {
      const fin = new THREE.Mesh(finGeometry, heavyMaterial);
      fin.position.y = -1.05;
      fin.rotation.y = (i * Math.PI) / 2;
      heavy.add(fin);
    }
    const heavyFlame = new THREE.Mesh(flameGeometry, flameMaterial);
    heavyFlame.rotation.z = Math.PI;
    heavyFlame.position.y = -2.1;
    heavyFlame.scale.set(1.9, 1.4, 1.9);
    heavy.add(heavyFlame);
    group.add(normal, heavy);
    group.visible = false;
    root.add(group);
    return group;
  });
  const particles = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    144,
  );
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  root.add(particles);
  const ringGeometry = new THREE.RingGeometry(0.88, 1, 28);
  const warningGeometry = ringGeometry.clone();
  let warningX = NaN,
    warningZ = NaN;
  const warningRing = new THREE.Mesh(
    warningGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffb629,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  warningRing.name = 'titan-target-warning';
  warningRing.rotation.x = -Math.PI / 2;
  warningRing.scale.setScalar(MISSILE_PROFILES.heavy.radius);
  warningRing.visible = false;
  root.add(warningRing);
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
      warningRing.visible = state.warning > 0 && state.warningKind === 'heavy';
      root.visible =
        warningRing.visible ||
        state.missiles.some((m) => m.active) ||
        state.blasts.some((b) => b.active);
      if (!root.visible) return;
      if (warningRing.visible) {
        const p = state.warningAim;
        const floor = ground(p.x, p.z);
        warningRing.position.set(p.x, floor + 0.15, p.z);
        if (p.x !== warningX || p.z !== warningZ) {
          warningX = p.x;
          warningZ = p.z;
          const attr = warningGeometry.getAttribute('position') as THREE.BufferAttribute;
          const radius = MISSILE_PROFILES.heavy.radius;
          for (let i = 0; i < attr.count; i++)
            attr.setZ(
              i,
              (ground(p.x + attr.getX(i) * radius, p.z - attr.getY(i) * radius) - floor) / radius,
            );
          attr.needsUpdate = true;
          warningGeometry.computeBoundingSphere();
        }
        warningRing.material.opacity = 0.4 + Math.sin(state.warning * 16) ** 2 * 0.45;
      }
      state.missiles.forEach((m, i) => {
        const rocket = rockets[i];
        rocket.visible = m.active;
        if (!m.active) return;
        rocket.children[0].visible = m.kind === 'normal';
        rocket.children[1].visible = m.kind === 'heavy';
        rocket.position.set(m.position.x, m.position.y, m.position.z);
        rocket.quaternion.setFromUnitVectors(
          up,
          direction.set(m.direction.x, m.direction.y, m.direction.z),
        );
      });
      state.blasts.forEach((blast, i) => {
        const profile = MISSILE_PROFILES[blast.kind];
        const ring = rings[i],
          t = blast.age / profile.duration;
        ring.visible = blast.active;
        if (blast.active) {
          ring.position.set(
            blast.position.x,
            ground(blast.position.x, blast.position.z) + 0.12,
            blast.position.z,
          );
          ring.scale.setScalar(1 + t * (profile.radius - 1));
          ring.material.color.setHex(blast.kind === 'heavy' ? 0xff5929 : 0xffa340);
          ring.material.opacity = (1 - t) * 0.75;
        }
        for (let j = 0; j < 24; j++) {
          const visible = blast.active && (blast.kind === 'heavy' || j < 12);
          const angle = j * 2.39996 + i;
          dummy.position.set(
            blast.position.x + Math.cos(angle) * t * (4 + (j % 3)) * profile.scale,
            blast.position.y + 0.6 + Math.sin(j + 1) ** 2 * t * 6 * profile.scale,
            blast.position.z + Math.sin(angle) * t * (4 + (j % 3)) * profile.scale,
          );
          dummy.scale.setScalar(visible ? (1 - t) * (0.6 + (j % 3) * 0.45) * profile.scale : 0);
          dummy.updateMatrix();
          particles.setMatrixAt(i * 24 + j, dummy.matrix);
          color.setHSL(
            j < 8 ? 0.025 + (j % 3) * 0.035 : 0,
            j < 8 ? 1 - t * 0.8 : 0,
            j < 8 ? 0.12 + (1 - t) * (0.28 + (j % 3) * 0.1) : 0.13 + t * 0.08,
          );
          particles.setColorAt(i * 24 + j, color);
        }
      });
      particles.instanceMatrix.needsUpdate = true;
      if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    },
  };
}
