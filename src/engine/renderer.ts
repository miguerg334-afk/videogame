import * as THREE from 'three';
import { element } from '../ui/dom';
import { createAdaptiveQuality, renderRatioLimit } from './quality';

export function createRenderer() {
  const stage = element('stage'),
    scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050e);
  scene.fog = new THREE.FogExp2(0x14283d, 0.00065);
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
  });
  const quality = createAdaptiveQuality(
    renderRatioLimit(innerWidth, innerHeight, devicePixelRatio),
  );
  renderer.setPixelRatio(quality.ratio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 8500),
    vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  scene.add(new THREE.HemisphereLight(0x7593c7, 0x070c12, 0.24));
  const key = new THREE.DirectionalLight(0xadc9ff, 0.32);
  key.castShadow = true;
  key.shadow.mapSize.set(768, 768);
  Object.assign(key.shadow.camera, {
    left: -18,
    right: 18,
    top: 18,
    bottom: -18,
    near: 1,
    far: 110,
  });
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0002;
  scene.add(key);
  scene.add(key.target);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x101b32);
  const soft = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 20),
    new THREE.MeshBasicMaterial({ color: 0x6f85b1, side: THREE.DoubleSide }),
  );
  soft.position.set(0, 25, 0);
  soft.rotation.x = Math.PI / 2;
  envScene.add(soft);
  const generator = new THREE.PMREMGenerator(renderer),
    environment = generator.fromScene(envScene, 0.03);
  scene.environment = environment.texture;
  generator.dispose();
  soft.geometry.dispose();
  soft.material.dispose();
  return { stage, scene, renderer, camera, vec, key, environment, quality };
}
