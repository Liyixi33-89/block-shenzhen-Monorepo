# 后端知识（Backend · apps/server-java）

> `apps/server-java`（Java17 + Spring Boot3，DDD 四层）的内部知识。涉及后端代码、REST API、灰度、校验、存储时查阅本目录。

| 文件 | 内容 |
|---|---|
| `architecture.md` | DDD 四层 + 依赖方向 + REST 层规约 + 安全基建 |
| `modules.md` | **各限界上下文模块详解**（identity/content/save/rollout/creation/analytics/moderation）+ 全量 REST 端点表 |
| `glossary.md` | 后端专用术语（DDD/灰度/密码哈希/存储） |
| `decisions.md` | 后端专属 ADR |
| `faq.md` | 后端高频疑问 |

> 跨端/共享概念（数据模型、领域术语）见 `../shared/`。