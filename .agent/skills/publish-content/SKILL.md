---
name: publish-content
description: "发布内容到后端。当用户要发布场景/内容、保存草稿、发布新版本、让游戏内改动生效时触发。步骤：schema 校验 → 登录 → 保存草稿 → 发布（semver 递增）→ 验证。"
---

# 发布内容到后端

## 目标
把场景 JSON 安全地发布到后端，让 web 前端能拉到新版本。

## 前置条件
- 后端 :4001 已启动
- 场景 JSON 内容已就绪（本地文件或已在 admin 编辑）
- 需要 admin 账号 token（首个注册用户自动 admin）

## 步骤

1. **定位场景文件**
   - 主场景：`apps/web/public/content/shenzhen-main.json`
   - 参考样例：`packages/schema/test/scene.test.mts` 的 `validScene`

2. **校验 Schema（发布前必做）**
   ```bash
   # 用 validateScene 跑一遍；或确认 admin 保存草稿时后端校验通过
   ```
   校验失败则先修字段（见 `.agent/knowledge/shared/data-model.md`）。

3. **登录拿 token**
   ```bash
   curl -X POST http://127.0.0.1:4001/api/auth/login -H "content-type: application/json" ^
     -d '{"username":"admin","password":"<密码>"}'
   # 取返回的 token
   ```

4. **确认/抬升版本号**
   - 先查当前已发布版本：`curl http://127.0.0.1:4001/api/content/scenes/shenzhen-main` 看 `version`。
   - 把 JSON 的 `version` 改为**严格大于**当前版本的 semver（如 0.3.8 → 0.3.9）。
   - 不递增会发布失败。

5. **保存草稿**
   ```bash
   curl -X PUT http://127.0.0.1:4001/api/content/admin/scenes/shenzhen-main ^
     -H "content-type: application/json" -H "authorization: Bearer <token>" -d @scene.json
   ```

6. **发布**
   ```bash
   curl -X POST http://127.0.0.1:4001/api/content/admin/scenes/shenzhen-main/publish ^
     -H "authorization: Bearer <token>"
   ```

## 验证

```bash
curl http://127.0.0.1:4001/api/content/scenes/shenzhen-main   # 确认 version 为新版本
```
进游戏确认改动生效；若未生效按 `.agent/knowledge/frontend/faq.md` 排查（缓存/读的本地还是后端）。

## 参考
- `.agent/knowledge/shared/data-model.md`（字段语义）
- `.agent/knowledge/frontend/faq.md`（发布相关疑问）
- `.agent/knowledge/backend/faq.md`（发布版本递增）
- `.agent/commands.md`（API 调用）