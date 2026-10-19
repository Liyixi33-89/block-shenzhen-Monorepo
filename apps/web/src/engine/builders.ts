// 25 个深圳地标专属像素建模 —— 每个 builder 返回一个 Group，置于投影坐标原点
// 建模风格：方块堆叠像素风，颜色贴近实景，主塔 80-140 单位高
import * as THREE from 'three';

export type Builder = () => THREE.Group;

// ---------- 基础件 ----------
const geoBox = new THREE.BoxGeometry(1, 1, 1);
const geoCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const geoCone = new THREE.ConeGeometry(0.5, 1, 8);
const geoSphere = new THREE.SphereGeometry(0.5, 12, 10);

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function M(color: number, emissive = 0): THREE.MeshStandardMaterial {
  const key = color + ':' + emissive;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
    if (emissive) m.emissive = new THREE.Color(emissive);
    matCache.set(key, m);
  }
  return m;
}

/** 盒子：中心 (x, y0+h/2, z) */
function B(g: THREE.Object3D, x: number, y0: number, z: number, w: number, h: number, d: number, color: number, emissive = 0) {
  const m = new THREE.Mesh(geoBox, M(color, emissive));
  m.position.set(x, y0 + h / 2, z);
  m.scale.set(w, h, d);
  g.add(m);
  return m;
}
/** 圆柱 */
function C(g: THREE.Object3D, x: number, y0: number, z: number, r: number, h: number, color: number, emissive = 0) {
  const m = new THREE.Mesh(geoCyl, M(color, emissive));
  m.position.set(x, y0 + h / 2, z);
  m.scale.set(r * 2, h, r * 2);
  g.add(m);
  return m;
}
/** 圆锥 */
function K(g: THREE.Object3D, x: number, y0: number, z: number, r: number, h: number, color: number) {
  const m = new THREE.Mesh(geoCone, M(color));
  m.position.set(x, y0 + h / 2, z);
  m.scale.set(r * 2, h, r * 2);
  g.add(m);
}
/** 球 */
function S(g: THREE.Object3D, x: number, y: number, z: number, r: number, color: number) {
  const m = new THREE.Mesh(geoSphere, M(color));
  m.position.set(x, y, z);
  m.scale.setScalar(r * 2);
  g.add(m);
}
/** 玻璃幕墙条纹（竖向亮带） */
function glassTower(g: THREE.Object3D, w: number, h: number, d: number, body: number, glass: number) {
  B(g, 0, 0, 0, w, h, d, body);
  const n = Math.floor(h / 14);
  for (let i = 1; i <= n; i++) {
    B(g, 0, i * (h / (n + 1)) - 2, d / 2 + 0.4, w * 0.72, 4, 1, glass, 0x0a1f3a);
    B(g, 0, i * (h / (n + 1)) - 2, -d / 2 - 0.4, w * 0.72, 4, 1, glass, 0x0a1f3a);
  }
}
/** 屋顶天线阵列 */
function antennas(g: THREE.Object3D, y: number, count = 2) {
  for (let i = 0; i < count; i++) {
    B(g, -6 + i * 12, y, 0, 1, 14, 1, 0x8a97a8);
    B(g, -6 + i * 12, y + 14, 0, 1.6, 2, 1.6, 0xff4444, 0x551111);
  }
}
/** 底部广场 */
function plaza(g: THREE.Object3D, r = 34, color = 0xb8bfc8) {
  C(g, 0, -0.6, 0, r, 1.2, color);
}

// ---------- 25 地标 ----------

/** 平安金融中心：592.5m，八柱塔身+琴键塔尖 */
function buildPingan(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 36);
  // 八根不锈钢巨柱（四角各二）
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    B(g, sx * 10, 0, sz * 10, 3.2, 128, 3.2, 0xc8d4e0);
    B(g, sx * 13.5, 0, sz * 6, 3.2, 128, 3.2, 0xc8d4e0);
  }
  // 塔身
  glassTower(g, 17, 128, 17, 0xaebfd2, 0x9fc8ff);
  // 顶部收分 + 塔尖（钢琴键）
  B(g, 0, 128, 0, 12, 8, 12, 0xc8d4e0);
  K(g, 0, 136, 0, 6, 34, 0xe0e8f2);
  // 云际观光层
  B(g, 0, 116, 0, 19, 3, 19, 0x7ad0ff, 0x113355);
  return g;
}

