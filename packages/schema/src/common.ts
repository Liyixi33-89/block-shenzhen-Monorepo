// 共享基础类型：颜色（十进制整数，与现有 game.js 一致）、经纬度、世界坐标
import { z } from 'zod';

/** 颜色：十进制整数，如 10405084 (= 0x9FE0FF) */
export const colorSchema = z.number().int().min(0).max(0xffffff);
export type ColorInt = z.infer<typeof colorSchema>;

/** 经纬度 */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/** 世界坐标（引擎单位，1km = 200 单位） */
export const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vec3 = z.infer<typeof vec3Schema>;

/** 材质名（与引擎注册表对应） */
export const materialSchema = z.enum([
  'curtain', 'window', 'glass', 'glow', 'wood', 'stone',
  'grass', 'water', 'greyBrick', 'granite', 'metal', 'roof', 'default',
]);
export type MaterialName = z.infer<typeof materialSchema>;

/** 通用多语言文本：默认文案 + 可选英文 */
export const i18nTextSchema = z.object({
  zh: z.string().min(1),
  en: z.string().optional(),
});
export type I18nText = z.infer<typeof i18nTextSchema>;
