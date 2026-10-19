// 载具/交通 Schema：地铁、巴士、游船、索道、电梯（后续扩展）
import { z } from 'zod';
import { latLngSchema } from './common.ts';

export const vehicleKindSchema = z.enum(['metro', 'bus', 'boat', 'cable', 'elevator']);

/** 交通站点 */
export const stationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  latlng: latLngSchema,
  /** 换乘线路 ID 列表 */
  transfers: z.array(z.string()).default([]),
});

/** 线路：有序站点串成的 polyline（引擎按投影画轨道/航线） */
export const routeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),                    // 如「地铁1号线（罗宝线）」
  kind: vehicleKindSchema,
  color: z.number().int().min(0).max(0xffffff),
  stations: z.array(z.string()).min(2),       // 引用 station.id，按序
  /** 班车间隔（游戏小时） */
  interval: z.number().positive().default(0.25),
  fare: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
});

export const trafficSchema = z.object({
  stations: z.array(stationSchema),
  routes: z.array(routeSchema),
});

export type VehicleKind = z.infer<typeof vehicleKindSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Traffic = z.infer<typeof trafficSchema>;
