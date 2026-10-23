# 领域术语与跨端常量（Glossary · Shared）

> **领域概念**与**前后端共用常量**。命名以源码与 schema 为准。前端渲染专用术语见 `frontend/glossary.md`，后端专用见 `backend/glossary.md`。

## 领域术语

| 术语 | 定义 |
|---|---|
| **scene / 场景** | 一份 JSON = 一个可玩世界；主场景 ID `shenzhen-main` |
| **district / 区** | 深圳行政区，9 个；含路网圆盘参数与建筑密度 |
| **landmark / 地标** | 可拍照/到访/收集/投资的建筑；25 个 |
| **quest / 任务** | 8 类条件：visit/photo/walk/ride/districts/money/collect/interact |
| **npc / NPC** | 6 静态 + 16 动态随机（7 职业×15 姓氏） |
| **traffic / 交通** | 34 站 13 线，跨区传送 |
| **buildRecipe / 建造配方** | 9 种，8 格网格吸附 |
| **ascension / 飞升** | newcomer→explorer→builder 阶段 |
| **spawnPoint / 出生点** | 玩家进入世界可选的位置 |
| **teleportPoint / 传送点** | T 键面板，到访解锁，¥10/次 |
| **rollout / 灰度** | playerId 稳定哈希分桶，版本管理 |
| **creation / 作品** | 玩家发布的作品（placements≤500） |
| **semver 严格递增** | 发布版本必须 > 最新已发布版本 |

## 跨端常量与单位

| 符号 | 值 | 含义 | 定义处 |
|---|---|---|---|
| `KM_IN_UNITS` | 200 | 1 公里 = 200 世界单位 | shared/constants |
| `PLAYER_WALK_SPEED` | 4.2 | 步行速度基数（单位/帧秒，引擎侧换算） | shared/constants |
| `farCompress` | 0.35 | 超距（>8km）投影压缩系数 | shared/projection |
| 投影原点 | (22.5431, 114.0579) | 深圳市民中心 | shared/projection |

## 区主题色（shared/constants）

| 区 | 色值 | 名称 |
|---|---|---|
| futian | 0x1fb9a8 | 福田 青碧 |
| luohu | 0xd96f32 | 罗湖 |
| nanshan | 0x3a7bd5 | 南山 |
| yantian | 0x2fa84f | 盐田 |
| baoan | 0xc94f7c | 宝安 |
| longgang | 0x8b5cf6 | 龙岗 |
| longhua | 0xf59e0b | 龙华 |
| pingshan | 0x10b981 | 坪山 |
| dapeng | 0x06b6d4 | 大鹏 |