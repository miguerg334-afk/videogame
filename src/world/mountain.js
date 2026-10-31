import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat/rapier.es.js';
import { routeAnchors, routeHeight, createRouteLookup } from './route';
import { createTerrainHeight, createTerrain } from './terrain';
import { addDistantRanges, addNightSky } from './background';
import { createTrailNetwork, buildMountainTrails } from './trails';
import { createForest } from './forest';
import { createWorldBoundary } from './boundary';
import { createRoadMaterials } from './road-materials';
import { createIBeamGeometry, addRoadDetails, detailGantry } from './infrastructure';

/**
 * Build terrain, road colliders and night lighting.
 * @param {THREE.Scene} scene
 * @param {THREE.Group} car
 * @param {Document} document
 */
export function createMountainWorld(scene, car, document) {
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);
  // Ruta de montaña ampliada: rectas y pendientes continuas a cielo abierto.
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
  const roadMaterials = createRoadMaterials(document);
  const { asphalt, shoulder: gravel } = roadMaterials;
  const grass = material(0x758b57),
    stripe = material(0xe7e5d4),
    railMat = material(0xb5bfc0, 0.5),
    postMat = material(0x545f5d);
  railMat.metalness = 0.72;
  railMat.roughness = 0.43;
  railMat.envMapIntensity = 0.6;
  stripe.roughness = 0.62;
  stripe.envMapIntensity = 0.4;
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
  const trailNetwork = createTrailNetwork(nearestTrack);
  const terrainHeight = createTerrainHeight(nearestTrack, trailNetwork);
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
  addDistantRanges(scene);
  roadMaterials.setLength(trackLength);
  function ribbon(a, b, mat, lift = 0, collider = false, curb = false) {
    const v = [],
      uv = [],
      indices = [],
      colors = [];
    for (let i = 0; i <= N; i++) {
      for (const d of [a, b]) {
        const p = offsetPoint(frames[i], d, lift);
        v.push(p.x, p.y, p.z);
        uv.push((d + 5) / 10, i / N);
        if (curb) {
          const c = new THREE.Color(
            Math.floor(i / 4) % 2 ? 0xa6aaa0 : 0x8c948d,
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
        R.ColliderDesc.trimesh(
          new Float32Array(v),
          new Uint32Array(indices),
          R.TriMeshFlags.FIX_INTERNAL_EDGES,
        ).setFriction(1),
      );
    return m;
  }
  ribbon(-24, 24, grass, -0.15, true);
  ribbon(-6.4, 6.4, gravel, -0.035);
  ribbon(-5, 5, asphalt, 0, true);
  ribbon(-4.83, -4.72, stripe, 0.012);
  ribbon(4.72, 4.83, stripe, 0.012);
  const curbMat = roadMaterials.concrete;
  curbMat.color.set(0xffffff);
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
  // Both verges remain open for mountain exploration.
  addRoadDetails(scene, frames, offsetPoint, trackLength);
  buildMountainTrails(scene, world, trailNetwork, document);
  const forest = createForest(scene, world, document, terrainHeight, nearestTrack, trailNetwork);
  forest.updateColliders(frames[0].p);
  const boundary = createWorldBoundary(scene, world, terrainHeight);
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
    const m = new THREE.Mesh(createIBeamGeometry(0.3, 5, 0.3, 0.035, 0.05), railMat);
    m.position.set(0, 2.5, z);
    gantry.add(m);
  }
  const beam = new THREE.Mesh(createIBeamGeometry(0.32, 12.8, 0.65, 0.045, 0.065), railMat);
  beam.rotation.x = Math.PI / 2;
  beam.position.y = 4.8;
  gantry.add(beam);
  detailGantry(gantry);
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
  addNightSky(sky);
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
    new THREE.SphereGeometry(38, 48, 32),
    new THREE.MeshBasicMaterial({ map: moonTexture, color: 0xf1f3ff, fog: false }),
  );
  moon.position.set(1900, 580, -280);
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
  halo.scale.set(205, 205, 1);
  sky.add(halo);
  const starPositions = [];
  for (let i = 0; i < 700; i++) {
    const angle = random() * Math.PI * 2,
      elevation = 0.13 + random() * 1.35;
    starPositions.push(
      Math.cos(angle) * Math.cos(elevation) * 6100,
      Math.sin(elevation) * 6100,
      Math.sin(angle) * Math.cos(elevation) * 6100,
    );
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  sky.add(
    new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: 0xc5d8ff,
        size: 7,
        sizeAttenuation: true,
        fog: false,
        transparent: true,
        opacity: 0.63,
      }),
    ),
  );
  // One broad beam illuminates the road; both visible headlight meshes remain on the car.
  const headlamps = [];
  const lamp = new THREE.SpotLight(0xdcecff, 2400, 85, 0.3, 0.62, 2);
  lamp.position.set(2.35, 0.13, 0);
  const target = new THREE.Object3D();
  target.position.set(38, -1.3, 0);
  rig.add(lamp, target);
  lamp.target = target;
  headlamps.push(lamp);
  const tailGlow = new THREE.PointLight(0xff2510, 0.85, 4.2, 2);
  tailGlow.position.set(-2.32, 0.03, 0);
  rig.add(tailGlow);
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
    routeHeight,
    driveGroundHeight,
    terrain,
    terrainHeight,
    trailNetwork,
    forest,
    boundary,
  };
}
