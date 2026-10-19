// 商店与投资面板：S 键开关 → 「商店」/「城市投资」双页签
// 数据驱动：scene.shopItems / scene.invest；结算走 gameplay.buy/invest
import type { Scene } from '@block-sz/schema';
import { iconSvg } from './icons';

export interface ShopOptions {
  container: HTMLElement;
  data: Scene;
  gameplay: {
    buy(id: string): boolean;
    invest(id: string): boolean;
    shopView(): any[];
    investView(): any[];
    investIncomePerHour(): number;
    money(): number;
  };
  panelGuard: () => boolean;
  toast: (msg: string) => void;
  /** 购买/投资后回调（存档 + HUD 刷新） */
  onChanged?: () => void;
}

const KIND_LABELS: Record<string, string> = {
  consumable: '消耗', deco: '装饰', material: '材料', camera: '相机',
};

export class ShopPanel {
  private opts: ShopOptions;
  private panel!: HTMLDivElement;
  private tab: 'shop' | 'invest' = 'shop';
  private open = false;

  constructor(opts: ShopOptions) {
    this.opts = opts;
    this.build();
  }

  private build() {
    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel bsz-panel-shop';
    this.panel.style.cssText = 'display:none;';
    this.opts.container.appendChild(this.panel);
  }

  toggle() {
    if (!this.open) {
      // 打开前检查其他面板占用（不包含自身）
      if (this.opts.panelGuard()) return;
      this.open = true;
    } else {
      this.open = false;
    }
    this.panel.style.display = this.open ? 'flex' : 'none';
    if (this.open) this.render();
  }

  get isOpen() { return this.open; }

  /** 数据变化后刷新（保持打开状态） */
  refresh() { if (this.open) this.render(); }

  private switchTab(t: 'shop' | 'invest') { this.tab = t; this.render(); }

  private render() {
    const money = this.opts.gameplay.money();
    const tabs = `
      <div class="bsz-shop-tabs">
        <button data-tab="shop" class="${this.tab === 'shop' ? 'on' : ''}">${iconSvg('money', 14)} 商店</button>
        <button data-tab="invest" class="${this.tab === 'invest' ? 'on' : ''}">${iconSvg('location', 14)} 城市投资</button>
        <span class="bsz-shop-wallet">¥ ${money}</span>
        <span class="bsz-shop-close">${iconSvg('exit', 14)}</span>
      </div>`;

    let body = '';
    if (this.tab === 'shop') body = this.renderShop();
    else body = this.renderInvest();

    this.panel.innerHTML = tabs + `<div class="bsz-shop-body">${body}</div>`;

    // 事件绑定
    this.panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => {
      b.onclick = () => this.switchTab(b.dataset.tab as any);
    });
    (this.panel.querySelector('.bsz-shop-close') as HTMLElement).onclick = () => this.toggle();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b => {
      b.onclick = () => {
        if (this.opts.gameplay.buy(b.dataset.buy!)) {
          const item = this.opts.gameplay.shopView().find(i => i.id === b.dataset.buy);
          this.opts.toast(`已购买「${item?.name ?? b.dataset.buy}」`);
          this.opts.onChanged?.();
          this.render();
        }
      };
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-invest]').forEach(b => {
      b.onclick = () => {
        if (this.opts.gameplay.invest(b.dataset.invest!)) {
          this.opts.onChanged?.();
          this.render();
        }
      };
    });
  }

  private renderShop(): string {
    const items = this.opts.gameplay.shopView();
    if (!items.length) return '<p class="bsz-shop-empty">商店筹备中…</p>';
    return items.map(i => `
      <div class="bsz-shop-item">
        <div class="bsz-shop-item-main">
          <b>${i.name}</b>
          <span class="bsz-shop-kind">${KIND_LABELS[i.kind] ?? i.kind}</span>
          <p class="bsz-shop-desc">${i.desc}</p>
          ${i.bought > 0 ? `<span class="bsz-shop-bought">已购 ${i.bought} 次</span>` : ''}
        </div>
        <button data-buy="${i.id}" class="bsz-shop-buy" ${this.opts.gameplay.money() < i.price ? 'disabled' : ''}>
          ¥ ${i.price}
        </button>
      </div>`).join('');
  }

  private renderInvest(): string {
    const views = this.opts.gameplay.investView();
    const perHour = this.opts.gameplay.investIncomePerHour();
    if (!this.opts.data.invest) return '<p class="bsz-shop-empty">城市投资功能未开启</p>';
    const head = `
      <div class="bsz-invest-head">
        总被动收益：<b>¥${perHour}/小时</b>
        <span class="bsz-invest-tip">到访过的地标可投资，每级提升被动收入；离线期间持续结算</span>
      </div>`;
    if (!views.length) return head + '<p class="bsz-shop-empty">还没有到访任何地标——先去探索深圳吧！</p>';
    return head + views.map(v => `
      <div class="bsz-shop-item">
        <div class="bsz-shop-item-main">
          <b>${v.name}</b>
          <span class="bsz-shop-kind">Lv.${v.level}${v.maxed ? ' · MAX' : ''}</span>
          <p class="bsz-shop-desc">${v.maxed
            ? `已达最高等级，收益 ¥${v.incomePerHour}/小时`
            : `当前收益 ¥${v.incomePerHour}/小时 → 下一级 ¥${v.incomePerHour + (this.opts.data.invest?.incomePerHour ?? 0)}/小时`}</p>
        </div>
        ${v.maxed
          ? '<button class="bsz-shop-buy" disabled>已满级</button>'
          : `<button data-invest="${v.id}" class="bsz-shop-buy" ${this.opts.gameplay.money() < v.nextCost ? 'disabled' : ''}>投资 ¥${v.nextCost}</button>`}
      </div>`).join('');
  }

  dispose() { this.panel.remove(); }
}
