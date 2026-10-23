# 后台架构（apps/admin · Vue3 内容管理）

> 内容后台：结构化可视化编辑场景 JSON → 校验 → 发布。与 `apps/web` 同用 `@block-sz/schema` 类型与 `@block-sz/shared` 常量。

## 定位与职责

- **端口**：dev :5175，vite proxy `/api → http://127.0.0.1:4001`（同 web 端口，指向 `server-java`）。
- **本质**：一份场景 JSON（`shenzhen-main`）的**结构化编辑器 + 发布台**。所有页签编辑同一份 `scene` 响应式对象。
- **不直接跑游戏**：admin 只编辑/校验/发布内容，不加载 three.js 引擎（区别于 web）。

## 目录结构与分层

```
apps/admin/src
├── main.ts / App.vue      仅路由出口
├── router/index.ts        登录/后台分离 + 全局守卫（cookie 会话恢复）
├── stores/auth.ts         认证状态（HttpOnly cookie 会话，前端不持 token）
├── services/api.ts        adminFetch：唯一 HTTP 出口
├── context.ts             ADMIN_CTX provide/inject 键（注入 doc）
├── composables/useSceneDoc.ts   场景文档状态机（唯一数据源）
├── views/                 AdminLayout（导航+公共操作条）/ LoginView
└── components/            各内容页签编辑器 + JsonEditor/MapPicker
```

## 认证与会话

- **HttpOnly cookie 会话**：登录后后端下发 `bsz_token`（HttpOnly，前端不可读）。前端只在 `localStorage` 缓存用户信息（`bsz_admin_user`）供展示。
- **登录态判定**：`restoreSession()` 调 `GET /api/auth/me` 用 cookie 校验，不再持有/回传 token。
- `adminFetch` 统一 `credentials: 'include'` 携带 cookie。
- **路由守卫**：`router.beforeEach` 先 `restoreSession()`；未登录→`/login`，已登录访问 `/login`→`/scene`。`authReady` 避免首帧闪烁。

## 场景文档状态机（useSceneDoc）

`AdminLayout` provide `ADMIN_CTX`，各页签组件 inject 使用。单例 `scene` 响应式对象是**所有编辑的唯一数据源**：

- `loadScene()`：`GET /api/content/scenes/{id}` 拉已发布场景。
- `saveDraft()`：`PUT /api/content/admin/scenes/{id}` 保存草稿（后端 schema 校验，返回 issues）。
- `publish()`：`bumpPatch()` 自增 patch 版本 → 先存草稿 → `POST .../publish` 发布。
- `touch()`：任意字段改动置 `dirty=true`（模板统一 `@input`）。`dirty` 驱动「未保存」标记 + 切路由/登出确认。
- `issues`：保存/发布校验失败明细（`path: message`）。

## 关键交互模式

- **列表 + 表单双栏**：`.item-list`（左侧选中列表）+ `.form-pane`（右侧表单）。DOM 类名是 **e2e 契约**，勿随意改动。
- **MapPicker**：SVG 深圳平面图，经纬度域自动取景（地标/出生点/传送点/区中心全部纳入 +8% padding），点击→经纬度。无外部地图服务。
- **JSON 高级编辑**：`JsonEditor` 整份场景 JSON 双向同步；`id` 必须为 `shenzhen-main`，否则拒绝应用。

## 与后端的契约

- admin 使用后端**管理端点**（`/api/content/admin/...`、`/api/admin/users`、`/api/analytics/admin/...`），受 `AdminGuard` 保护。
- 发布依赖后端 **semver 严格递增**（发布版本必须 > 最新）；`bumpPatch` 保证。
- 校验依赖后端 `JacksonSchemaValidator`（宽松，对齐 zod）。

---
*后台专用术语见 `glossary.md`，页签详解见 `modules.md`，高频疑问见 `faq.md`。*