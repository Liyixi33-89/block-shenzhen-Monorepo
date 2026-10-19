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
