import * as THREE from 'three';
import type { createMountainWorld } from './mountain.js';
import type { VectorLike } from '../engine/types';

type Map = ReturnType<typeof createMountainWorld>;
export const PICKUP_RESPAWN = 45;
export function createPowerups(scene: THREE.Scene, map: Map) {
  const entries: {
    position: THREE.Vector3;
    kind: string;
    availableAt: number;
    object: THREE.Group;
  }[] = [];
  const cyan = new THREE.MeshStandardMaterial({
    color: 0x57dcff,
    emissive: 0x00a3d8,
    emissiveIntensity: 1.3,
    metalness: 0.3,
    roughness: 0.35,
  });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffdf79 });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x50deff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const crystalGeometry = new THREE.OctahedronGeometry(0.48);
  const ringGeometry = new THREE.TorusGeometry(0.85, 0.025, 4, 24);
  const boltShape = new THREE.Shape();
  boltShape.moveTo(0.08, 0.42);
  boltShape.lineTo(-0.23, 0.02);
  boltShape.lineTo(-0.02, 0.02);
  boltShape.lineTo(-0.11, -0.36);
  boltShape.lineTo(0.26, 0.12);
  boltShape.lineTo(0.06, 0.12);
  boltShape.closePath();
  const boltGeometry = new THREE.ExtrudeGeometry(boltShape, { depth: 0.07, bevelEnabled: false });
  function add(x: number, y: number, z: number, kind: string) {
    if (entries.some((e) => e.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 25 ** 2))
      return;
    const object = new THREE.Group();
    object.position.set(x, y + 1.2, z);
    const crystal = new THREE.Mesh(crystalGeometry, cyan);
    object.add(crystal);
    const ring = new THREE.Mesh(ringGeometry, haloMaterial);
    ring.rotation.x = Math.PI / 2;
    object.add(ring);
    const bolt = new THREE.Mesh(boltGeometry, amber);
    bolt.position.z = 0.48;
    object.add(bolt);
    object.name = 'powerup-300';
    scene.add(object);
    entries.push({ position: object.position.clone(), kind, availableAt: 0, object });
  }
  for (let i = 0; i < 22; i++) {
    const frame = map.frames[Math.floor(((0.09 + i / 22) % 1) * map.N)];
    if (map.tunnelForIndex(map.nearestTrack(frame.p).index, 8)) continue;
    const p = map.offsetPoint(frame, 2.15);
    add(p.x, p.y, p.z, 'road');
  }
  for (const trail of map.trailNetwork.trails)
    for (const fraction of [0.22, 0.5, 0.78]) {
      const f = trail.frames[Math.floor(fraction * (trail.frames.length - 1))];
      add(f.p.x, f.p.y + 0.04, f.p.z, 'trail');
    }
  // Distributed clearings on both sides of the loop, on drivable slopes.
  for (let i = 0; i < 100 && entries.filter((e) => e.kind === 'mountain').length < 18; i++) {
    const f = map.frames[Math.floor(((i * 0.61803398875 + 0.12) % 1) * map.N)],
      side = i % 3 === 0 ? -1 : 1;
    const distance = 55 + ((i * 47) % 240),
      x = f.p.x + f.normal.x * distance * side,
      z = f.p.z + f.normal.z * distance * side;
    if (
      map.boundary.distance({ x, z }) < 30 ||
      map.forest.positions.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)
    )
      continue;
    const slope =
      Math.hypot(
        map.terrainHeight(x + 2, z) - map.terrainHeight(x - 2, z),
        map.terrainHeight(x, z + 2) - map.terrainHeight(x, z - 2),
      ) / 4;
    if (slope > 0.55) continue;
    add(x, map.terrainHeight(x, z), z, 'mountain');
  }
  function collect(from: VectorLike, to: VectorLike, time: number) {
    let count = 0;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z,
      length = dx * dx + dy * dy + dz * dz;
    for (const e of entries) {
      if (time < e.availableAt) continue;
      const p = e.position;
      const t =
        length > 0
          ? THREE.MathUtils.clamp(
              ((p.x - from.x) * dx + (p.y - from.y) * dy + (p.z - from.z) * dz) / length,
              0,
              1,
            )
          : 0;
      if (
        (p.x - from.x - dx * t) ** 2 + (p.y - from.y - dy * t) ** 2 + (p.z - from.z - dz * t) ** 2 >
        2.7 ** 2
      )
        continue;
      e.availableAt = time + PICKUP_RESPAWN;
      e.object.visible = false;
      count++;
    }
    return count;
  }
  function update(time: number) {
    for (const e of entries) {
      e.object.visible = time >= e.availableAt;
      if (!e.object.visible) continue;
      e.object.position.y = e.position.y + Math.sin(time * 2.5 + e.position.x) * 0.13;
      e.object.rotation.y = time * 1.8;
    }
  }
  return { entries, collect, update };
}
