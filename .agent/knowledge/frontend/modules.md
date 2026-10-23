# 前端引擎模块（Modules · apps/web/src/engine）

> `engine/` 各系统模块的**内部职责**。改某个玩法/渲染系统前先查对应模块。

## 组合根与生命周期

### engine.ts — 装配入口（组合根）
- 全引擎唯一装配器：创建 renderer/scene/camera、注入各系统依赖、定义加载阶段。
- **加载阶段**：`loadPhase('boot'|'content'|'systems'|'world')` 依次推进，App.vue 轮询 `engine.status`。
- 负责出生点选择（以**本次所选**为准，不回档强制覆盖，见 ADR-009）、云存档回档、日票免票、HUD 数据轮询。
- `engine.dispose()`：释放世界独占资源 + 调 player/面板 dispose + 移除 window 监听。**必须完整释放防泄漏**。
- 内部 `engine/gameplay.ts`/`ascension.ts`/`cloud.ts`/`analytics.ts` 为 re-export 桥。

### mainloop.ts — 主循环
- requestAnimationFrame 驱动：delta 换算、各系统 `update(dt)` 顺序调用、渲染。
- 每帧内避免 `new` 对象（用模块级复用变量防 GC）。

### factories.ts — 工厂
- 组装 engine 对象：把 domain/services/engine 系统实例注入，供 views 使用。

## 世界构建与渲染

### world.ts — 世界构建（37KB，最大模块）
- `buildWorld(scene)` 返回 `{root, tick, lighting, skyMat, fog, roadGraph, streaming, dispose}`。
- 构建地标（`buildLandmarks`）、站亭（`buildTraffic`，合并后 ~3 draw call）、建筑街区、道路。
- **道路**：`buildRoadGraph` 编译全城道路图供 NPC 游走；`buildInterDistrictHighways` 生成区际快速路（见 ADR-010）。
- **车流**：`buildVehicles` 用 InstancedMesh（3 色车身+车顶+车轮=5 draw call），车辆在「区内主干道+区际快速路」往返，上限 `MAX_CARS=64`。
- 地标碰撞体在循环中自动注册（24x24 底面）；站亭碰撞 11x11。
- `collision.clear()` 在重建世界时清空碰撞盒。

### roadnet.ts — 区内路网
- `generateRoadNet` 每区按 `cityRadius`/`density` 程序化生成 grid+jitter 网格路网（无需手画）。
- 输出节点/边，供车流与 NPC 寻路。

### builders.ts — 程序化建模
- `BUILDERS[id]`：内置地标 builder（程序化几何）；`LABEL_HEIGHT[id]` 名牌高度。
- 地标可用真实 GLTF（`public/content/models/{scene}/{id}.glb`，失败降级程序化）。

### textures.ts / assets.ts — 资源
- `markSharedGeo`/`markSharedMat` 登记的几何材质跨世界复用，dispose 时跳过。

### collision.ts — 碰撞
- 全局碰撞盒（地标/站亭/建筑/传送门）；重建前 `clear()`。

## 玩法交互系统

### player.ts — 玩家
- 化身（body/head/四肢/锥）构建 + 移动/朝向/碰撞 + 相机跟随（高 16/距 30）。
- 基准：高~8、宽 2.6、碰撞半径 2.2、步行 26。
- `dispose()` 释放化身几何/材质 + 移除 window 监听。

### photo.ts — 拍照
- 快门动画、相机取景、图鉴判定（`photoable` 地标）。

### transit.ts — 乘车
- 按地理最短路站序，跨区传送；站亭名牌 LOD（`STATION_LABEL_LOD=900`）。

### npc.ts — NPC
- 静态 NPC（对话树）+ 动态 NPC（职业池随机生成、游走）。
- 名牌裁剪 `NPC_LABEL_LOD=150`；避让 `NPC_MIN_SEP=3.5`。
- `dispose()` 释放化身资源。

### build.ts — 建造模式
- 8 格网格吸附、配方放置、`geoCache`/`matCache`/`ghostMat`/`ring`。**dispose 必须释放这些缓存防 GPU 泄漏**。

### teleport.ts — 传送
- T 键面板、到访解锁、¥10/次、冷却。

### shop.ts / souvenir.ts — 商店/纪念品
- 商店 NPC 售卖；地标到访送纪念品。

### gallery.ts — 图鉴
- 收集的 landmark 相册展示。

### deck.ts — 观景台
- 高层地标塔顶俯瞰/夜景。

### tutorial.ts — 引导
- 新手教学流程。

### daynight.ts / weather.ts / atmosphere.ts — 昼夜天气
- DayNightSystem 调节光照/雾/天空；WeatherSystem 雨雪粒子；AtmosphereSystem 大气。
- daynight 每帧复用模块级色端点防 GC。

### occlusion.ts — 遮挡
- `isOccluded` 判定，相机/玩家被挡隐藏。

### icons.ts / keymap.ts / touch.ts — 辅助
- 图标、键位映射、触控适配。

## 领域层（domain/）

| 文件 | 职责 |
|---|---|
| `gameplay.ts` | 玩法规则：任务条件判定、金钱、图鉴、飞升点数（纯逻辑，无 three/fetch） |
| `events.ts` | `GameplayEvent` 事件类型定义（事件总线） |
| `ascension.ts` | 飞升阶段判定与能力解锁 |

## 服务层（services/）

| 文件 | 职责 |
|---|---|
| `api.ts` | HTTP 唯一出口：`request()` 注入 token + JSON 规约 |
| `content.ts` | `fetchScene`/`checkHealth`（灰度分桶参数） |
| `cloud.ts` | 云存档拉取/保存 |
| `saveCodec.ts` | 存档编解码：`snapshotToSave`/`saveToInit` 字段映射唯一源 |
| `analytics.ts` | 埋点上报 |