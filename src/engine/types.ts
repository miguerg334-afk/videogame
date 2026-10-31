import type { Vector3 } from 'three';

export interface DrivingInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  boost?: boolean;
  walk?: boolean;
}
export type InputAction = keyof DrivingInput;
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
export interface TunnelRange {
  name: string;
  from: number;
  to: number;
  north: boolean;
  start: number;
  end: number;
}
export interface WheelAssembly {
  pivot: import('three').Group;
  roll: import('three').Group;
}
