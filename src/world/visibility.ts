import * as THREE from 'three';

/** Split a continuous surface without removing or moving any triangle. */
export function tileSurface(scene: THREE.Scene, source: THREE.Mesh, size = 400) {
  const geometry = source.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute('position'),
    index = geometry.index!;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a, b, c);
  }
  const tiles: THREE.Mesh[] = [];
  for (const triangles of buckets.values()) {
    const remap = new Map<number, number>(),
      indices: number[] = [];
    const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name,
      attribute,
      values: [] as number[],
    }));
    for (const original of triangles) {
      if (!remap.has(original)) {
        remap.set(original, remap.size);
        for (const { attribute, values } of attributes)
          for (let component = 0; component < attribute.itemSize; component++)
            values.push(attribute.array[original * attribute.itemSize + component]);
      }
      indices.push(remap.get(original)!);
    }
    const part = new THREE.BufferGeometry();
    for (const { name, attribute, values } of attributes)
      part.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
    part.setIndex(indices);
    part.computeBoundingSphere();
    const mesh = new THREE.Mesh(part, source.material);
    mesh.name = source.name + '-tile';
    mesh.receiveShadow = source.receiveShadow;
    mesh.castShadow = source.castShadow;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    tiles.push(mesh);
  }
  source.visible = false;
  return tiles;
}

/** Each forest cell has detailed nearby trees and cheap silhouettes at distance. */
export function addForestLOD(
  scene: THREE.Scene,
  sources: THREE.InstancedMesh[],
  positions: { x: number; y: number; z: number; h: number }[],
) {
  const cells = new Map<string, { x: number; z: number; trees: typeof positions }>();
  const cellKey = (x: number, z: number) => `${Math.floor(x / 240)},${Math.floor(z / 240)}`;
  for (const p of positions) {
    const key = cellKey(p.x, p.z);
    if (!cells.has(key))
      cells.set(key, {
        x: (Math.floor(p.x / 240) + 0.5) * 240,
        z: (Math.floor(p.z / 240) + 0.5) * 240,
        trees: [],
      });
    cells.get(key)!.trees.push(p);
  }
  const lods = new Map<string, THREE.LOD>();
  for (const [key, cell] of cells) {
    const lod = new THREE.LOD();
    lod.position.set(
      cell.x,
      cell.trees.reduce((sum, p) => sum + p.y, 0) / cell.trees.length,
      cell.z,
    );
    lod.addLevel(new THREE.Group(), 0);
    lod.addLevel(new THREE.Group(), 190);
    lod.addLevel(new THREE.Group(), 850);
    lods.set(key, lod);
    scene.add(lod);
  }
  const matrix = new THREE.Matrix4(),
    color = new THREE.Color(),
    center = new THREE.Vector3(),
    bounds = new THREE.Sphere();
  let detailedTriangles = 0;
  for (const source of sources) {
    const batches = new Map<string, number[]>();
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, matrix);
      center.setFromMatrixPosition(matrix);
      // Foliage may cross a cell edge: retain it with its own spatial cell.
      const perTree = source.count / positions.length;
      const tree =
        source.name !== 'forest-tips' && Number.isInteger(perTree)
          ? positions[Math.floor(i / perTree)]
          : undefined;
      let key = cellKey(tree?.x ?? center.x, tree?.z ?? center.z);
      if (!lods.has(key)) {
        key = [...cells.keys()].reduce((best, k) => {
          const a = cells.get(k)!,
            b = cells.get(best)!;
          return Math.hypot(a.x - center.x, a.z - center.z) <
            Math.hypot(b.x - center.x, b.z - center.z)
            ? k
            : best;
        });
      }
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key)!.push(i);
    }
    for (const [key, ids] of batches) {
      const lod = lods.get(key)!,
        geometry = source.geometry.clone();
      geometry.computeBoundingSphere();
      const instanceSphere = geometry.boundingSphere!.clone();
      const mesh = new THREE.InstancedMesh(geometry, source.material, ids.length);
      let radius = 0;
      ids.forEach((id, i) => {
        source.getMatrixAt(id, matrix);
        matrix.elements[12] -= lod.position.x;
        matrix.elements[13] -= lod.position.y;
        matrix.elements[14] -= lod.position.z;
        mesh.setMatrixAt(i, matrix);
        bounds.copy(instanceSphere).applyMatrix4(matrix);
        radius = Math.max(radius, bounds.center.length() + bounds.radius);
        if (source.instanceColor) {
          source.getColorAt(id, color);
          mesh.setColorAt(i, color);
        }
      });
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
      mesh.frustumCulled = true;
      mesh.name = source.name + '-cell';
      mesh.castShadow = source.name === 'forest-trunks' || source.name === 'forest-foliage';
      mesh.receiveShadow = false;
      (lod.levels[0].object as THREE.Group).add(mesh);
      detailedTriangles +=
        ((geometry.index?.count ?? geometry.attributes.position.count) / 3) * ids.length;
    }
    source.geometry.dispose();
  }
  const silhouetteMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x365d4c).convertSRGBToLinear(),
  });
  for (const [key, cell] of cells) {
    const lod = lods.get(key)!,
      geometry = new THREE.ConeGeometry(1, 1, 5);
    const mesh = new THREE.InstancedMesh(geometry, silhouetteMaterial, cell.trees.length);
    const object = new THREE.Object3D();
    let radius = 0;
    cell.trees.forEach((p, i) => {
      object.position.set(
        p.x - lod.position.x,
        p.y + p.h * 0.58 - lod.position.y,
        p.z - lod.position.z,
      );
      object.scale.set(p.h * 0.23, p.h * 0.9, p.h * 0.23);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      radius = Math.max(radius, object.position.length() + p.h);
    });
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    mesh.frustumCulled = true;
    mesh.name = 'forest-distant-silhouettes';
    lod.levels[1].object.add(mesh);
    lod.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }
  return { cells: lods.size, detailedTriangles };
}

