// 天气系统：晴天/多云/雨/雪 随机切换，雨雪以粒子系统呈现
// 简化实现：粒子用 THREE.Points，随雨/雪生成并下落，天气由内部计时器随机推进
import * as THREE from 'three';

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow';

const WEATHER_POOL: WeatherKind[] = ['sunny', 'sunny', 'cloudy', 'rain', 'snow'];
const WEATHER_NAMES: Record<WeatherKind, string> = {
  sunny: '晴', cloudy: '多云', rain: '雨', snow: '雪',
};

export class WeatherSystem {
  kind: WeatherKind = 'sunny';
  private scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private geo: THREE.BufferGeometry | null = null;
  private positions: Float32Array | null = null;
  private count = 600;
  private switchTimer = 0;
  /** 外部通知天气变化（HUD/NPC 对白） */
  onChange: ((k: WeatherKind) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pickWeather();
  }

  /** 天气名（HUD 显示） */
  get label(): string { return WEATHER_NAMES[this.kind]; }

  /** 是否降水（雨/雪） */
  get precipitating(): boolean { return this.kind === 'rain' || this.kind === 'snow'; }

  private pickWeather() {
    const prev = this.kind;
    let next = WEATHER_POOL[Math.floor(Math.random() * WEATHER_POOL.length)];
    if (next === prev) next = prev === 'sunny' ? 'cloudy' : 'sunny';
    this.kind = next;
    this.switchTimer = 30 + Math.random() * 50;   // 30-80 秒后再考虑切换
    if (this.precipitating) this.spawnParticles();
    else this.removeParticles();
    if (next !== prev) this.onChange?.(next);
  }

  private spawnParticles() {
    this.removeParticles();
    this.count = this.kind === 'rain' ? 900 : 500;
    this.positions = new Float32Array(this.count * 3);
    const range = 2600;
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * range;
      this.positions[i * 3 + 1] = Math.random() * 400;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * range;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const isSnow = this.kind === 'snow';
    const tex = this.makeParticleTex(isSnow ? '#ffffff' : '#9fc6e8', isSnow ? 3 : 2);
    const mat = new THREE.PointsMaterial({
      map: tex, size: isSnow ? 5 : 3, transparent: true,
      opacity: isSnow ? 0.95 : 0.7, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private makeParticleTex(color: string, r: number): THREE.Texture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(16, 16, r, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  private removeParticles() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points = null;
      this.geo = null;
      this.positions = null;
    }
  }

  /** 每帧推进：粒子下落 + 天气切换计时 */
  update(dt: number) {
    this.switchTimer -= dt;
    if (this.switchTimer <= 0) { this.pickWeather(); return; }
    if (!this.precipitating || !this.positions) return;
    const fall = this.kind === 'snow' ? 6 : 40;
    for (let i = 0; i < this.count; i++) {
      let y = this.positions[i * 3 + 1] - fall * dt;
      if (this.kind === 'snow') {
        this.positions[i * 3] += Math.sin((i + y) * 0.02) * 2 * dt;   // 雪横飘
      }
      if (y < 0) y = 400;
      this.positions[i * 3 + 1] = y;
    }
    this.geo!.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.removeParticles();
  }
}