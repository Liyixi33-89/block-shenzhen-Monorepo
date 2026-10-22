// 建造模式：B 键开关 → 元素选择栏（配方扣费入背包）→ 地面网格预览 + 幽灵方块 → 左键放置 / Z 撤销
// 元素几何完全由场景包 elements 数据驱动（box/prism/beam/sign），引擎只解释不内置
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene, Element, BuildRecipe } from '@block-sz/schema';
import { iconEl, categoryIcon } from './icons';
import { collision } from './collision';

export interface BuildOptions {
  container: HTMLElement;
  camera: THREE.PerspectiveCamera;
  scene3: THREE.Scene;
  data: Scene;
  /** 玩家位置（限制建造半径） */
  getPlayerPos: () => THREE.Vector3;
  /** 花钱（false = 余额不足） */
  spend: (n: number) => boolean;
  /** 背包增减 */
  addItem: (id: string, n: number) => void;
  getItemCount: (id: string) => number;
  /** 放置/撤销回调（引擎写存档） */
  onPlace: (p: { n: number; element: string; x: number; y: number; z: number; rot: number }) => void;
  onRemove: (n: number) => void;
  /** toast 提示 */
  toast: (msg: string) => void;
}

const GRID = 8;            // 网格吸附（元素尺寸基本单位）
const MAX_RANGE = 90;      // 玩家周围建造半径
const MAX_PLACEMENTS = 400;

export class BuildMode {
  active = false;
  private opts: BuildOptions;
  private elements: Element[];
  private recipes: BuildRecipe[];
  private elemMap = new Map<string, Element>();

  // UI
  private bar: HTMLDivElement;
  private hint: HTMLDivElement;

  // 3D
  private ghost: THREE.Group | null = null;
  private ghostMat: THREE.MeshStandardMaterial;
  private ring: THREE.Mesh;
  private cursor = new THREE.Vector3();     // 当前放置点
  private cursorValid = false;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private placedGroup = new THREE.Group();  // 所有已放置物
  private meshes = new Map<number, THREE.Group>();  // n -> group
  private nextN = 1;

  private selElement = '';
  private rotStep = 0;                      // 0-3 → 旋转 90°×n
  private placing = false;                  // 防连点

