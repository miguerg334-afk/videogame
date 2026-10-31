import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { createRouteLookup } from './route';
import type { TrailNetwork } from './trails';
import { PLAYABLE_BOUNDS } from './boundary';
import { addForestLOD } from './visibility';

export function createForest(
  scene: THREE.Scene,
  world: R.World,
  document: Document,
  heightAt: (x: number, z: number) => number,
  nearestTrack: ReturnType<typeof createRouteLookup>,
  trails: TrailNetwork,
) {
  let seed = 44901;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions: { x: number; y: number; z: number; h: number; pine: boolean }[] = [];
  for (let attempt = 0; attempt < 24000 && positions.length < 800; attempt++) {
    let x: number, z: number;
    if (positions.length < 300) {
      const trail = trails.trails[Math.floor(random() * trails.trails.length)];
      const frame = trail.frames[Math.floor(random() * trail.frames.length)];
      const side = (random() < 0.5 ? -1 : 1) * (22 + random() * 95);
      x = frame.p.x + frame.normal.x * side + frame.tangent.x * (random() - 0.5) * 20;
      z = frame.p.z + frame.normal.z * side + frame.tangent.z * (random() - 0.5) * 20;
    } else if (positions.length < 620) {
      const trail = trails.trails[Math.floor(random() * trails.trails.length)];
      const frame = trail.frames[Math.floor(random() * trail.frames.length)];
      const road = nearestTrack(frame.p).frame;
      const distance = 45 + random() * 600;
      x = road.p.x + road.normal.x * distance + road.tangent.x * (random() - 0.5) * 600;
      z = road.p.z + road.normal.z * distance + road.tangent.z * (random() - 0.5) * 600;
    } else {
      x = PLAYABLE_BOUNDS.xmin + random() * (PLAYABLE_BOUNDS.xmax - PLAYABLE_BOUNDS.xmin);
      z = PLAYABLE_BOUNDS.zmin + random() * (PLAYABLE_BOUNDS.zmax - PLAYABLE_BOUNDS.zmin);
    }
    if (
      x < PLAYABLE_BOUNDS.xmin + 12 ||
      x > PLAYABLE_BOUNDS.xmax - 12 ||
      z < PLAYABLE_BOUNDS.zmin + 12 ||
      z > PLAYABLE_BOUNDS.zmax - 12
    )
      continue;
    if (positions.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 49)) continue;
    if (nearestTrack({ x, z }).distance < 22 || trails.sample({ x, z }).distance < 17) continue;
    const y = heightAt(x, z),
      slope =
        Math.hypot(
          heightAt(x + 2, z) - heightAt(x - 2, z),
          heightAt(x, z + 2) - heightAt(x, z - 2),
        ) / 4;
    if (slope > 0.62) continue;
    positions.push({ x, y, z, h: 4.5 + random() * 7.5, pine: random() > 0.24 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!,
    pixels = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 64; x++) {
      const v = Math.round(83 + Math.sin(x * 0.8 + Math.sin(y * 0.04)) * 17 + random() * 24);
      pixels.data.set([v, Math.round(v * 0.83), Math.round(v * 0.67), 255], (y * 64 + x) * 4);
    }
  ctx.putImageData(pixels, 0, 0);
  const bark = new THREE.CanvasTexture(canvas);
  bark.encoding = THREE.sRGBEncoding;
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  bark.repeat.set(2, 3);
  const wood = new THREE.MeshStandardMaterial({
    color: 0xcebea8,
    map: bark,
    bumpMap: bark,
    bumpScale: 0.035,
    roughness: 1,
    envMapIntensity: 0.22,
  });
  const leaf = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.25, 1, 6),
    wood,
    positions.length,
  );
  const branches = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 5),
    wood,
    positions.length * 5,
  );
  const foliage = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    leaf,
    positions.length * 9,
  );
  const tips = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), leaf, positions.length);
  const object = new THREE.Object3D();
  let branchCount = 0,
    leafCount = 0,
    tipCount = 0;
  const greens = [0x3c6450, 0x4c7456, 0x365e55, 0x527657];
  positions.forEach((p, index) => {
    const yaw = random() * Math.PI * 2;
    object.position.set(p.x, p.y + p.h * 0.48, p.z);
    object.rotation.set(0, yaw, 0);
    object.scale.set(1, p.h * 0.96, 1);
    object.updateMatrix();
    trunks.setMatrixAt(index, object.matrix);
    for (let tier = 0; tier < 3; tier++) {
      const fraction = 0.33 + tier * 0.23,
        radius = p.pine ? p.h * (0.27 - tier * 0.065) : p.h * (0.19 + Math.sin(tier) * 0.045);
      for (let arm = 0; arm < 3; arm++) {
        const a = yaw + (arm * Math.PI * 2) / 3 + tier * 0.87;
        object.position.set(
          p.x + Math.cos(a) * radius * 0.5,
          p.y + p.h * fraction,
          p.z + Math.sin(a) * radius * 0.5,
        );
        object.rotation.set(random() * 0.25, a, random() * 0.2);
        object.scale.set(
          radius * (0.72 + random() * 0.18),
          p.pine ? radius * 0.43 : radius * 0.78,
          radius * 0.65,
        );
        object.updateMatrix();
        foliage.setMatrixAt(leafCount, object.matrix);
        foliage.setColorAt(
          leafCount++,
          new THREE.Color(greens[(index + tier) % greens.length])
            .convertSRGBToLinear()
            .multiplyScalar(0.82 + random() * 0.34),
        );
      }
      const a = yaw + tier * 1.9,
        start = new THREE.Vector3(p.x, p.y + p.h * fraction - 0.15, p.z),
        end = start
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * radius * 0.9, 0.22, Math.sin(a) * radius * 0.9));
      object.position.copy(start).add(end).multiplyScalar(0.5);
      object.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().sub(start).normalize(),
      );
      object.scale.set(0.065, start.distanceTo(end), 0.065);
      object.updateMatrix();
      branches.setMatrixAt(branchCount++, object.matrix);
    }
    if (p.pine) {
      object.position.set(p.x, p.y + p.h * 0.9, p.z);
      object.rotation.set(0, yaw, 0);
      object.scale.set(p.h * 0.085, p.h * 0.26, p.h * 0.085);
      object.updateMatrix();
      tips.setMatrixAt(tipCount, object.matrix);
      tips.setColorAt(tipCount++, new THREE.Color(0x3d6652).convertSRGBToLinear());
    }
  });
  branches.count = branchCount;
  foliage.count = leafCount;
  tips.count = tipCount;
  for (const [name, mesh] of Object.entries({ trunks, branches, foliage, tips })) {
    mesh.name = `forest-${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  const lod = addForestLOD(scene, [trunks, branches, foliage, tips], positions);
  // Keep all trees visible, but only nearby trunks in the physics broad phase.
  // Refresh after 25 m of travel, well before reaching the 110 m activation edge.
  const active = new Map<number, R.Collider>();
  let previous: { x: number; z: number }[] = [];
  function updateColliders(position: { x: number; z: number }, pursuer?: { x: number; z: number }) {
    const centers = pursuer ? [position, pursuer] : [position];
    if (
      previous.length === centers.length &&
      centers.every((p, i) => (p.x - previous[i].x) ** 2 + (p.z - previous[i].z) ** 2 < 25 ** 2)
    )
      return;
    previous = centers.map((p) => ({ x: p.x, z: p.z }));
    const within = (p: { x: number; z: number }, radius: number) =>
      centers.some((center) => (p.x - center.x) ** 2 + (p.z - center.z) ** 2 <= radius ** 2);
    for (const [index, collider] of active) {
      const p = positions[index];
      if (!within(p, 140)) {
        world.removeCollider(collider, false);
        active.delete(index);
      }
    }
    positions.forEach((p, index) => {
      if (active.has(index) || !within(p, 110)) return;
      active.set(
        index,
        world.createCollider(
          R.ColliderDesc.cylinder(p.h * 0.44, 0.22)
            .setTranslation(p.x, p.y + p.h * 0.44, p.z)
            .setFriction(0.7),
        ),
      );
    });
  }
  return {
    count: positions.length,
    positions,
    lod,
    updateColliders,
    get activeColliderCount() {
      return active.size;
    },
  };
}
