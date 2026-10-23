# 跨端架构决策（Decisions · Shared）

> 影响多端/全局的架构决策。每条：**背景 → 决策 → 结果/代价**。前端专属 ADR 见 `frontend/decisions.md`，后端专属见 `backend/decisions.md`。

## ADR-001 数据驱动架构：内容外置为 JSON
- **背景**：玩法迭代频繁，改代码成本高。
- **决策**：游戏内容（场景/地标/任务/NPC/交通/建造/经济）全部外置 JSON，后台校验发布，前端引擎消费。
- **结果**：改内容不碰代码；代价是内容改动需过 schema 校验 + semver 管理。

## ADR-003 后端 DDD 四层（Java）
- **背景**：旧 Node/Express 路由+Store 单体。
- **决策**：Java17 + Spring Boot3，interfaces→application→domain←infrastructure 单向依赖；domain 零框架。
- **结果**：限界上下文清晰；代价是 Java 手写 Schema 校验对齐 zod。

## ADR-005 投影压缩（farCompress）
- **背景**：深圳城市范围远超屏幕，远区会溢出。
- **决策**：1km=200 单位 + 超距(>8km)压缩 0.35。
- **结果**：全城可见不溢出；代价是远区非等距，坐标语义在远区非线性。

---
*新决策在此追加；改动既有决策需标注「修订」。*