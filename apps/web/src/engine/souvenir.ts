// 纪念品图鉴：O 键开关 → 展示已收集/未收集纪念品
// 数据驱动：Gameplay.souvenirView() / souvenirCount()
// 获取途径：到访地标赠送（landmark.souvenir）、商店/店铺购买（kind=souvenir）
import { iconSvg } from './icons';

export interface SouvenirOptions {
  container: HTMLElement;
  /** 纪念品图鉴列表（含是否已拥有） */
  view: () => { id: string; name: string; desc: string; owned: boolean }[];
  /** 图鉴进度 [已收集, 总数] */
  count: () => [number, number];
  panelGuard: () => boolean;
  toast: (msg: string) => void;
}

export class SouvenirPanel {
  private opts: SouvenirOptions;
  private panel!: HTMLDivElement;
  private open = false;

  constructor(opts: SouvenirOptions) {
    this.opts = opts;
    this.build();
  }

  private build() {
    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel bsz-panel-souvenir';
    this.panel.style.cssText = 'display:none;';
    this.opts.container.appendChild(this.panel);
  }

  get isOpen() { return this.open; }

  toggle() {
    if (!this.open) {
      if (this.opts.panelGuard()) return;
      this.open = true;
    } else {
      this.open = false;
    }
    this.panel.style.display = this.open ? 'flex' : 'none';
    if (this.open) this.render();
  }

  /** 数据变化后刷新（保持打开状态） */
  refresh() { if (this.open) this.render(); }

  private render() {
    const [got, total] = this.opts.count();
    const items = this.opts.view();
    const pct = total > 0 ? Math.round((got / total) * 100) : 0;
    const head = `
      <div class="bsz-shop-tabs">
        <span class="bsz-souv-title">${iconSvg('box', 14)} 纪念品图鉴</span>
        <span class="bsz-souv-progress">${got}/${total}（${pct}%）</span>
        <span class="bsz-shop-close">${iconSvg('exit', 14)}</span>
      </div>
      <div class="bsz-souv-bar"><div class="bsz-souv-bar-fill" style="width:${pct}%"></div></div>
      <p class="bsz-souv-hint">到访地标、光顾商店或店铺小摊，即可收藏各色纪念品</p>`;

    const grid = items.map(it => `
      <div class="bsz-souv-card ${it.owned ? 'owned' : 'locked'}">
        <div class="bsz-souv-icon">${it.owned ? iconSvg('box', 22) : '?'}</div>
        <b>${it.owned ? it.name : '未收集'}</b>
        <p>${it.owned ? it.desc : '仍待探索…'}</p>
      </div>`).join('');

    this.panel.innerHTML = head + `<div class="bsz-souv-grid">${grid}</div>`;

    (this.panel.querySelector('.bsz-shop-close') as HTMLElement).onclick = () => this.toggle();
  }

  dispose() { this.panel.remove(); }
}