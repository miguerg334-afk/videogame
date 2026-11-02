import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The approved H-01 model, with fewer hidden subdivisions for in-game flight. */
export function createHelicopter(document) {
  const root = new THREE.Group();
  root.name = 'H01_Interceptor';
  const navy = new THREE.MeshStandardMaterial({ color: 0x172b35, metalness: 0.6, roughness: 0.31 });
  const ivory = new THREE.MeshStandardMaterial({
    color: 0xd8dfd8,
    metalness: 0.33,
    roughness: 0.37,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x111819, roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x8b9b9b,
    metalness: 0.85,
    roughness: 0.29,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101414, roughness: 0.92 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x163743,
    metalness: 0.35,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
  });
  const yellow = new THREE.MeshStandardMaterial({
    color: 0xd5b45d,
    metalness: 0.3,
    roughness: 0.5,
  });
  const red = new THREE.MeshStandardMaterial({
    color: 0xc72432,
    emissive: 0xff263c,
    emissiveIntensity: 1.5,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: 0x19598b,
    emissive: 0x2789ff,
    emissiveIntensity: 1.5,
  });
  const lamp = new THREE.MeshStandardMaterial({
    color: 0xf4f2d8,
    emissive: 0xe4edd2,
    emissiveIntensity: 1.4,
    roughness: 0.1,
  });
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  function mesh(g, m, parent = root) {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(s, p, m, parent = root) {
    const o = mesh(new THREE.BoxGeometry(...s), m, parent);
    o.position.set(...p);
    return o;
  }
  function ellipsoid(s, p, m, parent = root) {
    const o = mesh(new THREE.SphereGeometry(1, 20, 12), m, parent);
    o.scale.set(...s);
    o.position.set(...p);
    return o;
  }
  function cylinder(r1, r2, h, p, m, parent = root) {
    const o = mesh(new THREE.CylinderGeometry(r1, r2, h, 24), m, parent);
    o.position.set(...p);
    return o;
  }
  function pipe(points, r, m, parent = root) {
    return mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => v(...p))),
        Math.max(8, points.length * 2),
        r,
        6,
        false,
      ),
      m,
      parent,
    );
  }
  function rod(a, b, r, m, parent = root) {
    const av = v(...a),
      bv = v(...b);
    const o = cylinder(r, r, av.distanceTo(bv), [0, 0, 0], m, parent);
    o.position.copy(av).add(bv).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(v(0, 1, 0), bv.sub(av).normalize());
    return o;
  }
  const sections = [
    [-2.35, 1.62, 0.07, 0.07],
    [-1.8, 1.62, 0.7, 0.73],
    [-1.1, 1.6, 1.02, 1.06],
    [0, 1.57, 1.11, 1.18],
    [0.95, 1.53, 1.04, 1.13],
    [1.8, 1.43, 0.78, 0.88],
    [2.4, 1.32, 0.44, 0.47],
    [2.66, 1.3, 0.03, 0.04],
  ];
  function profile(x) {
    let k = 0;
    while (k < sections.length - 2 && x > sections[k + 1][0]) k++;
    const a = sections[k],
      b = sections[k + 1],
      before = sections[Math.max(0, k - 1)],
      after = sections[Math.min(sections.length - 1, k + 2)],
      span = b[0] - a[0],
      t = THREE.MathUtils.clamp((x - a[0]) / span, 0, 1);
    return [1, 2, 3].map((j) => {
      const m0 = ((b[j] - before[j]) / (b[0] - before[0])) * span,
        m1 = ((after[j] - a[j]) / (after[0] - a[0])) * span;
      return (
        (2 * t ** 3 - 3 * t * t + 1) * a[j] +
        (t ** 3 - 2 * t * t + t) * m0 +
        (-2 * t ** 3 + 3 * t * t) * b[j] +
        (t ** 3 - t * t) * m1
      );
    });
  }
  function point(x, theta, lift = 0) {
    const [cy, ry, rz] = profile(x);
    return [x, cy + (ry + lift) * Math.cos(theta), (rz + lift) * Math.sin(theta)];
  }
  function patch(x0, x1, a0, a1, m, lift = 0, nx = 36, na = 24) {
    const ps = [],
      uv = [],
      ix = [];
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= na; j++) {
        ps.push(
          ...point(
            THREE.MathUtils.lerp(x0, x1, i / nx),
            THREE.MathUtils.lerp(a0, a1, j / na),
            lift,
          ),
        );
        uv.push(i / nx, j / na);
      }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < na; j++) {
        const a = i * (na + 1) + j,
          b = a + na + 1;
        ix.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    return mesh(g, m);
  }
  // Closed sculpted shell, with the white lower section following exactly the same shape.
  patch(-2.35, 2.66, 0, Math.PI * 2, navy);
  patch(-2.25, 2.6, 1.53, Math.PI * 2 - 1.53, ivory, 0.008, 64, 28);
  function window(x0, x1, a0, a1) {
    patch(x0, x1, a0, a1, glass, 0.024, 28, 16);
    const outline = [];
    for (let i = 0; i <= 18; i++)
      outline.push(point(THREE.MathUtils.lerp(x0, x1, i / 18), a0, 0.036));
    for (let i = 1; i <= 10; i++)
      outline.push(point(x1, THREE.MathUtils.lerp(a0, a1, i / 10), 0.036));
    for (let i = 1; i <= 18; i++)
      outline.push(point(THREE.MathUtils.lerp(x1, x0, i / 18), a1, 0.036));
    for (let i = 1; i <= 10; i++)
      outline.push(point(x0, THREE.MathUtils.lerp(a1, a0, i / 10), 0.036));
    pipe(outline, 0.027, black);
  }
  for (const sign of [-1, 1]) {
    window(0.9, 2.36, sign * 0.14, sign * 1.25);
    window(-0.45, 0.78, sign * 0.93, sign * 1.51);
    window(-1.55, -0.62, sign * 0.97, sign * 1.49);
    const seam = [];
    for (let i = 0; i <= 18; i++)
      seam.push(point(-0.53, sign * THREE.MathUtils.lerp(0.88, 2.12, i / 18), 0.028));
    pipe(seam, 0.009, black);
    const backSeam = [];
    for (let i = 0; i <= 18; i++)
      backSeam.push(point(-1.64, sign * THREE.MathUtils.lerp(0.93, 2.06, i / 18), 0.027));
    pipe(backSeam, 0.009, black);
    box([0.23, 0.035, 0.045], [-0.75, 1.36, sign * 1.09], metal);
    pipe(
      [
        [-1.2, 0.4, sign * 0.84],
        [-0.8, 0.23, sign * 1.1],
        [0.6, 0.23, sign * 1.1],
        [0.9, 0.45, sign * 0.88],
      ],
      0.033,
      metal,
    );
    // Tubular landing skids with raised tips and load-bearing struts.
    pipe(
      [
        [-2.35, 0.25, sign * 1.04],
        [-2, 0.15, sign * 1.12],
        [1.8, 0.15, sign * 1.12],
        [2.18, 0.3, sign * 1.1],
        [2.36, 0.47, sign * 1.08],
      ],
      0.062,
      metal,
    );
    rod([-1.05, 0.67, sign * 0.67], [-1.35, 0.18, sign * 1.12], 0.048, navy);
    rod([0.98, 0.65, sign * 0.7], [1.3, 0.18, sign * 1.12], 0.048, navy);
    for (const x of [-1.35, 1.3]) box([0.32, 0.028, 0.17], [x, 0.1, sign * 1.12], rubber);
    const nav = ellipsoid([0.075, 0.05, 0.055], [0.05, 2.1, sign * 1.06], sign > 0 ? red : blue);
    nav.name = sign > 0 ? 'Port_navigation' : 'Starboard_navigation';
  }
  // Engine fairing, intake grille, exhaust nozzles, mast and swashplate.
  ellipsoid([1.07, 0.33, 0.67], [-0.55, 2.6, 0], navy);
  for (const sign of [-1, 1]) {
    ellipsoid([0.38, 0.17, 0.04], [-0.6, 2.65, sign * 0.61], black);
    for (let i = 0; i < 7; i++)
      box([0.025, 0.15, 0.035], [-0.9 + i * 0.095, 2.65, sign * 0.651], metal);
    const exhaust = cylinder(0.17, 0.14, 0.47, [-1.38, 2.58, sign * 0.4], metal);
    exhaust.rotation.z = Math.PI / 2;
    const hole = mesh(new THREE.CircleGeometry(0.135, 24), black);
    hole.rotation.y = -Math.PI / 2;
    hole.position.set(-1.62, 2.58, sign * 0.4);
  }
  cylinder(0.21, 0.3, 0.24, [-0.2, 2.86, 0], black);
  cylinder(0.065, 0.09, 0.52, [-0.2, 3.13, 0], metal);
  cylinder(0.25, 0.25, 0.05, [-0.2, 3.12, 0], metal);
  for (const sign of [-1, 1])
    rod([-0.48, 2.86, sign * 0.22], [-0.34, 3.21, sign * 0.17], 0.025, metal);
  // Tapered tail boom, including closed ends and a contrasting side stripe.
  const boom = mesh(new THREE.CylinderGeometry(0.115, 0.47, 4.2, 32), navy);
  const from = v(-1.85, 1.65, 0),
    to = v(-6, 2.15, 0);
  boom.position.copy(from).add(to).multiplyScalar(0.5);
  boom.quaternion.setFromUnitVectors(v(0, 1, 0), to.sub(from).normalize());
  for (const sign of [-1, 1])
    pipe(
      [
        [-2, 1.5, sign * 0.42],
        [-3.5, 1.77, sign * 0.3],
        [-5.6, 2.03, sign * 0.14],
      ],
      0.045,
      ivory,
    );
  function fin(points, depth, m) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    return mesh(g, m);
  }
  fin(
    [
      [-6.15, 1.98],
      [-6.64, 1.95],
      [-6.32, 3.55],
      [-5.8, 3.37],
      [-5.7, 2.16],
    ],
    0.11,
    navy,
  );
  fin(
    [
      [-6.31, 3.05],
      [-6.4, 3.49],
      [-6.3, 3.55],
      [-5.8, 3.37],
      [-5.94, 3.05],
    ],
    0.117,
    ivory,
  );
  const stab = box([0.67, 0.065, 2.9], [-5.25, 2.08, 0], ivory);
  stab.rotation.z = 0.035;
  for (const sign of [-1, 1]) box([0.66, 0.13, 0.1], [-5.25, 2.12, sign * 1.43], navy);
  // Main rotor: four separate blades, pitch links and root clamps.
  const mainRotor = new THREE.Group();
  mainRotor.name = 'Main_rotor';
  mainRotor.position.set(-0.2, 3.43, 0);
  root.add(mainRotor);
  cylinder(0.19, 0.21, 0.15, [0, 0, 0], metal, mainRotor);
  ellipsoid([0.25, 0.09, 0.25], [0, 0.12, 0], navy, mainRotor);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 2;
    mainRotor.add(arm);
    box([0.76, 0.08, 0.13], [0.46, 0, 0], metal, arm);
    rod([0.12, -0.2, 0.1], [0.67, -0.02, 0.1], 0.015, metal, arm);
    const blade = box([3.78, 0.035, 0.25], [2.6, 0, 0.02], black, arm);
    blade.rotation.x = -0.08;
    box([0.25, 0.04, 0.253], [4.37, 0, 0.02], yellow, arm);
    box([0.33, 0.05, 0.17], [0.82, 0, 0], navy, arm);
  }
  // Tail rotor rotates around Z; its four blades sit clear of the stabiliser.
  const tailRotor = new THREE.Group();
  tailRotor.name = 'Tail_rotor';
  tailRotor.position.set(-6.16, 2.43, 0.27);
  root.add(tailRotor);
  const axle = cylinder(0.065, 0.065, 0.36, [-6.16, 2.43, 0.13], metal);
  axle.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    tailRotor.add(arm);
    box([0.115, 0.65, 0.035], [0, 0.43, 0], black, arm);
    box([0.12, 0.14, 0.04], [0, 0.69, 0.005], ivory, arm);
    box([0.12, 0.05, 0.045], [0, 0.77, 0.005], red, arm);
  }
  ellipsoid([0.11, 0.11, 0.08], [0, 0, 0.045], metal, tailRotor);
  // Belly searchlight, gimbal, FLIR camera and aerials.
  rod([1.58, 0.77, 0], [1.58, 0.48, 0], 0.045, metal);
  ellipsoid([0.28, 0.23, 0.27], [1.6, 0.43, 0], navy);
  const lens = mesh(new THREE.CircleGeometry(0.18, 32), lamp);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(1.6, 0.2, 0);
  ellipsoid([0.15, 0.17, 0.15], [0.65, 0.38, 0], black);
  const sensor = mesh(new THREE.CircleGeometry(0.085, 24), glass);
  sensor.rotation.y = Math.PI / 2;
  sensor.position.set(0.79, 0.35, 0);
  rod([-0.9, 2.91, 0], [-1.06, 3.22, 0], 0.012, black);
  rod([-3.15, 2.16, 0], [-3.4, 2.67, 0], 0.012, black);
  const beacon = ellipsoid([0.08, 0.06, 0.08], [-5.88, 3.48, 0], red);
  beacon.name = 'Anti_collision_beacon';
  // Small maintenance details and markings are built into the asset.
  for (const sign of [-1, 1]) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = '#172b35';
    ctx.font = '800 145px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('POLICÍA', 512, 174);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const decal = mesh(
      new THREE.PlaneGeometry(1.65, 0.41),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.6,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    decal.position.set(-0.16, 1.2, sign * 1.14);
    decal.rotation.y = sign > 0 ? 0 : Math.PI;
    for (let i = 0; i < 5; i++)
      ellipsoid([0.013, 0.013, 0.008], [-1.3 + i * 0.15, 1.02, sign * 1.01], metal);
    box([0.54, 0.035, 0.02], [-0.14, 1.01, sign * 1.02], navy);
  }
  // Bake static subassemblies by material. The two rotors remain separate animation nodes.
  function batch(group, exclude = new Set()) {
    root.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert();
    const buckets = new Map();
    function visit(o) {
      if (exclude.has(o)) return;
      if (o.isMesh && !o.material.transparent) {
        if (!buckets.has(o.material)) buckets.set(o.material, []);
        buckets.get(o.material).push(o);
      }
      for (const ch of o.children) visit(ch);
    }
    visit(group);
    for (const [material, objects] of buckets) {
      if (objects.length < 2) continue;
      const parts = objects.map((o) => {
        const g = o.geometry
          .clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
        if (!g.index) return g;
        const unindexed = g.toNonIndexed();
        g.dispose();
        return unindexed;
      });
      const geometry = BufferGeometryUtils.mergeBufferGeometries(parts);
      parts.forEach((g) => g.dispose());
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      merged.name = 'Airframe_details';
      group.add(merged);
      for (const o of objects) {
        o.parent.remove(o);
        o.geometry.dispose();
      }
    }
  }
  batch(root, new Set([mainRotor, tailRotor]));
  batch(mainRotor);
  batch(tailRotor);
  const converted = new Set();
  root.traverse((o) => {
    if (o.isMesh && !converted.has(o.material)) {
      o.material.color?.convertSRGBToLinear();
      converted.add(o.material);
    }
  });
  let triangles = 0;
  root.traverse((o) => {
    if (o.isMesh)
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  function spinTrack(node, axis, turns) {
    const times = [],
      values = [];
    for (let i = 0; i <= 32; i++) {
      times.push(i / 32);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (i / 32) * Math.PI * 2 * turns);
      values.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(node.name + '.quaternion', times, values);
  }
  const clips = [
    new THREE.AnimationClip('Rotors', 1, [
      spinTrack(mainRotor, v(0, 1, 0), 1),
      spinTrack(tailRotor, v(0, 0, 1), 3),
    ]),
  ];
  return {
    root,
    mainRotor,
    tailRotor,
    triangles,
    clips,
    update(dt, rpm, time) {
      mainRotor.rotation.y = (mainRotor.rotation.y + (dt * rpm * Math.PI) / 30) % (Math.PI * 2);
      tailRotor.rotation.z = (tailRotor.rotation.z + (dt * rpm * Math.PI) / 10) % (Math.PI * 2);
      red.emissiveIntensity = Math.sin(time * 8) > 0 ? 2.8 : 0.3;
      blue.emissiveIntensity = Math.sin(time * 8) > 0 ? 0.4 : 2.4;
    },
  };
}