/** 市民中心：大鹏展翅波浪屋顶 */
function buildCivic(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 60, 0xc5cdd8);
  // 两侧塔柱
  B(g, -22, 0, 0, 8, 30, 8, 0xd8dde4);
  B(g, 22, 0, 0, 8, 30, 8, 0xd8dde4);
  // 波浪大屋顶（红色调，如大鹏展翅）
  B(g, 0, 26, -14, 108, 3, 14, 0xc23b2e);
  B(g, 0, 30, 0, 108, 3, 14, 0xd84335);
  B(g, 0, 26, 14, 108, 3, 14, 0xc23b2e);
  // 翅膀上扬端
  for (const s of [-1, 1]) {
    B(g, s * 58, 33, -8, 14, 3, 12, 0xd84335);
    K(g, s * 68, 36, -8, 3, 10, 0xd84335);
    B(g, s * 58, 33, 8, 14, 3, 12, 0xc23b2e);
  }
  // 主体裙楼
  B(g, 0, 0, 0, 44, 24, 26, 0xe8e4da);
  // 金色市政府徽标
  B(g, 0, 24, 13.5, 10, 4, 1, 0xe8c050, 0x443300);
  return g;
}

/** 莲花山：绿色山体 + 山顶铜像广场 + 风筝 */
function buildLotusHill(): THREE.Group {
  const g = new THREE.Group();
  // 三层山体
  C(g, 0, 0, 0, 85, 22, 0x5f8f52);
  C(g, 0, 22, 0, 58, 16, 0x6aa05c);
  C(g, 0, 38, 0, 36, 12, 0x74ab66);
  // 山顶广场
  C(g, 0, 48, 0, 24, 3, 0xd8d2c0);
  // 邓小平铜像（深色人形）
  B(g, 0, 51, 0, 4, 14, 3, 0x5a4a3a);
  B(g, 0, 65, 0, 2.6, 3, 2.6, 0x5a4a3a);
  // 风筝（空中彩块）
  for (const [fx, fz, fy, fc] of [[-26, -18, 66, 0xff6b6b], [24, -26, 72, 0x4ade80], [30, 20, 64, 0xe8c050]] as number[][]) {
    B(g, fx, fy, fz, 3, 3, 0.6, fc, 0x222222);
    B(g, fx, fy - 3, fz, 0.7, 3, 0.7, 0xffffff);
  }
  return g;
}

/** 深圳会展中心：弧形波浪屋顶 */
function buildConvention(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 52, 0xc0c8d2);
  B(g, 0, 0, 0, 84, 12, 40, 0xd4dae2);
  // 波浪屋顶（拱形蓝带）
  for (let i = -3; i <= 3; i++) {
    B(g, i * 12, 12 + (3.5 - Math.abs(i)) * 1.6, 0, 11, 3, 44, 0x5f8fd8);
  }
  // 正面玻璃幕墙
  B(g, 0, 4, 20.5, 70, 8, 1, 0x9fc8ff, 0x0a1f3a);
  return g;
}

/** COCO Park：露天情景购物中心 */
function buildCocoPark(): THREE.Group {
  const g = new THREE.Group();
  C(g, 0, -0.6, 0, 40, 1.2, 0xd8c8b0);
  // 环形商铺
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    B(g, Math.cos(ang) * 30, 0, Math.sin(ang) * 30, 14, 8, 10, a % 2 ? 0xe8a0b0 : 0xe8b8c8);
  }
  // 中央露天广场 + 遮阳棚
  B(g, 0, 10, 0, 16, 2, 16, 0xf0d8e0);
  for (const [sx, sz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    B(g, sx, 0, sz, 1.5, 10, 1.5, 0xd8dde4);
  }
  // 彩色气球
  for (const [bx, bz] of [[-14, -10], [12, -14], [16, 12]] as number[][]) {
    B(g, bx, 14, bz, 2, 2.5, 2, 0xff6b6b, 0x220000);
  }
  return g;
}

