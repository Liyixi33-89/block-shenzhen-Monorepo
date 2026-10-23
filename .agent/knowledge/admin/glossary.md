# 后台术语（Glossary · Admin）

> 内容后台（apps/admin）特有的概念。场景数据字段见 `../shared/data-model.md`，前端渲染术语见 `../frontend/glossary.md`。

## 会话与状态

| 术语 | 定义 |
|---|---|
| **HttpOnly cookie 会话** | 登录后后端下发 `bsz_token`（HttpOnly，前端不可读）；前端仅缓存用户信息于 `localStorage('bsz_admin_user')` |
| **restoreSession** | 调 `/api/auth/me` 用 cookie 校验登录态；路由守卫前置，幂等可重复调 |
| **authReady** | me 校验完成的标记，避免守卫首帧闪烁 |
| **SceneDoc** | `useSceneDoc` 场景文档状态机：scene/dirty/loadScene/saveDraft/publish/touch |

## 编辑操作

| 术语 | 定义 |
|---|---|
| **touch** | 任意字段改动置 `dirty=true`；驱动「未保存」标记与切路由/登出确认 |
| **草稿 vs 发布** | 草稿 `PUT` 保存可反复改（不递增版本）；发布 `POST` 自动 bump patch 并过校验 |
| **bumpPatch** | 发布前把 `version` 的 patch 位 +1（`a.b.c → a.b.c+1`），满足后端 semver 严格递增 |
| **issues** | 保存/发布校验失败明细（`path: message` 列表） |

## 版本管理

| 术语 | 定义 |
|---|---|
| **灰度 percent** | 玩家 ID 稳定哈希分桶 `[0,100)`；桶值 < percent → 最新版，否则上一版 |
| **回滚锁定 pin** | 全量锁定到历史版本，所有玩家立即切换 |
| **版本 diff** | 两版本路径级差异（`{path,type,detail}`），admin 表格展示 |
| **DOM 类名契约** | `.item-list`/`.form-pane`/`.map-picker`/`.ana-table`/`.dau-bar`/`.funnel-step` 等，e2e 依赖，勿改 |

## 地图

| 术语 | 定义 |
|---|---|
| **MapPicker** | SVG 深圳平面图，经纬度域自动取景，点击拾取经纬度；无外部地图服务 |
| **自动取景** | 把地标/出生点/传送点/区中心全部纳入 +8% padding 确定可视范围 |

---
*「草稿/发布/灰度」等跨端内容术语见 `../shared/glossary.md`。*