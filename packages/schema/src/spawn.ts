// 出生点与传送点 Schema（P5 地图传送功能的 Schema 先行）
import { z } from 'zod';
import { latLngSchema } from './common.ts';

/** 出生点：新游戏选择菜单 */
export const spawnPointSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),                 // 如「平安金融中心」
  district: z.string(),
  blurb: z.string().default(''),           // 如「CBD天际线」
  latlng: latLngSchema,
  facing: z.number().default(0),           // 出生朝向（弧度）
});

/** 传送点：解锁后可快速移动（P5 实现，Schema 与后台先行） */
export const teleportPointSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  latlng: latLngSchema,
  /** 解锁条件：到访过某地标 / 完成某任务 / 无条件 */
  unlock: z.discriminatedUnion('type', [
    z.object({ type: z.literal('free') }),
    z.object({ type: z.literal('visited'), landmark: z.string() }),
    z.object({ type: z.literal('quest'), quest: z.string() }),
  ]).default({ type: 'free' }),
  /** 冷却（秒）；0 = 无冷却 */
  cooldownSec: z.number().int().min(0).default(0),
  /** 传送消耗 */
  cost: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
});

export type SpawnPoint = z.infer<typeof spawnPointSchema>;
export type TeleportPoint = z.infer<typeof teleportPointSchema>;
