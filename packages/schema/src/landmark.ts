// 地标 Schema：深圳 26+ 地标
import { z } from 'zod';
import { latLngSchema } from './common.ts';
import { elementGeometrySchema } from './element.ts';

/** 交互点：拍照点/进入点/触发点 */
export const interactSchema = z.object({
  x: z.number(), z: z.number(),
  r: z.number().positive(),                 // 触发半径
  label: z.string().min(1),
  type: z.enum(['view', 'enter', 'ride', 'shop', 'quest']).default('view'),
  id: z.string().optional(),
});

/** NPC 人群分布 */
export const crowdSchema = z.object({
  x: z.number(), z: z.number(),
  rx: z.number().nonnegative(), rz: z.number().nonnegative(),
  count: z.number().int().min(1).max(200),
});

/** 地标建模来源二选一：builtin builder ID 或 procedural 几何列表 */
export const landmarkSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),                  // 如「平安金融中心」
  district: z.string(),                     // 所属区 ID
  /** 经纬度（引擎按投影换算世界坐标） */
  latlng: latLngSchema,
  /** 交互提示范围（玩家进入此半径显示「按 E 交互」） */
  interactRadius: z.number().positive().default(30),
  /** 图鉴/介绍文案 */
  desc: z.string().default(''),
  descDetail: z.string().optional(),
  /** 建模：builtin builder ID（引擎内置函数）或 procedural 几何 */
  builder: z.string().optional(),
  geometry: z.array(elementGeometrySchema).default([]),
  /** 交互点/人群/地面覆盖（procedural 配套） */
  interacts: z.array(interactSchema).default([]),
  crowds: z.array(crowdSchema).default([]),
  /** 是否可拍照进图鉴 */
  photoable: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  /** 到访赠送的纪念品 id（对应 shopItems 中 kind=souvenir 的商品） */
  souvenir: z.string().optional(),
  /** 是否为可登顶观景台（高层地标：塔顶俯瞰/夜景） */
  deck: z.boolean().optional(),
  enabled: z.boolean().default(true),
});

export type Landmark = z.infer<typeof landmarkSchema>;
export type Interact = z.infer<typeof interactSchema>;