/** 京基100：441m 流线玻璃塔 */
function buildKK100(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 30);
  glassTower(g, 16, 96, 16, 0x9fb6d8, 0xbfe0ff);
  // 顶部皇冠斜面
  K(g, 0, 96, 0, 10, 18, 0xc8d8ee);
  antennas(g, 114, 1);
  return g;
}

/** 地王大厦：384m 双塔绿色玻璃 */
function buildDiwang(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 30);
  // 双塔
  for (const s of [-1, 1]) {
    glassTower(g, 12, 74, 12, 0x7fb890, 0xa8e8c0);
    g.children.at(-1)!.position.x = s * 8;
  }
  // 空中连廊（观光层）
  B(g, 0, 60, 0, 16, 6, 8, 0x9fd8b0, 0x113322);
  // 顶部双尖
  for (const s of [-1, 1]) K(g, s * 8, 74, 0, 4.5, 16, 0xa8e8c0);
  return g;
}

/** 东门老街：骑楼商业街（墟市烟火气） */
function buildDongmen(): THREE.Group {
  const g = new THREE.Group();
  // 步行街地面
  B(g, 0, -0.5, 0, 24, 1, 90, 0xc8b898);
  // 两侧骑楼
  for (const s of [-1, 1]) {
    for (let i = -3; i <= 3; i++) {
      const h = 10 + ((i + 3) % 3) * 4;
      B(g, s * 16, 0, i * 13, 14, h, 11, i % 2 ? 0xd8b088 : 0xc8a078);
      // 骑楼廊柱
      for (let c = -1; c <= 1; c++) B(g, s * 9.5, 0, i * 13 + c * 4.5, 1.5, 6, 1.5, 0xb09068);
      // 骑楼悬挑层
      B(g, s * 12, 6, i * 13, 8, 2.5, 10, 0xe0c090);
      // 招牌
      B(g, s * 12, 9.5, i * 13, 6, 3, 0.8, [0xff6b6b, 0x4ade80, 0xe8c050][((i + 3) % 3)], 0x332200);
    }
  }
  // 街口牌坊「东门」
  for (const s of [-1, 1]) B(g, s * 13, 0, 48, 3, 20, 3, 0xa04828);
  B(g, 0, 20, 48, 30, 3, 4, 0xc85838);
  B(g, 0, 23.5, 48, 24, 2.5, 1, 0xe8c050, 0x443300);
  return g;
}

/** 邓小平画像：巨型画像墙 */
function buildDengPortrait(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 24, 0xb8c0b0);
  // 画像墙
  B(g, 0, 0, 0, 26, 16, 3, 0x8a97a8);
  B(g, 0, 3, 1.8, 20, 11, 0.8, 0x5f8fd8, 0x0a1a33);   // 蓝底画像
  B(g, -4, 4.5, 2.4, 5, 8, 0.4, 0xd8b088);            // 人像剪影
  B(g, 5, 4, 2.4, 7, 4, 0.4, 0xffffff, 0x222222);     // 文字区
  // 花坛
  B(g, 0, -0.5, 8, 26, 1.5, 6, 0x6b8f5f);
  for (let i = -3; i <= 3; i++) B(g, i * 4, 1, 8, 2.4, 1.6, 2.4, 0xe8554d);
  return g;
}

