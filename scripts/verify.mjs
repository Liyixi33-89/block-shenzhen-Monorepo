#!/usr/bin/env node
// 三级验证管线（跨平台，Node 20+）：统一入口，CI 与本地同一条代码路径。
//   quick   —— 每次改动后必跑：分层守护 + 防腐扫描 + 前端 tsc + 后端 compile
//   commit  —— 提交前：quick + 前端 build + schema/shared build + 后端 package
//   ci      —— 联调/交付/PR：= commit（由 .github/workflows/verify.yml 触发）
// 每次运行自动追加一行到 .agent/metrics/verify-log.jsonl（本地留痕，不入库）。
// 静默重试纪律：脚本只执行一次；失败重试由调用方遵守「≤2 次」红线。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const level = process.argv[2] || 'quick';
const levels = new Set(['quick', 'commit', 'ci']);
if (!levels.has(level)) {
  console.error(`✗ 未知级别 ${level}，可用：quick | commit | ci`);
  process.exit(2);
}

// Windows 下 mvn/npm 是 .cmd 包装，spawnSync 直接 spawn .cmd 会 EINVAL，须经 cmd /c 执行。
// Linux/macOS 用无后缀命令（CI 也是 Linux）。
const isWin = process.platform === 'win32';
const MVN = isWin ? 'mvn.cmd' : 'mvn';
const NPM = isWin ? 'npm.cmd' : 'npm';

/** 跨平台执行命令；返回 pass 布尔 + 输出字符串。name 用于人读，id(ASCII) 用于度量 JSONL。 */
function run(name, id, cmd, args, opts = {}) {
  const t0 = Date.now();
  // Windows 下 .cmd/.bat 命令用 cmd /c 包装；其余命令保持 shell:false
  const useCmdWrap = isWin && /\.(cmd|bat)$/i.test(cmd);
  const res = spawnSync(useCmdWrap ? 'cmd' : cmd, useCmdWrap ? ['/c', cmd, ...args] : args, {
    cwd: opts.cwd || ROOT,
    shell: false,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: opts.timeout || 600_000, // 默认 10 分钟
  });
  const pass = res.status === 0;
  const ms = Date.now() - t0;
  const tail = (res.stdout || '') + (res.stderr || '');
  const last = tail.trim().split('\n').slice(-8).join('\n');
  console.log(`${pass ? '✓' : '✗'} ${name} (${ms}ms)${pass ? '' : '\n' + last}`);
  return { name, id, pass, ms, output: tail, advisory: !!opts.advisory };
}

/**
 * 建议性步骤（advisory）：记录结果与状态，但不阻断流程。
 * 用于项目**尚未设门禁**的检查（如 tsc 类型检查存量错误较多），
 * 先让结果进入度量可见，待存量清理后再升级为硬门禁。
 */
function runAdvisory(name, id, cmd, args, opts = {}) {
  const r = run(name, id, cmd, args, { ...opts, advisory: true });
  console.log(r.pass
    ? `   （建议性）${name} 通过`
    : `   ⚠ 建议性 ${name} 未通过（记录但不阻断）——${args.join(' ')} 见上方输出`);
  return r;
}

const steps = [];

// ── quick 层：静态守护 + 防腐 + 类型检查 ─────────────────────────
if (level === 'quick' || level === 'commit' || level === 'ci') {
  steps.push(run('分层守护 check-layering', 'check-layering', 'node', ['scripts/check-layering.mjs']));
  steps.push(run('防腐扫描 check-docs', 'check-docs', 'node', ['scripts/check-docs.mjs']));

  // tsc 为建议性（advisory）：项目当前未设类型门禁，存量错误先可见不阻断；
  // 待存量清理后可改 run() 升级为硬门禁。
  if (existsSync(join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js'))) {
    steps.push(runAdvisory('前端类型检查 tsc', 'tsc', 'node', [join('..', '..', 'node_modules', 'typescript', 'lib', 'tsc.js'), '--noEmit', '-p', 'tsconfig.json'], { cwd: join(ROOT, 'apps', 'web') }));
  }

  if (process.env.SKIP_BACKEND !== '1') {
    const pom = join(ROOT, 'apps', 'server-java', 'pom.xml');
    if (existsSync(pom)) {
      steps.push(run('后端编译 compile', 'backend-compile', MVN, ['-q', 'compile', '-f', 'apps/server-java/pom.xml']));
    }
  }
}

// ── commit 层：quick + 全量构建 ─────────────────────────────────
if (level === 'commit' || level === 'ci') {
  // schema/shared 构建（前端 import 的是产物）
  steps.push(run('schema 构建', 'build-schema', NPM, ['run', 'build', '-w', 'packages/schema']));
  steps.push(run('shared 构建', 'build-shared', NPM, ['run', 'build', '-w', 'packages/shared']));
  // 前端 vite build（hoisted：在 apps/web 内用根 vite）
  steps.push(run('前端 vite build', 'build-web', 'node', [join('..', '..', 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: join(ROOT, 'apps', 'web') }));
  // 后端打包
  if (process.env.SKIP_BACKEND !== '1') {
    steps.push(run('后端 package', 'backend-package', MVN, ['-q', 'package', '-DskipTests', '-f', 'apps/server-java/pom.xml']));
  }
}

// ── 汇总 + 度量留痕 ─────────────────────────────────────────────
// 门禁判定只看硬步骤（advisory 记录但不阻断）
const pass = steps.filter(s => !s.advisory).every(s => s.pass);
const elapsedMs = steps.reduce((a, s) => a + s.ms, 0);

const metricsDir = join(ROOT, '.agent', 'metrics');
mkdirSync(metricsDir, { recursive: true });
const record = {
  ts: new Date().toISOString(),
  level,
  pass,
  elapsedMs,
  steps: steps.map(({ id, pass, advisory }) => ({ name: id, pass, advisory: !!advisory })),
};
appendFileSync(join(metricsDir, 'verify-log.jsonl'), JSON.stringify(record) + '\n');

console.log(`\n=== verify ${level} ${pass ? '通过 ✅' : '失败 ❌'}（${steps.length} 步 / ${elapsedMs}ms）===`);
console.log(`度量已写入 .agent/metrics/verify-log.jsonl`);
process.exit(pass ? 0 : 1);