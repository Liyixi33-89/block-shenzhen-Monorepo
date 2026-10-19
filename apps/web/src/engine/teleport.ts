// 传送系统：T 键面板 → 已解锁传送点列表 → 扣费传送（到访地标解锁，数据来自 teleportPoints）
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene, TeleportPoint } from '@block-sz/schema';
import { iconEl, iconSvg } from './icons';

export interface TeleportOptions {
  container: HTMLElement;
  data: Scene;
  /** 花钱（false = 不足） */
  spend: (n: number) => boolean;
  /** 已到访地标 */
  isVisited: (landmarkId: string) => boolean;
  /** 已完成任务 */
  isQuestDone: (questId: string) => boolean;
  /** 解锁回调（记录进存档） */
  onUnlock: (tpId: string) => void;
  /** 传送回调（引擎移动玩家 + 存档） */
  onTeleport: (tp: TeleportPoint) => void;
  toast: (msg: string) => void;
  /** 其他面板是否打开（避免 T 键冲突） */
  panelGuard: () => boolean;
}

const COOLDOWN = 20;   // 全局冷却秒

export class TeleportSystem {
  private opts: TeleportOptions;
  private points: TeleportPoint[];
  private panel: HTMLDivElement;
  private body: HTMLDivElement;
  private open = false;
  private lastUse = 0;   // epoch ms

  constructor(opts: TeleportOptions) {
    this.opts = opts;
    this.points = opts.data.teleportPoints.filter(p => p.enabled);

    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel';
    const head = document.createElement('div');
    head.className = 'bsz-panel-head';
    const title = document.createElement('b');
    title.innerHTML = `${iconSvg('map', 18)} 快速传送`;
    head.appendChild(title);
    const close = document.createElement('button');
    close.textContent = '×';
    close.className = 'bsz-close';
    close.onclick = () => this.closePanel();
    head.appendChild(close);
    this.panel.appendChild(head);
    this.body = document.createElement('div');
    this.body.className = 'bsz-panel-body';
    this.panel.appendChild(this.body);
    opts.container.appendChild(this.panel);

    window.addEventListener('keydown', this.onKey);
  }

  get isOpen() { return this.open; }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key.toLowerCase() !== 't') return;
    if (this.opts.panelGuard()) return;
    this.open ? this.closePanel() : this.openPanel();
  };

  /** 解锁状态判定（free / visited / quest） */
  isUnlocked(p: TeleportPoint): boolean {
    const u = p.unlock as any;
    if (u.type === 'free') return true;
    if (u.type === 'visited') return this.opts.isVisited(u.landmark);
    if (u.type === 'quest') return this.opts.isQuestDone(u.quest);
    return false;
  }

  private openPanel() {
    this.open = true;
    this.render();
    this.panel.style.display = 'block';
  }

  closePanel() {
    this.open = false;
    this.panel.style.display = 'none';
  }

  private render() {
    this.body.innerHTML = '';
    const cooldownLeft = Math.max(0, Math.ceil((this.lastUse + COOLDOWN * 1000 - Date.now()) / 1000));

    if (!this.points.length) {
      const d = document.createElement('div');
      d.textContent = '当前场景没有传送点';
      d.style.color = '#8aa0b4';
      this.body.appendChild(d);
      return;
    }

    for (const p of this.points) {
      const unlocked = this.isUnlocked(p);
      const row = document.createElement('div');
      row.className = 'bsz-tp-row' + (unlocked ? '' : ' locked');
      const nm = document.createElement('span');
      nm.className = 'bsz-tp-name';
      if (unlocked) {
        nm.appendChild(iconEl('teleport', 15));
      } else {
        const lk = iconEl('lock', 14);
        lk.style.color = '#67788c';
        nm.appendChild(lk);
      }
      nm.appendChild(document.createTextNode(p.name));
      const btn = document.createElement('button');
      if (!unlocked) {
        const u = p.unlock as any;
        const hint = document.createElement('span');
        hint.className = 'bsz-tp-hint';
        hint.textContent = u.type === 'visited' ? '到访解锁' : '完成任务解锁';
        btn.append(hint);
        btn.disabled = true;
        btn.className = 'bsz-btn';
      } else if (cooldownLeft > 0) {
        const hint = document.createElement('span');
        hint.className = 'bsz-tp-hint';
        hint.innerHTML = `${iconSvg('clock', 12)} ${cooldownLeft}s`;
        btn.append(hint);
        btn.disabled = true;
        btn.className = 'bsz-btn';
      } else {
        btn.textContent = `¥${p.cost} 传送`;
        btn.className = 'bsz-btn bsz-btn-accent';
        btn.onclick = () => this.doTeleport(p);
      }
      row.append(nm, btn);
      this.body.appendChild(row);
    }

    const tip = document.createElement('div');
    tip.className = 'bsz-tip';
    tip.textContent = '到访对应地标即可解锁传送点';
    this.body.appendChild(tip);
  }

  private doTeleport(p: TeleportPoint) {
    if (p.cost > 0 && !this.opts.spend(p.cost)) {
      this.opts.toast('余额不足');
      this.render();
      return;
    }
    this.lastUse = Date.now();
    this.opts.onUnlock(p.id);
    this.opts.onTeleport(p);
    this.closePanel();
  }

  /** 冷却剩余秒（HUD 显示用） */
  cooldownLeft() {
    return Math.max(0, Math.ceil((this.lastUse + COOLDOWN * 1000 - Date.now()) / 1000));
  }

  /** 每 2 秒刷新面板（冷却倒计时） */
  tickRefresh() {
    if (this.open && this.cooldownLeft() >= 0) this.render();
  }

  dispose() {
    this.closePanel();
    this.panel.remove();
    window.removeEventListener('keydown', this.onKey);
  }
}

/** 传送点投影坐标（引擎侧使用） */
export function teleportPos(p: TeleportPoint) {
  return proj(p.latlng.lat, p.latlng.lng);
}
