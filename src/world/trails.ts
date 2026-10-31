import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { RouteFrame } from '../engine/types';
import { createRouteLookup, routeHeight, smoothStep } from './route';

export interface MountainTrail {
  name: string;
  frames: RouteFrame[];
  length: number;
}
export function createTrailNetwork(nearestTrack: ReturnType<typeof createRouteLookup>) {
  const specs = [
    {
      name: 'Mirador',
      hump: 42,
      points: [
        [-380, 180],
        [-365, 85],
        [-290, 0],
        [-250, -95],
        [-315, -205],
        [-360, -330],
      ],
    },
    {
      name: 'Pinar',
      hump: 46,
      points: [
        [250, 180],
        [205, 90],
        [125, -5],
        [155, -130],
        [265, -240],
        [330, -330],
      ],
    },
    {
      name: 'Cumbre',
      hump: 48,
      points: [
        [760, 165],
        [785, 50],
        [900, -65],
        [1030, -165],
        [1150, -270],
        [1130, -425],
        [1060, -575],
      ],
    },
  ];
  const trails: MountainTrail[] = specs.map((spec) => {
    const points = spec.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    // Accesses start on the inner verge, clear of both asphalt lanes.
    for (const index of [0, points.length - 1]) {
      const { frame } = nearestTrack(points[index]);
      points[index].copy(frame.p).addScaledVector(frame.normal, -12).setY(0);
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    curve.arcLengthDivisions = 1800;
    curve.updateArcLengths();
    const length = curve.getLength(),
      count = Math.ceil(length / 1.6),
      frames: RouteFrame[] = [];
    const first = points[0],
      last = points[points.length - 1];
    const h0 = routeHeight(first.x, first.z),
      h1 = routeHeight(last.x, last.z);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        p = curve.getPointAt(t),
        tangent = curve.getTangentAt(t).normalize();
      const profile = h0 + (h1 - h0) * smoothStep(t) + spec.hump * Math.sin(Math.PI * t) ** 2;
      const near = nearestTrack(p),
        join = smoothStep((near.distance - 24) / 25);
      p.y = THREE.MathUtils.lerp(routeHeight(p.x, p.z), profile, join) + 0.075;
      frames.push({ p, tangent, normal: new THREE.Vector3(-tangent.z, 0, tangent.x), grade: 0, t });
    }
    for (let i = 0; i < frames.length; i++) {
      const a = frames[Math.max(0, i - 1)].p,
        b = frames[Math.min(count, i + 1)].p;
      frames[i].grade = (b.y - a.y) / Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    }
    return { name: spec.name, frames, length };
  });
  const combined = trails.flatMap((trail, path) =>
    trail.frames.map((frame, index) => ({ ...frame, path, index })),
  );
  const lookup = createRouteLookup([...combined, combined[combined.length - 1]]);
  function sample(position: { x: number; z: number }) {
    const found = combined[lookup(position).index],
      trail = trails[found.path];
    let distance = Infinity,
      height = 0,
      index = found.index;
    for (const segment of [Math.max(0, index - 1), Math.min(trail.frames.length - 2, index)]) {
      const a = trail.frames[segment].p,
        b = trail.frames[segment + 1].p,
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(
        ((position.x - a.x) * dx + (position.z - a.z) * dz) / (dx * dx + dz * dz),
        0,
        1,
      );
      const d = Math.hypot(position.x - a.x - t * dx, position.z - a.z - t * dz);
      if (d < distance) {
        distance = d;
        height = THREE.MathUtils.lerp(a.y, b.y, t);
        index = segment;
      }
    }
    return { distance, height, index, trail, frame: trail.frames[index] };
  }
  return { trails, sample, nearestTrack };
}
export type TrailNetwork = ReturnType<typeof createTrailNetwork>;

