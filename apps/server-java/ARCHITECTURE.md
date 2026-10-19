# 后端架构（DDD 重构版）

原 Node/Express 服务已重构为 **Java 17 + Spring Boot 3.2.5 + SQLite**，按领域驱动设计（DDD）四层架构落地。

## 架构总览

```
interfaces  (REST API 层)      ← Controller、DTO、异常翻译（依赖 application）
application (应用层)           ← 用例编排、事务边界、端口调用（依赖 domain）
domain      (领域层)           ← 聚合根、实体、值对象、领域服务、仓库接口、领域异常（零框架依赖）
infrastructure (基础设施层)    ← JPA 实现仓库、JWT、密码哈希、SceneSchema 校验适配（依赖 domain，实现其接口）
```

依赖方向严格单向：`interfaces → application → domain ← infrastructure`。
domain 层不依赖 Spring/JPA/Jackson，纯 POJO + 业务规则。

## 业务架构（限界上下文）

| 上下文 | 聚合根 | 职责 |
|---|---|---|
| Identity 身份 | `User` | 注册/登录、admin 授予、密码升级迁移 |
| Save 存档 | `PlayerSave` | 云存档 CRUD、Schema 校验、归属校验 |
| Content 内容 | `SceneAggregate` | 草稿/发布/版本、semver 递增规则、版本 diff |
| Rollout 灰度 | `RolloutConfig` | 灰度百分比、版本锁定、稳定哈希分桶 |
| Analytics 埋点 | `TrackingEvent` | 批量上报、白名单清洗、聚合/漏斗/DAU |
| Creation 作品 | `Creation` | 发布、浏览（最新/最热）、点赞去重、导入 |

## 目录结构

```
apps/server-java/
├── pom.xml
├── db/migration/                 # SQL 初始化（建库脚本，Flyway 风格手工执行）
├── src/main/java/com/blocksz/server/
│   ├── ServerApplication.java    # 组合根
│   ├── domain/                   # 领域层（纯 Java，零依赖）
│   │   ├── identity/             # User 聚合 + UserRepository 接口
│   │   ├── save/                 # PlayerSave 聚合 + PlayerSaveRepository
│   │   ├── content/              # SceneAggregate + SceneRepository
│   │   ├── rollout/              # RolloutConfig + RolloutRepository
│   │   ├── analytics/            # TrackingEvent + EventRepository（查询接口）
│   │   ├── creation/             # Creation 聚合 + CreationRepository
│   │   └── shared/               # 领域异常体系
│   ├── application/              # 应用层
│   │   ├── identity/             # AuthAppService（注册/登录用例）
│   │   ├── save/                 # SaveAppService
│   │   ├── content/              # ContentAppService（草稿/发布/灰度/diff）
│   │   ├── analytics/            # AnalyticsAppService（上报/查询用例）
│   │   ├── creation/             # CreationAppService
│   │   └── dto/                  # 传输对象
│   ├── infrastructure/           # 基础设施
│   │   ├── persistence/          # JPA 实体 + Repository 实现
│   │   ├── security/             # JWT 签发/校验、密码哈希（scrypt→PBKDF2 兼容迁移）
│   │   └── validation/           # Scene/PlayerSave JSON Schema 校验（对齐 zod）
│   └── interfaces/
│       └── rest/                 # AuthController、ContentController、SaveController…
└── src/main/resources/application.yml
```

## API 契约

与原 Node 服务完全兼容（前端 web/admin 零改动）：

| Method | Path | 说明 |
|---|---|---|
| POST | /api/auth/register | 注册（首个用户自动 admin）→ JWT |
| POST | /api/auth/login | 登录 → JWT（旧哈希自动升级） |
| GET | /api/auth/me | 当前用户信息 |
| GET | /api/health | 健康检查 `{ok, ts}` |
| GET | /api/content/scenes/:id | 已发布场景（?playerId= 灰度分桶） |
| GET | /api/content/scenes/:id/versions | 版本列表 |
| GET | /api/content/scenes/:id/versions/:ver | 指定版本 |
| PUT | /api/content/admin/scenes/:id | 保存草稿（Schema 校验） |
| POST | /api/content/admin/scenes/:id/publish | 发布（semver 递增） |
| GET | /api/content/admin/scenes/:id/rollout | 灰度/回滚配置 |
| POST | /api/content/admin/scenes/:id/rollout/gray | 设置灰度百分比 |
| POST | /api/content/admin/scenes/:id/rollout/pin | 回滚锁定 |
| GET | /api/content/admin/scenes/:id/diff?from=&to= | 版本 diff |
| GET/PUT/DELETE | /api/save | 云存档（需登录） |
| POST | /api/analytics/collect | 批量埋点上报 |
| GET | /api/analytics/admin/overview | 事件总览 |
| GET | /api/analytics/admin/funnel | 漏斗 |
| GET | /api/analytics/admin/dau | DAU |
| POST | /api/creations/publish | 发布作品 |
| GET | /api/creations/list?sort=new\|hot | 作品列表 |
| POST | /api/creations/:id/like | 点赞 |
| GET | /api/creations/:id | 作品详情（导入） |

## 快速启动

```bash
cd apps/server-java
mvn spring-boot:run          # :4001，SQLite 自动建库 data/block-sz-java.sqlite
```

数据迁移（可选，导入旧 Node 服务数据）：

```bash
# 编译迁移工具后执行（源库 = 旧服务 data/block-sz.sqlite）
mvn -q package
java -cp target/server-java-0.1.0.jar -Dloader.main=com.blocksz.server.tools.DataMigrator org.springframework.boot.loader.launch.PropertiesLauncher
```

## 领域规则摘要

- **密码**：新用户 PBKDF2WithHmacSHA256（salt$hash）；兼容校验旧 scrypt$/sha256 格式，登录成功自动升级
- **发布**：草稿版本必须严格大于最新已发布版本（semver 逐段比较）
- **灰度**：playerId 稳定哈希（31 进制）分桶 [0,100)，命中灰度百分比走最新版，其余走上一版；pinned 版本全量锁定
- **点赞**：同玩家同作品去重；likers 以 JSON 数组存储
- **埋点**：服务端时间戳；name ≤64 字符、props ≤20 项、字符串截断白名单清洗
- **作品**：placements 1-500 项，坐标 |x|,|z|≤5000、|y|≤2000；title 2-32 字符

## 与旧服务对比

| | Node/Express（旧） | Java/Spring（新） |
|---|---|---|
| 架构 | 路由+Store 单体 | DDD 四层、限界上下文 |
| 持久化 | node:sqlite 内存索引写直达 | JPA + SQLite（Hibernate 通用方言） |
| 校验 | zod（TS 包共享） | Java 手写 Schema 校验对齐 zod 规则 |
| 鉴权 | jsonwebtoken | jjwt 0.12 + Cookie/Bearer 双通道 |
| 密码 | node scrypt | PBKDF2（兼容旧格式迁移） |
