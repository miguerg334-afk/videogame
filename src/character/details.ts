import * as THREE from 'three';

type Palette = {
  blue: THREE.MeshStandardMaterial;
  peach: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
};
const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function curveMesh(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  name: string,
  segments = 32,
) {
  return addMesh(
    parent,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 12, false),
    material,
    name,
  );
}
function cuffGeometry(radius: number, height: number) {
  const profile = [
    [0.8, 0],
    [1, 0.05],
    [1.06, 0.2],
    [0.97, 0.39],
    [1.03, 0.69],
    [1, 0.88],
    [0.89, 1],
    [0.73, 0.94],
    [0.72, 0.1],
    [0.8, 0],
  ];
  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r * radius, y * height)),
    64,
  );
  const attribute = geometry.attributes.position;
  for (let i = 0; i < attribute.count; i++) {
    const x = attribute.getX(i),
      z = attribute.getZ(i),
      y = attribute.getY(i),
      angle = Math.atan2(z, x);
    const wrinkle =
      1 + 0.013 * Math.sin(angle * 7 + y * 35) + 0.008 * Math.sin(angle * 13 - y * 24);
    attribute.setXYZ(i, x * wrinkle, y, z * wrinkle);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** One continuous curved mask instead of two intersecting white spheres. */
export function createEyeMask() {
  const contour = new THREE.Shape();
  contour.moveTo(0, 0.23);
  contour.bezierCurveTo(-0.14, 0.46, -0.42, 0.43, -0.47, 0.16);
  contour.bezierCurveTo(-0.53, -0.06, -0.44, -0.22, -0.25, -0.22);
  contour.bezierCurveTo(-0.12, -0.22, -0.06, -0.19, 0, -0.19);
  contour.bezierCurveTo(0.08, -0.19, 0.15, -0.23, 0.27, -0.22);
  contour.bezierCurveTo(0.46, -0.21, 0.53, 0.02, 0.46, 0.2);
  contour.bezierCurveTo(0.37, 0.46, 0.12, 0.44, 0, 0.23);
  const outline = contour.getSpacedPoints(192).slice(0, -1),
    n = outline.length,
    rows = 32;
  const positions: number[] = [0, 0, 0.555],
    indices: number[] = [];
  for (let row = 1; row <= rows; row++)
    for (const p of outline) {
      const x = (p.x * row) / rows,
        y = (p.y * row) / rows;
      const z = 0.53 * Math.sqrt(Math.max(0.02, 1 - (x / 0.62) ** 2 - (y / 0.6) ** 2)) + 0.025;
      positions.push(x, y, z);
    }
  for (let j = 0; j < n; j++) indices.push(0, 1 + ((j + 1) % n), 1 + j);
  for (let row = 0; row < rows - 1; row++)
    for (let j = 0; j < n; j++) {
      const a = 1 + row * n + j,
        b = 1 + row * n + ((j + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, b, c, b, d, c);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The outline is clockwise; ensure every face points toward the front of the head.
  const normal = geometry.attributes.normal;
  let average = 0;
  for (let i = 0; i < normal.count; i++) average += normal.getZ(i);
  if (average < 0) {
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

export function addDetailedEars(head: THREE.Group, p: Palette) {
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, 0.015);
    shape.bezierCurveTo(-0.18, 0.09, -0.055, 0.33, 0, 0.4);
    shape.bezierCurveTo(0.055, 0.35, 0.17, 0.1, 0.18, 0.015);
    shape.bezierCurveTo(0.1, -0.02, -0.1, -0.02, -0.18, 0.015);
    const ear = addMesh(
      head,
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.115,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 5,
        steps: 3,
        curveSegments: 32,
      }),
      p.blue,
      'ear',
    );
    ear.position.set(side * 0.38, 0.39, -0.05);
    ear.rotation.z = side * -0.18;
    ear.castShadow = true;
    const inner = new THREE.Shape();
    inner.moveTo(-0.105, 0.055);
    inner.quadraticCurveTo(-0.055, 0.21, 0, 0.3);
    inner.quadraticCurveTo(0.055, 0.21, 0.105, 0.055);
    inner.quadraticCurveTo(0, 0.025, -0.105, 0.055);
    const inset = addMesh(
      ear,
      new THREE.ExtrudeGeometry(inner, {
        depth: 0.006,
        bevelEnabled: true,
        bevelSize: 0.008,
        bevelThickness: 0.004,
        bevelSegments: 3,
        curveSegments: 24,
      }),
      p.peach,
      'ear-inset',
    );
    inset.position.z = 0.133;
  }
}

export function addDetailedGlove(parent: THREE.Group, side: number, p: Palette) {
  const cloth = new THREE.MeshStandardMaterial({
    color: p.white.color.clone(),
    roughness: 0.74,
    envMapIntensity: 0.32,
  });
  const shadow = new THREE.MeshStandardMaterial({ color: 0x93999c, roughness: 1 });
  const cuff = addMesh(parent, cuffGeometry(0.145, 0.12), cloth, 'wrist-cuff');
  cuff.position.y = -0.025;
  const palm = addMesh(parent, new THREE.SphereGeometry(1, 56, 40), cloth, 'glove-palm');
  palm.position.set(0, -0.15, 0.025);
  palm.scale.set(0.17, 0.19, 0.115);
  palm.castShadow = true;
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Group();
    root.position.set((i - 1.5) * 0.074, -0.255, 0.035);
    root.rotation.z = -(i - 1.5) * 0.07;
    parent.add(root);
    let joint = root;
    const fingerLength = i === 0 || i === 3 ? 0.065 : 0.082;
    for (let k = 0; k < 3; k++) {
      const bone = new THREE.Group();
      if (k > 0) bone.position.y = -fingerLength;
      joint.add(bone);
      const skin = addMesh(bone, new THREE.SphereGeometry(1, 32, 24), cloth, 'glove-finger');
      skin.position.y = -fingerLength * 0.5;
      skin.scale.set(0.044, fingerLength * 0.67, 0.046);
      const knuckle = addMesh(
        bone,
        new THREE.SphereGeometry(0.044, 28, 20),
        cloth,
        'finger-knuckle',
      );
      knuckle.scale.z = 1.03;
      if (k > 0) fingers.push(bone);
      joint = bone;
    }
  }
  const thumb = new THREE.Group();
  thumb.position.set(side * 0.15, -0.13, 0.09);
  thumb.rotation.z = side * -0.62;
  thumb.rotation.x = -0.35;
  parent.add(thumb);
  const thumbBase = addMesh(thumb, new THREE.SphereGeometry(1, 40, 28), cloth, 'glove-thumb');
  thumbBase.position.y = -0.045;
  thumbBase.scale.set(0.067, 0.105, 0.065);
  const thumbTip = addMesh(thumb, new THREE.SphereGeometry(1, 36, 24), cloth, 'thumb-tip');
  thumbTip.position.set(-side * 0.025, -0.13, 0.055);
  thumbTip.scale.set(0.059, 0.078, 0.057);
  for (let crease = 0; crease < 3; crease++)
    curveMesh(
      parent,
      [
        point(-0.092, -0.12 - crease * 0.035, -0.079),
        point(0, -0.135 - crease * 0.035, -0.093),
        point(0.09, -0.12 - crease * 0.035, -0.079),
      ],
      0.003,
      shadow,
      'glove-fold',
      24,
    );
  return { fingers };
}

