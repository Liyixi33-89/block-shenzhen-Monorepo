// 玩法引擎：金钱 / 背包 / 任务进度 / 到访图鉴 / 事件
// 【domain 业务层】纯逻辑：无 DOM、无 three、无 fetch
// 数据形状对齐 @block-sz/schema 的 PlayerSave
import type { Scene, Quest } from '@block-sz/schema';
import { proj } from '@block-sz/shared';
import type { GameplayEvent } from './events';
export type { GameplayEvent } from './events';

export interface GameplaySnapshot {
  money: number;
  visited: string[];
  photos: string[];
  questProgress: Record<string, { done: boolean; progress: number; doneAt?: string }>;
  inventory: Record<string, number>;
  ascensionPoints: number;
  unlockedTeleports: string[];
  /** 建造放置物（与 PlayerSave.placements 同构） */
  placements: { n: number; element: string; x: number; y: number; z: number; rot: number }[];
  /** P2 经济：商店/投资/效果 */
  shopBought: Record<string, number>;
  cameraSkins: string[];
  cameraSkin: string;
  investments: Record<string, number>;
  investSettledAt: string;
  activeEffects: Record<string, number>;
  /** 每日任务计数器：daily:xxx 键（去前缀）-> 当日累计值 */
  dailyCounters: Record<string, number>;
  /** 每日计数器归属日期（YYYY-MM-DD，跨天清零） */
  dailyStamp: string;
  /** 已收集纪念品 id（纪念品图鉴） */
  souvenirs: string[];
}

/** photoSet 冒号编码解析（P2 抽取兼容）：
 *  photoSet:photoSet,a,b,c → 前缀标记 + id 列表（忽略首个 photoSet 标记）
 *  photoSet:multi,photo,dameisha,cruise → 简化：只取地名 id
 */
function parsePhotoSet(target: string): string[] {
  if (!target.startsWith('photoSet:')) return [];
  let ids = target.slice(9).split(',').filter(Boolean);
  // 丢弃前缀标记词（photoSet/multi/discoverSet/photo 等）与 cruise/foodCount/cultureCount 等动词占位
  ids = ids.filter(id => !['photoSet', 'multi', 'discoverSet', 'photo', 'cruise', 'foodCount', 'cultureCount'].includes(id));
  return ids;
}

export class Gameplay {
  scene: Scene;
  state: GameplaySnapshot;
  private listeners = new Set<(e: GameplayEvent) => void>();
  private walkAcc = 0;
  /** 地标投影坐标缓存（probe 每帧调用；静态坐标只需算一次） */
  private lmProj: Array<{ x: number; z: number }> | null = null;

  constructor(scene: Scene, init?: Partial<GameplaySnapshot>) {
    this.scene = scene;
    this.state = {
      money: 500,
      visited: [],
      photos: [],
      questProgress: {},
      inventory: {},
      ascensionPoints: 0,
      unlockedTeleports: [],
      placements: [],
      shopBought: {},
      cameraSkins: [],
      cameraSkin: '',
      investments: {},
      investSettledAt: '',
      activeEffects: {},
      dailyCounters: {},
      dailyStamp: '',
      souvenirs: [],
      ...init,
    };
    // 构造期先标记一次「解锁提示」，避免回档玩家开局被 18 条解锁提示刷屏
    // （回档后已就绪的任务视为已知；后续新就绪的才会实时提示）
    for (const q of this.scene.quests) {
      if (q.enabled !== false && this.questsReady(q)) this.unlockedNotified.add(q.id);
    }
    // 每日任务跨天刷新：进入新的一天则清零当日计数器 + 重置每日任务进度
    this.rollDaily();
  }

