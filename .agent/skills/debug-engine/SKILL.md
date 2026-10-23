---
name: debug-engine
description: "排查引擎/玩法问题。当用户说玩法不生效、渲染有问题、进游戏异常、某功能坏了时触发。步骤：四步排查（内容发布→schema→引擎读取→构建产物）→ 对照 pitfalls → 定位修复。"
---

# 引擎/玩法排查（Debug Engine）

## 目标
系统化定位前端引擎/玩法/渲染问题，避免凭感觉瞎试。

## 步骤

1. **四步排查（改内容不生效时优先）**
   1. **内容是否发布**：web 读的是后端 `/api/content/scenes/shenzhen-main`，本地 JSON 是兜底。确认改动是否发布（`curl` 看 version）。
   2. **schema 校验**：确认内容过 `validateScene`，字段符合 schema（避免宽松校验吞掉错值）。
   3. **引擎是否读取**：确认引擎确实消费了该字段（`search_content` 定位读取点）。
   4. **构建产物是否更新**：`cd apps/web && node ../../node_modules/vite/bin/vite.js build`，确认不是旧产物。

2. **对照 pitfalls（重点先查已知坑）**
   - 渲染怪象：车流横开/车轮竖插/合并怪影/每帧卡顿 → `.agent/pitfalls.md` 对应条目。
   - 内存问题：粒子贴图泄漏/BuildMode 泄漏/player 泄漏/碰撞盒累积。
   - 存档问题：新增字段丢失/出生点不生效。

3. **定位根因**
   - 用 `outline` + `search_content` 定位相关函数与读取点。
   - 检查事件总线订阅、services/api 出口、存档编解码映射。

4. **修复并验证**
   - 最小改动修复；跑构建 + check-layering。
   - 若涉及渲染性能，复查每帧 `new` 与实例化方式。

## 常用定位点

| 症状 | 定位 |
|---|---|
| 玩法规则不生效 | `domain/gameplay.ts` |
| 加载/出生/回档 | `engine/engine.ts` |
| 世界渲染/道路/车流 | `engine/world.ts` |
| 乘车 | `engine/transit.ts` |
| 存档字段 | `services/saveCodec.ts` |
| 内容拉取 | `services/content.ts` / `services/api.ts` |
| 模式路由/HUD | `composables/useGameShell.ts` |

## 验证
- 问题复现消失；构建 + 分层守护通过。

## 参考
- `.agent/pitfalls.md`（已知坑，优先对照）
- `.agent/knowledge/frontend/faq.md`（高频疑问）
- `.agent/commands.md`（构建/验证命令）