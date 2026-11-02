import * as THREE from 'three';
import { tileInstances } from './visibility';
import type { RouteFrame } from '../engine/types';

type OffsetPoint = (frame: RouteFrame, distance: number, lift?: number) => THREE.Vector3;
const metal = (color: number, roughness = 0.45) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).convertSRGBToLinear(),
    metalness: 0.72,
    roughness,
    envMapIntensity: 0.6,
  });

/** Closed, corrugated W-section rather than a rectangular roadside beam. */
export function createGuardrailGeometry() {
  const profile = [
    [-0.21, 0.045],
    [-0.16, 0.085],
    [-0.095, -0.035],
    [0, 0.015],
    [0.095, -0.035],
    [0.16, 0.085],
    [0.21, 0.045],
  ];
  const vertices: number[] = [],
    indices: number[] = [];
  for (const x of [-0.5, 0.5])
    for (const back of [0, 0.018]) {
      for (const [y, z] of profile) vertices.push(x, y, z - back);
    }
  const n = profile.length;
  for (let j = 0; j < n - 1; j++) {
    const a = j,
      b = j + n * 2;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + n, a + n + 1, b + n, a + n + 1, b + n + 1, b + n);
    indices.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
    indices.push(b, b + n, b + 1, b + 1, b + n, b + n + 1);
  }
  for (const j of [0, n - 1]) indices.push(j, j + n, j + 2 * n, j + n, j + 3 * n, j + 2 * n);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Rolled steel section along Y, centered at the origin. */
export function createIBeamGeometry(
  width: number,
  length: number,
  depth: number,
  flange = 0.025,
  web = 0.035,
) {
  const w = width / 2,
    d = depth / 2,
    t = web / 2;
  const shape = new THREE.Shape();
  const outline = [
    [-w, -d],
    [w, -d],
    [w, -d + flange],
    [t, -d + flange],
    [t, d - flange],
    [w, d - flange],
    [w, d],
    [-w, d],
    [-w, d - flange],
    [-t, d - flange],
    [-t, -d + flange],
    [-w, -d + flange],
  ];
  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -length / 2, 0);
  return geometry;
}

export function addBarrierDetails(
  scene: THREE.Scene,
  frames: RouteFrame[],
  offset: OffsetPoint,
  count: number,
) {
  const steel = metal(0xa7b2b7),
    darkSteel = metal(0x6c777b, 0.6);
  const splices = new THREE.InstancedMesh(createGuardrailGeometry(), steel, count);
  const boltGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.035, 6);
  boltGeometry.rotateX(Math.PI / 2);
  const bolts = new THREE.InstancedMesh(boltGeometry, steel, count * 2);
  const feet = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.045, 0.26), darkSteel, count);
  const spacers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.17, 0.19, 0.12),
    darkSteel,
    count,
  );
  const object = new THREE.Object3D();
  let joint = 0,
    bolt = 0;
  for (let i = 0; i < count; i++) {
    const frame = frames[Math.floor((i / count) * (frames.length - 1))];
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      frame.tangent.clone().setY(frame.grade).normalize(),
    );
    for (const side of [1]) {
      object.position.copy(offset(frame, side * 7.2, 0.65));
      object.quaternion.copy(rotation);
      object.scale.set(0.32, 1, 1.13);
      object.updateMatrix();
      splices.setMatrixAt(joint, object.matrix);
      object.position.copy(offset(frame, side * 7.2, 0.035));
      object.quaternion.identity();
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      feet.setMatrixAt(joint, object.matrix);
      object.position.copy(offset(frame, side * 7.2, 0.51));
      object.quaternion.copy(rotation);
      object.updateMatrix();
      spacers.setMatrixAt(joint++, object.matrix);
      for (const y of [0.53, 0.77]) {
        object.position.copy(offset(frame, side * 7.2 - side * 0.075, y));
        object.quaternion.copy(rotation);
        object.updateMatrix();
        bolts.setMatrixAt(bolt++, object.matrix);
      }
    }
  }
  for (const [name, mesh] of Object.entries({ splices, bolts, feet, spacers })) {
    mesh.name = `barrier-${name}`;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

export function addRoadDetails(
  scene: THREE.Scene,
  frames: RouteFrame[],
  offset: OffsetPoint,
  length: number,
) {
  // Sparse reflectors replace housings, grates, slots and asphalt seam meshes.
  const count = Math.floor(length / 28);
  const studs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.2, 0.018, 0.13),
    new THREE.MeshLambertMaterial({ color: 0xe7d8a4, emissive: 0x342b16 }),
    count,
  );
  const object = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const frame = frames[Math.floor(((i + 0.5) / count) * (frames.length - 1))];
    object.position.copy(offset(frame, 0, 0.026));
    object.rotation.set(0, -Math.atan2(frame.tangent.z, frame.tangent.x), Math.atan(frame.grade));
    object.updateMatrix();
    studs.setMatrixAt(i, object.matrix);
  }
  studs.name = 'road-reflectors';
  tileInstances(scene, studs);
}

export function detailGantry(gantry: THREE.Group) {
  const steel = metal(0x7f9395, 0.5),
    jointMaterial = metal(0x4f6267, 0.58);
  function part(geometry: THREE.BufferGeometry, x: number, y: number, z: number, material = steel) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    gantry.add(mesh);
    return mesh;
  }
  const feet = new THREE.BoxGeometry(0.72, 0.16, 0.72),
    plates = new THREE.BoxGeometry(0.43, 0.36, 0.035);
  const boltGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6);
  for (const side of [-1, 1]) {
    const z = side * 6.3;
    part(feet, 0, 0.08, z, jointMaterial);
    for (const x of [-0.24, 0.24])
      for (const dz of [-0.24, 0.24]) part(boltGeometry, x, 0.19, z + dz);
    part(plates, -0.02, 4.77, z - 0.2, jointMaterial);
    part(plates, -0.02, 4.77, z + 0.2, jointMaterial);
  }
  for (const x of [-0.24, 0.24]) {
    const chord = part(new THREE.BoxGeometry(0.075, 0.075, 12.9), x, 5.38, 0);
    chord.receiveShadow = true;
    for (let j = 0; j < 8; j++) {
      const a = new THREE.Vector3(x, 4.51, -6.3 + j * 1.575),
        b = new THREE.Vector3(x, 5.38, -6.3 + (j + 1) * 1.575);
      if (j % 2) [a.y, b.y] = [b.y, a.y];
      const brace = part(new THREE.BoxGeometry(0.065, a.distanceTo(b), 0.065), 0, 0, 0);
      brace.position.copy(a).add(b).multiplyScalar(0.5);
      brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    }
  }
}
