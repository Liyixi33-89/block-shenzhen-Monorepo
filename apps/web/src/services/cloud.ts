// 云存档：游客注册（自动账号）→ JWT → 存档上传/拉取
// 【services 服务层】原 engine/cloud.ts 收敛于此，fetch 改走 services/api
import { request } from './api';
import { lsGet, lsSet, STORAGE_KEYS } from '../infra/storage';

export interface CloudSession {
  token: string;
  playerId: string;
  name: string;
}

/** 自动游客账号：本地生成，注册后绑定 JWT */
export async function ensureSession(): Promise<CloudSession> {
  // 已有会话先试登录态
  const token = lsGet(STORAGE_KEYS.token);
  const playerId = lsGet(STORAGE_KEYS.playerId);
  if (token && playerId) {
    const { ok, data } = await request('/api/auth/me');
    if (ok) {
      return { token, playerId, name: data.user?.username ?? playerId };
    }
  }
  // 新游客：随机账号注册（密码满足复杂度：≥8 位且含字母+数字，防被新策略 422）
  const uname = 'guest_' + Math.random().toString(36).slice(2, 8);
  const pwd = 'Gz' + Math.random().toString(36).slice(2, 10) + '7k';
  const { ok, status, data } = await request('/api/auth/register', {
    method: 'POST',
    body: { username: uname, password: pwd },
    auth: false,
  });
  if (!ok) throw new Error('游客注册失败 ' + status);
  lsSet(STORAGE_KEYS.token, data.token);
  lsSet(STORAGE_KEYS.playerId, data.user.id);
  // 密码也存着（可选：下次 me 失效时重登）
  lsSet(STORAGE_KEYS.pwd, pwd);
  return { token: data.token, playerId: data.user.id, name: data.user.username };
}

/** 上传存档 */
export async function uploadSave(_session: CloudSession, save: unknown): Promise<boolean> {
  const { ok } = await request('/api/save', { method: 'PUT', body: save });
  return ok;
}

/** 拉取存档（null = 无存档） */
export async function downloadSave(_session: CloudSession): Promise<any | null> {
  const { ok, status, data } = await request('/api/save');
  if (status === 404) return null;
  if (!ok) throw new Error('存档拉取失败 ' + status);
  return data.save;
}
