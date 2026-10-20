// NPC 系统：场景包数据驱动 → 世界摆位渲染（方块小人 + 头顶名牌）→ E 键对话面板 → 效果结算
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene, Npc, DialogueNode, NpcJobConfig } from '@block-sz/schema';
import { iconSvg } from './icons';
import type { WeatherKind } from './weather';

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
  /** 开始一段对话时回调（每日 dailyTalk 上报） */
  onTalk?: () => void;
  /** 动态随机 NPC 数量（0 关闭；缺省读 scene.config.env.npc.dynamicCount，兜底 16） */
  dynamicCount?: number;
  /** 是否夜晚（动态 NPC 夜晚对白） */
  isNight?: () => boolean;
  /** 当前天气（动态 NPC 天气对白） */
  weatherKind?: () => WeatherKind;
  /** 店铺购买：扣钱并给物品（返回是否成功），供店铺 NPC / 移动小摊用 */
  buy?: (itemId: string) => boolean;
}

const TALK_RADIUS = 26;

/** 世界中的 NPC 实体（组：身体 + 头 + 名牌 Sprite） */
interface NpcEntity {
  npc: Npc;
  group: THREE.Group;
  x: number;
  z: number;
  /** 是否为动态随机 NPC（含职业对白池，入口台词随天气/夜晚变化） */
  dynamic?: boolean;
  job?: JobProfile;
}

// ---------------------------------------------------------------------------
// 动态随机 NPC（参考站「方块羊城」特性）：职业加权 + 随机姓氏 + 职业专属对白
// ---------------------------------------------------------------------------

/** 随机姓氏池（广府常用；scene.config.env.npc.surnames 可覆盖） */
const DEFAULT_SURNAMES = ['陈', '李', '黄', '梁', '何', '张', '林', '罗', '郭', '冯', '麦', '邓', '谭', '吴', '杨'];

interface JobProfile {
  /** 称呼后缀（女士用「小姐/女士」，男士用「先生」等） */
  honorific: string;
  /** 躯干主色 */
  body: number;
  /** 帽子颜色 */
  hat: number;
  /** 正常对白池 */
  lines: string[];
  /** 雨天对白池（缺省沿用 lines） */
  rain?: string[];
  /** 夜晚对白池（缺省沿用 lines） */
  night?: string[];
  /** 偶发赠予金额（0 表示不给） */
  tip?: number;
  /** 职业权重（随机加权） */
  weight: number;
  /** 移动小摊：随机挂载的可售商品 id 池（缺省无摊） */
  stall?: string[];
}

