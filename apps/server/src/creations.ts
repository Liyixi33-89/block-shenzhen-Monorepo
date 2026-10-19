// 作品广场域：发布建造作品 / 浏览 / 点赞 / 导入他人作品（异步社交）
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { store } from './store.ts';
import { authMiddleware } from './auth.ts';

export const creationsRouter = Router();

interface Placement { n: number; element: string; x: number; y: number; z: number; rot: number }

function parsePlacements(raw: unknown): Placement[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) return null;
  const out: Placement[] = [];
  for (const p of raw) {
    if (typeof p?.element !== 'string' || p.element.length > 64) return null;
    const x = Number(p.x), y = Number(p.y), z = Number(p.z), rot = Number(p.rot ?? 0), n = Number(p.n ?? 1);
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 5000 || Math.abs(y) > 2000 || Math.abs(z) > 5000) return null;
    out.push({ n, element: p.element, x, y, z, rot });
  }
  return out;
}

/** 发布作品（游客身份即可；title 必填） */
creationsRouter.post('/publish', authMiddleware, (req: Request, res: Response) => {
  const { title, desc, placements } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 2 || title.length > 32) {
    return res.status(422).json({ error: 'title must be 2-32 chars' });
  }
  const parsed = parsePlacements(placements);
  if (!parsed) return res.status(422).json({ error: 'placements invalid (1-500 items)' });
  const user = (req as any).user;
  const id = crypto.randomUUID().slice(0, 8);
  store.addCreation({
    id,
    playerId: user.id,
    playerName: user.username ?? '游客',
    title: title.trim(),
    desc: typeof desc === 'string' ? desc.trim() : '',
    placements: parsed,
  });
  res.json({ ok: true, id });
});

/** 列表：?sort=new|hot */
creationsRouter.get('/list', (req: Request, res: Response) => {
  const sort = req.query.sort === 'hot' ? 'hot' : 'new';
  res.json({ creations: store.listCreations(sort) });
});

/** 点赞 */
creationsRouter.post('/:id/like', authMiddleware, (req: Request, res: Response) => {
  const ok = store.likeCreation(req.params.id, (req as any).user.id);
  if (!ok) return res.status(409).json({ error: 'already liked or not found' });
  const c = store.getCreation(req.params.id);
  res.json({ ok: true, likes: c?.likes ?? 0 });
});

/** 导入：返回完整 placements（客户端复制到自己世界） */
creationsRouter.get('/:id', (req: Request, res: Response) => {
  const c = store.getCreation(req.params.id);
  if (!c) return res.status(404).json({ error: 'creation not found' });
  res.json({
    creation: {
      id: c.id, title: c.title, desc: c.desc, likes: c.likes,
      author: c.playerName, count: c.placements.length, placements: c.placements,
    },
  });
});
