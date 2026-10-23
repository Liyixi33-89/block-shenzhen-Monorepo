# 架构参考（Architecture）

数据驱动的城市沙盒平台。**核心思想：游戏内容（场景/地标/任务/NPC/交通/建造/经济）全部外置为 JSON，由后台校验发布，前端引擎消费渲染。** 改内容不碰代码；改玩法才碰代码。

## 1. Monorepo 总览

```
block-shenzhen/
├── apps/
│   ├── web/           玩家前端 :5174（Vue3 + three.js，洋葱分层）
│   ├── admin/         内容后台 :5175（Vue3，JSON 编辑→校验→发布）
│   ├── server-java/   后端 API :4001（Java17 + Spring Boot3 + SQLite，DDD 四层）
│   └── server/        旧 Node 服务（废弃，仅参考）
├── packages/
│   ├── schema/        内容 Schema（zod），前后端/后台共用校验
│   └── shared/        投影算法（proj/unproj）+ 常量（单位/区色）
└── scripts/           check-layering.mjs（前端分层守护）
```

依赖用 npm workspaces hoisted 到根 `node_modules/`。

## 2. 前端架构（apps/web）—— 洋葱分层

```
views（视图层）  App.vue / composables / components
  ↓ 只能 import 内层
engine（横切·组合根）  装配实例、注入依赖、主循环、生命周期
  ↓
domain（业务层）  玩法规则 / 事件 / 飞升判定 —— 纯逻辑，无 DOM/three/fetch
  ↓
services（服务层） API / 云存档 / 埋点 / 存档编解码 —— 无 three/Vue
  ↓
infra（基础设施层） localStorage 适配 / 纯工具 —— 无业务依赖
```

**依赖方向**：只允许外→内；内层禁止 import 外层。
- `domain` 只能依赖 `schema`/`shared`（纯类型/纯函数）
- `services` 可依赖 `domain`（事件类型）+ `infra` + `schema`
- `engine`（组合根）可依赖所有内层 + three，但**不被内层 import**（只有 views/e2e 引用它）
- `views` 禁止直接 `fetch`（网络出口必须走 `services/api`）

**engine/ 是组合根**：`engine.ts` 负责装配与生命周期；渲染在 `world.ts`；交互系统独立文件（`photo/transit/npc/build/teleport/...`）。`engine/gameplay.ts`、`engine/ascension.ts`、`engine/cloud.ts`、`engine/analytics.ts` 是 **re-export 桥**（迁移期兼容，保留旧 import 路径）。

关键目录与文件见根 `AGENTS.md`「常用入口文件」。

### 前端核心机制
- **事件总线**：`domain/events.ts` 定义 `GameplayEvent`；engine 与 services 各自订阅，替代旧轮询队列。
- **存档编解码**：`services/saveCodec.ts` 的 `snapshotToSave`/`saveToInit` 是字段映射唯一源。
- **HTTP 出口**：`services/api.ts` 的 `request()` 统一注入 token + 错误规约。
- **构建/体积预算**：three 拆独立 chunk；总产物 ≤700KB（gzip 前）。

## 3. 后端架构（apps/server-java）—— DDD 四层

```
interfaces  (REST)    Controller / DTO / 异常翻译     → 依赖 application
application (应用)    用例编排 / 事务 / 端口调用        → 依赖 domain
domain      (领域)    聚合根 / 实体 / 值对象 / 仓库接口  → 零框架依赖
infrastructure (基础) JPA / JWT / 密码哈希 / Schema 校验  → 依赖 domain，实现其接口
```

依赖严格单向：`interfaces → application → domain ← infrastructure`。domain 层无 Spring/JPA/Jackson。

**限界上下文**：Identity（User）、Save（PlayerSave）、Content（SceneAggregate，草稿/发布/版本）、Rollout（灰度）、Analytics（埋点）、Creation（作品）。

**领域规则要点**：
- 密码 PBKDF2（兼容旧 scrypt/sha256 自动升级）
- 发布版本 semver 严格递增
- 灰度：playerId 稳定哈希分桶 [0,100)
- 埋点白名单清洗、作品 placements 1-500 项、坐标边界校验

## 4. 数据模型（packages/schema + 内容 JSON）

一份场景 JSON = 一个可玩世界。`packages/schema/src/scene.ts` 定义 `sceneSchema`，主场景 `shenzhen-main`。

| 字段 | 说明 | 数量(主场景) |
|---|---|---|
| `districts` | 9 区，含 `cityRadius`/`density`(cbd/urban/suburb/none) | 9 |
| `landmarks` | 地标（拍照/到访/图鉴/投资对象） | 25 |
| `quests` | 任务（photo/visit/photoSet/collect/walk 条件） | 18（含 10 每日） |
| `npcs` | 静态 NPC + 职业池 | 22（6静态+16动态） |
| `traffic` | `stations`(34站) + `routes`(13线) | — |
| `spawnPoints` | 出生点（玩家选） | — |
| `teleportPoints` | 传送点 | — |
| `buildRecipes` | 建造配方 | 9 |
| `ascension` | 飞升阶段（newcomer→explorer→builder） | — |
| `shopItems` / `invest` | 商店商品 / 地标投资 | 32 商品 |
| `config.env` | 运行时环境（NPC 动态数量/姓氏/职业池） | — |

**投影**（packages/shared/projection.ts）：深圳市民中心 (22.5431, 114.0579) 为原点，1km=200 单位，超距（>8km）压缩 0.35。`proj(lat,lng)→{x,z}`（x 东西 / z 南北，z 正向为南），`unproj` 逆变换。

## 5. 引擎渲染关键机制（world.ts）

- **世界构建**：`buildWorld(scene)` 返回 `{root, tick, lighting, skyMat, fog, roadGraph, streaming, dispose}`。
- **静态合并**：`mergeStaticGroup` 按材质分桶合并 mesh 降 draw call；透明材质不投影。
- **流式加载**：街区/树/路灯按区 `STREAM_R=2400` 挂载半径流式挂载/卸载。
- **LOD 裁剪**：`DECOR_LOD=1150`（地标装饰）、`STATION_LABEL_LOD=900`（站亭名牌）、`NPC_LABEL_LOD=150`（NPC 名牌）。
- **车流**：InstancedMesh 合并（3 色车身+车顶+车轮=5 draw call），车辆在「区内主干道 + 区际快速路」往返行驶。
- **道路**：`roadnet.ts` 每区独立网格路网；`buildInterDistrictHighways` 生成区际快速路；`buildRoadGraph` 编译全城道路图供 NPC 游走。
- **昼夜/天气**：DayNightSystem 调节光照/雾/天空；WeatherSystem 雨雪粒子。
- **碰撞**：`collision.ts` 全局碰撞盒（地标/站亭/建筑/传送门），`collision.clear()` 在重建世界时清空。

## 6. 内容发布流程（admin）

1. admin（:5175）登录（首个注册用户自动 admin）。
2. 编辑场景 JSON（或按分区编辑器）→ 保存草稿（服务端 zod 校验）。
3. 发布：semver 严格递增，草稿版本须 > 最新已发布版本。
4. 前端 web 拉取 `GET /api/content/scenes/shenzhen-main`，可带 `?playerId=` 灰度分桶。

> 场景 JSON 参考：`packages/schema/test/scene.test.mts` 的 `validScene`；主场景数据在 `apps/web/public/content/shenzhen-main.json`。