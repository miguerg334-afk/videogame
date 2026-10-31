import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { tileSurface, addForestLOD } from '../src/world/visibility';
import { createAdaptiveQuality, renderRatioLimit } from '../src/engine/quality';

test('los sectores conservan cada triángulo del terreno y sus atributos', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.PlaneGeometry(1200, 1200, 24, 24);
  geometry.rotateX(-Math.PI / 2);
  const source = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const tiles = tileSurface(scene, source, 200);
  const triangles = (g: THREE.BufferGeometry) => {
    const p = g.getAttribute('position'),
      uv = g.getAttribute('uv'),
      result: string[] = [];
    for (let i = 0; i < g.index!.count; i += 3) {
      const values: number[] = [];
      for (let j = 0; j < 3; j++) {
        const n = g.index!.getX(i + j);
        values.push(p.getX(n), p.getY(n), p.getZ(n), uv.getX(n), uv.getY(n));
      }
      result.push(values.join(','));
    }
    return result;
  };
  assert(tiles.length > 4);
  assert.deepEqual(
    tiles.flatMap((tile) => triangles(tile.geometry)).sort(),
    triangles(geometry).sort(),
  );
  assert(tiles.every((tile) => tile.geometry.boundingSphere && tile.frustumCulled));
  const tile = tiles[0],
    center = tile.geometry.boundingSphere!.center;
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2000);
  camera.position.copy(center).add(new THREE.Vector3(0, 100, 200));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  frustum.setFromProjectionMatrix(
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  assert(frustum.intersectsObject(tile));
  camera.rotateY(Math.PI);
  camera.updateMatrixWorld(true);
  frustum.setFromProjectionMatrix(
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  assert(!frustum.intersectsObject(tile), 'al mirar al otro lado el sector queda fuera de cámara');
});

test('el bosque conserva instancias cercanas, usa siluetas lejanas y límites de culling seguros', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.ConeGeometry(1, 8, 6);
  const source = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 3);
  source.name = 'forest-foliage';
  const matrix = new THREE.Matrix4(),
    positions = [
      { x: 0, y: 0, z: 0, h: 8 },
      { x: 25, y: 5, z: 15, h: 8 },
      { x: 700, y: 20, z: 0, h: 8 },
    ];
  positions.forEach((p, i) => source.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)));
  addForestLOD(scene, [source], positions);
  scene.updateMatrixWorld(true);
  const lods = scene.children as THREE.LOD[];
  let count = 0;
  for (const lod of lods) {
    const near = lod.levels[0].object.children[0] as THREE.InstancedMesh;
    count += near.count;
    for (let i = 0; i < near.count; i++) {
      near.getMatrixAt(i, matrix);
      const center = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert(near.geometry.boundingSphere!.radius >= center.length() + 4);
    }
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(lod.position);
    camera.updateMatrixWorld();
    lod.update(camera);
    assert(lod.levels[0].object.visible);
    camera.position.x += 500;
    camera.updateMatrixWorld();
    lod.update(camera);
    assert(!lod.levels[0].object.visible && lod.levels[1].object.visible);
    camera.position.x += 1600;
    camera.updateMatrixWorld();
    lod.update(camera);
    assert(lod.levels[2].object.visible);
  }
  assert.equal(count, 3);
});

test('resolución adaptativa: limita píxeles, reacciona a 14 FPS y respeta el tamaño de ventana', () => {
  const cap = renderRatioLimit(1920, 1080, 2),
    quality = createAdaptiveQuality(cap);
  assert(1920 * 1080 * quality.ratio ** 2 <= 960 * 600 + 1);
  for (let i = 0; i < 60; i++) quality.sample(1 / 14);
  assert(
    Math.abs(quality.ratio - cap * 0.6) < 0.001,
    'reduce la carga rápidamente cuando los FPS son muy bajos',
  );
  for (let i = 0; i < 2000; i++) quality.sample(1 / 90);
  assert(quality.ratio > cap * 0.6 && quality.ratio <= cap);
  quality.reset();
  const ratio = quality.ratio;
  quality.sample(5);
  assert.equal(quality.ratio, ratio, 'volver de otra pestaña no altera calidad');
  quality.resize(renderRatioLimit(3840, 2160, 2));
  assert(
    3840 * 2160 * quality.ratio ** 2 <= 960 * 600 + 1,
    'el redimensionado conserva el presupuesto',
  );
});
