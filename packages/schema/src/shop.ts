// 经济扩展 Schema：商店商品 + 地标投资（P2 经济深化）
import { z } from 'zod';

/** 商店商品类型 */
export const shopItemKindSchema = z.enum(['consumable', 'deco', 'material', 'camera', 'food', 'souvenir']);

/** 商店商品：数据驱动，引擎只解释 */
export const shopItemSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  kind: shopItemKindSchema,
  desc: z.string().default(''),
  /** 售价 */
  price: z.number().int().min(0),
  /** 消耗品效果（kind=consumable 时生效） */
  effect: z.enum(['speed', 'photo_bonus', 'fare_free']).optional(),
  /** 效果持续秒数（0=即时） */
  durationSec: z.number().int().min(0).default(0),
  /** 材料礼包：入背包的元素 id + 数量（kind=material） */
  grants: z.array(z.object({ id: z.string(), n: z.number().int().positive() })).default([]),
  /** 相机皮肤样式名（kind=camera） */
  skin: z.string().optional(),
  /** 美食种类标识（kind=food，同一 foodTag 只计一种，供 daily:food 去重） */
  foodTag: z.string().optional(),
  icon: z.string().optional(),
  enabled: z.boolean().default(true),
});

/** 地标投资配置（场景级默认值，可按地标覆盖） */
export const investConfigSchema = z.object({
  /** 每级投资额（线性） */
  baseCost: z.number().int().min(1).default(800),
  /** 每级每小时被动收益 */
  incomePerHour: z.number().int().min(1).default(300),
  /** 最大等级 */
  maxLevel: z.number().int().min(1).default(10),
});

export type ShopItem = z.infer<typeof shopItemSchema>;
export type ShopItemKind = z.infer<typeof shopItemKindSchema>;
export type InvestConfig = z.infer<typeof investConfigSchema>;
