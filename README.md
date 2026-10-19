# Block Shenzhen Monorepo（P1 骨架）

数据驱动的城市沙盒平台。架构文档见 `../block-guangzhou-src/docs/ARCHITECTURE.md`。

## 结构

```
block-shenzhen/
├── apps/
│   ├── web/          玩家前端 :5174
│   ├── admin/        内容后台 :5175（JSON 编辑→校验→发布）
│   ├── server-java/  后端 API :4001（DDD 四层，Spring Boot 3 + SQLite）
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

后端架构详见 `apps/server-java/ARCHITECTURE.md`（DDD 四层：domain/application/infrastructure/interfaces）。

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

## 路线图状态

- [x] P0 golden master（../block-guangzhou-src/tests/golden/）
- [x] P1 monorepo 骨架 + schema + 后端最小闭环
- [ ] P2 游戏数据外置为 JSON
- [ ] P3 引擎换 npm three + 模块化拆分
- [ ] P4 后台 UI 化编辑器
- [ ] P5 建造 / 传送 / 飞升 / 多人
