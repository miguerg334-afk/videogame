import * as THREE from 'three';
import { batchStaticParts } from './batching';

/**
 * Procedural vehicle geometry, built once per session.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {Document} document
 */
export function createVehicleModel(scene, renderer, document) {
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  const car = new THREE.Group();
  scene.add(car);
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xb9c99b,
    metalness: 0.82,
    roughness: 0.23,
    clearcoat: 0.8,
    clearcoatRoughness: 0.19,
    envMapIntensity: 0.85,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x3c586b,
    metalness: 0,
    roughness: 0.075,
    clearcoat: 0.85,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.8,
    transparent: true,
    opacity: 0.43,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x6c5140,
    roughness: 0.87,
    metalness: 0,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x1b2025,
    roughness: 0.72,
    metalness: 0.06,
  });
  const lensGlass = new THREE.MeshPhysicalMaterial({
    color: 0xb6d3e1,
    transparent: true,
    opacity: 0.18,
    roughness: 0.07,
    metalness: 0,
    clearcoat: 1,
    depthWrite: false,
  });
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = 128;
  const grainContext = grainCanvas.getContext('2d'),
    grainImage = grainContext.createImageData(128, 128);
  let grainSeed = 17;
  for (let i = 0; i < grainImage.data.length; i += 4) {
    grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
    const v = 100 + (grainSeed >>> 25);
    grainImage.data[i] = grainImage.data[i + 1] = grainImage.data[i + 2] = v;
    grainImage.data[i + 3] = 255;
  }
  grainContext.putImageData(grainImage, 0, 0);
  const grain = new THREE.CanvasTexture(grainCanvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(9, 9);
  paint.bumpMap = grain;
  paint.bumpScale = 0.0015;
  leather.bumpMap = grain;
  leather.bumpScale = 0.008;
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b1d24,
    emissive: 0x23404a,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  });
  // Tejido de carbono generado localmente, sin archivos de textura.
  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = weaveCanvas.height = 64;
  const weaveContext = weaveCanvas.getContext('2d');
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const tile = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      const light = tile ? (x % 8) * 1.7 : (y % 8) * 1.7;
      const v = Math.round(24 + light);
      weaveContext.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      weaveContext.fillRect(x, y, 1, 1);
    }
  const weave = new THREE.CanvasTexture(weaveCanvas);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(5, 5);
  weave.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x6d757b,
    map: weave,
    roughness: 0.43,
    metalness: 0.35,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101311, roughness: 0.9, metalness: 0 });
  rubber.bumpMap = grain;
  rubber.bumpScale = 0.004;
  const silver = new THREE.MeshStandardMaterial({ color: 0xbcc4cc, metalness: 1, roughness: 0.27 });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x333c36,
    metalness: 0.85,
    roughness: 0.38,
  });
  const brake = new THREE.MeshStandardMaterial({
    color: 0x555f68,
    metalness: 0.8,
    roughness: 0.48,
  });
  const caliper = new THREE.MeshStandardMaterial({
    color: 0xd6bc75,
    metalness: 0.35,
    roughness: 0.35,
  });
  const whiteLED = new THREE.MeshStandardMaterial({
    color: 0xe6f9ff,
    emissive: 0xc6eeff,
    emissiveIntensity: 3,
  });
  const redLED = new THREE.MeshStandardMaterial({
    color: 0xfa2b25,
    emissive: 0xff1510,
    emissiveIntensity: 2.5,
  });
  function mesh(geo, mat, parent = car) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(size, pos, mat, parent = car) {
    const m = mesh(new THREE.BoxGeometry(...size), mat, parent);
    m.position.set(...pos);
    return m;
  }
  function tube(points, r, mat, parent = car, closed = false) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => vec(...p)),
      closed,
    );
    return mesh(
      new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), r, 4, closed),
      mat,
      parent,
    );
  }
  function surface(rows, mat, holes = [], omit = null) {
    const positions = [],
      idx = [],
      uv = [];
    const cols = rows[0].length;
    rows.forEach((row, i) =>
      row.forEach((p, j) => {
        positions.push(...p);
        uv.push(i / (rows.length - 1), j / (cols - 1));
      }),
    );
    for (let i = 0; i < rows.length - 1; i++)
      for (let j = 0; j < cols - 1; j++) {
        const y = (rows[i][j][1] + rows[i + 1][j + 1][1]) / 2,
          z = (rows[i][j][2] + rows[i + 1][j + 1][2]) / 2;
        if (
          holes.some((h) => y > h[0] && y < h[1] && z > h[2] && z < h[3]) ||
          (omit && omit([(rows[i][j][0] + rows[i + 1][j + 1][0]) / 2, y, z]))
        )
          continue;
        const a = i * cols + j,
          b = a + cols;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return mesh(g, mat);
  }
  function roundedBox(size, pos, mat, r = 0.06, parent = car) {
    const [w, h, d] = size;
    const shape = new THREE.Shape();
    const x = -w / 2,
      y = -h / 2;
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.005, d - r * 2),
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: r * 0.45,
      bevelThickness: r * 0.45,
      curveSegments: 3,
    });
    g.center();
    const m = mesh(g, mat, parent);
    m.position.set(...pos);
    return m;
  }
  // Abertura con garganta tridimensional y pared posterior retraída.
  function aperture(x, y, z, w, h, depth, sign = 1) {
    const loop = [];
    const radius = Math.min(h * 0.27, 0.09);
    for (const [cx, cy, start] of [
      [w / 2 - radius, h / 2 - radius, 0],
      [-w / 2 + radius, h / 2 - radius, Math.PI / 2],
      [-w / 2 + radius, -h / 2 + radius, Math.PI],
      [w / 2 - radius, -h / 2 + radius, Math.PI * 1.5],
    ])
      for (let i = 0; i <= 8; i++) {
        const a = start + (i * Math.PI) / 16;
        loop.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
      }
    loop.push(loop[0]);
    const front = loop.map(([u, v]) => [x, y + v, z + u]),
      rear = loop.map(([u, v]) => [x - sign * depth, y + v * 0.78, z + u * 0.93]);
    surface([front, rear], carbon);
    tube(front, 0.018, carbon);
    const back = mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.84), trim);
    back.position.set(x - sign * depth, y, z);
    back.rotation.y = (sign * Math.PI) / 2;
    const slats = new THREE.InstancedMesh(
      new THREE.BoxGeometry(depth * 0.6, h * 0.68, 0.012),
      darkMetal,
      Math.max(1, Math.floor(w / 0.105) - 1),
    );
    const transform = new THREE.Object3D();
    for (let i = 0; i < slats.count; i++) {
      transform.position.set(
        x - sign * depth * 0.53,
        y,
        z - w * 0.44 + ((i + 1) * w * 0.88) / (slats.count + 1),
      );
      transform.updateMatrix();
      slats.setMatrixAt(i, transform.matrix);
    }
    car.add(slats);
  }
  // Secciones longitudinales interpoladas: x = frente; z = ancho.
  const profiles = [
    [-4.25, 1.48, 1.23, 1.2],
    [-3.8, 1.76, 1.48, 1.39],
    [-2.65, 1.96, 1.7, 1.52],
    [-1.65, 1.86, 1.57, 1.49],
    [0, 1.76, 1.49, 1.49],
    [1.65, 1.86, 1.58, 1.48],
    [2.65, 1.93, 1.69, 1.43],
    [3.65, 1.73, 1.33, 1.19],
    [4.22, 1.5, 1.08, 1.07],
  ];
  function profile(x) {
    let k = 0;
    while (k < profiles.length - 2 && x > profiles[k + 1][0]) k++;
    const a = profiles[k],
      b = profiles[k + 1],
      prev = profiles[Math.max(0, k - 1)],
      next = profiles[Math.min(profiles.length - 1, k + 2)],
      span = b[0] - a[0],
      t = THREE.MathUtils.clamp((x - a[0]) / span, 0, 1),
      out = [];
    for (let j = 1; j <= 3; j++) {
      const m0 = ((b[j] - prev[j]) / (b[0] - prev[0])) * span,
        m1 = ((next[j] - a[j]) / (next[0] - a[0])) * span;
      out.push(
        (2 * t * t * t - 3 * t * t + 1) * a[j] +
          (t * t * t - 2 * t * t + t) * m0 +
          (-2 * t * t * t + 3 * t * t) * b[j] +
          (t * t * t - t * t) * m1,
      );
    }
    return out;
  }
  function archBottom(x) {
    let y = 0.51;
    for (const axle of [-2.65, 2.65]) {
      const dx = x - axle;
      if (Math.abs(dx) < 0.855) y = Math.max(y, 0.8 + Math.sqrt(0.855 * 0.855 - dx * dx));
    }
    return y;
  }
  function flankWidth(x, t) {
    const w = profile(x)[0],
      door = Math.exp(-Math.pow(x / 1.8, 4)),
      arch = Math.max(0, Math.min(1, (archBottom(x) - 0.6) / 0.9));
    return (
      w +
      (1 - arch) *
        (-0.095 * t + 0.045 * Math.sin(2 * Math.PI * t) - 0.13 * door * Math.sin(Math.PI * t) ** 2)
    );
  }
  function sideZ(x, y) {
    const [w, shoulder] = profile(x),
      lower = Math.min(archBottom(x), shoulder - 0.025),
      t = THREE.MathUtils.clamp((shoulder - y) / (shoulder - lower), 0, 1);
    return flankWidth(x, t);
  }
  for (const sign of [-1, 1]) {
    const top = [],
      side = [];
    for (let i = 0; i <= 110; i++) {
      const x = -4.25 + (i * 8.47) / 110,
        [w, shoulder, center] = profile(x),
        bottom = archBottom(x);
      const a = [],
        b = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        const y =
          THREE.MathUtils.lerp(center, shoulder, Math.sin((t * Math.PI) / 2) ** 2) +
          0.018 * Math.sin(t * Math.PI);
        a.push([x, y, sign * w * t]);
      }
      for (let j = 0; j <= 20; j++) {
        const t = j / 20;
        b.push([
          x,
          THREE.MathUtils.lerp(shoulder, Math.min(bottom, shoulder - 0.025), t),
          sign * flankWidth(x, t),
        ]);
      }
      top.push(a);
      side.push(b);
    }
    surface(top, paint, [], ([x, y, z]) => x > -1.99 && x < 1.69 && Math.abs(z) < 1.48);
    surface(side, paint);
    // Bordes que delimitan los pasos de rueda.
    for (const axle of [-2.65, 2.65]) {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i * Math.PI) / 40,
          x = axle + 0.855 * Math.cos(a);
        pts.push([
          x,
          0.8 + 0.855 * Math.sin(a),
          sign * (sideZ(x, 0.8 + 0.855 * Math.sin(a)) + 0.012),
        ]);
      }
      tube(pts, 0.016, paint);
    }
    const sill = roundedBox([3.55, 0.13, 0.18], [-0.05, 0.46, sign * 1.79], carbon, 0.04);
    sill.rotation.z = 0.008;
    const characterLine = [];
    for (let i = 0; i <= 50; i++) {
      const x = -1.68 + (i * 3.35) / 50,
        y = 1.31 + 0.06 * Math.cos(x * 1.2);
      characterLine.push([x, y, sign * (sideZ(x, y) + 0.009)]);
    }
    tube(characterLine, 0.007, paint);
    const seam = [
      [-1.43, 1.49],
      [-1.35, 1.09],
      [-1.2, 0.61],
      [0.96, 0.61],
      [1.29, 1.13],
      [1.4, 1.5],
    ];
    tube(
      seam.map(([x, y]) => [x, y, sign * (sideZ(x, y) + 0.007)]),
      0.008,
      carbon,
    );
    roundedBox(
      [0.28, 0.035, 0.035],
      [-0.79, 1.36, sign * (sideZ(-0.79, 1.36) + 0.025)],
      darkMetal,
      0.012,
    );
    const intake = roundedBox(
      [0.62, 0.28, 0.055],
      [-1.45, 1.01, sign * (sideZ(-1.45, 1.01) + 0.018)],
      carbon,
      0.06,
    );
    intake.rotation.z = -0.2;
    for (let i = 0; i < 3; i++)
      box(
        [0.025, 0.19, 0.06],
        [-1.64 + i * 0.14, 1.01, sign * (sideZ(-1.45, 1.01) + 0.052)],
        darkMetal,
      );
    tube(
      [
        [1.12, 1.7, sign * 1.34],
        [1.19, 1.65, sign * 1.87],
      ],
      0.026,
      carbon,
    );
    const mirror = mesh(new THREE.SphereGeometry(1, 24, 12), paint);
    mirror.scale.set(0.28, 0.085, 0.14);
    mirror.position.set(1.18, 1.7, sign * 1.96);
    const mirrorFace = mesh(new THREE.SphereGeometry(1, 16, 8), silver);
    mirrorFace.scale.set(0.012, 0.058, 0.105);
    mirrorFace.position.set(0.94, 1.7, sign * 1.96);
  }
  // Cabina: parabrisas, luneta, ventanillas y pilares independientes.
  function cabinPatch(start, end, material) {
    const rows = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        xx = THREE.MathUtils.lerp(start[0], end[0], t),
        yy = THREE.MathUtils.lerp(start[1], end[1], t) + 0.025 * Math.sin(t * Math.PI),
        ww = THREE.MathUtils.lerp(start[2], end[2], t);
      rows.push(
        Array.from({ length: 33 }, (_, j) => {
          const u = -1 + j / 16;
          return [xx, yy + 0.055 * (1 - u * u), u * ww];
        }),
      );
    }
    const m = surface(rows, material);
    if (material === glass) {
      m.castShadow = false;
      m.renderOrder = 4;
    }
    return m;
  }
  cabinPatch([0.61, 2.11, 1.12], [1.69, 1.5, 1.42], glass);
  cabinPatch([-2.04, 1.5, 1.4], [-0.97, 2.14, 1.12], glass);
  for (const sign of [-1, 1]) {
    const windowRows = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30,
        x = -1.97 + t * 3.58;
      let h, w;
      if (x < -0.97) {
        const q = x + 1.97;
        h = 1.5 + 0.64 * q;
        w = 1.49 - 0.37 * q;
      } else if (x < 0.61) {
        h = 2.14 + 0.025 * Math.sin(((x + 0.97) / 1.58) * Math.PI);
        w = 1.12;
      } else {
        const q = x - 0.61;
        h = 2.11 - 0.61 * q;
        w = 1.12 + 0.37 * q;
      }
      windowRows.push(
        Array.from({ length: 9 }, (_, j) => {
          const v = j / 8;
          return [
            x,
            THREE.MathUtils.lerp(1.5, h, v),
            sign * (THREE.MathUtils.lerp(1.49, w, v) + 0.018 * Math.sin(v * Math.PI)),
          ];
        }),
      );
    }
    const windows = surface(windowRows, glass);
    windows.castShadow = false;
    windows.renderOrder = 5;
    tube(
      [
        [-2.04, 1.49, sign * 1.5],
        [-1.52, 1.86, sign * 1.32],
        [-0.97, 2.14, sign * 1.12],
      ],
      0.057,
      paint,
    );
    tube(
      [
        [0.61, 2.11, sign * 1.12],
        [1.12, 1.84, sign * 1.3],
        [1.69, 1.5, sign * 1.5],
      ],
      0.043,
      paint,
    );
    tube(
      [
        [-0.49, 2.17, sign * 1.12],
        [-0.49, 1.5, sign * 1.49],
      ],
      0.04,
      trim,
    );
    tube(
      [
        [-2.04, 1.5, sign * 1.5],
        [-0.4, 1.5, sign * 1.5],
        [1.69, 1.5, sign * 1.5],
      ],
      0.023,
      darkMetal,
    );
    // Juntas de caucho alrededor de la superficie vidriada.
    tube(
      [
        [-0.97, 2.12, sign * 1.13],
        [0.61, 2.09, sign * 1.13],
      ],
      0.014,
      rubber,
    );
  }
  cabinPatch([-0.97, 2.15, 1.14], [0.61, 2.12, 1.14], paint);
  tube(
    [
      [1.69, 1.5, -1.42],
      [1.71, 1.555, 0],
      [1.69, 1.5, 1.42],
    ],
    0.028,
    trim,
  );
  tube(
    [
      [-2.04, 1.5, -1.4],
      [-2.06, 1.555, 0],
      [-2.04, 1.5, 1.4],
    ],
    0.025,
    paint,
  );
  // Desempañador de la luneta.
  for (let i = 1; i <= 7; i++) {
    const t = i / 9,
      x = -2.04 + t * 1.07,
      y = 1.5 + t * 0.64,
      w = 1.4 - t * 0.28;
    tube(
      [
        [x, y + 0.015, -w * 0.9],
        [x, y + 0.06, 0],
        [x, y + 0.015, w * 0.9],
      ],
      0.003,
      darkMetal,
    );
  }
  // Habitáculo: dos asientos, consola, salpicadero y volante.
  roundedBox([3.3, 0.14, 2.84], [-0.04, 1.13, 0], trim, 0.05);
  for (const sign of [-1, 1]) {
    const z = sign * 0.65;
    roundedBox([0.86, 0.16, 0.67], [-0.3, 1.29, z], leather, 0.07);
    const seatBack = roundedBox([0.17, 0.67, 0.66], [-0.79, 1.59, z], leather, 0.065);
    seatBack.rotation.z = -0.15;
    roundedBox([0.19, 0.23, 0.35], [-0.84, 1.98, z], trim, 0.055);
    for (const bol of [-1, 1]) {
      roundedBox([0.67, 0.19, 0.11], [-0.3, 1.38, z + bol * 0.32], trim, 0.035);
      const side = roundedBox([0.19, 0.55, 0.1], [-0.75, 1.6, z + bol * 0.31], trim, 0.03);
      side.rotation.z = -0.15;
    }
    for (let j = 0; j < 5; j++) {
      tube(
        [
          [-0.66, 1.4, z - 0.22 + j * 0.11],
          [-0.04, 1.4, z - 0.22 + j * 0.11],
        ],
        0.006,
        leather,
      );
    }
    roundedBox([2.65, 0.34, 0.09], [-0.04, 1.36, sign * 1.43], trim, 0.04);
  }
  roundedBox([0.96, 0.28, 2.72], [1.16, 1.43, 0], trim, 0.055);
  roundedBox([1.55, 0.25, 0.28], [0.08, 1.29, 0], carbon, 0.04);
  const display = roundedBox([0.025, 0.21, 0.43], [0.72, 1.68, -0.59], screenMaterial, 0.012);
  display.rotation.z = 0.07;
  for (let j = 0; j < 3; j++)
    roundedBox([0.018, 0.015, 0.09], [0.7, 1.63 + j * 0.047, -0.68 + j * 0.08], whiteLED, 0.004);
  const steering = new THREE.Group();
  steering.position.set(0.64, 1.62, -0.65);
  steering.rotation.z = -0.14;
  car.add(steering);
  const wheel = mesh(new THREE.TorusGeometry(0.22, 0.023, 8, 40), trim, steering);
  wheel.rotation.y = Math.PI / 2;
  for (let j = 0; j < 3; j++) {
    const angle = (j * Math.PI * 2) / 3;
    const spoke = box(
      [0.025, 0.025, 0.2],
      [0, Math.sin(angle) * 0.1, Math.cos(angle) * 0.1],
      silver,
      steering,
    );
    spoke.rotation.x = -angle;
  }
  const center = mesh(new THREE.SphereGeometry(0.063, 16, 8), trim, steering);
  center.scale.x = 0.45;
  roundedBox([0.15, 0.04, 0.1], [0.31, 1.48, 0], silver, 0.018);
  // Limpiaparabrisas discretos sobre la base del parabrisas.
  tube(
    [
      [1.57, 1.58, -1.03],
      [1.37, 1.68, -0.32],
      [1.29, 1.73, 0.06],
    ],
    0.009,
    rubber,
  );
  // Líneas de capó ajustadas a la superficie paramétrica.
  for (const sign of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 35; i++) {
      const x = 1.75 + (i * 2.2) / 35,
        [w, shoulder, center] = profile(x),
        z = 0.85 + (0.08 * i) / 35,
        t = z / w,
        y =
          THREE.MathUtils.lerp(center, shoulder, Math.sin((t * Math.PI) / 2) ** 2) +
          0.018 * Math.sin(t * Math.PI);
      pts.push([x, y + 0.008, sign * z]);
    }
    tube(pts, 0.006, carbon);
    for (let i = 0; i < 5; i++) {
      const x = -2.8 + i * 0.14;
      const [w, shoulder, center] = profile(x),
        t = 1.1 / w,
        y =
          THREE.MathUtils.lerp(center, shoulder, Math.sin((t * Math.PI) / 2) ** 2) +
          0.018 * Math.sin(t * Math.PI);
      const vent = roundedBox([0.07, 0.013, 0.32], [x, y + 0.012, sign * 1.1], carbon, 0.005);
    }
  }
  // Ruedas: pivote de dirección separado del conjunto rotativo.
  const wheelAssemblies = [];
  const archLiner = trim.clone();
  archLiner.side = THREE.DoubleSide;
  for (const axle of [-2.65, 2.65])
    for (const sign of [-1, 1]) {
      const rows = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i * Math.PI) / 48;
        rows.push(
          [1.34, 1.88].map((z) => [
            axle + 0.833 * Math.cos(a),
            0.8 + 0.833 * Math.sin(a),
            sign * z,
          ]),
        );
      }
      surface(rows, archLiner);
    }
  for (const x of [-2.65, 2.65])
    for (const sign of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.8, sign * 1.67);
      car.add(pivot);
      const roll = new THREE.Group();
      pivot.add(roll);
      wheelAssemblies.push({ pivot, roll });
      const tireProfile = [
        [0.554, -0.235],
        [0.65, -0.235],
        [0.728, -0.212],
        [0.773, -0.172],
        [0.789, -0.115],
        [0.792, 0],
        [0.789, 0.115],
        [0.773, 0.172],
        [0.728, 0.212],
        [0.65, 0.235],
        [0.554, 0.235],
        [0.554, -0.235],
      ].map(([r, w]) => new THREE.Vector2(r, w));
      const tire = mesh(new THREE.LatheGeometry(tireProfile, 48), rubber, roll);
      tire.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const lip = mesh(new THREE.TorusGeometry(0.557, 0.016, 6, 32), silver, roll);
        lip.position.z = side * 0.242;
        const bead = mesh(new THREE.TorusGeometry(0.69, 0.004, 4, 32), darkMetal, roll);
        bead.position.z = side * 0.233;
      }
      // Surcos de rodadura instanciados a lo largo de todo el perímetro.
      const grooves = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.009, 0.003, 0.115),
        darkMetal,
        168,
      );
      const grooveTransform = new THREE.Object3D();
      let grooveIndex = 0;
      for (let j = 0; j < 56; j++)
        for (const lane of [-1, 0, 1]) {
          const a = (j * Math.PI * 2) / 56;
          grooveTransform.position.set(Math.cos(a) * 0.791, Math.sin(a) * 0.791, lane * 0.095);
          grooveTransform.rotation.set(0, 0, a - Math.PI / 2);
          grooveTransform.rotateY(lane * 0.24);
          grooveTransform.updateMatrix();
          grooves.setMatrixAt(grooveIndex++, grooveTransform.matrix);
        }
      roll.add(grooves);
      for (const offset of [-0.058, 0.058]) {
        const line = mesh(new THREE.TorusGeometry(0.792, 0.006, 4, 32), trim, roll);
        line.position.z = offset;
      }
      const disc = mesh(new THREE.CylinderGeometry(0.475, 0.475, 0.035, 32), brake, roll);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = sign * 0.12;
      const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.013, 6), carbon, 56);
      const holeTransform = new THREE.Object3D();
      let holeIndex = 0;
      for (let j = 0; j < 28; j++) {
        const angle = (j * Math.PI * 2) / 28;
        for (const radius of [0.33, 0.39]) {
          holeTransform.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            sign * 0.143,
          );
          holeTransform.rotation.y = sign < 0 ? Math.PI : 0;
          holeTransform.updateMatrix();
          holes.setMatrixAt(holeIndex++, holeTransform.matrix);
        }
      }
      roll.add(holes);
      roundedBox([0.15, 0.39, 0.12], [0.32, 0.01, sign * 0.16], caliper, 0.04, pivot);
      const discHat = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 32), darkMetal, roll);
      discHat.rotation.x = Math.PI / 2;
      discHat.position.z = sign * 0.155;
      const barrel = mesh(
        new THREE.CylinderGeometry(0.551, 0.551, 0.35, 32, 1, true),
        darkMetal,
        roll,
      );
      barrel.rotation.x = Math.PI / 2;
      for (let j = 0; j < 5; j++)
        for (const split of [-1, 1]) {
          const a = (j * Math.PI * 2) / 5;
          const pts = [
            [0.065, 0.075],
            [0.055 + split * 0.014, 0.22],
            [0.048 + split * 0.063, 0.48],
            [0.018 + split * 0.066, 0.548],
            [-0.01 + split * 0.037, 0.535],
            [0.015 + split * 0.012, 0.23],
            [0.023, 0.075],
          ];
          const shape = new THREE.Shape();
          pts.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
          shape.closePath();
          const g = new THREE.ExtrudeGeometry(shape, {
            depth: 0.032,
            bevelEnabled: true,
            bevelSize: 0.004,
            bevelThickness: 0.004,
            bevelSegments: 2,
            steps: 1,
          });
          const spoke = mesh(g, silver, roll);
          spoke.rotation.z = a;
          spoke.position.z = sign * 0.218;
          if (sign < 0) spoke.scale.z = -1;
        }
      const hub = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 24), darkMetal, roll);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = sign * 0.243;
      for (let j = 0; j < 5; j++) {
        const a = (j * Math.PI * 2) / 5;
        const bolt = mesh(new THREE.SphereGeometry(0.022, 8, 6), silver, roll);
        bolt.position.set(Math.sin(a) * 0.077, Math.cos(a) * 0.077, sign * 0.288);
      }
    }
  // Morro: transición redondeada hacia una fascia con aberturas reales.
  const frontY = [0.52, 0.56, 0.6, 0.62, 0.68, 0.76, 0.82, 0.88, 0.9, 0.96, 1.02, 1.08],
    frontZ = [
      -1.5, -1.44, -1.36, -1.26, -1.12, -0.98, -0.86, -0.74, -0.55, -0.3, 0, 0.3, 0.55, 0.74, 0.86,
      0.98, 1.12, 1.26, 1.36, 1.44, 1.5,
    ];
  const fasciaRows = frontY.map((y) =>
    frontZ.map((z) => {
      const t = (y - 0.52) / 0.56,
        u = z / 1.5;
      return [4.22 + 0.095 * Math.sin(t * Math.PI) - 0.18 * Math.pow(Math.abs(u), 4), y, z];
    }),
  );
  surface(fasciaRows, paint, [
    [0.6, 0.88, -0.74, 0.74],
    [0.62, 0.9, -1.36, -0.98],
    [0.62, 0.9, 0.98, 1.36],
  ]);
  // Esquinas redondeadas continuas entre el frente y los guardabarros.
  for (const sign of [-1, 1]) {
    const bridge = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const row = [];
      for (let j = 0; j <= 12; j++) {
        const v = j / 12,
          x = THREE.MathUtils.lerp(4.17, 3.73, t),
          z = sign * THREE.MathUtils.lerp(1.5, profile(x)[0], Math.sin((t * Math.PI) / 2)),
          bottom = 0.52,
          top = profile(x)[1];
        row.push([x + 0.025 * Math.sin(v * Math.PI), THREE.MathUtils.lerp(bottom, top, v), z]);
      }
      bridge.push(row);
    }
    surface(bridge, paint);
  }
  // Las gargantas se proyectan por delante de la fascia y se oscurecen hacia dentro.
  aperture(4.33, 0.74, 0, 1.48, 0.28, 0.22, 1);
  for (const sign of [-1, 1]) {
    aperture(4.26, 0.76, sign * 1.17, 0.38, 0.28, 0.2, 1);
    const housing = [
      [4.25, 1.09, sign * 0.85],
      [4.19, 1.13, sign * 1.16],
      [4.03, 1.21, sign * 1.43],
      [3.95, 1.23, sign * 1.51],
    ];
    tube(housing, 0.065, carbon);
    const lightLens = tube(
      housing.map(([x, y, z]) => [x + 0.083, y + 0.006, z]),
      0.043,
      lensGlass,
    );
    lightLens.castShadow = false;
    lightLens.renderOrder = 6;
    const led = housing.map(([x, y, z]) => [x + 0.074, y + 0.027, z]);
    tube(led, 0.016, whiteLED);
    tube(
      housing.map(([x, y, z]) => [x + 0.073, y - 0.012, z]),
      0.008,
      whiteLED,
    );
    // Módulos ópticos individuales dentro del alojamiento.
    for (let i = 0; i < 3; i++) {
      const z = sign * (0.98 + i * 0.14);
      const lens = mesh(new THREE.SphereGeometry(0.027, 12, 8), whiteLED);
      lens.scale.x = 0.4;
      lens.position.set(4.326 - i * 0.032, 1.105 + i * 0.025, z);
    }
  }
  const splitterRows = [[], []];
  for (let i = 0; i <= 48; i++) {
    const u = -1 + i / 24;
    splitterRows[0].push([3.89, 0.47, u * 1.65]);
    splitterRows[1].push([4.39 - 0.25 * Math.abs(u) ** 4, 0.48, u * 1.65]);
  }
  surface(splitterRows, carbon);
  tube(
    [
      [4.22, 0.49, -1.65],
      [4.38, 0.48, -0.8],
      [4.4, 0.48, 0],
      [4.38, 0.48, 0.8],
      [4.22, 0.49, 1.65],
    ],
    0.018,
    carbon,
  );
  const emblem = mesh(new THREE.ConeGeometry(0.042, 0.12, 3), silver);
  emblem.rotation.z = -Math.PI / 2;
  emblem.position.set(3.98, 1.12, 0);
  // Bandeau trasero, labio elevado y difusor con aletas.
  const rearRows = [0.5, 0.6, 0.7, 0.76, 0.82, 0.9, 0.98, 1.04, 1.14, 1.23].map((y) =>
    [-1.49, -1.4, -1.26, -1, -0.5, 0, 0.5, 1, 1.26, 1.4, 1.49].map((z) => {
      const t = (y - 0.5) / 0.73,
        u = z / 1.49;
      return [-4.25 - 0.04 * Math.sin(t * Math.PI) + 0.12 * Math.abs(u) ** 4, y, z];
    }),
  );
  surface(rearRows, paint, [[0.76, 0.98, -1.26, 1.26]]);
  const tailHousing = roundedBox([2.83, 0.11, 0.055], [-4.295, 1.14, 0], carbon, 0.045);
  tailHousing.rotation.y = Math.PI / 2;
  tube(
    [
      [-4.31, 1.16, -1.39],
      [-4.35, 1.18, -0.7],
      [-4.35, 1.18, 0],
      [-4.35, 1.18, 0.7],
      [-4.31, 1.16, 1.39],
    ],
    0.018,
    redLED,
  );
  aperture(-4.32, 0.87, 0, 2.52, 0.22, 0.16, -1);
  surface(
    [
      [
        [-4.4, 0.45, -1.5],
        [-4.4, 0.45, 0],
        [-4.4, 0.45, 1.5],
      ],
      [
        [-3.65, 0.56, -1.55],
        [-3.65, 0.56, 0],
        [-3.65, 0.56, 1.55],
      ],
    ],
    carbon,
  );
  for (let i = -3; i <= 3; i++) {
    const fin = box([0.75, 0.16, 0.022], [-4.03, 0.44, i * 0.38], carbon);
    fin.rotation.z = -0.13;
  }
  for (const sign of [-1, 1]) {
    const exhaust = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 32, 1, true), silver);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(-4.32, 0.65, sign * 1.18);
    const hole = mesh(new THREE.CircleGeometry(0.082, 24), carbon);
    hole.rotation.y = -Math.PI / 2;
    hole.position.set(-4.43, 0.65, sign * 1.18);
  }
  const spoilerRows = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    spoilerRows.push(
      Array.from({ length: 33 }, (_, j) => {
        const u = -1 + j / 16;
        return [
          -3.89 - t * 0.34,
          1.3 + 0.045 * Math.sin(t * Math.PI) + 0.065 * t,
          u * (1.59 - 0.08 * t),
        ];
      }),
    );
  }
  surface(spoilerRows, paint);
  // Colores de entrada sRGB convertidos al espacio de trabajo lineal.
  const converted = new Set();
  car.traverse((o) => {
    if (o.isMesh) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.color && !converted.has(m)) {
          m.color.convertSRGBToLinear();
          converted.add(m);
        }
      }
    }
  });

  const batching = [batchStaticParts(car, new Set(wheelAssemblies.map((w) => w.pivot)))];
  for (const { pivot, roll } of wheelAssemblies) {
    batching.push(batchStaticParts(pivot, new Set([roll])), batchStaticParts(roll));
  }
  return { car, paint, wheelAssemblies, whiteLED, redLED, batching };
}
