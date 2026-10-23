# AGENTS.md — Block Shenzhen 工程协作指南

> 本文件是 AI 助手进入本仓库的**唯一入口**。开始任何工作前先读完本文件；详细参考请按需读取 `.agent/` 下的分册。

## 仓库是什么

**方块鹏城（Block Shenzhen）** —— 数据驱动的城市沙盒 3D 游戏 monorepo。玩家在深圳 3D 世界拍照赚钱、做任务、乘车、建造、收藏，进度云存档。内容（场景/地标/任务/NPC/交通/建造配方）全部外置为 JSON，由后台（admin）编辑校验后发布。

## 结构速览

```
block-shenzhen/
├── apps/
│   ├── web/           玩家前端 :5174（Vue3 + three.js，洋葱分层）
│   ├── admin/         内容后台 :5175（JSON 编辑→校验→发布）
│   ├── server-java/   后端 API :4001（Java17 + Spring Boot3 + SQLite，DDD 四层）
│   └── server/        旧 Node 服务（已废弃，仅参考，勿改）
├── packages/
│   ├── schema/       内容 Schema（zod）：场景/地标/任务/NPC/交通/建造/存档
│   └── shared/       投影算法与常量（前后端共用）
└── scripts/          check-layering.mjs 前端分层守护
```

## 关键端口与服务

| 服务 | 端口 | 启动命令 |
|---|---|---|
| 后端 server-java | 4001 | `mvn spring-boot:run -f apps/server-java/pom.xml` |
| 前端 web | 5174 | `npm run dev:web`（vite 需用根 `node_modules/vite/bin/vite.js`） |
| 后台 admin | 5175 | `npm run dev:admin` |

> ⚠️ monorepo 依赖 hoisted：vite 等 CLI 在根 `node_modules/`，需用 `node node_modules/vite/bin/vite.js` 或在 `apps/*` 目录内运行。

## 三个铁律（违反即红灯）

1. **前端洋葱分层**：`views → engine → domain → services → infra`，内层禁止 import 外层；views 禁止直接 `fetch`。机器守护：`node scripts/check-layering.mjs`（exit 1 = 违规）。
2. **后端 DDD 单向依赖**：`interfaces → application → domain ← infrastructure`；domain 层零框架依赖（无 Spring/JPA/Jackson）。
3. **改动最小化**：不重命名/重构超出任务范围的符号，不格式化无关代码，不装新依赖，不改 `.gitignore`/`package.json`/`tsconfig.json` 除非明确要求。

## 权限分级（安全边界）

AI 对「修改」类操作按此分级收敛；高破坏动作（依赖变更/删除）必须显式授权。

| 级别 | 覆盖范围 | 规则 |
|---|---|---|
| 🔴 禁止 | 删文件/目录、`git reset --hard`/`push --force`、改依赖（`package.json`/`pom.xml`/lock）、改 `.gitignore`/`tsconfig.json`、生产配置、`docs/` 基线 | 需用户明确授权，否则不动 |
| 🟡 谨慎 | `src/**` 常规编码、`.agent/` 分册与 skill 追加 | 正常修改，保持风格与现有结构 |
| 🟢 自由 | 新增组件/hook/模块/知识条目等增量文件 | 遵循仓库约定即可 |
| ⚠️ 永久排除 | 密钥、token、cookie、真实用户数据 | 不得进入任何文件/日志/提交 |

## 上下文预算（防腐纪律）

| 内容 | 加载时机 | 预算 |
|---|---|---|
| AGENTS.md | 每会话常驻 | ≤200 行 |
| 相关 spec（任务级） | 按需 1-2 份 | 单份 ≤500 行 |
| 实时状态（树/路由/Schema/版本） | 现场用工具读取 | **禁止写进文档** |
| 代码本体 | outline → 局部读 | 禁止整仓投喂 |

**防腐判断标准**：项目级文档里的一句话「一个月后还成立吗？」不成立就删。文档禁止出现会过期的内容（任务进度、具体行数、TODO）。动态信息走工具读取、静态规范走文件固化，两条通道分开。

## 验证红线

