// admin HTTP 单一出口：token 注入 + JSON 规约
// 【services 服务层】原 App.vue 内 13 处散落 fetch 收敛于此
export interface AdminRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** 覆盖 token（登录前无 token） */
  token?: string;
}

export async function adminFetch<T = any>(path: string, opts: AdminRequest = {}): Promise<{ ok: boolean; data: T }> {
  const { method = 'GET', body, token } = opts;
  const r = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* 非 JSON */ }
  return { ok: r.ok, data };
}
