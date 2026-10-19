// 日夜循环：虚拟时钟驱动天空/日光/雾/曝光，提供夜晚判定（拍照/夜景任务用）
// 纯 engine 层：持有 atmosphere 句柄 + 渲染器，每帧 update 推进
import * as THREE from 'three';
import type { LightingRig } from './atmosphere';

/** 一个真实秒对应多少游戏秒（40 → 一天 1440 游戏分 = 36 真实分钟） */
const SEC_PER_REAL_SEC = 40;
/** 起始游戏时刻（8:00） */
const START_HOUR = 8;
/** 夜晚判定区间（游戏小时） */
const NIGHT_START = 19.5;
const NIGHT_END = 6.5;

export interface DayNightHandles {
  lighting: LightingRig;
  skyMat: THREE.ShaderMaterial;
  fog: THREE.Fog;
  renderer: THREE.WebGLRenderer;
}

export class DayNightSystem {
  private gameMinutes: number;   // 自 0:00 起的游戏分钟
  private handles: DayNightHandles;

  constructor(handles: DayNightHandles) {
    this.handles = handles;
    this.gameMinutes = START_HOUR * 60;
  }

  /** 当前游戏小时（0-24） */
  get hour(): number {
    return (this.gameMinutes % 1440) / 60;
  }

  /** 是否夜晚（供拍照/夜景任务判定） */
  isNight(): boolean {
    const h = this.hour;
    return h >= NIGHT_START || h < NIGHT_END;
  }

  /** 游戏钟面字符串（HH:MM） */
  clockString(): string {
    const m = Math.floor(this.gameMinutes % 1440);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** 每帧推进：dt 为真实秒 */
  update(dt: number) {
    this.gameMinutes += dt * SEC_PER_REAL_SEC / 60;
    this.apply();
  }

  /** 夜晚判定辅助（静态，给外部直接查游戏小时） */
  static isNightHour(h: number): boolean {
    return h >= NIGHT_START || h < NIGHT_END;
  }

  /** 按当前时刻插值调整氛围 */
  private apply() {
    const h = this.hour;
    const { lighting, skyMat, fog, renderer } = this.handles;

    // 太阳仰角：0 为午夜，1 为正午（正弦曲线，昼夜渐变）
    const sunAngle = Math.sin(((h - 6) / 24) * Math.PI * 2);   // 6 点出地平线，18 点落
    const daylight = THREE.MathUtils.clamp(sunAngle, 0, 1);
    const twilight = THREE.MathUtils.clamp(1 - Math.abs(h - 12) / 9, 0, 1); // 正午最亮

    // 日光强度（正午 2.0，夜 0）
    lighting.sun.intensity = THREE.MathUtils.lerp(0, 2.0, daylight) * (0.4 + 0.6 * twilight);
    // 天光（夜晚微弱月光感）
    lighting.hemi.intensity = THREE.MathUtils.lerp(0.25, 1.0, daylight);
    // 补光夜晚提一点（冷色月光）
    lighting.fill.intensity = THREE.MathUtils.lerp(0.12, 0.28, daylight);

    // 日光颜色：白昼暖白 → 清晨/黄昏暖橙 → 夜冷蓝
    const day = new THREE.Color(0xfff0d0);
    const dawn = new THREE.Color(0xffb06a);
    const night = new THREE.Color(0x3a4a8a);
    const sunColor = new THREE.Color().copy(night).lerp(day, daylight).lerp(dawn, (1 - twilight) * (1 - daylight));
    lighting.sun.color.copy(sunColor);

    // 天空色带（uniforms）
    const skyTop = new THREE.Color(0x0a1a3a).lerp(new THREE.Color(0x3a7ca8), daylight);
    const skyMid = new THREE.Color(0x0a1830).lerp(new THREE.Color(0x87c5eb), daylight);
    const skyBot = new THREE.Color(0x081020).lerp(new THREE.Color(0xd8e8f2), daylight);
    skyMat.uniforms.topColor.value.copy(skyTop);
    skyMat.uniforms.midColor.value.copy(skyMid);
    skyMat.uniforms.botColor.value.copy(skyBot);

    // 雾色/浓度（夜更浓更暗）
    const fogDay = new THREE.Color(0xbfd4e6);
    const fogNight = new THREE.Color(0x0a1526);
    fog.color.copy(fogDay).lerp(fogNight, 1 - daylight);
    fog.near = THREE.MathUtils.lerp(500, 1200, daylight);
    fog.far = THREE.MathUtils.lerp(2400, 5600, daylight);

    // 曝光：白昼 1.0，夜稍提亮避免全黑
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.35, 1.0, daylight);
  }
}