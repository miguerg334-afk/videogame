import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createExhaustFlames } from '../src/vehicle/exhaust-flames';
import { disposeScene } from '../src/engine/dispose';

test('fuego en ambos escapes: acompaña al coche, acelera, se anima y se apaga', () => {
  const scene = new THREE.Scene(),
    car = new THREE.Group();
  scene.add(car);
  const effect = createExhaustFlames(car);
  try {
    assert.equal(effect.group.parent, car);
    assert.equal(effect.group.children.length, 2);
    effect.update(1 / 60, 1, false, 1, 65);
    assert(!effect.group.visible, 'sin aceleración fuerte no hay fuego');
    effect.update(1 / 60, 2, true, 1, 65);
    assert(effect.group.visible);
    const jet = effect.group.children[0];
    const scale = jet.scale.x;
    effect.update(1 / 60, 2.1, true, 1, 65);
    assert.notEqual(jet.scale.x, scale, 'las llamas palpitan');
    for (const [i, exhaust] of effect.group.children.entries()) {
      assert.equal(exhaust.position.x, -4.44);
      assert.equal(exhaust.position.y, 0.65);
      assert.equal(exhaust.position.z, (i === 0 ? -1 : 1) * 1.18);
      assert.equal(exhaust.children.length, 2);
      for (const sheet of exhaust.children as THREE.Mesh[]) {
        const material = sheet.material as THREE.ShaderMaterial;
        assert(!material.depthWrite);
        assert(material.depthTest);
        assert.equal(material.blending, THREE.AdditiveBlending);
        assert(material.uniforms.intensity.value > 0);
      }
    }
    for (let i = 0; i < 120; i++) effect.update(1 / 60, 3, true, 0, 65);
    assert(!effect.group.visible, 'soltar el acelerador extingue el fuego');
    effect.update(1 / 30, 4, true, 1, 65);
    assert(effect.group.visible);
    effect.update(1 / 60, 5, false, 1, 65);
    assert(!effect.group.visible, 'terminar la ráfaga o reiniciar apaga las llamas');
  } finally {
    disposeScene(scene);
  }
});