- **三级验证管线**：`quick`（每次改动后必跑）→ `commit`（提交前）→ `ci`（联调/交付）。统一入口 `node scripts/verify.mjs <level>`。
- **静默重试 ≤2 次**：同一验证失败不得静默重试超 2 次，必须换思路或上报。
- **度量留痕**：每次 verify 自动追加 `.agent/metrics/verify-log.jsonl`。
- **文档防腐**：`node scripts/verify.mjs quick` 内含 skill/分册完整性动态扫描，防止检查器自身腐烂。

## 改动后必须做的验证

- 前端改 `apps/web`：`cd apps/web && node ../../node_modules/vite/bin/vite.js build` + `node ../../scripts/check-layering.mjs`
- 后端改 `apps/server-java`：`mvn -q package -DskipTests`
- schema/shared 改 `packages/*`：`npm run build -w packages/schema` / `-w packages/shared`

## 常用入口文件（改之前先 outline）

| 想改什么 | 文件 |
|---|---|
| 世界构建 / 道路 / 车流 / 地标 | `apps/web/src/engine/world.ts` |
| 引擎装配 / 加载阶段 / 出生 / 存档回档 | `apps/web/src/engine/engine.ts` |
| 玩法规则（金钱/任务/图鉴） | `apps/web/src/domain/gameplay.ts` |
| 游戏壳（模式路由/加载/HUD 轮询） | `apps/web/src/composables/useGameShell.ts` |
| 交通乘车系统 | `apps/web/src/engine/transit.ts` |
| 内容 Schema | `packages/schema/src/*.ts` |
| 场景数据（内容） | `apps/web/public/content/shenzhen-main.json` |
| 后端接口 | `apps/server-java/src/main/java/com/blocksz/server/interfaces/rest/*.java` |

## 分册导航

| 需要 | 读取 |
|---|---|
| 完整架构（前后端 + 数据模型） | `.agent/architecture.md` |
| 所有命令速查 | `.agent/commands.md` |
| 编码规约与守护细则 | `.agent/rules.md` |
| 常见任务 playbook | `.agent/tasks.md` |
| 本项目踩过的坑 / 易错点 | `.agent/pitfalls.md` |

## 知识库（knowledge）

结构化可检索知识，**按端组织**：涉及**领域定义/字段语义/某端内部实现/历史决策/高频疑问**时按需检索：

| 需要知道 | 读取 |
|---|---|
| 知识库全貌 / 怎么检索 | `.agent/knowledge/index.md` |
| 跨端：领域术语/常量/区色 + 内容 JSON 字段语义 + 架构决策 | `.agent/knowledge/shared/` |
| 前端：分层 / 引擎模块 / 渲染 / 前端 ADR/FAQ | `.agent/knowledge/frontend/` |
| 后台：编辑器 / cookie 会话 / 版本灰度 / MapPicker | `.agent/knowledge/admin/` |
| 后端：DDD / 限界上下文 / REST / 后端 ADR/FAQ | `.agent/knowledge/backend/` |

## Skill 体系（skills）

接到匹配任务时**读取对应 `SKILL.md` 按步骤执行**：

| Skill | 触发 | 目录 |
|---|---|---|
| publish-content | 发布内容/场景/新版本 | `.agent/skills/publish-content/SKILL.md` |
| add-landmark | 加地标 | `.agent/skills/add-landmark/SKILL.md` |
| add-quest | 加任务/每日任务 | `.agent/skills/add-quest/SKILL.md` |
| add-district | 加区 | `.agent/skills/add-district/SKILL.md` |
| review-code | 代码审查/评审 | `.agent/skills/review-code/SKILL.md` |
| debug-engine | 引擎/玩法/渲染排查 | `.agent/skills/debug-engine/SKILL.md` |

> 技能索引与新增规则：`.agent/skills/index.md`

## 场景数据模型（最常被 AI 改动）

主场景 ID `shenzhen-main`，一份 JSON = 一个可玩世界。关键字段：
`id/name/version`、`projection`（投影）、`districts`（9 区，含 `cityRadius`/`density`）、`landmarks`（25 地标）、`quests`（任务）、`npcs`、`traffic`（`stations`/`routes`）、`spawnPoints`、`buildRecipes`、`ascension`、`shopItems`、`invest`。

**改动内容 JSON 后必须用 schema 校验**（admin 发布或 `validateScene`），且注意：后端版本 semver 严格递增，草稿≠已发布。

---
*本体系由 `.agent/` 分册 + 根 `AGENTS.md` 组成。保持文档与代码同步——改架构时更新 `.agent/architecture.md`。*