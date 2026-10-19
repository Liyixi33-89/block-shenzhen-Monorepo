// 埋点域：批量上报（客户端 10s 定时冲刷）+ admin 聚合查询
import { Router, type Request, type Response } from 'express';
import { store, type EventRecord } from './store.ts';
import { authMiddleware, adminGuard } from './auth.ts';

export const analyticsRouter = Router();

/** 批量上报（游客即可；playerId 来自 JWT） */
analyticsRouter.post('/collect', authMiddleware, (req: Request, res: Response) => {
  const { events } = req.body ?? {};
  if (!Array.isArray(events) || events.length === 0) return res.json({ ok: true, accepted: 0 });
  if (events.length > 100) return res.status(413).json({ error: 'too many events per batch' });
  const playerId = (req as any).user?.id ?? 'anon';
  // 白名单校验（防注入任意字段）
  const clean: Array<Omit<EventRecord, 'ts'>> = [];
  for (const e of events) {
    if (typeof e?.name !== 'string' || e.name.length > 64) continue;
    clean.push({
      playerId,
      name: e.name,
      sceneVersion: String(e.sceneVersion ?? '').slice(0, 32),
      props: sanitizeProps(e.props),
    });
  }
  const n = store.addEvents(clean);
  res.json({ ok: true, accepted: n });
});

function sanitizeProps(p: any): Record<string, string | number | boolean> {
  if (!p || typeof p !== 'object') return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(p).slice(0, 20)) {
    if (typeof v === 'string') out[k.slice(0, 32)] = v.slice(0, 128);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 32)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 32)] = v;
  }
  return out;
}

// ---- admin 查询 ----

/** 事件总览（默认近 7 天全部事件） */
analyticsRouter.get('/admin/overview', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const days = Number(req.query.days) || 7;
  res.json({ events: store.queryEvents({ days }) });
});

/** 漏斗（?steps=visit,photo,quest_done） */
analyticsRouter.get('/admin/funnel', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const steps = String(req.query.steps || '').split(',').map(s => s.trim()).filter(Boolean);
  if (steps.length < 2) return res.status(422).json({ error: 'steps must be >= 2 event names' });
  res.json({ funnel: store.funnel(steps) });
});

/** DAU（按天去重玩家数，近 N 天） */
analyticsRouter.get('/admin/dau', authMiddleware, adminGuard, (req: Request, res: Response) => {
  const days = Number(req.query.days) || 14;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = (store as any).db.prepare(
    `SELECT substr(ts, 1, 10) AS day, COUNT(DISTINCT player_id) AS n
     FROM events WHERE ts >= ? GROUP BY day ORDER BY day`
  ).all(since);
  res.json({ dau: rows });
});
