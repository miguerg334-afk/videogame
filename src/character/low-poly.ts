import * as THREE from 'three';

type Palette = {
  blue: THREE.MeshStandardMaterial;
  peach: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
/** A closed angular volume with an independently shaped front and recessed rear. */
function panel(points: number[][], depth = 0.04) {
  const n = points.length,
    positions: number[] = [],
    indices: number[] = [];
  for (const point of points) positions.push(...point);
  for (const point of points) positions.push(point[0], point[1], point[2] - depth);
  const faces = THREE.ShapeUtils.triangulateShape(
    points.map((p) => new THREE.Vector2(p[0], p[1])),
    [],
  );
  for (let [a, b, c] of faces) {
    const cross =
      (points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) -
      (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]);
    if (cross < 0) [b, c] = [c, b];
    indices.push(a, b, c, a + n, c + n, b + n);
  }
  // Normalize wall winding separately from the front's concave triangulation.
  const contour = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % n];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (contour > 0) indices.push(i, i + n, j, j, i + n, j + n);
    else indices.push(i, j, i + n, j, j + n, i + n);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Broad planar quills, with two square rings and a single sharp vertex. */
export function createAngularQuill(points: THREE.Vector3[], radius: number) {
  const start = points[0],
    end = points[points.length - 1],
    middle = points[1];
  const tangent = end.clone().sub(start).normalize(),
    normal = new THREE.Vector3(1, 0, 0).cross(tangent).normalize();
  if (normal.lengthSq() < 0.1) normal.set(0, 1, 0).cross(tangent).normalize();
  const binormal = tangent.clone().cross(normal).normalize(),
    positions: number[] = [],
    indices: number[] = [];
  for (const [center, r] of [
    [start, radius],
    [middle, radius * 0.63],
  ] as const) {
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = center
        .clone()
        .addScaledVector(normal, x * r * 0.48)
        .addScaledVector(binormal, y * r * 0.82);
      positions.push(p.x, p.y, p.z);
    }
  }
  positions.push(end.x, end.y, end.z);
  indices.push(0, 2, 1, 0, 3, 2);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    indices.push(i, next, i + 4, next, next + 4, i + 4, i + 4, next + 4, 8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addRetroFace(head: THREE.Group, p: Palette) {
  for (const side of [-1, 1]) {
    // Tall white eye wings. The blue central shield overlaps their inner edges.
    const outline = [
      [0.025, -0.23],
      [0.045, 0.02],
      [0.17, 0.28],
      [0.29, 0.48],
      [0.39, 0.49],
      [0.49, 0.37],
      [0.525, 0.16],
      [0.515, -0.23],
      [0.34, -0.3],
      [0.15, -0.27],
    ];
    const points = outline.map(([x, y]) => [
      x * side,
      y,
      0.49 - 0.2 * (x / 0.6) ** 2 - 0.25 * Math.max(0, y) - 0.035 * (Math.min(0, y) / 0.65) ** 2,
    ]);
    mesh(head, panel(points, 0.025), p.white, 'eye-white');
    const pupil = mesh(head, new THREE.SphereGeometry(1, 12, 8), p.black, 'pupil');
    pupil.position.set(side * 0.145, -0.115, 0.493);
    pupil.scale.set(0.054, 0.145, 0.026);
    const glint = mesh(head, new THREE.SphereGeometry(1, 8, 6), p.white, 'eye-highlight');
    glint.position.set(side * 0.146, -0.047, 0.519);
    glint.scale.set(0.018, 0.044, 0.008);
    glint.castShadow = false;
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0);
    shape.lineTo(0, 0.46);
    shape.lineTo(0.18, 0);
    shape.closePath();
    const ear = mesh(
      head,
      new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false, steps: 1 }),
      p.blue,
      'ear',
    );
    ear.position.set(side * 0.39, 0.39, -0.02);
    ear.rotation.z = -side * 0.16;
    const inner = new THREE.Shape();
    inner.moveTo(-0.098, 0.065);
    inner.lineTo(0, 0.345);
    inner.lineTo(0.115, 0.065);
    inner.closePath();
    const inset = mesh(ear, new THREE.ShapeGeometry(inner), p.peach, 'ear-inset');
    inset.position.z = 0.095;
  }
  // The characteristic deep V comes down between the pupils, not a rounded fur tube.
  mesh(
    head,
    panel(
      [
        [-0.35, 0.54, 0.3],
        [-0.2, 0.17, 0.51],
        [0, -0.125, 0.55],
        [0.2, 0.17, 0.51],
        [0.35, 0.54, 0.3],
        [0, 0.635, 0.08],
      ],
      0.055,
    ),
    p.blue,
    'forehead',
  );
  mesh(
    head,
    panel(
      [
        [-0.59, -0.18, 0.29],
        [-0.34, -0.285, 0.49],
        [0, -0.275, 0.565],
        [0.34, -0.285, 0.49],
        [0.59, -0.18, 0.29],
        [0.36, -0.42, 0.405],
        [0, -0.46, 0.46],
        [-0.36, -0.42, 0.405],
      ],
      0.1,
    ),
    p.peach,
    'muzzle',
  );
  const nose = mesh(head, new THREE.SphereGeometry(1, 10, 6), p.black, 'nose');
  nose.position.set(0, -0.263, 0.622);
  nose.scale.set(0.078, 0.038, 0.075);
  const smile = new THREE.CatmullRomCurve3([
    v(0.21, -0.373, 0.508),
    v(0.29, -0.369, 0.483),
    v(0.34, -0.345, 0.461),
  ]);
  mesh(head, new THREE.TubeGeometry(smile, 6, 0.005, 3, false), p.black, 'mouth');
}

