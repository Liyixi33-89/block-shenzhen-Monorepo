// 作品广场：G 键开关（异步社交——不上实时多人）
// 页签：广场（浏览/点赞/导入） / 我的发布
// 发布：把玩家 placements 打包上传；导入：他人作品复制进自己世界（付费）
import { iconSvg } from './icons';

export interface GalleryOptions {
  container: HTMLElement;
  apiBase: string;
  /** 获取当前建造物（发布用） */
  getPlacements: () => any[];
  /** 导入作品到自己世界（引擎侧复制 + 计费），返回是否成功 */
  importCreation: (placements: any[], title: string) => Promise<boolean>;
  panelGuard: () => boolean;
  toast: (msg: string) => void;
  onChanged?: () => void;
}

interface CreationBrief {
  id: string; title: string; desc: string; likes: number;
  author: string; createdAt: string; count: number;
}

const IMPORT_FEE = 200;   // 导入费：给经济一个社交出口

export class GalleryPanel {
  private opts: GalleryOptions;
  private panel!: HTMLDivElement;
  private tab: 'plaza' | 'mine' | 'publish' = 'plaza';
  private open = false;
  private list: CreationBrief[] = [];
  private sort: 'new' | 'hot' = 'new';
  private detail: { creation: any } | null = null;
  private liked = new Set<string>();   // 本会话已点赞（服务端也去重）
  private busy = false;

  constructor(opts: GalleryOptions) {
    this.opts = opts;
    this.build();
  }

  private build() {
    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel bsz-panel-gallery';
    this.panel.style.cssText = 'display:none;';
    this.opts.container.appendChild(this.panel);
  }

  get isOpen() { return this.open; }

  async toggle() {
    if (!this.open) {
      // 打开前检查其他面板占用（不包含自身）
      if (this.opts.panelGuard()) return;
      this.open = true;
    } else {
      this.open = false;
    }
    this.panel.style.display = this.open ? 'flex' : 'none';
    if (this.open) { this.detail = null; await this.loadList(); this.render(); }
  }

  private async loadList() {
    try {
      const r = await fetch(`${this.opts.apiBase}/creations/list?sort=${this.sort}`);
      const j = await r.json();
      this.list = j.creations ?? [];
    } catch { this.list = []; }
  }

  private switchTab(t: 'plaza' | 'mine' | 'publish') { this.tab = t; this.detail = null; this.render(); }

  private render() {
    const tabs = `
      <div class="bsz-shop-tabs">
        <button data-tab="plaza" class="${this.tab === 'plaza' ? 'on' : ''}">${iconSvg('location', 14)} 广场</button>
        <button data-tab="publish" class="${this.tab === 'publish' ? 'on' : ''}">${iconSvg('photo', 14)} 发布作品</button>
        <span class="bsz-shop-close">${iconSvg('exit', 14)}</span>
      </div>`;
    let body = '';
    if (this.detail) body = this.renderDetail();
    else if (this.tab === 'publish') body = this.renderPublish();
    else body = this.renderPlaza();

    this.panel.innerHTML = tabs + `<div class="bsz-shop-body">${body}</div>`;
    this.bind();
  }

