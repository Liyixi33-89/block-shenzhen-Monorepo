# 后端架构（apps/server-java · DDD 四层）

## 包结构与依赖方向

```
com.blocksz.server
├── interfaces/rest/      控制器/鉴权守卫/参数解析/异常处理 —— 只做 HTTP 适配
├── application/          应用服务（用例编排、DTO、事务边界）
├── domain/               领域模型/聚合/仓储接口 —— 零框架，纯业务规则
└── infrastructure/      持久化(Jdbc)/安全/校验 —— 实现 domain 接口
```

**依赖方向**：`interfaces → application → domain ← infrastructure`，单向；domain 不依赖任何框架。

- `application` 依赖 domain 接口，编排用例，不碰 SQL/HTTP。
- `infrastructure` 实现 domain 的 Repository/接口，反依赖注入给 application。
- `interfaces` 只做参数解析/响应封装，业务逻辑下沉到 application。
- `domain/shared/DomainException`：业务异常统一出口，由 `GlobalExceptionHandler` 转 HTTP 错误。

## 分层职责对照

| 层 | 目录 | 职责 |
|---|---|---|
| interfaces | `interfaces/rest/` | REST 控制器、`AuthArgumentResolver`(注 @Auth 用户)、`AdminGuard`/`RateLimitGuard`、`GlobalExceptionHandler`、`WebConfig`(CORS) |
| application | `application/*/` | `*AppService`：用例编排；`application/dto/Api.java` 统一响应包装 |
| domain | `domain/*/` | 聚合（SceneAggregate/Creation/User/PlayerSave...）+ `*Repository` 接口 + `shared/DomainException` |
| infrastructure | `infrastructure/` | `persistence/Jdbc*Repository`、`security/*`、`validation/JacksonSchemaValidator` |

## 安全与基建

| 组件 | 文件 | 职责 |
|---|---|---|
| JWT | `security/JwtTokenService.java` | token 签发/校验 |
| 密码哈希 | `security/MultiFormatPasswordEncoder.java` | 新 PBKDF2；兼容旧 scrypt/sha256，登录成功自动升级 |
| 内容过滤 | `security/ContentFilter.java` | 敏感内容清洗 |
| 限流 | `security/SlidingWindowRateLimiter.java` | 滑动窗口限流（`RateLimitGuard`） |
| Schema 校验 | `validation/JacksonSchemaValidator.java` | 宽松 Jackson 对齐 zod，校验发布/保存的 JSON |
| 迁移 | `tools/DataMigrator.java` | 数据迁移工具 |

## 存储

- 配置写 MySQL `block_sz`；实际运行用 **SQLite**（`data/block-sz-java.sqlite`，Hibernate 通用方言）。两套 schema 须一致。
- 持久化走 `infrastructure/persistence/Jdbc*Repository`（手写 JDBC），JSON 列用 `JsonColumns.java` 工具。