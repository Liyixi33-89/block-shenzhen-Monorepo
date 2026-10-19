// 经纬度投影：与现有 game.js 投影完全一致，前后端共用
// 原点：深圳市民中心 (22.5431, 114.0579)；1km = 200 单位；超距压缩 0.35

export const DEFAULT_PROJECTION = {
  origin: { lat: 22.5431, lng: 114.0579 },  // 深圳市民中心
  unitPerKm: 200,
  farCompress: 0.35,
  /** 距原点超过此距离开始压缩（单位：km） */
  compressFromKm: 8,
} as const;

export interface Projection {
  origin: { lat: number; lng: number };
  unitPerKm: number;
  farCompress: number;
  compressFromKm: number;
}

/** 经纬度 → 世界坐标（x 东西 / z 南北，与引擎一致：z 正向为南） */
export function project(p: Projection, lat: number, lng: number): { x: number; z: number } {
  const dLatKm = (lat - p.origin.lat) * 111.32;
  const dLngKm = (lng - p.origin.lng) * 111.32 * Math.cos((p.origin.lat * Math.PI) / 180);
  let dx = dLngKm * p.unitPerKm;
  let dz = dLatKm * p.unitPerKm;
  // 超距压缩：距原点超过 compressFromKm 的部分按 farCompress 缩放
  const r = Math.hypot(dLngKm, dLatKm);
  if (r > p.compressFromKm) {
    const scale = (p.compressFromKm + (r - p.compressFromKm) * p.farCompress) / r;
    dx *= scale;
    dz *= scale;
  }
  return { x: dx, z: dz };
}

/** 世界坐标 → 经纬度（近似逆变换，用于后台地图点选反查） */
export function unproject(p: Projection, x: number, z: number): { lat: number; lng: number } {
  let dx = x, dz = z;
  const rUnits = Math.hypot(x, z);
  const fromUnits = p.compressFromKm * p.unitPerKm;
  if (rUnits > fromUnits) {
    // 反解压缩半径
    const scale = (fromUnits + (rUnits - fromUnits) / p.farCompress) / rUnits;
    dx *= scale;
    dz *= scale;
  }
  const dLngKm = dx / p.unitPerKm;
  const dLatKm = dz / p.unitPerKm;
  const lat = p.origin.lat + dLatKm / 111.32;
  const lng = p.origin.lng + dLngKm / (111.32 * Math.cos((p.origin.lat * Math.PI) / 180));
  return { lat, lng };
}

/** 默认投影快捷方法 */
export const proj = (lat: number, lng: number) => project(DEFAULT_PROJECTION, lat, lng);
export const unproj = (x: number, z: number) => unproject(DEFAULT_PROJECTION, x, z);
