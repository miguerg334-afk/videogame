import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { routeHeight, smoothStep } from './route';
import type { createRouteLookup } from './route';
import type { TrailNetwork } from './trails';
import { tileSurface, addTerrainLOD } from './visibility';

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
export function createTerrainHeight(
  nearestTrack: ReturnType<typeof createRouteLookup>,
  trails: TrailNetwork,
) {
  return (x: number, z: number) => {
    const near = nearestTrack({ x, z });
    // A depressed, continuous road bed remains underneath the entire road.
    const road = routeHeight(x, z) - 0.12;
    // Domain-warped ridges break up the old smooth bowl-shaped hills.
    const wx = x + noise(x / 510 + 3, z / 510) * 115;
    const wz = z + noise(x / 470, z / 470 + 7) * 105;
    let ridged = 0,
      amplitude = 1,
      frequency = 1 / 360,
      weight = 0;
    for (let octave = 0; octave < 4; octave++) {
      const n =
        1 - Math.abs(noise(wx * frequency + octave * 13, wz * frequency + octave * 7) * 2 - 1);
      ridged += n * n * amplitude;
      weight += amplitude;
      amplitude *= 0.48;
      frequency *= 2.1;
    }
    const massif =
      260 * Math.exp(-(((x - 1530) / 690) ** 2 + ((z + 230) / 650) ** 2)) +
      280 * Math.exp(-(((x - 440) / 780) ** 2 + ((z + 1240) / 450) ** 2)) +
      210 * Math.exp(-(((x + 1120) / 500) ** 2 + ((z + 100) / 710) ** 2)) +
      190 * Math.exp(-(((x - 380) / 950) ** 2 + ((z - 1050) / 490) ** 2));
    const detail = noise(wx / 48, wz / 48) * 5 + noise(wx / 21, wz / 21) * 1.5;
    const lateral =
      (x - near.frame.p.x) * near.frame.normal.x + (z - near.frame.p.z) * near.frame.normal.z;
    const interior =
      routeHeight(x, z) +
      65 * Math.exp(-(((x - 100) / 330) ** 2 + ((z + 80) / 210) ** 2)) +
      75 * Math.exp(-(((x - 1080) / 360) ** 2 + ((z + 250) / 240) ** 2)) +
      noise(wx / 140, wz / 140) * 9;
    const natural = lateral < 0 ? interior : 38 + massif + (ridged / weight) * 125 + detail;
    // Broad transitions keep the rock faces away from the verge.
    const blend = smoothStep((near.distance - 35) / 230);
    const base = THREE.MathUtils.lerp(road, natural, blend);
    const trail = trails.sample({ x, z });
    const influence =
      (1 - smoothStep((trail.distance - 20) / 38)) * smoothStep((near.distance - 18) / 12);
    return THREE.MathUtils.lerp(base, trail.height - 0.22, influence);
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
    columns = 440,
    rows = 350;
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const grass = new THREE.Color(0x485c50).convertSRGBToLinear();
  const stone = new THREE.Color(0x77838d).convertSRGBToLinear();
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
        .lerp(upper, smoothStep((y - 300 + noise(x / 42, z / 42) * 35) / 120) * 0.58);
      const strata = Math.sin(y * 0.24 + noise(x / 95, z / 95) * 3) * 0.025;
      color.multiplyScalar(0.77 + noise(x / 75, z / 75) * 0.22 + strata);
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
  // World-space strata remain continuous across the terrain's grid triangles.
  material.onBeforeCompile = (shader) => {
    const varyings = 'varying vec3 terrainWorld; varying vec3 terrainNormal;';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + varyings)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        terrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
        terrainNormal=normalize(mat3(modelMatrix)*objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + varyings)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float cliff=smoothstep(0.08,0.42,1.0-abs(normalize(terrainNormal).y));
        float strata=sin(terrainWorld.y*0.48+sin(terrainWorld.x*0.031)*2.3+sin(terrainWorld.z*0.039));
        float veins=sin(terrainWorld.y*1.85+sin(terrainWorld.x*0.09)+terrainWorld.z*0.04);
        float grit=fract(sin(dot(floor(terrainWorld*2.7),vec3(12.9898,78.233,39.425)))*43758.5453);
        float grassPatch=sin(terrainWorld.x*0.8+sin(terrainWorld.z*0.45))*sin(terrainWorld.z*1.1);
        float pebbles=sin(terrainWorld.x*9.7+sin(terrainWorld.z*7.3))*sin(terrainWorld.z*11.3);
        float soil=sin(terrainWorld.x*0.047+sin(terrainWorld.z*0.031)*2.0)*sin(terrainWorld.z*0.063);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.17,0.95,0.74),smoothstep(0.35,0.8,soil)*0.4);
        diffuseColor.rgb*=1.0+(1.0-cliff)*(grassPatch*0.14+pebbles*0.055);
        diffuseColor.rgb*=1.0+cliff*(strata*0.095+veins*0.035)+(grit-0.5)*0.065;
      `,
      );
  };
  material.customProgramCacheKey = () => 'mountain-strata-v2';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'continuous-mountain-terrain';
  mesh.receiveShadow = true;
  scene.add(mesh);
  const tiles = tileSurface(scene, mesh);
  const lod = addTerrainLOD(scene, tiles);
  world.createCollider(
    R.ColliderDesc.trimesh(
      new Float32Array(positions),
      new Uint32Array(indices),
      R.TriMeshFlags.FIX_INTERNAL_EDGES,
    ).setFriction(0.6),
  );
  return { mesh, columns, rows, tiles, lod };
}
