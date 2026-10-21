// 飞升 Schema（P5 进度系统：阶段树 + 能力解锁，内容后台可配）
import { z } from 'zod';

/** 飞升阶段：逐级解锁能力 */
export const ascensionStageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),               // 如「鹏城新客」
  desc: z.string().default(''),
  /** 升级到本阶段所需飞升点 */
  points: z.number().int().min(0),
  /** 解锁的能力开关（引擎按 key 读取；地铁免票/摄影加成走商店道具，非阶段解锁） */
  unlocks: z.array(z.enum([
    'build',           // 建造模式
    'teleport',        // 地图传送
    'fly',             // 飞行/俯瞰
  ])).default([]),
  /** 前置阶段 */
  requires: z.array(z.string()).default([]),
});

export const ascensionSchema = z.object({
  stages: z.array(ascensionStageSchema).min(1),
});

export type AscensionStage = z.infer<typeof ascensionStageSchema>;
export type Ascension = z.infer<typeof ascensionSchema>;
