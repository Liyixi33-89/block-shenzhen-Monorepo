// NPC 与对话 Schema
import { z } from 'zod';
import { latLngSchema } from './common.ts';

export const dialogueNodeSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /** 下一个节点；缺省结束对话 */
  next: z.string().optional(),
  /** 选项分支 */
  choices: z.array(z.object({
    text: z.string().min(1),
    next: z.string().optional(),
    /** 触发效果：给钱/给物品 */
    give: z.object({
      money: z.number().int().default(0),
      item: z.string().optional(),
    }).optional(),
  })).default([]),
});

export const npcSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1),
  /** 挂靠地标（可选）或直接经纬度 */
  landmark: z.string().optional(),
  latlng: latLngSchema.optional(),
  /** 对话树入口 */
  dialogue: z.array(dialogueNodeSchema).min(1),
  enabled: z.boolean().default(true),
}).refine(v => v.landmark !== undefined || v.latlng !== undefined, {
  message: 'npc 必须提供 landmark 或 latlng 之一',
});

export type Npc = z.infer<typeof npcSchema>;
export type DialogueNode = z.infer<typeof dialogueNodeSchema>;