export function addRetroBelly(torso: THREE.Group, p: Palette) {
  mesh(
    torso,
    panel(
      [
        [0, 0.49, 0.272],
        [-0.2, 0.36, 0.272],
        [-0.225, 0.16, 0.272],
        [-0.12, -0.05, 0.272],
        [0.1, -0.1, 0.272],
        [0.22, 0.08, 0.272],
        [0.205, 0.32, 0.272],
      ],
      0.015,
    ),
    p.peach,
    'belly',
  );
}

export function addRetroGlove(parent: THREE.Group, side: number, p: Palette) {
  const cuff = mesh(
    parent,
    new THREE.CylinderGeometry(0.12, 0.135, 0.12, 6, 1),
    p.white,
    'wrist-cuff',
  );
  cuff.position.y = 0.005;
  const outline = new THREE.Shape();
  outline.moveTo(-0.12, -0.045);
  outline.lineTo(-0.17, -0.13);
  outline.lineTo(-0.145, -0.27);
  outline.lineTo(-0.075, -0.31);
  outline.lineTo(0.12, -0.29);
  outline.lineTo(0.17, -0.2);
  outline.lineTo(0.145, -0.075);
  outline.closePath();
  const palm = mesh(
    parent,
    new THREE.ExtrudeGeometry(outline, { depth: 0.14, bevelEnabled: false, steps: 1 }),
    p.white,
    'glove-palm',
  );
  palm.position.z = -0.065;
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const joint = new THREE.Group();
    joint.position.set((i - 1.5) * 0.068, -0.245, 0.015);
    parent.add(joint);
    fingers.push(joint);
    const finger = mesh(joint, new THREE.BoxGeometry(0.064, 0.095, 0.115), p.white, 'glove-finger');
    finger.position.y = -0.025;
  }
  const thumb = mesh(parent, new THREE.BoxGeometry(0.095, 0.15, 0.105), p.white, 'glove-thumb');
  thumb.position.set(side * 0.15, -0.14, 0.1);
  thumb.rotation.z = side * 0.55;
  return { fingers };
}

export function addRetroShoe(foot: THREE.Group, side: number, p: Palette) {
  const base = [
    [-0.22, -0.27],
    [0.22, -0.27],
    [0.27, 0.2],
    [0.21, 0.61],
    [0, 0.72],
    [-0.21, 0.61],
    [-0.27, 0.2],
  ];
  const upper = [
    [-0.18, -0.23],
    [0.18, -0.23],
    [0.22, 0.15],
    [0.14, 0.47],
    [0, 0.59],
    [-0.14, 0.47],
    [-0.22, 0.15],
  ];
  const topY = (z: number) => 0.43 - (z + 0.23) * 0.4;
  const positions: number[] = [],
    indices: number[] = [];
  for (const [x, z] of base) positions.push(x, 0.065, z);
  for (const [x, z] of upper) positions.push(x, topY(z), z);
  const n = base.length;
  positions.push(0, topY(0.15), 0.15);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, i + n, j, j + n, i + n, 2 * n, i + n, j + n);
    if (i > 0 && i < n - 1) indices.push(0, i + 1, i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(foot, geometry, p.red, 'red-shoe');
  const shape = new THREE.Shape();
  base.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const sole = mesh(
    foot,
    new THREE.ExtrudeGeometry(shape, { depth: 0.05, steps: 1, bevelEnabled: false }),
    p.sole,
    'shoe-sole',
  );
  sole.rotation.x = Math.PI / 2;
  sole.position.y = 0.065;
  const strapVertices: number[] = [];
  for (const z of [0.045, 0.21])
    for (const [x, y] of [
      [-0.267, 0.065],
      [0.267, 0.065],
      [0.267, topY(z) + 0.012],
      [-0.267, topY(z) + 0.012],
    ])
      strapVertices.push(x, y, z);
  const strap = new THREE.BufferGeometry();
  strap.setAttribute('position', new THREE.Float32BufferAttribute(strapVertices, 3));
  strap.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3, 7, 6, 3, 6, 2, 0, 1,
    5, 0, 5, 4,
  ]);
  strap.computeVertexNormals();
  mesh(foot, strap, p.white, 'shoe-strap');
  const cuff = mesh(
    foot,
    new THREE.CylinderGeometry(0.145, 0.17, 0.25, 6, 1),
    p.white,
    'ankle-cuff',
  );
  cuff.position.set(0, 0.425, -0.15);
  const frame = new THREE.Shape();
  frame.moveTo(-0.075, -0.07);
  frame.lineTo(0.075, -0.07);
  frame.lineTo(0.075, 0.07);
  frame.lineTo(-0.075, 0.07);
  frame.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.042, -0.039);
  hole.lineTo(-0.042, 0.039);
  hole.lineTo(0.042, 0.039);
  hole.lineTo(0.042, -0.039);
  hole.closePath();
  frame.holes.push(hole);
  const buckle = mesh(
    foot,
    new THREE.ExtrudeGeometry(frame, { depth: 0.016, bevelEnabled: false, steps: 1 }),
    p.gold,
    'shoe-buckle',
  );
  buckle.rotation.y = (side * Math.PI) / 2;
  buckle.position.set(side * 0.269, 0.185, 0.125);
}
