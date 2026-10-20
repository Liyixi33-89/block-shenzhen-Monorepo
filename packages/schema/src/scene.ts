// 场景 Schema：一个完整的可玩世界（自定义场景 = 一份 scene JSON）
import { z } from 'zod';
import { districtSchema } from './district.ts';
import { landmarkSchema } from './landmark.ts';
import { elementSchema } from './element.ts';
import { questSchema } from './quest.ts';
import { npcSchema } from './npc.ts';
import { trafficSchema } from './vehicle.ts';
import { spawnPointSchema, teleportPointSchema } from './spawn.ts';
import { buildRecipeSchema } from './build.ts';
import { ascensionSchema } from './ascension.ts';
import { shopItemSchema, investConfigSchema } from './shop.ts';

/** 动态随机 NPC 职业配置（覆盖内置职业池；字段缺省沿用内置对应字段语义） */
export const npcJobSchema = z.object({
  /** 职业称呼后缀（如「先生」「同学」） */
  honorific: z.string().min(1),
  /** 躯干主色（0xRRGGBB 数字） */
  body: z.number().int().nonnegative(),
  /** 帽子颜色 */
  hat: z.number().int().nonnegative(),
  /** 随机权重（≥1） */
  weight: z.number().int().min(1).default(1),
  /** 正常对白池（每条一句话） */
  lines: z.array(z.string().min(1)).default([]),
  /** 雨天对白池（缺省沿用 lines） */
  rain: z.array(z.string().min(1)).default([]),
  /** 夜晚对白池（缺省沿用 lines） */
  night: z.array(z.string().min(1)).default([]),
  /** 偶发赠予金额（缺省 0 不给） */
  tip: z.number().int().min(0).default(0),
  /** 移动小摊商品 id 池（缺省无摊） */
  stall: z.array(z.string()).default([]),
});
export type NpcJobConfig = z.infer<typeof npcJobSchema>;

/** 运行时环境配置（全部可选：缺省 = 引擎内置常量，旧场景零破坏） */
export const envConfigSchema = z.object({
  npc: z.object({
    /** 动态随机 NPC 数量（0 关闭） */
    dynamicCount: z.number().int().min(0).optional(),
    /** 随机姓氏池（空/缺省 = 内置 15 个广府姓氏） */
    surnames: z.array(z.string().min(1)).optional(),
    /** 职业池（覆盖内置 7 职业；空数组忽略） */
    jobs: z.array(npcJobSchema).optional(),
    /** 游走范围（世界坐标） */
    range: z.object({
      xMin: z.number(), xMax: z.number(),
      zMin: z.number(), zMax: z.number(),
    }).optional(),
  }).default({}),
});

export const sceneConfigSchema = z.object({
  env: envConfigSchema.default({}),
});

export const sceneSchema = z.object({
  /** 场景 ID：主场景为 'shenzhen-main' */
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  desc: z.string().default(''),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),   // semver，发布后不可变
  /** 投影原点与比例（默认深圳市民中心） */
  projection: z.object({
    origin: z.object({ lat: z.number(), lng: z.number() }),
    unitPerKm: z.number().positive().default(200),
    farCompress: z.number().positive().default(0.35),
  }),
  districts: z.array(districtSchema),
  elements: z.array(elementSchema).default([]),
  landmarks: z.array(landmarkSchema),
  quests: z.array(questSchema).default([]),
  npcs: z.array(npcSchema).default([]),
  traffic: trafficSchema.optional(),
  spawnPoints: z.array(spawnPointSchema).min(1),
  teleportPoints: z.array(teleportPointSchema).default([]),
  buildRecipes: z.array(buildRecipeSchema).default([]),
  ascension: ascensionSchema.optional(),
  /** 商店（P2 经济：空则商店不开启） */
  shopItems: z.array(shopItemSchema).default([]),
  /** 地标投资配置（P2 经济：到访过的地标可投资获被动收入） */
  invest: investConfigSchema.optional(),
  /** 运行时环境配置（缺省 = 引擎内置常量，宽松透传） */
  config: sceneConfigSchema.default({}),
});

export type Scene = z.infer<typeof sceneSchema>;

/** 内容包校验入口：后台发布前、客户端加载前都调用 */
export function validateScene(data: unknown) {
  const result = sceneSchema.safeParse(data);
  if (result.success) return { ok: true as const, data: result.data };
  return { ok: false as const, errors: result.error.issues.map(i => ({
    path: i.path.join('.'),
    message: i.message,
  })) };
}
