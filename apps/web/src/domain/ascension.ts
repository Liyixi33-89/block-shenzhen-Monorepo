// 飞升系统：ascensionPoints 累计 → 阶段判定 → 能力解锁开关（build/teleport/fly 等）
import type { Scene, AscensionStage } from '@block-sz/schema';

export type UnlockKey = 'build' | 'teleport' | 'fly';

export class AscensionSystem {
  private stages: AscensionStage[];
  /** 当前阶段 id（存档字段 ascensionStage） */
  stageId = 'newcomer';
  /** 缓存解锁集合 */
  private unlocked = new Set<UnlockKey>();

  constructor(scene: Scene, init?: { points?: number; stageId?: string }) {
    this.stages = scene.ascension?.stages ?? [];
    this.evaluate(init?.points ?? 0, init?.stageId);
  }

  /** 按当前点数重算阶段（点数只会涨，阶段单调前进） */
  evaluate(points: number, prevStageId?: string): AscensionStage | null {
    // 可达阶段 = 满足点数且前置已达成（拓扑序：按 stages 数组顺序）
    const reached = new Set<string>();
    // 阶段按声明序做拓扑推进
    for (let pass = 0; pass < this.stages.length; pass++) {
      for (const s of this.stages) {
        if (reached.has(s.id)) continue;
        if (points < s.points) continue;
        // 容错：旧版本场景数据可能缺 requires 字段（视为无前置）
        if ((s.requires ?? []).some(r => !reached.has(r))) continue;
        reached.add(s.id);
      }
    }
    // 当前阶段 = 可达集合中点数门槛最高者
    let cur: AscensionStage | null = null;
    for (const s of this.stages) {
      if (reached.has(s.id) && (!cur || s.points >= cur.points)) cur = s;
    }
    if (cur) this.stageId = cur.id;
    else if (prevStageId) this.stageId = prevStageId;

    this.unlocked.clear();
    for (const s of this.stages) {
      if (reached.has(s.id)) (s.unlocks ?? []).forEach(u => this.unlocked.add(u as UnlockKey));
    }
    return cur;
  }

  has(key: UnlockKey): boolean {
    return this.unlocked.has(key);
  }

  /** 当前阶段展示信息（HUD/升级提示用） */
  current(): AscensionStage | null {
    return this.stages.find(s => s.id === this.stageId) ?? null;
  }

  /** 下一阶段（升级目标提示用） */
  next(): AscensionStage | null {
    const cur = this.current();
    const candidates = this.stages.filter(s =>
      cur ? s.points > cur.points && (s.requires ?? []).includes(cur.id) : (s.requires ?? []).length === 0);
    return candidates.sort((a, b) => a.points - b.points)[0] ?? null;
  }
}
