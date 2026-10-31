import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createVehicleModel } from '../src/vehicle/model.js';
import { disposeScene } from '../src/engine/dispose';

const context = {
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
  fillRect() {},
};
const canvasDocument = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context }),
} as unknown as Document;
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as THREE.WebGLRenderer;

test('modelo procedural completo: cuatro ruedas, carrocería y geometría finita', () => {
  const scene = new THREE.Scene();
  const model = createVehicleModel(scene, renderer, canvasDocument);
  try {
    assert.equal(model.wheelAssemblies.length, 4);
    assert(scene.children.includes(model.car));
    let meshes = 0;
    model.car.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      const positions = object.geometry.getAttribute('position');
      if (positions) assert(Array.from(positions.array).every(Number.isFinite));
    });
    const before = model.batching.reduce((n, b) => n + b.before, 0),
      after = model.batching.reduce((n, b) => n + b.after, 0);
    console.log({ meshes, beforeBatching: before, afterBatching: after });
    assert(after < before * 0.3, 'reduce las llamadas de dibujo sin quitar piezas');
    assert(meshes > 20, 'conserva ruedas, cristales y piezas móviles');
    assert(model.paint instanceof THREE.MeshPhysicalMaterial);
  } finally {
    disposeScene(scene);
  }
});