/** 拓荒牛：青铜耕牛雕像 */
function buildBull(): THREE.Group {
  const g = new THREE.Group();
  C(g, 0, -0.6, 0, 18, 1.2, 0xc5c8cc);
  // 基座（红色花岗岩）
  B(g, 0, 0, 0, 12, 3, 8, 0x9c3e30);
  // 牛身（埋头苦干状）
  B(g, 0, 3, 0, 11, 5, 5, 0x4a6b52);          // 躯干
  B(g, 5.5, 2.5, 0, 4, 3.4, 3.6, 0x4a6b52);   // 头（低垂）
  B(g, 6.5, 1, 0, 2.4, 2, 2.4, 0x5a7b62);     // 鼻
  K(g, 7.5, 5.5, 1.6, 1.2, 3, 0x3f5e46);      // 右角
  K(g, 7.5, 5.5, -1.6, 1.2, 3, 0x3f5e46);     // 左角
  // 四腿前蹬
  for (const [lx, lz] of [[-4, -2], [-4, 2], [3.4, -2], [3.4, 2]] as number[][]) {
    B(g, lx, 0.5, lz, 2, 2.8, 2, 0x44614c);
  }
  // 尾
  B(g, -5.8, 6.5, 0, 0.9, 3.4, 0.9, 0x3f5e46);
  return g;
}

/** 腾讯滨海大厦：双塔三连廊「垂直硅谷」 */
function buildTencent(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 34);
  // 南北双塔
  for (const s of [-1, 1]) {
    glassTower(g, 13, 66, 15, 0x6f9fd8, 0xa8d0ff);
    g.children.at(-1)!.position.z = s * 10;
  }
  // 三道空中连廊
  for (const y of [22, 42, 60]) {
    B(g, 0, y, 0, 13, 4.5, 22, 0x8fc0f0, 0x0a1f3a);
  }
  // 顶部停机坪
  B(g, 0, 66, 10, 9, 1.5, 9, 0xc8d4e0);
  return g;
}

/** 深圳大学：荔枝林环绕的红白校园 */
function buildSZU(): THREE.Group {
  const g = new THREE.Group();
  // 大草坪
  C(g, 0, -0.6, 0, 55, 1.2, 0x7fae6b);
  // 图书馆（红白主楼）
  B(g, 0, 0, 0, 30, 18, 16, 0xd8d0c0);
  B(g, 0, 18, 0, 22, 6, 12, 0xc23b2e);
  B(g, 0, 6, 8.5, 26, 10, 1, 0x9fc8ff, 0x0a1f3a);
  // 荔枝林（环绕果树）
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const x = Math.cos(ang) * 42, z = Math.sin(ang) * 42;
    B(g, x, 0, z, 1.6, 7, 1.6, 0x8a6b4a);
    S(g, x, 8.5, z, 4.5, 0x4f8f3f);
    S(g, x + 2, 7, z + 1, 0.8, 0xe8554d);
  }
  return g;
}

/** 欢乐谷：过山车+摩天轮 */
function buildHappyValley(): THREE.Group {
  const g = new THREE.Group();
  C(g, 0, -0.6, 0, 46, 1.2, 0xd8b890);
  // 摩天轮
  B(g, -20, 0, 0, 3, 30, 3, 0xd8dde4);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(14, 0.9, 8, 24), M(0xe8c050));
  wheel.position.set(-20, 30, 0);
  g.add(wheel);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    B(g, -20 + Math.cos(ang) * 14, 30 + Math.sin(ang) * 14, 0, 2.4, 2.4, 2.4, [0xff6b6b, 0x4ade80, 0x7ad0ff][a % 3]);
  }
  // 木质过山车（红轨道）
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 7;
    B(g, x, 8 + Math.sin(i * 1.2) * 6, 0, 2, 8 + Math.sin(i * 1.2) * 6, 2, 0xa06b4a);
    B(g, x, 8 + Math.sin(i * 1.2) * 6 + 0.5, 4, 7, 1.2, 8, 0xd84335);
  }
  // 城堡尖塔
  B(g, 30, 0, -22, 12, 16, 12, 0xe8c8d8);
  K(g, 30, 16, -22, 7, 12, 0xc8506b);
  return g;
}

