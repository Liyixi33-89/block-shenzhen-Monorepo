# 项目陷阱清单（Pitfalls）

> 按「现象 → 根因 → 规避/修复」三行式记录。改动前先扫一眼，避免重复踩坑。

## 渲染 / three.js

### 车流「横着开」
- **现象**：车身长轴（X=4.6）垂直于行驶方向，像横着飘。
- **根因**：用 `atan2(fx,fz)` 让 X 长轴转向垂直于行驶方向。
- **规避**：应让 X 长轴朝前，用 `atan2(-fz, fx)`（`world.ts` 车流 update）。

### 车轮「竖插地面」
- **现象**：InstancedMesh 下车轮竖直插着，不像横躺。
- **根因**：CylinderGeometry 默认 Y 轴竖直；InstancedMesh 自身 rotation 会被实例矩阵覆盖。
- **规避**：复合四元数 `_quat × _rollQuat`（绕 Z 转 90°）写进实例矩阵，不能靠 mesh.rotation。

### 静态合并后透出「怪影」
- **现象**：光圈/光柱/玻璃透出奇怪阴影。
- **根因**：`mergeStaticGroup` 合并后统一 `castShadow=true`。
- **规避**：透明材质不投影，`castShadow = !material.transparent`。

### 每帧 GC 卡顿
- **现象**：日夜间歇卡顿。
- **根因**：`update` 每帧 `new` ~10 个 Color/Vector3。
- **规避**：模块级复用变量（`_M`/`_pos`/`_quat`/`_scl`），避免每帧分配。

### 远区无建筑
- **现象**：STREAM_R=2400 但雾远 5600，远区一片空地。
- **根因**：性能取舍，流式半径小于雾可见距离。
- **规避**：这是已知妥协，勿盲目扩大 STREAM_R（会爆 draw call/内存）。

## 资源 / 内存

### 天气粒子贴图泄漏
- **现象**：反复进出天气系统内存上涨。
- **根因**：`removeParticles` 只 dispose geometry/material，漏了 CanvasTexture（map）。
- **规避**：dispose 时补 `mat.map?.dispose()`。

### BuildMode GPU 泄漏
- **现象**：退出建造模式 GPU 内存不清。
- **根因**：dispose 只移 DOM/节点，geoCache/matCache/ghostMat/ring 未释放。
- **规避**：dispose 释放全部并清空缓存。

### player 泄漏（事件监听累积）
- **现象**：反复进出游戏，化身/监听泄漏。
- **根因**：player.dispose 只移除 window 监听，化身几何/材质未释放；engine.dispose 漏调 player.dispose()。
- **规避**：player.dispose 释放化身资源；engine.dispose 调 player.dispose()。

### 重建世界碰撞盒累积
- **现象**：反复进出世界后碰撞盒越来越多，穿墙/卡住。
- **根因**：`collision.clear()` 只在 buildWorld 开头调用，但若跳过则累积。
- **规避**：确认每次重建前 clear。

## 存档 / 云存档

### 出生点选了不生效，停留旧节点
- **现象**：玩家选新出生点进世界，仍落回上一次存档位置。
- **根因**：`engine.ts` world 阶段旧逻辑「回档优先」，有 `saved.pos` 就 teleport 覆盖所选出生点。
- **规避**：应以本次所选出生点为准（已修复：删除存档覆盖，落位所选节点）。

### 新增存档字段丢了
- **现象**：加了新字段重进游戏字段为空。
- **根因**：`saveCodec.ts` 的 `snapshotToSave` 和 `saveToInit` 是两处手写映射，只改了一处。
- **规避**：新增字段必须两处都改（序列化 + 回档）。

## 构建 / 工程

### vite 找不到入口 `index.html`
- **现象**：在仓库根目录跑 `vite build` 报 "Could not resolve entry module index.html"。
- **根因**：hoisted monorepo，vite 需在 `apps/*` 目录内运行。
- **规避**：`cd apps/web && node ../../node_modules/vite/bin/vite.js build`。

### 前端 tsconfig 里 schema 包 `.ts` 后缀报错
- **现象**：`schema` 包 import 用 `.ts` 后缀，tsc 报错。
- **根因**：`allowImportingTsExtensions` 未开（属包自身构建配置）。
- **规避**：属已知技术债，web 侧 `tsc --noEmit` 0 错误即可，勿强行改 schema 包配置。

### git push 在 PowerShell 下 Exit code 1 误报
- **现象**：`git push` 返回 exit 1，看似失败。
- **根因**：git 把进度写到 stderr，PowerShell 误判。
- **规避**：看输出里 `.. -> main` 即为成功，勿重复 push。

## 领域 / 经济

### 霓虹招牌白天也亮
- **现象**：霓虹招牌白天不熄灯。
- **根因**：`emissive` 固定，未随昼夜切换。
- **规避**：已知非 bug 妥协，勿当作 bug 改（除非新需求）。

### 路灯夜间不增强
- **现象**：夜间路灯亮度不变。
- **根因**：注释说交给 atmosphere 但未实现。
- **规避**：已知非 bug 妥协。

### 建筑立面贴图 seed 不进缓存 key
- **现象**：不同 seed 建筑可能共用缓存贴图。
- **根因**：纹理缓存 key 未含 seed。
- **规避**：已知非 bug 妥协（影响很小）。

## 后端 / 内容

### 发布 semver 冲突
- **现象**：发布失败提示版本必须大于最新。
- **根因**：后端 semver 严格递增，草稿版本须 > 已发布版本。
- **规避**：发布前把场景 JSON 的 `version` 抬到高于线上最新版。

### 改动场景但前端不生效
- **现象**：改了 `shenzhen-main.json` 但游戏里没变化。
- **根因**：web 拉取的是后端发布版本（`/api/content/scenes/shenzhen-main`），本地 JSON 只是参考/兜底。
- **规避**：改内容走 admin 保存草稿→发布；若仅调试前端渲染，确认读的是本地 JSON 还是后端。