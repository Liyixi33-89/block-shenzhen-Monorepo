// 认证状态：HttpOnly Cookie 会话（bsz_token 由后端下发，前端不可读）+ 用户信息缓存
// 登录态判定：调 /api/auth/me 用 cookie 会话校验，不再持有 token
import { ref, computed } from 'vue';
import { adminFetch } from '../services/api';

const USER_KEY = 'bsz_admin_user';

const user = ref<any>(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
const ready = ref(false);

/** me 校验完成（路由守卫依赖，避免首帧闪烁） */
export const authReady = computed(() => ready.value);

export const isAuthenticated = computed(() => user.value !== null);

/** 启动时用 cookie 会话校验登录态（幂等，可重复调用） */
export async function restoreSession(): Promise<boolean> {
  if (ready.value) return isAuthenticated.value;
  const { ok, data } = await adminFetch('/api/auth/me');
  if (ok) {
    user.value = (data as any).user;
    localStorage.setItem(USER_KEY, JSON.stringify(user.value));
  } else {
    user.value = null;
    localStorage.removeItem(USER_KEY);
  }
  ready.value = true;
  return isAuthenticated.value;
}

export function useAuth() {
  async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    // 后端 Set-Cookie: bsz_token（HttpOnly），浏览器自动保存
    const { ok, data } = await adminFetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (!ok) return { ok: false, error: (data as any)?.error || '登录失败' };
    user.value = (data as any).user;
    localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    ready.value = true;
    return { ok: true };
  }

  function logout() {
    // HttpOnly cookie 前端不可读，只能由后端过期；本地仅清用户信息
    user.value = null;
    localStorage.removeItem(USER_KEY);
  }

  return { user, isAuthenticated, authReady, login, logout };
}
