# 后端术语（Glossary · Backend）

> 后端特有的 DDD/灰度/存储概念。领域术语与跨端常量见 `../shared/glossary.md`。

## 架构术语

| 术语 | 定义 |
|---|---|
| **DDD 四层** | interfaces→application→domain←infrastructure，单向依赖 |
| **限界上下文** | Identity/Save/Content/Rollout/Analytics/Creation 六个 |
| **semver 严格递增** | 发布版本必须 > 最新已发布版本 |
| **灰度哈希** | playerId 31 进制稳定哈希分桶 [0,100) |
| **PBKDF2** | 新密码哈希；兼容旧 scrypt/sha256 登录时自动升级 |

## 存储

| 术语 | 定义 |
|---|---|
| **MySQL `block_sz`** | 配置声明的数据库（root/123456，应用用户 block_sz/block_sz） |
| **SQLite** | 实际运行库 `data/block-sz-java.sqlite`（Hibernate 通用方言） |
| **Jdbc 仓储** | `infrastructure/persistence/Jdbc*Repository` 手写 JDBC |
| **JsonColumns** | JSON 列读写工具 |