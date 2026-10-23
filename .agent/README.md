# `.agent/` — Block Shenzhen 的 AI 工程体系

> 一份「人机共读」的工程知识库：让 AI 助手（及新人）在不翻全源码的情况下，正确、高效、安全地改这个 monorepo。

## 为什么需要它

这个仓库跨 3 个技术栈（Vue3+three 前端 / Vue3 admin / Java Spring 后端）、2 个共享包（schema/shared），并有一套**机器执行的架构红线**（前端洋葱分层、后端 DDD 单向依赖）。没有这份体系，AI 很容易：
- 违反分层（如 domain 里 import three，或 views 直接 fetch）；
- 改内容 JSON 不过 schema 校验，或发布时破坏 semver；
- 在 hoisted monorepo 里跑错命令路径；
- 踩到已经修过/已知的历史陷阱。

## 文件地图

| 文件 | 定位 | 谁读 |
|---|---|---|
| `../AGENTS.md`（根） | 唯一入口：结构/铁律/常用入口/验证/知识库/技能导航 | 所有 AI，进入即读 |
| `architecture.md` | 前后端完整架构 + 数据模型 | 做架构级改动前 |
| `commands.md` | 全量命令速查（构建/测试/运行/迁移） | 每次跑命令前 |
| `rules.md` | 编码规约、分层守护细则、Do/Don't | 每次改代码前 |
| `tasks.md` | 常见任务 playbook（加地标/任务/区/NPC/发布） | 接到对应任务时 |
| `pitfalls.md` | 本项目踩过的坑、易错点、性能约束 | 改动引擎/渲染/存档前必读 |
| `knowledge/` | **知识库**：术语表/数据模型/决策记录/FAQ，按需检索 | 涉及领域定义/字段/决策/疑问时 |
| `skills/` | **Skill 体系**：可复用工作流（SKILL.md） | 接到匹配任务时调用 |

## 使用约定

1. **入口先行**：AI 进入仓库先读根 `AGENTS.md`，据此决定是否需要进一步读分册。
2. **按需深入**：分册不要求全读；根据任务类型只读对应分册，控制上下文成本。
3. **机器优先**：能用脚本守护的规则（分层、构建、体积）不依赖人肉记忆——AI 改完必须跑对应脚本验证。
4. **文档与代码同步**：改架构/新增系统时，同步更新 `architecture.md` 与 `pitfalls.md`。保持这份体系永远反映真实代码。

## 维护原则

- 文件保持**精炼**：每条规则给「为什么 + 怎么做」，不写废话。
- 陷阱条目按「现象 → 根因 → 规避/修复」三行式，便于检索。
- 新增重大系统（如新玩法模块、新后端限界上下文）时，在 `architecture.md` 和 `tasks.md` 各补一节。
- 新增数据字段/领域概念 → 更新 `knowledge/shared/data-model.md` + `knowledge/shared/glossary.md`。
- 改前端引擎系统/渲染 → 更新 `knowledge/frontend/modules.md` / `rendering.md`；改后端上下文/REST → 更新 `knowledge/backend/modules.md`。
- 重要选型/架构调整 → 在对应端 `knowledge/{shared,frontend,backend}/decisions.md` 追加 ADR。
- 高频疑问 → 沉淀进对应端 `knowledge/{frontend,backend}/faq.md`。
- 新增可复用工作流 → 在 `skills/` 建 SKILL.md 并在 `skills/index.md` 登记。