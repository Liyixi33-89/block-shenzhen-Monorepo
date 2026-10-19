#!/usr/bin/env node
// 分层守护：扫描 apps/web/src 下全部 .ts/.vue 的相对 import，强制洋葱分层依赖规则
// 规则（详见 docs/FRONTEND-ARCHITECTURE.md 第四节）：
//   domain  → 禁止 import engine / services / infra 之外的实现层（允许 schema/shared 类型）
//   services → 禁止 import engine / vue / three / App.vue
//   infra   → 禁止 import 任何业务路径
//   views   → 禁止直接调用 fetch（网络出口必须走 services/api）
// 违规即 exitCode = 1（CI 红灯）。零三方依赖。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');

/** 收集 src 下全部 .ts / .vue 文件 */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|vue)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** 解析文件内的相对 import 说明符 */
function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const specs = [];
  const re = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specs.push({ spec: m[1], line: src.slice(0, m.index).split('\n').length });
  return specs;
}

const layerOf = (relPath) => {
  if (relPath.startsWith('domain/')) return 'domain';
  if (relPath.startsWith('services/')) return 'services';
  if (relPath.startsWith('infra/')) return 'infra';
  if (relPath.startsWith('engine/')) return 'engine';
  return 'views';   // App.vue / main.ts / composables
};

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replaceAll('\\', '/');
  const from = layerOf(rel);
  for (const { spec, line } of importsOf(file)) {
    // 解析相对路径到 src 内目标（粗粒度：只取目录层）
    const parts = rel.split('/');
    const segs = spec.split('/');
    let target = rel;
    if (segs[0] === '.') {
      target = parts.slice(0, -1).concat(segs.slice(1)).join('/');
    } else if (segs[0] === '..') {
      let up = parts.slice(0, -1);
      for (const s of segs) {
        if (s === '..') up = up.slice(0, -1);
        else if (s !== '.') up.push(s);
      }
      target = up.join('/');
    }
    // 归一到目录前缀（取目标路径的前两层足够判定层级）
    const norm = target.replace(/^\.\//, '');
    const tLayer = layerOf(norm.split('/').slice(0, 2).join('/') === norm ? norm : norm);

    // 过渡桥豁免：engine/ 下的桥文件 re-export 内层是迁移期的合法状态
    const isBridge = from === 'engine' && /^engine\/(gameplay|ascension|cloud|analytics)\.ts$/.test(rel);

    if (isBridge) continue;

    // 规则 1：domain 禁止依赖外层
    if (from === 'domain' && ['engine', 'services', 'infra', 'views'].includes(tLayer)) {
      violations.push(`domain → ${tLayer}: ${rel}:${line} imports '${spec}'`);
    }
    // 规则 2：services 禁止依赖 engine / views
    if (from === 'services' && ['engine', 'views'].includes(tLayer)) {
      violations.push(`services → ${tLayer}: ${rel}:${line} imports '${spec}'`);
    }
    // 规则 3：infra 禁止依赖业务层
    if (from === 'infra' && ['engine', 'domain', 'services', 'views'].includes(tLayer)) {
      violations.push(`infra → ${tLayer}: ${rel}:${line} imports '${spec}'`);
    }
  }
}

// 规则 4：views（App.vue / composables）禁止直接 fetch —— 网络出口必须走 services/api
const viewFiles = walk(SRC).filter(f => {
  const rel = relative(SRC, f).replaceAll('\\', '/');
  return layerOf(rel) === 'views' && !rel.endsWith('.d.ts');
});
for (const file of viewFiles) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(SRC, file).replaceAll('\\', '/');
  const re = /\bfetch\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    // 注释行豁免
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineText = src.slice(lineStart, m.index);
    if (lineText.trim().startsWith('//') || lineText.trim().startsWith('*')) continue;
    violations.push(`views 直接 fetch: ${rel}（网络请求须走 services/api）`);
  }
}

if (violations.length) {
  console.error(`✗ 分层违规 ${violations.length} 处：\n` + violations.map(v => '  - ' + v).join('\n'));
  process.exitCode = 1;
} else {
  console.log('✓ 分层守护通过：依赖规则 / fetch 收敛 无违规');
}
