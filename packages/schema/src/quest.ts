// 任务 Schema：任务链/每日任务/条件与奖励
import { z } from 'zod';

/** 任务条件类型（与引擎 gameplay 对齐） */
export const questCondSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visit'), target: z.string() }),                    // 到访地标
  z.object({ type: z.literal('photo'), target: z.string() }),                    // 拍摄地标
  z.object({ type: z.literal('walk'), meters: z.number().positive() }),          // 步行距离
  z.object({ type: z.literal('ride'), vehicle: z.enum(['bus', 'metro', 'boat', 'cable']) }),
  z.object({ type: z.literal('districts'), n: z.number().int().positive() }),    // 探索 n 个区
  z.object({ type: z.literal('money'), amount: z.number().positive() }),         // 持有金钱
  z.object({ type: z.literal('collect'), item: z.string(), n: z.number().int().positive() }), // 收集物品
  z.object({ type: z.literal('interact'), target: z.string() }),                 // 完成指定交互
]);

export const questRewardSchema = z.object({
  money: z.number().int().min(0).default(0),
  items: z.array(z.object({ id: z.string(), n: z.number().int().positive().default(1) })).default([]),
  /** 飞升点数（P5 预留） */
  ascension: z.number().int().min(0).default(0),
});

export const questSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  title: z.string().min(1),
  desc: z.string().default(''),
  /** 前置任务（全部完成后解锁） */
  requires: z.array(z.string()).default([]),
  cond: questCondSchema,
  reward: questRewardSchema,
  /** daily 任务每日刷新 */
  cycle: z.enum(['once', 'daily']).default('once'),
  enabled: z.boolean().default(true),
});

export type Quest = z.infer<typeof questSchema>;
export type QuestCond = z.infer<typeof questCondSchema>;
export type QuestReward = z.infer<typeof questRewardSchema>;
