import * as THREE from 'three';

/** Locally generated aggregate, rubber wear and bitumen; no texture downloads. */
export function createRoadMaterials(document: Document) {
  let seed = 71129;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function canvas(size: number) {
    const result = document.createElement('canvas');
    result.width = result.height = size;
    const context = result.getContext('2d');
    if (!context) throw new Error('No se pudo crear la textura de la carretera.');
    return { result, context };
  }
  const size = 512;
  const diffuse = canvas(size),
    relief = canvas(size),
    gravel = canvas(128);
  const color = diffuse.context.createImageData(size, size);
  const height = relief.context.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const aggregate = random(),
        grain = random();
      const wear = [0.165, 0.335, 0.665, 0.835].reduce(
        (sum, track) => sum + Math.exp(-Math.pow((x / size - track) / 0.027, 2)),
        0,
      );
      const stone = aggregate > 0.967 ? 25 + grain * 30 : aggregate < 0.04 ? -18 : 0;
      const value = Math.round(76 + grain * 23 + stone - wear * 8 + Math.sin(y / 36) * 1.5);
      color.data.set([value, value + 1, value + 2, 255], i);
      const bump = Math.round(90 + grain * 55 + (aggregate > 0.967 ? 65 : 0));
      height.data.set([bump, bump, bump, 255], i);
    }
  diffuse.context.putImageData(color, 0, 0);
  relief.context.putImageData(height, 0, 0);
  const asphaltMap = new THREE.CanvasTexture(diffuse.result);
  asphaltMap.encoding = THREE.sRGBEncoding;
  const bumpMap = new THREE.CanvasTexture(relief.result);
  for (const texture of [asphaltMap, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  const shoulderPixels = gravel.context.createImageData(128, 128);
  for (let i = 0; i < shoulderPixels.data.length; i += 4) {
    const value = Math.round(95 + random() * 65);
    shoulderPixels.data.set([value, value - 6, value - 13, 255], i);
  }
  gravel.context.putImageData(shoulderPixels, 0, 0);
  const shoulderMap = new THREE.CanvasTexture(gravel.result);
  shoulderMap.encoding = THREE.sRGBEncoding;
  shoulderMap.wrapS = shoulderMap.wrapT = THREE.RepeatWrapping;
  shoulderMap.anisotropy = 4;
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: asphaltMap,
    bumpMap,
    bumpScale: 0.012,
    roughness: 0.91,
    metalness: 0.015,
    envMapIntensity: 0.22,
  });
  const shoulder = new THREE.MeshStandardMaterial({
    color: 0xc5c0af,
    map: shoulderMap,
    roughness: 1,
    envMapIntensity: 0.2,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a918d).convertSRGBToLinear(),
    bumpMap,
    bumpScale: 0.016,
    roughness: 0.9,
    envMapIntensity: 0.25,
  });
  return {
    asphalt,
    shoulder,
    concrete,
    setLength(length: number) {
      for (const texture of [asphaltMap, bumpMap]) texture.repeat.set(1, length / 18);
      shoulderMap.repeat.set(10, length / 3);
    },
  };
}
