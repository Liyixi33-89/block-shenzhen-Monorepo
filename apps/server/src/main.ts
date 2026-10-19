// 后端入口：auth 注册/登录 + content 内容 + save 存档
import express from 'express';
import crypto from 'node:crypto';
import { store } from './store.ts';
import { authMiddleware, hashPassword, verifyPassword, signToken } from './auth.ts';
import { contentRouter } from './content.ts';
import { saveRouter } from './save.ts';
import { analyticsRouter } from './analytics.ts';
import { creationsRouter } from './creations.ts';

// 持久化初始化（建表 + 恢复内存索引）
store.init();

const app = express();
app.use(express.json({ limit: '5mb' }));

// ---- auth ----
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || username.length < 2 || username.length > 24) {
    return res.status(422).json({ error: 'username must be 2-24 chars' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(422).json({ error: 'password must be >= 6 chars' });
  }
  if (store.findUserByName(username)) {
    return res.status(409).json({ error: 'username taken' });
  }
  const id = crypto.randomUUID();
  const user = {
    id, username,
    passwordHash: hashPassword(password),
    // 第一个注册用户授予 admin（部署后立即注册锁定）
    role: (store.users.size === 0 ? 'admin' : 'player') as 'admin' | 'player',
    createdAt: new Date().toISOString(),
  };
  store.addUser(user);
  const token = signToken({ sub: id, role: user.role });
  res.cookie?.('bsz_token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ token, user: { id, username, role: user.role } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === 'string' ? store.findUserByName(username) : undefined;
  if (!user || !verifyPassword(String(password ?? ''), user.passwordHash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  // 旧 sha256 哈希自动升级为 scrypt
  const SCRYPT_PREFIX = 'scrypt' + String.fromCharCode(36);
  if (!user.passwordHash.startsWith(SCRYPT_PREFIX)) {
    user.passwordHash = hashPassword(String(password ?? ''));
    store.addUser(user);
  }
  const token = signToken({ sub: user.id, role: user.role });
  res.setHeader('Set-Cookie', `bsz_token=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: (req as any).user });
});

// ---- 业务域 ----
app.use('/api/content', contentRouter);
app.use('/api/save', saveRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/creations', creationsRouter);

// WS 网关、build 审核、ascension 在 P2+ 接入
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

const PORT = Number(process.env.PORT || 4001);
app.listen(PORT, () => {
  console.log(`[block-sz server] listening on http://127.0.0.1:${PORT}`);
});

