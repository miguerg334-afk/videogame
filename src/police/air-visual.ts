import * as THREE from 'three';
import { createHelicopter } from './helicopter-model.js';
import { AIR_BEAM_RADIUS, type createAirPursuit } from './air-pursuit';

/** The spotlight is a small unlit terrain decal and translucent cone, with no extra dynamic light. */
export function createAirVisual(
  scene: THREE.Scene,
  document: Document,
  ground: (x: number, z: number) => number,
) {
  const model = createHelicopter(document);
  const group = new THREE.Group();
  group.name = 'police-helicopter';
  group.visible = false;
  group.add(model.root);
  model.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xeef5ff,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.name = 'helicopter-light-cone';
  const count = 24,
    rings = 2,
    positions = [0, 0, 0],
    uv = [0.5, 0.5],
    indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2,
        r = ring / rings;
      positions.push(
        Math.cos(angle) * r * AIR_BEAM_RADIUS,
        0,
        Math.sin(angle) * r * AIR_BEAM_RADIUS,
      );
      uv.push(0.5 + Math.cos(angle) * r * 0.5, 0.5 + Math.sin(angle) * r * 0.5);
    }
  for (let i = 0; i < count; i++) indices.push(0, 1 + ((i + 1) % count), 1 + i);
  for (let i = 0; i < count; i++) {
    const a = 1 + i,
      b = 1 + ((i + 1) % count),
      c = 1 + count + i,
      d = 1 + count + ((i + 1) % count);
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const disc = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      vertexShader:
        'varying vec2 beamUV; void main(){beamUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:
        'varying vec2 beamUV;void main(){float r=length(beamUV*2.0-1.0);float edge=1.0-smoothstep(.88,1.0,r);gl_FragColor=vec4(vec3(1.0),edge*(.22+.18*(1.0-r*r)));}',
    }),
  );
  disc.name = 'helicopter-white-circle';
  disc.renderOrder = 2;
  const effects = new THREE.Group();
  effects.name = 'helicopter-searchlight';
  effects.visible = false;
  effects.add(beam, disc);
  scene.add(group, effects);
  let refresh = 0;
  return {
    group,
    effects,
    reset() {
      group.visible = effects.visible = false;
      refresh = 0;
    },
    update(air: ReturnType<typeof createAirPursuit>, dt: number, time: number) {
      group.visible = effects.visible = air.active;
      if (!air.active) return;
      const p = air.position,
        b = air.beam;
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = air.yaw;
      model.update(dt, 320, time);
      const floor = ground(b.x, b.z) + 0.08,
        height = Math.max(1, p.y + 0.4 - floor);
      beam.position.set(b.x, floor + height / 2, b.z);
      beam.scale.set(AIR_BEAM_RADIUS, height, AIR_BEAM_RADIUS);
      disc.position.set(b.x, floor, b.z);
      refresh -= dt;
      if (refresh <= 0) {
        refresh = 0.1;
        const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < attr.count; i++)
          attr.setY(i, ground(b.x + attr.getX(i), b.z + attr.getZ(i)) + 0.08 - floor);
        attr.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
    },
  };
}
