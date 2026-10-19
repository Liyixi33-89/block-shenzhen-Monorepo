// 区划 Schema：深圳 9 区
import { z } from 'zod';
import { colorSchema, latLngSchema } from './common.ts';

export const districtSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),            // 中文名，如「福田区」
  slogan: z.string().optional(),      // 如「深圳·特区风采」
  color: colorSchema,                 // 区主题色
  /** 区中心（地标聚合参考点，经纬度） */
  center: latLngSchema,
  /** 城市街区生成密度半径（世界单位）；0 表示不生成自动街区 */
  cityRadius: z.number().min(0).default(0),
  /** 密度权重：高楼群 vs 低层 */
  density: z.enum(['cbd', 'urban', 'suburb', 'none']).default('urban'),
  sortOrder: z.number().int().default(0),
});

export type District = z.infer<typeof districtSchema>;
