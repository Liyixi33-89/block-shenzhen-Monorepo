# 前端知识（Frontend · apps/web）

> `apps/web`（Vue3 + three.js，洋葱分层）的内部知识。涉及前端代码、引擎系统、渲染、性能时查阅本目录。

| 文件 | 内容 |
|---|---|
| `architecture.md` | 洋葱分层 + 分层守护 + 数据流（事件总线/存档编解码/HTTP 出口） |
| `modules.md` | **引擎各系统模块详解**（world/player/transit/npc/build/photo/teleport/...） |
| `rendering.md` | 渲染机制与性能（合并/InstancedMesh/LOD/流式/昼夜天气） |
| `glossary.md` | 前端专用术语与渲染常量 |
| `decisions.md` | 前端专属 ADR（分层/事件总线/渲染优化） |
| `faq.md` | 前端高频疑问 |

> 跨端/共享概念（数据模型、领域术语）见 `../shared/`。