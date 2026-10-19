// 领域事件：类型唯一源 + 轻量总线
// 内层模块（domain/services）通过总线解耦：gameplay 产出事件，
// 埋点（services）、toast（视图）、飞升重评估（组合根）各自订阅。
// 本文件禁止 import three / vue / DOM API / fetch。

export interface GameplayEvent {
  type: 'visit' | 'photo' | 'money' | 'item' | 'quest-done' | 'quest-progress' | 'quest-unlocked' | 'walk' | 'build' | 'info';
  payload?: any;
}

type Listener = (e: GameplayEvent) => void;

/** 同步分发的事件总线（无三方依赖，订阅返回退订函数） */
export class EventBus {
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(e: GameplayEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