/** 职业池（加权）：上班族/学生/老人/游客/小孩/街坊 —— scene.config.env.npc.jobs 可覆盖 */
const DEFAULT_JOBS: JobProfile[] = [
  {
    honorific: '先生', body: 0x274a6e, hat: 0x3a5a8a, weight: 4,
    lines: ['赶着去上班，地铁人真多。', '今天又加班，改完这个需求就好。', '早啊，吃过肠粉了吗？'],
    rain: ['落雨喇，快啲避避雨先。', '湿晒啦，带把遮啦。'],
    night: ['终于下班了，走，去大排档食宵夜。', '夜了，回去还要赶明天的报告。'],
  },
  {
    honorific: '同学', body: 0x2e7d5b, hat: 0x3aa67a, weight: 3,
    lines: ['放学咯，去操场踢波！', '这周末的测验还没复习，惨。', '你也是深大的吗？'],
    rain: ['下雨天，体育课又泡汤了。', '落雨，快跑回课室！'],
    night: ['晚自习才结束，累死了。', '晚上在图书馆温书，你要一起吗？'],
  },
  {
    honorific: '伯', body: 0x5a5048, hat: 0x8a7460, weight: 3,
    lines: ['晨运完，去茶楼叹早茶。', '一盅两件，快活过神仙。', '年轻人，少睇手机，多行下街。'],
    rain: ['落雨，今日唔去公园晨运咯。', '下雨天留客天，入来饮杯茶。'],
    night: ['夜晚风凉，早啲返屋企。', '散步去，睇下夜景都几靓。'],
    tip: 10,
  },
  {
    honorific: '游客', body: 0x7a4a2e, hat: 0xb07040, weight: 3,
    lines: ['请问深圳湾怎么走？', '这里的夜景真壮观！', '我是从广州过来玩的。'],
    rain: ['哎，下雨了，观景台还开吗？', '这雨下得真不是时候。'],
    night: ['晚上的灯光秀真震撼！', '夜景太美了，多拍几张。'],
  },
  {
    honorific: '仔', body: 0xe08a3a, hat: 0xf0a860, weight: 2,
    lines: ['妈妈，我想吃雪糕！', '看，那个塔好高呀！', '我们来玩捉迷藏吧！'],
    rain: ['下雨了，我的气球飞走啦！', '踩水坑最好玩啦！'],
    night: ['天黑了，我要回家啦。', '夜晚的灯像星星一样亮！'],
  },
  {
    honorific: '师傅', body: 0x3a6e8a, hat: 0x4a7a6a, weight: 3,
    lines: ['帮衬下啦，今日新鲜出炉。', '这云吞面祖传三代了。', '街坊邻里，有咩帮到手？'],
    rain: ['落雨路滑，行慢啲呀。', '雨天生意淡，坐低饮杯茶。'],
    night: ['收工啦，落闸。', '夜晚做埋最后一批就收铺。'],
    tip: 20,
    // 移动小摊：随机售广府小吃
    stall: ['food_cheong_fun', 'food_wonton', 'food_herbal_tea', 'food_char_siu', 'food_roasted_goose'],
  },
  {
    honorific: '姐', body: 0x7a5a8a, hat: 0xa07aa0, weight: 2,
    lines: ['来一碗热腾腾的艇仔粥吧。', '新鲜出炉的姜撞奶，试试？', '凉茶去火，饮杯啦。'],
    rain: ['下雨天，喝碗热粥暖身。', '落雨，摊档要收啦。'],
    night: ['收摊咯，明天再来。', '夜晚宵夜，来份肠粉？'],
    stall: ['food_congee', 'food_ginger_milk', 'food_herbal_tea', 'food_cheong_fun'],
  },
];

