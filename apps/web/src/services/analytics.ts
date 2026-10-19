// 埋点采集：订阅事件总线 → 缓冲 → 10s 定时冲刷 / 退出 flush / 失败静默重试下轮
// 【services 服务层】原 engine/analytics.ts 迁入；轮询喂事件改为总线订阅
// 事件映射：visit/photo/quest_done/build_place/economy_earn/economy_spend/session_start/ui_panel
import type { GameplayEvent } from '../domain/events';
import { request } from './api';

const EVENT_NAMES: Record<string, string> = {
  visit: 'visit',
  photo: 'photo',
  'quest-done': 'quest_done',
  build: 'build_place',
  money: 'money_event',
  'tutorial-complete': 'tutorial_done',
};

/** 手动上报白名单（gameplay 映射之外的可追踪事件） */
const MANUAL_NAMES = new Set(['session_start', 'tutorial_done', 'ui_panel']);

export interface AnalyticsOptions {
  apiBase: string;      // '/api' 前缀
  getPlayerId: () => string;
  getSceneVersion: () => string;
}

export class Analytics {
  private opts: AnalyticsOptions;
  private queue: Array<{ name: string; props: Record<string, unknown> }> = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private unsub: (() => void) | null = null;

  constructor(opts: AnalyticsOptions) {
    this.opts = opts;
    this.timer = setInterval(() => void this.flush(), 10_000);
    // 页面隐藏时尽力冲刷（移动端切后台）
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
  }

  /** 订阅事件总线（组合根在装配时调用，替代旧的轮询喂入） */
  subscribe(bus: { on(fn: (e: GameplayEvent) => void): () => void }): void {
    this.unsub = bus.on(e => this.handleEvent(e));
  }

  /** 手动上报（面板打开、传送等非 gameplay 事件） */
  track(name: string, props: Record<string, unknown> = {}) {
    if (!EVENT_NAMES[name] && !MANUAL_NAMES.has(name) && !name.startsWith('ui_')) return;  // 白名单外拒绝
    this.queue.push({ name, props });
  }

  /** 引擎事件桥接（兼容旧批量喂入签名，e2e / 过渡期使用） */
  handleEngineEvents(events: GameplayEvent[]) {
    for (const e of events) this.handleEvent(e);
  }

  private handleEvent(e: GameplayEvent) {
    const mapped = EVENT_NAMES[e.type];
    if (!mapped) return;
    if (mapped === 'money_event') {
      const { n, reason } = e.payload ?? {};
      // 正负区分收支
      this.queue.push({
        name: n >= 0 ? 'economy_earn' : 'economy_spend',
        props: { amount: Math.abs(n), reason: String(reason ?? '').slice(0, 64) },
      });
    } else if (mapped === 'visit' || mapped === 'photo') {
      this.queue.push({ name: mapped, props: { target: String(e.payload ?? '') } });
    } else if (mapped === 'quest_done') {
      this.queue.push({ name: mapped, props: { quest: e.payload?.id, title: String(e.payload?.title ?? '').slice(0, 64) } });
    } else if (mapped === 'build_place') {
      this.queue.push({ name: mapped, props: { element: e.payload?.element ?? '' } });
    }
  }

  /** 冲刷到服务端（带 token 的游客身份） */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    const batch = this.queue.splice(0, 50);
    this.sending = true;
    try {
      await request(`${this.opts.apiBase}/analytics/collect`, {
        method: 'POST',
        body: {
          events: batch.map(e => ({
            name: e.name,
            sceneVersion: this.opts.getSceneVersion(),
            props: { ...e.props, playerId: this.opts.getPlayerId() },
          })),
        },
        init: { keepalive: true },   // 页面卸载也能送达
      });
    } catch {
      // 失败回滚队列头部（下轮重试），最多保留 200 条防膨胀
      this.queue.unshift(...batch.slice(0, 200 - this.queue.length));
    } finally {
      this.sending = false;
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.unsub?.();
    void this.flush();
  }
}