/** 世界之窗：108 米埃菲尔铁塔 + 环球广场 */
function buildWindowWorld(): THREE.Group {
  const g = new THREE.Group();
  C(g, 0, -0.6, 0, 50, 1.2, 0xc8c0a8);
  // 埃菲尔铁塔（三层收分桁架）
  for (let i = 0; i < 3; i++) {
    const w = 22 - i * 6, y = i * 28;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // 斜柱近似：两层盒子
      B(g, sx * w, y, sz * w, 2.4, 28, 2.4, 0x8a6b52);
    }
    B(g, 0, y + 26, 0, w * 2 + 2, 2, w * 2 + 2, 0x9a7b5f);   // 平台
  }
  K(g, 0, 84, 0, 3.5, 24, 0x8a6b52);   // 塔尖天线
  B(g, 0, 60, 0, 3, 6, 3, 0xe8c050, 0x443300);  // 观景台灯
  // 环球舞台
  C(g, 30, 0, -28, 12, 8, 0xd8b8c8);
  S(g, 30, 10, -28, 8, 0x7ad0ff);
  // 金字塔
  K(g, -32, 0, -26, 10, 14, 0xd8c090);
  return g;
}

/** 人才公园：湖畔人才胶囊与灯光 */
function buildTalentPark(): THREE.Group {
  const g = new THREE.Group();
  // 湖
  C(g, 0, -0.8, 0, 44, 1.4, 0x3a7ca8);
  // 环湖步道
  C(g, 0, -0.6, 0, 52, 1.2, 0xd8c8a8);
  C(g, 0, -0.5, 0, 44, 1.4, 0x4a9cd8);
  // 人才胶囊（银色椭圆）
  B(g, 0, 2, -20, 18, 8, 10, 0xc8d4e0);
  B(g, 0, 6, -20, 20, 4, 12, 0xdfe8f0);
  // 「人才」地标柱
  B(g, 22, 0, 16, 5, 22, 5, 0xd8dde4);
  B(g, 22, 23, 16, 6, 4, 6, 0xe8c050, 0x443300);
  // 星光雕塑
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    B(g, Math.cos(ang) * 30, 6, Math.sin(ang) * 30, 1.6, 10, 1.6, 0x7ad0ff, 0x0a1a33);
  }
  return g;
}

/** 深圳湾春笋（华润总部）：392.5m 春笋塔 */
function buildSZBay(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 30);
  // 春笋形：逐层收分圆柱
  for (let i = 0; i < 12; i++) {
    const r = 13 - i * 0.85;
    C(g, 0, i * 7.6, 0, r, 7.7, i % 2 ? 0xaebfd2 : 0x9fb6d0);
  }
  // 笋尖
  K(g, 0, 91, 0, 6, 14, 0xc8d8ee);
  // 玻璃旋纹
  for (let i = 0; i < 12; i++) {
    B(g, 0, i * 7.6 + 3.8, 0, 0.01, 0.01, 0.01, 0xffffff);   // 占位（旋纹用发光环代替）
    C(g, 0, i * 7.6 + 7.5, 0, 12 - i * 0.85, 0.9, 0x9fc8ff, 0x0a1f3a);
  }
  return g;
}

/** 红树林湿地：滩涂+观鸟廊+黑脸琵鹭 */
function buildMangrove(): THREE.Group {
  const g = new THREE.Group();
  // 滩涂水面
  C(g, 0, -0.9, 0, 48, 1.6, 0x6b9a8a);
  // 红树林带
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    B(g, Math.cos(ang) * 42, 0, Math.sin(ang) * 42, 4, 5, 4, 0x3f6b4a);
    S(g, Math.cos(ang) * 42, 6, Math.sin(ang) * 42, 3.6, 0x4f7f52);
  }
  // 观鸟廊桥（木质）
  B(g, 0, 2, 26, 40, 1.2, 4, 0x8a6b4a);
  for (let i = -2; i <= 2; i++) B(g, i * 10, 0, 26, 1.5, 2.6, 1.5, 0x7a5b3f);
  // 黑脸琵鹭（白色鸟形）
  B(g, -12, 5, 8, 2.2, 2.4, 3.6, 0xf2f2ee);
  B(g, -12, 7.4, 9.4, 1.2, 1.2, 1.2, 0x2a2a2a);
  B(g, -14.5, 6.2, 10.5, 0.7, 0.7, 3.6, 0x2a2a2a);   // 琵嘴
  B(g, -12, 8.6, 8.6, 2.8, 0.5, 3, 0xe8e8e0);        // 翅
  return g;
}

