// 场景内容服务：拉取已发布场景（含灰度分桶参数）
// 【services 服务层】App.vue 此前直接 fetch 两处，收敛于此
import { request } from './api';

/** 拉取场景（playerId 用于服务端灰度分桶；返回 null = 未发布/离线） */
export async function fetchScene(sceneId: string, playerId?: string): Promise<{ scene: any; gray?: boolean } | null> {
  const qs = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  const { ok, data } = await request(`/api/content/scenes/${sceneId}${qs}`, { auth: false });
  if (!ok) return null;
  return { scene: data.scene, gray: data.gray };
}

/** 后端健康检查（在线 true / 离线 false） */
export async function checkHealth(): Promise<boolean> {
  try {
    const { ok } = await request('/api/health', { auth: false });
    return ok;
  } catch {
    return false;
  }
}
