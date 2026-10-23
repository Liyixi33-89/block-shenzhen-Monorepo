# 前端术语（Glossary · Frontend）

> 前端特有的层/渲染概念。领域术语与跨端常量见 `../shared/glossary.md`。

## 前端分层

| 层 | 定位 |
|---|---|
| **views** | App.vue / composables / 面板；禁直接 fetch |
| **engine** | 组合根 + 运行时装配器；不被内层 import |
| **domain** | 玩法规则 / 事件总线 / 飞升；纯逻辑 |
| **services** | API / 云存档 / 埋点 / 存档编解码 |
| **infra** | localStorage 适配 / 纯工具 |

## 渲染概念

| 术语 | 定义 |
|---|---|
| **mergeStaticGroup** | 按材质分桶合并 mesh 降 draw call；透明材质不投影 |
| **InstancedMesh** | 车流/树等大量实例的合并渲染 |
| **LOD / detailSwitch** | 按距离隐藏远距装饰/名牌 |
| **流式加载** | 按区在 STREAM_R 半径内挂载/卸载树路灯 |
| **碰撞盒** | collision.ts 全局碰撞，重建世界前需 clear() |
| **re-export 桥** | engine/gameplay.ts 等仅转发旧 import 的兼容文件，豁免分层检查 |