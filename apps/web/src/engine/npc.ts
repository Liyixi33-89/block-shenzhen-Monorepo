// NPC 系统：场景包数据驱动 → 世界摆位渲染（方块小人 + 头顶名牌）→ E 键对话面板 → 效果结算
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene, Npc, DialogueNode } from '@block-sz/schema';
import { iconSvg } from './icons';

export interface NpcOptions {
  container: HTMLElement;
  scene3: THREE.Scene;
  data: Scene;
  /** 对话效果：给钱（引擎回调 gameplay） */
  giveMoney: (n: number, reason: string) => void;
  /** 对话效果：给物品 */
  giveItem: (id: string, n: number) => void;
  /** 其他面板是否打开（E 键冲突防护） */
  panelGuard: () => boolean;
  toast: (msg: string) => void;
}

const TALK_RADIUS = 26;

/** 世界中的 NPC 实体（组：身体 + 头 + 名牌 Sprite） */
interface NpcEntity {
  npc: Npc;
  group: THREE.Group;
  x: number;
  z: number;
}

export class NpcSystem {
  private opts: NpcOptions;
  private entities: NpcEntity[] = [];
  private panel: HTMLDivElement;
  private panelBody: HTMLDivElement;
  private panelTitle: HTMLElement;
  /** 当前对话上下文 */
  private activeNpc: Npc | null = null;
  private activeNode: DialogueNode | null = null;
  /** 已触发过 give 的选项（一次性效果标记：npcId:nodeId:choiceIdx） */
  private firedEffects = new Set<string>();

  constructor(opts: NpcOptions) {
    this.opts = opts;

    // ---- 对话面板 DOM（统一 bsz 风格）----
    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel';
    const head = document.createElement('div');
    head.className = 'bsz-panel-head';
    this.panelTitle = document.createElement('b');
    head.appendChild(this.panelTitle);
    const close = document.createElement('button');
    close.textContent = '×';
    close.className = 'bsz-close';
    close.onclick = () => this.closePanel();
    head.appendChild(close);
    this.panel.appendChild(head);
    this.panelBody = document.createElement('div');
    this.panelBody.className = 'bsz-panel-body';
    this.panel.appendChild(this.panelBody);
    opts.container.appendChild(this.panel);

    window.addEventListener('keydown', this.onKey);
  }

