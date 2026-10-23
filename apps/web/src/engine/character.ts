// Minecraft 风格角色皮肤系统：64×64 像素皮肤生成 + 方块化身（可换肤/配饰/动画）
// 移植自广州参考项目 character.js，PX 适配深圳玩家总高（约 7.6 单位，兼容 deckCam/碰撞）
import * as THREE from 'three';

/** 每像素世界单位：玩家总高 32px → 约 7.6 单位 */
const PX = 0.2375;

export const SKIN_TONES = ['#f3d2b3', '#e8bc96', '#d9a47c', '#c48a62', '#a8704c'];
export const HAIR_COLORS = ['#1a1410', '#3a2a1e', '#5a3a22', '#8a5a2a', '#c8a060', '#d8d8d8', '#a83a2a', '#2a3a6a'];

/** 玩家皮肤参数（存档/面板共用） */
export interface SkinParams {
  gender: 'm' | 'f';
  skin: string;
  hair: string;
  hairStyle: 'short' | 'long' | 'bald';
  shirt: string;
  pants: string;
  shoes: string;
  longSleeve: boolean;
  shorts: boolean;
  glasses: boolean;
  dress: boolean;
  seed: number;
}

export function defaultSkin(): SkinParams {
  return {
    gender: 'm', skin: SKIN_TONES[0], hair: HAIR_COLORS[0], hairStyle: 'short',
    shirt: '#c8282a', pants: '#2a3a5a', shoes: '#222222',
    longSleeve: false, shorts: false, glasses: false, dress: false, seed: 1,
  };
}

