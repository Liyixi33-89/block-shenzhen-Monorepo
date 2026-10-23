# 后端 FAQ（Backend）

> 后端高频疑问速答。前端疑问见 `frontend/faq.md`。

## 存储与启动

**后端用 MySQL 还是 SQLite？**
配置写的是 MySQL `block_sz`，但实际运行用 SQLite（`data/block-sz-java.sqlite`，Hibernate 通用方言）。两套都要保持 schema 一致。

**怎么启动后端？**
`mvn spring-boot:run -f apps/server-java/pom.xml`；打包后 `java -jar server-java-0.1.0.jar`。端口 :4001。

## 账号与权限

**首个用户怎么成为 admin？**
注册的第一个用户自动 admin。之后用 admin 后台提权邀请码机制。

**admin 账号？**
本地 `admin / aszx123@`（邀请码机制注册，已提权 admin）。线上密码 `MdViewer-2026!secure`。

## 内容发布

**发布失败提示「版本必须大于最新」？**
后端 semver 严格递增。把场景 JSON 的 `version` 抬到高于线上最新已发布版本。

**发布用哪个接口？**
admin 保存草稿→发布，或调发布 API。登录取 `mdv_token` cookie。

## 校验

**场景校验严格吗？**
宽松 Jackson（`JacksonSchemaValidator`）对齐 zod：新增字段不影响旧数据；旧场景缺省字段走引擎内置常量（零破坏）。

---
后端端口/端点细节见 `architecture.md` 与 `modules.md`。