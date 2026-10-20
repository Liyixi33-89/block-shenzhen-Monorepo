# PRD：方块鹏城「内容后台可配置化」改造

> 目标：把散落在前端源码里的静态硬编码数据，迁移为「由 Admin 后台编辑、随场景发布、运行时下发的配置」，让非开发人员（运营/策划）能在线调整游戏内容，无需改代码、发版。
>
> 状态：提案（草案）
> 关联：场景仓库已支持 draft/publish 版本管理、admin 认证、宽松 schema 校验，本 PRD 全部基于现有链路扩展，不引入新架构。

---

## 1. 背景与现状

当前游戏内容的**数据源分三层**，可配置程度参差不齐：

| 分层 | 说明 | 现状 |
|---|---|---|
| **场景 JSON（后端 MySQL）** | `scenes` 表 draft/published 版本，`/api/content/scenes/{id}` 下发 | ✅ 已后台化（但缺编辑器） |
| **前端硬编码常量** | 写死在 `engine/*.ts`、`domain/gameplay.ts`、`packages/shared/constants.ts` | ❌ 改需改代码发版 |
| **前端程序化建模** | `engine/builders.ts` 25 个地标用代码堆几何体 | ❌ 改需改代码发版 |

Admin 后台现有页签：`场景 / 地标 / 出生点 / 传送点 / 任务 / 区划 / 分析 / 版本 / JSON`。
**缺口**：商店、投资、NPC、元素、建造配方、交通、飞升、每日任务、环境参数、经济参数——要么只能靠 JSON 手改，要么连 JSON 都改不了（硬编码）。

---

## 2. 目标与非目标

### 目标
1. 让**「场景 JSON 已承载但 admin 缺编辑器」**的数据全部可视化编辑（P0）。
2. 让**「纯前端硬编码」**的玩法/环境/经济参数进 scene schema，随版本下发（P1）。
3. 让**「程序化建模」**的地标逐步被数据驱动 geometry 替代，最终 builders.ts 只留兜底（P2，长期）。

### 非目标
- 不把渲染引擎本身（three.js 装配、动画、粒子）做成可配置——那是代码不是内容。
- 不做运行时热更覆盖线上版本（继续走 draft→publish 的版本语义）。
- 不做玩家侧的自定义场景编辑器。

---

## 3. 数据盘点：硬编码清单（按优先级）

### 3.1 A 类：场景 JSON 已承载，但 admin 无编辑器 ⚠️ 最高优先
这些数据**已经能通过 JSON 页签改**，但易错、门槛高。补可视化编辑器即可。

| 数据 | schema 来源 | 现状入口 | 改造 |
|---|---|---|---|
| 商店商品 `shopItems`（12 商品 + 20 纪念品） | `schema/shop.ts` | 仅 JSON | 新增 `ShopEditor.vue` |
| 地标投资 `invest`（¥800×等级 / ¥300时 / 被动收入） | `schema/shop.ts` | 仅 JSON | 并入 ShopEditor |
| NPC 列表 `npcs`（6 静态 + 16 动态实体、对话树、店铺货架） | `schema/npc.ts` | 仅 JSON | 新增 `NpcEditor.vue`（含对话树/货架） |
| 建造元素 `elements` + 配方 `buildRecipes` | `schema/element.ts`、`schema/build.ts` | 仅 JSON | 新增 `BuildEditor.vue` |
| 交通 `traffic`（34 站 13 线、票价、车辆类型） | `schema/vehicle.ts` | 仅 JSON | 新增 `TrafficEditor.vue` |
| 飞升阶段 `ascension` | `schema/ascension.ts` | 仅 JSON | 新增 `AscensionEditor.vue` |
| 每日任务（10 条 `daily:*`） | `schema/quest.ts`（已支持 cycle=daily） | QuestEditor 已支持 daily | 微调：补 daily 条件类型说明 |

### 3.2 B 类：纯前端硬编码，需新增 scene 字段 ⚠️ 高优先
这些**不在 scene schema 里**，是写死在 `.ts` 的常量。要后台化须先在 `sceneSchema` 加字段（默认值=当前硬编码值，向后兼容）。

#### B1 经济参数（`domain/gameplay.ts`、`engine/engine.ts`）
| 常量 | 值 | 位置 |
|---|---|---|
| 首次拍照奖励 | ¥50（季票×2） | `gameplay.ts:120` |
| 复拍奖励 | ¥5 | `gameplay.ts:120` |
| 首拍飞升点 | +10 | `gameplay.ts:111` |
| 任务完成飞升点 | +20 | `gameplay.ts:333` |
| 作品导入费 | ¥200 | `engine.ts:508` |
| 投资被动收入结算间隔 | 30s | `engine.ts:610` |
| 步行每日任务计数阈值 | 50 单位 | `gameplay.ts:165` |

