# Schema 包结构与校验（packages/schema）

> `@block-sz/schema` 是内容 JSON 与玩家存档的**类型与校验权威**（zod），前端/后台/后端共用。字段**语义**见 `data-model.md`，本文件补**结构地图与校验规则**。源码在 `packages/schema/src/*.ts`。

## 包定位

- 前端、后台、后端**三端共用**：内容 JSON 校验（`validateScene`）、玩家存档校验（`validatePlayerSave`）。
- 入口 `src/index.ts` re-export 全部 schema 文件，并定义 `playerSaveSchema`。
- 校验唯一入口：`validateScene(data)` / `validatePlayerSave(data)`，返回 `{ ok, data | errors }`。
- 后端 Java 用 Jackson 宽松校验（只查 list/map 结构），**不是** zod；两边需人工对齐。

## 文件地图

| 文件 | 定义 | 说明 |
|---|---|---|
| `scene.ts` | `sceneSchema`/`Scene` | 场景顶层（投影/区/地标/任务/NPC/交通/商店/飞升/config）+ `validateScene` |
| `district.ts` | `districtSchema` | 区划 |
| `landmark.ts` | `landmarkSchema` | 地标 |
| `quest.ts` | `questSchema` | 任务（cond 判别联合） |
| `npc.ts` | `npcSchema` | 静态 NPC（对话树/货架） |
| `vehicle.ts` | `trafficSchema` | 交通（站点/线路） |
| `spawn.ts` | `spawnPointSchema`/`teleportPointSchema` | 出生点/传送点 |
| `build.ts` | `buildRecipeSchema` | 建造配方 |
| `ascension.ts` | `ascensionSchema` | 飞升阶段 |
| `shop.ts` | `shopItemSchema`/`investConfigSchema` | 商店商品/地标投资 |
| `element.ts` | `elementSchema` | 建造元素几何 |
| `common.ts` | 公共类型 | 经纬度/坐标等 |
| `index.ts` | `playerSaveSchema`/`PlayerSave` + 全部 re-export | 存档 schema + `validatePlayerSave` |

## sceneSchema 关键字段与校验约束

- `id`：`^[a-z][a-z0-9_-]*$`，主场景 `shenzhen-main`。
- `version`：semver `^\d+\.\d+\.\d+$`，**发布后不可变，须严格递增**。
- `projection`：`origin{lat,lng}` + `unitPerKm`(默认 200) + `farCompress`(默认 0.35)。
- `spawnPoints`：**`min(1)`**——场景至少 1 个出生点。
- `districts`/`landmarks`：必填数组。
- 多数业务数组（quests/npcs/elements/buildRecipes/teleportPoints/shopItems）默认 `[]`。
- `traffic`/`invest`/`ascension`：optional。
- `config`：运行时环境配置，整体 `default({})`，**全部可选 = 引擎内置常量兜底，旧场景零破坏**。

### config.env 结构（`src/scene.ts` 的 `envConfigSchema`）

```
config.env.npc:
  dynamicCount 动态随机 NPC 数量（0 关闭）
  surnames[]   姓氏池（空/缺省 = 内置 15 广府姓氏）
  jobs[]       职业池 [{honorific, body, hat, weight, lines[], rain[], night[], tip, stall[]}]
  range        {xMin,xMax,zMin,zMax} 游走范围
```

## playerSaveSchema（存档，前后端同构）

`src/index.ts` 定义，客户端本地 + 服务端云存档同构。关键字段：

- `money`(默认 500)/`pos{x,y,z}`/`facing`
- `visited[]`/`photos[]`/`souvenirs[]` 已到访/已拍/纪念品
- `questProgress{questId:{done,progress,doneAt}}` 任务进度
- `inventory{itemId:n}`/`shopBought{itemId:n}` 背包/购买
- `ascensionPoints`/`ascensionStage` 飞升
- `placements[]` 已放置建造物
- `investments{landmarkId:lvl}`/`investSettledAt` 投资
- `activeEffects{effect:expiryMs}` 消耗品效果
- `dailyCounters{daily:xxx:n}`/`dailyStamp` 每日计数（跨天清空）
- `unlockedTeleports[]`/`cameraSkins[]`/`cameraSkin`

## 已知坑

- **TS5097**：schema 源码用 `.ts` 后缀相对导入（`import { z } from 'zod'` 之外的 `./scene.ts`），直接对 `packages/schema` 跑 tsc 会报 `TS5097`（需 `allowImportingTsExtensions`）。这是**包自身构建配置**问题，vite 构建不受影响；verify.mjs 的 tsc 步骤因它保持 advisory 不阻断。
- 改 schema 字段后，前端 `domain/gameplay.ts`/`services/saveCodec.ts`、后端 Java 校验类都要对齐（多处映射）。

## 消费入口

- 后台发布前：`validateScene`。
- 客户端加载前：`validateScene`（`services/content.ts` 拉场景后）。
- 云存档：`validatePlayerSave`（`services/cloud.ts`）。