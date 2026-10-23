// 全城地图底图渲染：区划色块 + 道路 + 地标 → Canvas 位图
// 世界坐标（xz 平面）↔ 地图归一化坐标转换
import { proj } from '@block-sz/shared';
import type { Scene } from '@block-sz/schema';

export interface MapBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/** 世界范围：所有区中心投影 + 区半径，向外扩 10% 边距 */
export function computeMapBounds(scene: Scene): MapBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const d of scene.districts) {
    const { x, z } = proj(d.center.lat, d.center.lng);
    const r = d.cityRadius || 400;
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r); maxZ = Math.max(maxZ, z + r);
  }
  // 兜底范围（无区划时）
  if (!isFinite(minX)) { minX = -900; maxX = 1700; minZ = -900; maxZ = 1300; }
  const padX = (maxX - minX) * 0.1, padZ = (maxZ - minZ) * 0.1;
  return { minX: minX - padX, maxX: maxX + padX, minZ: minZ - padZ, maxZ: maxZ + padZ };
}

/** 世界坐标 → 归一化 (0~1)；u=东西（东大），v=南北（南大，与 canvas y 向下一致） */
export function worldToU(x: number, z: number, b: MapBounds): { u: number; v: number } {
  return { u: (x - b.minX) / (b.maxX - b.minX), v: (z - b.minZ) / (b.maxZ - b.minZ) };
}

/** 十进制 RGB → 淡色填充 / 描边 / 文本色 */
function districtPalette(color: number) {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  return {
    fill: `rgba(${r},${g},${b},0.22)`,
    stroke: `rgba(${r},${g},${b},0.75)`,
    text: `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`,
  };
}export type MapRoad = { x1: number; z1: number; x2: number; z2: number; kind: 'hwy' | 'major' };

/** 渲染全城地图底图（size×size 像素）：区划色块 + 道路 + 地标 */
export function renderBaseMap(scene: Scene, mapRoads: MapRoad[], b: MapBounds, size = 1024): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const W = b.maxX - b.minX, H = b.maxZ - b.minZ;
  const toPx = (x: number, z: number) => {
    const { u, v } = worldToU(x, z, b);
    return [u * size, v * size] as const;
  };

  // 背景（边缘/海洋）
  g.fillStyle = '#0b1a2e';
  g.fillRect(0, 0, size, size);

  // 区划色块
  for (const d of scene.districts) {
    const { x, z } = proj(d.center.lat, d.center.lng);
    const [cx, cy] = toPx(x, z);
    const r = (d.cityRadius || 400) / W * size;
    const pal = districtPalette(d.color);
    g.fillStyle = pal.fill;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = pal.stroke;
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = pal.text;
    g.font = `bold ${Math.max(13, r * 0.28)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.name.replace('区', ''), cx, cy);
  }

  // 道路：区际快速路（亮橙粗）+ 主干道（暗灰细）
  g.lineCap = 'round';
  for (const s of mapRoads) {
    const [x1, y1] = toPx(s.x1, s.z1);
    const [x2, y2] = toPx(s.x2, s.z2);
    g.strokeStyle = s.kind === 'hwy' ? 'rgba(255,178,80,0.85)' : 'rgba(140,150,165,0.5)';
    g.lineWidth = s.kind === 'hwy' ? 3 : 1.4;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }

  // 地标：点 + 名称
  for (const lm of scene.landmarks) {
    const { x, z } = proj(lm.latlng.lat, lm.latlng.lng);
    const [px, py] = toPx(x, z);
    g.fillStyle = '#ffd66b';
    g.beginPath();
    g.arc(px, py, 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(255,240,200,0.9)';
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(lm.name, px, py + 7);
  }

  return c;
}