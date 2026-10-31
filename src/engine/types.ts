import type { Vector3 } from 'three';

export interface DrivingInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  /** Analog controls for AI; bounded by the same steering and engine limits. */
  steeringAxis?: number;
  throttleAxis?: number;
  boost?: boolean;
  walk?: boolean;
}
export type InputAction = Exclude<keyof DrivingInput, 'steeringAxis' | 'throttleAxis'>;
export interface VectorLike {
  x: number;
  y: number;
  z: number;
}
export interface QuaternionLike extends VectorLike {
  w: number;
}
export interface DrivingState {
  speed: number;
  steering: number;
  throttle: number;
  contacts: number;
  reverse: boolean;
  braking: boolean;
}
export interface RouteFrame {
  p: Vector3;
  tangent: Vector3;
  normal: Vector3;
  t: number;
  grade: number;
}
export interface WheelAssembly {
  pivot: import('three').Group;
  roll: import('three').Group;
}
