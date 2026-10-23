# 产品与架构文档索引（docs/）

> `docs/` 存放产品/架构级**长文档**（方案、PRD、对标）。它们偏「决策依据/方向」，不随代码热更新，故放 docs 而非按端知识库。本文件是**检索入口 + 要点提炼**，深读请打开对应原文档。

## 文档清单

| 文档 | 主题 | 状态 |
|---|---|---|
| `FRONTEND-ARCHITECTURE.md` | 前端洋葱分层重构方案 | 已接受(2026-10-16)·已落地 |
| `PRD-ADMIN-可配置化.md` | 内容后台可配置化改造 PRD | 提案(草案) |
| `COMPARE-GUANGZHOU-REF.md` | 对比参考站「方块羊城」产品对标 | 分析(2026-10-19) |

---

## FRONTEND-ARCHITECTURE.md — 前端架构重构方案

**状态**：已接受并落地（洋葱分层现已是 `apps/web` 实际架构，详见 `frontend/architecture.md`）。本文是**完整方案文档**（诊断依据 + 目标 + 依赖规则 + 验证契约）。

要点提炼：
- **三类熵增诊断**：面条式依赖（engine.ts 上帝类）、复制式膨胀（materializeLockedSystems 复制构造、fetch 三处重写）、黑洞式构建（无分包/体积预算/分层守护）。
- **洋葱分层**：views→engine(组合根)→domain→services→infra，依赖只能外→内。
- **分层守护**：`scripts/check-layering.mjs` 机器执行 4 条依赖规则 + fetch 收敛（见 `shared/engineering.md`）。
- **构建体积预算**：总产物 ≤700KB（gzip 前），three 独立 chunk。
- **验证契约**：e2e 调试面（`window.__engine`）、`events` 数组、构建、类型四项不改外置可观测行为。
- **后续演进**（技术债）：4 个 DOM 面板迁 Vue、check-layering 演进 ESLint、HUD 轮询改订阅、schema TS5097 修复。

---

## PRD-ADMIN-可配置化.md — 内容后台可配置化

**状态**：提案（草案）。目标：把散落前端源码的静态硬编码迁移为「后台编辑、随场景发布、运行时下发」，让运营/策划在线调整。

**数据源三层现状**：
| 分层 | 现状 |
|---|---|
| 场景 JSON（后端 MySQL） | ✅ 已后台化（但缺编辑器） |
| 前端硬编码常量（engine/*.ts、domain/gameplay.ts、shared/constants.ts） | ❌ 改需改代码发版 |
| 前端程序化建模（builders.ts 25 地标代码堆几何） | ❌ 改需改代码发版 |

**三类改造优先级**：
- **A 类（最高）**：场景 JSON 已承载但 admin 缺编辑器 → 新增 ShopEditor/NpcEditor/BuildEditor/TrafficEditor/AscensionEditor。
- **B 类（高）**：纯前端硬编码 → sceneSchema 加 `config` 聚合对象（economy/env 子对象，默认值=硬编码值，向后兼容），前端 `??` 兜底合并。涉及 `engine.ts`/`daynight.ts`/`weather.ts`/`build.ts`/`teleport.ts`/`domain/gameplay.ts`/`engine/npc.ts`。
- **C 类（长期 P2）**：builders.ts 程序化建模 → `landmark.geometry` 数据化 → GLTF 资产。风险最高，建议独立排期。

**里程碑**：M1(A类编辑器) → M2(B类 config 入库+EnvConfigEditor) → M3(C类数据化)。

**关键风险**：config 必须整体可选+字段级默认（旧场景零破坏）；宽松校验透传不去重，前端运行时兜底 clamp；经济参数敏感需 diff/回滚。

> ⚠️ 注意：**B 类 config 目前只实现了 `config.env.npc` 子集**（见 `shared/schema.md` 的 envConfigSchema）。economy/env 其余字段（拍照奖励/日夜/天气/建造网格等）是 PRD 规划、尚未全部落地。

---

## COMPARE-GUANGZHOU-REF.md — 对比参考站「方块羊城」

**状态**：产品对标分析。参考站 `522e7c37.pinme.dev`（PinMe/IPFS 托管）。

**本地缺失的核心玩法**（参考站独有）：
1. 美食系统（9 种广府美食，任务已引用 `daily:food` 但无来源）
2. 广府文化图鉴（任务已引用 `daily:culture`，无来源）
3. 纪念品/收藏系统（20+ 种）
4. 天气系统（雨雪粒子 + NPC 天气对白）
5. 日夜循环（`timeSpeed`/`setTime` + 曝光调整）
6. 观景台登顶（deck）
7. 自拍玩法（任务已引用 `daily:selfie`，无实现）
8. 动态随机 NPC（本地已实现，见 `frontend/modules.md` npc）
9. 特殊交通（观光巴士/夜游/索道）

**关键实现路径提示**：`Gameplay.evalCond` 的 `daily:xxx` 分支目前仅支持 `daily:photo`，其余走死路——需为 food/culture/selfie/nightPhoto 等增加真实计数来源（事件驱动）。

**本地优势**：建造系统+作品广场、商店+地标投资、飞升系统、全栈云存档、灰度/版本管理、埋点、触控适配、GLTF 渲染管线。

> ⚠️ 注意：其中**日夜循环、天气系统、动态随机 NPC、观景台登顶已陆续实现**（见 `frontend/modules.md` 的 daynight/weather/npc/deck），对标文档（2026-10-19）早于部分实现，涉及状态以代码为准。