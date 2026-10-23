#!/usr/bin/env node
// 防腐完整性扫描（docs anti-rot）：动态扫描 .agent 体系，防止文档/检查器自身腐烂。
// 关键点：**完整性检查全部动态扫描**（不硬编码 skill 列表），新增 skill 若漏登 index 会报错。
// 零三方依赖。违规即 exitCode = 1。
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT = join(ROOT, '.agent');
const violations = [];

/** 相对打印路径 */
const rel = (p) => p.replace(ROOT + '/', '');

/** 检查某路径存在 */
function mustExist(p, why) {
  if (!existsSync(p)) violations.push(`[缺失] ${rel(p)}（${why}）`);
}

// ── 1. 根分册完整性 ──────────────────────────────────────────────
for (const f of ['README.md', 'architecture.md', 'commands.md', 'rules.md', 'tasks.md', 'pitfalls.md']) {
  mustExist(join(AGENT, f), `.agent/${f} 分册缺失`);
}

// ── 2. knowledge 三端子目录 + README ──────────────────────────────
for (const sub of ['shared', 'frontend', 'backend']) {
  const dir = join(AGENT, 'knowledge', sub);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    violations.push(`[缺失] .agent/knowledge/${sub}/ 目录`);
    continue;
  }
  mustExist(join(dir, 'README.md'), `${sub} 知识索引缺失`);
}

// ── 3. skills 动态完整性：每个目录必须含带 frontmatter 的 SKILL.md ─
const skillsDir = join(AGENT, 'skills');
const skillDirs = readdirSync(skillsDir).filter(n => statSync(join(skillsDir, n)).isDirectory());
if (!skillDirs.length) violations.push('[异常] skills/ 下无 skill 目录');

// 收集所有已登记 skill 名（从 index.md 索引表动态提取）
const indexRaw = existsSync(join(skillsDir, 'index.md')) ? readFileSync(join(skillsDir, 'index.md'), 'utf8') : '';
const indexed = new Set();
for (const m of indexRaw.matchAll(/\|\s*`([a-z0-9-]+)`\s*\|/g)) indexed.add(m[1]);

for (const name of skillDirs) {
  const skillFile = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(skillFile)) {
    violations.push(`[缺失] skills/${name}/SKILL.md`);
    continue;
  }
  const raw = readFileSync(skillFile, 'utf8');
  // frontmatter 校验：开头 ---，含 name 与 description
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    violations.push(`[格式] skills/${name}/SKILL.md 缺 YAML frontmatter`);
  } else if (!/^name:\s*\S+/m.test(fm[1]) || !/^description:/m.test(fm[1])) {
    violations.push(`[格式] skills/${name}/SKILL.md frontmatter 缺 name 或 description`);
  }
  // 索引登记校验（动态）
  if (!indexed.has(name)) {
    violations.push(`[防腐] skills/${name} 未登记进 skills/index.md 索引（新增 skill 必须补索引行）`);
  }
}

// 反向：index 里登记的 skill 目录必须存在
for (const idxName of indexed) {
  if (!skillDirs.includes(idxName)) {
    violations.push(`[防腐] skills/index.md 登记了 ${idxName}，但目录不存在（僵尸索引）`);
  }
}

// ── 4. AGENTS.md 引用的 .agent 路径存在性 ─────────────────────────
// 豁免运行时产物（.jsonl 度量日志等），它们是动态生成而非静态文档。
const agentsRaw = existsSync(join(ROOT, 'AGENTS.md')) ? readFileSync(join(ROOT, 'AGENTS.md'), 'utf8') : '';
for (const m of agentsRaw.matchAll(/`\.agent\/([a-zA-Z0-9_/.-]+)`/g)) {
  if (/\.(jsonl|log)$/.test(m[1])) continue; // 运行时产物，跳过存在性检查
  const p = join(AGENT, m[1]);
  if (!existsSync(p)) violations.push(`[引用] AGENTS.md 引用了不存在的 .agent/${m[1]}`);
}

// ── 5. 文档防腐：.agent 文档中禁止出现会过期的具体行数 ─────────────
for (const f of ['architecture.md', 'commands.md', 'rules.md', 'tasks.md', 'pitfalls.md', 'README.md']) {
  const p = join(AGENT, f);
  if (!existsSync(p)) continue;
  const raw = readFileSync(p, 'utf8');
  // 禁止「xx 行」具体行数表述（如 "741→613 行"、"630 行"）
  for (const m of raw.matchAll(/(\d{2,})\s*行/g)) {
    // 豁免知识库/README 里的合理表述由人工判断；这里只扫分册
    violations.push(`[防腐] ${f} 出现会过期的行数表述「${m[0]}」——实时行数应从代码读取，勿写死`);
  }
}

// ── 输出 ─────────────────────────────────────────────────────────
if (violations.length) {
  console.error(`✗ 防腐扫描发现 ${violations.length} 处：\n` + violations.map(v => '  - ' + v).join('\n'));
  process.exitCode = 1;
} else {
  console.log('✓ 防腐扫描通过：分册/知识库/skill 完整，索引无僵尸，无过期行数表述');
}