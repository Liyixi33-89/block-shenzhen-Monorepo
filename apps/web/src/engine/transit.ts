// 交通系统：走近地铁站交互 → 选线选站 → 乘车动画（隧道穿梭）→ 跨区传送
// 数据来自场景包 traffic.stations / traffic.routes，无需新增内容 Schema
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Station, Route, Traffic } from '@block-sz/schema';
import { iconEl } from './icons';

export interface TransitOptions {
  container: HTMLElement;
  traffic: Traffic;
  /** 相机接管（乘车动画期间由 transit 全权控制） */
  camera: THREE.PerspectiveCamera;
  scene3: THREE.Scene;
}

export type TransitPhase = 'idle' | 'riding' | 'arrived';

/** 一次乘车结果 */
export interface RideResult {
  route: Route;
  from: Station;
  to: Station;
  fare: number;
}

/** 玩家世界坐标接口（避免依赖 player 模块） */
export interface TransitPlayer {
  position: { x: number; z: number };
  facing: number;
  teleport(x: number, z: number, f?: number): void;
}

const ENTER_RADIUS = 26;      // 站亭交互半径
const RIDE_SPEED = 260;       // 列车速度（单位/秒）
const DWELL = 0.45;           // 中途站停靠

export class TransitSystem {
  phase: TransitPhase = 'idle';
  private traffic: Traffic;
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private scene3: THREE.Scene;

  private stations: Station[] = [];
  private routes: Route[] = [];
  private stationPos = new Map<string, { x: number; z: number }>();

  // 交互面板（DOM）
  private panel: HTMLDivElement;
  private panelBody: HTMLDivElement;
  private headTitle: HTMLElement;
  /** 面板当前对应的站 */
  private panelStation: Station | null = null;

  // 行车状态
  private player: TransitPlayer | null = null;
  private ride: {
    result: RideResult;
    stops: { st: Station; x: number; z: number }[];  // 含起终点的途经站
    seg: number;               // 当前段索引
    t: number;                 // 段内进度 0-1
    dwell: number;             // 停靠剩余
    done: boolean;
  } | null = null;

  /** 到站回调（引擎负责扣费/传送玩家/事件上报） */
  onArrive: ((r: RideResult) => void) | null = null;
  /** 行车期间引擎应暂停玩家输入 */
  onPhaseChange: ((p: TransitPhase) => void) | null = null;

  constructor(opts: TransitOptions) {
    this.traffic = opts.traffic;
    this.container = opts.container;
    this.camera = opts.camera;
    this.scene3 = opts.scene3;

    this.stations = opts.traffic.stations;
    this.routes = opts.traffic.routes.filter(r => r.enabled);
    for (const s of this.stations) {
      const p = proj(s.latlng.lat, s.latlng.lng);
      this.stationPos.set(s.id, p);
    }

    // ---- 乘车面板 DOM ----
    this.panel = document.createElement('div');
    this.panel.className = 'bsz-panel';
    const head = document.createElement('div');
    head.className = 'bsz-panel-head';
    this.headTitle = document.createElement('b');
    head.appendChild(this.headTitle);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'bsz-close';
    closeBtn.onclick = () => this.closePanel();
    head.appendChild(closeBtn);
    this.panel.appendChild(head);

    this.panelBody = document.createElement('div');
    this.panelBody.className = 'bsz-panel-body';
    this.panel.appendChild(this.panelBody);
    this.container.appendChild(this.panel);
  }

  /** 每帧调用：行车推进（探测已改为按键事件直推，见 tryInteract） */
  update(dt: number, player: TransitPlayer, _keys: Set<string>) {
    this.player = player;
    if (this.ride) { this.updateRide(dt); return; }
  }

  /** E 键按下：站内则开乘车面板（事件直推，比每帧轮询可靠） */
  tryInteract(pos: { x: number; z: number }) {
    if (this.ride || this.panelStation) return false;
    let near: Station | null = null, bestD = ENTER_RADIUS;
    for (const s of this.stations) {
      const sp = this.stationPos.get(s.id)!;
      const d = Math.hypot(sp.x - pos.x, sp.z - pos.z);
      if (d < bestD) { bestD = d; near = s; }
    }
    if (near) { this.openPanel(near); return true; }
    return false;
  }

