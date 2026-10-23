# 前端架构（apps/web · 洋葱分层）

## 分层与依赖方向

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

**机器守护**：`scripts/check-layering.mjs` 扫描 `apps/web/src` 全部 `.ts/.vue`。违规 exit 1。任何前端改动后必须跑。

## 各层目录与职责

| 层 | 目录 | 职责 |
|---|---|---|
| views | `App.vue`/`composables/`/`components/` | 模式路由、HUD、加载面板；只调 engine 暴露接口 |
| engine | `engine/*.ts` | 组合根：装配、注入、主循环；`engine.ts` 是入口 |
| domain | `domain/gameplay.ts`/`events.ts`/`ascension.ts` | 玩法规则、事件类型、飞升判定（纯逻辑） |
| services | `services/*.ts` | api/content/cloud/saveCodec/analytics |
| infra | `infra/storage.ts` | localStorage 适配 |

## 关键数据流

- **事件总线**：`domain/events.ts` 定义 `GameplayEvent`；engine 与 services 各自订阅，替代旧轮询队列。`engine.events[]` 数组字段保留防 e2e 破坏。
- **存档编解码**：`services/saveCodec.ts` 的 `snapshotToSave`/`saveToInit` 是字段映射**唯一源**。新增存档字段必须两处都改。
- **HTTP 出口**：`services/api.ts` 的 `request()` 统一注入 token（`lsGet('bsz_token')`）+ JSON 规约。所有网络请求走它。
- **内容拉取**：`services/content.ts` 的 `fetchScene(sceneId, playerId)` 拉已发布场景（`?playerId=` 灰度分桶）；`checkHealth()` 在线检测。
- **engine/ 桥文件**：`engine/gameplay.ts`/`ascension.ts`/`cloud.ts`/`analytics.ts` 是 **re-export 桥**（迁移期兼容旧 import 路径，豁免分层检查）。

## 常用入口文件

| 想改什么 | 文件 |
|---|---|
| 世界构建 / 道路 / 车流 / 地标 | `engine/world.ts` |
| 引擎装配 / 加载阶段 / 出生 / 存档回档 | `engine/engine.ts` |
| 玩法规则（金钱/任务/图鉴） | `domain/gameplay.ts` |
| 游戏壳（模式路由/加载/HUD 轮询） | `composables/useGameShell.ts` |
| 交通乘车系统 | `engine/transit.ts` |