export function addDetailedShoe(foot: THREE.Group, side: number, p: Palette) {
  const outline = new THREE.Shape();
  outline.moveTo(-0.2, -0.3);
  outline.bezierCurveTo(-0.28, -0.26, -0.285, 0.3, -0.23, 0.48);
  outline.bezierCurveTo(-0.18, 0.64, 0.18, 0.64, 0.23, 0.48);
  outline.bezierCurveTo(0.285, 0.3, 0.28, -0.26, 0.2, -0.3);
  outline.bezierCurveTo(0.1, -0.37, -0.1, -0.37, -0.2, -0.3);
  const sole = addMesh(
    foot,
    new THREE.ExtrudeGeometry(outline, {
      depth: 0.075,
      steps: 4,
      curveSegments: 48,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 5,
    }),
    p.sole,
    'shoe-sole',
  );
  sole.rotation.x = Math.PI / 2;
  sole.position.y = 0.085;
  sole.castShadow = true;
  const upperGeometry = new THREE.SphereGeometry(1, 80, 48),
    pos = upperGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    pos.setXYZ(
      i,
      x * 0.256 * (0.94 + (0.06 * (z + 1)) / 2),
      Math.max(0.075, 0.205 + y * 0.18),
      0.115 + z * 0.455,
    );
  }
  upperGeometry.computeVertexNormals();
  const upper = addMesh(foot, upperGeometry, p.red, 'red-shoe');
  upper.castShadow = true;
  const edge = outline.getSpacedPoints(160).map((v) => point(v.x, 0.098, v.y));
  curveMesh(foot, edge, 0.009, p.white, 'sole-piping', 160);
  const vertices: number[] = [],
    indices: number[] = [];
  const height = (x: number, z: number) =>
    0.205 +
    0.18 * Math.sqrt(Math.max(0.015, 1 - (x / 0.255) ** 2 - ((z - 0.115) / 0.455) ** 2)) +
    0.009;
  for (let i = 0; i <= 48; i++)
    for (let j = 0; j <= 16; j++) {
      const x = ((i / 48) * 2 - 1) * 0.252,
        z = 0.14 + (j / 16 - 0.5) * 0.17;
      vertices.push(x, height(x, z), z);
      if (i < 48 && j < 16) {
        const a = i * 17 + j;
        indices.push(a, a + 1, a + 17, a + 1, a + 18, a + 17);
      }
    }
  const strap = new THREE.BufferGeometry();
  strap.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  strap.setIndex(indices);
  strap.computeVertexNormals();
  addMesh(foot, strap, p.white, 'shoe-strap');
  for (const z of [0.055, 0.225]) {
    const points = [];
    for (let i = 0; i <= 32; i++) {
      const x = ((i / 32) * 2 - 1) * 0.248;
      points.push(point(x, height(x, z) + 0.003, z));
    }
    curveMesh(foot, points, 0.004, p.sole, 'strap-edge', 48);
  }
  const cuff = addMesh(foot, cuffGeometry(0.18, 0.22), p.white, 'ankle-cuff');
  cuff.position.set(0, 0.27, -0.115);
  cuff.castShadow = true;
  const frame = new THREE.Shape();
  frame.moveTo(-0.105, -0.085);
  frame.lineTo(0.105, -0.085);
  frame.lineTo(0.105, 0.085);
  frame.lineTo(-0.105, 0.085);
  frame.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.063, -0.046);
  hole.lineTo(-0.063, 0.046);
  hole.lineTo(0.063, 0.046);
  hole.lineTo(0.063, -0.046);
  hole.closePath();
  frame.holes.push(hole);
  const buckle = addMesh(
    foot,
    new THREE.ExtrudeGeometry(frame, {
      depth: 0.025,
      bevelEnabled: true,
      bevelSize: 0.009,
      bevelThickness: 0.008,
      bevelSegments: 4,
      steps: 2,
    }),
    p.gold,
    'shoe-buckle',
  );
  buckle.rotation.y = (side * Math.PI) / 2;
  buckle.position.set(side * 0.252, 0.23, 0.14);
  const heelMaterial = new THREE.MeshStandardMaterial({
    color: 0x67dfe7,
    emissive: 0x086570,
    emissiveIntensity: 0.3,
    roughness: 0.4,
  });
  const heel = addMesh(foot, new THREE.SphereGeometry(1, 48, 24), heelMaterial, 'heel-insert');
  heel.position.set(0, 0.066, -0.339);
  heel.scale.set(0.13, 0.028, 0.012);
  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x721326, roughness: 0.85 });
  for (const x of [-0.16, 0.16])
    curveMesh(
      foot,
      [point(x, 0.24, 0.47), point(x, 0.29, 0.36), point(x, 0.325, 0.27)],
      0.003,
      seamMaterial,
      'shoe-stitch',
      28,
    );
}
