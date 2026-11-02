import { rotateVector } from '../engine/math';
import type { RouteFrame, VectorLike, QuaternionLike } from '../engine/types';
import type { MountainTrail } from '../world/trails';
import { context2D } from './dom';
import { PLAYABLE_BOUNDS } from '../world/boundary';

export function createMinimap(
  mapCanvas: HTMLCanvasElement,
  frames: RouteFrame[],
  trails: MountainTrail[] = [],
) {
  const mapContext = context2D(mapCanvas);
  const N = frames.length - 1,
    start = frames[0];
  // Minimap: static route cached once; only the vehicle marker changes each frame.
  const mapBase = document.createElement('canvas');
  mapBase.width = 296;
  mapBase.height = 224;
  const mc = context2D(mapBase),
    mapBounds = PLAYABLE_BOUNDS;
  function mapPoint(x: number, z: number) {
    return [
      ((x - mapBounds.xmin) / (mapBounds.xmax - mapBounds.xmin)) * 270 + 13,
      ((z - mapBounds.zmin) / (mapBounds.zmax - mapBounds.zmin)) * 195 + 12,
    ];
  }
  const [bx, by] = mapPoint(mapBounds.xmin, mapBounds.zmin);
  mc.fillStyle = '#243e303d';
  mc.fillRect(bx, by, 270, 195);
  mc.strokeStyle = '#c0a976';
  mc.lineWidth = 1.5;
  mc.setLineDash([4, 5]);
  mc.strokeRect(bx, by, 270, 195);
  mc.setLineDash([]);
  mc.lineJoin = 'round';
  mc.lineCap = 'round';
  mc.beginPath();
  for (let i = 0; i <= N; i++) {
    const [x, y] = mapPoint(frames[i].p.x, frames[i].p.z);
    i ? mc.lineTo(x, y) : mc.moveTo(x, y);
  }
  mc.strokeStyle = '#435c50';
  mc.lineWidth = 10;
  mc.stroke();
  mc.strokeStyle = '#a3b9a7';
  mc.lineWidth = 3;
  mc.stroke();
  for (const trail of trails) {
    mc.beginPath();
    trail.frames.forEach((f, i) => {
      const [x, y] = mapPoint(f.p.x, f.p.z);
      i ? mc.lineTo(x, y) : mc.moveTo(x, y);
    });
    mc.strokeStyle = '#c5a16b';
    mc.lineWidth = 2;
    mc.stroke();
  }
  const startXY = mapPoint(start.p.x, start.p.z);
  mc.fillStyle = '#f1f0d3';
  mc.fillRect(startXY[0] - 3, startXY[1] - 4, 6, 8);
  function drawMap(
    p: VectorLike,
    q: QuaternionLike,
    police?: VectorLike,
    time = 0,
    reinforcements: VectorLike[] = [],
    helicopter?: VectorLike,
  ) {
    mapContext.clearRect(0, 0, 296, 224);
    mapContext.drawImage(mapBase, 0, 0);
    for (const officer of police ? [police, ...reinforcements] : reinforcements) {
      const [x, y] = mapPoint(officer.x, officer.z);
      mapContext.fillStyle = Math.floor(time * 8) % 2 ? '#ff4b66' : '#4cafff';
      mapContext.beginPath();
      mapContext.arc(x, y, 5, 0, Math.PI * 2);
      mapContext.fill();
      mapContext.strokeStyle = '#fff';
      mapContext.lineWidth = 1;
      mapContext.stroke();
    }
    if (helicopter) {
      const [x, y] = mapPoint(helicopter.x, helicopter.z);
      mapContext.strokeStyle = '#ffffff';
      mapContext.lineWidth = 1.5;
      mapContext.beginPath();
      mapContext.arc(x, y, 7, 0, Math.PI * 2);
      mapContext.moveTo(x - 10, y);
      mapContext.lineTo(x + 10, y);
      mapContext.moveTo(x, y - 10);
      mapContext.lineTo(x, y + 10);
      mapContext.stroke();
    }
    const f = rotateVector(q, { x: 1, y: 0, z: 0 }),
      [x, y] = mapPoint(p.x, p.z);
    mapContext.save();
    mapContext.translate(x, y);
    mapContext.rotate(Math.atan2(f.z, f.x));
    mapContext.fillStyle = '#ddf9a2';
    mapContext.beginPath();
    mapContext.moveTo(8, 0);
    mapContext.lineTo(-5, -5);
    mapContext.lineTo(-3, 0);
    mapContext.lineTo(-5, 5);
    mapContext.closePath();
    mapContext.fill();
    mapContext.restore();
  }

  return drawMap;
}
