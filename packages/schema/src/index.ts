// @block-sz/schema 内容 Schema 包入口
export * from './common.ts';
export * from './district.ts';
export * from './element.ts';
export * from './landmark.ts';
export * from './quest.ts';
export * from './npc.ts';
export * from './vehicle.ts';
export * from './spawn.ts';
export * from './build.ts';
export * from './ascension.ts';
export * from './shop.ts';
export * from './scene.ts';

// 存档 Schema（前后端共用）
import { z } from 'zod';

/** 玩家存档：客户端本地 + 服务端云存档同构 */
export const playerSaveSchema = z.object({
  playerId: z.string(),
  sceneId: z.string().default('shenzhen-main'),
  name: z.string().min(1).max(16),
  createdAt: z.string(),
  updatedAt: z.string(),
  money: z.number().int().min(0).default(500),
  pos: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  facing: z.number().default(0),
  /** 已到访地标 */
  visited: z.array(z.string()).default([]),
  /** 已拍摄图鉴 */
  photos: z.array(z.string()).default([]),
  /** 任务进度：questId -> { done, progress } */
  questProgress: z.record(z.object({
    done: z.boolean().default(false),
    progress: z.number().default(0),
    doneAt: z.string().optional(),
  })).default({}),
  /** 物品背包：itemId -> 数量 */
  inventory: z.record(z.number().int().min(0)).default({}),
  /** 飞升点与当前阶段（P5） */
  ascensionPoints: z.number().int().min(0).default(0),
  ascensionStage: z.string().default(''),
  /** 解锁的传送点 */
  unlockedTeleports: z.array(z.string()).default([]),
  /** 已放置的建造物：本地序号 -> 放置数据（世界坐标 + 元素） */
  placements: z.array(z.object({
    n: z.number().int().min(1),
    element: z.string(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    rot: z.number().default(0),
  })).default([]),
  /** 商店购买记录：itemId -> 累计次数（P2 经济） */
  shopBought: z.record(z.number().int().min(0)).default({}),
  /** 已解锁的相机皮肤 */
  cameraSkins: z.array(z.string()).default([]),
  /** 当前装备的相机皮肤 */
  cameraSkin: z.string().default(''),
  /** 地标投资等级：landmarkId -> 等级（P2 经济：被动收入） */
  investments: z.record(z.number().int().min(0)).default({}),
  /** 上次投资收益结算时间（ISO） */
  investSettledAt: z.string().default(''),
  /** 激活中的消耗品效果：effect -> 到期时间戳(ms) */
  activeEffects: z.record(z.number()).default({}),
});

export type PlayerSave = z.infer<typeof playerSaveSchema>;

export function validatePlayerSave(data: unknown) {
  const result = playerSaveSchema.safeParse(data);
  if (result.success) return { ok: true as const, data: result.data };
  return { ok: false as const, errors: result.error.issues.map(i => ({
    path: i.path.join('.'), message: i.message,
  })) };
}
