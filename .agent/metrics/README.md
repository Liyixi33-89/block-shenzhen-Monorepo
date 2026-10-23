# 度量（Metrics）

> 验证管线的**留痕数据**。每次 `node scripts/verify.mjs <level>` 自动追加一行 JSON 到 `verify-log.jsonl`。

- 文件：`.agent/metrics/verify-log.jsonl`（每行一个 JSON 对象）
- 字段：`ts`（ISO 时间）、`level`（quick/commit/ci）、`pass`（bool）、`elapsedMs`、`steps`（{name, pass}）、`note`
- **不入库**：本目录内容不提交 git（见 `.gitignore` 约定），仅本地审计用。
- 数据仅用于本地返工率/通过率统计，不含任何敏感信息。

> 若日志累积过大，可本地清理（不影响代码）。