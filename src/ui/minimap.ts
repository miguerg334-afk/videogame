import { rotateVector } from '../engine/math';
import type { RouteFrame, VectorLike, QuaternionLike } from '../engine/types';
import { context2D } from './dom';

export function createMinimap(mapCanvas: HTMLCanvasElement, frames: RouteFrame[]) {
  const mapContext = context2D(mapCanvas);
  const N = frames.length - 1,
    start = frames[0];
  // Minimap: static route cached once; only the vehicle marker changes each frame.
  const mapBase = document.createElement('canvas');
  mapBase.width = 296;
  mapBase.height = 224;
  const mc = context2D(mapBase),
    mapBounds = {
      xmin: Math.min(...frames.map((f) => f.p.x)) - 45,
      xmax: Math.max(...frames.map((f) => f.p.x)) + 45,
      zmin: Math.min(...frames.map((f) => f.p.z)) - 45,
      zmax: Math.max(...frames.map((f) => f.p.z)) + 45,
    };
  function mapPoint(x: number, z: number) {
    return [
      ((x - mapBounds.xmin) / (mapBounds.xmax - mapBounds.xmin)) * 270 + 13,
      ((z - mapBounds.zmin) / (mapBounds.zmax - mapBounds.zmin)) * 195 + 12,
    ];
  }
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
  const startXY = mapPoint(start.p.x, start.p.z);
  mc.fillStyle = '#f1f0d3';
  mc.fillRect(startXY[0] - 3, startXY[1] - 4, 6, 8);
  function drawMap(p: VectorLike, q: QuaternionLike) {
    mapContext.clearRect(0, 0, 296, 224);
    mapContext.drawImage(mapBase, 0, 0);
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
