// HTTP 单一出口：token 注入 + JSON 规约
// 【services 服务层】所有网络请求必须走 request()；
// 未来换 HTTP 库 / 加重试 / 加灰度头只改本文件。
import { lsGet } from '../infra/storage';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 额外 headers */
  headers?: Record<string, string>;
  /** 携带登录态（默认 true） */
  auth?: boolean;
  /** fetch 原生透传（如 keepalive） */
  init?: RequestInit;
}

/** 统一请求：返回 [ok, status, data]；网络异常抛错由调用方决定吞或抛 */
export async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const { method = 'GET', body, headers = {}, auth = true, init = {} } = opts;
  const token = lsGet('bsz_token');
  const r = await fetch(path, {
    ...init,
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* 204 / 非 JSON 响应 */ }
  return { ok: r.ok, status: r.status, data };
}
