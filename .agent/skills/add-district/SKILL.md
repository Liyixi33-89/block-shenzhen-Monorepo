---
name: add-district
description: "往场景加一个区。当用户要加区、新行政区、加一个 district、新增一片城区时触发。步骤：加 district JSON → 确认路网生成 → 接区际快速路（陆上区）→ 验证。"
---

# 加一个区（district）

## 目标
在 `shenzhen-main.json` 的 `districts` 数组新增一个行政区，生成其路网与建筑。

## 前置条件
- 明确区 id、中心经纬度、密度类型

## 步骤

1. **定位**
   - 内容：`shenzhen-main.json` 的 `districts`
   - Schema：`packages/schema/src/district.ts`
   - 路网：`apps/web/src/engine/roadnet.ts`（generateRoadNet）
   - 区际快速路：`apps/web/src/engine/world.ts`（buildInterDistrictHighways）

2. **写区 JSON**
   ```json
   {
     "id": "new-district-id",
     "name": "新行政区",
     "slogan": "区口号",
     "color": 0x123456,
     "center": { "lat": 22.5, "lng": 114.0 },
     "cityRadius": 800,              // 0=不生成自动街区
     "density": "urban",             // cbd/urban/suburb/none
     "sortOrder": 10
   }
   ```

3. **确认路网与建筑**
   - `cityRadius>0` 且 `density≠none` 时，`generateRoadNet` 会为新区生成网格路网（grid+jitter），自动出街区建筑。
   - 无需手画路网。

4. **接区际快速路（关键）**
   - `buildInterDistrictHighways` 会把**陆上相连**的区自动纳入快速路网（MST+近邻边）。
   - 若新区是陆上区（与现网陆地相邻）：确认其被纳入；新区需有足够的地面连接。
   - 若新区是海相隔离（如大鹏/坪山）：**不会**连陆路——若需要则需额外处理跨海，或明确排除。

5. **验证渲染**
   - 本地进游戏：新区有路网、街区建筑、与相邻区有快速路连接。
   - 车流会在区内主干道 + 区际快速路上运行。

## 验证
- `validateScene` 通过
- 游戏内：新区渲染出路网/建筑，陆上区有快速路连通

## 参考
- `.agent/knowledge/shared/data-model.md`（district 字段）
- `.agent/knowledge/shared/decisions.md`（ADR-010 区际道路）
- `.agent/architecture.md`（world/roadnet）