#### B2 环境与运行参数
| 常量 | 值 | 位置 |
|---|---|---|
| 动态随机 NPC 数量 | 16 | `engine.ts:239` |
| NPC 对话半径 | 26 | `npc.ts:31` |
| 动态 NPC 职业池/姓氏池/对白池/小摊 | 见 `npc.ts:49-120` | `npc.ts` |
| 日夜：游戏秒速、起始时刻、夜晚区间 | 40x、08:00、19.5~6.5 | `daynight.ts:7-12` |
| 天气：天气池权重、切换间隔、粒子数 | sunny×2/cloudy/rain/snow、30-80s | `weather.ts:7-48` |
| 出生点外移距离 | 55 | `engine.ts:175` |
| 建造网格/半径/上限 | 8 / 90 / 400 | `build.ts:27-29` |
| 传送冷却 | 20s | `teleport.ts` |
| 到访判定半径默认 | 600 | `gameplay.ts:365` |

#### B3 地图/投影与 UI 常量
| 常量 | 值 | 位置 |
|---|---|---|
| 1km=200 单位、远距压缩 0.35 | — | `shared/constants.ts`（已在 scene.projection，✅ 已后台化） |
| 区主题色/区名 | — | `shared/constants.ts`（**建议并入 district schema**） |
| 观景台登顶高度 | LABEL_HEIGHT[id]+6 | `engine.ts:471`、`builders.ts` |

### 3.3 C 类：程序化建模（长期，P2）
`engine/builders.ts` 25 个地标全部用 `THREE` 代码硬堆几何体（塔高、楼层、颜色、贴图）。这属于「代码即内容」，最重最难后台化。建议分两步：

1. **P2a**：为每个地标新增 `landmark.geometry`（schema 已支持 `procedural 几何列表`），把常用像素建筑（塔楼/裙楼/底座/装饰）用数据描述，`builders.ts` 逐步迁移为「builder 缺省时走 geometry」。
2. **P2b**：`builders.ts` 只保留 GLTF 资产加载（P2 管线已支持 `models/…/{id}.glb`），复杂造型由 3D 资产后台上传，代码归零。

> ⚠️ 这是最大工程项，建议独立立项、排期，不在本次 A/B 类一起做。

---

## 4. 方案设计

### 4.1 Schema 扩展（B 类数据入库）

在 `sceneSchema` 增加一个**可选** `config` 聚合对象（缺省整体为空，前端用默认常量兜底，保证旧场景零破坏）：

```ts
// schema/scene.ts 新增（示意）
config: z.object({
  economy: z.object({
    photoFirstReward: z.number().default(50),
    photoRepeatReward: z.number().default(5),
    photoFirstAscension: z.number().default(10),
    questAscension: z.number().default(20),
    galleryImportFee: z.number().default(200),
    investSettleSeconds: z.number().default(30),
    walkDailyStep: z.number().default(50),
  }).default({}),
  env: z.object({
    dynamicNpcCount: z.number().default(16),
    npcTalkRadius: z.number().default(26),
    npcSurnames: z.array(z.string()).default([]),      // 空=用内置池
    npcJobs: z.array(z.object({                        // 职业池（可覆盖/追加）
      id, honorific, body, hat, weight, lines, rain?, night?, tip?, stall?
    })).default([]),
    dayNight: z.object({ secPerRealSec, startHour, nightStart, nightEnd }).default({}),
    weather: z.object({ pool, switchMinSec, switchMaxSec }).default({}),
    build: z.object({ grid, maxRange, maxPlacements }).default({}),
    teleportCooldownSec: z.number().default(20),
  }).default({}),
}).default({})
```

- 后端 `SceneSchema.validateScene` 用 Jackson 宽松校验（只查 list/map 字段），**默认接受新字段**，零改动即可透传。✅ 已验证。
- 前端 `world.ts`/`engine.ts` 读取 `scene.config ?? {}`，与现有常量做 `??` 兜底合并，逐点替换。
- `version` 递增规则不变（draft 严格大于已发布才可 publish）。

### 4.2 前端消费改造

原则：**读场景配置优先，读不到用内置常量**。改动集中在各 engine 模块构造入口传参：

```ts
// engine.ts 示例
const cfg = this.sceneData!.config ?? {};
this.npc = new NpcSystem({
  ...
  dynamicCount: cfg.env?.dynamicNpcCount ?? 16,
  surnames: cfg.env?.npcSurnames?.length ? cfg.env.npcSurnames : undefined,
  jobs: cfg.env?.npcJobs?.length ? cfg.env.npcJobs : undefined,
});
```

