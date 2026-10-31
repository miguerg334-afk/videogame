import * as THREE from 'three';

/** Fixed world-space cordilleras retain parallax while the sky follows the camera. */
export function addDistantRanges(scene: THREE.Scene) {
  const palette = [0x101d2c, 0x172739, 0x203247];
  for (let layer = 2; layer >= 0; layer--) {
    const vertices: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const segments = 360,
      rows = 12,
      radius = 2350 + layer * 1050;
    const base = new THREE.Color(palette[layer]).convertSRGBToLinear();
    const snow = new THREE.Color(0x52677e).convertSRGBToLinear();
    function ridge(angle: number) {
      const a = angle + layer * 1.73;
      const crags = Math.pow(Math.abs(Math.sin(a * 7.5 + Math.sin(a * 3) * 1.7)), 0.7);
      return (
        260 +
        layer * 150 +
        crags * (220 + layer * 75) +
        95 * Math.sin(a * 4 + 0.8) +
        40 * Math.sin(a * 19)
      );
    }
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Integer periodic frequencies close the seam, even for the distorted ridgeline.
      const peak = (ridge(angle) + ridge(angle + Math.PI * 2)) * 0.5;
      for (let j = 0; j <= rows; j++) {
        const t = j / rows;
        const r = radius + t * 850 + Math.sin(angle * 11 + layer) * 80;
        const profile = Math.pow(Math.sin(Math.PI * t), 0.8);
        const detail = Math.sin(angle * 51 + t * 17) * Math.sin(Math.PI * t) * 17;
        const y = -95 + profile * peak + detail;
        vertices.push(500 + Math.cos(angle) * r, y, -150 + Math.sin(angle) * r);
        const lighting =
          0.72 + 0.22 * Math.sin(angle * 9 + t * 6 + 0.8) + 0.12 * Math.sin(angle * 31 - t * 13);
        const c = base.clone().multiplyScalar(Math.max(0.48, lighting));
        const snowLine = y / Math.max(1, peak) + Math.sin(angle * 33 + t * 11) * 0.055;
        if (snowLine > 0.71) c.lerp(snow, Math.min(0.36, (snowLine - 0.71) * 1.6));
        // Valley haze separates successive mountain silhouettes.
        c.lerp(base, Math.max(0, 0.3 - profile) * 1.2);
        colors.push(c.r, c.g, c.b);
        if (i < segments && j < rows) {
          const a = i * (rows + 1) + j,
            b = a + rows + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }),
    );
    mesh.name = `distant-cordillera-${layer}`;
    scene.add(mesh);
  }
}

export function addNightSky(sky: THREE.Group) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7600, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0x030713).convertSRGBToLinear() },
        horizon: { value: new THREE.Color(0x172b43).convertSRGBToLinear() },
      },
      vertexShader:
        'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
      uniform vec3 zenith; uniform vec3 horizon; varying vec3 direction;
      void main(){
        float altitude=normalize(direction).y;
        float fade=pow(clamp(altitude,0.0,1.0),0.46);
        vec3 color=mix(horizon,zenith,fade);
        color+=vec3(0.001,0.002,0.003)*exp(-pow((altitude-0.06)*9.0,2.0));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
    }),
  );
  dome.name = 'night-sky-gradient';
  dome.renderOrder = -10;
  sky.add(dome);
}
