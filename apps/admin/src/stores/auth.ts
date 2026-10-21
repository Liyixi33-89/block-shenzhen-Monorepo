// 认证状态：token 持久化 + 登录/登出 —— 独立于路由/视图层
import { ref, computed } from 'vue';
import { adminFetch } from '../services/api';

const TOKEN_KEY = 'bsz_admin_token';
const USER_KEY = 'bsz_admin_user';

const token = ref(localStorage.getItem(TOKEN_KEY) || '');
const user = ref<any>(JSON.parse(localStorage.getItem(USER_KEY) || 'null'));

export const isAuthenticated = computed(() => token.value !== '');

export function useAuth() {
  async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const { ok, data } = await adminFetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      token: '',
    });
    if (!ok) return { ok: false, error: (data as any)?.error || '登录失败' };
    token.value = (data as any).token;
    user.value = (data as any).user;
    localStorage.setItem(TOKEN_KEY, token.value);
    localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    return { ok: true };
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return { token, user, isAuthenticated, login, logout };
}
