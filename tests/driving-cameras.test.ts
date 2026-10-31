import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { DRIVING_CAMERAS, frameDrivingCamera, policeBearing } from '../src/engine/driving-cameras';

function framing(
  mode: number,
  player: THREE.Vector3,
  q: THREE.Quaternion,
  police: THREE.Vector3,
  aspect = 16 / 9,
) {
  const position = new THREE.Vector3(),
    target = new THREE.Vector3();
  const fov = frameDrivingCamera(mode, player, q, police, 100 / 3.6, position, target, aspect);
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.08, 8500);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return { camera, position, target };
}

test('las cuatro cámaras son exteriores, distintas y muestran el coche incluso al girar o volcar', () => {
  const p = new THREE.Vector3(120, 15, -50),
    police = p.clone().add(new THREE.Vector3(-55, 0, 0));
  assert.equal(DRIVING_CAMERAS.length, 4);
  const distinct = new Set<string>();
  for (const yaw of [0, 0.8, 2.8])
    for (const roll of [0, 0.4, Math.PI]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, 0.1));
      for (let mode = 0; mode < 4; mode++) {
        const { camera, position, target } = framing(mode, p, q, police);
        assert(position.distanceTo(p) > 10, 'nunca sitúa la cámara dentro del habitáculo');
        assert(position.y > p.y + 4);
        assert([...position.toArray(), ...target.toArray()].every(Number.isFinite));
        const projected = p.clone().project(camera);
        assert(
          Math.abs(projected.x) < 1 &&
            Math.abs(projected.y) < 1 &&
            projected.z < 1 &&
            projected.z > -1,
          'el jugador sigue dentro del encuadre',
        );
        if (yaw === 0 && roll === 0) distinct.add(position.toArray().join(','));
      }
    }
  assert.equal(distinct.size, 4);
});

test('táctica encuadra ambos vehículos en horizontal y vertical sin alejarse indefinidamente', () => {
  for (const aspect of [16 / 9, 9 / 16])
    for (const yaw of [0, 0.8, 2.8]) {
      const p = new THREE.Vector3(300, 25, 140),
        q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const police = p.clone().add(new THREE.Vector3(-55, 3, 0).applyQuaternion(q));
      const { camera } = framing(2, p, q, police, aspect);
      for (const point of [p, police]) {
        const screen = point.clone().project(camera);
        assert(
          Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z < 1 && screen.z > -1,
          `ambos coches entran en el encuadre (${screen.toArray()})`,
        );
      }
      const distant = p.clone().add(new THREE.Vector3(-10000, 0, 0));
      assert(
        framing(2, p, q, distant, aspect).position.distanceTo(p) < 220,
        'la cámara conserva la cercanía al jugador',
      );
    }
});

test('la dirección policial es relativa al coche y se mantiene disponible fuera de cámara', () => {
  const p = new THREE.Vector3(),
    q = new THREE.Quaternion();
  assert.equal(policeBearing(p, q, new THREE.Vector3(-55, 0, 0)), 'DETRÁS');
  assert.equal(policeBearing(p, q, new THREE.Vector3(55, 0, 0)), 'DELANTE');
  assert.equal(policeBearing(p, q, new THREE.Vector3(0, 0, 10)), 'A TU DERECHA →');
  q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  assert.equal(policeBearing(p, q, new THREE.Vector3(0, 0, 55)), 'DETRÁS');
  assert.equal(policeBearing(p, q, new THREE.Vector3(0, 0, -55)), 'DELANTE');
});
