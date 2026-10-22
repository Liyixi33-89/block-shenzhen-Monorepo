// 拍照模式：C 键举起相机 → 视角锁定 → 空格/点击快门 → 入镜判定 + 白闪 + 缩略入册
import * as THREE from 'three';
import type { Scene, Landmark } from '@block-sz/schema';
import { proj } from '@block-sz/shared';
import { iconSvg } from './icons';

export interface PhotoHit {
  landmark: Landmark;
  coverage: number;   // 0-1 入镜占比（近似：距离比）
}

/** 拍照模式扩展回调（自拍/夜景任务上报） */
export interface PhotoExtras {
  isNight: () => boolean;
  noteSelfie: () => void;
  /**
   * 遮挡检测：从相机到地标采样点的射线是否被建筑挡住。
   * 返回 true 表示被遮挡（不计入镜）。缺省不检测（兼容旧调用）。
   */
  isOccluded?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}

export class PhotoMode {
  active = false;
  /** 自拍模式：翻转相机视角对准玩家，快门上报 daily:selfie */
  selfie = false;
  private overlay: HTMLDivElement;
  private frame: HTMLDivElement;
  private flash: HTMLDivElement;
  private onShot: (hits: PhotoHit[]) => void;
  private landmarks: Scene['landmarks'];
  private extras: PhotoExtras;

  constructor(container: HTMLElement, landmarks: Scene['landmarks'], onShot: (hits: PhotoHit[]) => void, extras: PhotoExtras) {
    this.landmarks = landmarks;
    this.onShot = onShot;
    this.extras = extras;

    // 相机取景框覆盖层
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position:absolute; inset:0; z-index:6; display:none;
      pointer-events:none; background:rgba(0,0,0,0.25);
    `;
    // 取景框（四角括号）
    this.frame = document.createElement('div');
    this.frame.style.cssText = `
      position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
      width:62%; height:70%; border:2px solid rgba(255,255,255,0.85); border-radius:6px;
      box-shadow:0 0 0 9999px rgba(0,0,0,0.28);
    `;
    // 四角括号
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as number[][]) {
      const c = document.createElement('div');
      c.style.cssText = `position:absolute; width:26px; height:26px;
        border-color:#7ad0ff; border-style:solid;
        border-width:${y ? '0 3px 3px 0' : '3px 0 0 3px'};
        ${x ? 'right:-3px' : 'left:-3px'}; ${y ? 'bottom:-3px' : 'top:-3px'}; border-radius:2px;`;
      this.frame.appendChild(c);
    }
    // 提示文字
    const tip = document.createElement('div');
    tip.innerHTML = `${iconSvg('camera', 14)} 取景中 · <b>空格</b>快门 · <b>C</b> 收起`;
    tip.className = 'bsz-photo-tip';
    this.frame.appendChild(tip);

    // 闪光层
    this.flash = document.createElement('div');
    this.flash.style.cssText = `position:absolute; inset:0; background:#fff; opacity:0;
      transition:opacity 0.1s; z-index:7; pointer-events:none;`;

    this.overlay.appendChild(this.frame);
    container.appendChild(this.overlay);
    container.appendChild(this.flash);
  }

  toggle(): boolean {
    this.active = !this.active;
    this.overlay.style.display = this.active ? 'block' : 'none';
    if (!this.active) this.selfie = false;
    return this.active;
  }

  /** 切换自拍模式（需相机举起后）：翻转视角朝向玩家，快门记 daily:selfie */
  toggleSelfie(): boolean {
    if (!this.active) return false;
    this.selfie = !this.selfie;
    this.frame.style.borderColor = this.selfie ? '#ff8fb0' : 'rgba(255,255,255,0.85)';
    return this.selfie;
  }

  /**
   * 快门：入镜判定 = 地标多个高度采样点在相机视野锥内
   * （塔基/中部/顶部多点采样，命中任一即入镜；覆盖率取最近点）
   */
  shoot(camera: THREE.PerspectiveCamera): PhotoHit[] {
    // 白闪
    this.flash.style.opacity = '1';
    setTimeout(() => { this.flash.style.opacity = '0'; }, 120);

    // 自拍模式：记录每日自拍，主体为玩家本人（不入地标册）
    if (this.selfie) {
      this.extras.noteSelfie();
      this.onShot([]);
      return [];
    }

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const camPos = camera.position;
    const hits: PhotoHit[] = [];

    const fovHalf = (camera.fov * Math.PI / 180) / 2;
    for (const l of this.landmarks) {
      const p = proj(l.latlng.lat, l.latlng.lng);
      // 距离门槛：近处（1200 内）才可入镜，远景只能用相机拉近拍
      const distGround = Math.hypot(p.x - camPos.x, p.z - camPos.z);
      if (distGround > 1200) continue;

      // 高度采样点：地基 / 中段 / 高处
      const sampleYs = [8, 30, 64];
      let best: number | null = null;

      for (const sy of sampleYs) {
        const to = new THREE.Vector3(p.x - camPos.x, sy - camPos.y, p.z - camPos.z);
        const dist = to.length();
        if (dist < 2) continue;

        const dot = to.normalize().dot(camDir);
        if (dot < 0.55) continue;                       // 视野前方窄锥（约 56°）
        const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
        if (angle > fovHalf * 1.35) continue;           // 接近实际 FOV

        // 遮挡检测：采样点被建筑挡住则跳过（任一采样点可见即算入镜）
        if (this.extras.isOccluded) {
          const target = new THREE.Vector3(p.x, sy, p.z);
          if (this.extras.isOccluded(camPos, target)) continue;
        }

        const coverage = THREE.MathUtils.clamp(1 - dist / 1200, 0.08, 1);
        if (best === null || coverage > best) best = coverage;
      }
      if (best !== null) hits.push({ landmark: l, coverage: best });
    }
    hits.sort((a, b) => b.coverage - a.coverage);
    this.onShot(hits);
    return hits;
  }

  dispose() {
    this.overlay.remove();
    this.flash.remove();
  }
}
