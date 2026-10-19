// localStorage 读写收敛：键名唯一源
// 【infra 基础设施层】禁止 import 任何业务模块
export const STORAGE_KEYS = {
  token: 'bsz_token',
  playerId: 'bsz_player',
  pwd: 'bsz_pwd',
  tutorialDone: 'bsz_tutorial_done',
} as const;

export function lsGet(key: string): string | null {
  return localStorage.getItem(key);
}

export function lsSet(key: string, value: string): void {
  localStorage.setItem(key, value);
}

export function lsRemove(key: string): void {
  localStorage.removeItem(key);
}
