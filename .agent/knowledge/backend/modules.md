# 后端模块（Modules · apps/server-java）

> 各**限界上下文**（bounded context）的内部职责与 REST 端点。改某个域/接口前先查对应上下文。

## 限界上下文总览

| 上下文 | application | domain | infrastructure | interfaces(Controller) |
|---|---|---|---|---|
| **identity 身份** | AuthAppService / UserAdminAppService | User/UserRepository/TokenService/PasswordEncoder | JdbcUserRepository | AuthController / AdminUserController |
| **content 内容** | ContentAppService | SceneAggregate/SceneRepository/SceneSchema | JdbcSceneRepository / JacksonSchemaValidator | ContentController |
| **save 存档** | SaveAppService | PlayerSave/PlayerSaveRepository/SaveSchema | JdbcSaveRepository | SaveController |
| **rollout 灰度** | (经 ContentAppService) | RolloutConfig/RolloutRepository | JdbcRolloutRepository | — |
| **creation 作品** | CreationAppService | Creation/CreationRepository | JdbcCreationRepository | CreationController |
| **analytics 埋点** | AnalyticsAppService | TrackingEvent/EventRepository | JdbcEventRepository | AnalyticsController |
| **moderation 审核** | ModerationAppService | — | — | ModerationController |
| **health 健康** | — | — | — | HealthController |

## identity（身份）

- 注册（首用户自动 admin）、登录、提权（邀请码机制）、token 刷新。
- 密码：新 PBKDF2，旧 scrypt/sha256 登录时自动升级（`MultiFormatPasswordEncoder`）。
- `AuthArgumentResolver` 解析 `@Auth` 注入当前用户；`AdminGuard` 校验 admin 权限。
- REST：`AuthController`（注册/登录）、`AdminUserController`（用户管理/提权）。

## content（内容 · 核心）

- 场景草稿/发布的完整生命周期：保存草稿 → 校验（`JacksonSchemaValidator`）→ 发布（semver 严格递增）。
- `SceneAggregate`：场景聚合；`SceneRepository`：读写场景 JSON。
- **灰度发布**：`playerId` 经 31 进制稳定哈希分桶 `[0,100)` 对照 `RolloutConfig` 分桶阈值，`?playerId=` 返回该桶版本 + `gray:true`。
- 场景校验宽松：新增字段不破坏旧数据。
- REST：`ContentController`：
  - `GET /api/content/scenes/{id}`（`?playerId=` 灰度分桶，auth=false）
  - 管理端点（保存草稿/发布，AdminGuard 保护）

## save（存档）

- `PlayerSave` 存档读写；`SaveSchema` 校验；`JdbcSaveRepository` 持久化。
- 存档 JSON 走 schema 校验（宽松），与前端 `saveCodec` 字段对应。
- REST：`SaveController`（拉取/保存玩家存档，@Auth）。

## rollout（灰度）

- `RolloutConfig`：灰度分桶配置（阈值/目标桶）；`RolloutRepository` 读写。
- 由 content 发布流程调用，无独立 Controller。

## creation（作品）

- `Creation` 玩家作品（placements≤500）；`JdbcCreationRepository` 持久化。
- REST：`CreationController`（发布/查询作品）。

## analytics（埋点）

- `TrackingEvent` 追踪事件；`JdbcEventRepository` 持久化；`AnalyticsAppService` 聚合。
- REST：`AnalyticsController`（上报/查询统计）。

## moderation（审核）

- `ModerationAppService` 内容审核用例。
- REST：`ModerationController`（审核动作，AdminGuard）。

## 安全 / 横切

- `AdminGuard`：admin 权限校验。
- `RateLimitGuard`：滑动窗口限流。
- `GlobalExceptionHandler`：`DomainException` + 校验错误统一转 HTTP 错误。
- `AuthArgumentResolver`：`@Auth` 注入当前用户。
- `HealthController`：`GET /api/health`（前端 `checkHealth()` 用）。

## 关键调用链路

1. 前端 `services/content.ts fetchScene(id, playerId)` → `GET /api/content/scenes/{id}?playerId=`
2. `ContentController` 按 playerId 分桶 → `ContentAppService` 取灰度/正式版本 → `SceneRepository` 读 JSON
3. 返回 `{scene, gray}` → 前端 `world.ts buildWorld(scene)` 消费