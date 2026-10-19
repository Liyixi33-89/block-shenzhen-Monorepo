// 移动端触屏控制：虚拟摇杆（移动）+ 右半屏拖拽（视角）+ 双指捏合（缩放）+ 快捷按钮组
// 激活条件：容器上出现 touch 类指针事件（桌面鼠标不受影响）
import type { PlayerAPI } from './player';

export interface TouchOptions {
  container: HTMLElement;
  player: PlayerAPI;
  /** 快捷动作回调（由引擎桥接各系统） */
  actions: {
    camera: () => void;     // C：举相机/收起
    shutter: () => void;    // 空格：快门
    interact: () => void;   // E：乘车/对话
    build: () => void;      // B：建造开关
    teleport: () => void;   // T：传送面板
    quest: () => void;      // Q：任务面板
    shop: () => void;       // S：商店/投资面板
    gallery: () => void;    // G：作品广场
  };
}

/** 模拟键盘键注入（player.keys 是 Set<string>） */
const KEYMAP = { up: 'w', down: 's', left: 'a', right: 'd' } as const;

export class TouchControls {
  private opts: TouchOptions;
  private root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private btnGroup: HTMLDivElement;

  private active = false;
  /** 摇杆指针 id 与状态 */
  private stickId = -1;
  private stickCX = 0; private stickCY = 0;
  private readonly STICK_R = 52;

  /** 视角指针（右半屏拖拽） */
  private lookId = -1;
  private lookX = 0; private lookY = 0;
  /** 捏合缩放 */
  private pinchIds = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  /** 视角/缩放状态（写回 player 的私有字段通过公开方法注入） */
  private setLook: ((dx: number, dy: number) => void) | null = null;
  private setZoom: ((d: number) => void) | null = null;

  constructor(opts: TouchOptions) {
    this.opts = opts;

    // ---- DOM ----
    this.root = document.createElement('div');
    this.root.className = 'bsz-touch';
    this.root.style.display = 'none';

    // 虚拟摇杆
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'bsz-stick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'bsz-stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.root.appendChild(this.stickBase);

    // 快捷按钮
    this.btnGroup = document.createElement('div');
    this.btnGroup.className = 'bsz-touch-btns';
    const defs: Array<{ label: string; cls: string; fn: keyof TouchOptions['actions'] }> = [
      { label: '相机', cls: 'bsz-tb-camera', fn: 'camera' },
      { label: '快门', cls: 'bsz-tb-shutter', fn: 'shutter' },
      { label: 'E', cls: 'bsz-tb-e', fn: 'interact' },
      { label: '建造', cls: 'bsz-tb-build', fn: 'build' },
      { label: '传送', cls: 'bsz-tb-tp', fn: 'teleport' },
      { label: '任务', cls: 'bsz-tb-quest', fn: 'quest' },
      { label: '商店', cls: 'bsz-tb-shop', fn: 'shop' },
      { label: '广场', cls: 'bsz-tb-gallery', fn: 'gallery' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'bsz-tb ' + d.cls;
      b.textContent = d.label;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        this.opts.actions[d.fn]();
      });
      this.btnGroup.appendChild(b);
    }
    this.root.appendChild(this.btnGroup);

    opts.container.appendChild(this.root);

    // ---- 指针事件（挂在容器上，只在 touch 指针时接管）----
    opts.container.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    opts.container.addEventListener('pointermove', this.onPointerMove, { passive: false });
    opts.container.addEventListener('pointerup', this.onPointerUp);
    opts.container.addEventListener('pointercancel', this.onPointerUp);
  }

  /** 注入视角控制（player 模块的拖拽/缩放改写接口） */
  bindLook(setLook: (dx: number, dy: number) => void, setZoom: (d: number) => void) {
    this.setLook = setLook;
    this.setZoom = setZoom;
  }

  /** 触屏激活（首次 touch 指针后常驻显示） */
  private activate() {
    if (this.active) return;
    this.active = true;
    this.root.style.display = 'block';
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;   // 鼠标走原有路径
    this.activate();
    const target = e.target as HTMLElement;
    if (target.closest('.bsz-tb') || target.closest('.bsz-panel') || target.closest('.bsz-touch-btns')) return;

    const rect = this.opts.container.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    // 左下摇杆区（半径 130）
    if (this.stickId === -1 && x < rect.width * 0.42 && y > rect.height * 0.45) {
      this.stickId = e.pointerId;
      this.stickCX = x; this.stickCY = y;
      this.stickBase.style.left = (x - this.STICK_R) + 'px';
      this.stickBase.style.top = (y - this.STICK_R) + 'px';
      this.stickBase.style.opacity = '1';
      this.moveKnob(0, 0);
      return;
    }
    // 视角拖拽（其余区域）
    if (this.lookId === -1) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX; this.lookY = e.clientY;
    }
    // 捏合记录
    this.pinchIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinchIds.size === 2) this.pinchDist = this.curPinchDist();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !this.active) return;
    const rect = this.opts.container.getBoundingClientRect();

    // 摇杆
    if (e.pointerId === this.stickId) {
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let dx = x - this.stickCX, dy = y - this.stickCY;
      const len = Math.hypot(dx, dy);
      if (len > this.STICK_R) { dx = dx / len * this.STICK_R; dy = dy / len * this.STICK_R; }
      this.moveKnob(dx, dy);
      this.applyStick(dx, dy);
      return;
    }
    // 捏合缩放（两指）
    if (this.pinchIds.has(e.pointerId)) {
      this.pinchIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchIds.size === 2) {
        const d = this.curPinchDist();
        const delta = d - this.pinchDist;
        this.pinchDist = d;
        this.setZoom?.(-delta * 0.15);
        return;
      }
    }
    // 单指视角
    if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lookX;
      const dy = e.clientY - this.lookY;
      this.lookX = e.clientX; this.lookY = e.clientY;
      this.setLook?.(dx, dy);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pinchIds.delete(e.pointerId);
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stickBase.style.opacity = '0.5';
      this.moveKnob(0, 0);
      this.applyStick(0, 0);
    }
    if (e.pointerId === this.lookId) this.lookId = -1;
  };

  private curPinchDist(): number {
    const [a, b] = [...this.pinchIds.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private moveKnob(dx: number, dy: number) {
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** 摇杆位移 → 注入 WASD 键（带死区） */
  private applyStick(dx: number, dy: number) {
    const keys = this.opts.player.keys;
    const dead = 10;
    keys.delete(KEYMAP.up); keys.delete(KEYMAP.down);
    keys.delete(KEYMAP.left); keys.delete(KEYMAP.right);
    if (Math.abs(dy) > dead) keys.add(dy < 0 ? KEYMAP.up : KEYMAP.down);
    if (Math.abs(dx) > dead) keys.add(dx > 0 ? KEYMAP.right : KEYMAP.left);
  }

  /** 是否已激活（引擎判断移动端布局用） */
  get enabled() { return this.active; }

  dispose() {
    this.root.remove();
    const c = this.opts.container;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
  }
}