/** Far terrain uses a coarser grid, keeping every border vertex to prevent LOD cracks. */
export function addTerrainLOD(scene: THREE.Scene, tiles: THREE.Mesh[], nearDistance = 500) {
  let nearTriangles = 0,
    farTriangles = 0;
  for (const tile of tiles) {
    const source = tile.geometry as THREE.BufferGeometry;
    const positions = source.getAttribute('position');
    const xs = [
      ...new Set(Array.from({ length: positions.count }, (_, i) => positions.getX(i))),
    ].sort((a, b) => a - b);
    const zs = [
      ...new Set(Array.from({ length: positions.count }, (_, i) => positions.getZ(i))),
    ].sort((a, b) => a - b);
    const vertices = new Map<string, number>();
    for (let i = 0; i < positions.count; i++)
      vertices.set(`${positions.getX(i)},${positions.getZ(i)}`, i);
    const at = (x: number, z: number) => vertices.get(`${xs[x]},${zs[z]}`)!;
    const indices: number[] = [];
    for (let x = 0; x < xs.length - 1; x += 2)
      for (let z = 0; z < zs.length - 1; z += 2) {
        const bx = Math.min(x + 2, xs.length - 1),
          bz = Math.min(z + 2, zs.length - 1);
        if (bx - x < 2 || bz - z < 2) {
          for (let ix = x; ix < bx; ix++)
            for (let iz = z; iz < bz; iz++) {
              const a = at(ix, iz),
                b = at(ix + 1, iz),
                c = at(ix, iz + 1),
                d = at(ix + 1, iz + 1);
              indices.push(a, c, b, c, d, b);
            }
          continue;
        }
        const ring = [at(x, z)];
        if (x === 0) ring.push(at(x, z + 1));
        ring.push(at(x, bz));
        if (bz === zs.length - 1) ring.push(at(x + 1, bz));
        ring.push(at(bx, bz));
        if (bx === xs.length - 1) ring.push(at(bx, z + 1));
        ring.push(at(bx, z));
        if (z === 0) ring.push(at(x + 1, z));
        if (ring.length === 4) indices.push(ring[0], ring[1], ring[3], ring[1], ring[2], ring[3]);
        else {
          const center = at(x + 1, z + 1);
          for (let i = 0; i < ring.length; i++)
            indices.push(center, ring[i], ring[(i + 1) % ring.length]);
        }
      }
    const coarse = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes))
      coarse.setAttribute(name, attribute);
    coarse.setIndex(indices);
    coarse.computeBoundingSphere();
    const low = new THREE.Mesh(coarse, tile.material);
    low.name = 'terrain-distant-tile';
    low.receiveShadow = tile.receiveShadow;
    source.computeBoundingSphere();
    const center = source.boundingSphere!.center;
    const lod = new THREE.LOD();
    lod.name = 'terrain-lod';
    lod.position.copy(center);
    for (const mesh of [tile, low]) {
      mesh.position.copy(center).negate();
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
    }
    scene.remove(tile);
    lod.addLevel(tile, 0);
    lod.addLevel(low, nearDistance);
    scene.add(lod);
    nearTriangles += source.index!.count / 3;
    farTriangles += indices.length / 3;
  }
  return { nearTriangles, farTriangles };
}

/** Local bounds allow Three r128 to cull static instance batches independently. */
export function tileInstances(scene: THREE.Scene, source: THREE.InstancedMesh, size = 400) {
  const buckets = new Map<string, THREE.Matrix4[]>();
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const key = `${Math.floor(matrix.elements[12] / size)},${Math.floor(matrix.elements[14] / size)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(matrix.clone());
  }
  const batches: THREE.InstancedMesh[] = [];
  source.geometry.computeBoundingSphere();
  for (const transforms of buckets.values()) {
    const center = new THREE.Vector3();
    for (const m of transforms) center.add(new THREE.Vector3().setFromMatrixPosition(m));
    center.divideScalar(transforms.length);
    const geometry = source.geometry.clone();
    const batch = new THREE.InstancedMesh(geometry, source.material, transforms.length);
    const sphere = source.geometry.boundingSphere!.clone();
    let radius = 0;
    transforms.forEach((m, i) => {
      m.elements[12] -= center.x;
      m.elements[13] -= center.y;
      m.elements[14] -= center.z;
      batch.setMatrixAt(i, m);
      const bound = sphere.clone().applyMatrix4(m);
      radius = Math.max(radius, bound.center.length() + bound.radius);
    });
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
    batch.position.copy(center);
    batch.name = source.name + '-cell';
    batch.frustumCulled = true;
    batch.updateMatrix();
    batch.matrixAutoUpdate = false;
    scene.add(batch);
    batches.push(batch);
  }
  scene.remove(source);
  source.geometry.dispose();
  return batches;
}
