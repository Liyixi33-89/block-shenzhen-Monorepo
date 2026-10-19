// 建造 Schema（P5 建造功能的 Schema 先行：客户端预测 + 服务端裁决）
import { z } from 'zod';
import { latLngSchema } from './common.ts';

/** 单个放置物：引用元素 ID + 位置 + 旋转 */
export const placementSchema = z.object({
  id: z.string(),                       // 放置实例 ID（服务端生成）
  element: z.string(),                  // 引用 element.id
  latlng: latLngSchema,
  rotation: z.number().default(0),
  placedBy: z.string(),                 // 玩家 ID
  placedAt: z.string(),                 // ISO 时间
  /** 状态：pending 待审核 / approved 已入库 / rejected 拒绝 */
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});

/** 建造配方：消耗与解锁 */
export const buildRecipeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  element: z.string(),                  // 产出元素
  cost: z.object({
    money: z.number().int().min(0).default(0),
    items: z.array(z.object({ id: z.string(), n: z.number().int().positive() })).default([]),
  }),
  /** 解锁条件（如完成某任务） */
  requires: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type Placement = z.infer<typeof placementSchema>;
export type BuildRecipe = z.infer<typeof buildRecipeSchema>;
