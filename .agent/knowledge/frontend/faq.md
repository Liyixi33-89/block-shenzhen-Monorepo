# 前端 FAQ（Frontend）

> 前端高频疑问速答。后端疑问见 `backend/faq.md`。

## 内容与发布

**改了 `shenzhen-main.json` 但游戏里没变化？**
web 拉取的是后端发布版本（`/api/content/scenes/shenzhen-main`），本地 JSON 只是兜底/参考。改内容需走 admin 保存草稿→发布，或调发布 API。

**新增内容字段会不会破坏旧场景？**
场景校验是宽松 Jackson/zod：新增字段不影响旧数据；旧场景缺省字段走引擎内置常量（零破坏）。但新增字段若在引擎侧读取，需保证兜底默认值。

## 构建与工程

**vite build 报「Could not resolve entry module index.html」？**
hoisted monorepo：vite 需在 `apps/*` 目录内运行。`cd apps/web && node ../../node_modules/vite/bin/vite.js build`。

**前端分层脚本报违规？**
跑 `node scripts/check-layering.mjs` 看具体违规行：domain→外层 / services→engine / views 直接 fetch 是最常见的三类。修好对应 import 或用 services/api 收敛网络请求。

**改共享包（schema/shared）后要重建吗？**
要。`npm run build -w packages/schema` / `-w packages/shared`。前端 import 的是构建产物。

## 渲染与性能

**想给远区加建筑但没建筑？**
STREAM_R=2400 是流式半径，雾距 5600。这是已知性能妥协，勿盲目扩大 STREAM_R（会爆 draw call/内存）。

**车流是「横着开」/「车轮竖插」？**
车头朝向用 `atan2(-fz,fx)`（X 长轴朝前）；车轮需复合四元数 `_quat×_rollQuat`（InstancedMesh 自身 rotation 会被实例矩阵覆盖）。见 pitfalls.md 与 `frontend/rendering.md`。

**合并后出现怪影？**
`mergeStaticGroup` 统一 castShadow 导致透明材质投影。应 `castShadow = !material.transparent`。

## 存档

**新增存档字段读出来是空？**
`saveCodec.ts` 的 `snapshotToSave` 和 `saveToInit` 是两处手写映射，必须都改（序列化 + 回档）。

**玩家选新出生点没生效？**
已修复：旧逻辑「回档优先」会用存档位置覆盖所选出生点；现以本次所选出生点为准（ADR-009）。

## 领域

**霓虹招牌白天也亮？**
`emissive` 固定未随昼夜切换，已知非 bug 妥协。路灯夜间不增强同理（注释说交给 atmosphere 但未实现）。

**想调整动态 NPC 数量/职业？**
不改代码，改场景 `config.env.npc`：`dynamicCount`/`surnames`/`jobs`/`range`。职业池字段见 `../shared/data-model.md`。

## 排查顺序建议

改玩法不生效时按：**内容是否发布 → schema 校验 → 引擎是否读取 → 构建产物是否更新** 四步排查。