涉及文件：`engine.ts`、`daynight.ts`、`weather.ts`、`build.ts`、`teleport.ts`、`domain/gameplay.ts`、`engine/npc.ts`。

### 4.3 Admin 后台新增页签

在 `apps/admin/src/App.vue` 的 `Tab` 与导航中追加（按 3.1 清单）：

| 新页签 | 组件 | 主要字段 |
|---|---|---|
| `商店` | `ShopEditor.vue` | 商品列表（id/名称/价格/类别/图标/效果/描述）、纪念品标记、投资配置（基数/每级/每小时收益/等级上限） |
| `NPC` | `NpcEditor.vue` | NPC 列表 + 对话树（节点/分支/效果）+ 店铺货架 + 动态职业池编辑 |
| `建造` | `BuildEditor.vue` | 元素几何表（box/prism/beam/sign）+ 配方（产出/费用/前置/启停） |
| `交通` | `TrafficEditor.vue` | 线路列表（名称/车辆/票价/颜色）+ 站点列表（名称/经纬度/所属线） |
| `飞升` | `AscensionEditor.vue` | 阶段列表（名称/飞升点/解锁能力/前置） |
| `环境` | `EnvConfigEditor.vue` | 经济参数、日夜、天气、建造、NPC 动态池、传送冷却（B 类 config 的可视化表单） |

> 所有编辑器沿用现有 `doc.touch()` / `doc.saveDraft()` / `doc.publish()` 模式，DOM 类名遵循 e2e 契约（`.item-list/.form-pane`）。

### 4.4 发布链路

- 每个编辑器写入 `doc.scene.value.xxx`（同一份草稿对象），保存草稿 → 校验 → 发布。
- 前端 `fetchScene` 拉已发布版本即生效，玩家端刷新即获得新配置。
- **灰度**：现有 `playerId` 分桶灰度已支持整包版本，config 随版本走，天然受控。

---

## 5. 里程碑拆解

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **M1（P0，A 类）** | 新增 ShopEditor / NpcEditor / BuildEditor / TrafficEditor / AscensionEditor，场景 config 空 | 五大编辑器可在 admin 增删改并发布；前端行为不变 |
| **M2（P1，B 类）** | sceneSchema 加 `config`；经济/环境参数读配置；Admin 加 EnvConfigEditor | 后台改拍照奖励/动态NPC数/日夜/天气/建造网格，发布后前端生效 |
| **M3（P2，C 类）** | 地标 geometry 数据化迁移，builders.ts 兜底化 | 至少 25 地标中一半以上可纯数据描述，builder 仅作缺省 |

---

## 6. 风险与注意

1. **`builders.ts` 迁移风险最高**：程序化建模依赖代码内几何/颜色/LABEL_HEIGHT，数据化需重新定义几何 DSL，工作量接近重建。**建议独立排期**，M1/M2 先行。
2. **向后兼容**：`config` 必须整体可选 + 字段级默认值，旧场景（无 config）完全走内置常量，保证线上 0.3.7 无缝。
3. **宽松校验是把双刃剑**：后端只查 list/map 结构，**新增字段透传但不去重/不强类型**，错误配置需前端运行时兜底（`??` + 阈值 clamp），避免崩白屏。
4. **经济参数敏感**：拍照/投资/导入费直接关系玩家收益，改动前建议在「版本」页留 diff，回滚依赖现有 rollback 能力。
5. **e2e 契约**：新增编辑器 DOM 类名必须延续 `.item-list/.form-pane/.ana-table` 等既有类，勿破坏 web/admin 现有 e2e。
6. **每日任务**：`daily:*` 键在 `collect` 分支已支持，`QuestEditor` 已能配 daily，仅需补 UI 提示，不新增字段。

---

## 7. 待确认问题

1. `builders.ts` 的 25 个地标是否全部接受「数据化 + 兜底」迁移，还是保留 GLTF 资产路线（P2 管线已就绪）？→ 影响 M3 排期与工作量。
2. 区主题色 `DISTRICT_COLORS` 是否并入 `district` schema 一并后台化？（推荐：是，成本低价值高）
3. 经济参数后台化后，是否需要「参数改动审计日志」？（建议与版本 diff 复用）
4. 本期是否只做 M1+M2，M3 另行立项？（推荐：是）

---

*文档生成于 2026-10-19，基于当前代码快照（场景 v0.3.7、schema 全量、admin 7 编辑器）。*