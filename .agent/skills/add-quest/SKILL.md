---
name: add-quest
description: "往场景加一个任务。当用户要加任务、新任务、每日任务、加一个 quest 时触发。步骤：选条件类型 → 加 JSON（cond/reward/cycle）→ 过 schema → 验证。"
---

# 加一个任务（quest）

## 目标
在 `shenzhen-main.json` 的 `quests` 数组新增一个任务（含条件、奖励、周期）。

## 前置条件
- 明确任务的触发条件类型与目标/参数

## 步骤

1. **定位**
   - 内容：`apps/web/public/content/shenzhen-main.json` 的 `quests`
   - Schema：`packages/schema/src/quest.ts`
   - 条件判定实现：`apps/web/src/domain/gameplay.ts`

2. **选条件类型（cond）**——按需选一：
   | type | 字段 | 例子 |
   |---|---|---|
   | visit | target=地标id | 到访平安金融中心 |
   | photo | target=地标id | 拍深圳湾 |
   | walk | meters | 走 500m |
   | ride | vehicle=bus/metro/boat/cable | 乘巴士 |
   | districts | n | 探索 3 个区 |
   | money | amount | 持有 ¥1000 |
   | collect | item, n | 收集美食 x3 |
   | interact | target | 完成指定交互 |

3. **写任务 JSON**
   ```json
   {
     "id": "unique-quest-id",
     "title": "任务标题",
     "desc": "任务描述",
     "requires": [],                  // 前置任务 id，全完成后解锁
     "cond": { "type": "visit", "target": "some-landmark" },
     "reward": { "money": 500, "items": [], "ascension": 0 },
     "cycle": "once",                 // 或 "daily"（每日刷新）
     "enabled": true
   }
   ```

4. **过 schema 校验**（`validateScene`）。

5. **验证**
   - 本地进游戏确认任务出现在任务面板，条件满足可完成、奖励到账。
   - 若 `cycle=daily` 确认每日刷新逻辑（gameplay.ts）。

## 验证
- `validateScene` 通过
- 游戏内：任务可接、条件可推进、完成发奖

## 参考
- `.agent/knowledge/shared/data-model.md`（quest 字段）
- `.agent/tasks.md`（任务相关）
- `.agent/pitfalls.md`（新增字段两处映射，若涉及存档）