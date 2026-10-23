# 数据模型（Data Model）

> 内容 JSON（一份场景 = 一个可玩世界）的**完整字段语义**。权威来源：`packages/schema/src/*.ts`（前端/后台/后端共用）。主场景 `shenzhen-main`。

## 顶层 Scene 结构

```jsonc
{
  "id": "shenzhen-main",          // ^[a-z][a-z0-9_-]*$
  "name": "方块鹏城",
  "desc": "",
  "version": "0.3.8",             // semver，发布后不可变，须严格递增
  "projection": {
    "origin": { "lat": 22.5431, "lng": 114.0579 },  // 深圳市民中心
    "unitPerKm": 200,             // 1km = 200 世界单位
    "farCompress": 0.35           // 超距(>8km)投影压缩
  },
  "districts": [...],             // 9 区
  "landmarks": [...],             // 25 地标
  "quests": [...],                // 18 任务
  "npcs": [...],                  // 静态 NPC
  "traffic": { "stations": [...], "routes": [...] },  // 34站 13线
  "spawnPoints": [...],           // 出生点(≥1)
  "teleportPoints": [...],        // 传送点
  "buildRecipes": [...],          // 建造配方
  "ascension": { "stages": [...] },
  "shopItems": [...],             // 商店商品
  "invest": { ... },              // 地标投资
  "config": { "env": { "npc": {...} } }  // 运行时环境
}
```

## district（区）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | ^[a-z][a-z0-9_-]*$ |
| `name` | string | 中文名，如「福田区」 |
| `slogan` | string? | 区口号 |
| `color` | number | 区主题色 0xRRGGBB |
| `center` | {lat,lng} | 区中心（地标聚合参考点） |
| `cityRadius` | number | 街区生成半径（世界单位）；0=不生成 |
| `density` | cbd/urban/suburb/none | 建筑密度权重 |
| `sortOrder` | number | 排序 |

## landmark（地标）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一小写 |
| `name` | string | 如「平安金融中心」 |
| `district` | string | 所属区 ID |
| `latlng` | {lat,lng} | 经纬度→投影世界坐标 |
| `interactRadius` | number | 交互提示半径（默认 30） |
| `desc`/`descDetail` | string | 图鉴/介绍文案 |
| `builder` | string? | 内置 builder ID（引擎程序化建模） |
| `geometry` | array | procedural 几何列表（builder 为空时用） |
| `interacts` | array | 交互点（view/enter/ride/shop/quest） |
| `crowds` | array | NPC 人群分布（x,z,rx,rz,count≤200） |
| `photoable` | bool | 是否可拍照进图鉴（默认 true） |
| `tags` | array | 标签 |
| `souvenir` | string? | 到访赠送纪念品 id |
| `deck` | bool? | 是否可登顶观景台 |
| `enabled` | bool | 默认 true |

## quest（任务）

`cond` 是判别联合，按 `type` 分：
| type | 字段 | 含义 |
|---|---|---|
| `visit` | target | 到访地标 |
| `photo` | target | 拍摄地标 |
| `walk` | meters | 步行距离 |
| `ride` | vehicle(bus/metro/boat/cable) | 乘车 |
| `districts` | n | 探索 n 个区 |
| `money` | amount | 持有金钱 |
| `collect` | item, n | 收集物品 |
| `interact` | target | 完成指定交互 |

其他字段：`id`/`title`/`desc`/`requires[]`(前置任务)/`reward{money,items[],ascension}`/`cycle(once|daily)`/`enabled`。

## npc（静态 NPC）

`id`/`name`/`landmark`(挂靠) 或 `latlng`(二选一必填)/`dialogue[]`(对话树：id,text,next,choices[])/`shopItems[]`(店铺售卖)/`shopGreet`/`enabled`。

**动态随机 NPC** 不在 JSON 逐个定义，由 `config.env.npc` 控制：
- `dynamicCount`：数量（0 关闭，主场景 16）
- `surnames[]`：姓氏池（默认内置 15 广府姓氏）
- `jobs[]`：职业池 `{honorific, body, hat, weight, lines[], rain[], night[], tip, stall[]}`
- `range`：游走范围 {xMin,xMax,zMin,zMax}

## traffic（交通）

- `stations[]`：`id`/`name`/`latlng`/`transfers[]`(换乘线路)
- `routes[]`：`id`/`name`/`kind(metro|bus|boat|cable|elevator)`/`color`/`stations[]`(按序，≥2)/`interval`/`fare`/`enabled`

## spawnPoint / teleportPoint

- 出生点：`id`/`name`/`district`/`blurb`/`latlng`/`facing`
- 传送点：`id`/`name`/`latlng`/`unlock(free|visited{landmark}|quest{quest})`/`cooldownSec`/`cost`/`enabled`

## buildRecipe（建造配方）

`id`/`name`/`element`(产出元素)/`cost{money, items[{id,n}]}`/`requires[]`(解锁条件)/`enabled`。

## ascension（飞升）

`stages[]`：`id`/`name`/`desc`/`points`(所需飞升点)/`unlocks[](build|teleport|fly)`/`requires[]`。阶段树：newcomer→explorer→builder。

## shopItem（商店商品）

`id`/`name`/`kind(consumable|deco|material|camera|food|souvenir)`/`desc`/`price`/`effect(speed|photo_bonus|fare_free)`/`durationSec`/`grants[]`(材料礼包)/`skin`(相机皮肤)/`foodTag`/`icon`/`enabled`。

## invest（地标投资，场景级默认）

`baseCost`(每级投资额，默认 800)/`incomePerHour`(每小时被动收益，默认 300)/`maxLevel`(最大等级，默认 10)。

## env.config（运行时环境）

`config.env.npc` 见上（NPC 动态配置）。全部可选：缺省 = 引擎内置常量，旧场景零破坏。

## 校验与版本

- 唯一校验入口：`packages/schema/src/scene.ts` 的 `validateScene(data)`。
- 后台发布前、客户端加载前都校验。
- 版本 semver 严格递增：草稿版本必须 > 最新已发布版本。
- 主场景数据源：`apps/web/public/content/shenzhen-main.json`（本地兜底）；线上以 `/api/content/scenes/shenzhen-main` 为准。