/** 动态 NPC 在城市里的游走范围（核心城区，罗湖/福田一带；config 可覆盖） */
const DEFAULT_DYN_RANGE = { xMin: -700, xMax: 1600, zMin: -700, zMax: 1100 };
/** 动态 NPC 之间的最小间距 */
const DYN_MIN_DIST = 34;

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
  /** 动态随机 NPC 配置（scene.config.env.npc 覆盖内置默认） */
  private dynRange = { xMin: 0, xMax: 0, zMin: 0, zMax: 0 };
  private surnames: string[] = DEFAULT_SURNAMES;
  private jobs: JobProfile[] = DEFAULT_JOBS;

  constructor(opts: NpcOptions) {
    this.opts = opts;

    // ---- 动态随机 NPC：场景配置优先，内置常量兜底 ----
    const cfg = (opts.data.config?.env as any)?.npc;
    const cfgRange = cfg?.range;
    this.dynRange = {
      xMin: cfgRange?.xMin ?? DEFAULT_DYN_RANGE.xMin,
      xMax: cfgRange?.xMax ?? DEFAULT_DYN_RANGE.xMax,
      zMin: cfgRange?.zMin ?? DEFAULT_DYN_RANGE.zMin,
      zMax: cfgRange?.zMax ?? DEFAULT_DYN_RANGE.zMax,
    };
    if (Array.isArray(cfg?.surnames) && cfg.surnames.length) this.surnames = cfg.surnames;
    if (Array.isArray(cfg?.jobs) && cfg.jobs.length) {
      // 配置职业覆盖：字段缺省沿用内置语义（rain/night 空池 → 运行时回退 lines）
      this.jobs = cfg.jobs.map((j: NpcJobConfig) => ({
        honorific: j.honorific,
        body: j.body,
        hat: j.hat,
        weight: j.weight ?? 1,
        lines: j.lines?.length ? j.lines : ['你好呀。'],
        rain: j.rain?.length ? j.rain : undefined,
        night: j.night?.length ? j.night : undefined,
        tip: j.tip ?? 0,
        stall: j.stall?.length ? j.stall : undefined,
      }));
    }

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

    // 动态随机 NPC（城市生气）
    // 动态随机 NPC（城市生气）：数量 = 显式传参 > 场景配置 > 内置 16
    const cfgN = (this.opts.data.config?.env as any)?.npc?.dynamicCount;
    const dyn = this.opts.dynamicCount ?? (typeof cfgN === 'number' ? cfgN : 16);
    if (dyn > 0) this.buildDynamic(dyn);
  }

  /** 构建方块小人（身体 + 头 + 帽子），供静态/动态 NPC 共用 */
  private makeBody(bodyColor: number, hatColor: number): THREE.Group {
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 4), mat(bodyColor));
    body.position.y = 4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), mat(0xffd9a0));
    head.position.y = 10.5;
    const hat = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 6), mat(hatColor));
    hat.position.y = 13.3;
    body.castShadow = true;
    head.castShadow = true;
    hat.castShadow = true;
    g.add(body, head, hat);
    return g;
  }

  /** 生成动态随机 NPC：随机职业（加权）/姓氏/位置，带职业专属 + 天气/夜晚对白 */
  private buildDynamic(count: number) {
    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const JOBS = this.jobs;
    const SURNAMES = this.surnames;
    // 职业加权抽样
    const pickJob = (): JobProfile => {
      const total = JOBS.reduce((s, j) => s + j.weight, 0);
      let r = Math.random() * total;
      for (const j of JOBS) { r -= j.weight; if (r <= 0) return j; }
      return JOBS[0];
    };
    const rndName = (job: JobProfile): string => {
      const surname = pick(SURNAMES);
      // 女性称谓偶发（游客/上班族/学生）
      const femaleHonors = ['小姐', '女士'];
      const honor = (job === JOBS[0] || job === JOBS[1] || job === JOBS[3]) && Math.random() < 0.45
        ? pick(femaleHonors)
        : job.honorific;
      return surname + honor;
    };
    // 随机位置：核心城区内，且与已生成实体保持最小间距
    const randPos = (): { x: number; z: number } => {
      for (let tries = 0; tries < 40; tries++) {
        const x = this.dynRange.xMin + Math.random() * (this.dynRange.xMax - this.dynRange.xMin);
        const z = this.dynRange.zMin + Math.random() * (this.dynRange.zMax - this.dynRange.zMin);
        const ok = this.entities.every(e => Math.hypot(e.x - x, e.z - z) >= DYN_MIN_DIST);
        if (ok) return { x, z };
      }
      return { x: this.dynRange.xMin, z: this.dynRange.zMin };
    };

    // 场景 shopItems（供小摊引用真实价格/名称）
    const allItems = this.opts.data.shopItems ?? [];

    for (let i = 0; i < count; i++) {
      const job = pickJob();
      const name = rndName(job);
      const { x, z } = randPos();
      const group = this.makeBody(job.body, job.hat);
      group.add(this.nameSprite(name));
      group.position.set(x, 0, z);
      this.opts.scene3.add(group);

      // 移动小摊：有 stall 且场景有对应商品时，随机挂 1-2 种
      let shopItems: Npc['shopItems'] = undefined;
      const stalls = (job.stall ?? []).filter(id => allItems.some(it => it.id === id));
      if (stalls.length) {
        const k = 1 + Math.floor(Math.random() * Math.min(2, stalls.length));
        const chosen = [...stalls].sort(() => Math.random() - 0.5).slice(0, k);
        shopItems = chosen.map(id => {
          const it = allItems.find(s => s.id === id)!;
          return { id: it.id, name: it.name, price: it.price };
        });
      }

      // 动态对话树：entry（条件对白）+ 两个固定回复；有小摊则加「睇下有咩卖」
      const choices: DialogueNode['choices'] = [
        { text: '问路', next: 'reply1' },
        { text: '闲聊', next: 'reply2' },
      ];
      if (shopItems?.length) choices.unshift({ text: '睇下有咩卖', next: 'stall' });
      const dialogue: DialogueNode[] = [
        { id: 'entry', text: job.lines[0], choices },
        { id: 'reply1', text: '沿着这条街一直走就到了，小心看路。', choices },
        { id: 'reply2', text: '哈哈，今日天气唔错，散散步几好。', choices },
        ...(shopItems?.length ? [{ id: 'stall', text: shopItems.map(s => `${s.name} ¥${s.price}`).join('，'), choices: [{ text: '好，我买', next: 'buy' }, { text: '下次先', next: 'reply2' }] } as DialogueNode] : []),
      ];
      const npc: Npc = {
        id: `dyn_${i}`, name, dialogue, enabled: true,
        latlng: { lat: 0, lng: 0 },
        shopItems,
      };
      this.entities.push({ npc, group, x, z, dynamic: true, job });
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
    this.opts.onTalk?.();
    const entry = npc.dialogue[0];
    // 动态 NPC：入口台词随天气/夜晚动态选择（职业专属对白）
    const ent = this.entities.find(e => e.npc.id === npc.id);
    if (ent?.dynamic && ent.job) {
      const job = ent.job;
      const weather = this.opts.weatherKind?.();
      const isNight = this.opts.isNight?.() ?? false;
      let pool = job.lines;
      if (isNight && job.night?.length) pool = job.night;
      else if ((weather === 'rain' || weather === 'snow') && job.rain?.length) pool = job.rain;
      entry.text = pool[Math.floor(Math.random() * pool.length)];
      // 闲聊回复也贴合语境
      const reply2 = npc.dialogue.find(d => d.id === 'reply2');
      if (reply2) {
        if (isNight) reply2.text = '夜啦，睇完夜景早啲返屋企。';
        else if (weather === 'rain') reply2.text = '落雨路滑，行慢啲，小心感冒。';
        else if (weather === 'snow') reply2.text = '落雪啦！深圳都少见，多影几张相。';
        else reply2.text = '哈哈，今日天气唔错，散散步几好。';
      }
    }
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

    // ---- 店铺售卖 ----
    // 动态小摊「buy」节点：逐商品购买
    if (node.id === 'buy' && npc.shopItems?.length) {
      this.renderBuyButtons(npc);
    }
    // 静态店铺 NPC 对话入口：直接展示店铺售卖区（商品列表 + 购买）
    else if (node.id === 'entry' && npc.shopItems?.length) {
      this.renderShopShelf(npc);
    }
  }

  /** 渲染动态小摊「buy」节点的逐商品购买按钮 */
  private renderBuyButtons(npc: Npc) {
    for (const it of npc.shopItems!) {
      const btn = document.createElement('button');
      btn.className = 'bsz-btn bsz-btn-accent';
      btn.style.cssText += 'display:block; width:100%; margin:6px 0; text-align:left;';
      btn.textContent = `▸ 买${it.name}（¥${it.price}）`;
      btn.onclick = () => this.buyItem(npc, it.id, it.name);
      this.panelBody.appendChild(btn);
    }
  }

  /** 渲染静态店铺 NPC 的货架（对话面板底部） */
  private renderShopShelf(npc: Npc) {
    const shelf = document.createElement('div');
    shelf.style.cssText = 'margin-top:8px; border-top:1px dashed rgba(255,233,168,0.35); padding-top:8px;';
    const head = document.createElement('div');
    head.style.cssText = 'color:#ffe9a8; font-size:13px; margin-bottom:6px;';
    head.textContent = `${npc.shopGreet ?? '店铺货架'}`;
    shelf.appendChild(head);
    for (const it of npc.shopItems!) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; margin:4px 0;';
      const name = document.createElement('span');
      name.textContent = it.name;
      name.style.cssText = 'color:#e8f2ff; font-size:13px;';
      const price = document.createElement('button');
      price.className = 'bsz-btn bsz-btn-accent';
      price.textContent = `¥${it.price}`;
      price.onclick = () => this.buyItem(npc, it.id, it.name);
      row.appendChild(name);
      row.appendChild(price);
      shelf.appendChild(row);
    }
    this.panelBody.appendChild(shelf);
  }

  /** 购买：调用引擎 buy 回调（Gameplay.buy 处理扣钱/给物品/美食计数） */
  private buyItem(npc: Npc, itemId: string, itemName: string) {
    const ok = this.opts.buy?.(itemId) ?? false;
    if (ok) this.opts.toast(`已购得「${itemName}」`);
    // 关闭店铺对话，让 toast 可见
    this.closePanel();
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
