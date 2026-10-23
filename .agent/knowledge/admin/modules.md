# 后台模块（Modules · apps/admin/src/components）

> 各页签编辑器的内部职责与交互。改某个编辑器前先查对应条目。所有页签共享 `useSceneDoc` 的同一份 `scene`（见 `architecture.md`）。

## 通用编辑模式

- 每个编辑器：`inject(ADMIN_CTX)` 取 `doc`，`scene` = `doc.scene`，字段修改统一 `@input="touch"` 置脏。
- 新增条目用 `id = prefix + Date.now().toString(36)`（如 `spawn_`、`npc_`、`st_`）保证唯一。
- 删除操作均带 `confirm` 确认。
- DOM 类名契约：`.item-list`（选中列表）/ `.form-pane`（表单）/ `.map-picker`（地图）。

## 内容编辑页签

| 页签 | 路由 | 编辑对象 | 特有逻辑 |
|---|---|---|---|
| **场景** | `/scene` | 场景基础信息 + 投影参数 | `SceneInfoCard`：name/version/desc + `projection`（origin/unitPerKm/farCompress）；统计 elements/buildRecipes/npcs/traffic/shopItems/ascension 数量 |
| **地标** | `/landmarks` | `landmarks[]` | `LandmarkEditor`：列表+表单+地图拾点；导航栏实时显示数量 |
| **出生点** | `/spawns` | `spawnPoints[]` | `SpawnEditor`：名称/所属区/简介/朝向 + 地图拾点 |
| **传送点** | `/teleports` | `teleportPoints[]` | `TeleportEditor`：传送点表单 + 地图拾点 |
| **任务** | `/quests` | `quests[]` | `QuestEditor`：**条件类型动态表单**（visit/photo/walk/ride/districts/money/collect/interact 不同条件字段不同） |
| **区划** | `/districts` | `districts[]` | `DistrictEditor`：名称/口号/主题色(color int↔hex)/密度(cbd/urban/suburb/none)/cityRadius/sortOrder + 区中心地图拾取 |
| **商店** | `/shop` | `shopItems[]` + 投资 | `ShopEditor`：商品列表 + 投资配置 |
| **NPC** | `/npcs` | `npcs[]` | `NpcEditor`：基本信息 + **对话树**（nodes/choices）+ 店铺货架 + `config.env.npc` 动态随机 NPC 配置（数量/姓氏池/职业池/游走范围） |
| **建造** | `/build` | `elements[]` + `buildRecipes[]` | `BuildEditor`：元素（几何 `params` 因 kind 而异，用 JSON 文本兜底）+ 配方完整表单 |
| **交通** | `/traffic` | `traffic.stations[]` + `routes[]` | `TrafficEditor`：站点（含 transfers 换乘）+ 线路；`KINDS`=metro/bus/boat/cable/elevator |
| **飞升** | `/ascension` | `ascension.stages[]` | `AscensionEditor`：阶段树 + 能力解锁（build/teleport/fly）+ 前置阶段 requires |
| **JSON** | `/json` | 整份场景 | `JsonEditor`：完整 JSON 双向同步；`applyJson` 校验 `id==='shenzhen-main'`；切入页签时父组件调 `refresh()` |

## 管理页签

| 页签 | 路由 | 功能 | 后端端点 |
|---|---|---|---|
| **用户** | `/users` | 列表/搜索/角色变更/封禁解封 | `/api/admin/users`（?keyword&limit）、`/role`、`/ban` |
| **分析** | `/analytics` | DAU 柱状/核心漏斗/事件表 | `/api/analytics/admin/overview`、`/dau`、`/funnel`（steps=session_start,visit,photo,quest_done） |
| **版本** | `/versions` | 灰度滑杆/回滚锁定/版本 diff | `/api/content/admin/scenes/{id}/rollout`（GET）、`/rollout/gray`、`/rollout/pin`、`/diff?from&to` |

## 版本·灰度·回滚（VersionPanel，重点）

- **灰度发布**：滑杆 `0-100%`。玩家 ID 稳定哈希分桶：桶值 < 百分比 → 最新版；其余 → 上一版。逐步放大观察埋点。
- **回滚/锁定**：`rollout/pin` 全量锁定到历史版本（所有玩家立即切换）；选「不锁定」恢复跟随最新。
- **版本 diff**：`GET .../diff?from=v&to=v` 返回路径级差异表（`{path,type,detail}`），最多显示前 100 条。
- DOM 契约：`input[type=range]` / `.diff-controls select`（e2e 依赖）。

## 数据展示（AnalyticsPanel）

- **DAU**：按天柱状（`.dau-bar`），`/dau?days=N`。
- **漏斗**：`/funnel`，四步 `session_start → visit → photo → quest_done`，显示人数 + 转化率。
- **事件表**：`/overview?days=N`，按事件聚合总量/玩家数/今日/最近样例（样例 `props` 取前 3 键压缩显示）。
- 客户端每 10 秒批量上报埋点，玩家操作后稍候刷新才有数据。

---
*字段语义权威见 `../shared/data-model.md`；后端端点详解见 `../backend/modules.md`。*