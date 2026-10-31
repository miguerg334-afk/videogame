import * as THREE from 'three';

export const DRIVING_CAMERAS = ['Seguimiento', 'Amplia', 'Táctica', 'Retrovisor'] as const;
const flatForward = new THREE.Vector3(),
  flatSide = new THREE.Vector3(),
  separation = new THREE.Vector3();

/** Four exterior views. Tactical framing includes the nearby pursuer without a second render. */
export function frameDrivingCamera(
  mode: number,
  player: THREE.Vector3,
  rotation: THREE.Quaternion,
  police: THREE.Vector3,
  speed: number,
  position: THREE.Vector3,
  target: THREE.Vector3,
  aspect = 16 / 9,
) {
  // Keep cameras level even if the car banks, jumps or rolls over.
  flatForward.set(1, 0, 0).applyQuaternion(rotation).setY(0).normalize();
  if (flatForward.lengthSq() < 0.01) flatForward.set(1, 0, 0);
  flatSide.set(-flatForward.z, 0, flatForward.x);
  const pace = Math.min(3, Math.abs(speed) * 0.07);
  if (mode === 2) {
    separation.copy(police).sub(player).clampLength(0, 90);
    target.copy(player).addScaledVector(separation, 0.4);
    target.y = THREE.MathUtils.clamp(target.y, player.y - 5, player.y + 5) + 0.5;
    const span = (16 + separation.length() * 0.5) * Math.max(1, 1 / Math.max(0.4, aspect));
    position
      .copy(target)
      .addScaledVector(flatForward, -span * 0.8)
      .addScaledVector(flatSide, span * 0.55);
    position.y += span * 1.1;
    return 66;
  }
  const rear = mode === 3;
  const wide = mode === 1;
  position
    .copy(player)
    .addScaledVector(flatForward, rear ? 13 : wide ? -24 - pace : -11 - pace)
    .addScaledVector(flatSide, wide ? 4 : 1.6);
  position.y += wide ? 11 : rear ? 5 : 4.3;
  target.copy(player).addScaledVector(flatForward, rear ? -9 : wide ? -3 : 4.5);
  target.y += 0.65;
  return wide ? 68 : rear ? 72 : 60 + Math.min(5, Math.abs(speed) * 0.12);
}

/** Bearing relative to the player's heading, available even when the patrol is off screen. */
export function policeBearing(
  player: THREE.Vector3,
  rotation: THREE.Quaternion,
  police: THREE.Vector3,
) {
  flatForward.set(1, 0, 0).applyQuaternion(rotation).setY(0).normalize();
  flatSide.set(-flatForward.z, 0, flatForward.x);
  separation.copy(police).sub(player).setY(0);
  const front = separation.dot(flatForward),
    side = separation.dot(flatSide);
  const sideways = Math.abs(side) > Math.max(4, Math.abs(front) * 0.45);
  if (Math.abs(front) < 4 && sideways) return side > 0 ? 'A TU DERECHA →' : '← A TU IZQUIERDA';
  return (
    (front >= 0 ? 'DELANTE' : 'DETRÁS') +
    (sideways ? (side > 0 ? ' · DERECHA' : ' · IZQUIERDA') : '')
  );
}
