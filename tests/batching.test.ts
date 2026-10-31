import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { batchStaticParts } from '../src/vehicle/batching';
import { freezeWorldTransforms } from '../src/engine/transforms';
import { disposeScene } from '../src/engine/dispose';

test('agrupar conserva triángulos transformados, cristales, instancias y ruedas móviles', () => {
  const scene = new THREE.Scene(),
    root = new THREE.Group(),
    moving = new THREE.Group();
  scene.add(root);
  root.position.set(10, 2, 0);
  root.add(moving);
  const material = new THREE.MeshBasicMaterial();
  const first = new THREE.Mesh(new THREE.BoxGeometry(), material),
    second = first.clone();
  second.position.set(3, 2, -4);
  second.rotation.y = 0.5;
  second.scale.z = -1;
  root.add(first, second);
  const wheel = first.clone();
  moving.add(wheel);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  root.add(glass);
  const instances = new THREE.InstancedMesh(first.geometry, material, 5);
  root.add(instances);
  const signature = (meshes: THREE.Mesh[]) =>
    meshes
      .flatMap((mesh) => {
        const position = mesh.geometry.getAttribute('position'),
          index = mesh.geometry.index;
        const matrix = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
        return Array.from({ length: index?.count ?? position.count }, (_, i) => {
          const p = new THREE.Vector3()
            .fromBufferAttribute(position, index ? index.getX(i) : i)
            .applyMatrix4(matrix);
          return p
            .toArray()
            .map((v) => v.toFixed(4))
            .join(',');
        });
      })
      .sort();
  root.updateWorldMatrix(true, true);
  const expected = signature([first, second]);
  try {
    const result = batchStaticParts(root, new Set([moving]));
    root.updateWorldMatrix(true, true);
    const merged = root.getObjectByName('batched-car-parts') as THREE.Mesh;
    assert.equal(result.before, 2);
    assert.equal(result.after, 1);
    assert.deepEqual(signature([merged]), expected);
    const p = merged.geometry.getAttribute('position'),
      n = merged.geometry.getAttribute('normal'),
      index = merged.geometry.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, index.getX(i)),
        b = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 1)),
        c = new THREE.Vector3().fromBufferAttribute(p, index.getX(i + 2)),
        normal = new THREE.Vector3().fromBufferAttribute(n, index.getX(i));
      assert(
        b.sub(a).cross(c.sub(a)).dot(normal) > 0,
        'las piezas reflejadas conservan sus caras exteriores',
      );
    }
    assert.equal(glass.parent, root);
    assert.equal(instances.parent, root);
    assert.equal(instances.count, 5);
    assert.equal(wheel.parent, moving);
    assert.equal(
      merged.material,
      material,
      'la pintura y luces compartidas siguen siendo editables',
    );
  } finally {
    disposeScene(scene);
  }
});

test('el mundo estático se conserva y el coche, las ruedas y las luces siguen actualizándose', () => {
  const scene = new THREE.Scene(),
    mountain = new THREE.Group(),
    rig = new THREE.Group(),
    wheel = new THREE.Object3D(),
    light = new THREE.PointLight();
  mountain.position.set(100, 20, 0);
  scene.add(mountain, rig, light);
  rig.add(wheel);
  const update = freezeWorldTransforms(scene, [rig, light]);
  assert(!scene.autoUpdate);
  assert(!mountain.matrixAutoUpdate);
  const original = mountain.matrixWorld.clone();
  mountain.updateMatrixWorld = () => {
    throw new Error('se recalculó un objeto estático');
  };
  rig.position.x = 30;
  wheel.rotation.z = 1;
  light.position.x = 40;
  update();
  assert.equal(rig.matrixWorld.elements[12], 30);
  assert.equal(wheel.matrixWorld.elements[12], 30);
  assert.equal(light.matrixWorld.elements[12], 40);
  assert(mountain.matrixWorld.equals(original));
});