/** 深圳北站：高铁枢纽波浪屋顶 */
function buildNorthStation(): THREE.Group {
  const g = new THREE.Group();
  plaza(g, 56, 0xc0c8d2);
  // 站体
  B(g, 0, 0, 0, 90, 14, 44, 0xd4dae2);
  // 波浪屋顶（白色，三重起伏）
  for (let i = -4; i <= 4; i++) {
    B(g, i * 10, 14 + (4 - Math.abs(i)) * 1.4, 0, 9, 3, 48, 0xeef2f6);
  }
  // 正面大跨度玻璃
  B(g, 0, 3, 22.5, 76, 10, 1, 0x9fc8ff, 0x0a1f3a);
  // 高铁（站台侧）
  for (const dz of [-18, 18]) {
    B(g, 0, 1, dz, 66, 3.4, 3.4, 0xeef2f6);
    B(g, 0, 2.2, dz, 66, 1.6, 4, 0x5f8fd8);
    B(g, 30, 4.4, dz, 5, 2.4, 3.8, 0x2a3a4a);   // 车头
  }
  return g;
}

/** 华强北：电子市场峡谷街 */
function buildHuaqiangbei(): THREE.Group {
  const g = new THREE.Group();
  // 街道
  B(g, 0, -0.5, 0, 20, 1, 80, 0x8a8f98);
  // 赛格广场（高塔）
  B(g, -14, 0, -20, 16, 56, 16, 0x6f87a8);
  B(g, -14, 56, -20, 10, 8, 10, 0x7d94b5);
  B(g, -14, 64, -20, 6, 10, 6, 0x8a97a8);
  K(g, -14, 74, -20, 3, 12, 0xc8d4e0);
  // 两侧电子市场楼（挂满招牌）
  for (let i = -1; i <= 1; i++) {
    for (const s of [-1, 1]) {
      B(g, s * 15, 0, i * 26, 13, 22, 18, 0xa8b4c4);
      // 电子招牌墙
      for (let r = 0; r < 3; r++) {
        B(g, s * 8.5, 6 + r * 6, i * 26, 0.8, 3.4, 12, [0xff6b6b, 0x4ade80, 0x7ad0ff][(i + r + 1) % 3], 0x222222);
      }
    }
  }
  return g;
}

/** 大梅沙：沙滩+愿望塔+张拉膜 */
function buildDameisha(): THREE.Group {
  const g = new THREE.Group();
  // 金色沙滩
  B(g, 0, -0.6, 26, 100, 1.2, 44, 0xe8d8a0);
  // 海
  B(g, 0, -1.2, -34, 100, 1.2, 40, 0x3a9ad8);
  // 愿望塔
  C(g, 18, 0, 26, 4, 46, 0xd8dde4);
  B(g, 18, 46, 26, 9, 5, 9, 0xc8d4e0);
  K(g, 18, 51, 26, 4.5, 9, 0xe8c050);
  // 张拉膜（白色帆影）
  for (const [mx, mz] of [[-30, 20], [-6, 14], [20, 16]] as number[][]) {
    B(g, mx, 12, mz, 14, 1.5, 10, 0xf4f6f2);
    B(g, mx - 6, 0, mz - 4, 1.5, 12, 1.5, 0xd8dde4);
    B(g, mx + 6, 0, mz + 4, 1.5, 12, 1.5, 0xd8dde4);
  }
  // 沙滩伞
  for (const [ux, uz] of [[-18, 38], [8, 40], [34, 34]] as number[][]) {
    B(g, ux, 0, uz, 0.6, 5, 0.6, 0xd8dde4);
    K(g, ux, 5, uz, 3.4, 2, [0xff6b6b, 0x4ade80, 0x7ad0ff][Math.abs(ux) % 3]);
  }
  return g;
}

