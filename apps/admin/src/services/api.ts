// admin HTTP 单一出口：cookie 会话（credentials include）+ JSON 规约
// 认证依赖后端下发的 bsz_token HttpOnly Cookie，前端不持有 token
export interface AdminRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function adminFetch<T = any>(path: string, opts: AdminRequest = {}): Promise<{ ok: boolean; data: T }> {
  const { method = 'GET', body } = opts;
  const r = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* 非 JSON */ }
  return { ok: r.ok, data };
}
