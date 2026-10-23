// 组合根：拉取场景 → 构建世界 → 玩家控制 → 玩法系统装配 → 主循环
// 【engine 横切层】只做装配/注入/生命周期/按键路由；
// 玩法规则在 domain/，网络在 services/，构造组装在 factories.ts。
// 调试契约：window.__engine 字段是 e2e 脚本的对外接口，禁止删除。
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene as SceneData, Landmark, PlayerSave } from '@block-sz/schema';
import { buildWorld } from './world';
import { createPlayer } from './player';
import { Gameplay, type GameplaySnapshot } from '../domain/gameplay';
import type { GameplayEvent } from '../domain/events';
import { PhotoMode, type PhotoHit } from './photo';
import { TransitSystem, type RideResult } from './transit';
import { BuildMode } from './build';
import { TeleportSystem } from './teleport';
import { NpcSystem } from './npc';
import { DayNightSystem } from './daynight';
import { WeatherSystem } from './weather';
import { AscensionSystem } from '../domain/ascension';
import { Tutorial, isNewPlayer } from './tutorial';
import { TouchControls } from './touch';
import { ShopPanel } from './shop';
import { GalleryPanel } from './gallery';
import { SouvenirPanel } from './souvenir';
import { LABEL_HEIGHT } from './builders';
import type { LightingRig } from './atmosphere';
import type { RoadGraph } from './roadnet';
import { ensureSession, uploadSave, downloadSave, type CloudSession } from '../services/cloud';
import { Analytics } from '../services/analytics';
import { snapshotToSave, saveToInit } from '../services/saveCodec';
import { createBuildMode, createTeleport, type SystemContext } from './factories';
import { isOccluded as isOccludedMesh } from './occlusion';
import { DeckController } from './deck';
import { mountKeymap } from './keymap';
import { stepFrame, type MainloopRuntime } from './mainloop';

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
  /** 角色外观定制（皮肤参数 + 自定义皮肤；null=未定制），由角色面板读写 */
  profile: PlayerSave['profile'] = null;
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
  souvenir: SouvenirPanel | null = null;
  /** 观景台登顶控制器（E 键登顶/下塔状态机） */
  deck: DeckController | null = null;
  dayNight: DayNightSystem | null = null;
  weather: WeatherSystem | null = null;
  session: CloudSession | null = null;
  /** 全城道路图（NPC 游走；无路网为 null） */
  roadGraph: RoadGraph | null = null;
  /** 地图用道路线段（区际快速路 + 区内主干道），供全城地图/小地图绘制 */
  mapRoads: Array<{ x1: number; z1: number; x2: number; z2: number; kind: 'hwy' | 'major' }> = [];
  /** 分块流式加载控制器（按玩家位置挂载/卸载街区） */
  streaming: { update(px: number, pz: number): void } | null = null;
  /** 光照句柄（阴影相机跟随玩家） */
  lightingRig: LightingRig | null = null;
  /** 世界句柄（dispose 时释放独占 GPU 资源） */
  worldHandle: { dispose(): void } | null = null;

  /** API 前缀（dev 由 vite 代理 /api，生产同源部署） */
  get apiBase(): string { return this.opts.apiBase ?? '/api'; }

  private clock = new THREE.Clock();
  private raf = 0;
  private opts: EngineOptions;
  private disposed = false;
  private saveTimer: number | undefined;
  private lastPos = { x: 0, z: 0 };
  /** 阴影相机最近一次跟随位置（位移超过阈值才更新） */
  private shadowPos = { x: 0, z: 0 };
  /** 启动宽限：首秒内的事件不进 toast（回档 visit 的时序噪声） */
  private graceUntil = 0;
  /** 节流累加器（包装为对象，mainloop 原地修改以保持引用同步） */
  private tpRefreshAcc = { v: 0 };
  private investAcc = { v: 0 };
  private fpsAcc = { v: 0 };
  private fpsFrames = { v: 0 };
  /** 自适应渲染档位（0 高 / 1 中 / 2 低）：低帧率自动降像素比，高帧率恢复 */
  private qualityTier = 0;
  private lowFpsTime = 0;
  private highFpsTime = 0;
  /** 主循环每帧推进的运行时上下文（复用引用，见 engine/mainloop） */
  private frame: MainloopRuntime | null = null;
  private loadedPhases = new Set<string>();
  private saved: any = null;
  private createdAt: string | undefined;
  private unsubs: Array<() => void> = [];
  /** 按键路由清理函数（mountControls 注册） */
  private keymapDispose: (() => void) | null = null;

  /** 供 HUD 查询的动态状态 */
  state = {
    districtName: '',
    nearLandmark: null as Landmark | null,
    pos: { x: 0, z: 0 },
    fps: 0,
    photoActive: false,
    /** 昼夜系统：游戏钟面（HH:MM）与是否夜晚 */
    clock: '08:00',
    night: false,
    /** 天气系统：当前天气 */
    weather: '晴',
    /** P2-3：本次会话是否灰度命中新版本 */
    grayCohort: false,
  };
  /** 一次性提示队列（兼容 e2e 探测；内容由事件总线填充，UI 直接订阅总线） */
  events: GameplayEvent[] = [];
  photoHits: PhotoHit[] = [];

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
        this.roadGraph = built.roadGraph;
        this.mapRoads = built.mapRoads;
        this.streaming = built.streaming;
        this.lightingRig = built.lighting;
        this.worldHandle = built;
        this.three.add(this.world);
        // 昼夜系统接管场景雾/光照/天空句柄
        this.three.fog = built.fog;
        this.dayNight = new DayNightSystem({
          lighting: built.lighting,
          skyMat: built.skyMat,
          fog: built.fog,
          renderer: this.renderer,
        });

        // 出生点：以本次选择为准（玩家在出生点界面主动挑选节点，必须落位到所选节点）
        const spawn = this.sceneData!.spawnPoints.find(s => s.id === this.opts.spawnId)
          ?? this.sceneData!.spawnPoints[0];
        const p = proj(spawn.latlng.lat, spawn.latlng.lng);
        // 出生位置外移 55 单位并面向地标原点（避免贴脸地标拍不到全景）
        const off = 55;
        const sx = p.x + off, sz = p.z + off;
        const faceAngle = Math.atan2(sx - p.x, sz - p.z);
        this.player = createPlayer(this.camera, { x: sx, z: sz, facing: faceAngle });
        // 注入角色外观（存档 profile），无存档则用默认皮肤
        this.profile = this.saved?.profile ?? null;
        if (this.profile) {
          this.player.applySkin(this.profile.skinParams, this.profile.customSkin || null);
        }
        this.three.add(this.player.avatar);
        this.lastPos = { x: sx, z: sz };
        // 阴影相机初位对齐出生点（否则玩家出生在远处时身边无阴影）
        this.shadowPos = { x: sx, z: sz };
        built.lighting.followShadow(sx, sz);
        this.loadedPhases.add('world');
        return;
      }
      case 'systems': {
        if (this.loadedPhases.has('systems')) return;
        const saved = this.saved;
        // 观景台登顶控制器（E 键登顶/下塔）
        this.deck = this.createDeck();
        // 飞升系统：阶段判定 + 能力解锁（建造/传送门槛）
        this.ascension = new AscensionSystem(this.sceneData!, {
          points: this.gameplay!.state.ascensionPoints,
          stageId: saved?.ascensionStage || undefined,
        });

        // 拍照模式
        this.photoMode = new PhotoMode(this.opts.container, this.sceneData!.landmarks, hits => {
          this.photoHits = hits;
          const isNight = this.dayNight?.isNight() ?? false;
          hits.forEach(h => this.gameplay?.photo(h.landmark.id, { night: isNight }));
        }, {
          // 自拍模式：由引擎查询昼夜供夜间自拍判定
          isNight: () => this.dayNight?.isNight() ?? false,
          noteSelfie: () => this.gameplay?.noteSelfie(),
          // 遮挡检测：相机→地标采样点射线是否被世界几何挡住（仅快门时调用一次）
          isOccluded: (from, to) => this.isOccluded(from, to),
        });

        // 天气系统（雨/雪粒子 + HUD 天气角标）
        this.weather = new WeatherSystem(this.three);

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
            onTalk: () => this.gameplay?.noteTalk(),
            // 动态随机 NPC（城市生气）+ 天气/夜晚对白：数量读 scene.config.env.npc.dynamicCount（兜底 16）
            isNight: () => this.dayNight?.isNight() ?? false,
            weatherKind: () => this.weather?.kind ?? 'sunny',
            // 店铺 NPC / 移动小摊购买（复用 Gameplay.buy：扣钱+给物品+美食计数）
            buy: id => this.gameplay?.buy(id) ?? false,
            // 阶段二：全城道路图（动态 NPC 沿路网节点游走）
            roadGraph: this.roadGraph,
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

        // 纪念品图鉴（O 键）：到访/购买收集的纪念品展示
        this.souvenir = new SouvenirPanel({
          container: this.opts.container,
          view: () => this.gameplay?.souvenirView() ?? [],
          count: () => this.gameplay?.souvenirCount() ?? [0, 0],
          panelGuard: () => this.panelOpen(),
          toast: msg => this.pushToast(msg),
        });

        // 移动端触屏控制（首次 touch 指针时自动激活）
        this.touch = new TouchControls({
          container: this.opts.container,
          player: this.player!,   // systems 阶段 world 已就绪，player 必非空
          actions: {
            camera: () => { if (this.photoMode) { this.photoMode.toggle(); this.state.photoActive = this.photoMode.active; } },
            shutter: () => { if (this.photoMode?.active) this.photoMode.shoot(this.camera); },
            interact: () => this.simKey('e'),
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

        // 按键：C 相机 / 空格快门（所有系统装配完后注册）
        this.keymapDispose = this.mountControls();
        window.addEventListener('resize', this.onResize);

        // 定时云存档（30s）
        this.saveTimer = window.setInterval(() => this.saveNow(), 30000);
        this.graceUntil = performance.now() + 1500;

        // 主循环运行时上下文（复用引用，逐帧推进见 engine/mainloop）
        this.frame = this.buildFrame();
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

  /** 装配全局按键路由（engine/keymap），返回清理函数 */
  private mountControls(): () => void {
    return mountKeymap({
      player: this.player,
      camera: this.camera,
      npc: this.npc,
      deck: this.deck,
      transit: this.transit,
      photoMode: this.photoMode ? {
        toggle: () => { this.photoMode!.toggle(); return this.photoMode!.active; },
        active: () => this.photoMode!.active,
        toggleSelfie: () => this.photoMode!.toggleSelfie(),
        selfie: () => this.photoMode!.selfie,
        shoot: c => this.photoMode!.shoot(c),
      } : null,
      ascension: this.ascension,
      shop: this.shop,
      gallery: this.gallery,
      souvenir: this.souvenir,
      onPhotoToggle: active => { this.state.photoActive = active; },
      toast: msg => this.pushToast(msg),
    });
  }

  /** 遮挡检测：相机 → 目标点射线是否被实体建筑挡住（拍照入镜判定用）。 */
  private isOccluded(from: THREE.Vector3, to: THREE.Vector3): boolean {
    if (!this.world) return false;
    return isOccludedMesh(this.world, from, to);
  }

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
      profile: this.profile,
    });
    // createdAt 稳定（首次存档时间不变）
    save.createdAt = this.createdAt ??= new Date().toISOString();
    try { await uploadSave(this.session, save); } catch { /* 离线静默 */ }
  }

  /** 应用角色外观（角色定制面板调用）：更新化身皮肤并持久化到存档 */
  applyProfile(profile: PlayerSave['profile']) {
    this.profile = profile;
    if (this.player && profile) {
      this.player.applySkin(profile.skinParams, profile.customSkin || null);
    }
    void this.saveNow();
  }

  /** 传送玩家到世界坐标（全城地图「前往」调用） */
  teleport(x: number, z: number) {
    this.player?.teleport(x, z);
  }

  /** 装配观景台登顶控制器（依赖注入，见 engine/deck） */
  private createDeck(): DeckController {
    return new DeckController({
      player: this.player,
      landmarks: this.sceneData!.landmarks,
      deckHeight: id => LABEL_HEIGHT[id] ?? 40,
      toast: msg => this.pushToast(msg),
      onChanged: () => void this.saveNow(),
    });
  }

  /** 面板占用判断（B/T 等模式键冲突防护） */
  panelOpen() {
    return this.transit?.panelOpen === true
      || this.teleport?.isOpen === true
      || this.npc?.panelOpen === true
      || this.photoMode?.active === true
      || this.buildMode?.active === true
      || this.shop?.isOpen === true
      || this.gallery?.isOpen === true
      || this.souvenir?.isOpen === true
      || this.deck?.landmark !== null;
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
    // 每日任务：按载具类型上报乘车
    this.gameplay.noteRide((r.route as any).kind ?? '');
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

  /** 装配主循环运行时上下文（systems 阶段一次性构造；动态系统用 getter 反映即时解锁） */
  private buildFrame(): MainloopRuntime {
    return {
      state: this.state,
      worldTick,
      streaming: this.streaming,
      lightingRig: this.lightingRig,
      npc: this.npc,
      dayNight: this.dayNight,
      weather: this.weather,
      transit: this.transit,
      buildMode: { update: () => this.buildMode?.update() },
      teleport: { tickRefresh: () => this.teleport?.tickRefresh() },
      gameplay: this.gameplay,
      player: this.player,
      sceneData: this.sceneData,
      camera: this.camera,
      renderer: this.renderer,
      three: this.three,
      shadowPos: this.shadowPos,
      lastPos: this.lastPos,
      tpRefreshAcc: this.tpRefreshAcc,
      investAcc: this.investAcc,
      fpsAcc: this.fpsAcc,
      fpsFrames: this.fpsFrames,
      districtProj: null,
    };
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    if (this.frame) stepFrame(this.frame, dt, t);
    this.tunePerformance(dt);
  };

  /**
   * 自适应渲染降级（借鉴广州参考项目三档质量思路，但按帧率自动调档，无需用户操作）：
   * - FPS 持续 <28 约 1.5s → 降一档（像素比上限 2→1.5→1，GPU 填充率大幅下降）
   * - FPS 持续 >55 约 5s → 升一档（恢复画质，最高回到 devicePixelRatio 上限 2）
   * 只调整像素比，不动阴影贴图，避免阴影重建的闪烁风险。
   */
  private tunePerformance(dt: number) {
    const fps = this.state.fps;
    if (fps <= 0) return; // fps 尚未首次统计
    if (fps < 28) { this.lowFpsTime += dt; this.highFpsTime = 0; }
    else if (fps > 55) { this.highFpsTime += dt; this.lowFpsTime = 0; }
    else { this.lowFpsTime = Math.max(0, this.lowFpsTime - dt); this.highFpsTime = Math.max(0, this.highFpsTime - dt); }

    if (this.lowFpsTime > 1.5 && this.qualityTier < 2) {
      this.setQualityTier(this.qualityTier + 1);
      this.lowFpsTime = 0;
    } else if (this.highFpsTime > 5 && this.qualityTier > 0) {
      this.setQualityTier(this.qualityTier - 1);
      this.highFpsTime = 0;
    }
  }

  private setQualityTier(tier: number) {
    this.qualityTier = tier;
    const dpr = window.devicePixelRatio || 1;
    const scale = tier === 0 ? Math.min(dpr, 2) : tier === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    this.renderer.setPixelRatio(scale);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    worldTick = null;
    clearInterval(this.saveTimer);
    this.keymapDispose?.();
    this.keymapDispose = null;
    window.removeEventListener('resize', this.onResize);
    this.photoMode?.dispose();
    this.transit?.dispose();
    this.weather?.dispose();
    this.buildMode?.dispose();
    this.teleport?.dispose();
    this.npc?.dispose();
    this.player?.dispose();   // 移除事件监听 + 释放化身 GPU 资源
    this.player = null;
    this.tutorial?.dispose();
    this.touch?.dispose();
    this.shop?.dispose();
    this.gallery?.dispose();
    this.analytics?.dispose();
    this.unsubs.forEach(off => off());
    void this.saveNow();   // 退出前存档
    // 释放世界独占的 GPU 资源（共享几何/材质/贴图保留复用）
    this.worldHandle?.dispose();
    this.worldHandle = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
