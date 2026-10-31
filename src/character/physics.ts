import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { DrivingInput, DrivingState, VectorLike } from '../engine/types';

export const RUN_SPEED = 28;
export const BOOST_SPEED = 200 / 3.6;
export function createCharacterPhysics(world: R.World) {
  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 0),
  );
  const collider = world.createCollider(
    R.ColliderDesc.capsule(1.05, 0.34).setTranslation(0, 1.39, 0).setFriction(0),
    body,
  );
  const controller = world.createCharacterController(0.025);
  controller.setMaxSlopeClimbAngle(Math.PI * 0.34);
  controller.setMinSlopeSlideAngle(Math.PI * 0.36);
  controller.enableAutostep(0.32, 0.18, false);
  controller.enableSnapToGround(0.35);
  let yaw = 0,
    speed = 0,
    vertical = 0,
    grounded = false,
    jumpHeld = false,
    turn = 0;
  let lastVelocity = { x: 0, y: 0, z: 0 };
  function step(input: DrivingInput, dt: number): DrivingState {
    const target = input.up
      ? input.walk
        ? 2.5
        : input.boost
          ? BOOST_SPEED
          : RUN_SPEED
      : input.down
        ? -5
        : 0;
    const acceleration = input.down || !input.up ? 38 : input.walk ? 12 : input.boost ? 32 : 12;
    speed += Math.max(-acceleration * dt, Math.min(acceleration * dt, target - speed));
    const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    turn += (steering - turn) * Math.min(1, dt * 12);
    yaw += turn * dt * (2.5 / (1 + Math.abs(speed) * 0.025));
    if (input.handbrake && !jumpHeld && grounded) {
      vertical = 10;
      grounded = false;
      controller.disableSnapToGround();
    }
    jumpHeld = input.handbrake;
    vertical = Math.max(-45, vertical - 25 * dt);
    if (vertical <= 0) controller.enableSnapToGround(0.35);
    const p = body.translation();
    controller.computeColliderMovement(
      collider,
      { x: Math.cos(yaw) * speed * dt, y: vertical * dt, z: -Math.sin(yaw) * speed * dt },
      R.QueryFilterFlags.EXCLUDE_DYNAMIC,
    );
    const movement = controller.computedMovement();
    grounded = controller.computedGrounded();
    if (grounded && vertical < 0) vertical = 0;
    if (!grounded && vertical > 0 && movement.y < vertical * dt * 0.5) vertical = 0;
    body.setNextKinematicTranslation({
      x: p.x + movement.x,
      y: p.y + movement.y,
      z: p.z + movement.z,
    });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    world.timestep = dt;
    world.step();
    const end = body.translation();
    lastVelocity = { x: (end.x - p.x) / dt, y: (end.y - p.y) / dt, z: (end.z - p.z) / dt };
    // A wall stops acceleration instead of accumulating speed behind the obstacle.
    const actual = Math.hypot(lastVelocity.x, lastVelocity.z);
    if (actual < Math.abs(speed) * 0.35 && controller.numComputedCollisions() > 0)
      speed = Math.sign(speed) * actual;
    return {
      speed: Math.sign(speed) * actual,
      steering: turn,
      throttle: input.up ? 1 : input.down ? -0.3 : 0,
      contacts: grounded ? 1 : 0,
      reverse: speed < -0.1,
      braking: input.down || (!input.up && Math.abs(speed) > 1),
    };
  }
  function reset(position: VectorLike, heading: number, _grade = 0) {
    body.setTranslation(position, true);
    body.setNextKinematicTranslation(position);
    yaw = heading;
    speed = vertical = turn = 0;
    grounded = false;
    jumpHeld = false;
    lastVelocity = { x: 0, y: 0, z: 0 };
    const rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    body.setRotation(rotation, true);
    body.setNextKinematicRotation(rotation);
    controller.enableSnapToGround(0.35);
  }
  return {
    body,
    collider,
    controller,
    step,
    reset,
    velocity: () => lastVelocity,
    dispose: () => world.removeCharacterController(controller),
  };
}
