# 前端渲染机制与性能（apps/web）

## 渲染优化手段

| 手段 | 说明 | 相关文件 |
|---|---|---|
| **mergeStaticGroup** | 按材质分桶合并 mesh 降 draw call；`castShadow = !material.transparent`（透明不投影） | world.ts |
| **InstancedMesh** | 车流/树/路灯等大量实例合并渲染 | world.ts |
| **流式加载** | 街区/树/路灯按区 `STREAM_R=2400` 挂载/卸载 | world.ts |
| **LOD / detailSwitch** | 按距离隐藏远距装饰/名牌 | 各处 |
| **frustumCulled** | 视锥剔除（默认开启） | renderer |

## 渲染常量

| 符号 | 值 | 含义 |
|---|---|---|
| `STREAM_R` | 2400 | 流式挂载半径（街区/树/路灯） |
| `DECOR_LOD` | 1150 | 地标装饰远距 LOD |
| `STATION_LABEL_LOD` | 900 | 站亭名牌 LOD |
| `NPC_LABEL_LOD` | 150 | NPC 名牌 LOD |
| `NPC_MIN_SEP` | 3.5 | NPC 避让最小间距 |
| `MAX_CARS` | 64 | 全城车流上限 |

## 车流渲染（重点）

- 车身用 InstancedMesh（3 色 + 车顶 + 车轮 = 5 draw call）。
- **车头朝向**：`atan2(-fz, fx)` 让 X 长轴朝前（不是 `atan2(fx,fz)`，否则横着开）。
- **车轮横躺**：CylinderGeometry 默认 Y 轴竖直；需复合四元数 `_quat × _rollQuat`（绕 Z 90°）。InstancedMesh 自身 rotation 会被实例矩阵覆盖，必须写进四元数。

## 性能铁律

- 每帧 `update` 内避免 `new` Vector3/Color/Matrix4 → 用模块级复用变量。
- 每帧计算的投影坐标提前缓存。
- 静态几何合并用 mergeStaticGroup；大量实例用 InstancedMesh。
- 远距装饰/名牌用 LOD。

## 资源/内存

- 动态 geometry/material/texture（含 CanvasTexture）dispose 时释放。
- `engine.dispose()` 需释放世界独占资源 + 调 player/面板 dispose + 移除 window 监听。
- 重建世界前 `collision.clear()` 防碰撞盒累积。
- InstancedMesh 复合变换必须写进四元数。

## 已知妥协

- 霓虹招牌白天也亮（`emissive` 固定）；路灯夜间不增强（注释说交给 atmosphere 但未实现）。
- 建筑立面贴图 seed 不进缓存 key。
- `STREAM_R(2400) < 雾距(5600)` 时远区无建筑（性能取舍）。