# 项目知识库（Knowledge Base）

> Block Shenzhen 的**结构化可检索知识**，按**端（shared/frontend/backend）**组织。供 AI 在需要深度理解领域概念、数据模型、某端内部实现、历史决策、常见疑问时**按需检索**。

## 检索导航（按端）

| 需要知道 | 读取 |
|---|---|
| 全库结构、怎么检索 | `index.md`（本文件） |
| **共享/跨端**：内容 JSON 字段、schema 校验、领域术语、工程脚本、产品文档、架构级决策 | `shared/` |
| **前端**：洋葱分层、引擎各系统模块、渲染性能、前端 ADR/FAQ | `frontend/` |
| **后端**：DDD 架构、限界上下文模块、REST、灰度、后端 ADR/FAQ | `backend/` |

### shared/（跨端共用）
| 文件 | 内容 |
|---|---|
| `data-model.md` | 内容 JSON（场景/地标/任务/NPC/交通/建造/经济）全字段语义 |
| `schema.md` | `packages/schema` 包结构 + 校验规则（zod）+ 存档 schema + 消费入口 |
| `glossary.md` | 领域术语 + 跨端常量 + 区主题色 |
| `decisions.md` | 跨端架构决策 ADR-001/003/005 |
| `engineering.md` | 工程验证脚本（`scripts/`：verify 三级管线 / check-docs 防腐 / check-layering 分层） |
| `product.md` | 产品/架构长文档索引（`docs/`：前端架构方案 / admin 可配置化 PRD / 对比广州对标） |

### frontend/（apps/web）
| 文件 | 内容 |
|---|---|
| `architecture.md` | 洋葱分层 + 分层守护 + 数据流（事件/存档编解码/HTTP 出口） |
| `modules.md` | 引擎各系统模块详解（world/player/transit/npc/build/photo/...） |
| `rendering.md` | 渲染机制与性能（合并/InstancedMesh/LOD/流式/昼夜天气） |
| `glossary.md` | 前端专用术语与渲染常量 |
| `decisions.md` | 前端专属 ADR-002/004/006-011 |
| `faq.md` | 前端高频疑问 |

### backend/（apps/server-java）
| 文件 | 内容 |
|---|---|
| `architecture.md` | DDD 四层 + 依赖方向 + REST 层规约 + 安全基建 |
| `modules.md` | 各限界上下文模块详解 + 关键调用链路 |
| `glossary.md` | 后端专用术语（DDD/灰度/密码哈希/存储） |
| `decisions.md` | 后端专属 ADR |
| `faq.md` | 后端高频疑问 |

## 检索原则

1. **先查后答**：涉及「本项目的领域定义、数据字段、某端内部实现、历史决策、既定约定」时，先检索对应知识条目，不凭记忆猜测。
2. **按端定位**：先判断问题属于共享/前端/后端，再进对应子目录。
3. **按需深入**：只读与当前任务相关的条目，控制上下文。
4. **知识优先于源码**：`shared/data-model.md` 是字段语义的权威描述；源码只是实现。

## 知识条目规范

- 每条给「定义 + 取值/边界 + 一句话为什么」。
- 术语/字段命名以源码和 schema 为准，保持同步。
- 新决策入对应端的 `decisions.md`，新坑入对应端 FAQ。

## 更新维护

- 改动数据模型（schema/内容 JSON 新增字段）→ 更新 `shared/data-model.md` + `shared/schema.md`。
- 改前端引擎系统 → 更新 `frontend/modules.md`/`rendering.md`。
- 改后端上下文/REST → 更新 `backend/modules.md`。
- 改了 `scripts/` 验证脚本或门禁语义 → 更新 `shared/engineering.md`。
- 新增/更新 `docs/` 长文档 → 更新 `shared/product.md` 索引与要点。
- 做了重要技术选型或架构调整 → 在对应端 `decisions.md` 追加 ADR。
- 被问过多次且可复答的问题 → 沉淀进对应端 `faq.md`。