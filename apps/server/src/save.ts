// save 域：云存档（全量覆盖式，P1 简化实现）
import { Router, type Request, type Response } from 'express';
import { validatePlayerSave } from '@block-sz/schema';
import { store } from './store.ts';
import { authMiddleware } from './auth.ts';

export const saveRouter = Router();
saveRouter.use(authMiddleware);

/** 拉取自己的云存档 */
saveRouter.get('/', (req: Request, res: Response) => {
  const rec = store.saves.get((req as any).user.id);
  if (!rec) return res.status(404).json({ error: 'no save' });
  res.json({ save: rec.payload, updatedAt: rec.updatedAt });
});

/** 上传存档（Schema 校验；playerId 必须是自己） */
saveRouter.put('/', (req: Request, res: Response) => {
  const check = validatePlayerSave(req.body);
  if (!check.ok) {
    return res.status(422).json({ error: 'invalid save', issues: check.errors });
  }
  if (check.data.playerId !== (req as any).user.id) {
    return res.status(403).json({ error: 'playerId mismatch' });
  }
  const now = new Date().toISOString();
  store.putSave({ playerId: check.data.playerId, payload: check.data, updatedAt: now });
  res.json({ ok: true, updatedAt: now });
});

/** 删除存档 */
saveRouter.delete('/', (req: Request, res: Response) => {
  store.deleteSave((req as any).user.id);
  res.json({ ok: true });
});
