# 命令速查（Commands）

> 本仓库依赖 **hoisted 到根 `node_modules/`**。vite/tsc 等 CLI 需用根路径的 vite，或在 `apps/*` 目录内运行。构建前先 `cd` 到对应 app 目录，否则 vite 找不到入口 `index.html`。

## 依赖安装

```bash
npm install          # 根目录一次性安装全部 workspace
```

## 启动三个服务

| 服务 | 端口 | 命令 |
|---|---|---|
| 后端 | 4001 | `mvn spring-boot:run -f apps/server-java/pom.xml` |
| 前端 web | 5174 | `npm run dev:web` |
| 后台 admin | 5175 | `npm run dev:admin` |

> dev 服务器用 `background:true` 启动；日志重定向到文件以便追踪。

## 构建

```bash
# 单 app 构建（必须先 cd 进 app 目录）
cd apps/web && node ../../node_modules/vite/bin/vite.js build
cd apps/admin && node ../../node_modules/vite/bin/vite.js build

# 共享包构建（改 packages 后）
npm run build -w packages/schema
npm run build -w packages/shared

# 后端构建
mvn -q package -DskipTests -f apps/server-java/pom.xml   # 产出 target/server-java-0.1.0.jar

# 全量构建
npm run build
```

## 验证（改完必跑）

```bash
# 前端分层守护（exit 1 = 违规）
node scripts/check-layering.mjs

# 前端类型检查（apps/web 范围内）
cd apps/web && npx tsc --noEmit

# 全量测试
npm run test
```

## 后端生产部署

```bash
cd apps/server-java
mvn package -DskipTests                    # 生成 target/server-java-0.1.0.jar
java -jar target/server-java-0.1.0.jar      # 前台；后台建议 Start-Process 重定向日志
```

## 数据迁移（旧 Node → Java）

```bash
cd apps/server-java
mvn -q package -DskipTests
java "-Dloader.main=com.blocksz.server.tools.DataMigrator" -cp target/server-java-0.1.0.jar org.springframework.boot.loader.launch.PropertiesLauncher ../server/data/block-sz.sqlite data/block-sz-java.sqlite
```

## API 常用调用

```bash
# 注册（首个用户自动 admin）
curl -X POST http://127.0.0.1:4001/api/auth/register -H "content-type: application/json" ^
  -d '{"username":"admin","password":"admin123"}'

# 健康检查
curl http://127.0.0.1:4001/api/health

# 拉取已发布场景
curl http://127.0.0.1:4001/api/content/scenes/shenzhen-main
```

## 数据库

- 应用库 `block_sz`（MySQL 8），用户 `block_sz/block_sz`
- 连接配置：`apps/server-java/src/main/resources/application.properties`
- 后端实际用 SQLite：`apps/server-java/data/block-sz-java.sqlite`（Hibernate 通用方言）
- 表：users / saves / scenes / events / rollout / creations

## 环境变量 / 密钥

- 不硬编码密钥；需要时从环境变量读取（`Get-ChildItem Env:` 查看可用变量）。
- JWT 密钥、密码盐等见后端配置，勿提交真实值。