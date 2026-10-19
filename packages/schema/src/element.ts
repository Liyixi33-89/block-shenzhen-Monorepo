// 元素 Schema：可渲染的最小构件（自定义元素的核心）
// 元素 = 材质 + 几何参数。场景/地标通过元素 ID 组合复用。
// 自定义元素的本质：elementFactory 注册表可由后台扩展（内置 + 后台新增）。
import { z } from 'zod';
import { colorSchema, materialSchema } from './common.ts';

/** 几何类型：与引擎 Builder API 对应（box/boxC/prism/beam/hipRoof/sign） */
export const geometryKindSchema = z.enum(['box', 'boxC', 'prism', 'beam', 'hipRoof', 'sign']);

/** 一段几何的参数集（不同 kind 取用不同字段，引擎侧按 kind 解释） */
export const geometryParamsSchema = z.object({
  /** 盒体两角点（box） */
  box: z.object({
    x0: z.number(), y0: z.number(), z0: z.number(),
    x1: z.number(), y1: z.number(), z1: z.number(),
  }).optional(),
  /** 中心盒体（boxC） */
  boxC: z.object({
    cx: z.number(), cy: z.number(), cz: z.number(),
    w: z.number().positive(), h: z.number().positive(), d: z.number().positive(),
  }).optional(),
  /** 圆柱/圆台（prism） */
  prism: z.object({
    x: z.number(), z: z.number(),
    y0: z.number(), y1: z.number(),
    rx0: z.number().nonnegative(), rz0: z.number().nonnegative(),
    rx1: z.number().nonnegative().optional(),  // 收分顶，缺省同底
    rz1: z.number().nonnegative().optional(),
    segments: z.number().int().min(3).max(32).default(12),
  }).optional(),
  /** 线梁（beam） */
  beam: z.object({
    x0: z.number(), y0: z.number(), z0: z.number(),
    x1: z.number(), y1: z.number(), z1: z.number(),
    w: z.number().positive(),
  }).optional(),
  /** 歇山顶（hipRoof） */
  hipRoof: z.object({
    x: z.number(), z: z.number(),
    w: z.number().positive(), h: z.number().positive(), d: z.number().positive(),
  }).optional(),
  /** 文字招牌（sign） */
  sign: z.object({
    text: z.string().min(1),
    x: z.number(), y: z.number(), z: z.number(),
    height: z.number().positive(),
    rotation: z.number().default(0),
    bg: colorSchema.optional(),
    fg: colorSchema.optional(),
    glow: z.boolean().default(false),
  }).optional(),
});

export const elementGeometrySchema = z.object({
  kind: geometryKindSchema,
  params: geometryParamsSchema,
  material: materialSchema.default('default'),
  color: colorSchema,
  solid: z.boolean().default(true),
});

export type GeometryKind = z.infer<typeof geometryKindSchema>;
export type ElementGeometry = z.infer<typeof elementGeometrySchema>;

/**
 * 元素定义：
 * - builtin: 引擎代码内置建模函数的 ID（如 'pingan-tower'），几何由代码生成
 * - procedural: 由 geometry 列表组合而成（后台可创建的自定义元素走这条路）
 */
export const elementSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  /** builtin 元素对应的引擎建模器 ID；procedural 元素省略 */
  builder: z.string().optional(),
  geometry: z.array(elementGeometrySchema).default([]),
  /** 元素分类：建筑/自然/交通/装饰 */
  category: z.enum(['building', 'nature', 'transport', 'decoration']).default('building'),
  tags: z.array(z.string()).default([]),
});

export type Element = z.infer<typeof elementSchema>;
