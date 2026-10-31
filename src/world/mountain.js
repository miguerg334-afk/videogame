import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { routeAnchors, routeHeight, createRouteLookup } from './route';
import { createTerrainHeight, createTerrain } from './terrain';

/**
 * Build terrain, road colliders, tunnels and night lighting.
 * @param {THREE.Scene} scene
 * @param {THREE.Group} car
 * @param {Document} document
 */
export function createMountainWorld(scene, car, document) {
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  // Ruta de montaña ampliada: rectas, pendientes continuas y túneles transitables.
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.numSolverIterations = 8;

  let seed = 6049;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function material(color, roughness = 1) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).convertSRGBToLinear(),
      roughness,
      metalness: 0,
      envMapIntensity: 0.32,
    });
  }
  const grass = material(0x758b57),
    asphalt = material(0x42494b, 0.97),
    gravel = material(0xb4ac90),
    stripe = material(0xe7e5d4),
    railMat = material(0xb5bfc0, 0.5),
    postMat = material(0x545f5d);
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = asphaltCanvas.height = 128;
  const ac = asphaltCanvas.getContext('2d'),
    pixels = ac.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 100 + Math.floor(random() * 55);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
    pixels.data[i + 3] = 255;
  }
  ac.putImageData(pixels, 0, 0);
  const asphaltTexture = new THREE.CanvasTexture(asphaltCanvas);
  asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.repeat.set(3, 145);
  asphalt.map = asphaltTexture;
  const curve = new THREE.CatmullRomCurve3(
    routeAnchors.map(([x, z]) => vec(x, 0, z)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 6000;
  curve.updateArcLengths();
  const trackLength = curve.getLength(),
    N = Math.ceil(trackLength / 1.5);
  /** @type {import('../engine/types').RouteFrame[]} */
  const frames = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N,
      p = curve.getPointAt(t),
      tangent = curve.getTangentAt(t).normalize(),
      normal = vec(-tangent.z, 0, tangent.x);
    p.y = routeHeight(p.x, p.z) + 0.075;
    const ahead = curve.getPointAt((t + 0.0002) % 1),
      behind = curve.getPointAt((t - 0.0002 + 1) % 1),
      horizontal = ahead.clone().sub(behind).length();
    const grade =
      (routeHeight(ahead.x, ahead.z) - routeHeight(behind.x, behind.z)) /
      Math.max(0.01, horizontal);
    frames.push({ p, tangent, normal, t, grade });
  }
  const nearestTrack = createRouteLookup(frames);
  /** @type {import('../engine/types').TunnelRange[]} */
  const tunnelRanges = [];
  for (const spec of [
    { name: 'Túnel del Pinar', from: -120, to: 70, north: true },
    { name: 'Túnel de la Cumbre', from: -90, to: 240, north: false },
  ]) {
    const indices = frames
      .map((f, i) => ({ f, i }))
      .filter(
        ({ f }) =>
          f.p.x > spec.from && f.p.x < spec.to && (spec.north ? f.p.z > 155 : f.p.z < -305),
      )
      .map(({ i }) => i);
    tunnelRanges.push({ ...spec, start: Math.min(...indices), end: Math.max(...indices) });
  }
  /** @param {number} index
   * @param {number} margin */
  function tunnelForIndex(index, margin = 0) {
    return tunnelRanges.find((t) => index >= t.start - margin && index <= t.end + margin);
  }
  const terrainHeight = createTerrainHeight(nearestTrack);
  /** @param {number} x
   * @param {number} z */
  function driveGroundHeight(x, z) {
    const near = nearestTrack({ x, z });
    return near.distance < 13 ? routeHeight(x, z) + 0.075 : terrainHeight(x, z);
  }
  /** @param {import('../engine/types').RouteFrame} frame
   * @param {number} d
   * @param {number} lift */
  function offsetPoint(frame, d, lift = 0) {
    const p = frame.p.clone().addScaledVector(frame.normal, d);
    p.y = routeHeight(p.x, p.z) + 0.075 + lift;
    return p;
  }
  const terrain = createTerrain(scene, world, terrainHeight);
  asphaltTexture.repeat.y = trackLength / 5;
  function ribbon(a, b, mat, lift = 0, collider = false, curb = false) {
    const v = [],
      uv = [],
      indices = [],
      colors = [];
    for (let i = 0; i <= N; i++) {
      for (const d of [a, b]) {
        const p = offsetPoint(frames[i], d, lift);
        v.push(p.x, p.y, p.z);
        uv.push(d / 10, i / N);
        if (curb) {
          const c = new THREE.Color(
            Math.floor(i / 5) % 2 ? 0xe8e2ce : 0xaa4437,
          ).convertSRGBToLinear();
          colors.push(c.r, c.g, c.b);
        }
      }
      if (i < N) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    if (curb) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
    if (collider)
      world.createCollider(
        R.ColliderDesc.trimesh(new Float32Array(v), new Uint32Array(indices)).setFriction(1),
      );
    return m;
  }
  ribbon(-24, 24, grass, -0.15, true);
  ribbon(-6.4, 6.4, gravel, -0.035);
  ribbon(-5, 5, asphalt, 0, true);
  ribbon(-4.83, -4.72, stripe, 0.012);
  ribbon(4.72, 4.83, stripe, 0.012);
  const curbMat = material(0xffffff);
  curbMat.vertexColors = true;
  ribbon(-5.45, -5.02, curbMat, 0.018);
  ribbon(5.02, 5.45, curbMat, 0.018);
  const dashedCount = Math.floor(trackLength / 7),
    dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.008, 0.115), stripe, dashedCount),
    transform = new THREE.Object3D();
  for (let i = 0; i < dashedCount; i++) {
    const frame = frames[Math.floor((i / dashedCount) * N)],
      p = offsetPoint(frame, 0, 0.014);
    transform.position.copy(p);
    transform.quaternion.setFromUnitVectors(
      vec(1, 0, 0),
      frame.tangent.clone().setY(frame.grade).normalize(),
    );
    transform.updateMatrix();
    dashes.setMatrixAt(i, transform.matrix);
  }
  scene.add(dashes);
  // Continuous guard rails; collider orientation follows the slope of each segment.
  const railCount = Math.floor(trackLength / 8),
    rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.42, 0.16), railMat, railCount * 2),
    posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), postMat, railCount * 2);
  let railIndex = 0;
  for (let i = 0; i < railCount; i++) {
    const f1 = frames[Math.floor((i / railCount) * N)],
      f2 = frames[Math.floor(((i + 1) / railCount) * N)];
    for (const side of [-1, 1]) {
      const a = offsetPoint(f1, side * 7.2),
        b = offsetPoint(f2, side * 7.2),
        delta = b.clone().sub(a),
        length = delta.length(),
        center = a.clone().add(b).multiplyScalar(0.5);
      center.y += 0.65;
      const q = new THREE.Quaternion().setFromUnitVectors(vec(1, 0, 0), delta.normalize());
      transform.position.copy(center);
      transform.quaternion.copy(q);
      transform.scale.set(length + 0.08, 1, 1);
      transform.updateMatrix();
      rails.setMatrixAt(railIndex, transform.matrix);
      world.createCollider(
        R.ColliderDesc.cuboid(length / 2 + 0.04, 0.26, 0.11)
          .setTranslation(center.x, center.y, center.z)
          .setRotation(q)
          .setFriction(0.28)
          .setRestitution(0.08),
      );
      transform.position.copy(a);
      transform.position.y += 0.4;
      transform.quaternion.identity();
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      posts.setMatrixAt(railIndex, transform.matrix);
      railIndex++;
    }
  }
  rails.castShadow = true;
  posts.castShadow = true;
  scene.add(rails, posts);
  // Trees are instanced and kept away from the road and escape shoulders.
  const treePositions = [];
  for (let attempts = 0; attempts < 6500 && treePositions.length < 1000; attempts++) {
    const x = -1150 + random() * 3300,
      z = -1300 + random() * 2350;
    if (nearestTrack({ x, z }).distance > 25) treePositions.push({ x, z, h: 3.2 + random() * 4.5 });
  }
  const foliageMat = material(0x3e654b),
    trunkMat = material(0x655343),
    foliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 7),
      foliageMat,
      treePositions.length * 2,
    ),
    trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.18, 1, 6),
      trunkMat,
      treePositions.length,
    );
  for (let i = 0; i < treePositions.length; i++) {
    const p = treePositions[i],
      y = terrainHeight(p.x, p.z);
    transform.position.set(p.x, y + p.h * 0.35, p.z);
    transform.rotation.set(0, random() * Math.PI, 0);
    transform.scale.set(1, p.h * 0.7, 1);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    for (let j = 0; j < 2; j++) {
      transform.position.set(p.x, y + p.h * (0.55 + j * 0.22), p.z);
      transform.scale.set(p.h * (0.31 - j * 0.085), p.h * 0.72, p.h * (0.31 - j * 0.085));
      transform.updateMatrix();
      foliage.setMatrixAt(i * 2 + j, transform.matrix);
    }
  }
  foliage.castShadow = true;
  scene.add(foliage, trunks);
  // Starting line and a lightweight track gantry.
  const start = frames[0];
  for (let a = 0; a < 10; a++)
    for (let b = 0; b < 2; b++) {
      const p = offsetPoint(start, -4.5 + a, 0.018).addScaledVector(
          start.tangent,
          (b - 0.5) * 0.65,
        ),
        m = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.015, 0.98),
          material((a + b) % 2 ? 0xeeeecc : 0x252b29),
        );
      m.position.copy(p);
      m.rotation.y = -Math.atan2(start.tangent.z, start.tangent.x);
      scene.add(m);
    }
  const gantry = new THREE.Group();
  gantry.position.copy(start.p);
  gantry.rotation.y = -Math.atan2(start.tangent.z, start.tangent.x);
  const beamMat = material(0x233a33);
  for (const z of [-6.3, 6.3]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5, 0.22), beamMat);
    m.position.set(0, 2.5, z);
    gantry.add(m);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.65, 12.8), beamMat);
  beam.position.y = 4.8;
  gantry.add(beam);
  scene.add(gantry);
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024;
  bannerCanvas.height = 128;
  const bc = bannerCanvas.getContext('2d');
  bc.fillStyle = '#233a33';
  bc.fillRect(0, 0, 1024, 128);
  bc.fillStyle = '#dbf6a7';
  bc.font = 'bold 54px Arial';
  bc.textAlign = 'center';
  bc.fillText('APEX / CIRCUITO SIERRA', 512, 85);
  const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
  bannerTexture.encoding = THREE.sRGBEncoding;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(11.8, 0.6),
    new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide }),
  );
  banner.position.set(-0.18, 4.8, 0);
  banner.rotation.y = -Math.PI / 2;
  gantry.add(banner);
  // Reflective direction boards on the outside of selected curves.
  for (const fraction of [0.16, 0.29, 0.43, 0.55, 0.68, 0.82, 0.93]) {
    const frame = frames[Math.floor(fraction * N)],
      p = offsetPoint(frame, -8.6);
    const g = new THREE.Group();
    g.position.copy(p);
    g.rotation.y = -Math.atan2(frame.tangent.z, frame.tangent.x);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), postMat);
    post.position.y = 0.95;
    g.add(post);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 1.7), beamMat);
    plate.position.y = 1.6;
    g.add(plate);
    for (let j = 0; j < 3; j++) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.13), stripe);
      mark.position.set(0.015, 1.6, -0.55 + j * 0.55);
      mark.rotation.x = -0.5;
      g.add(mark);
    }
    scene.add(g);
  }
  // Galerías arqueadas con techo y paredes que también participan en las colisiones.
  const tunnelConcrete = material(0x747b7b, 0.96);
  tunnelConcrete.side = THREE.DoubleSide;
  const tunnelRock = material(0x5c625e);
  tunnelRock.side = THREE.DoubleSide;
  const tunnelGlow = new THREE.MeshStandardMaterial({
    color: 0xffd79e,
    emissive: 0xffb762,
    emissiveIntensity: 2.2,
    roughness: 0.6,
  });
  const tunnelLampPoints = [];
  function tunnelSurface(range, outer = false) {
    const vertices = [],
      indices = [],
      cross = [];
    cross.push([-6.5, 0]);
    for (let j = 0; j <= 24; j++) {
      const angle = (j * Math.PI) / 24;
      cross.push([-6.5 * Math.cos(angle), 3 + 2.8 * Math.sin(angle)]);
    }
    cross.push([6.5, 0]);
    const count = cross.length;
    for (let i = range.start; i <= range.end; i++) {
      const frame = frames[i];
      for (const [d, h] of cross) {
        const p = offsetPoint(frame, d * (outer ? 1.1 : 1));
        vertices.push(p.x, p.y + h + (outer ? 0.55 : 0), p.z);
      }
      if (i < range.end) {
        const k = (i - range.start) * count;
        for (let j = 0; j < count - 1; j++) {
          const a = k + j,
            b = a + count;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const shell = new THREE.Mesh(geometry, outer ? tunnelRock : tunnelConcrete);
    shell.castShadow = true;
    shell.receiveShadow = true;
    scene.add(shell);
    if (!outer)
      world.createCollider(
        R.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)).setFriction(
          0.5,
        ),
      );
    return cross;
  }
  const portalLampMaterial = new THREE.MeshStandardMaterial({
    color: 0x85e4cf,
    emissive: 0x45c8af,
    emissiveIntensity: 1.6,
  });
  for (const range of tunnelRanges) {
    const cross = tunnelSurface(range);
    tunnelSurface(range, true);
    for (const index of [range.start, range.end]) {
      const frame = frames[index],
        points = cross.map(([d, h]) => {
          const p = offsetPoint(frame, d * 1.025);
          p.y += h + 0.08;
          return p;
        });
      const portal = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, 0.29, 6, false),
        tunnelRock,
      );
      portal.castShadow = true;
      scene.add(portal);
      for (const sign of [-1, 1]) {
        const p = offsetPoint(frame, sign * 6.55);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.16), portalLampMaterial);
        band.position.copy(p);
        band.position.y += 1.2;
        scene.add(band);
      }
      // El nombre del túnel aparece sobre el portal, fuera de la calzada.
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 1024;
      labelCanvas.height = 128;
      const lc = labelCanvas.getContext('2d');
      lc.fillStyle = '#17242a';
      lc.fillRect(0, 0, 1024, 128);
      lc.fillStyle = '#cbe9e3';
      lc.font = 'bold 47px Arial';
      lc.textAlign = 'center';
      lc.fillText(range.name.toUpperCase(), 512, 82);
      const tex = new THREE.CanvasTexture(labelCanvas);
      tex.encoding = THREE.sRGBEncoding;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 0.85),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
      );
      plate.position.copy(frame.p);
      plate.position.y += 6.25;
      plate.rotation.y = -Math.atan2(frame.tangent.z, frame.tangent.x) + Math.PI / 2;
      scene.add(plate);
    }
    let lastDistance = -100;
    for (let i = range.start; i <= range.end; i++) {
      const distance = ((i - range.start) / N) * trackLength;
      if (distance - lastDistance < 14) continue;
      lastDistance = distance;
      const frame = frames[i],
        p = offsetPoint(frame, 0);
      p.y += 5.27;
      tunnelLampPoints.push(p);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 2), tunnelGlow);
      lamp.position.copy(p);
      lamp.rotation.y = -Math.atan2(frame.tangent.z, frame.tangent.x);
      scene.add(lamp);
      for (const side of [-1, 1]) {
        const sideLamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.11, 0.08),
          portalLampMaterial,
        );
        sideLamp.position.copy(offsetPoint(frame, side * 6.4));
        sideLamp.position.y += 0.68;
        sideLamp.rotation.y = -Math.atan2(frame.tangent.z, frame.tangent.x);
        scene.add(sideLamp);
      }
    }
  }
  // Se reutilizan cuatro luces próximas al vehículo para controlar el coste de renderizado.
  const tunnelLightPool = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight(0xffcb8b, 0, 24, 2);
    scene.add(light);
    return light;
  });
  /** @param {THREE.Vector3} position */
  function updateTunnelLights(position) {
    const sorted = tunnelLampPoints
      .map((p) => ({ p, d: p.distanceToSquared(position) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < 4; i++) {
      const light = tunnelLightPool[i],
        entry = sorted[i];
      light.intensity = entry && entry.d < 36 * 36 ? 38 : 0;
      if (entry) light.position.copy(entry.p);
    }
  }

  const rig = new THREE.Group();
  scene.remove(car);
  rig.add(car);
  scene.add(rig);
  car.scale.setScalar(0.52);
  car.position.y = -0.48;
  // Shadows follow the vehicle while keeping a fixed sunlight direction.
  const sunOffset = vec(-26, 42, 19);

  // Cielo distante: la luna mantiene una dirección fija mientras el coche avanza.
  const sky = new THREE.Group();
  scene.add(sky);
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = moonCanvas.height = 256;
  const moonContext = moonCanvas.getContext('2d');
  moonContext.fillStyle = '#dce5ed';
  moonContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const x = random() * 256,
      y = random() * 256,
      r = 2 + random() * 18;
    const g = moonContext.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
    g.addColorStop(0, 'rgba(89,113,139,.28)');
    g.addColorStop(0.7, 'rgba(115,133,150,.15)');
    g.addColorStop(1, 'rgba(200,212,222,0)');
    moonContext.fillStyle = g;
    moonContext.beginPath();
    moonContext.arc(x, y, r, 0, Math.PI * 2);
    moonContext.fill();
  }
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.encoding = THREE.sRGBEncoding;
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(13, 40, 24),
    new THREE.MeshBasicMaterial({ map: moonTexture, color: 0xf1f3ff, fog: false }),
  );
  moon.position.set(300, 45, 75);
  sky.add(moon);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  const hc = haloCanvas.getContext('2d'),
    hg = hc.createRadialGradient(64, 64, 0, 64, 64, 64);
  hg.addColorStop(0, 'rgba(149,180,255,.22)');
  hg.addColorStop(0.3, 'rgba(122,155,220,.09)');
  hg.addColorStop(1, 'rgba(85,125,210,0)');
  hc.fillStyle = hg;
  hc.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(haloCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  halo.position.copy(moon.position);
  halo.scale.set(85, 85, 1);
  sky.add(halo);
  const starPositions = [];
  for (let i = 0; i < 700; i++) {
    const angle = random() * Math.PI * 2,
      elevation = 0.13 + random() * 1.35;
    starPositions.push(
      Math.cos(angle) * Math.cos(elevation) * 420,
      Math.sin(elevation) * 420,
      Math.sin(angle) * Math.cos(elevation) * 420,
    );
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  sky.add(
    new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0xc5d8ff,
        size: 1.2,
        sizeAttenuation: true,
        fog: false,
        transparent: true,
        opacity: 0.75,
      }),
    ),
  );
  // Faros físicos: dos conos de luz unidos al chasis apuntan sobre el asfalto.
  const headlamps = [],
    lampTargets = [];
  for (const sign of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xdcecff, 1400, 85, 0.26, 0.58, 2);
    lamp.position.set(2.35, 0.13, sign * 0.61);
    const target = new THREE.Object3D();
    target.position.set(38, -1.3, sign * 2.6);
    rig.add(lamp, target);
    lamp.target = target;
    lamp.castShadow = sign < 0;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.camera.near = 0.15;
    lamp.shadow.camera.far = 85;
    lamp.shadow.bias = -0.00035;
    lamp.shadow.normalBias = 0.015;
    headlamps.push(lamp);
    lampTargets.push(target);
  }
  const tailGlow = new THREE.PointLight(0xff2510, 0.85, 4.2, 2);
  tailGlow.position.set(-2.32, 0.03, 0);
  rig.add(tailGlow);
  // Balizas reflectantes discretas para que se lea el circuito a la luz de la luna.
  const reflectorMaterial = new THREE.MeshStandardMaterial({
    color: 0xd3e3eb,
    emissive: 0x7496c8,
    emissiveIntensity: 0.24,
    roughness: 0.35,
  });
  const reflectors = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.06, 0.14, 0.14),
    reflectorMaterial,
    railCount * 2,
  );
  let reflectorIndex = 0;
  for (let i = 0; i < railCount; i++) {
    const frame = frames[Math.floor((i / railCount) * N)];
    for (const side of [-1, 1]) {
      transform.position.copy(offsetPoint(frame, side * 7.05, 0.7));
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      reflectors.setMatrixAt(reflectorIndex++, transform.matrix);
    }
  }
  scene.add(reflectors);

  return {
    world,
    frames,
    N,
    trackLength,
    nearestTrack,
    offsetPoint,
    start,
    transform,
    rig,
    sky,
    headlamps,
    tailGlow,
    sunOffset,
    updateTunnelLights,
    tunnelForIndex,
    routeHeight,
    driveGroundHeight,
    tunnelRanges,
    terrain,
    terrainHeight,
    mountainStart: frames.findIndex((f) => f.p.x > 810 && f.p.z > 100),
  };
}