  private bind() {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => {
      b.onclick = () => this.switchTab(b.dataset.tab as any);
    });
    (this.panel.querySelector('.bsz-shop-close') as HTMLElement).onclick = () => void this.toggle();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach(b => {
      b.onclick = async () => { this.sort = b.dataset.sort as any; await this.loadList(); this.render(); };
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => {
      b.onclick = () => void this.viewDetail(b.dataset.view!);
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-like]').forEach(b => {
      b.onclick = () => void this.like(b.dataset.like!);
    });
    const pubBtn = this.panel.querySelector<HTMLButtonElement>('#bsz-pub-submit');
    pubBtn && (pubBtn.onclick = () => void this.publish());
    const impBtn = this.panel.querySelector<HTMLButtonElement>('#bsz-imp-btn');
    impBtn && (impBtn.onclick = () => void this.importNow());
  }

  // ---------- 广场 ----------
  private renderPlaza(): string {
    if (!this.list.length) {
      return `<div class="bsz-gallery-tools">
          <button data-sort="new" class="${this.sort === 'new' ? 'on' : ''}">最新</button>
          <button data-sort="hot" class="${this.sort === 'hot' ? 'on' : ''}">最热</button>
        </div>
        <p class="bsz-shop-empty">还没有作品——建造点什么，然后点「发布作品」分享给大家！</p>`;
    }
    return `
      <div class="bsz-gallery-tools">
        <button data-sort="new" class="${this.sort === 'new' ? 'on' : ''}">最新</button>
        <button data-sort="hot" class="${this.sort === 'hot' ? 'on' : ''}">最热</button>
      </div>
      ${this.list.map(c => `
        <div class="bsz-gallery-card ${this.liked.has(c.id) ? 'liked' : ''}">
          <div class="bsz-gallery-main" data-view-btn data-id="${c.id}">
            <b>${esc(c.title)}</b>
            <span class="bsz-gallery-meta">${c.count} 件 · ${esc(c.author)} · ${ago(c.createdAt)}</span>
            ${c.desc ? `<p class="bsz-shop-desc">${esc(c.desc)}</p>` : ''}
          </div>
          <button data-like="${c.id}" class="bsz-gallery-like" ${this.liked.has(c.id) ? 'disabled' : ''}>
            ${iconSvg('photo', 12)} ${c.likes}
          </button>
        </div>`).join('')}`;
  }

  // ---------- 详情 ----------
  private async viewDetail(id: string) {
    try {
      const r = await fetch(`${this.opts.apiBase}/creations/${id}`);
      const j = await r.json();
      if (!j.creation) { this.opts.toast('作品不存在（可能已下架）'); return; }
      this.detail = j;
      this.render();
    } catch { this.opts.toast('网络异常'); }
  }

  private renderDetail(): string {
    const c = this.detail!.creation;
    return `
      <div class="bsz-gallery-detail">
        <button data-tab="plaza" class="bsz-gallery-back">← 返回广场</button>
        <h3>${esc(c.title)}</h3>
        <p class="bsz-gallery-meta">${c.count} 件建造物 · 作者 ${esc(c.author)} · ${c.likes} 赞</p>
        ${c.desc ? `<p class="bsz-shop-desc">${esc(c.desc)}</p>` : ''}
        <div class="bsz-gallery-preview">
          ${c.placements.slice(0, 48).map((p: any) =>
            `<span class="bsz-miniblock" title="${esc(p.element)}"></span>`).join('')}
          ${c.placements.length > 48 ? `<span class="bsz-gallery-more">+${c.placements.length - 48}</span>` : ''}
        </div>
        <p class="bsz-shop-desc">导入费用 ¥${IMPORT_FEE}，将以你当前所在位置为中心复制这 ${c.count} 件建造物。</p>
        <button id="bsz-imp-btn" class="bsz-shop-buy" ${this.busy ? 'disabled' : ''}>
          ${this.busy ? '导入中…' : `导入到我的世界（¥${IMPORT_FEE}）`}
        </button>
      </div>`;
  }

  private async importNow() {
    if (this.busy || !this.detail) return;
    this.busy = true;
    const ok = await this.opts.importCreation(this.detail.creation.placements, this.detail.creation.title);
    this.busy = false;
    if (ok) {
      this.opts.toast(`已导入「${this.detail.creation.title}」到你的世界`);
      this.opts.onChanged?.();
      await this.toggle();   // 关面板回去看
    }
  }

  // ---------- 点赞 ----------
  private async like(id: string) {
    try {
      const token = localStorage.getItem('bsz_token');
      const r = await fetch(`${this.opts.apiBase}/creations/${id}/like`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        this.liked.add(id);
        const item = this.list.find(c => c.id === id);
        if (item) item.likes++;
        this.render();
      } else if (r.status === 409) {
        this.liked.add(id);
        this.opts.toast('已经赞过了');
        this.render();
      }
    } catch { this.opts.toast('网络异常'); }
  }

  // ---------- 发布 ----------
  private renderPublish(): string {
    const placements = this.opts.getPlacements();
    return `
      <div class="bsz-gallery-publish">
        <p class="bsz-shop-desc">把你的建造作品分享到广场，其他玩家可以浏览、点赞并导入到自己世界。</p>
        <p class="bsz-gallery-meta">当前建造物：<b>${placements.length}</b> 件</p>
        <label>作品标题<input id="bsz-pub-title" maxlength="32" placeholder="例：莲花山顶小木屋" /></label>
        <label>一句话介绍<textarea id="bsz-pub-desc" maxlength="120" placeholder="灵感来源、彩蛋…（可选）"></textarea></label>
        <button id="bsz-pub-submit" class="bsz-shop-buy" ${placements.length === 0 ? 'disabled' : ''}>
          ${placements.length === 0 ? '先去建造点什么吧（B 键）' : '发布到广场'}
        </button>
      </div>`;
  }

  private async publish() {
    const title = (this.panel.querySelector('#bsz-pub-title') as HTMLInputElement)?.value.trim() ?? '';
    const desc = (this.panel.querySelector('#bsz-pub-desc') as HTMLTextAreaElement)?.value.trim() ?? '';
    if (title.length < 2) { this.opts.toast('标题至少 2 个字'); return; }
    const placements = this.opts.getPlacements();
    if (!placements.length) { this.opts.toast('当前没有建造物'); return; }
    try {
      const token = localStorage.getItem('bsz_token');
      const r = await fetch(`${this.opts.apiBase}/creations/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, desc, placements }),
      });
      const j = await r.json();
      if (j.ok) {
        this.opts.toast(`「${title}」已发布到广场`);
        this.opts.onChanged?.();
        this.tab = 'plaza';
        await this.loadList();
        this.render();
      } else {
        this.opts.toast(`发布失败：${j.error ?? '未知错误'}`);
      }
    } catch { this.opts.toast('网络异常'); }
  }

  dispose() { this.panel.remove(); }
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}
