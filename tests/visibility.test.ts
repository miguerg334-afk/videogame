import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { tileSurface, tileInstances, addForestLOD, addTerrainLOD } from '../src/world/visibility';
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
  const stalled = createAdaptiveQuality(cap);
  for (let i = 0; i < 12; i++) stalled.sample(0.4);
  assert(stalled.ratio < cap, 'los tirones de más de 250 ms también reducen la carga');
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

test('el terreno lejano reduce triángulos sin cambiar las alturas ni abrir bordes entre niveles', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.PlaneGeometry(800, 800, 80, 80);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      Math.sin(positions.getX(i) / 80) * 12 + Math.cos(positions.getZ(i) / 100) * 8,
    );
  geometry.computeVertexNormals();
  const tiles = tileSurface(scene, new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()), 200);
  const counts = addTerrainLOD(scene, tiles);
  assert(counts.farTriangles < counts.nearTriangles * 0.45);
  for (const root of scene.children) {
    const lod = root as THREE.LOD;
    if (!lod.isLOD) continue;
    const high = lod.levels[0].object as THREE.Mesh,
      low = lod.levels[1].object as THREE.Mesh;
    assert.equal(
      high.geometry.getAttribute('position'),
      low.geometry.getAttribute('position'),
      'se reutilizan los mismos vértices, alturas y normales',
    );
    const p = high.geometry.getAttribute('position'),
      used = new Set(Array.from(low.geometry.index!.array));
    const xs = Array.from({ length: p.count }, (_, i) => p.getX(i)),
      zs = Array.from({ length: p.count }, (_, i) => p.getZ(i));
    const xmin = Math.min(...xs),
      xmax = Math.max(...xs),
      zmin = Math.min(...zs),
      zmax = Math.max(...zs);
    for (let i = 0; i < p.count; i++)
      if (p.getX(i) === xmin || p.getX(i) === xmax || p.getZ(i) === zmin || p.getZ(i) === zmax)
        assert(used.has(i), 'cada vértice del borde coincide con el nivel detallado vecino');
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(lod.position);
    camera.updateMatrixWorld();
    lod.update(camera);
    assert(high.visible && !low.visible);
    camera.position.x += 900;
    camera.updateMatrixWorld();
    lod.update(camera);
    assert(!high.visible && low.visible);
  }
});

test('las marcas de carretera conservan sus posiciones y se descartan por sectores con límites completos', () => {
  const scene = new THREE.Scene();
  const source = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3, 0.02, 0.1),
    new THREE.MeshLambertMaterial(),
    10,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 10; i++) source.setMatrixAt(i, matrix.makeTranslation(i * 200, i * 20, 10));
  const cells = tileInstances(scene, source, 400);
  assert.equal(
    cells.reduce((sum, cell) => sum + cell.count, 0),
    10,
  );
  const positions: number[] = [];
  for (const cell of cells) {
    assert(cell.frustumCulled);
    for (let i = 0; i < cell.count; i++) {
      cell.getMatrixAt(i, matrix);
      positions.push(matrix.elements[12] + cell.position.x);
      const p = new THREE.Vector3().setFromMatrixPosition(matrix);
      assert(p.length() + 1.5 <= cell.geometry.boundingSphere!.radius + 0.01);
    }
  }
  assert.deepEqual(
    positions.sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, i) => i * 200),
  );
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  camera.position.set(0, 10, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  assert(
    cells.filter((c) => frustum.intersectsObject(c)).length < cells.length,
    'no envía las instancias de todo el circuito',
  );
  for (const c of cells) c.geometry.dispose();
  (source.material as THREE.Material).dispose();
});