  /** 世界构建后调用：生成 NPC 实体 */
  build() {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    for (const npc of this.opts.data.npcs) {
      if (!npc.enabled) continue;
      // 位置：地标旁 或 直接坐标
      let x = 0, z = 0;
      if (npc.landmark) {
        const lm = this.opts.data.landmarks.find(l => l.id === npc.landmark);
        if (lm) {
          const p = proj(lm.latlng.lat, lm.latlng.lng);
          x = p.x + 18; z = p.z + 18;   // 地标东南侧偏移，避免贴脸
        } else continue;
      } else if (npc.latlng) {
        const p = proj(npc.latlng.lat, npc.latlng.lng);
        x = p.x; z = p.z;
      } else continue;

      const g = new THREE.Group();
      // 身体（方块小人：躯干 + 头 + 帽子）
      const body = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 4), mat(0x1c4a6e));
      body.position.y = 4;
      const head = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), mat(0xffd9a0));
      head.position.y = 10.5;
      const hat = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 6), mat(0xe8c050));
      hat.position.y = 13.3;
      body.castShadow = true;
      head.castShadow = true;
      hat.castShadow = true;
      g.add(body, head, hat);

      // 头顶名牌（Canvas Sprite）
      g.add(this.nameSprite(npc.name));

      g.position.set(x, 0, z);
      this.opts.scene3.add(g);
      this.entities.push({ npc, group: g, x, z });
    }
  }

  /** P1 每帧微动：整体轻微上下浮动，营造生机 */
  tick(t: number) {
    for (const e of this.entities) {
      const bob = Math.sin(t * 1.6 + e.x * 0.01 + e.z * 0.01) * 0.35;
      e.group.position.y = bob;
    }
  }

  private nameSprite(name: string): THREE.Sprite {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    const fs = 36;
    ctx.font = `bold ${fs}px 'Microsoft YaHei', sans-serif`;
    const w = Math.ceil(ctx.measureText(name).width) + 28;
    cv.width = w; cv.height = fs + 18;
    const c2 = cv.getContext('2d')!;
    c2.fillStyle = 'rgba(8,18,32,0.85)';
    c2.fillRect(0, 0, cv.width, cv.height);
    c2.strokeStyle = '#2d5a7a';
    c2.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1);
    c2.font = `bold ${fs}px 'Microsoft YaHei', sans-serif`;
    c2.fillStyle = '#ffe9a8';
    c2.textBaseline = 'middle';
    c2.fillText(name, 14, cv.height / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(w / fs * 3, 3, 1);
    sp.position.y = 18;
    return sp;
  }

  /** E 键：附近有 NPC 则开对话（返回是否消耗） */
  tryInteract(pos: { x: number; z: number }): boolean {
    if (this.activeNpc) return false;
    let best: NpcEntity | null = null, bestD = TALK_RADIUS;
    for (const e of this.entities) {
      const d = Math.hypot(e.x - pos.x, e.z - pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    this.openDialogue(best.npc);
    return true;
  }

  get panelOpen() { return this.activeNpc !== null; }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key.toLowerCase() !== 'escape') return;
    if (this.activeNpc) this.closePanel();
  };

  // ---------------- 对话面板 ----------------
  private openDialogue(npc: Npc) {
    this.activeNpc = npc;
    const entry = npc.dialogue[0];
    this.showNode(entry);
    this.panel.style.display = 'block';
  }

  private showNode(node: DialogueNode) {
    this.activeNode = node;
    const npc = this.activeNpc!;
    this.panelTitle.innerHTML = `${iconSvg('visit', 18)} ${npc.name}`;
    this.panelBody.innerHTML = '';

    // 台词
    const text = document.createElement('div');
    text.style.cssText = 'padding:6px 0 12px; line-height:1.7; color:#e8f2ff; font-size:14px;';
    text.textContent = node.text;
    this.panelBody.appendChild(text);

    // 选项 / 继续
    if (node.choices.length) {
      for (let i = 0; i < node.choices.length; i++) {
        const ch = node.choices[i];
        const btn = document.createElement('button');
        btn.className = 'bsz-btn bsz-btn-accent';
        btn.style.cssText += 'display:block; width:100%; margin:6px 0; text-align:left;';
        btn.textContent = '▸ ' + ch.text;
        btn.onclick = () => {
          // 结算一次性效果
          const key = `${npc.id}:${node.id}:${i}`;
          if (ch.give && !this.firedEffects.has(key)) {
            this.firedEffects.add(key);
            if (ch.give.money > 0) this.opts.giveMoney(ch.give.money, `${npc.name} 赠予`);
            if (ch.give.item) this.opts.giveItem(ch.give.item, 1);
          }
          const next = ch.next ? npc.dialogue.find(d => d.id === ch.next) : undefined;
          if (next) this.showNode(next);
          else this.closePanel();
        };
        this.panelBody.appendChild(btn);
      }
    } else if (node.next) {
      const next = npc.dialogue.find(d => d.id === node.next);
      const btn = document.createElement('button');
      btn.className = 'bsz-btn';
      btn.style.cssText += 'display:block; width:100%; margin:6px 0;';
      btn.textContent = '继续 ▾';
      btn.onclick = () => next ? this.showNode(next) : this.closePanel();
      this.panelBody.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'bsz-btn';
      btn.style.cssText += 'display:block; width:100%; margin:6px 0;';
      btn.textContent = '告辞';
      btn.onclick = () => this.closePanel();
      this.panelBody.appendChild(btn);
    }
  }

  private closePanel() {
    this.panel.style.display = 'none';
    this.activeNpc = null;
    this.activeNode = null;
  }

  dispose() {
    this.closePanel();
    this.panel.remove();
    window.removeEventListener('keydown', this.onKey);
    for (const e of this.entities) this.opts.scene3.remove(e.group);
    this.entities = [];
  }
}
