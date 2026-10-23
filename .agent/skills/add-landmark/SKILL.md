---
name: add-landmark
description: "往场景加一个地标。当用户要加地标、新地标、加一个 landmark、新增可拍照/可到访/可投资的建筑时触发。步骤：找目标区 → 加 JSON → 配 builder/geometry → 过 schema → 验证。"
---

# 加一个地标（landmark）

## 目标
在 `shenzhen-main.json` 的 `landmarks` 数组新增一个地标，让它能在游戏里渲染、可交互、可拍照。

## 前置条件
- 知道目标区（district id）与经纬度（lat/lng）

## 步骤

1. **定位**
   - 内容：`apps/web/public/content/shenzhen-main.json` 的 `landmarks`
   - Schema：`packages/schema/src/landmark.ts`
   - 渲染：`apps/web/src/engine/builders.ts`（BUILDERS）+ `world.ts`

2. **决定建模来源（二选一）**
   - **内置 builder**：若 `BUILDERS[id]` 已有对应的程序化 builder，填 `"builder": "<id>"`。
   - **procedural geometry**：否则填 `"geometry": [...]`（elementGeometrySchema）或用 fallback builder。
   - 真实 GLTF：放 `apps/web/public/content/models/shenzhen-main/{id}.glb`（加载失败自动降级程序化）。

3. **写地标 JSON**
   ```json
   {
     "id": "unique-id",
     "name": "地名",
     "district": "futian",
     "latlng": { "lat": 22.5, "lng": 114.05 },
     "interactRadius": 30,
     "desc": "图鉴文案",
     "builder": "builderId",        // 或 "geometry": [...]
     "photoable": true,
     "deck": false,
     "enabled": true
   }
   ```
   - 坐标量级参考现有地标；用 `proj(lat,lng)` 思想换算（见 shared/projection.ts）。
   - 若要登顶观景台：`"deck": true` 且确保是高层地标。

4. **过 schema 校验**（`validateScene` 或 admin 保存草稿）。

5. **验证渲染**
   - 本地启动 dev 进游戏，确认位置/名牌/可交互。
   - 碰撞体由 world.ts 地标循环自动注册（24x24 底面），无需手动。

## 验证
- `validateScene` 通过
- 游戏内：地标出现在目标区、名牌显示、走近可交互、能拍照进图鉴

## 参考
- `.agent/knowledge/shared/data-model.md`（landmark 字段）
- `.agent/knowledge/shared/glossary.md`（区/投影常量）
- `.agent/pitfalls.md`（静态合并/坐标缓存）