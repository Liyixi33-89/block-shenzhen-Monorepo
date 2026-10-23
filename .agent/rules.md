# 编码规约与守护（Rules）

## 工作流

对任何非平凡改动遵循：**outline → 精准读 → replace_in_file → lint → 构建/测试**。
- 新文件打开先 `outline` 摸清符号与行号，再 `read_file` 定位目标区段，避免整文件盲读。
- 用 `replace_in_file` 做精准替换（`old_str` 必须与文件完全一致，含空白/缩进/行尾）。
- 改完 `read_lints`（scope 到改动文件），再跑构建/测试。
- 多文件重构（改名/改签名）先用 `search_content` 找全所有调用点，一次改完，不留半截。

## 分层守护（机器执行，必跑）

`node scripts/check-layering.mjs` 扫描 `apps/web/src` 全部 `.ts/.vue`，规则：
```
禁止：domain → (engine | views | services | infra 的违规依赖)
禁止：services → (engine | views)
禁止：infra → 任何业务路径
禁止：views (App.vue/composables) 直接调用 fetch(
允许：engine → 任意内层；engine/gameplay|ascension|cloud|analytics.ts 桥文件豁免
```
违规即 exit 1。**任何 apps/web 改动后必须跑。**

## Do（应当）

- 最小改动：只改任务要求的，保留既有风格/命名/缩进。
- 新增代码补齐全部 import，确保能立即运行。
- 复用共享几何/材质：`markSharedGeo`/`markSharedMat` 登记的几何材质跨世界复用，dispose 时跳过。
- 静态几何合并：新增大量静态 mesh 时用 `mergeStaticGroup` 降 draw call。
- 用 `proj(lat,lng)` 拿世界坐标；坐标缓存（避免每帧 proj）。
- 内容改动（JSON）后过 schema 校验；发布遵循 semver。

## Don't（禁止）

- 不装新依赖，不改 `.gitignore`/`package.json`/`tsconfig.json`/lock 文件（除非明确要求）。
- 不跑破坏性命令（`rm -rf`/`git reset --hard`/`git push --force`）除非明确要求。
- 不重构/重命名/调整超出任务范围的代码。
- 不提交密钥/凭据/真实 token。
- 不把 fetch 直接写进 views（走 `services/api.ts`）。
- 不在 domain 层 import three/Vue/DOM API/fetch。
- 不改旧 `apps/server`（已废弃）。

## 性能铁律（渲染/每帧）

- 每帧 `update` 内避免 `new` 对象（Vector3/Color/Matrix4）——用模块级复用变量。
- 大量实例用 InstancedMesh；分散全城且数量少的实例可 `frustumCulled=false`。
- 远距装饰/名牌用 LOD（`detailSwitch`）隐藏。
- 每帧计算的投影坐标提前缓存。

## 内存/泄漏注意

- 动态创建的 geometry/material/texture（含 CanvasTexture）在 dispose 时释放。
- `engine.dispose()` 需释放世界独占资源 + 调用 player/面板的 dispose，并移除 window 事件监听。
- 重建世界前调用 `collision.clear()` 防碰撞盒累积。
- InstancedMesh 的自身 rotation 会被实例矩阵覆盖——复合变换必须写进四元数。

## 信任校准（AI 自主性边界）

按改动类型决定 AI 的自主程度与人的介入深度——不是所有改动都该全自动，也不是所有都要人逐行审：

| 信任区 | 典型改动 | 处理方式 |
|---|---|---|
| 高信任 | 样板代码、类型定义、单测生成、格式转换、机械重构 | 直接生成 + 编译/管线验证兜底 |
| 中信任 | 业务逻辑、跨文件重构、配置调整 | 生成后逐行 review + 测试/构建覆盖 |
| 低信任 | 安全相关（鉴权/加密/权限）、数据迁移、破坏性操作、依赖变更 | 人写为主，AI 只做参谋/方案对比 |

**执行纪律**：
- 高信任区直接做，但必须过验证管线（AI 代码与人写代码同等过 CI，无豁免）。
- 中信任区交付时说明「改动面 + 验证依据」，不静默吞失败。
- 低信任区先出 2–3 个方案 + trade-off，由人决定，AI 不擅自动手。

## 验证标准

- 前端改动：`vite build` 成功 + `check-layering` 通过。
- 后端改动：`mvn -q package -DskipTests` 成功。
- 测试失败必须修复，不能只上报。