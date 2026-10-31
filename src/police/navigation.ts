import R from '@dimforge/rapier3d-compat/rapier.es.js';
import type { VectorLike, RouteFrame } from '../engine/types';

interface MapRoutes {
  world: R.World;
  frames: RouteFrame[];
  trailNetwork: { trails: { frames: RouteFrame[] }[] };
  driveGroundHeight: (x: number, z: number) => number;
}
type Node = { p: VectorLike; edges: { to: number; cost: number }[] };
const distance = (a: VectorLike, b: VectorLike) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Live routing: take a traversable intercept, otherwise use the road/trail network in either direction. */
export function createPursuitNavigation(map: MapRoutes) {
  const nodes: Node[] = [];
  const ground = map.driveGroundHeight;
  function clearSegment(a: VectorLike, b: VectorLike) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.1) return Math.abs(a.y - b.y) < 2;
    // Do not connect stacked surfaces, e.g. the tunnel interior and its roof.
    if (Math.abs(a.y - ground(a.x, a.z) - 0.7) > 2 || Math.abs(b.y - ground(b.x, b.z) - 0.7) > 2)
      return false;
    const steps = Math.max(1, Math.ceil(length / 6));
    let x = a.x,
      z = a.z,
      y = ground(x, z) + 0.65;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        nx = a.x + (b.x - a.x) * t,
        nz = a.z + (b.z - a.z) * t;
      const ny = ground(nx, nz) + 0.65,
        dx = nx - x,
        dz = nz - z,
        dy = ny - y;
      const horizontal = Math.hypot(dx, dz);
      if (Math.abs(dy) / Math.max(0.01, horizontal) > 0.6) return false;
      const span = Math.hypot(dx, dy, dz),
        sx = (-dz / horizontal) * 0.85,
        sz = (dx / horizontal) * 0.85;
      for (const side of [-1, 0, 1]) {
        const hit = map.world.castRay(
          new R.Ray(
            { x: x + sx * side, y, z: z + sz * side },
            { x: dx / span, y: dy / span, z: dz / span },
          ),
          span,
          true,
          R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
        );
        if (hit) return false;
      }
      x = nx;
      y = ny;
      z = nz;
    }
    return true;
  }
  function connect(a: number, b: number) {
    const cost = distance(nodes[a].p, nodes[b].p);
    nodes[a].edges.push({ to: b, cost });
    nodes[b].edges.push({ to: a, cost });
  }
  function addRoute(frames: RouteFrame[], closed: boolean) {
    const ids: number[] = [];
    for (let i = 0; i < frames.length; i += 8) {
      const p = frames[i].p;
      ids.push(nodes.length);
      nodes.push({ p: { x: p.x, y: p.y + 0.7, z: p.z }, edges: [] });
    }
    if (!closed) {
      const p = frames[frames.length - 1].p;
      ids.push(nodes.length);
      nodes.push({ p: { x: p.x, y: p.y + 0.7, z: p.z }, edges: [] });
    }
    for (let i = 1; i < ids.length; i++) connect(ids[i - 1], ids[i]);
    if (closed) connect(ids[ids.length - 1], ids[0]);
    return ids;
  }
  const road = addRoute(map.frames.slice(0, -1), true);
  for (const trail of map.trailNetwork.trails) {
    const ids = addRoute(trail.frames, false);
    for (const end of [ids[0], ids[ids.length - 1]]) {
      const closest = road.reduce((a, b) =>
        distance(nodes[a].p, nodes[end].p) < distance(nodes[b].p, nodes[end].p) ? a : b,
      );
      connect(end, closest);
    }
  }
  function attachments(p: VectorLike) {
    const nearest = nodes
      .map((node, id) => ({ id, d: distance(node.p, p) }))
      .sort((a, b) => a.d - b.d);
    const result: { id: number; d: number }[] = [];
    for (const node of nearest.slice(0, 48)) {
      if (clearSegment(p, nodes[node.id].p)) result.push(node);
      if (result.length === 3) break;
    }
    return result;
  }
  function plan(from: VectorLike, target: VectorLike): VectorLike[] {
    if (clearSegment(from, target)) return [from, target];
    const starts = attachments(from),
      ends = attachments(target);
    if (!starts.length || !ends.length) return [from, target];
    const costs = new Float64Array(nodes.length).fill(Infinity),
      previous = new Int32Array(nodes.length).fill(-1);
    const open = new Set<number>();
    for (const start of starts) {
      costs[start.id] = start.d;
      open.add(start.id);
    }
    const goals = new Map(ends.map((e) => [e.id, e.d]));
    let winner = -1,
      best = Infinity;
    // Small fixed navigation graph; planning is throttled by the pursuit controller.
    while (open.size) {
      let current = -1,
        estimate = Infinity;
      for (const id of open) {
        const f = costs[id] + distance(nodes[id].p, target);
        if (f < estimate) {
          estimate = f;
          current = id;
        }
      }
      if (current < 0 || estimate >= best) break;
      open.delete(current);
      if (goals.has(current)) {
        best = costs[current] + goals.get(current)!;
        winner = current;
      }
      for (const edge of nodes[current].edges) {
        const candidate = costs[current] + edge.cost;
        if (candidate < costs[edge.to]) {
          costs[edge.to] = candidate;
          previous[edge.to] = current;
          open.add(edge.to);
        }
      }
    }
    if (winner < 0) return [from, target];
    const route: VectorLike[] = [target];
    for (let id = winner; id >= 0; id = previous[id]) route.push(nodes[id].p);
    route.push(from);
    route.reverse();
    // Skip obsolete bends only when the whole car can drive the shortcut.
    for (let i = Math.min(route.length - 1, 12); i > 1; i--) {
      if (clearSegment(from, route[i])) {
        route.splice(1, i - 1);
        break;
      }
    }
    return route;
  }
  return { plan, clearSegment };
}
export type PursuitNavigation = ReturnType<typeof createPursuitNavigation>;