/** 梧桐山：深圳第一峰 943.7m，好汉坡 */
function buildWutong(): THREE.Group {
  const g = new THREE.Group();
  // 主峰（大块山体两级）
  K(g, 0, 0, 0, 95, 64, 0x5f8f52);
  K(g, 18, 24, -14, 60, 42, 0x6aa05c);
  K(g, -30, 20, 20, 48, 34, 0x557f4a);
  // 好汉坡登山道（之字形浅色带）
  for (let i = 0; i < 8; i++) {
    B(g, -40 + i * 10, 4 + i * 6.5, 30 - i * 5, 12, 1.4, 4, 0xc8bfa0);
  }
  // 山顶观测点
  C(g, 0, 60, 0, 8, 3, 0xd8d2c0);
  B(g, 0, 63, 0, 2, 8, 2, 0xe8c050);   // 旗杆
  B(g, 2.6, 66, 0, 4.6, 2.8, 0.4, 0xd84335);   // 红旗
  return g;
}

/** 甘坑客家小镇：炮楼+排屋+客家围 */
function buildGankeng(): THREE.Group {
  const g = new THREE.Group();
  B(g, 0, -0.5, 0, 80, 1, 70, 0x9fae8b);
  // 炮楼（碉楼，制高点）
  B(g, -24, 0, -18, 10, 30, 10, 0xb09068);
  K(g, -24, 30, -18, 7, 8, 0x8a5a3a);
  for (let r = 1; r < 5; r++) B(g, -24, r * 5.6, -13, 3, 2, 0.8, 0x2a2a2a);   // 炮孔
  // 排屋群（灰瓦白墙）
  for (let i = 0; i < 4; i++) {
    const x = 4 + (i % 2) * 22, z = -20 + Math.floor(i / 2) * 24;
    B(g, x, 0, z, 16, 7, 12, 0xe8e2d4);
    B(g, x, 7, z, 18, 2.4, 13, 0x5a5a52);   // 灰瓦
    B(g, x, 4, z + 6.4, 4, 3.4, 0.6, 0x8a5a3a);   // 木门
  }
  // 客家围龙屋（半圆排屋）
  for (let a = 0; a < 7; a++) {
    const ang = Math.PI * (0.15 + (a / 6) * 0.7);
    const x = 26 - Math.cos(ang) * 20, z = 18 - Math.sin(ang) * 16;
    B(g, x, 0, z, 9, 5.5, 8, 0xe8e2d4);
    B(g, x, 5.5, z, 10, 2, 9, 0x5a5a52);
  }
  return g;
}

/** 大万世居：堡垒式客家围屋（四角楼） */
function buildDawan(): THREE.Group {
  const g = new THREE.Group();
  B(g, 0, -0.5, 0, 76, 1, 68, 0xa8b098);
  // 外围城墙（连通排屋）
  for (const [w, d, x, z] of [[68, 8, 0, -30], [68, 8, 0, 30], [8, 52, -34, 0], [8, 52, 34, 0]] as number[][]) {
    B(g, x, 0, z, w, 9, d, 0xe8e2d4);
    B(g, x, 9, z, w + 2, 2, d + 2, 0x4f4f47);
  }
  // 四角炮楼
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    B(g, sx * 34, 0, sz * 30, 10, 13, 10, 0xd8d2c0);
    K(g, sx * 34, 13, sz * 30, 6.5, 7, 0x8a5a3a);
  }
  // 大门
  B(g, 0, 0, 30.5, 8, 6, 1.5, 0x8a5a3a);
  // 中堂祖祠
  B(g, 0, 0, 0, 18, 8, 12, 0xe8e2d4);
  B(g, 0, 8, 0, 20, 2.4, 13, 0x5a5a52);
  return g;
}

