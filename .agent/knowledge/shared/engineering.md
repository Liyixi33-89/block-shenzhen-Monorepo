# 工程验证脚本（Engineering · scripts/）

> 跨端工程基建：`scripts/` 下的验证/守护脚本，是项目的**机器门禁**。改任何端代码前先弄清这些脚本会守什么、怎么跑。三铁律见根 `AGENTS.md`。

## 脚本总览

| 脚本 | 职责 | 触发 | 门禁语义 |
|---|---|---|---|
| `verify.mjs` | 三级验证管线（quick/commit/ci）统一入口 | 手动 + CI | 硬步骤全绿才算过；advisory 只记录不阻断 |
| `check-docs.mjs` | 防腐完整性扫描（防 .agent 体系腐烂） | verify 内嵌 + 手动 | 违规即 exit 1 |
| `check-layering.mjs` | 前端洋葱分层守护（依赖规则 + fetch 收敛） | verify 内嵌 + 手动 | 违规即 exit 1 |

## verify.mjs — 三级验证管线

统一入口，**CI 与本地同一条代码路径**（跨平台 Node 20+，零三方依赖）。用法：

```bash
node scripts/verify.mjs quick    # 每次改动后必跑：分层 + 防腐 + 前端 tsc + 后端 compile
node scripts/verify.mjs commit   # 提交前：quick + 前端/schema/shared build + 后端 package
node scripts/verify.mjs ci       # = commit（由 .github/workflows/verify.yml 触发）
```

**每层包含的步骤**：
- **quick**：`check-layering` + `check-docs` + 前端 `tsc --noEmit`（**advisory**）+ 后端 `mvn compile`。
- **commit/ci**：quick 全部 + `packages/schema` 构建 + `packages/shared` 构建 + 前端 `vite build` + 后端 `mvn package`。

**关键机制**：
- **advisory（建议性）**：当前 `tsc` 是建议性步骤——**记录结果但不阻断**。因为项目有存量 TS5097 错误（schema/shared 包 `.ts` 后缀导入），先把结果可见化，待存量清理后再升级为硬门禁。
- **门禁判定**：只看非 advisory 的硬步骤，全部通过才算 `pass`。
- **跨平台**：Windows 下 `mvn`/`npm` 是 `.cmd` 包装，`spawnSync` 直接 spawn 会 EINVAL，须经 `cmd /c` 执行（脚本已处理）。Linux/macOS 用无后缀命令。
- **静默重试纪律**：脚本本身只执行一次；失败重试由调用方遵守「≤2 次」红线（见 rules.md）。
- **度量留痕**：每次运行自动追加一行 JSON 到 `.agent/metrics/verify-log.jsonl`（不入库）。

**跳过后端**：设 `SKIP_BACKEND=1` 环境变量可跳过所有 mvn 步骤（纯前端任务提速）。

## check-docs.mjs — 防腐完整性扫描

动态扫描 `.agent` 体系，防文档/检查器自身腐烂。**完整性检查全部动态扫描**（不硬编码列表），新增 skill 若漏登 index 会报错。违规即 exit 1。检查项：

1. **根分册完整性**：`.agent/` 下 6 个分册（README/architecture/commands/rules/tasks/pitfalls）必须存在。
2. **knowledge 三端子目录**：`shared`/`frontend`/`backend` 每个都必须存在且含 `README.md`。
3. **skills 动态完整性**：`skills/` 每个目录须含带 frontmatter 的 `SKILL.md`；且必须登记进 `skills/index.md` 索引（反向查僵尸索引）。
4. **AGENTS.md 引用存在性**：AGENTS.md 中 `` `\.agent/...` `` 引用的路径必须存在（豁免 `.jsonl`/`.log` 运行时产物）。
5. **文档防腐**：分册文档中禁止出现会过期的具体行数表述（如「630 行」）。

## check-layering.mjs — 前端分层守护

扫描 `apps/web/src` 全部 `.ts/.vue` 的相对 import，强制洋葱分层依赖规则（详见 `docs/FRONTEND-ARCHITECTURE.md` 第四节）：

| 规则 | 内容 |
|---|---|
| domain | 禁止 import engine/services/infra/views（允许 schema/shared 类型） |
| services | 禁止 import engine/views（允许 domain/infra/schema） |
| infra | 禁止 import 任何业务层 |
| views | 禁止直接调用 `fetch(`（网络出口必须走 `services/api`） |

**过渡桥豁免**：`engine/gameplay.ts`/`ascension.ts`/`cloud.ts`/`analytics.ts` 是 re-export 桥（迁移期兼容旧 import 路径），豁免检查。

**触发时机**：任何涉及 `apps/web` import 结构的改动后必须跑。

## 使用纪律

- 改前端 import 结构 → 跑 `check-layering`。
- 新增/改 `.agent` 文档或 skill → 跑 `check-docs`（新增 skill 记得登记 index）。
- 任何改动提交前 → 跑 `verify.mjs commit`（或 `quick`）。
- 失败重试 ≤2 次，仍失败则报告原因，不静默吞错。