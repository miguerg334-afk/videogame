import * as THREE from 'three';

/** Four crossed flame sheets: no textures, lights, particles or physics bodies. */
export function createExhaustFlames(car: THREE.Group) {
  const group = new THREE.Group();
  group.name = 'exhaust-flames';
  group.visible = false;
  car.add(group);
  const uniforms = { time: { value: 0 }, intensity: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      varying vec2 flameUV;
      void main() {
        flameUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      varying vec2 flameUV;
      void main() {
        float t = 1.0 - flameUV.x;
        float flicker = sin(t * 29.0 - time * 43.0) * 0.08
                      + sin(t * 57.0 - time * 67.0) * 0.035;
        float width = (0.16 + 0.68 * sin(t * 3.14159)) * pow(1.0 - t, 0.6);
        float centre = sin(t * 17.0 - time * 31.0) * t * 0.075;
        float edge = abs((flameUV.y - 0.5) * 2.0 - centre);
        float outer = max(0.02, width + flicker);
        float alpha = 1.0 - smoothstep(max(0.0, outer - 0.2), outer, edge);
        float core = 1.0 - smoothstep(0.0, max(0.01, width * 0.6), edge);
        vec3 colour = mix(vec3(0.15, 0.45, 1.0), vec3(1.0, 0.34, 0.025), smoothstep(0.08, 0.55, t));
        colour = mix(colour, vec3(1.0, 0.9, 0.55), core * (1.0 - smoothstep(0.18, 0.8, t)));
        alpha *= (1.0 - smoothstep(0.75, 1.0, t)) * intensity * 0.85;
        gl_FragColor = vec4(colour * 1.8, alpha);
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(3, 0.68, 1, 1);
  // The model faces +X; the two exhaust openings face -X.
  geometry.translate(-1.5, 0, 0);
  const jets: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const jet = new THREE.Group();
    jet.position.set(-4.44, 0.65, sign * 1.18);
    group.add(jet);
    jets.push(jet);
    for (const angle of [0, Math.PI / 2]) {
      const sheet = new THREE.Mesh(geometry, material);
      sheet.rotation.x = angle;
      jet.add(sheet);
    }
  }
  let strength = 0;
  function update(dt: number, time: number, active: boolean, throttle: number, speed: number) {
    const target = active && speed > 15 && throttle > 0.65 ? Math.min(0.65, throttle) : 0;
    strength += (target - strength) * (1 - Math.exp(-Math.max(0, dt) * 18));
    // Ending an acceleration burst or resetting extinguishes the jets.
    if (!active) strength = 0;
    group.visible = strength > 0.01;
    uniforms.time.value = time;
    uniforms.intensity.value = strength;
    for (let i = 0; i < jets.length; i++) {
      const pulse = 0.9 + Math.sin(time * 39 + i * 2.1) * 0.09 + Math.sin(time * 61 + i) * 0.05;
      jets[i].scale.set(
        (0.35 + strength * 0.65) * pulse,
        0.8 + strength * 0.2,
        0.8 + strength * 0.2,
      );
    }
  }
  return { group, update };
}
