# 前端决策记录（Decisions · Frontend）

> 前端专属架构/渲染决策。跨端决策见 `../shared/decisions.md`。

## ADR-002 前端洋葱分层
- **背景**：`engine.ts` 630 行上帝类、领域/渲染/DOM 面板互相缠绕、fetch 分散三处。
- **决策**：views→engine→domain→services→infra 洋葱分层；engine 为组合根不被内层 import；`scripts/check-layering.mjs` 机器守护。
- **结果**：依赖单向可维护；代价是迁移期保留 engine 下 re-export 桥。

## ADR-004 事件总线替代轮询队列
- **背景**：`engine.events[]` 数组 + App.vue 每 250ms splice 轮询，数据流绕经视图层。
- **决策**：`domain/events.ts` 定义 GameplayEvent，engine 与 services 各自订阅；保留 events 数组字段防 e2e 破坏。
- **结果**：事件流解耦；代价是迁移期双轨并存。

## ADR-006 静态几何按材质合并
- **背景**：大量静态 mesh 导致 draw call 爆炸。
- **决策**：`mergeStaticGroup` 按材质分桶合并；透明材质不投影（castShadow=!transparent）。
- **结果**：站亭 100+→~3 draw call；代价是合并后无法单独变换单个实例。

## ADR-007 车流 InstancedMesh 化
- **背景**：36 辆车×多 mesh draw call 高。
- **决策**：InstancedMesh 合并（3 色车身+车顶+车轮=5 draw call）；复合变换写入四元数（因实例矩阵覆盖 mesh.rotation）。
- **结果**：车流 draw call 极低；代价是车轮横躺等变换必须手动复合。

## ADR-008 流式加载 + LOD
- **背景**：全城一次性挂载内存/绘制压力大。
- **决策**：街区/树/路灯按区 `STREAM_R=2400` 流式挂载；远距装饰/名牌 LOD 隐藏。
- **结果**：性能可控；代价是 STREAM_R < 雾距(5600) 时远区无建筑（已知妥协）。

## ADR-009 出生点以用户选择为准
- **背景**：云存档存在时强制 teleport 到旧位置，无视新选出生点。
- **决策**：删除存档位置对出生点的覆盖，以本次所选出生点为准。
- **结果**：用户选择真正生效；代价是回档不再强制还原到存档点（落位所选节点）。

## ADR-010 区际道路交通
- **背景**：各区路网孤立，景点间只有草地。
- **决策**：`buildInterDistrictHighways` 用最小生成树+近邻边串联 7 个陆上区（futian/luohu/nanshan/baoan/longhua/longgang/yantian）；海相隔离的大鹏/坪山排除。
- **结果**：区际快速路网连通，车流同跑区内主干道+区际快速路（上限 64 辆）；代价是海相隔区不连陆路。

## ADR-011 全城车流上限 64
- **背景**：车流过多影响性能。
- **决策**：`MAX_CARS=64`，均衡分布在交通走廊。
- **结果**：车流密度合理；代价是上限外的路网无车。

---
*新决策在此追加；改动既有决策需标注「修订」。*