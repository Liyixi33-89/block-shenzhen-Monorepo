---
name: review-code
description: "按本项目标准做一次代码审查。当用户要审查/评审/检查代码、review、复查改动时触发。步骤：看改动范围 → 按分层/性能/泄漏/架构标准逐项核查 → 报告。"
---

# 代码审查（Code Review）

## 目标
按 Block Shenzhen 的质量标准审查一处改动，输出可执行的问题清单。

## 前置条件
- 明确待审范围（diff、文件、或 PR）

## 步骤

1. **定位改动范围**
   - `git diff` 或指定文件。
   - 先 `outline` 受影响文件，理解改动上下文。

2. **按标准逐项核查**

   **① 通用审查清单（所有改动必过，对照 AGENTS.md）**
   - [ ] 编译/类型检查过了吗（AI 代码不能豁免 CI）
   - [ ] 错误路径处理了吗（网络失败/空数据/权限不足）
   - [ ] 有硬编码的魔法值/密钥/路径吗
   - [ ] 遵守项目硬约束吗（分层/最小改动/不装依赖/不提交密钥）
   - [ ] 有过度设计吗（AI 爱加没用的抽象层和防御代码）
   - [ ] 改动面最小吗（顺手重构是大忌，难 review）

   **② 分层（前端）**
   - 改 `apps/web` 时检查：domain 是否 import 了 three/Vue/fetch；services 是否 import engine；views 是否直接 fetch；engine 是否被内层 import。
   - 跑 `node scripts/check-layering.mjs`。

   **③ 后端 DDD**
   - 改 `apps/server-java` 时：domain 层是否有 Spring/JPA/Jackson 依赖；依赖是否单向。

   **④ 性能（每帧/渲染）**
   - `update` 内是否 `new` 对象（Vector3/Color/Matrix4）→ 应复用模块级变量。
   - 大量实例是否用 InstancedMesh；静态 mesh 是否用 mergeStaticGroup。
   - 远距装饰/名牌是否 LOD。

   **⑤ 资源/内存**
   - 动态 geometry/material/texture（含 CanvasTexture）dispose 是否释放。
   - engine/player dispose 是否完整；window 事件监听是否移除。
   - 重建世界前是否 `collision.clear()`。
   - InstancedMesh 复合变换是否写进四元数。

   **⑥ 内容/schema**
   - 内容改动是否过 `validateScene`；发布版本是否 semver 递增。
   - 新增存档字段是否两处映射都改（saveCodec）。

   **⑦ 最小改动**
   - 是否只改任务要求；是否重构/重命名超出范围；是否装新依赖/改配置文件。

   **⑧ 信任校准**（按 §rules.md 分级）
   - 低信任区（安全/数据迁移/破坏性）改动：标注「人写为主」，只给方案，不擅自实现。

3. **运行验证命令**
   ```bash
   node scripts/check-layering.mjs
   cd apps/web && node ../../node_modules/vite/bin/vite.js build
   ```
   后端：`mvn -q package -DskipTests -f apps/server-java/pom.xml`

4. **输出报告**
   - 按「严重性（高/中/低）+ 位置 + 问题 + 建议」列出。
   - 区分「本次改动引入」vs「存量问题」。

## 验证
- 无新增分层违规；构建通过；性能/泄漏项无高危。

## 参考
- `.agent/rules.md`（全部规约，含信任校准分级）
- `.agent/pitfalls.md`（已知坑，重点核对）
- `.agent/architecture.md`（分层/DDD）