  constructor(opts: BuildOptions) {
    this.opts = opts;
    this.elements = opts.data.elements;
    this.recipes = opts.data.buildRecipes.filter(r => r.enabled);
    for (const e of this.elements) this.elemMap.set(e.id, e);

    // ---- 3D 组 ----
    opts.scene3.add(this.placedGroup);

    this.ghostMat = new THREE.MeshStandardMaterial({
      color: 0x7ad0ff, transparent: true, opacity: 0.45, depthWrite: false,
      roughness: 0.6, metalness: 0,
    });

    // 放置范围圈
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(MAX_RANGE - 1.2, MAX_RANGE, 48),
      new THREE.MeshBasicMaterial({ color: 0x7ad0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.3;
    this.ring.visible = false;
    opts.scene3.add(this.ring);

    // ---- 元素选择栏 DOM ----
    this.bar = document.createElement('div');
    this.bar.className = 'bsz-build-bar';
    opts.container.appendChild(this.bar);

    this.hint = document.createElement('div');
    this.hint.className = 'bsz-build-hint';
    opts.container.appendChild(this.hint);

    // 地面点击放置 + 指针跟踪
    opts.container.addEventListener('pointerdown', this.onPointerDown);
    opts.container.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ---------------- 开关 ----------------
  toggle() { this.active ? this.close() : this.open(); }

  private open() {
    if (!this.elements.length) { this.opts.toast('当前场景无可放置元素'); return; }
    this.active = true;
    this.ring.visible = true;
    this.renderBar();
    this.bar.style.display = 'flex';
    this.hint.style.display = 'block';
    this.hint.textContent = '左键 放置 · R 旋转 · Z 撤销 · B 退出建造';
    // 默认选中第一个配方对应元素
    if (!this.selElement && this.recipes.length) {
      this.selElement = this.recipes[0].element;
    }
    this.updateGhost();
  }

  private close() {
    this.active = false;
    this.bar.style.display = 'none';
    this.hint.style.display = 'none';
    this.ring.visible = false;
    this.clearGhost();
  }

  // ---------------- 选择栏 ----------------
  private renderBar() {
    this.bar.innerHTML = '';
    for (const r of this.recipes) {
      const e = this.elemMap.get(r.element);
      if (!e) continue;
      const item = document.createElement('button');
      item.className = 'bsz-build-item' + (r.element === this.selElement ? ' sel' : '');
      const icon = iconEl(categoryIcon(e.category), 20);
      icon.className += ' bsz-build-icon';
      const nm = document.createElement('span');
      nm.textContent = e.name;
      const cost = document.createElement('span');
      cost.textContent = `¥${r.cost.money}`;
      cost.className = 'bsz-build-cost';
      const cnt = this.opts.getItemCount(r.element);
      const have = document.createElement('span');
      have.textContent = `×${cnt}`;
      have.className = 'bsz-build-have' + (cnt > 0 ? '' : ' zero');
      item.append(icon, nm, cost, have);
      item.onclick = () => {
        this.selElement = r.element;
        this.renderBar();
        this.updateGhost();
      };
      this.bar.appendChild(item);
    }
    // 合成区说明
    const tip = document.createElement('div');
    tip.className = 'bsz-tip';
    tip.style.width = '100%';
    tip.textContent = '点击物品购买（扣款入背包）→ 左键放置消耗 1 个';
    this.bar.appendChild(tip);
  }

  // ---------------- 幽灵预览 ----------------
  private updateGhost() {
    this.clearGhost();
    const e = this.elemMap.get(this.selElement);
    if (!e) return;
    this.ghost = this.buildElementMesh(e, this.ghostMat);
    this.ghost.visible = false;
    this.opts.scene3.add(this.ghost);
  }

  private clearGhost() {
    if (this.ghost) {
      this.opts.scene3.remove(this.ghost);
      this.ghost = null;
    }
  }

  // ---------------- 放置遮挡检测 ----------------
  /** 计算放置元素在 (gx,gz) 的水平占地半径（基于 ghost 包围盒，无 ghost 时给默认 GRID/2） */
  private placementRadius(): number {
    if (this.ghost) {
      const bb = new THREE.Box3().setFromObject(this.ghost);
      if (!bb.isEmpty()) {
        const sz = new THREE.Vector3(); bb.getSize(sz);
        return Math.max(sz.x, sz.z) / 2 + 0.6;   // 0.6 留缝，避免贴墙
      }
    }
    return GRID / 2;
  }

  /**
   * 放置点是否被占据：与既有建筑（collision 世界）或已放置物重叠。
   * 世界建筑注册在 collision 单例（圆形近似）；已放置物按各自 group 包围盒精确判。
   */
  private isBlocked(gx: number, gz: number): boolean {
    const r = this.placementRadius();
    // 与既有建筑碰撞（世界静态体，圆形近似）
    if (collision.blocked(gx, gz, r)) return true;
    // 与已放置物重叠（逐个体检测，避免整组包围盒过于保守）
    const probe = new THREE.Box3(
      new THREE.Vector3(gx - r, -1e6, gz - r),
      new THREE.Vector3(gx + r, 1e6, gz + r),
    );
    for (const [, g] of this.meshes) {
      const bb = new THREE.Box3().setFromObject(g);
      if (!bb.isEmpty() && probe.intersectsBox(bb)) return true;
    }
    return false;
  }

  // ---------------- 每帧：光标投影 ----------------
  update() {
    if (!this.active) return;
    if (!this.lastPointer) return;
    this.raycaster.setFromCamera(this.lastPointer, this.opts.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.cursor);
    if (!hit) { this.cursorValid = false; return; }

    const pp = this.opts.getPlayerPos();
    const d = Math.hypot(this.cursor.x - pp.x, this.cursor.z - pp.z);
    this.cursorValid = d <= MAX_RANGE;

    // 网格吸附
    const gx = Math.round(this.cursor.x / GRID) * GRID;
    const gz = Math.round(this.cursor.z / GRID) * GRID;

    if (this.ghost) {
      this.ghost.visible = true;
      this.ghost.position.set(gx, 0, gz);
      this.ghost.rotation.y = this.rotStep * Math.PI / 2;
      // 遮挡检测：放置点被现有建筑/已放置物占据 → 禁止（防止「隔空」放进楼里）
      const blocked = this.isBlocked(gx, gz);
      const ok = this.cursorValid && this.opts.getItemCount(this.selElement) > 0 && !blocked;
      this.ghostMat.color.setHex(ok ? 0x7ad0ff : 0xff5a5a);
      this.ghostMat.opacity = ok ? 0.45 : 0.3;
    }

    // 范围圈跟随玩家
    this.ring.position.x = pp.x;
    this.ring.position.z = pp.z;
  }

  private lastPointer: THREE.Vector2 | null = null;
  private onPointerMove = (ev: PointerEvent) => {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.lastPointer = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };

  private onPointerDown = (ev: PointerEvent) => {
    if (!this.active || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    // 先更新光标位置
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.lastPointer = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.update();
    this.tryPlace();
  };

  // ---------------- 放置 / 撤销 ----------------
  private tryPlace() {
    if (this.placing) return;
    if (!this.cursorValid) { this.opts.toast('超出建造范围'); return; }
    const e = this.elemMap.get(this.selElement);
    if (!e) return;

    // 背包不足 → 自动购买（配方价）
    let cnt = this.opts.getItemCount(e.id);
    if (cnt <= 0) {
      const r = this.recipes.find(r => r.element === e.id);
      if (!r) { this.opts.toast('无此配方'); return; }
      if (!this.opts.spend(r.cost.money)) { this.opts.toast('余额不足，拍照赚钱吧'); return; }
      this.opts.addItem(e.id, 1);
      this.opts.toast(`已购买 ${e.name}（-¥${r.cost.money}）`);
    }
    this.opts.addItem(e.id, -1);

    if (this.meshes.size >= MAX_PLACEMENTS) { this.opts.toast('放置数已达上限'); return; }

    const gx = Math.round(this.cursor.x / GRID) * GRID;
    const gz = Math.round(this.cursor.z / GRID) * GRID;

    // 遮挡检测：目标点被建筑/已放置物占据则拒绝放置（防止隔空放进楼里）
    if (this.isBlocked(gx, gz)) { this.opts.toast('该位置被建筑占据'); return; }

    // 实体网格
    const g = this.buildElementMesh(e);
    g.position.set(gx, 0, gz);
    g.rotation.y = this.rotStep * Math.PI / 2;
    this.placedGroup.add(g);

    const n = this.nextN++;
    this.meshes.set(n, g);
    this.placementMeta.set(n, { element: e.id });
    const rot = this.rotStep * Math.PI / 2;
    this.opts.onPlace({ n, element: e.id, x: gx, y: 0, z: gz, rot });
    this.placing = true;
    setTimeout(() => { this.placing = false; }, 120);
    this.renderBar();
  }

  private undo() {
    if (!this.meshes.size) { this.opts.toast('没有可撤销的放置'); return; }
    // 撤销最近一次
    let lastN = 0;
    for (const n of this.meshes.keys()) if (n > lastN) lastN = n;
    const g = this.meshes.get(lastN)!;
    this.placedGroup.remove(g);
    this.meshes.delete(lastN);
    const meta = this.placementMeta.get(lastN);
    if (meta) {
      this.opts.addItem(meta.element, 1);   // 返还物品
      this.placementMeta.delete(lastN);
    }
    this.opts.onRemove(lastN);
    this.renderBar();
  }

  private placementMeta = new Map<number, { element: string }>();

  // ---------------- 键盘 ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (!this.active) {
      if (k === 'b' && !this.panelGuard()) this.open();
      return;
    }
    if (k === 'b') this.close();
    else if (k === 'r') { this.rotStep = (this.rotStep + 1) % 4; }
    else if (k === 'z') this.undo();
  };

  /** 其他面板打开时不响应 B（引擎注入判断） */
  setPanelGuard(fn: () => boolean) { this.panelGuard = fn; }
  private panelGuard: () => boolean = () => false;

  // ---------------- 元素网格构建（数据驱动） ----------------
  private buildElementMesh(e: Element, overrideMat?: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    for (const part of e.geometry) {
      const geo = this.geometryFor(part.kind, part.params);
      const customMat = (geo.userData.customMat as THREE.Material | undefined);
      const mat = overrideMat ?? customMat ?? this.materialFor(part.color, part.material);
      const mesh = new THREE.Mesh(geo, mat);
      // 几何中心偏移（box 等以原点为中心，需平移到数据指定位置）
      const off = geo.userData.offset as [number, number, number] | undefined;
      if (off) {
        const size = new THREE.Vector3();
        geo.boundingBox ?? geo.computeBoundingBox();
        size.copy(geo.boundingBox!.max).sub(geo.boundingBox!.min);
        mesh.position.set(off[0] + size.x / 2, off[1] + size.y / 2, off[2] + size.z / 2);
      }
      if (part.kind === 'sign') {
        const s = (part.params as any).sign;
        if (s.rotation) mesh.rotation.y = s.rotation;
      }
      g.add(mesh);
    }
    return g;
  }

  private geoCache = new Map<string, THREE.BufferGeometry>();
  private geometryFor(kind: string, params: any): THREE.BufferGeometry {
    const key = kind + ':' + JSON.stringify(params);
    let geo = this.geoCache.get(key);
    if (geo) return geo;
    geo = new THREE.BufferGeometry();
    switch (kind) {
      case 'box': {
        const b = params.box;
        geo = new THREE.BoxGeometry(Math.abs(b.x1 - b.x0) || 0.01, Math.abs(b.y1 - b.y0) || 0.01, Math.abs(b.z1 - b.z0) || 0.01);
        geo.userData.offset = [b.x0, b.y0, b.z0];
        break;
      }
      case 'boxC': {
        const c = params.boxC;
        geo = new THREE.BoxGeometry(c.w, c.h, c.d);
        geo.userData.offset = [c.cx - c.w / 2, c.cy - c.h / 2, c.cz - c.d / 2];
        break;
      }
      case 'prism': {
        const p = params.prism;
        geo = new THREE.CylinderGeometry(
          (p.rx1 ?? p.rx0) || 0.01, p.rx0 || 0.01,
          Math.abs(p.y1 - p.y0) || 0.01, p.segments ?? 12,
        );
        geo.userData.offset = [p.x - (p.rx0 || 0) / 2, p.y0, p.z - (p.rz0 || 0) / 2];
        break;
      }
      case 'beam': {
        const m = params.beam;
        const len = Math.hypot(m.x1 - m.x0, m.y1 - m.y0, m.z1 - m.z0) || 0.01;
        geo = new THREE.BoxGeometry(m.w, m.w, len);
        break;
      }
      case 'sign': {
        const s = params.sign;
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d')!;
        const fs = 64;
        ctx.font = `bold ${fs}px 'Microsoft YaHei', sans-serif`;
        const tw = Math.max(...Array.from(s.text).map(() => ctx.measureText('深').width));
        cv.width = Math.ceil(tw * Math.min(s.text.length, 6)) + 24;
        cv.height = fs + 20;
        const ctx2 = cv.getContext('2d')!;
        ctx2.fillStyle = '#' + (s.bg ?? 0x12325e).toString(16).padStart(6, '0');
        ctx2.fillRect(0, 0, cv.width, cv.height);
        ctx2.font = `bold ${fs}px 'Microsoft YaHei', sans-serif`;
        ctx2.fillStyle = '#' + (s.fg ?? 0xffe08a).toString(16).padStart(6, '0');
        ctx2.textBaseline = 'middle';
        ctx2.fillText(s.text, 12, cv.height / 2 + 2);
        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter;
        geo = new THREE.PlaneGeometry(cv.width / fs * s.height, s.height);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        geo.userData.customMat = mat;
        geo.userData.offset = [s.x, s.y, s.z];
        break;
      }
      default:
        geo = new THREE.BoxGeometry(1, 1, 1);
    }
    this.geoCache.set(key, geo);
    return geo;
  }

  private matCache = new Map<string, THREE.MeshStandardMaterial>();
  private materialFor(color: number, _kind: string): THREE.MeshStandardMaterial {
    let m = this.matCache.get('c' + color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
      this.matCache.set('c' + color, m);
    }
    return m;
  }

  // ---------------- 存档恢复 ----------------
  /** 从存档恢复放置物（进世界时调用） */
  restore(placements: { n: number; element: string; x: number; y: number; z: number; rot: number }[]) {
    for (const p of placements) this.spawnPlacement(p);
    const maxN = placements.reduce((m, p) => Math.max(m, p.n), 0);
    this.nextN = maxN + 1;
  }

  /** 放置回调时缓存 meta 以便撤销返还 */
  private spawnPlacement(p: { n: number; element: string; x: number; y: number; z: number; rot: number }) {
    const e = this.elemMap.get(p.element);
    if (!e) return;
    const g = this.buildElementMesh(e);
    // P0：放置物参与投影
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.rot;
    this.placedGroup.add(g);
    this.meshes.set(p.n, g);
    this.placementMeta.set(p.n, { element: p.element });
  }

  /** 放置成功后由引擎调用（同步 meta） */
  notePlaceMeta(p: { n: number; element: string }) {
    this.placementMeta.set(p.n, { element: p.element });
  }

  /** P2-4 导入他人作品：直接生成网格（元素不存在时跳过），返回成功数量 */
  placeImported(p: { n: number; element: string; x: number; y: number; z: number; rot: number }): boolean {
    if (!this.elemMap.has(p.element)) return false;
    if (this.meshes.has(p.n)) return false;
    this.spawnPlacement(p);
    return true;
  }

  dispose() {
    this.close();
    this.bar.remove();
    this.hint.remove();
    this.opts.container.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    this.opts.scene3.remove(this.placedGroup);
    this.opts.scene3.remove(this.ring);
  }
}
