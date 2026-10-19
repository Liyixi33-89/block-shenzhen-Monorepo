# Block Shenzhen Monorepo（完整版）

数据驱动的城市沙盒平台。架构文档见 `../block-guangzhou-src/docs/ARCHITECTURE.md`。

## 结构

```
block-shenzhen/
├── apps/
│   ├── web/          玩家前端 :5174
│   ├── admin/        内容后台 :5175（JSON 编辑→校验→发布）
│   ├── server-java/  后端 API :4001（DDD 四层，Spring Boot 3 + MySQL 8）
│   └── server/       旧 Node 服务（已由 server-java 替代，保留参考）
├── packages/
│   ├── schema/       内容 Schema（zod）：场景/地标/元素/任务/NPC/交通/传送/建造/飞升/存档
│   └── shared/       投影算法与常量（前后端共用）
```

## 快速启动

```bash
npm install          # 根目录一次性安装全部 workspace
mvn spring-boot:run -f apps/server-java/pom.xml   # 后端 :4001（首个注册用户自动 admin）
npm run dev:web      # 前端 :5174
npm run dev:admin    # 后台 :5175
```

生产部署（fat jar）：

```bash
cd apps/server-java
mvn package -DskipTests                      # 生成 target/server-java-0.1.0.jar
# 停旧进程后：
java -jar target/server-java-0.1.0.jar       # 前台；后台建议 Start-Process 重定向日志
```

后端架构详见 `apps/server-java/ARCHITECTURE.md`（DDD 四层：domain/application/infrastructure/interfaces）。

## 数据库

- 应用库 `block_sz`（MySQL 8），用户 `block_sz/block_sz`；连接配置见 `apps/server-java/src/main/resources/application.properties`
- 内容场景存 `scenes` 表（draft/published 两版），发布采用 semver 严格递增

## 创建管理员并发布首个场景

```bash
# 1. 注册（第一个用户自动成为 admin）
curl -X POST http://127.0.0.1:4001/api/auth/register -H "content-type: application/json" ^
  -d '{"username":"admin","password":"admin123"}'

# 2. 用 admin 后台（:5175）粘贴场景 JSON → 保存草稿 → 发布
#    场景 JSON 参考 packages/schema/test/scene.test.mts 中的 validScene
```

## 数据迁移（旧 Node → 新 Java 服务）

```bash
cd apps/server-java
mvn -q package -DskipTests
java "-Dloader.main=com.blocksz.server.tools.DataMigrator" -cp target/server-java-0.1.0.jar ^
  org.springframework.boot.loader.launch.PropertiesLauncher ^
  ../server/data/block-sz.sqlite data/block-sz-java.sqlite
```

迁移覆盖 users/saves/scenes/events/rollout/creations 全部六表；旧 scrypt 密码在首次登录时自动升级为 pbkdf2。

## API 摘要

| Method | Path | 说明 |
|---|---|---|
| POST | /api/auth/register | 注册（首个用户 admin） |
| POST | /api/auth/login | 登录 → JWT |
| GET | /api/content/scenes/:id | 拉取已发布场景 |
| PUT | /api/content/admin/scenes/:id | 保存草稿（Schema 校验） |
| POST | /api/content/admin/scenes/:id/publish | 发布（semver 递增） |
| GET/PUT/DELETE | /api/save | 云存档（需登录） |
| GET | /api/health | 健康检查 |

## 玩法总览（场景数据 0.3.7）

- **核心循环**：拍照赚钱（C 键取景 + 空格快门）、任务系统（photo/visit/photoSet/collect/walk 条件）、飞升阶段（newcomer→explorer→builder）
- **交通**：E 键乘车，按地理最短路站序，跨区传送（34 站 13 线）
- **建造**：B 键开关，8 格网格吸附，R 旋转，Z 撤销，placements 入云存档
- **传送**：T 键面板，到访地标解锁，¥10/次，20 秒冷却
- **商店**：S 键，12 商品（消耗/建材/相机皮肤/装饰）+ 20 纪念品；地标投资 ¥800×等级，¥300/时/级被动收入
- **NPC**：6 静态 + 16 动态随机（7 职业×15 姓氏，天气/夜晚对白动态切换）；店铺 NPC 可购买广府小吃
- **日夜循环 / 天气系统**：虚拟时钟驱动光照、天空色带、雾；雨雪粒子；HUD 时钟 + 天气角标
- **美食 / 文化图鉴**：9 种广府美食入背包，9 文化地标打卡收集
- **纪念品收藏**：20 种（O 键图鉴），10 种到访赠送 + 10 种商店购买
- **观景台登顶**：6 高层地标 E 键登顶，相机飞升俯瞰，可拍夜景
- **社交**：G 键广场，导入 ¥200，placements 校验 ≤500；UTF-8 无损
- **云存档**：游客 JWT + localStorage，30 秒定时 + 退出即时上传，重进自动回档
- **灰度**：playerId 稳定哈希分桶，HUD「体验版」角标；版本管理支持滑杆/回滚/diff

## 路线图状态

- [x] P0 golden master（../block-guangzhou-src/tests/golden/）
- [x] P1 monorepo 骨架 + schema + 后端最小闭环
- [x] P2 游戏数据外置为 JSON
- [x] P3 引擎换 npm three + 模块化拆分
- [x] P4 后台 UI 化编辑器
- [x] P5 建造 / 传送 / 飞升 / 多人
- [x] 第五批玩法：动态随机 NPC / 店铺售卖 / 纪念品收藏 / 观景台登顶 / 日夜循环 / 天气 / 自拍 / 美食 / 文化图鉴