/** 确定性伪随机（移植 util.js mulberry32） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(r: () => number, arr: T[]): T { return arr[Math.floor(r() * arr.length)]; }

function px(g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

// 盒子 UV 区域填充（u,v 为皮肤坐标原点；w,h,d 像素）
function fillBox(g: CanvasRenderingContext2D, u: number, v: number, w: number, h: number, d: number, color: string) {
  px(g, color, u + d, v, w * 2, d);
  px(g, color, u, v + d, d * 2 + w * 2, h);
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// 生成 64×64 皮肤贴图
export function makeSkinCanvas(p: Partial<SkinParams> & { type?: string; tie?: string }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = mulberry32(p.seed || 1);
  const skin = p.skin || SKIN_TONES[0];
  const hair = p.hair || HAIR_COLORS[0];
  const shirt = p.shirt || '#3a7ad0';
  const pants = p.pants || '#2a2a3a';
  const shoes = p.shoes || '#222222';
  const gender = p.gender === 'f' ? 'f' : 'm';
  const hairStyle = p.hairStyle || 'short';
  // 头
  fillBox(g, 0, 0, 8, 8, 8, skin);
  // 头发：顶部、后脑、两侧上部、前额
  px(g, hair, 8, 0, 8, 8); // top
  px(g, hair, 24, 8, 8, gender === 'f' || hairStyle === 'long' ? 8 : 5); // back
  px(g, hair, 0, 8, 8, gender === 'f' ? 7 : 3); // right side
  px(g, hair, 16, 8, 8, gender === 'f' ? 7 : 3); // left side
  px(g, hair, 8, 8, 8, hairStyle === 'bald' ? 0 : 2); // fringe
  if (gender === 'f') {
    px(g, hair, 8, 8, 1, 6);
    px(g, hair, 15, 8, 1, 6);
  }
  if (p.type === 'elder') {
    px(g, '#d8d8d8', 8, 0, 8, 8);
    px(g, '#d8d8d8', 24, 8, 8, 4);
  }
  // 脸
  const eye = p.type === 'kid' ? '#2a1a10' : '#1a1a2a';
  px(g, '#ffffff', 9, 12, 2, 1);
  px(g, '#ffffff', 13, 12, 2, 1);
  px(g, eye, 10, 12, 1, 1);
  px(g, eye, 13, 12, 1, 1);
  px(g, shade(skin, 0.85), 11, 13, 2, 1);
  px(g, gender === 'f' ? '#c0505a' : shade(skin, 0.65), 10, 14, 4, 1);
  if (gender === 'f') {
    px(g, '#e8a0a0', 9, 13, 1, 1);
    px(g, '#e8a0a0', 14, 13, 1, 1);
  }
  if (p.glasses || p.type === 'elder') {
    px(g, '#333', 9, 11, 6, 1);
    px(g, '#333', 9, 12, 1, 1);
    px(g, '#333', 14, 12, 1, 1);
  }
  if (p.type === 'elder') px(g, shade(skin, 0.8), 9, 15, 6, 1);
  // 身体
  fillBox(g, 16, 16, 8, 12, 4, shirt);
  px(g, shade(shirt, 0.8), 20, 31, 8, 1);
  px(g, skin, 22, 20, 4, 1); // 领口
  // 手臂（右 40,16；左 32,48）
  for (const [u, v] of [[40, 16], [32, 48]]) {
    fillBox(g, u, v, 4, 12, 4, skin);
    const sleeve = p.longSleeve ? 12 : 4;
    px(g, shirt, u, v + 4, 16, sleeve);
    px(g, shirt, u + 4, v, 4, 4);
  }
  // 腿（右 0,16；左 16,48）
  for (const [u, v] of [[0, 16], [16, 48]]) {
    fillBox(g, u, v, 4, 12, 4, pants);
    px(g, shoes, u, v + 4 + 9, 16, 3);
    px(g, shoes, u + 8, v, 4, 4);
    if (p.shorts) px(g, skin, u, v + 4 + 5, 16, 4);
  }
  // 类型细节
  if (p.type === 'office') {
    px(g, '#ffffff', 20, 20, 8, 12);
    px(g, p.tie || '#a02a2a', 23, 20, 2, 8);
    px(g, shirt, 20, 20, 2, 12);
    px(g, shirt, 26, 20, 2, 12);
  } else if (p.type === 'student') {
    px(g, '#f2f2f2', 20, 20, 8, 12);
    px(g, '#2a5ac8', 20, 20, 2, 12);
    px(g, '#2a5ac8', 26, 20, 2, 12);
    for (const [u, v] of [[40, 16], [32, 48]]) px(g, '#2a5ac8', u, v + 4, 16, 2);
  } else if (p.type === 'tourist') {
    for (let i = 0; i < 6; i++) px(g, pick(r, ['#f2c230', '#e05050', '#50a0e0', '#ffffff']), 20 + Math.floor(r() * 7), 21 + Math.floor(r() * 10), 1, 1);
  } else if (p.type === 'elder') {
    px(g, shade(shirt, 0.85), 23, 20, 2, 12);
    for (let y = 22; y < 32; y += 3) px(g, '#c8a040', 23, y, 2, 1);
  }
  if (gender === 'f' && p.dress) {
    px(g, shirt, 0, 20, 16, 6);
    px(g, shirt, 16, 52, 16, 6);
  }
  return c;
}

function boxUV(geo: THREE.BufferGeometry, u: number, v: number, w: number, h: number, d: number) {
  // BoxGeometry 面顺序: +x, -x, +y, -y, +z, -z
  const S = 64;
  const rects = [
    [u + d + w, v + d, d, h], // +x：左侧
    [u, v + d, d, h], // -x：右侧
    [u + d, v, w, d], // +y：顶
    [u + d + w, v, w, d], // -y：底
    [u + d, v + d, w, h], // +z：正面
    [u + 2 * d + w, v + d, w, h], // -z：背面
  ];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [x, y, ww, hh] = rects[f];
    const u0 = x / S, u1 = (x + ww) / S, v1 = 1 - y / S, v0 = 1 - (y + hh) / S;
    const i = f * 4;
    uv.setXY(i, u0, v1);
    uv.setXY(i + 1, u1, v1);
    uv.setXY(i + 2, u0, v0);
    uv.setXY(i + 3, u1, v0);
  }
  uv.needsUpdate = true;
}

function part(mat: THREE.Material, w: number, h: number, d: number, u: number, v: number, pivotY: number, inflate = 0) {
  const geo = new THREE.BoxGeometry((w + inflate) * PX, (h + inflate) * PX, (d + inflate) * PX);
  boxUV(geo, u, v, w, h, d);
  geo.translate(0, -h * PX * 0.5 + pivotY * PX, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

const texCache = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();
export function skinTexture(canvas: HTMLCanvasElement) {
  let t = texCache.get(canvas);
  if (!t) {
    t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(canvas, t);
  }
  return t;
}

/** 方块化身：脚底 y=0，髋 12px，肩 24px，头底 24px */
export class Character {
  group: THREE.Group;
  root: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  legR: THREE.Mesh; legL: THREE.Mesh;
  body: THREE.Mesh; armR: THREE.Mesh; armL: THREE.Mesh;
  head: THREE.Mesh;
  acc: Record<string, THREE.Object3D> = {};
  private phase: number;
  private animT = 0;
  private anim = 'idle';

