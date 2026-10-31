import type { RouteFrame } from '../engine/types';

export const routeAnchors: [number, number][] = [
  [-440, 180],
  [-250, 180],
  [-60, 180],
  [150, 180],
  [370, 180],
  [650, 180],
  [920, 135],
  [1140, 70],
  [1370, 40],
  [1540, -60],
  [1610, -260],
  [1510, -460],
  [1290, -560],
  [1060, -575],
  [830, -570],
  [590, -500],
  [420, -330],
  [180, -330],
  [-80, -330],
  [-360, -330],
  [-540, -275],
  [-600, -165],
  [-600, 30],
  [-550, 130],
];
export function smoothStep(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
/** A broad mountain pass with continuous slopes, including at its summit. */
export function routeHeight(x: number, z: number) {
  return (
    7 +
    52 * smoothStep((x + 280) / 730) +
    18 * Math.exp(-(((x - 420) / 260) ** 2 + ((z + 30) / 400) ** 2)) +
    4 * Math.sin(z / 210) +
    190 * smoothStep((x - 550) / 1050)
  );
}

/** k-d tree avoids scanning thousands of route points for every terrain vertex. */
export function createRouteLookup(frames: RouteFrame[]) {
  interface Node {
    index: number;
    axis: 0 | 1;
    left: Node | null;
    right: Node | null;
    xmin: number;
    xmax: number;
    zmin: number;
    zmax: number;
  }
  const coordinate = (index: number, axis: number) =>
    axis === 0 ? frames[index].p.x : frames[index].p.z;
  function build(indices: number[], depth = 0): Node | null {
    if (!indices.length) return null;
    const axis = (depth % 2) as 0 | 1;
    indices.sort((a, b) => coordinate(a, axis) - coordinate(b, axis));
    const mid = Math.floor(indices.length / 2);
    const left = build(indices.slice(0, mid), depth + 1),
      right = build(indices.slice(mid + 1), depth + 1),
      p = frames[indices[mid]].p;
    return {
      index: indices[mid],
      axis,
      left,
      right,
      xmin: Math.min(p.x, left?.xmin ?? Infinity, right?.xmin ?? Infinity),
      xmax: Math.max(p.x, left?.xmax ?? -Infinity, right?.xmax ?? -Infinity),
      zmin: Math.min(p.z, left?.zmin ?? Infinity, right?.zmin ?? Infinity),
      zmax: Math.max(p.z, left?.zmax ?? -Infinity, right?.zmax ?? -Infinity),
    };
  }
  const root = build(frames.slice(0, -1).map((_, i) => i));
  return (position: { x: number; z: number }) => {
    let min = Infinity,
      index = 0;
    function search(node: Node | null) {
      if (!node) return;
      const bx = Math.max(0, node.xmin - position.x, position.x - node.xmax);
      const bz = Math.max(0, node.zmin - position.z, position.z - node.zmax);
      if (bx * bx + bz * bz > min) return;
      const p = frames[node.index].p,
        dx = position.x - p.x,
        dz = position.z - p.z,
        d = dx * dx + dz * dz;
      if (d < min) {
        min = d;
        index = node.index;
      }
      const delta = node.axis === 0 ? dx : dz;
      search(delta < 0 ? node.left : node.right);
      if (delta * delta <= min) search(delta < 0 ? node.right : node.left);
    }
    search(root);
    return { index, distance: Math.sqrt(min), frame: frames[index] };
  };
}
