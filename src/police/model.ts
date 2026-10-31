import * as THREE from 'three';
import type { createVehicleModel } from '../vehicle/model.js';

/** Clone the optimised sports car; share its geometry, keep paint and LEDs independent. */
export function createPoliceModel(
  source: ReturnType<typeof createVehicleModel>,
  document: Document,
) {
  const rig = new THREE.Group();
  rig.name = 'police-rig';
  const car = source.car.clone(true);
  car.name = 'police-car';
  rig.add(car);
  const originals: THREE.Object3D[] = [],
    copies: THREE.Object3D[] = [];
  source.car.traverse((o) => originals.push(o));
  car.traverse((o) => copies.push(o));
  const lookup = new Map(originals.map((o, i) => [o, copies[i]]));
  const paint = source.paint.clone();
  paint.color.set(0x091522).convertSRGBToLinear();
  paint.roughness = 0.32;
  const white = source.whiteLED.clone();
  white.emissiveIntensity = 4;
  const red = source.redLED.clone();
  red.emissiveIntensity = 1.8;
  const replace = (m: THREE.Material) =>
    m === source.paint ? paint : m === source.whiteLED ? white : m === source.redLED ? red : m;
  car.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map(replace) : replace(o.material);
    // Reuse the mesh detail without adding another car to both shadow passes.
    o.castShadow = false;
  });
  const wheels = source.wheelAssemblies.map((w) => ({
    pivot: lookup.get(w.pivot)!,
    roll: lookup.get(w.roll)!,
  }));
  for (const w of wheels) w.pivot.position.y = (0.66 - 0.32) / 0.52;
  const ivory = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xe8edf2).convertSRGBToLinear(),
    roughness: 0.38,
    metalness: 0.25,
  });
  const black = new THREE.MeshStandardMaterial({ color: 0x060b13, roughness: 0.6 });
  function box(size: number[], p: number[], material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(p[0], p[1], p[2]);
    car.add(mesh);
    return mesh;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8edf2';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#07111e';
  ctx.font = 'bold 66px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('POLICÍA', 256, 86);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  const decal = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  for (const sign of [-1, 1]) {
    box([2.65, 0.65, 0.025], [-0.12, 1.02, sign * 1.8], ivory);
    const lettering = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.56), decal);
    lettering.position.set(-0.12, 1.02, sign * 1.82);
    lettering.rotation.y = sign > 0 ? 0 : Math.PI;
    car.add(lettering);
  }
  box([0.65, 0.12, 2.05], [-0.25, 2.4, 0], black);
  const redBeacon = new THREE.MeshBasicMaterial({ color: 0xff203c, toneMapped: false });
  const blueBeacon = new THREE.MeshBasicMaterial({ color: 0x2488ff, toneMapped: false });
  box([0.52, 0.22, 0.83], [-0.25, 2.55, -0.5], redBeacon);
  box([0.52, 0.22, 0.83], [-0.25, 2.55, 0.5], blueBeacon);
  let wheelAngle = 0;
  function update(time: number, speed: number, dt: number) {
    const flash = Math.floor(time * 8) % 2 === 0;
    redBeacon.color.setHex(flash ? 0xff3851 : 0x410816).multiplyScalar(flash ? 2.4 : 1);
    blueBeacon.color.setHex(flash ? 0x071b43 : 0x379dff).multiplyScalar(flash ? 1 : 2.4);
    wheelAngle -= (speed * dt) / 0.41184;
    for (const wheel of wheels) wheel.roll.rotation.z = wheelAngle;
  }
  return { rig, car, paint, wheels, redBeacon, blueBeacon, update };
}
