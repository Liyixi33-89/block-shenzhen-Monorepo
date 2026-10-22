// 观景台登顶：在 deck 地标光圈内 E 键登顶俯瞰，已登顶再按则下塔。
// 【engine 横切层】从 engine.ts 抽出，持有登顶状态；依赖经接口注入，便于独立维护。
import { proj } from '@block-sz/shared';
import type { Landmark } from '@block-sz/schema';

/** DeckController 依赖的玩家能力（由 GameEngine 实现） */
export interface DeckPlayer {
  position: { x: number; z: number };
  deckMode(active: boolean, x?: number, z?: number, height?: number): void;
  teleport(x: number, z: number): void;
}

export interface DeckTarget {
  player: DeckPlayer | null;
  landmarks: Landmark[];
  /** 地标观景台高度（由 engine 注入 LABEL_HEIGHT 映射，缺省兜底） */
  deckHeight(id: string): number;
  toast(msg: string): void;
  onChanged(): void;
}

/** 观景台登顶控制器：登顶/下塔状态机。 */
export class DeckController {
  landmark: Landmark | null = null;
  private returnPos: { x: number; z: number } | null = null;

  constructor(private target: DeckTarget) {}

  /** E 键调用：已在俯瞰则下塔；否则找最近可登顶 deck 地标。返回是否消费了交互。 */
  tryInteract(): boolean {
    const { player, landmarks } = this.target;
    if (!player) return false;
    // 已在俯瞰：下塔
    if (this.landmark) {
      this.exit();
      return true;
    }
    // 找最近的 deck 地标（光圈内）
    const pos = player.position;
    let best: Landmark | null = null;
    let bestD = Infinity;
    for (const l of landmarks) {
      if (!l.deck || l.enabled === false || !l.latlng) continue;
      const p = proj(l.latlng.lat, l.latlng.lng);
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < (l.interactRadius ?? 600) && d < bestD) { best = l; bestD = d; }
    }
    if (best) this.enter(best);
    return !!best;
  }

  /** 登顶：冻结地面移动，相机飞升到塔顶俯瞰 */
  private enter(lm: Landmark) {
    const player = this.target.player;
    if (!player || !lm.latlng) return;
    const p = proj(lm.latlng.lat, lm.latlng.lng);
    this.returnPos = { x: player.position.x, z: player.position.z };
    const height = this.target.deckHeight(lm.id) + 6;
    this.landmark = lm;
    player.deckMode(true, p.x, p.z, height);
    this.target.toast(`登顶「${lm.name}」观景台，俯瞰全城`);
    // 登顶可拍夜景/俯瞰照
    this.target.onChanged();
  }

  /** 下塔：恢复地面位置与控制 */
  exit() {
    const player = this.target.player;
    if (!player || !this.returnPos) return;
    this.landmark = null;
    player.deckMode(false);
    player.teleport(this.returnPos.x, this.returnPos.z);
    this.returnPos = null;
    this.target.toast('回到地面');
  }
}