  constructor(skinCanvas: HTMLCanvasElement, opts: { scale?: number; accessories?: string[] } = {}) {
    const scale = opts.scale || 1;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ map: skinTexture(skinCanvas), transparent: false, alphaTest: 0.5 });
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.group.add(this.root);
    // 身体结构（单位：像素）
    this.legR = part(this.mat, 4, 12, 4, 0, 16, 0);
    this.legL = part(this.mat, 4, 12, 4, 16, 48, 0);
    this.legR.position.set(-2 * PX, 12 * PX, 0);
    this.legL.position.set(2 * PX, 12 * PX, 0);
    this.body = part(this.mat, 8, 12, 4, 16, 16, 6);
    this.body.position.set(0, 18 * PX, 0);
    this.armR = part(this.mat, 4, 12, 4, 40, 16, 2);
    this.armL = part(this.mat, 4, 12, 4, 32, 48, 2);
    this.armR.position.set(-6 * PX, 22 * PX, 0);
    this.armL.position.set(6 * PX, 22 * PX, 0);
    this.head = part(this.mat, 8, 8, 8, 0, 0, 8);
    this.head.position.set(0, 24 * PX, 0);
    this.root.add(this.legR, this.legL, this.body, this.armR, this.armL, this.head);
    this.phase = Math.random() * 10;
    if (opts.accessories) for (const a of opts.accessories) this.addAccessory(a);
  }

  setSkin(canvas: HTMLCanvasElement) {
    this.mat.map = skinTexture(canvas);
    this.mat.needsUpdate = true;
  }

  addAccessory(kind: string): THREE.Object3D | null {
    if (this.acc[kind]) return this.acc[kind];
    const m = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    let o: THREE.Object3D | null = null;
    if (kind === 'hat') {
      o = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(10 * PX, 2 * PX, 10 * PX), m(0xf2e0a0));
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(8.4 * PX, 3 * PX, 8.4 * PX), m(0xf2e0a0));
      b1.position.y = 8.2 * PX; b2.position.y = 9.5 * PX;
      o.add(b1, b2);
      this.head.add(o);
    } else if (kind === 'cap') {
      o = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(8.4 * PX, 2.5 * PX, 8.4 * PX), m(0xd83030));
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(8 * PX, 0.6 * PX, 4 * PX), m(0xd83030));
      b1.position.y = 8.4 * PX; b2.position.set(0, 7.6 * PX, 5.5 * PX);
      o.add(b1, b2);
      this.head.add(o);
    } else if (kind === 'backpack') {
      o = new THREE.Mesh(new THREE.BoxGeometry(7 * PX, 8 * PX, 3 * PX), m(0x2a6ab0));
      o.position.set(0, 0, -3.5 * PX);
      this.body.add(o);
    } else if (kind === 'camera') {
      o = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(4 * PX, 3 * PX, 2.5 * PX), m(0x222222));
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.8 * PX, 1.8 * PX, 1.8 * PX), m(0x555555));
      l.position.z = 2 * PX;
      o.add(c, l);
      o.position.set(0, -11 * PX, 2.5 * PX);
      this.armR.add(o);
    } else if (kind === 'briefcase') {
      o = new THREE.Mesh(new THREE.BoxGeometry(1.5 * PX, 6 * PX, 8 * PX), m(0x3a2a1a));
      o.position.set(-0.5 * PX, -13.5 * PX, 0);
      this.armL.add(o);
    } else if (kind === 'cane') {
      o = new THREE.Mesh(new THREE.BoxGeometry(1 * PX, 14 * PX, 1 * PX), m(0x6a4a2a));
      o.position.set(0, -15 * PX, 2 * PX);
      this.armR.add(o);
    } else if (kind === 'umbrella') {
      o = new THREE.Group();
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.8 * PX, 20 * PX, 0.8 * PX), m(0x444444));
      const top = new THREE.Mesh(new THREE.BoxGeometry(22 * PX, 2 * PX, 22 * PX), m(pick(Math.random, [0xd83030, 0x2a6ab0, 0xf2c230, 0x2a8a4a, 0xe070a0])));
      top.position.y = 10 * PX;
      const top2 = new THREE.Mesh(new THREE.BoxGeometry(14 * PX, 2 * PX, 14 * PX), top.material);
      top2.position.y = 12 * PX;
      o.add(s, top, top2);
      o.position.set(0, -10 * PX, 0);
      o.rotation.x = 1.2;
      this.armL.add(o);
    } else if (kind === 'phone') {
      o = new THREE.Mesh(new THREE.BoxGeometry(2.4 * PX, 4 * PX, 0.6 * PX), m(0x111111));
      o.position.set(0, -12 * PX, 1.5 * PX);
      this.armR.add(o);
    } else if (kind === 'bag') {
      o = new THREE.Mesh(new THREE.BoxGeometry(2 * PX, 5 * PX, 5 * PX), m(0xc03a6a));
      o.position.set(2.5 * PX, -10 * PX, 0);
      this.armL.add(o);
    }
    if (o) {
      o.traverse((x) => { if ((x as THREE.Mesh).isMesh) (x as THREE.Mesh).castShadow = true; });
      this.acc[kind] = o;
    }
    return o;
  }

  showAccessory(kind: string, v: boolean) {
    if (v && !this.acc[kind]) this.addAccessory(kind);
    if (this.acc[kind]) this.acc[kind].visible = v;
  }

  setAnim(a: string) {
    if (this.anim !== a) { this.anim = a; this.animT = 0; }
  }

  update(dt: number, speed = 0) {
    this.animT += dt;
    const sp = Math.min(1.6, speed / 6);
    this.phase += dt * (4 + speed * 1.1);
    const sw = Math.sin(this.phase) * 0.9 * sp;
    let aR = sw, aL = -sw, lR = -sw, lL = sw;
    let azR = 0, azL = 0, headX = 0, bodyY = 0;
    const a = this.anim;
    if (speed < 0.2) {
      const br = Math.sin(this.animT * 1.6) * 0.04;
      aR = br; aL = -br; lR = 0; lL = 0;
      azR = 0.03; azL = -0.03;
    }
    if (a === 'photo') { aR = -1.5; azR = 0.3; aL = -1.4; azL = -0.4; headX = 0.05; }
    else if (a === 'wave') { aR = Math.PI; azR = 0.3 + Math.sin(this.animT * 8) * 0.4; }
    else if (a === 'pose') { aR = -Math.PI * 0.85; azR = 0.5; aL = -0.2; azL = -0.4; }
    else if (a === 'talk') { headX = Math.sin(this.animT * 5) * 0.08; aR = -0.4 + Math.sin(this.animT * 3) * 0.2; }
    else if (a === 'sit') { lR = lL = -Math.PI / 2; bodyY = -10 * PX; aR = aL = -0.6; }
    this.armR.rotation.set(aR, 0, azR);
    this.armL.rotation.set(aL, 0, azL);
    this.legR.rotation.x = lR;
    this.legL.rotation.x = lL;
    this.head.rotation.x = headX;
    this.root.position.y = bodyY + (speed > 0.2 ? Math.abs(Math.cos(this.phase)) * 0.03 * sp : 0);
  }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.mat.dispose();
  }
}

