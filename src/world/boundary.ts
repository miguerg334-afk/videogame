import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';

// Leave at least 200 m of rendered terrain beyond the playable perimeter.
export const PLAYABLE_BOUNDS = { xmin: -1300, xmax: 2500, zmin: -1700, zmax: 1200 };

export function createWorldBoundary(
  scene: THREE.Scene,
  world: R.World,
  heightAt: (x: number, z: number) => number,
) {
  const b = PLAYABLE_BOUNDS;
  const corners = [
    [b.xmin, b.zmin],
    [b.xmax, b.zmin],
    [b.xmax, b.zmax],
    [b.xmin, b.zmax],
    [b.xmin, b.zmin],
  ];
  const vertices: number[] = [],
    indices: number[] = [];
  const markers: THREE.Vector3[] = [];
  for (let edge = 0; edge < 4; edge++) {
    const [ax, az] = corners[edge],
      [bx, bz] = corners[edge + 1];
    const length = Math.hypot(bx - ax, bz - az),
      steps = Math.ceil(length / 10);
    const nx = (-(bz - az) / length) * 0.65,
      nz = ((bx - ax) / length) * 0.65;
    for (let i = 0; i < steps; i++) {
      const x1 = ax + ((bx - ax) * i) / steps,
        z1 = az + ((bz - az) * i) / steps;
      const x2 = ax + ((bx - ax) * (i + 1)) / steps,
        z2 = az + ((bz - az) * (i + 1)) / steps;
      const y1 = heightAt(x1, z1),
        y2 = heightAt(x2, z2);
      const points = [
        x1 - nx,
        y1 - 4,
        z1 - nz,
        x1 + nx,
        y1 - 4,
        z1 + nz,
        x2 - nx,
        y2 - 4,
        z2 - nz,
        x2 + nx,
        y2 - 4,
        z2 + nz,
        x1 - nx,
        y1 + 3.6,
        z1 - nz,
        x1 + nx,
        y1 + 3.6,
        z1 + nz,
        x2 - nx,
        y2 + 3.6,
        z2 - nz,
        x2 + nx,
        y2 + 3.6,
        z2 + nz,
      ];
      const base = vertices.length / 3;
      vertices.push(...points);
      for (const index of [
        0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5, 0, 1, 4, 1, 5, 4, 2,
        6, 3, 3, 6, 7,
      ])
        indices.push(base + index);
      if (i % 3 === 0) markers.push(new THREE.Vector3(x1, y1 + 3.85, z1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // One static mesh lets Rapier's triangle BVH cull the distant perimeter cheaply.
  world.createCollider(
    R.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
      R.TriMeshFlags.FIX_INTERNAL_EDGES,
    )
      .setFriction(0.6)
      .setRestitution(0.05),
  );
  const stone = new THREE.MeshStandardMaterial({ color: 0x7c8984, roughness: 0.96 });
  stone.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 wallPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nwallPoint=position;',
    );
    shader.fragmentShader = 'varying vec3 wallPoint;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float row=floor(wallPoint.y/0.42);
      vec2 brick=fract(vec2((wallPoint.x+wallPoint.z)/0.85+mod(row,2.0)*0.5,wallPoint.y/0.42));
      float joint=smoothstep(0.025,0.075,min(brick.x,1.0-brick.x))*smoothstep(0.035,0.10,min(brick.y,1.0-brick.y));
      float grain=fract(sin(dot(floor(wallPoint*24.0),vec3(12.3,47.2,83.1)))*43758.5);
      diffuseColor.rgb*=mix(0.42,0.85+grain*0.3,joint);
    `,
    );
  };
  stone.customProgramCacheKey = () => 'boundary-stone-v1';
  const wall = new THREE.Mesh(geometry, stone);
  wall.name = 'playable-boundary-stone-wall';
  wall.receiveShadow = true;
  scene.add(wall);
  const beacons = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.32, 0.5, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0xffca76,
      emissive: 0xffa83b,
      emissiveIntensity: 0.65,
      roughness: 0.5,
    }),
    markers.length,
  );
  const transform = new THREE.Object3D();
  markers.forEach((p, i) => {
    transform.position.copy(p);
    transform.updateMatrix();
    beacons.setMatrixAt(i, transform.matrix);
  });
  beacons.name = 'perimeter-amber-beacons';
  scene.add(beacons);
  return {
    bounds: b,
    distance(p: { x: number; z: number }) {
      return Math.min(p.x - b.xmin, b.xmax - p.x, p.z - b.zmin, b.zmax - p.z);
    },
    // The physical wall handles driving impacts. This also catches jumps over it.
    enforce(body: R.RigidBody) {
      const p = body.translation(),
        v = body.linvel();
      const x = THREE.MathUtils.clamp(p.x, b.xmin + 2, b.xmax - 2);
      const z = THREE.MathUtils.clamp(p.z, b.zmin + 2, b.zmax - 2);
      if (x !== p.x || z !== p.z) {
        body.setTranslation({ x, y: p.y, z }, true);
        body.setLinvel({ x: x === p.x ? v.x : 0, y: v.y, z: z === p.z ? v.z : 0 }, true);
      }
    },
  };
}