  on(fn: (e: GameplayEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(e: GameplayEvent) { this.listeners.forEach(f => f(e)); }

  // ---------- 到访 ----------
  visit(landmarkId: string) {
    if (this.state.visited.includes(landmarkId)) return false;
    this.state.visited.push(landmarkId);
    this.bumpDaily('dailyDistricts', 1);   // 每日「探索新区」
    // 文化图鉴：到访文化地标即体验一项岭南文化（首次到访触发）
    const lm = this.scene.landmarks.find(l => l.id === landmarkId);
    if (lm?.tags?.includes('culture')) {
      this.noteCulture();
      this.emit({ type: 'info', payload: { msg: `体验岭南文化：${lm.name}` } });
    }
    // 纪念品：到访特定地标赠送对应纪念品（区徽章/纪念章等）
    if (lm?.souvenir) {
      this.noteSouvenir(lm.souvenir);
    }
    this.emit({ type: 'visit', payload: landmarkId });
    this.checkQuests({ visited: true, id: landmarkId });
    return true;
  }

  // ---------- 拍照 ----------
  photo(landmarkId: string, opts?: { night?: boolean }) {
    const first = !this.state.photos.includes(landmarkId);
    if (first) {
      this.state.photos.push(landmarkId);
      this.state.ascensionPoints += 10;
      this.emit({ type: 'photo', payload: landmarkId });
    }
    // 每日「今天拍摄 N 个建筑」
    this.bumpDaily('dailyPhotos', 1);
    // 每日「夜晚拍摄一张照片」（夜晚模式）
    if (opts?.night) this.bumpDaily('nightPhoto', 1);
    // 摄影季票（photo_bonus）：奖励翻倍
    const bonus = this.hasEffect('photo_bonus') ? 2 : 1;
    const base = (first ? 50 : 5) * bonus;
    this.addMoney(base, first ? `拍摄 ${this.lmName(landmarkId)}${bonus > 1 ? '（季票×2）' : ''}` : '随手拍');
    this.checkQuests({ photo: true, id: landmarkId });
    return first;
  }

  lmName(id: string) {
    return this.scene.landmarks.find(l => l.id === id)?.name ?? id;
  }

  // ---------- 金钱 / 物品 ----------
  addMoney(n: number, reason = '') {
    this.state.money = Math.max(0, this.state.money + n);
    this.emit({ type: 'money', payload: { n, reason, total: this.state.money } });
  }

  addItem(id: string, n = 1) {
    this.state.inventory[id] = (this.state.inventory[id] ?? 0) + n;
    this.emit({ type: 'item', payload: { id, n } });
  }

  spend(n: number): boolean {
    if (this.state.money < n) return false;
    this.addMoney(-n, '消费');
    return true;
  }

  // ---------- 建造 / 传送 ----------
  notePlacement(p: { n: number; element: string; x: number; y: number; z: number; rot: number }) {
    this.state.placements.push(p);
    this.emit({ type: 'build', payload: p });
  }

  removePlacement(n: number) {
    const i = this.state.placements.findIndex(p => p.n === n);
    if (i >= 0) this.state.placements.splice(i, 1);
  }

  unlockTeleport(tpId: string) {
    if (!this.state.unlockedTeleports.includes(tpId)) this.state.unlockedTeleports.push(tpId);
  }

  // ---------- 行走 ----------
  walk(meters: number) {
    this.walkAcc += meters;
    if (this.walkAcc >= 50) {
      this.bumpDaily('walk', 1);   // 每日「步行」（每 50 单位记一程）
      this.emit({ type: 'walk', payload: this.walkAcc });
      this.checkQuests({ walked: this.walkAcc });
      this.walkAcc = 0;
    }
  }

  /** 当前到访/拍摄计数（供 daily 类条件） */
  countOf(kind: 'photo' | 'visit') {
    return kind === 'photo' ? this.state.photos.length : this.state.visited.length;
  }

  /** 已体验的文化地标数（q_culture 文化图鉴进度） */
  cultureCount(): number {
    const cult = new Set(this.scene.landmarks.filter(l => l.tags?.includes('culture')).map(l => l.id));
    return this.state.visited.filter(id => cult.has(id)).length;
  }

  // ==================== 每日计数器（每日任务驱动源） ====================

  /** 当前日期（YYYY-MM-DD，本地时区） */
  private today(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /** 跨天检查：日期变更则清零当日计数器并重置每日任务进度 */
  private rollDaily() {
    const t = this.today();
    if (this.state.dailyStamp === t) return;
    // 记录重置前的完成状态，用于提示
    const wasDone = new Set(
      this.scene.quests
        .filter(q => q.cycle === 'daily' && this.state.questProgress[q.id]?.done)
        .map(q => q.id),
    );
    this.state.dailyStamp = t;
    this.state.dailyCounters = {};
    // 重置每日任务进度（已完成的每日任务清零，允许当日重新完成）
    for (const q of this.scene.quests) {
      if (q.cycle !== 'daily') continue;
      delete this.state.questProgress[q.id];
      this.unlockedNotified.delete(q.id);
    }
    if (wasDone.size) this.emit({ type: 'info', payload: { msg: '新的一天，每日任务已刷新' } });
  }

  /** 每日计数器累加（键为 daily:xxx 去前缀后的名字） */
  bumpDaily(key: string, n = 1) {
    this.rollDaily();   // 确保日期为当天
    this.state.dailyCounters[key] = (this.state.dailyCounters[key] ?? 0) + n;
    this.checkQuests({});
  }

  /** 玩法上报：与 NPC 完成一次对话（每日 dailyTalk） */
  noteTalk() { this.bumpDaily('dailyTalk', 1); }

  /** 玩法上报：乘坐交通工具到站（kind: metro/bus/boat/cable → 每日 bus/metro 等） */
  noteRide(kind: string) {
    const key = kind === 'metro' ? 'metro' : kind === 'bus' ? 'bus' : kind === 'boat' ? 'boat' : kind === 'cable' ? 'cable' : '';
    if (key) this.bumpDaily(key, 1);
  }

  /** 玩法上报：品尝一种美食（每日 food，按种类去重计数由调用方保证） */
  noteFood() { this.bumpDaily('food', 1); }

  /** 玩法上报：拍一张自拍（每日 selfie） */
  noteSelfie() { this.bumpDaily('selfie', 1); }

  /** 玩法上报：体验一项岭南文化（每日 culture） */
  noteCulture() { this.bumpDaily('culture', 1); }

  /** 收集一件纪念品（到访地标领取/任务奖励；去重入图鉴） */
  noteSouvenir(id: string): boolean {
    if (this.state.souvenirs.includes(id)) return false;
    this.state.souvenirs.push(id);
    const it = this.scene.shopItems.find(s => s.id === id);
    this.emit({ type: 'info', payload: { msg: `获得纪念品：${it?.name ?? id}` } });
    return true;
  }

  /** 纪念品图鉴进度：[已收集, 总数] */
  souvenirCount(): [number, number] {
    const total = (this.scene.shopItems ?? []).filter(s => s.kind === 'souvenir').length;
    return [this.state.souvenirs.length, total];
  }

  /** 纪念品图鉴列表视图：全部纪念品（含未收集），标记是否已拥有 */
  souvenirView() {
    return (this.scene.shopItems ?? [])
      .filter(s => s.kind === 'souvenir')
      .map(s => ({ id: s.id, name: s.name, desc: s.desc, price: s.price, owned: this.state.souvenirs.includes(s.id) }));
  }

  /** 每日任务条件求值辅助：读当日计数（daily:xxx 键） */
  private dailyCount(key: string): number {
    return this.state.dailyCounters[key] ?? 0;
  }

  // ---------- 任务 ----------
  /** 条件评估：返回 [达成值, 目标值] */
  private evalCond(q: Quest, ctx: { visited?: boolean; photo?: boolean; id?: string; walked?: number }): [number, number] {
    const c = q.cond as any;
    switch (c.type) {
      case 'photo':
        return [this.state.photos.includes(c.target) ? 1 : 0, 1];
      case 'visit':
        return [this.state.visited.includes(c.target) ? 1 : 0, 1];
      case 'collect': {
        // daily:xxx 编码（P2 兼容）：统一读当日计数器
        const item = c.item as string;
        if (item.startsWith('daily:')) {
          const key = item.slice(6);
          const n = c.n ?? 1;
          // 兼容旧数据 daily:photo → 历史拍摄总数；其余映射当日计数器
          if (key === 'photo') return [Math.min(this.state.photos.length, n), n];
          return [Math.min(this.dailyCount(key), n), n];
        }
        return [(this.state.inventory[item] ?? 0) >= (c.n ?? 1) ? 1 : 0, 1];
      }
      case 'walk':
        return [Math.min(this.state.questProgress[q.id]?.progress ?? 0, c.meters), c.meters];
      case 'interact': {
        // photoSet:a,b,c —— 拍齐集合内全部
        const ids = parsePhotoSet(c.target);
        // 文化图鉴：photoSet:cultureCount 统计已体验文化地标数
        if (ids.length === 0 && /cultureCount/.test(c.target)) {
          return [this.cultureCount(), 6];
        }
        const got = ids.filter(id => this.state.photos.includes(id)).length;
        return [got, ids.length];
      }
      default:
        return [0, 1];
    }
  }

  /** 已提示过解锁的任务（存档无关的会话级去重） */
  private unlockedNotified = new Set<string>();

  /** 前置任务是否全部完成（任务解锁判定） */
  private questsReady(q: Quest): boolean {
    return (q.requires ?? []).every(r => this.state.questProgress[r]?.done);
  }

  private checkQuests(ctx: { visited?: boolean; photo?: boolean; id?: string; walked?: number }) {
    for (const q of this.scene.quests) {
      if (q.enabled === false) continue;
      const prog = this.state.questProgress[q.id] ?? { done: false, progress: 0 };
      if (prog.done) continue;
      // 前置未达成：不计数不发进度（首次就绪时才提示解锁）
      if (!this.questsReady(q)) continue;
      if (!this.unlockedNotified.has(q.id)) {
        this.unlockedNotified.add(q.id);
        this.emit({ type: 'quest-unlocked', payload: q });
      }
      const [cur, target] = this.evalCond(q, ctx);
      const prev = prog.progress;
      prog.progress = cur;
      if (cur >= target && target > 0) {
        prog.done = true;
        prog.doneAt = new Date().toISOString();
        // 发奖励
        this.addMoney(q.reward.money, `任务「${q.title}」`);
        for (const it of q.reward.items ?? []) this.addItem(it.id, it.n);
        this.state.ascensionPoints += 20;
        this.state.questProgress[q.id] = prog;
        this.emit({ type: 'quest-done', payload: q });
        // 完成后续任务可能因此解锁，立即重查一遍
        this.checkQuests(ctx);
        return;
      } else {
        this.state.questProgress[q.id] = prog;
        // 进度有增长时发进度事件（UI 用于「即将完成」提醒）
        if (cur > prev) {
          this.emit({ type: 'quest-progress', payload: { quest: q, cur, target, prev } });
        }
      }
    }
  }

  /** 任务列表视图（给 UI） */
  questView() {
    return this.scene.quests.map(q => {
      const prog = this.state.questProgress[q.id] ?? { done: false, progress: 0 };
      const [cur, target] = this.evalCond(q, {});
      const unlocked = this.questsReady(q);
      return { ...q, done: prog.done, cur: prog.done ? target : cur, target, unlocked };
    });
  }

  /** 距地标距离与到访判定（引擎每帧喂玩家坐标） */
  probe(pos: { x: number; z: number }) {
    const nearby: Array<{ id: string; name: string; dist: number }> = [];
    // 静态投影坐标缓存（每帧调用，避免重复 proj 数学计算）
    if (!this.lmProj) {
      this.lmProj = this.scene.landmarks.map(l => {
        const p = proj(l.latlng.lat, l.latlng.lng);
        return { x: p.x, z: p.z };
      });
    }
    for (let i = 0; i < this.scene.landmarks.length; i++) {
      const l = this.scene.landmarks[i];
      const p = this.lmProj[i];
      const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (dist < (l.interactRadius ?? 600)) {
        nearby.push({ id: l.id, name: l.name, dist });
        this.visit(l.id);   // 进入范围即到访
      }
    }
    return nearby.sort((a, b) => a.dist - b.dist);
  }

  /** 序列化为 PlayerSave 的玩法定义部分 */
  toSnapshot(): GameplaySnapshot {
    return JSON.parse(JSON.stringify(this.state));
  }

  // ==================== P2 经济：商店 ====================

  /** 商店列表视图（给 UI）；到访赠送的纪念品（price=0）不进入商店货架 */
  shopView() {
    return this.scene.shopItems
      .filter(i => i.enabled !== false && !(i.kind === 'souvenir' && i.price === 0))
      .map(i => ({ ...i, bought: this.state.shopBought[i.id] ?? 0 }));
  }

  /** 购买：扣钱 → 入背包/皮肤/效果 */
  buy(itemId: string): boolean {
    const item = this.scene.shopItems.find(i => i.id === itemId && i.enabled !== false);
    if (!item) return false;
    if (this.state.money < item.price) {
      this.emit({ type: 'info', payload: { msg: `余额不足（需 ¥${item.price}）` } });
      return false;
    }
    this.addMoney(-item.price, `购买「${item.name}」`);
    this.state.shopBought[itemId] = (this.state.shopBought[itemId] ?? 0) + 1;
    if (item.kind === 'material') {
      for (const g of item.grants) this.addItem(g.id, g.n);
    } else if (item.kind === 'camera') {
      if (item.skin && !this.state.cameraSkins.includes(item.skin)) this.state.cameraSkins.push(item.skin);
      if (item.skin) this.state.cameraSkin = item.skin;
    } else if (item.kind === 'consumable') {
      if (item.effect === 'photo_bonus' || item.effect === 'speed' || item.effect === 'fare_free') {
        const dur = (item.durationSec || 0) * 1000;
        const now = Date.now();
        this.state.activeEffects[item.effect] = dur > 0 ? now + dur : now;   // 0 时长=立即生效一次性
        if (dur === 0) delete this.state.activeEffects[item.effect];
        else this.emit({ type: 'info', payload: { msg: `${item.name} 生效 ${item.durationSec}s` } });
      } else {
        this.addItem(item.id, 1);
      }
    } else if (item.kind === 'food') {
      // 美食：入背包 + 每日品尝上报（按种类去重：同一种只计一次）
      this.addItem(item.id, 1);
      if (this.state.inventory[item.id] === 1) {
        this.noteFood();   // 首次品尝该种类 → 每日 food 计数 +1
      }
      this.emit({ type: 'info', payload: { msg: `品尝「${item.name}」` } });
    } else if (item.kind === 'souvenir') {
      // 纪念品：入收藏图鉴（去重），不入背包
      if (!this.state.souvenirs.includes(item.id)) {
        this.state.souvenirs.push(item.id);
        this.emit({ type: 'info', payload: { msg: `收藏「${item.name}」` } });
      } else {
        this.emit({ type: 'info', payload: { msg: `已收藏过「${item.name}」` } });
      }
    } else {
      this.addItem(item.id, 1);   // deco 装饰入背包
    }
    return true;
  }

  /** 效果是否激活（speed/fare_free/photo_bonus） */
  hasEffect(effect: string): boolean {
    const until = this.state.activeEffects[effect];
    if (!until) return false;
    if (Date.now() > until) { delete this.state.activeEffects[effect]; return false; }
    return true;
  }

  // ==================== P2 经济：地标投资 ====================

  /** 投资视图：每个地标的等级/下一级费用/时薪 */
  investView() {
    const cfg = this.scene.invest;
    if (!cfg) return [];
    return this.scene.landmarks.map(l => {
      const lv = this.state.investments[l.id] ?? 0;
      const canBuy = this.state.visited.includes(l.id) && lv < cfg.maxLevel;
      return {
        id: l.id, name: l.name,
        level: lv,
        nextCost: cfg.baseCost * (lv + 1),
        incomePerHour: lv * cfg.incomePerHour,
        maxed: lv >= cfg.maxLevel,
        visited: this.state.visited.includes(l.id),
        canBuy,
      };
    }).filter(v => v.visited || v.level > 0);   // 只显示到访过或有投资的
  }

  /** 投资一级 */
  invest(landmarkId: string): boolean {
    const cfg = this.scene.invest;
    if (!cfg) return false;
    const lv = this.state.investments[landmarkId] ?? 0;
    if (!this.state.visited.includes(landmarkId)) {
      this.emit({ type: 'info', payload: { msg: '需先到访该地标' } });
      return false;
    }
    if (lv >= cfg.maxLevel) return false;
    const cost = cfg.baseCost * (lv + 1);
    if (this.state.money < cost) {
      this.emit({ type: 'info', payload: { msg: `投资需 ¥${cost}，余额不足` } });
      return false;
    }
    this.addMoney(-cost, `投资「${this.lmName(landmarkId)}」Lv.${lv + 1}`);
    this.state.investments[landmarkId] = lv + 1;
    return true;
  }

  /**
   * 被动收益结算：距上次结算的时长 × 总时薪（按分钟累积，不足 1 分钟的尾数留存）
   * 引擎每 30s 调一次；也可在面板打开时即时调
   */
  settleInvestment(): number {
    const cfg = this.scene.invest;
    if (!cfg) return 0;
    const totalLv = Object.values(this.state.investments).reduce((s, n) => s + n, 0);
    if (totalLv === 0) { this.state.investSettledAt = new Date().toISOString(); return 0; }
    const last = this.state.investSettledAt ? Date.parse(this.state.investSettledAt) : Date.now();
    const now = Date.now();
    const minutes = Math.floor((now - last) / 60_000);
    if (minutes < 1) return 0;
    const income = Math.floor(totalLv * cfg.incomePerHour / 60 * minutes);
    if (income <= 0) { /* 尾数不足 ¥1 留存 */ return 0; }
    this.state.investSettledAt = new Date(now).toISOString();
    this.addMoney(income, '城市投资收益');
    return income;
  }

  /** 总被动时薪（UI 展示） */
  investIncomePerHour(): number {
    const cfg = this.scene.invest;
    if (!cfg) return 0;
    const totalLv = Object.values(this.state.investments).reduce((s, n) => s + n, 0);
    return totalLv * cfg.incomePerHour;
  }
}
