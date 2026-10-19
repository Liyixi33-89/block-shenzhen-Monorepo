# 方块鹏城 · 前端架构设计（重构方案）

> 状态：已接受（2026-10-16）· 对应文章《重新构造：前端需要架构设计》的落地实践
> 适用范围：`apps/web`（玩家前端）。admin / server 维持现状，后续按同一分层迁移。

## 一、为什么重构：三类熵增的实证诊断

| 熵增类型 | 本项目实证 | 重构对策 |
|---|---|---|
| 面条式依赖 | `engine.ts` 630 行上帝类直接 import 13 个模块；领域逻辑（gameplay）、渲染（world/player）、DOM 面板（shop/gallery）、基础设施（cloud/analytics）在 `engine/` 平铺目录里互相缠绕 | 洋葱分层 + 依赖规则守护脚本 |
| 复制式膨胀 | `materializeLockedSystems()` 整段复制 `loadPhase('systems')` 的 BuildMode/TeleportSystem 构造（~40 行×2）；`fetch + localStorage token` 在 cloud/gallery/analytics 三处各写一遍 | 工厂函数收敛构造；HTTP 收敛到 `services/api` 单一出口 |
| 黑洞式构建 | 单入口无分包、无体积预算、无分层守护；tsc 存量 14 个错误被「vite 不查类型」掩盖 | 构建产物预算 + `check-layering.mjs` 门禁 + tsc 清零 |

重构同时修复的存量 bug：
- `App.vue` 引用未定义的 `engRef`（Q/P/K 面板快捷键抛 ReferenceError；灰度角标永不显示）
- `engine.ts` 的 `_tpRefreshAcc/_investAcc` 未声明（运行时靠 JS 动态属性侥幸工作）

## 二、洋葱分层模型

依赖只能从外向内（视图 → 业务 → 服务 → 基础设施），内层禁止 import 外层：

