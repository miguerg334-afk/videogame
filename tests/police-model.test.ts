import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createVehicleModel } from '../src/vehicle/model.js';
import { createPoliceModel } from '../src/police/model';
import { disposeScene } from '../src/engine/dispose';
const ctx = new Proxy(
  { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) },
  { get: (t, k) => Reflect.get(t, k) || (() => {}) },
);
const document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
} as unknown as Document;
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as THREE.WebGLRenderer;
test('la patrulla copia la carrocería, comparte geometría y mantiene pintura y ruedas independientes', () => {
  const scene = new THREE.Scene(),
    source = createVehicleModel(scene, renderer, document);
  source.car.scale.setScalar(0.52);
  source.car.position.y = -0.48;
  const police = createPoliceModel(source, document);
  scene.add(police.rig);
  try {
    const original = source.car.getObjectByName('batched-car-parts') as THREE.Mesh,
      copy = police.car.getObjectByName('batched-car-parts') as THREE.Mesh;
    assert.equal(copy.geometry, original.geometry);
    assert.notEqual(police.paint, source.paint);
    assert(!police.paint.color.equals(source.paint.color));
    assert.equal(police.car.scale.x, 0.52);
    assert.equal(police.wheels.length, 4);
    const playerRoll = source.wheelAssemblies[0].roll.rotation.z;
    police.update(0.01, 20, 0.016);
    const red = police.redBeacon.color.clone();
    police.update(0.15, 20, 0.016);
    assert(!police.redBeacon.color.equals(red));
    assert.notEqual(police.wheels[0].roll.rotation.z, playerRoll);
    assert.equal(source.wheelAssemblies[0].roll.rotation.z, playerRoll);
    police.paint.color.set(0xff0000);
    assert(!police.paint.color.equals(source.paint.color));
  } finally {
    disposeScene(scene);
  }
});