/** 随机 NPC 外观 */
export function npcAppearance(type: string, seed: number) {
  const r = mulberry32(seed);
  const gender: 'm' | 'f' = r() < 0.5 ? 'f' : 'm';
  const p: Partial<SkinParams> & { type?: string; tie?: string } = {
    gender, type, seed, skin: pick(r, SKIN_TONES.slice(0, 4)), hair: pick(r, HAIR_COLORS.slice(0, 5)),
  };
  const acc: string[] = [];
  switch (type) {
    case 'office':
      p.shirt = pick(r, ['#2a2a3a', '#3a4a6a', '#4a4a4a']); p.pants = '#1a1a24'; p.shoes = '#111111'; p.longSleeve = true;
      p.tie = pick(r, ['#a02a2a', '#2a4aa0', '#3a3a3a']);
      acc.push(r() < 0.6 ? 'briefcase' : 'phone');
      break;
    case 'student':
      p.shirt = '#f2f2f2'; p.pants = '#2a5ac8'; p.shoes = '#f0f0f0'; acc.push('backpack');
      break;
    case 'elder':
      p.shirt = pick(r, ['#8a6a4a', '#5a6a7a', '#a8a090', '#6a3a3a']); p.pants = '#3a3a3a'; p.shoes = '#2a2a2a'; p.longSleeve = true;
      if (r() < 0.5) acc.push('cane');
      break;
    case 'tourist':
      p.shirt = pick(r, ['#f2c230', '#e05050', '#50a0e0', '#f080b0', '#60c060']); p.pants = pick(r, ['#c8b48a', '#3a5a8a', '#e0e0e0']); p.shorts = r() < 0.6;
      acc.push(r() < 0.5 ? 'hat' : 'cap', 'camera');
      if (r() < 0.5) acc.push('backpack');
      break;
    case 'kid':
      p.shirt = pick(r, ['#f2c230', '#e05050', '#50a0e0', '#f080b0', '#60c060', '#f0a030']); p.pants = pick(r, ['#2a5ac8', '#3a3a3a', '#d84a6a']); p.shorts = true;
      if (r() < 0.4) acc.push('cap');
      break;
    default:
      p.shirt = pick(r, ['#c03a3a', '#3a7ad0', '#3aa060', '#e0a030', '#8a5ac0', '#f2f2f2', '#2a2a2a']); p.pants = pick(r, ['#2a2a3a', '#3a5a8a', '#6a5a4a']);
      if (r() < 0.3) acc.push('bag');
  }
  if (gender === 'f' && r() < 0.3 && type !== 'student') p.dress = true;
  return { params: p, accessories: acc, scale: type === 'kid' ? 0.62 : 0.95 + r() * 0.1 };
}