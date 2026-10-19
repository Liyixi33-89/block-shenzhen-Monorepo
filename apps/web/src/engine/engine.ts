// 组合根：拉取场景 → 构建世界 → 玩家控制 → 玩法系统装配 → 主循环
// 【engine 横切层】只做装配/注入/生命周期/按键路由；
// 玩法规则在 domain/，网络在 services/，构造组装在 factories.ts。
// 调试契约：window.__engine 字段是 e2e 脚本的对外接口，禁止删除。
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene as SceneData, Landmark } from '@block-sz/schema';
import { buildWorld } from './world';
import { createPlayer } from './player';
import { Gameplay, type GameplaySnapshot } from '../domain/gameplay';
import type { GameplayEvent } from '../domain/events';
import { PhotoMode, type PhotoHit } from './photo';
import { TransitSystem, type RideResult } from './transit';
import { BuildMode } from './build';
import { TeleportSystem } from './teleport';
import { NpcSystem } from './npc';
import { AscensionSystem } from '../domain/ascension';
import { Tutorial, isNewPlayer } from './tutorial';
import { TouchControls } from './touch';
import { ShopPanel } from './shop';
import { GalleryPanel } from './gallery';
import { ensureSession, uploadSave, downloadSave, type CloudSession } from '../services/cloud';
import { Analytics } from '../services/analytics';
import { snapshotToSave, saveToInit } from '../services/saveCodec';
import { createBuildMode, createTeleport, type SystemContext } from './factories';

export interface EngineOptions {
  container: HTMLElement;
  sceneId: string;
  spawnId: string;
  /** API 前缀（dev 由 vite 代理 /api，生产同源部署） */
  apiBase?: string;
}

/** 当前世界动画 tick 集合 */
let worldTick: ((t: number) => void) | null = null;

export class GameEngine {
  renderer: THREE.WebGLRenderer;
  three: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sceneData: SceneData | null = null;
  world: THREE.Group | null = null;
  player: ReturnType<typeof createPlayer> | null = null;
  gameplay: Gameplay | null = null;
  photoMode: PhotoMode | null = null;
  transit: TransitSystem | null = null;
  buildMode: BuildMode | null = null;
  teleport: TeleportSystem | null = null;
  npc: NpcSystem | null = null;
  ascension: AscensionSystem | null = null;
  tutorial: Tutorial | null = null;
  touch: TouchControls | null = null;
  analytics: Analytics | null = null;
  shop: ShopPanel | null = null;
  gallery: GalleryPanel | null = null;
  session: CloudSession | null = null;

  /** API 前缀（dev 由 vite 代理 /api，生产同源部署） */
  get apiBase(): string { return this.opts.apiBase ?? '/api'; }

  private clock = new THREE.Clock();
  private raf = 0;
  private opts: EngineOptions;
  private disposed = false;
  private saveTimer: number | undefined;
  private lastPos = { x: 0, z: 0 };
  /** 启动宽限：首秒内的事件不进 toast（回档 visit 的时序噪声） */
  private graceUntil = 0;
  /** 节流累加器（此前是未声明的动态属性，tsc 存量错误来源） */
  private tpRefreshAcc = 0;
  private investAcc = 0;
  private loadedPhases = new Set<string>();
  private saved: any = null;
  private createdAt: string | undefined;
  private unsubs: Array<() => void> = [];

