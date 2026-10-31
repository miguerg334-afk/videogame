import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { routeHeight, smoothStep } from './route';
import type { createRouteLookup } from './route';

function hash(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
function noise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    tx = smoothStep(x - ix),
    tz = smoothStep(z - iz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), tx),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), tx),
    tz,
  );
}
export function createTerrainHeight(nearestTrack: ReturnType<typeof createRouteLookup>) {
  return (x: number, z: number) => {
    const near = nearestTrack({ x, z });
    // A depressed, continuous road bed remains underneath every road and tunnel.
    const road = routeHeight(x, z) - 0.6;
    const detail =
      noise(x / 180, z / 180) * 24 + noise(x / 65, z / 65) * 7 + noise(x / 26, z / 26) * 1.8;
    const ridges =
      100 * Math.exp(-(((x - 1250) / 650) ** 2 + ((z + 100) / 650) ** 2)) +
      145 * Math.exp(-(((x - 400) / 700) ** 2 + ((z + 1050) / 390) ** 2)) +
      115 * Math.exp(-(((x + 1050) / 500) ** 2 + ((z + 150) / 700) ** 2));
    const ridgeNoise = 65 * Math.pow(1 - Math.abs(noise(x / 420, z / 420) * 2 - 1), 2);
    const natural = routeHeight(x, z) + ridges + ridgeNoise + detail + 8;
    const blend = smoothStep((near.distance - 32) / 145);
    return THREE.MathUtils.lerp(road, natural, blend);
  };
}

/** A fully indexed heightfield: no discarded triangles or exposed triangle cuts. */
export function createTerrain(
  scene: THREE.Scene,
  world: R.World,
  heightAt: (x: number, z: number) => number,
) {
  const width = 4400,
    depth = 3500,
    columns = 300,
    rows = 240;
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const grass = new THREE.Color(0x53664f).convertSRGBToLinear();
  const stone = new THREE.Color(0x777e80).convertSRGBToLinear();
  const upper = new THREE.Color(0xa7b0b2).convertSRGBToLinear();
  for (let i = 0; i <= columns; i++)
    for (let j = 0; j <= rows; j++) {
      const x = -1600 + (i * width) / columns,
        z = -2000 + (j * depth) / rows,
        y = heightAt(x, z);
      positions.push(x, y, z);
    }
  // Derive rock coverage from the sampled heightfield, without querying it five times.
  for (let i = 0; i <= columns; i++)
    for (let j = 0; j <= rows; j++) {
      const index = i * (rows + 1) + j,
        x = positions[index * 3],
        y = positions[index * 3 + 1],
        z = positions[index * 3 + 2];
      const left = positions[(Math.max(0, i - 1) * (rows + 1) + j) * 3 + 1];
      const right = positions[(Math.min(columns, i + 1) * (rows + 1) + j) * 3 + 1];
      const down = positions[(i * (rows + 1) + Math.max(0, j - 1)) * 3 + 1];
      const up = positions[(i * (rows + 1) + Math.min(rows, j + 1)) * 3 + 1];
      const slope = Math.hypot(
        (right - left) / ((width / columns) * 2),
        (up - down) / ((depth / rows) * 2),
      );
      const rock = smoothStep((slope - 0.22) / 0.65) * 0.8 + smoothStep((y - 215) / 180) * 0.4;
      const color = grass
        .clone()
        .lerp(stone, Math.min(1, rock))
        .lerp(upper, smoothStep((y - 370) / 140) * 0.45);
      color.multiplyScalar(0.88 + noise(x / 90, z / 90) * 0.18);
      colors.push(color.r, color.g, color.b);
    }
  for (let i = 0; i < columns; i++)
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j,
        b = a + rows + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'continuous-mountain-terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  world.createCollider(
    R.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(indices)).setFriction(0.6),
  );
  return { mesh, columns, rows };
}
