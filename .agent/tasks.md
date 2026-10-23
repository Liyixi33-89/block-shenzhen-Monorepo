# 常见任务手册（Tasks）

> 每个 playbook 给出「定位文件 → 关键点 → 验证」三步。内容改动优先（JSON），玩法改动才进代码。

## 1. 加一个地标（landmark）

**定位**：内容在 `apps/web/public/content/shenzhen-main.json` 的 `landmarks` 数组；Schema 在 `packages/schema/src/landmark.ts`。

```json
{
  "id": "unique-lowercase-id",
  "name": "地名",
  "latlng": { "lat": 22.5, "lng": 114.05 },
  "builder": "builderIdOrNull",   // 程序化 builder（见 engine/builders.ts BUILDERS），或 null 用 fallback
  "interactRadius": 600
}
```

**关键点**：
- 想用真实 GLTF 模型：放 `apps/web/public/content/models/shenzhen-main/{id}.glb`（加载失败自动降级到程序化 builder）。
- `engine/builders.ts` 的 `BUILDERS[id]` 提供程序化几何；`LABEL_HEIGHT[id]` 控制名牌高度。
- 地标碰撞体在 `world.ts` 地标循环自动注册（24x24 底面）。
- 坐标用 `proj(lat,lng)` 换算，参考现有地标数值量级。

**验证**：`cd apps/web && node ../../node_modules/vite/bin/vite.js build`；进游戏确认位置/名牌/可交互。

## 2. 加一个任务（quest）

**定位**：`shenzhen-main.json` 的 `quests` 数组；Schema 在 `packages/schema/src/quest.ts`；任务条件判定在 `apps/web/src/domain/gameplay.ts`。

**关键点**：
- 条件类型 `photo`（拍照某地标）/`visit`（到访）/`photoSet`（一组图鉴）/`collect`（收集）/`walk`（步数）。
- 每日任务带 `daily` 标记（每日重置）；奖励 `reward.money`。
- 改动后过 schema 校验；发布 semver 递增。

## 3. 加一个区（district）

**定位**：`shenzhen-main.json` 的 `districts` 数组；Schema 在 `packages/schema/src/district.ts`；路网在 `engine/roadnet.ts`。

**关键点**：
- `density`：cbd（密）/urban（中）/suburb（疏）/none（无路网）。
- `cityRadius` 决定路网圆盘大小；`center` 决定世界坐标。
- 路网由 `generateRoadNet` 程序化生成（grid+jitter），无需手画。
- 若想区际连通：`world.ts` 的 `buildInterDistrictHighways` 会把陆上区（futian/luohu/nanshan/baoan/longhua/longgang/yantian）自动联网；海相隔离区（dapeng/pingshan）不连陆路。

## 4. 加/调 NPC 职业或动态 NPC

**定位**：静态 NPC 在 `shenzhen-main.json` 的 `npcs`；动态 NPC 由 `config.env.npc` 控制（`dynamicCount`/`surnames`/`jobs`/`range`）。

**关键点**：
- 职业池 `npcJobSchema`：`honorific`/`body`/`hat`/`weight`/`lines`/`rain`/`night`/`tip`/`stall`。
- 动态 NPC（16 个）由前端运行时生成，不在 JSON 里逐个定义。
- 引擎实现在 `apps/web/src/engine/npc.ts`（NPC 避让 `NPC_MIN_SEP=3.5`，名牌裁剪 `NPC_LABEL_LOD=150`）。

## 5. 加交通站/线路

**定位**：`shenzhen-main.json` 的 `traffic.stations` / `traffic.routes`；Schema 在 `packages/schema/src/vehicle.ts`；引擎在 `engine/transit.ts`（乘车）、`engine/world.ts`（站亭渲染）。

**关键点**：
- 站亭几何在 `world.ts` 的 `buildTraffic`，合并后 ~3 draw call。
- 乘车逻辑 `transit.ts` 按地理最短路站序，跨区传送，日票免票逻辑在 `engine.ts`。
- 站亭碰撞体自动注册（11x11）。

## 6. 调整车流/道路

**定位**：`engine/world.ts` 的 `buildVehicles`（车流，InstancedMesh）+ `buildInterDistrictHighways`（区际快速路）+ `engine/roadnet.ts`（区内路网）。

**关键点**：
- 车流车辆在「区内主干道（major 且长>60）+ 区际快速路」上往返行驶，总量上限 `MAX_CARS=64`。
- 车头朝向、车轮横躺是历史坑（见 pitfalls.md）。

## 7. 发布内容到后端

**定位**：admin 后台 :5175 或直接调 API。

```bash
# 保存草稿（需要登录 token）
curl -X PUT http://127.0.0.1:4001/api/content/admin/scenes/shenzhen-main \
  -H "content-type: application/json" -H "authorization: Bearer <token>" -d @scene.json
# 发布（semver 严格递增）
curl -X POST http://127.0.0.1:4001/api/content/admin/scenes/shenzhen-main/publish \
  -H "authorization: Bearer <token>"
```

**验证**：`curl http://127.0.0.1:4001/api/content/scenes/shenzhen-main` 确认新版本生效。

## 8. 加存档字段（改动影响存档）

**定位**：唯一字段映射源 `apps/web/src/services/saveCodec.ts`（`snapshotToSave`/`saveToInit`）+ `packages/schema` 的 PlayerSave。

**关键点**：
- 新增存档字段要**同时**改序列化 `snapshotToSave` 和回档 `saveToInit` 两处（否则读旧档字段丢失）。
- `domain/gameplay.ts` 的 `GameplaySnapshot` 是回档目标。
- 后端 `apps/server-java` 的 Save 上下文对应存储。

## 9. 新增玩法系统

**定位**：业务规则进 `domain/`，HTTP 进 `services/`，渲染/交互系统进 `engine/`（独立文件），面板 DOM 若复杂可考虑 Vue 组件。遵循洋葱分层。

**关键点**：
- 事件走 `domain/events.ts` 总线；engine 与 services 各自订阅。
- 每帧计算复用模块级对象，避免 GC。
- 新系统在 `engine.ts` 的 `loadPhase('systems')` 或 `factories.ts` 装配。

## 10. 改投影/单位

**定位**：`packages/shared/src/projection.ts`（proj/unproj）+ `constants.ts`（单位常量）。前端后端共用，改动会影响全城坐标。

**关键点**：改投影后所有内容坐标语义变化，需回归验证地标/站/出生点位置。