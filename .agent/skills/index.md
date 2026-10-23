# Skill 体系（Skills）

> Block Shenzhen 的**可复用工作流**。每个 skill 是一个目录，含 `SKILL.md`（遵循 Box 格式：YAML frontmatter `name`/`description`），可选 `scripts/`/`references/`。AI 接对应任务时调用。

## 触发原则

- **description 触发**：当用户请求匹配某 skill 的 description 时，读取对应 `SKILL.md` 并按步骤执行。
- **按需读取**：只读被触发的那一个 skill，不读全部。

## 技能索引

| Skill | 触发词 | 作用 |
|---|---|---|
| `publish-content` | 发布内容/发布场景/发布新版本/保存草稿 | 把场景 JSON 校验→保存草稿→发布到后端 |
| `add-landmark` | 加地标/新地标/加一个 landmark | 往场景加地标（JSON + builder + 验证） |
| `add-quest` | 加任务/新任务/每日任务 | 往场景加任务（条件/奖励/cycle） |
| `add-district` | 加区/新行政区/加一个 district | 加区并接入路网/区际快速路 |
| `review-code` | 审查/代码评审/review | 按本项目标准做一次代码审查 |
| `debug-engine` | 排查引擎/玩法不生效/渲染问题 | 按排查顺序定位引擎问题 |

## SKILL.md 格式约定

每个 skill 的 `SKILL.md` 统一结构：

```markdown
---
name: <skill-name>
description: "触发描述（何时用此技能）"
---

# <标题>

## 目标
要完成什么

## 前置条件
需要的环境/状态/凭据

## 步骤
1. ... 每步给具体命令/文件/校验点

## 验证
完成标准（构建/测试/断言）

## 参考
相关 .agent 分册/知识库条目
```

## 新增 skill 规则

1. 在 `.agent/skills/` 下建目录，写 `SKILL.md`（含 frontmatter）。
2. 步骤要**可机器执行**：给具体文件、命令、校验点。
3. 涉及数据模型/坑的引用 `.agent/knowledge/` 与 `.agent/pitfalls.md`，不重复内容。
4. 在本 `index.md` 索引表追加一行。