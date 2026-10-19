// 程序化贴图生成（Canvas 绘制，零外部资源）：
// - 建筑外立面窗格贴图 + 法线贴图
// - 地面砖石/草地纹理 + 法线贴图
// 全部按缓存复用，避免重复创建。
import * as THREE from 'three';

const texCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  return tex;
}

/** 生成外立面贴图：基色墙面 + 规则窗格阵列 + 底层色差（模拟楼层分隔） */
function drawFacade(base: string, w: number, h: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  // 墙面色 + 微噪声
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // 窗格：3 列 x 4 行，带窗框
  const cols = 3, rows = 4;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.12, y = r * ch + ch * 0.12;
      const ww = cw * 0.76, wh = ch * 0.76;
      // 窗框
      ctx.fillStyle = '#2a2f36';
      ctx.fillRect(x - 2, y - 2, ww + 4, wh + 4);
      // 窗面（带轻微随机色偏，营造玻璃感）
      const lit = rnd() > 0.35;
      ctx.fillStyle = lit ? 'rgba(160,200,230,0.85)' : 'rgba(80,110,140,0.9)';
      ctx.fillRect(x, y, ww, wh);
      // 窗内十字格
      ctx.strokeStyle = 'rgba(30,35,45,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + wh);
      ctx.moveTo(x, y + wh / 2); ctx.lineTo(x + ww, y + wh / 2);
      ctx.stroke();
    }
  }
  // 楼层分隔线
  ctx.fillStyle = 'rgba(20,25,32,0.35)';
  for (let r = 1; r < rows; r++) ctx.fillRect(0, r * ch - 1.5, w, 3);
  return cv;
}

/** 外立面法线贴图：窗格凹陷（窗格区域朝内，墙面平坦） */
function drawFacadeNormal(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#8080ff'; // 法线朝上（Z 正）
  ctx.fillRect(0, 0, w, h);
  const cols = 3, rows = 4;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.12, y = r * ch + ch * 0.12;
      const ww = cw * 0.76, wh = ch * 0.76;
      // 窗面法线朝 Z 负（凹陷）→ 蓝紫色
      ctx.fillStyle = '#6b68ff';
      ctx.fillRect(x, y, ww, wh);
    }
  }
  return cv;
}

/** 地面贴图：砖石/草地色块 + 噪声颗粒（提供凹凸细节） */
function drawGround(type: 'grass' | 'stone' | 'soil', w: number, h: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const base = type === 'grass' ? '#7fa871' : type === 'stone' ? '#9aa5b0' : '#8f9a88';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  // 噪声颗粒
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h;
    const v = Math.floor(rnd() * 30) - 15;
    ctx.fillStyle = `rgba(${v < 0 ? 0 : 40 + v}, ${v < 0 ? 60 : 90 + v}, ${v < 0 ? 40 : 70 + v}, 0.5)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // 砖缝（stone 才画）
  if (type === 'stone') {
    ctx.strokeStyle = 'rgba(50,55,65,0.4)';
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }
  return cv;
}

/** 地面法线贴图：整体平坦，仅轻微颗粒凹凸 */
function drawGroundNormal(w: number, h: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 500; i++) {
    const x = rnd() * w, y = rnd() * h;
    const d = Math.floor(rnd() * 20) - 10;
    ctx.fillStyle = `rgb(${128 + d},${128 + d},255)`;
    ctx.fillRect(x, y, 2, 2);
  }
  return cv;
}

/**
 * 建筑外立面材质（按基色 + repeat 缓存，保合并优化）。
 * 返回带窗格 map 与 normalMap 的标准材质。
 */
export function facadeMaterial(baseColor: number, repeat: number, seed = 7): THREE.MeshStandardMaterial {
  const key = `fac:${baseColor}:${repeat}`;
  let tex = texCache.get(key);
  let norm = normalCache.get(key);
  if (!tex) {
    const hex = '#' + baseColor.toString(16).padStart(6, '0');
    const W = 96, H = 128;
    tex = toTexture(drawFacade(hex, W, H, seed));
    tex.repeat.set(repeat, Math.max(1, Math.floor(repeat * 1.4)));
    texCache.set(key, tex);
    norm = toTexture(drawFacadeNormal(W, H), false);
    norm.repeat.set(repeat, Math.max(1, Math.floor(repeat * 1.4)));
    normalCache.set(key, norm);
  }
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    normalMap: norm,
    roughness: 0.85,
    metalness: 0.05,
  });
  return m;
}

/**
 * 地面材质：纹理 + 法线贴图（增加凹凸感）。
 */
export function groundMaterial(type: 'grass' | 'stone' | 'soil', repeat: number, seed = 3): THREE.MeshStandardMaterial {
  const key = `grnd:${type}:${repeat}`;
  let tex = texCache.get(key);
  let norm = normalCache.get(key);
  if (!tex) {
    const W = 128, H = 128;
    tex = toTexture(drawGround(type, W, H, seed));
    tex.repeat.set(repeat, repeat);
    texCache.set(key, tex);
    norm = toTexture(drawGroundNormal(W, H, seed + 1), false);
    norm.repeat.set(repeat, repeat);
    normalCache.set(key, norm);
  }
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    normalMap: norm,
    roughness: 1,
    metalness: 0,
  });
}