  /** 供 HUD 查询的动态状态 */
  state = {
    districtName: '',
    nearLandmark: null as Landmark | null,
    pos: { x: 0, z: 0 },
    fps: 0,
    photoActive: false,
    /** P2-3：本次会话是否灰度命中新版本 */
    grayCohort: false,
  };
  /** 一次性提示队列（兼容 e2e 探测；内容由事件总线填充，UI 直接订阅总线） */
  events: GameplayEvent[] = [];
  photoHits: PhotoHit[] = [];
  private fpsAcc = 0; private fpsFrames = 0;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    const el = opts.container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    // P0 渲染优化：软阴影 + ACES 色调映射
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);

    this.three = new THREE.Scene();
    this.three.fog = new THREE.Fog(0xbfd4e6, 1200, 5600);

    this.camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.5, 6000);
  }

  /** 分步加载：UI 侧按阶段调用并展示进度（替代一次性 load） */
  async loadPhase(phase: 'session' | 'content' | 'world' | 'systems') {
    switch (phase) {
      case 'session': {
        if (this.loadedPhases.has('session')) return;
        this.session = await ensureSession();
        try { this.saved = await downloadSave(this.session); } catch { /* 离线可玩 */ }
        this.loadedPhases.add('session');
        return;
      }
      case 'content': {
        if (this.loadedPhases.has('content')) return;
        // P2-3 灰度分桶：带 playerId 让服务端决定命中版本
        const pid = this.session?.playerId ?? '';
        const r = await fetch(`/api/content/scenes/${this.opts.sceneId}${pid ? `?playerId=${encodeURIComponent(pid)}` : ''}`);
        if (!r.ok) throw new Error(`场景拉取失败 ${r.status}`);
        const { scene, gray } = await r.json();
        this.sceneData = scene as SceneData;
        this.state.grayCohort = gray === true;

        // 玩法引擎（回档）：字段映射唯一源在 services/saveCodec
        this.gameplay = new Gameplay(this.sceneData, saveToInit(this.saved));
        this.gameplay.on(e => this.dispatchGameplayEvent(e));
        this.loadedPhases.add('content');
        return;
      }
      case 'world': {
        if (this.loadedPhases.has('world')) return;
        const built = buildWorld(this.sceneData!);
        this.world = built.root;
        worldTick = built.tick;
        this.three.add(this.world);

        // 出生点（回档优先）
        const spawn = this.sceneData!.spawnPoints.find(s => s.id === this.opts.spawnId)
          ?? this.sceneData!.spawnPoints[0];
        const p = proj(spawn.latlng.lat, spawn.latlng.lng);
        // 出生位置外移 55 单位并面向地标原点（避免贴脸地标拍不到全景）
        const off = 55;
        const sx = p.x + off, sz = p.z + off;
        const faceAngle = Math.atan2(sx - p.x, sz - p.z);
        this.player = createPlayer(this.camera, { x: sx, z: sz, facing: faceAngle });
        if (this.saved?.pos && (this.saved.pos.x || this.saved.pos.z || this.saved.pos.y)) {
          this.player.teleport(this.saved.pos.x, this.saved.pos.z, this.saved.facing);
        }
        this.three.add(this.player.avatar);
        this.lastPos = { x: sx, z: sz };
        this.loadedPhases.add('world');
        return;
      }
      case 'systems': {
        if (this.loadedPhases.has('systems')) return;
        const saved = this.saved;
        // 飞升系统：阶段判定 + 能力解锁（建造/传送门槛）
        this.ascension = new AscensionSystem(this.sceneData!, {
          points: this.gameplay!.state.ascensionPoints,
          stageId: saved?.ascensionStage || undefined,
        });

        // 拍照模式
        this.photoMode = new PhotoMode(this.opts.container, this.sceneData!.landmarks, hits => {
          this.photoHits = hits;
          hits.forEach(h => this.gameplay?.photo(h.landmark.id));
        });

        // 交通系统（地铁站交互 → 乘车动画 → 跨区传送）
        if (this.sceneData!.traffic) {
          this.transit = new TransitSystem({
            container: this.opts.container,
            traffic: this.sceneData!.traffic,
            camera: this.camera,
            scene3: this.three,
          });
          this.transit.onArrive = r => this.onRideArrive(r);
          this.transit.onPhaseChange = p => {
            if (this.player) this.player.suspended = p === 'riding';
          };
        }

        // 建造（B 键）/ 传送（T 键）：构造组装统一走 factories
        this.materializeLockedSystems();

        // NPC 系统：世界摆位 + E 键对话 + 效果结算
        if (this.sceneData!.npcs.length) {
          this.npc = new NpcSystem({
            container: this.opts.container,
            scene3: this.three,
            data: this.sceneData!,
            giveMoney: (n, reason) => this.gameplay?.addMoney(n, reason),
            giveItem: (id, n) => this.gameplay?.addItem(id, n),
            panelGuard: () => this.panelOpen(),
            toast: msg => this.pushToast(msg),
          });
          this.npc.build();
        }

        // 埋点：订阅玩法事件总线（替代旧轮询喂入）
        this.analytics = new Analytics({
          apiBase: this.apiBase,
          getPlayerId: () => this.session?.playerId ?? 'anon',
          getSceneVersion: () => this.sceneData?.version ?? '',
        });
        this.analytics.track('session_start');

        // P2 商店与投资面板（S 键）：数据驱动，无 shopItems/invest 时打开显示筹备中
        this.shop = new ShopPanel({
          container: this.opts.container,
          data: this.sceneData!,
          gameplay: {
            buy: id => this.gameplay!.buy(id),
            invest: id => this.gameplay!.invest(id),
            shopView: () => this.gameplay!.shopView(),
            investView: () => this.gameplay!.investView(),
            investIncomePerHour: () => this.gameplay!.investIncomePerHour(),
            money: () => this.gameplay!.state.money,
          },
          panelGuard: () => this.panelOpen(),
          toast: msg => this.pushToast(msg),
          onChanged: () => void this.saveNow(),
        });

        // P2-4 作品广场（G 键）：发布/浏览/点赞/导入
        this.gallery = new GalleryPanel({
          container: this.opts.container,
          apiBase: this.apiBase,
          getPlacements: () => this.gameplay?.state.placements ?? [],
          importCreation: async (placements, title) => this.importCreation(placements, title),
          panelGuard: () => this.panelOpen(),
          toast: msg => this.pushToast(msg),
          onChanged: () => void this.saveNow(),
        });

        // 移动端触屏控制（首次 touch 指针时自动激活）
        this.touch = new TouchControls({
          container: this.opts.container,
          player: this.player!,   // systems 阶段 world 已就绪，player 必非空
          actions: {
            camera: () => { if (this.photoMode) { this.photoMode.toggle(); this.state.photoActive = this.photoMode.active; } },
            shutter: () => { if (this.photoMode?.active) this.photoMode.shoot(this.camera); },
            interact: () => this.onKey(new KeyboardEvent('keydown', { key: 'e' })),
            build: () => this.buildMode?.toggle(),
            teleport: () => this.simKey('t'),
            quest: () => this.simKey('q'),
            shop: () => { this.shop?.toggle(); this.shop?.refresh(); },
            gallery: () => void this.gallery?.toggle(),
          },
        });
        this.touch.bindLook(
          (dx, dy) => this.player?.look(dx, dy),
          d => this.player?.zoom(d),
        );

        // 新手引导（新玩家首次进入时展示）
        this.tutorial = new Tutorial({
          container: this.opts.container,
          enabled: isNewPlayer(saved),
        });

        // 飞升阶段升级提示（玩法事件驱动重评估）
        this.gameplay!.on(e => {
          if (e.type === 'photo' || e.type === 'quest-done') this.recheckAscension();
        });

        // 调试暴露（测试脚本用）
        (window as any).__engine = this;

        // 按键：C 相机 / 空格快门
        window.addEventListener('keydown', this.onKey);
        window.addEventListener('resize', this.onResize);

        // 定时云存档（30s）
        this.saveTimer = window.setInterval(() => this.saveNow(), 30000);
        this.graceUntil = performance.now() + 1500;

        this.loop();
        this.loadedPhases.add('systems');
        return;
      }
    }
  }

  /** 兼容旧调用（一次性加载全部） */
  async load() {
    await this.loadPhase('session');
    await this.loadPhase('content');
    await this.loadPhase('world');
    await this.loadPhase('systems');
  }

  /** gameplay 事件分发：宽限期外的进 events 队列（e2e 契约），视图/埋点自行订阅 gameplay */
  private dispatchGameplayEvent(e: GameplayEvent) {
    if (performance.now() < this.graceUntil && e.type === 'visit') return;
    this.events.push(e);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e' && this.player) {
      // NPC 对话优先（更近的交互），否则地铁站
      if (this.npc?.tryInteract(this.player.position)) return;
      // 站内交互键：手动探测最近站并开面板（transit.update 每帧轮询 keys 不可靠，
      // 因为合成键盘事件在 keyup 后 keys 已清空，改由事件直推）
      this.transit?.tryInteract(this.player.position);
      return;
    }
    if (k === 'c' && this.photoMode && this.player) {
      this.photoMode.toggle();
      this.state.photoActive = this.photoMode.active;
    } else if (k === 's' && this.shop && this.player && !this.photoMode?.active) {
      // P2 商店/投资面板（拍照模式时不抢占）
      this.shop.toggle();
      this.shop.refresh();
    } else if (k === 'g' && this.gallery && this.player && !this.photoMode?.active) {
      // P2-4 作品广场
      void this.gallery.toggle();
    } else if (k === ' ' && this.photoMode?.active && this.camera) {
      e.preventDefault();
      this.photoMode.shoot(this.camera);
    }
  };

  /** 飞升重评估：拍照/任务加点后调用，跨阶段时提示 + 动态解锁系统 */
  private recheckAscension() {
    if (!this.ascension || !this.gameplay) return;
    const before = this.ascension.stageId;
    const cur = this.ascension.evaluate(this.gameplay.state.ascensionPoints);
    if (cur && cur.id !== before) {
      this.pushToast(`飞升进阶「${cur.name}」！解锁新能力`);
      // 跨阶段动态实例化（建造/传送在加载期被门槛拦下时，升级后即时补齐）
      this.materializeLockedSystems();
      // 升级即时落档
      void this.saveNow();
    }
  }

  /** 按当前解锁状态补齐未实例化的系统（幂等；构造组装在 factories.ts） */
  private materializeLockedSystems() {
    if (!this.gameplay || !this.sceneData || !this.player) return;
    const ctx: SystemContext = {
      container: this.opts.container,
      camera: this.camera,
      scene3: this.three,
      sceneData: this.sceneData,
      gameplay: this.gameplay,
      getPlayerPos: () => this.player!.position,
      teleportPlayer: (x, z) => this.player?.teleport(x, z),
      panelOpen: () => this.panelOpen(),
      toast: msg => this.pushToast(msg),
      onChanged: () => void this.saveNow(),
    };
    if (!this.buildMode && this.ascension?.has('build')) {
      this.buildMode = createBuildMode(ctx);
    }
    if (!this.teleport && this.ascension?.has('teleport')) {
      this.teleport = createTeleport(ctx);
    }
  }

  /** 序列化 PlayerSave 并上传（映射唯一源在 services/saveCodec） */
  async saveNow() {
    if (!this.session || !this.gameplay || !this.player || !this.sceneData) return;
    const save = snapshotToSave(this.gameplay.toSnapshot(), {
      playerId: this.session.playerId,
      sceneId: this.opts.sceneId,
      name: this.session.name.slice(0, 16),
      pos: { x: this.player.position.x, y: 0, z: this.player.position.z },
      facing: this.player.facing,
      ascensionStage: this.ascension?.stageId ?? '',
    });
    // createdAt 稳定（首次存档时间不变）
    save.createdAt = this.createdAt ??= new Date().toISOString();
    try { await uploadSave(this.session, save); } catch { /* 离线静默 */ }
  }

  /** 面板占用判断（B/T 等模式键冲突防护） */
  panelOpen() {
    return this.transit?.panelOpen === true
      || this.teleport?.isOpen === true
      || this.npc?.panelOpen === true
      || this.photoMode?.active === true
      || this.buildMode?.active === true
      || this.shop?.isOpen === true
      || this.gallery?.isOpen === true;
  }

  /** P2-4 导入他人作品：以玩家当前位置为中心复制 placements（付费 ¥200） */
  private async importCreation(placements: any[], _title: string): Promise<boolean> {
    if (!this.gameplay || !this.player || !this.buildMode) {
      this.pushToast('需要先解锁建造能力（飞升 builder 阶段）');
      return false;
    }
    if (!this.gameplay.spend(200)) {
      this.pushToast('导入费用 ¥200，余额不足');
      return false;
    }
    // 源作品包围盒 → 平移到玩家脚下
    const xs = placements.map(p => p.x), zs = placements.map(p => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const ox = Math.round(this.player.position.x - cx);
    const oz = Math.round(this.player.position.z - cz);
    const maxN = Math.max(0, ...this.gameplay.state.placements.map(p => p.n));
    let next = maxN;
    for (const p of placements) {
      next++;
      const rec = {
        n: next,
        element: p.element,
        x: p.x + ox, y: p.y, z: p.z + oz,
        rot: p.rot ?? 0,
      };
      if (this.buildMode.placeImported(rec)) {
        this.gameplay.state.placements.push(rec);
      }
    }
    void this.saveNow();
    return true;
  }

  /** 通用 toast（建造/传送等系统用） */
  pushToast(msg: string) {
    this.events.push({ type: 'info', payload: { msg } });
  }

  /** 模拟按键（移动端按钮触发面板快捷键等 window 监听） */
  simKey(k: string) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  }

  /** 乘车到站：扣费 + 事件 + 立即存档 */
  private onRideArrive(r: RideResult) {
    if (!this.gameplay) return;
    // P2 地铁日票（fare_free）：地铁线免费（巴士/索道照常）
    const isMetro = (r.route as any).vehicle === 'metro' || /地铁/.test(r.route.name ?? '');
    if (isMetro && this.gameplay.hasEffect('fare_free')) {
      this.events.push({ type: 'money', payload: { n: 0, reason: `日票免票 · ${r.route.name} → ${r.to.name}`, total: this.gameplay.state.money } });
      void this.saveNow();
      return;
    }
    const ok = this.gameplay.spend(r.fare);
    if (!ok) {
      // 钱不够时仍到达但提示欠费（避免玩家被卡在远端）
      this.events.push({ type: 'money', payload: { n: 0, reason: `余额不足，仍乘至 ${r.to.name}`, total: this.gameplay.state.money } });
    } else {
      this.events.push({ type: 'money', payload: { n: -r.fare, reason: `${r.route.name} → ${r.to.name}`, total: this.gameplay.state.money } });
    }
    void this.saveNow();
  }

  private onResize = () => {
    const el = this.opts.container;
    if (!el.clientWidth) return;
    this.camera.aspect = el.clientWidth / el.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(el.clientWidth, el.clientHeight);
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    worldTick?.(t);

    // P1 角色动画：NPC 浮动微动
    this.npc?.tick?.(t);

    // 交通：乘车期间接管相机与玩家
    if (this.transit && this.player) {
      this.transit.update(dt, this.player, this.player.keys);
    }

    // 建造幽灵光标跟随
    this.buildMode?.update();

    // 传送面板冷却倒计时刷新（节流）
    this.tpRefreshAcc += dt;
    if (this.tpRefreshAcc > 1) { this.tpRefreshAcc = 0; this.teleport?.tickRefresh(); }

    // P2 投资被动收益结算（每 30s 一次）
    this.investAcc += dt;
    if (this.investAcc > 30) { this.investAcc = 0; this.gameplay?.settleInvestment(); }

    const riding = this.transit?.riding ?? false;

    if (this.player && this.gameplay && !riding) {
      this.player.update(dt, this.sceneData?.landmarks ?? []);
      const pos = this.player.position;
      this.state.pos.x = Math.round(pos.x);
      this.state.pos.z = Math.round(pos.z);

      // 行走里程
      const moved = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
      if (moved > 0.5) this.gameplay.walk(moved);
      this.lastPos = { x: pos.x, z: pos.z };

      // 到访 / 近地标
      const nearby = this.gameplay.probe({ x: pos.x, z: pos.z });
      this.state.nearLandmark = nearby[0]
        ? this.sceneData!.landmarks.find(l => l.id === nearby[0].id) ?? null
        : null;

      // 区名
      let bestD = Infinity, bestName = '';
      for (const d of this.sceneData!.districts) {
        const c = proj(d.center.lat, d.center.lng);
        const dist = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (dist < bestD) { bestD = dist; bestName = d.name; }
      }
      this.state.districtName = bestD < 1500 ? bestName : '深圳郊野';
    }

    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.state.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0; this.fpsFrames = 0;
    }

    this.renderer.render(this.three, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    worldTick = null;
    clearInterval(this.saveTimer);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.photoMode?.dispose();
    this.transit?.dispose();
    this.buildMode?.dispose();
    this.teleport?.dispose();
    this.npc?.dispose();
    this.tutorial?.dispose();
    this.touch?.dispose();
    this.shop?.dispose();
    this.gallery?.dispose();
    this.analytics?.dispose();
    this.unsubs.forEach(off => off());
    void this.saveNow();   // 退出前存档
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
