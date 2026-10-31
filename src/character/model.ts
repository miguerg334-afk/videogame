import * as THREE from 'three';
import {
  addRetroFace,
  addRetroBelly,
  addRetroGlove,
  addRetroShoe,
  createAngularQuill,
} from './low-poly';

/** Procedural, articulated Sonic: geometry only, no external model downloads. */
export function createCharacterModel(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'sonic-character';
  const visual = new THREE.Group();
  visual.rotation.y = Math.PI / 2; // +Z model front -> +X world heading.
  root.add(visual);
  scene.add(root);
  const material = (color: number, roughness = 0.55) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).convertSRGBToLinear(),
      roughness,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 0.2,
    });
  const blue = material(0x2422eb, 0.88),
    peach = material(0xe6ba64, 0.9),
    white = material(0xf4f3ed, 0.92),
    red = material(0xea1023, 0.87),
    sole = material(0xe1ded3, 0.7),
    gold = material(0xf2c433, 0.3),
    black = material(0x020205, 1);
  blue.emissive.setHex(0x021238);
  blue.emissiveIntensity = 0.08;
  const sphere = new THREE.SphereGeometry(1, 10, 6),
    headGeometry = new THREE.SphereGeometry(1, 16, 12),
    bodyGeometry = new THREE.SphereGeometry(1, 10, 8),
    cylinder = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  const palette = { blue, peach, white, red, sole, gold, black };
  function ellipsoid(
    parent: THREE.Object3D,
    mat: THREE.Material,
    p: number[],
    s: number[],
    name = '',
  ) {
    const mesh = new THREE.Mesh(
      name === 'head' ? headGeometry : name === 'body' ? bodyGeometry : sphere,
      mat,
    );
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.set(s[0], s[1], s[2]);
    mesh.name = name;
    mesh.castShadow = ['head', 'body', 'muzzle', 'knee'].includes(name);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function link(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    mesh.scale.set(radius, a.distanceTo(b), radius);
  }
  function rod(parent: THREE.Object3D, mat: THREE.Material, name = '') {
    const mesh = new THREE.Mesh(cylinder, mat);
    mesh.name = name;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function quill(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, name: string) {
    const mesh = new THREE.Mesh(createAngularQuill(points, radius), blue);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  const torso = new THREE.Group();
  torso.position.y = 1.22;
  visual.add(torso);
  ellipsoid(torso, blue, [0, 0.18, 0], [0.278, 0.46, 0.25], 'body');
  addRetroBelly(torso, palette);
  const head = new THREE.Group();
  head.position.set(0, 0.99, 0);
  torso.add(head);
  ellipsoid(head, blue, [0, 0, 0], [0.62, 0.63, 0.44], 'head');
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  quill(
    head,
    [v(0, 0.25, -0.12), v(0, 0.42, -0.5), v(0, 0.6, -0.87), v(0, 0.78, -1.18)],
    0.36,
    'quill-top',
  );
  for (const side of [-1, 1]) {
    quill(
      head,
      [
        v(side * 0.3, 0.14, -0.07),
        v(side * 0.58, 0.19, -0.39),
        v(side * 0.77, 0.04, -0.7),
        v(side * 0.93, 0.22, -1.05),
      ],
      0.37,
      'quill-upper',
    );
    quill(
      head,
      [
        v(side * 0.31, -0.12, -0.1),
        v(side * 0.46, -0.35, -0.4),
        v(side * 0.54, -0.66, -0.62),
        v(side * 0.78, -0.52, -0.98),
      ],
      0.34,
      'quill-lower',
    );
  }
  quill(
    head,
    [v(0, -0.1, -0.25), v(0, -0.31, -0.63), v(0, -0.64, -0.78), v(0, -0.92, -0.8)],
    0.33,
    'quill-center',
  );
  addRetroFace(head, palette);
  quill(torso, [v(0, -0.1, -0.18), v(0, -0.26, -0.35), v(0, -0.36, -0.55)], 0.12, 'tail');
  for (const side of [-1, 1])
    quill(
      torso,
      [v(side * 0.1, 0.35, -0.2), v(side * 0.18, 0.15, -0.34), v(side * 0.21, -0.02, -0.4)],
      0.14,
      'back-fur',
    );

  const arms = [-1, 1].map((side) => {
    const upper = rod(torso, peach, 'upper-arm'),
      lower = rod(torso, peach, 'forearm'),
      hand = new THREE.Group();
    torso.add(hand);
    const { fingers } = addRetroGlove(hand, side, palette);
    return { side, upper, lower, hand, fingers };
  });
  const legs = [-1, 1].map((side) => {
    const upper = rod(visual, blue, 'upper-leg'),
      lower = rod(visual, blue, 'shin'),
      knee = ellipsoid(visual, blue, [0, 0, 0], [0.057, 0.057, 0.057], 'knee');
    const foot = new THREE.Group();
    visual.add(foot);
    foot.scale.x = 0.85;
    addRetroShoe(foot, side, palette);
    return { side, upper, lower, knee, foot };
  });
  const fillLight = new THREE.PointLight(0xc0d6ff, 7, 12, 2);
  fillLight.position.set(2, 3, 2);
  root.add(fillLight);
  const aura = new THREE.Group();
  visual.add(aura);
  const streakMaterial = new THREE.MeshBasicMaterial({
    color: 0x60c9ff,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  for (let i = 0; i < 9; i++) {
    const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.025, 1, 5), streakMaterial);
    streak.rotation.x = Math.PI / 2;
    streak.position.set(Math.sin(i * 2.4) * 0.7, 0.45 + (i % 4) * 0.42, -1.1 - i * 0.09);
    streak.scale.y = 0.6 + (i % 3) * 0.25;
    aura.add(streak);
  }
  let phase = 0,
    time = 0;
  function animate(dt: number, speed: number, grounded: boolean, turn: number, boost: boolean) {
    time += dt;
    const pace = Math.abs(speed),
      motion = THREE.MathUtils.smoothstep(pace, 0.1, 3),
      run = THREE.MathUtils.smoothstep(pace, 3, 15);
    phase += dt * (2.5 + Math.min(13, pace * 0.5)) * motion;
    const lean = motion * (0.06 + run * 0.34);
    torso.rotation.x = lean;
    torso.rotation.z = -turn * 0.12;
    torso.position.y =
      1.22 + Math.sin(phase * 2) * 0.045 * motion + (1 - motion) * Math.sin(time * 2) * 0.012;
    head.rotation.x = -lean * 0.5;
    head.rotation.y = -turn * 0.1;
    for (const leg of legs) {
      const p = phase + (leg.side === 1 ? Math.PI : 0),
        stride = (0.22 + run * 0.41) * motion;
      const hip = v(leg.side * 0.18, 1.16, 0);
      const foot = v(
        leg.side * 0.245,
        0.02 + Math.max(0, Math.cos(p)) * (0.14 + run * 0.36) * motion,
        Math.sin(p) * stride,
      );
      if (!grounded) {
        foot.y = 0.46;
        foot.z = leg.side * 0.2;
      }
      const ankle = foot.clone().add(v(0, 0.34, -0.12)),
        delta = ankle.clone().sub(hip),
        d = Math.min(1.23, delta.length()),
        legLength = 0.415 + run * 0.13,
        bend = Math.sqrt(Math.max(0.002, legLength * legLength - d * d * 0.25));
      const joint = hip.clone().addScaledVector(delta, 0.5);
      joint.y += (delta.z / Math.max(0.01, delta.length())) * bend;
      joint.z -= (delta.y / Math.max(0.01, delta.length())) * bend;
      link(leg.upper, hip, joint, 0.055);
      link(leg.lower, joint, ankle, 0.051);
      leg.knee.position.copy(joint);
      leg.foot.position.copy(foot);
      leg.foot.rotation.x = grounded ? Math.sin(p) * 0.14 * motion : -0.25;
    }
    for (const arm of arms) {
      const p = phase + (arm.side === 1 ? 0 : Math.PI),
        swing = Math.sin(p) * motion;
      const shoulder = v(arm.side * 0.3, 0.43, 0),
        elbow = v(
          arm.side * (0.43 + run * 0.08),
          0.12 + swing * 0.16,
          -swing * (0.17 + run * 0.25) - run * 0.16,
        );
      const wrist = v(
        arm.side * (0.44 + run * 0.13),
        -0.12 + swing * 0.26,
        -swing * (0.28 + run * 0.32) - run * 0.23,
      );
      if (!grounded) {
        elbow.y = 0.25;
        wrist.y = 0.13;
        wrist.z = -0.25;
      }
      link(arm.upper, shoulder, elbow, 0.058);
      link(arm.lower, elbow, wrist, 0.052);
      arm.hand.position.copy(wrist);
      arm.hand.rotation.x = -swing * 0.5 - run * 0.35;
      for (const finger of arm.fingers) finger.rotation.x = -(0.18 + run * 0.95);
    }
    aura.visible = boost && pace > 20;
    aura.rotation.z = Math.sin(time * 5) * 0.04;
  }
  animate(0, 0, true, 0, false);
  return { root, animate, fillLight };
}
