// auth 域：注册 / 登录 / JWT 鉴权中间件
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = '12h';
const SCRYPT_KEYLEN = 32;

/** scrypt 加盐哈希：salt$hex（每用户独立盐） */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** 校验：支持新 scrypt 格式与旧 sha256（校验通过即自动升级格式） */
export function verifyPassword(password: string, stored: string): boolean {
  // 旧格式：纯 sha256 hex（64 字符）
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const sha = crypto.createHash('sha256').update(password).digest('hex');
    return sha === stored;
  }
  // 新格式：scrypt$salt$hash
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const calc = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}

export function signToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): { sub: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
  } catch {
    return null;
  }
}

/** Express 中间件：Bearer 或 Cookie 均可 */
export function authMiddleware(req: any, res: any, next: any) {
  const header = req.headers?.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookie = (req.headers?.cookie || '')
    .split(';').map((s: string) => s.trim())
    .find((s: string) => s.startsWith('bsz_token='));
  const cookieToken = cookie ? cookie.slice('bsz_token='.length) : null;
  const token = bearer || cookieToken;
  const claims = token ? verifyToken(token) : null;
  if (!claims) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = { id: claims.sub, role: claims.role };
  next();
}

/** 管理员守卫（内容发布等敏感操作） */
export function adminGuard(req: any, res: any, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
