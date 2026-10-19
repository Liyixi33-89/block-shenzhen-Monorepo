// content 域：场景草稿/发布/版本（内容热更的核心 API）
import { Router, type Request, type Response } from 'express';
import { validateScene, type Scene } from '@block-sz/schema';
import { store } from './store.ts';
import { authMiddleware, adminGuard } from './auth.ts';

export const contentRouter = Router();

/** 获取场景（P2-3 灰度分桶：?playerId= 游客 id 决定命中版本；无 playerId 时给最新） */
contentRouter.get('/scenes/:id', (req: Request, res: Response) => {
  const playerId = String(req.query.playerId ?? '');
  if (playerId) {
    const resolved = store.resolveVersion(req.params.id, playerId);
    if (!resolved.scene) return res.status(404).json({ error: 'scene not found' });
    return res.json({ scene: resolved.scene, version: resolved.version, gray: resolved.gray });
  }
  const scene = store.scenes.get(req.params.id);
  if (!scene) return res.status(404).json({ error: 'scene not found' });
  res.json({ scene, version: scene.version });
});

/** 已发布版本列表 */
contentRouter.get('/scenes/:id/versions', (req: Request, res: Response) => {
  const versions = store.sceneVersions.get(req.params.id) ?? [];
  res.json({ versions: versions.map((v: Scene) => v.version) });
});

/** 获取指定版本（不可变） */
contentRouter.get('/scenes/:id/versions/:ver', (req: Request, res: Response) => {
  const versions = store.sceneVersions.get(req.params.id) ?? [];
  const scene = versions.find((v: Scene) => v.version === req.params.ver);
  if (!scene) return res.status(404).json({ error: 'version not found' });
  res.json({ scene });
});

// ---- 后台管理接口（需 admin）----

/** 保存草稿（Schema 校验拒绝脏数据） */
contentRouter.put('/admin/scenes/:id', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const check = validateScene(req.body);
  if (!check.ok) {
    return res.status(422).json({ error: 'invalid scene', issues: check.errors });
  }
  if (check.data.id !== req.params.id) {
    return res.status(422).json({ error: 'scene id mismatch' });
  }
  store.putDraft(req.params.id, check.data);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

/** 发布草稿：版本必须比最新已发布版本高（semver 递增） */
contentRouter.post('/admin/scenes/:id/publish', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const draft = store.drafts.get(req.params.id);
  if (!draft) return res.status(404).json({ error: 'no draft' });
  const versions = store.sceneVersions.get(req.params.id) ?? [];
  const latest = versions.at(-1);
  if (latest && !semverGt(draft.version, latest.version)) {
    return res.status(409).json({ error: 'version must be greater than ' + latest.version });
  }
  store.putPublished(req.params.id, structuredClone(draft));
  res.json({ ok: true, published: draft.version });
});

function semverGt(a: string, b: string): boolean {
  const [a1, a2, a3] = a.split('.').map(Number);
  const [b1, b2, b3] = b.split('.').map(Number);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

// ==================== P2-3 版本管理 ====================

/** 当前灰度/回滚配置 */
contentRouter.get('/admin/scenes/:id/rollout', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const cfg = store.rollout.get(req.params.id) ?? { pinnedVersion: '', grayPercent: 100 };
  const versions = store.sceneVersions.get(req.params.id) ?? [];
  res.json({
    rollout: cfg,
    latest: versions.at(-1)?.version ?? '',
    versions: versions.map(v => v.version),
  });
});

/** 设置灰度百分比（0-100；100=全量最新） */
contentRouter.post('/admin/scenes/:id/rollout/gray', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const pct = Number(req.body?.percent);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
    return res.status(422).json({ error: 'percent must be 0-100' });
  }
  store.setRollout(req.params.id, '', pct);
  res.json({ ok: true, grayPercent: pct });
});

/** 回滚：全量锁定到指定版本（'' = 取消锁定恢复最新） */
contentRouter.post('/admin/scenes/:id/rollout/pin', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const ver = String(req.body?.version ?? '');
  if (ver) {
    const exists = (store.sceneVersions.get(req.params.id) ?? []).some(v => v.version === ver);
    if (!exists) return res.status(404).json({ error: 'version not found' });
  }
  store.setRollout(req.params.id, ver, ver ? 100 : 100);
  res.json({ ok: true, pinnedVersion: ver });
});

/** 版本 diff：两个版本的深层对比（数组按长度+逐项，对象按 key） */
contentRouter.get('/admin/scenes/:id/diff', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const versions = store.sceneVersions.get(req.params.id) ?? [];
  const va = String(req.query.from ?? '');
  const vb = String(req.query.to ?? '');
  const A = versions.find(v => v.version === va);
  const B = versions.find(v => v.version === vb);
  if (!A || !B) return res.status(404).json({ error: 'version not found' });
  res.json({ diff: diffScene(A, B) });
});

/** 场景深度 diff（浅层列变化摘要，深层收集路径） */
function diffScene(A: any, B: any): Array<{ path: string; type: string; detail: string }> {
  const out: Array<{ path: string; type: string; detail: string }> = [];
  walk(A, B, [], out, 0);
  return out;
  function walk(a: any, b: any, path: string[], out: any[], depth: number) {
    if (depth > 4) return;   // 深度限制防爆栈
    if (a === b) return;
    const ta = Array.isArray(a) ? 'array' : typeof a;
    const tb = Array.isArray(b) ? 'array' : typeof b;
    if (ta !== tb) {
      out.push({ path: path.join('.'), type: 'type-change', detail: `${ta} → ${tb}` });
      return;
    }
    if (ta === 'array') {
      if (a.length !== b.length) {
        out.push({ path: path.join('.') + '.length', type: 'size', detail: `${a.length} → ${b.length}` });
      }
      const n = Math.min(a.length, b.length);
      let changed = 0;
      for (let i = 0; i < n; i++) {
        const before = out.length;
        walk(a[i], b[i], [...path, i], out, depth + 1);
        if (out.length > before) changed++;
        if (changed > 20) { out.push({ path: path.join('.'), type: 'truncated', detail: `…共 ${n} 项，仅显示前 20 处变化` }); return; }
      }
      return;
    }
    if (ta === 'object' && a && b) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) walk(a[k], b[k], [...path, k], out, depth + 1);
      return;
    }
    // 叶子变化
    out.push({
      path: path.join('.') || '(root)',
      type: 'value',
      detail: `${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`,
    });
  }
}