  // ---------------- 面板 ----------------
  private openPanel(st: Station) {
    this.panelStation = st;
    this.headTitle.textContent = st.name;
    this.headTitle.prepend(iconEl('metro', 18));

    // 该站经停线路
    const lines = this.routes.filter(r => r.stations.includes(st.id));
    this.panelBody.innerHTML = '';

    if (!lines.length) {
      const div = document.createElement('div');
      div.style.cssText = 'padding:8px 0; color:#8aa0b4;';
      div.textContent = '此站暂无线路停靠';
      this.panelBody.appendChild(div);
    }

    for (const r of lines) {
      const lineBox = document.createElement('div');
      lineBox.style.cssText = `margin:10px 0 6px;`;
      const lineHead = document.createElement('div');
      lineHead.className = 'bsz-line-head';
      const dot = document.createElement('span');
      dot.className = 'bsz-line-dot';
      dot.style.background = '#' + r.color.toString(16).padStart(6, '0');
      const name = document.createElement('span');
      name.textContent = r.name;
      name.style.fontWeight = 'bold';
      const fare = document.createElement('span');
      fare.textContent = `¥${r.fare}`;
      fare.className = 'bsz-line-fare';
      lineHead.append(dot, name, fare);
      lineBox.appendChild(lineHead);

      // 该线路上除当前站外的其他站按钮
      const stops = document.createElement('div');
      stops.className = 'bsz-stops';
      for (const sid of r.stations) {
        if (sid === st.id) continue;
        const s2 = this.stations.find(s => s.id === sid);
        if (!s2) continue;
        const btn = document.createElement('button');
        btn.textContent = s2.name;
        btn.className = 'bsz-btn';
        btn.onclick = () => this.startRide(r, st, s2);
        stops.appendChild(btn);
      }
      lineBox.appendChild(stops);
      this.panelBody.appendChild(lineBox);
    }

    this.panel.style.display = 'block';
  }

  private closePanel() {
    this.panel.style.display = 'none';
    this.panelStation = null;
  }

  get panelOpen() { return this.panelStation !== null; }

  // ---------------- 乘车动画 ----------------
  private startRide(route: Route, from: Station, to: Station) {
    const idxA = route.stations.indexOf(from.id);
    const idxB = route.stations.indexOf(to.id);
    if (idxA < 0 || idxB < 0) return;
    const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
    const stops = route.stations.slice(lo, hi + 1).map(id => {
      const st = this.stations.find(s => s.id === id)!;
      const p = this.stationPos.get(id)!;
      return { st, x: p.x, z: p.z };
    });

    this.closePanel();
    this.ride = { result: { route, from, to, fare: route.fare }, stops, seg: 0, t: 0, dwell: 0, done: false };
    this.phase = 'riding';
    this.onPhaseChange?.('riding');

    // 隧道环境：乘车期间罩一层暗色穹顶雾
    this.scene3.fog = new THREE.Fog(0x0a1420, 60, 320);
    this.scene3.background = new THREE.Color(0x0a1420);
  }

  private updateRide(dt: number) {
    const ride = this.ride!;
    if (ride.done) return;

    // 分段推进（段 = 相邻两站之间）
    const a = ride.stops[ride.seg];
    const b = ride.stops[ride.seg + 1];
    if (!b) { this.finishRide(); return; }

    if (ride.dwell > 0) {
      ride.dwell -= dt;
      // 停靠时轻微晃动
      this.camera.position.x += (Math.random() - 0.5) * 0.2;
      this.camera.position.z += (Math.random() - 0.2) * 0.2;
      return;
    }

    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    ride.t += (RIDE_SPEED * dt) / segLen;

    if (ride.t >= 1) {
      ride.seg++; ride.t = 0;
      if (ride.seg >= ride.stops.length - 1) {
        this.finishRide();
        return;
      }
      ride.dwell = DWELL; // 中途站停靠
      return;
    }

    // 车内视角：位于车厢位置，稍高俯视轨道
    const t = ride.t;
    const cx = THREE.MathUtils.lerp(a.x, b.x, t);
    const cz = THREE.MathUtils.lerp(a.z, b.z, t);
    // 后半段拉高望远（出隧道感）
    const prog = (ride.seg + t) / (ride.stops.length - 1);
    const cy = 14 + Math.sin(prog * Math.PI) * 26;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(
      THREE.MathUtils.lerp(a.x, b.x, Math.min(1, t + 0.06)),
      10,
      THREE.MathUtils.lerp(a.z, b.z, Math.min(1, t + 0.06)),
    );
  }

  private finishRide() {
    const ride = this.ride!;
    ride.done = true;
    const dest = ride.stops[ride.stops.length - 1];
    const destPos = this.stationPos.get(dest.st.id)!;

    // 恢复世界外观
    this.scene3.fog = new THREE.Fog(0xbfd4e6, 1200, 5600);
    this.scene3.background = null;

    // 玩家落到目的站
    this.player?.teleport(destPos.x, destPos.z);

    this.ride = null;
    this.phase = 'idle';
    this.onPhaseChange?.('idle');
    this.onArrive?.(ride.result);
  }

  /** 乘车中（引擎跳过玩家控制与到访探测） */
  get riding() { return this.ride !== null; }

  dispose() {
    this.closePanel();
    this.panel.remove();
  }
}