/** 大鹏所城：明代海防古城（城墙+城门+衙署） */
function buildDapeng(): THREE.Group {
  const g = new THREE.Group();
  B(g, 0, -0.5, 0, 84, 1, 84, 0x9fae8b);
  // 城墙（青砖）
  for (const [w, d, x, z] of [[76, 6, 0, -38], [76, 6, 0, 38], [6, 70, -38, 0], [6, 70, 38, 0]] as number[][]) {
    B(g, x, 0, z, w, 11, d, 0x8a8f7e);
    // 垛口
    for (let i = -3; i <= 3; i++) {
      if (w > d) B(g, x + i * 10, 11, z, 3.4, 2.4, d + 1, 0x8a8f7e);
      else B(g, x, 11, z + i * 10, w + 1, 2.4, 3.4, 0x8a8f7e);
    }
  }
  // 南城门（拱门+门楼）
  B(g, 0, 0, 38, 18, 14, 8, 0x7a7f6e);
  B(g, 0, 6, 38.5, 8, 8, 1.5, 0x2a2a24);   // 门洞
  B(g, 0, 14, 38, 20, 5, 10, 0x8a8f7e);    // 门楼
  K(g, 0, 19, 38, 11, 6, 0x5a4a3a);        // 门楼顶
  // 将军第（清代府第，中轴三进）
  for (let i = 0; i < 3; i++) {
    B(g, 0, 0, -20 + i * 16, 24, 7, 10, 0xd8d2c0);
    B(g, 0, 7, -20 + i * 16, 26, 2.2, 11, 0x4f4f47);
  }
  // 振威将军第匾额
  B(g, 0, 5, -12.5, 12, 3, 0.8, 0xe8c050, 0x443300);
  return g;
}

/** 较场尾：彩色民宿海滩村 */
function buildJiaochangwei(): THREE.Group {
  const g = new THREE.Group();
  // 海滩
  B(g, 0, -0.6, -28, 90, 1.2, 40, 0xe8d8a8);
  B(g, 0, -1.2, -60, 90, 1.2, 30, 0x3a9ad8);
  // 彩色民宿排（沿海滩一排）
  const colors = [0xff8a8a, 0x8ad0ff, 0xaaffa0, 0xffd08a, 0xd8a0ff, 0xa0ffe0, 0xffc0d8, 0xc8d8ff];
  for (let i = 0; i < 8; i++) {
    const x = -36 + i * 10.4;
    B(g, x, 0, -6, 9, 8, 12, colors[i]);
    K(g, x, 8, -6, 6, 5, colors[(i + 3) % 8]);
    B(g, x, 3, 0.4, 3, 4, 0.6, 0xffffff);   // 白窗
  }
  // 村巷
  B(g, 0, -0.5, 14, 84, 1, 10, 0xc8b898);
  return g;
}

// ---------- 注册表 ----------
export const BUILDERS: Record<string, Builder> = {
  pingan: buildPingan,
  civic: buildCivic,
  lotushill: buildLotusHill,
  convention: buildConvention,
  cocopark: buildCocoPark,
  kk100: buildKK100,
  diwang: buildDiwang,
  dongmen: buildDongmen,
  dengportrait: buildDengPortrait,
  bull: buildBull,
  tencent: buildTencent,
  szu: buildSZU,
  happyvalley: buildHappyValley,
  windowworld: buildWindowWorld,
  talentpark: buildTalentPark,
  szbay: buildSZBay,
  mangrove: buildMangrove,
  northstation: buildNorthStation,
  huaqiangbei: buildHuaqiangbei,
  dameisha: buildDameisha,
  wutong: buildWutong,
  gankeng: buildGankeng,
  dawan: buildDawan,
  dapeng: buildDapeng,
  jiaochangwei: buildJiaochangwei,
};

/** 名牌高度建议（按建筑体量） */
export const LABEL_HEIGHT: Record<string, number> = {
  pingan: 178, kk100: 128, szbay: 118, diwang: 98, tencent: 82,
  civic: 44, lotushill: 70, wutong: 76, northstation: 32, windowworld: 116,
};