/** Wide graded shoulders merge with the terrain; the same surface has a collider. */
export function buildMountainTrails(
  scene: THREE.Scene,
  world: R.World,
  network: TrailNetwork,
  document: Document,
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(256, 256);
  let seed = 2189;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const tracks =
        Math.exp(-(((x / 256 - 0.464) / 0.055) ** 2)) +
        Math.exp(-(((x / 256 - 0.536) / 0.055) ** 2));
      const value = Math.round(123 + random() * 39 - tracks * 19);
      pixels.data.set(
        [value, Math.round(value * 0.83), Math.round(value * 0.62), 255],
        (y * 256 + x) * 4,
      );
    }
  context.putImageData(pixels, 0, 0);
  for (const trail of network.trails) {
    const map = new THREE.CanvasTexture(canvas);
    map.encoding = THREE.sRGBEncoding;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, trail.length / 7);
    map.anisotropy = 8;
    const material = new THREE.MeshStandardMaterial({
      map,
      vertexColors: true,
      roughness: 1,
      bumpMap: map,
      bumpScale: 0.018,
      envMapIntensity: 0.25,
    });
    const positions: number[] = [],
      colors: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    const cross = [-12, -6, -3.5, 0, 3.5, 6, 12],
      lifts = [-0.2, -0.08, 0.025, 0.04, 0.025, -0.08, -0.2];
    for (let i = 0; i < trail.frames.length; i++) {
      const f = trail.frames[i];
      for (let j = 0; j < cross.length; j++) {
        const p = f.p.clone().addScaledVector(f.normal, cross[j]);
        const distance = network.nearestTrack(p).distance;
        // Use the road height at EACH vertex: a transverse strip must not create
        // a horizontal ledge across a sloping road. Start flush with the verge.
        p.y = THREE.MathUtils.lerp(
          routeHeight(p.x, p.z) - 0.075,
          p.y + lifts[j],
          smoothStep((distance - 12) / 24),
        );
        positions.push(p.x, p.y, p.z);
        uv.push((cross[j] + 12) / 24, f.t);
        const edge = Math.abs(cross[j]) / 12,
          c = new THREE.Color(0xffffff).lerp(
            new THREE.Color(0x6f8967).convertSRGBToLinear(),
            Math.max(0, (edge - 0.45) / 0.55),
          );
        colors.push(c.r, c.g, c.b);
      }
      if (i < trail.frames.length - 1)
        for (let j = 0; j < cross.length - 1; j++) {
          const a = i * cross.length + j,
            b = a + cross.length;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    // Clip the visible surface AND its collider to the inner verge. Merely
    // hiding dirt in the shader would leave the invisible obstacle in place.
    const clearance = (index: number) => {
      const p = { x: positions[index * 3], z: positions[index * 3 + 2] };
      const { frame } = network.nearestTrack(p);
      return -(p.x - frame.p.x) * frame.normal.x - (p.z - frame.p.z) * frame.normal.z;
    };
    const crossings = new Map<string, number>();
    const intersection = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const cached = crossings.get(key);
      if (cached !== undefined) return cached;
      let lo = 0,
        hi = 1;
      const aInside = clearance(a) >= 8;
      for (let k = 0; k < 24; k++) {
        const t = (lo + hi) / 2;
        const p = {
          x: THREE.MathUtils.lerp(positions[a * 3], positions[b * 3], t),
          z: THREE.MathUtils.lerp(positions[a * 3 + 2], positions[b * 3 + 2], t),
        };
        const { frame } = network.nearestTrack(p);
        const inside =
          -(p.x - frame.p.x) * frame.normal.x - (p.z - frame.p.z) * frame.normal.z >= 8;
        if (inside === aInside) lo = t;
        else hi = t;
      }
      const t = aInside ? lo : hi;
      const index = positions.length / 3;
      for (let j = 0; j < 3; j++) {
        positions.push(THREE.MathUtils.lerp(positions[a * 3 + j], positions[b * 3 + j], t));
        colors.push(THREE.MathUtils.lerp(colors[a * 3 + j], colors[b * 3 + j], t));
      }
      for (let j = 0; j < 2; j++) uv.push(THREE.MathUtils.lerp(uv[a * 2 + j], uv[b * 2 + j], t));
      crossings.set(key, index);
      return index;
    };
    const clipped: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = indices.slice(i, i + 3),
        polygon: number[] = [];
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3];
        const aInside = clearance(a) >= 8,
          bInside = clearance(b) >= 8;
        if (aInside) polygon.push(a);
        if (aInside !== bInside) polygon.push(intersection(a, b));
      }
      for (let j = 1; j < polygon.length - 1; j++)
        clipped.push(polygon[0], polygon[j], polygon[j + 1]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(clipped);
    geometry.computeVertexNormals();
    material.side = THREE.DoubleSide;
    material.transparent = true;
    material.depthWrite = false;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.a*=1.0-smoothstep(0.22,0.70,abs(vUv.x*2.0-1.0));
      `,
      );
    };
    material.customProgramCacheKey = () => 'trail-graded-edge-v1';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `mountain-shortcut-${trail.name}`;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addTrailCollider(world, positions, clipped);
  }
}

function addTrailCollider(world: R.World, positions: number[], indices: number[]) {
  world.createCollider(
    R.ColliderDesc.trimesh(
      new Float32Array(positions),
      new Uint32Array(indices),
      R.TriMeshFlags.FIX_INTERNAL_EDGES,
    ).setFriction(1.1),
  );
}