```
┌─────────────────────────────────────────────┐
│  views（视图层）App.vue / HUD / 面板          │
│ ┌─────────────────────────────────────────┐ │
│ │  domain（业务层）玩法规则 / 飞升 / 事件      │ │
│ │ ┌─────────────────────────────────────┐ │ │
│ │ │  services（服务层）API / 云存档 / 埋点  │ │ │
│ │ │ ┌─────────────────────────────────┐ │ │ │
│ │ │ │ infra（基础设施）三方库适配 / 工具   │ │ │ │
│ │ │ └─────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

本项目的特殊之处：存在一个**横切层 `engine/`**——它是「组合根 + 运行时装配器」，负责把三层组装成可运行的游戏（实例化 three 场景、注入回调、跑主循环）。组合根允许 import 所有内层，但不被任何层 import（只有 views 和 e2e 调试面引用它）。

## 三、目标目录结构

```
apps/web/src/
├── main.ts                    # 应用入口（不变）
├── App.vue                    # 视图根：状态编排 + HUD/面板模板（瘦身：逻辑抽到 composable）
├── composables/
│   └── useGameShell.ts        # 视图层逻辑：加载阶段编排 / HUD 轮询 / 事件订阅 → toast
├── domain/                    # 【业务层】纯逻辑，无 DOM、无 three、无 fetch
│   ├── events.ts              # GameplayEvent 类型 + 轻量事件总线（类型唯一源）
│   ├── gameplay.ts            # 玩法规则：金钱/任务/到访/图鉴/经济（现 engine/gameplay.ts 迁入）
│   └── ascension.ts           # 飞升阶段判定（现 engine/ascension.ts 迁入）
├── services/                  # 【服务层】API 封装与数据转换，无 three、无 Vue
│   ├── api.ts                 # HTTP 单一出口：request() 封装 + token 注入 + 错误规约
│   ├── cloud.ts               # 云存档会话与存档读写（现 engine/cloud.ts 收敛于此）
│   ├── analytics.ts           # 埋点（现 engine/analytics.ts 迁入，订阅总线替代轮询）
│   └── saveCodec.ts           # 存档编解码：GameplaySnapshot ↔ PlayerSave（消除 engine.ts 内联序列化）
├── infra/                     # 【基础设施层】三方库适配与纯工具
│   └── storage.ts             # localStorage 读写收敛（token/教程进度等键名唯一源）
├── engine/                    # 【横切：组合根】装配与运行时
│   ├── engine.ts              # GameEngine：瘦身后只做装配/主循环/生命周期（~300 行目标）
│   ├── factories.ts           # BuildMode/TeleportSystem 等「依赖注入对象工厂」（消除复制粘贴）
│   ├── builders.ts / world.ts / player.ts / atmosphere.ts / icons.ts   # three 渲染（不动）
│   ├── photo.ts / transit.ts / npc.ts / build.ts / teleport.ts          # 交互系统（不动，内部依赖收敛到 services/domain）
│   ├── shop.ts / gallery.ts / touch.ts / tutorial.ts                    # DOM 面板（不动，fetch 改走 services/api）
│   └── gameplay.ts / ascension.ts / cloud.ts / analytics.ts             # re-export 桥（过渡期兼容，e2e 契约不破）
└── style.css
```

迁移策略采用**绞杀者式**：新层建好后，`engine/` 下旧文件保留 re-export 桥（`export * from '../domain/gameplay'`），保证 e2e 脚本与任何旧 import 路径零破坏；旧路径全部迁移完成并验证后，桥文件才允许删除。

## 四、各层职责与依赖规则

| 层 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|
| views (`App.vue`, `composables/`) | 模板渲染、状态编排、快捷键路由 | engine, domain, services, infra | 直接 fetch；直接操作 three |
| engine (组合根) | 装配实例、注入依赖、主循环、生命周期 | domain, services, infra, three | 被 views 之外的层 import |
| domain | 玩法规则、事件定义、飞升判定 | schema, shared（纯类型/纯函数） | import three / Vue / DOM API / fetch |
| services | API 调用、存档编解码、埋点批处理 | domain（事件类型）, infra, schema | import three / Vue / engine |
| infra | localStorage 适配、纯工具 | 无（仅三方/标准库） | import 任何业务模块 |

关键设计决策：

1. **事件总线（`domain/events.ts`）替代轮询队列**。现状是 `engine.events[]` 数组 + `App.vue` 每 250ms `splice` 轮询，埋点再由 App.vue 喂给 analytics——数据流绕经视图层，视图层承担了路由职责。重构后 gameplay 事件直接推总线，engine 与 services 各自订阅：toast 渲染订阅（视图侧）、埋点映射订阅（服务侧）、飞升重评估订阅（组合根侧）。事件类型 `GameplayEvent` 的定义唯一源移到 domain，engine/gameplay.ts 桥接导出。

2. **工厂函数（`engine/factories.ts`）消除构造复制**。`BuildMode`/`TeleportSystem` 的构造参数从 gameplay/engine 抽取回调，`loadPhase('systems')` 与 `materializeLockedSystems()` 两处完全重复。抽 `createBuildMode(ctx)` / `createTeleport(ctx)` 后，`materializeLockedSystems` 变成两行幂等调用。

3. **HTTP 收敛（`services/api.ts`）**。`request(path, opts)` 统一注入 `authorization: Bearer <token>`（token 读取收敛到 `infra/storage.ts`），统一 JSON 解析与错误规约。cloud/analytics/gallery/shop 四处散落的 `fetch(...)` 全部改走它。未来换 HTTP 库或加重试/灰度头，只改一个文件。

4. **存档编解码（`services/saveCodec.ts`）**。`engine.ts` 里 `saveNow()` 手写 25 行字段映射、`loadPhase('content')` 里再手写 15 行回档映射，新增存档字段要改两处。抽 `snapshotToSave()` / `saveToInit()` 后，字段映射唯一化（与 schema `PlayerSave` 对齐）。

5. **引擎瘦身目标**。`engine.ts` 从 630 行降到 ~300 行：装配代码进 factories、序列化进 saveCodec、事件队列删掉（总线替代）、按键路由保留（组合根职责）。

## 五、分层守护：机器执行，不靠口头

`scripts/check-layering.mjs`（node 运行，无三方依赖，CI 可直接跑）扫描 `src/` 全部 `.ts/.vue` 的相对 import，按以下规则判定：

```
禁止：domain → (engine | views | services | infra 三方以外的内容)
禁止：services → (engine | vue | three | App.vue)
禁止：infra → 任何业务路径
禁止：views (App.vue) 直接调用 fetch(      ← 网络出口必须走 services/api
允许：engine → 任意内层；re-export 桥文件豁免
```

运行：`node scripts/check-layering.mjs`，违规即 `process.exitCode = 1`。
这对应文章第五节「能用机器执行的规则绝不依赖人」——在没有 ESLint 插件配置的存量项目里，先用零依赖脚本把红线立起来，后续再演进到 dependency-cruiser。

## 六、构建与体积预算

现状：单入口打包 651KB（gzip 前含 three）。重构后维持功能不变，预算红线：

| 产物 | 预算（gzip 前） | 说明 |
|---|---|---|
| 总产物 | ≤ 700KB | 重构本身不显著增体积；超出即回归 |
| three 相关 chunk | 自然分包 | `build.rollupOptions.manualChunks` 把 three 拆独立 chunk，利用浏览器缓存 |

规则：CI 跑 `npm run build` 后对比产物体积，超预算红灯。当前不引入 size-limit 三方依赖，用 node 脚本读 `dist/assets` 体积即可（后续演进项）。

## 七、验证契约（重构安全网）

重构不允许改变外部可观测行为：

1. **e2e 契约**：`window.__engine` 调试面字段完整保留（`gameplay/ascension/npc/buildMode/teleport/player/sceneData/state/events...`），`.session_tmps/p0-e2e.cjs` 等脚本不改即可跑。
2. **行为契约**：`events` 数组保留（内部由总线推送填充，App.vue 轮询逻辑不变或改订阅）——本方案选订阅，但数组字段保留以防 e2e 探测。
3. **构建契约**：`npm run build -w apps/web` 成功，产物体积不超预算。
4. **类型契约**：`tsc --noEmit` 在 apps/web 范围内 0 错误（本次顺手清零 web 侧存量错误；schema 包 `.ts` 后缀错误属包自身构建配置，不在本次范围）。

## 八、后续演进（登记为技术债，不阻塞本次）

- 触屏/教程/商店/广场四个 DOM 面板迁移为 Vue 组件（当前 DOM 直绘是历史包袱，迁移后删除 `panelGuard` 机制）
- `check-layering.mjs` 演进为 ESLint `no-restricted-imports` + dependency-cruiser 可视化
- HUD 250ms 轮询改为响应式订阅（Vue `effectScope`）
- schema 包 `.ts` 后缀导入错误修复（tsconfig `allowImportingTsExtensions`）
