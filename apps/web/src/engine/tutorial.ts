// 新手引导：分步卡片式教学（仅新玩家触发一次）
// 判定：云存档无 visited/photos/questProgress 任意之一为空进度
// 进度存 localStorage（关闭后不再出现；重置存档可重新触发）
import { iconSvg } from './icons';

export interface TutorialOptions {
  container: HTMLElement;
  /** 是否显示引导（App 判定新玩家后传入） */
  enabled: boolean;
  onComplete?: () => void;
}

interface Step {
  title: string;
  body: string;
  /** 键位高亮（可选） */
  keys?: string[];
}

const IS_TOUCH = typeof window !== 'undefined'
  && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

const STEPS: Step[] = IS_TOUCH ? [
  {
    title: '欢迎来到方块鹏城',
    body: '这是一座可以自由探索的方块深圳。跟着引导 30 秒上手，随时按下方「跳过引导」。',
  },
  {
    title: '移动与视角',
    body: '按住左下角摇杆移动；右侧屏幕拖动转动视角，双指捏合拉近拉远。',
  },
  {
    title: '快捷按钮',
    body: '右下按钮组：相机举起手机，快门拍照；E 乘车对话；建造/传送/任务随飞升等级解锁。',
  },
  {
    title: '你的第一个目标',
    body: '跟着 HUD 顶部的金色地名走，到访地标即解锁图鉴；拍下第一张照片可得 ¥50。',
  },
] : [
  {
    title: '欢迎来到方块鹏城',
    body: '这是一座可以自由探索的方块深圳。跟着引导 30 秒上手，随时按 X 跳过。',
  },
  {
    title: '移动与视角',
    body: 'WASD 移动，按住鼠标左键拖拽转动视角，滚轮拉近拉远。Shift 疾跑。',
    keys: ['W A S D', 'Shift', '拖拽', '滚轮'],
  },
  {
    title: '交互键',
    body: '走近发光的建筑会提示可用操作：E 乘车/对话，C 举起相机，空格快门拍照。',
    keys: ['E', 'C', '空格'],
  },
  {
    title: '面板与能力',
    body: 'Q 任务、P 图鉴、K 键位说明。建造（B）与传送（T）会随飞升等级逐步解锁。',
    keys: ['Q', 'P', 'K', 'B', 'T'],
  },
  {
    title: '你的第一个目标',
    body: '跟着 HUD 顶部的金色地名走，到访地标即解锁图鉴；拍下第一张照片可得 ¥50。',
  },
];

const LS_KEY = 'bsz_tutorial_done';

export class Tutorial {
  private opts: TutorialOptions;
  private overlay: HTMLDivElement;
  private card: HTMLDivElement;
  private stepIdx = 0;
  private visible = false;

  constructor(opts: TutorialOptions) {
    this.opts = opts;

    this.overlay = document.createElement('div');
    this.overlay.className = 'bsz-tut-overlay';
    this.overlay.style.cssText = `
      position:absolute; inset:0; z-index:11; display:none;
      background:rgba(4,10,18,0.55); backdrop-filter:blur(2px);
    `;
    this.card = document.createElement('div');
    this.card.className = 'bsz-tut-card';
    this.overlay.appendChild(this.card);
    opts.container.appendChild(this.overlay);

    if (opts.enabled && !localStorage.getItem(LS_KEY)) {
      window.addEventListener('keydown', this.onKey);
      // 延迟一拍展示（等加载遮罩收起）
      setTimeout(() => this.show(), 400);
    }
  }

  private get step() { return STEPS[this.stepIdx]; }

  private show() {
    this.visible = true;
    this.overlay.style.display = 'block';
    this.render();
  }

  dismiss() {
    this.visible = false;
    this.overlay.style.display = 'none';
    localStorage.setItem(LS_KEY, '1');
    window.removeEventListener('keydown', this.onKey);
    this.opts.onComplete?.();
  }

  private next() {
    this.stepIdx++;
    if (this.stepIdx >= STEPS.length) { this.dismiss(); return; }
    this.render();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.visible) return;
    const k = e.key.toLowerCase();
    if (k === 'x' || k === 'escape') { e.preventDefault(); this.dismiss(); }
    else if (k === ' ' || k === 'enter') { e.preventDefault(); this.next(); }
  };

  private render() {
    const s = this.step;
    this.card.innerHTML = `
      <div class="bsz-tut-step">${this.stepIdx + 1} / ${STEPS.length}</div>
      <h3>${iconSvg('info', 16)} ${s.title}</h3>
      <p>${s.body}</p>
      ${s.keys?.length ? `<div class="bsz-tut-keys">${s.keys.map(k => `<kbd>${k}</kbd>`).join('')}</div>` : ''}
      <div class="bsz-tut-actions">
        <button class="bsz-tut-skip">跳过引导</button>
        <span class="bsz-tut-hint">空格 继续 · X 跳过</span>
        <button class="bsz-tut-next">${this.stepIdx === STEPS.length - 1 ? '开始探索' : '下一步'}</button>
      </div>
    `;
    this.card.querySelector<HTMLElement>('.bsz-tut-next')!.onclick = () => this.next();
    this.card.querySelector<HTMLElement>('.bsz-tut-skip')!.onclick = () => this.dismiss();
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    this.overlay.remove();
  }
}

/** 新玩家判定：存档三项进度全空 */
export function isNewPlayer(saved: any | null): boolean {
  if (!saved) return true;
  const visited = saved.visited ?? [];
  const photos = saved.photos ?? [];
  const quests = saved.questProgress ?? {};
  return visited.length === 0 && photos.length === 0 && Object.keys(quests).length === 0;
}
