# 后端决策记录（Decisions · Backend）

> 后端专属架构/存储/安全决策。跨端决策见 `../shared/decisions.md`，前端专属见 `../frontend/decisions.md`。每条：**背景 → 决策 → 结果/代价**。

## ADR-012 灰度稳定哈希分桶
- **背景**：发布新版本需渐进放量，避免全量上线故障。
- **决策**：`playerId` 经 31 进制稳定哈希分桶 `[0,100)`，对照 `RolloutConfig` 分桶阈值；`GET /api/content/scenes/{id}?playerId=` 返回该桶版本 + `gray:true`。支持滑杆灰度百分比 + 全量回滚锁定。
- **结果**：同玩家跨请求稳定同版本，可逐步放大观察埋点；代价是需维护 RolloutConfig 与版本历史。

## ADR-013 宽松 Jackson 校验对齐 zod
- **背景**：前端用 zod 校验，后端需同步但不想维护双份 schema。
- **决策**：`JacksonSchemaValidator` 宽松对齐 zod——新增字段不破坏旧数据；旧场景缺省字段走引擎内置常量（零破坏）。
- **结果**：前后端校验语义一致，旧数据平滑迁移；代价是宽松校验无法拦截前端遗漏的必填字段。

## ADR-014 SQLite 运行 + MySQL 配置双 schema
- **背景**：配置声明 MySQL `block_sz`，但本地/测试需轻量运行。
- **决策**：`application.yml` 配 MySQL；实际运行用 SQLite（`data/block-sz-java.sqlite`，Hibernate 通用方言）。两套 schema 保持一致。
- **结果**：零配置本地可跑，生产可切 MySQL；代价是两套 schema 需人工保持同步，SQL 方言需通用。

## ADR-015 HttpOnly Cookie 会话 + PBKDF2 密码升级
- **背景**：前端不持有 token 更安全；旧用户密码是 scrypt/sha256。
- **决策**：登录下发 `bsz_token` HttpOnly Cookie（前端不可读）；`MultiFormatPasswordEncoder` 新密码 PBKDF2，旧 scrypt/sha256 登录成功自动升级。
- **结果**：前端无 token 泄露面，旧密码平滑迁移；代价是登出只能后端过期 cookie，前端不能主动清。

## ADR-016 semver 严格递增 + 草稿/发布分离
- **背景**：内容发布需可追溯、可回滚，草稿改动不能影响线上。
- **决策**：保存草稿 `PUT` 不递增版本（可反复改）；发布 `POST` 自动 bump patch 且要求版本 > 最新已发布（semver 严格递增）。
- **结果**：草稿与线上隔离，发布可回滚到任意历史版本；代价是发布前必须过校验 + 版本号管理。

---
*新决策在此追加；改动既有决策需标注「修订」。*