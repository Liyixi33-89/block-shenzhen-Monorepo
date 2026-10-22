// 内容驱动的世界构建：区划街区 + 专属地标 + 交通 + 出生点 + 氛围
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { proj } from '@block-sz/shared';
import type { Scene } from '@block-sz/schema';
import { BUILDERS, LABEL_HEIGHT } from './builders';
import { buildSky, buildSea, buildLighting, buildDistantHills, type LightingRig } from './atmosphere';
import { facadeMaterial, groundMaterial } from './textures';
import { generateRoadNet, buildRoadMesh, type DistrictRoadNet, type RoadGraph, buildRoadGraph } from './roadnet';
import { collision } from './collision';
import { markSharedGeo, markSharedMat, disposeObjectAssets } from './assets';

/** P2 GLTF 加载器（懒建，复用单例）。路径约定：public/content/models/{sceneId}/{landmarkId}.glb */
let gltfLoader: GLTFLoader | null = null;

/**
 * 尝试加载地标 GLTF 低模；加载成功返回场景组（含贴图），失败返回 null 走 fallback。
 * 先 HEAD 预检真实二进制资源，规避 vite SPA fallback 对缺失路径返回 index.html(200) 的误判。
 */
async function loadLandmarkModel(sceneId: string, landmarkId: string): Promise<THREE.Group | null> {
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}content/models/${sceneId}/${landmarkId}.glb`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
    const ct = head.headers.get('content-type') || '';
    if (ct && ct.includes('html')) return null; // SPA fallback，非真实模型
  } catch {
    return null;
  }
  gltfLoader = gltfLoader ?? new GLTFLoader();
  const g = await new Promise<THREE.Group | null>(resolve => {
    gltfLoader!.load(url, gltf => resolve(gltf.scene), undefined, () => resolve(null));
  });
  if (!g) return null;
  // 统一材质与投影设置：模型内所有 Mesh 启用投影，并保证有贴图时物理材质可用
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if ((m as any).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const mat = m.material as THREE.Material;
      if (mat && (mat as any).isMeshStandardMaterial) {
        mat.needsUpdate = true;
      }
    }
  });
  return g;
}

/**
 * 静态组合并优化：把组内所有 Mesh 按材质分桶合并为单 mesh，
 * 千级 draw call 降为每材质 1 次。Sprite/Line 保持原样。
 */
function mergeStaticGroup(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const gInv = g.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const doomed: THREE.Mesh[] = [];

  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh || !m.geometry || (m as any).isSprite) return;
    if ((m as any).isSkinnedMesh) return;
    const rel = new THREE.Matrix4().multiplyMatrices(gInv, m.matrixWorld);
    const geo = m.geometry.clone();
    geo.applyMatrix4(rel);
    const arr = buckets.get(m.material as THREE.Material) ?? [];
    arr.push(geo);
    buckets.set(m.material as THREE.Material, arr);
    doomed.push(m);
  });
  if (doomed.length < 2) return;

  for (const m of doomed) m.removeFromParent();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    geos.forEach(gg => gg.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.frustumCulled = true;
    // P0：合并后的静态建筑参与投影
    mesh.castShadow = true;
    g.add(mesh);
  }
}

// ---- 共享资源：boxGeo 与 matCache 材质跨世界复用，dispose 时跳过 ----
// 注：boxGeo 的共享登记在其声明之后（避免 TDZ）

/** 程序化建筑材质缓存（按颜色，P0 升级为物理材质以呈现光影质感） */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: { emissive?: number } = {}) {
  const key = color + ':' + (opts.emissive ?? 0);
  let m = matCache.get(key);
  if (!m) {
    m = markSharedMat(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }));
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    matCache.set(key, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
markSharedGeo(boxGeo);

function box(
  parent: THREE.Object3D,
  x: number, y0: number, z: number,
  w: number, h: number, d: number,
  color: number, opts: { emissive?: number; facade?: THREE.Material } = {},
) {
  const m = new THREE.Mesh(boxGeo, opts.facade ?? mat(color, opts));
  m.position.set(x, y0 + h / 2, z);
  m.scale.set(w, h, d);
  parent.add(m);
  return m;
}

/** 地标名牌（Canvas 贴图 sprite） */
function labelSprite(text: string, color = '#ffffff', bg = 'rgba(10,20,40,0.75)') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = 'rgba(120,190,255,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 62);
  ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.length > 8 ? text.slice(0, 8) + '…' : text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(60, 15, 1);
  return sprite;
}

/** 装饰物 LOD 切换距离（超过该距离隐藏：名牌/光圈等远距不可见的细节） */
const DECOR_LOD = 1150;        // 地标名牌 + 交互光圈
const STATION_LABEL_LOD = 900; // 站亭名牌（小尺寸，更近才可见）

/**
 * 远距离细节开关：近距显示 nearObj，超过 farDist 自动隐藏。
 * 用 THREE.LOD 实现，Three.js 在渲染时按相机距离自动选层，零每帧 JS 开销。
 */
function detailSwitch(nearObj: THREE.Object3D, farDist: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(nearObj, 0);
  const none = new THREE.Object3D();
  none.visible = false; // 远距空层（不可见，无绘制）
  lod.addLevel(none, farDist);
  return lod;
}

/** 区块：路网网格 + 街区贴边建筑 + 地面（一个区一个组，支持流式开关） */
function buildDistrictBlock(d: Scene['districts'][number], net: DistrictRoadNet): THREE.Group {
  const g = new THREE.Group();
  const c = proj(d.center.lat, d.center.lng);
  g.position.set(c.x, 0, c.z);
  const R = d.cityRadius;
  if (R <= 0) return g;

  const groundType: 'grass' | 'stone' | 'soil' = d.density === 'cbd' ? 'stone' : d.density === 'suburb' ? 'grass' : 'soil';
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 1, 48),
    groundMaterial(groundType, Math.max(2, Math.round(R / 120))),
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  g.add(ground);

  // 路面（世界坐标已含区中心偏移 → 放到区组局部坐标需减回中心；
  // 但碰撞注册需要世界坐标，故路网生成时直接用世界坐标传入，路面组也挂世界根。
  // 这里把路网 mesh 单独返回，由调用方挂世界根并注册碰撞。）

  // ---- 街区贴边建筑（阶段一）：沿地块四边摆放，中间留院落 ----
  const maxH = { cbd: 60, urban: 34, suburb: 14, none: 10 }[d.density] ?? 10;
  for (const cell of net.cells) {
    let seed = cell.seed;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // 地块四条边（局部坐标；地块宽深已扣道路半宽）
    const hw = cell.w / 2, hd = cell.d / 2;
    // 每边期望楼数：边长 / 平均楼宽(~16)，密度系数打折
    const perEdge = (len: number) => Math.max(1, Math.round((len / 16) * cell.density));
    const facade = (tone: number) => facadeMaterial(tone, d.density === 'cbd' ? 3 : 2, seed);

    /** 沿一条边贴边摆楼：位置在边线内缩 halfDepth 处 */
    const fillEdge = (
      ax: number, az: number, bx: number, bz: number,   // 边线（地块边）
      insideX: number, insideZ: number,                  // 内法线方向（指向地块中心）
    ) => {
      const edgeLen = Math.hypot(bx - ax, bz - az);
      const n = perEdge(edgeLen);
      const step = edgeLen / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        // 楼宇尺寸：贴边深度 12-20（楼体饱满，避免细高桩），宽度略小于步长
        const depth = 12 + rnd() * 8;
        const w = step * (0.72 + rnd() * 0.2);
        const h = 6 + rnd() * rnd() * maxH * (0.6 + cell.density * 0.4);
        // 楼中心 = 边点向内法线方向偏移 depth/2
        const cx = px + insideX * (depth / 2);
        const cz = pz + insideZ * (depth / 2);
        // 边方向（求楼体旋转无关量：贴边楼沿边线走向拉伸宽度）
        const dirX = (bx - ax) / edgeLen, dirZ = (bz - az) / edgeLen;
        const tone = [0x6f87a8, 0x7d94b5, 0x5d7494][Math.floor(rnd() * 3)];
        const m = new THREE.Mesh(boxGeo, facade(tone));
        // 用 scale 近似沿边拉伸：仅支持轴对齐边（本路网全为轴对齐线）
        const alongX = Math.abs(dirX) > 0.5;
        m.scale.set(alongX ? w : depth, h, alongX ? depth : w);
        m.position.set(cx, 1 + h / 2, cz);
        g.add(m);
        // 碰撞注册（世界坐标 = 区中心 + 局部）
        collision.addBoxCenter(c.x + cx, c.z + cz, alongX ? w : depth, alongX ? depth : w, 1.5);
        // 高楼屋顶灯箱 / 霓虹招牌
        if (h > 30 && rnd() > 0.5) {
          const cap = new THREE.Mesh(boxGeo, mat(0xffe9a8, { emissive: 0x332200 }));
          cap.scale.set((alongX ? w : depth) * 0.4, 4, (alongX ? depth : w) * 0.4);
          cap.position.set(cx, 1 + h + 2, cz);
          g.add(cap);
        }
        // 临街霓虹招牌：CBD/urban 部分高楼侧面挂发光灯箱（夜间点亮，白天弱自发光）
        if (h > 22 && rnd() > 0.55) {
          const neon = [0xff5a6a, 0x5ad0ff, 0xffd75a, 0x7af0c0][Math.floor(rnd() * 4)];
          const sign = new THREE.Mesh(boxGeo, mat(neon, { emissive: neon }));
          const sx = alongX ? 1 : 0, sz = alongX ? 0 : 1; // 挂在外立面一侧
          const sh = 2.6;
          sign.scale.set(alongX ? depth * 0.6 : sh, sh, alongX ? sh : depth * 0.6);
          sign.position.set(cx + sx * (alongX ? w / 2 + 0.3 : 0), 1 + h * 0.55, cz + sz * (alongX ? 0 : w / 2 + 0.3));
          g.add(sign);
        }
      }
    };

    // 四条边：上边(z=-hd)、下边(z=+hd)、左边(x=-hw)、右边(x=+hw)，内法线指向中心
    fillEdge(-hw, -hd, hw, -hd, 0, 1);
    fillEdge(-hw, hd, hw, hd, 0, -1);
    fillEdge(-hw, -hd, -hw, hd, 1, 0);
    fillEdge(hw, -hd, hw, hd, -1, 0);
  }
  return g;
}

/** 出生点入口装饰：发光门框 + 光柱 */
function buildSpawnPortal(sp: Scene['spawnPoints'][number]): THREE.Group {
  const g = new THREE.Group();
  const p = proj(sp.latlng.lat, sp.latlng.lng);
  g.position.set(p.x, 0, p.z);

  // 光柱（青色半透明）
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 9, 120, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x1fb9a8, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 60;
  g.add(beam);

  // 地面光圈
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0x7ad0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  g.add(ring);

  // 门框（像素风四柱）
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    box(g, sx * 10, 0, sz * 6, 2.4, 16, 2.4, 0x23415e);
  }
  box(g, 0, 16, -6, 24, 2.4, 2.4, 0x2d5a7a);
  box(g, 0, 16, 6, 24, 2.4, 2.4, 0x2d5a7a);
  // 门楣名牌
  const label = labelSprite('起点 · ' + sp.name, '#7ad0ff');
  label.position.y = 26;
  label.scale.set(52, 13, 1);
  g.add(label);
  return g;
}

// ---- 街道家具共享几何（跨区复用，mergeStaticGroup 按材质合并，draw call 极低） ----
// 树/路灯等街道家具几何，与 boxGeo 一样 markShared 登记，dispose 时保留复用。
const TREE_TRUNK = markSharedGeo(new THREE.CylinderGeometry(0.35, 0.55, 2.6, 5));
const TREE_CROWN_SPHERE = markSharedGeo(new THREE.SphereGeometry(2.3, 7, 6));
const TREE_CROWN_CONE = markSharedGeo(new THREE.ConeGeometry(2.6, 4.6, 7));
const LAMP_POLE = markSharedGeo(new THREE.CylinderGeometry(0.28, 0.4, 9, 6));
const LAMP_HEAD = markSharedGeo(new THREE.BoxGeometry(1.6, 0.5, 0.9));

/** 树/路灯/招牌的简单随机（复用 LCG，seed 由函数入参决定） */
function furnitureRnd(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/**
 * 行道树：沿路网线段两侧成排布置（树干 + 树冠），远看成林，近看错落。
 * 每段路按长度均分，树落在距路中心 halfW+2.2 的路缘位置，两侧交错以破机械感。
 */
function buildStreetTrees(nets: DistrictRoadNet[]): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = mat(0x5a4632);
  const crownMats = [mat(0x2f7d4f), mat(0x3a8a5a), mat(0x2a6f45)]; // 三档绿增强自然感
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  let count = 0;

  const TREE_SPACING = 46;   // 沿路间距（世界单位）
  for (const net of nets) {
    for (const s of net.segs) {
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const n = Math.max(0, Math.floor(len / TREE_SPACING) - 1); // 两端留空给路口
      if (n <= 0) continue;
      const ux = (s.x2 - s.x1) / len, uz = (s.z2 - s.z1) / len;
      // 垂直于道路的两侧法线
      const nx = -uz, nz = ux;
      const off = s.halfW + 2.2; // 树心落在路缘外
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const alongX = s.x1 + ux * len * t, alongZ = s.z1 + uz * len * t;
        // 两侧交错：奇偶棵树轮流站边
        const side = (i + Math.floor((s.x1 + s.z1) / 20)) % 2 === 0 ? 1 : -1;
        const px = alongX + nx * off * side;
        const pz = alongZ + nz * off * side;
        // 轻微随机错落，避免纯直线
        const jx = (rnd() - 0.5) * 4, jz = (rnd() - 0.5) * 4;
        const tree = new THREE.Group();
        tree.position.set(px + jx, 0, pz + jz);
        const trunk = new THREE.Mesh(TREE_TRUNK, trunkMat);
        trunk.position.y = 1.3;
        tree.add(trunk);
        // 树冠：球/锥交替 + 轻微缩放
        const crown = rnd() > 0.5
          ? new THREE.Mesh(TREE_CROWN_SPHERE, crownMats[Math.floor(rnd() * crownMats.length)])
          : new THREE.Mesh(TREE_CROWN_CONE, crownMats[Math.floor(rnd() * crownMats.length)]);
        crown.position.y = 2.6 + rnd() * 1.2;
        crown.scale.set(1, 1 + rnd() * 0.4, 1);
        crown.castShadow = true;
        tree.add(crown);
        g.add(tree);
        count++;
      }
    }
  }
  if (count > 0) mergeStaticGroup(g); // 按材质合并，极低 draw call
  return g;
}

/**
 * 路灯：沿主干道两侧布置，灯头发光（夜间由昼夜系统点亮，白天柔和自发光）。
 * 间距比行道树稀疏，避免遮挡；灯柱注册轻量碰撞。
 */
function buildStreetLamps(nets: DistrictRoadNet[]): THREE.Group {
  const g = new THREE.Group();
  const poleMat = mat(0x33404d);
  // 灯头：昼夜可调 emissive，先用弱自发光做常态（夜间增强交给 atmosphere）
  const lampMat = markSharedMat(new THREE.MeshStandardMaterial({ color: 0xd8ecff, emissive: 0x8a6a2a, emissiveIntensity: 0.4 }));
  let count = 0;
  const LAMP_SPACING = 90;   // 主干道间距
  for (const net of nets) {
    for (const s of net.segs) {
      if (!s.major) continue; // 只沿主干道设灯
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
      const n = Math.max(0, Math.floor(len / LAMP_SPACING));
      if (n <= 0) continue;
      const ux = (s.x2 - s.x1) / len, uz = (s.z2 - s.z1) / len;
      const nx = -uz, nz = ux;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const alongX = s.x1 + ux * len * t, alongZ = s.z1 + uz * len * t;
        const side = i % 2 === 0 ? 1 : -1;
        const px = alongX + nx * (s.halfW + 1.2) * side;
        const pz = alongZ + nz * (s.halfW + 1.2) * side;
        const lamp = new THREE.Group();
        lamp.position.set(px, 0, pz);
        const pole = new THREE.Mesh(LAMP_POLE, poleMat);
        pole.position.y = 4.5;
        lamp.add(pole);
        const head = new THREE.Mesh(LAMP_HEAD, lampMat);
        head.position.y = 9.2;
        head.position.x = nx * side * 0.6; // 灯头偏向路边
        head.castShadow = false;
        lamp.add(head);
        g.add(lamp);
        count++;
      }
    }
  }
  if (count > 0) mergeStaticGroup(g);
  return g;
}

/** 交通线路：站点块 + 线路连线 */
function buildTraffic(scene: Scene): THREE.Group {
  const g = new THREE.Group();
  if (!scene.traffic) return g;
  const pos = new Map<string, THREE.Vector3>();
  for (const s of scene.traffic.stations) {
    const p = proj(s.latlng.lat, s.latlng.lng);
    pos.set(s.id, new THREE.Vector3(p.x, 0, p.z));
  }
  for (const s of scene.traffic.stations) {
    const v = pos.get(s.id)!;
    const st = new THREE.Group();
    st.position.set(v.x, 0, v.z);
    // 地铁入口风格：玻璃方亭（比人物略高，像真实地铁口）
    box(st, 0, 0, 0, 9, 7.5, 9, 0x4a6a8a);
    box(st, 0, 7.5, 0, 7, 1.0, 7, 0x7ad0ff, { emissive: 0x0a2a4a });
    // 出口扶梯
    box(st, 6.5, 0, 0, 3.5, 4, 5.5, 0x39546e);
    const label = labelSprite(s.name, '#7ad0ff');
    label.position.y = 17;
    label.scale.set(44, 11, 1);
    st.add(detailSwitch(label, STATION_LABEL_LOD));
    g.add(st);
  }
  for (const r of scene.traffic.routes) {
    const pts = r.stations.map(id => pos.get(id)!).filter(Boolean);
    if (pts.length < 2) continue;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, 2.5, p.z))),
      new THREE.LineBasicMaterial({ color: r.color }),
    );
    g.add(line);
    if (r.kind === 'metro' || r.kind === 'boat' || r.kind === 'cable') {
      const mid = pts[Math.floor(pts.length / 2)];
      const label = labelSprite(r.name.replace('地铁', ''), '#' + r.color.toString(16).padStart(6, '0'));
      label.position.set(0, 10, 0);
      label.scale.set(48, 12, 1);
      // 线路名牌远距隐藏（LOD 以线路中点定位）
      const lod = detailSwitch(label, DECOR_LOD);
      lod.position.copy(mid);
      g.add(lod);
    }
  }
  return g;
}

// ---- 车流（动态车辆：沿主干道行驶，让街道"活"起来） ----
// 用 InstancedMesh 把全城车辆合并为极少数 draw call：
//   车身按 3 档色各 1 个实例网格 + 车顶 1 个 + 车轮 1 个 = 共 5 个 draw call。
// 每帧仅更新 instanceMatrix（无 draw call 增减），比独立 Group 高效数倍。
const CAR_BODY = markSharedGeo(new THREE.BoxGeometry(4.6, 1.3, 2.2));
const CAR_CABIN = markSharedGeo(new THREE.BoxGeometry(2.2, 0.8, 1.9));
const CAR_WHEEL = markSharedGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8));
const _up = new THREE.Vector3(0, 1, 0);

interface CarEntity {
  colorIdx: number;         // 车身颜色档（对应一个 InstancedMesh）
  instIdx: number;          // 该色档内的实例索引
  x1: number; z1: number;   // 线段起点
  x2: number; z2: number;   // 线段终点
  t: number;                // 0..1 沿线进度
  dir: 1 | -1;              // 行驶方向
  speed: number;            // 单位/秒
}

/** 车身颜色档（每档一个 InstancedMesh；3 档兼顾多彩与 draw call） */
const CAR_COLORS = [0xd8dde4, 0xc84f3a, 0x3a6ea8];
const _M = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3(1, 1, 1);

/**
 * 构建车流：在每个区的路网主干道上撒车，绑定一条线段往返行驶。
 * 用 InstancedMesh 合并渲染，返回 { group, update }。
 */
function buildVehicles(nets: DistrictRoadNet[]): { group: THREE.Group; update: (t: number) => void } {
  const group = new THREE.Group();
  const cars: CarEntity[] = [];
  const cabinMat = mat(0x1a2a3a);
  const wheelMat = mat(0x11161c);
  // 每种车身色一个 InstancedMesh（实例数先为 0，构建后设置 count）
  const bodyMeshes = CAR_COLORS.map(c => {
    const im = new THREE.InstancedMesh(CAR_BODY, mat(c), 0);
    im.castShadow = true;
    im.frustumCulled = false; // 车辆分散全城，禁 frustum 避免误剔（数量少，可接受）
    return im;
  });
  const cabinMesh = new THREE.InstancedMesh(CAR_CABIN, cabinMat, 0);
  const wheelMesh = new THREE.InstancedMesh(CAR_WHEEL, wheelMat, 0);
  let seed = 21;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const CAR_PER_DISTRICT = 4;   // 每区主干道车辆数
  // 先收集所有车的色档与线段，再按色档分桶计实例数
  const plans: Array<{ color: number; seg: { x1: number; z1: number; x2: number; z2: number } }> = [];
  for (const net of nets) {
    const majors = net.segs.filter(s => s.major && Math.hypot(s.x2 - s.x1, s.z2 - s.z1) > 60);
    if (!majors.length) continue;
    const budget = Math.min(CAR_PER_DISTRICT, majors.length * 2);
    for (let k = 0; k < budget; k++) {
      const s = majors[k % majors.length];
      plans.push({ color: Math.floor(rnd() * CAR_COLORS.length), seg: s });
    }
  }
  // 全城无主干道 → 不构建车辆
  if (!plans.length) return { group, update: () => {} };
  // 初始化 InstancedMesh 容量
  const perColor = new Array(CAR_COLORS.length).fill(0);
  for (const p of plans) perColor[p.color]++;
  bodyMeshes.forEach((im, i) => im.count = perColor[i]);
  cabinMesh.count = plans.length;
  wheelMesh.count = plans.length * 4;
  const colorPtr = new Array(CAR_COLORS.length).fill(0);

  plans.forEach(p => {
    const s = p.seg;
    cars.push({
      colorIdx: p.color, instIdx: colorPtr[p.color]++,
      x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2,
      t: rnd(),
      dir: rnd() > 0.5 ? 1 : -1,
      speed: 16 + rnd() * 10, // 略慢于玩家步行(26)，让玩家能追上
    });
  });
  bodyMeshes.forEach(im => group.add(im));
  group.add(cabinMesh, wheelMesh);

  const wheelOffsets: Array<[number, number, number]> = [[1.6, 0.4, 0.9], [1.6, 0.4, -0.9], [-1.6, 0.4, 0.9], [-1.6, 0.4, -0.9]];

  let lastT = 0;
  function update(t: number) {
    if (!lastT) { lastT = t; return; }
    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.1) dt = 0.1; // clamp 防跳帧
    for (const c of cars) {
      const len = Math.hypot(c.x2 - c.x1, c.z2 - c.z1) || 1;
      c.t += c.dir * (c.speed * dt) / len;
      if (c.t > 1) { c.t = 1; c.dir = -1; }      // 到终点反向
      else if (c.t < 0) { c.t = 0; c.dir = 1; }  // 到起点反向
      const x = c.x1 + (c.x2 - c.x1) * c.t;
      const z = c.z1 + (c.z2 - c.z1) * c.t;
      // 朝向：沿行驶方向（车头默认 +z，旋转绕 Y）
      const fx = c.x2 - c.x1, fz = c.z2 - c.z1;
      const ang = c.dir === 1 ? Math.atan2(fx, fz) : Math.atan2(-fx, -fz);
      _quat.setFromAxisAngle(_up, ang);

      // 车身实例
      _pos.set(x, 1.25, z);
      _M.compose(_pos, _quat, _scl);
      bodyMeshes[c.colorIdx].setMatrixAt(c.instIdx, _M);
      // 车顶实例（相对车身 y=+0.75）
      _pos.set(x, 2.0, z);
      _M.compose(_pos, _quat, _scl);
      cabinMesh.setMatrixAt(c.instIdx, _M);
      // 四轮实例（绕车身中心随朝向旋转）
      for (let w = 0; w < 4; w++) {
        const [wx, wz] = wheelOffsets[w];
        const rx = wx * Math.cos(ang) + wz * Math.sin(ang);
        const rz = -wx * Math.sin(ang) + wz * Math.cos(ang);
        _pos.set(x + rx, 0.4, z + rz);
        _M.compose(_pos, _quat, _scl);
        wheelMesh.setMatrixAt(c.instIdx * 4 + w, _M);
      }
    }
    bodyMeshes.forEach(im => im.instanceMatrix.needsUpdate = true);
    cabinMesh.instanceMatrix.needsUpdate = true;
    wheelMesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}

/** 世界构建结果：root 场景组 + 每帧 tick + 氛围句柄（昼夜/天气可调） */
export interface WorldHandle {
  root: THREE.Group;
  tick: (t: number) => void;
  /** 光照句柄（日光/天光/补光），供昼夜循环调节 */
  lighting: LightingRig;
  /** 天空材质（uniforms 可控） */
  skyMat: THREE.ShaderMaterial;
  /** 场景雾（昼夜循环可调色/浓度） */
  fog: THREE.Fog;
  /** 全城道路图（NPC 游走用；无路网时为 null） */
  roadGraph: RoadGraph | null;
  /** 流式加载控制器：按玩家位置动态挂载/卸载区块（阶段三） */
  streaming: { update(px: number, pz: number): void };
  /** 释放本世界独占的 GPU 资源（共享几何/材质/贴图保留，供重入复用） */
  dispose(): void;
}

/**
 * 阶段三：分块流式加载控制器。
 * 区块（district building 组 + 地标组）构建完成后先不入场景树，
 * 按玩家位置与 STREAM_R 距离动态挂载/卸载；路面/地面/交通等轻量组常驻。
 * 碰撞体不随可视卸载（体积小，保持全局一致性，避免 NPC 穿墙）。
 */
const STREAM_R = 2400;   // 挂载半径（含远视距）
const STREAM_HYST = 600; // 卸载迟滞（防边界抖动）

interface StreamCell {
  group: THREE.Group;
  x: number;
  z: number;
  loaded: boolean;
}

function makeStreaming(root: THREE.Group, cells: StreamCell[]) {
  return {
    update(px: number, pz: number) {
      for (const c of cells) {
        const d = Math.hypot(c.x - px, c.z - pz);
        if (!c.loaded && d < STREAM_R) {
          root.add(c.group);
          c.loaded = true;
        } else if (c.loaded && d > STREAM_R + STREAM_HYST) {
          root.remove(c.group);
          c.loaded = false;
        }
      }
    },
  };
}

/** 主构建入口 */
export function buildWorld(scene: Scene): WorldHandle {
  // 重建世界前清空全局碰撞体（引擎可反复进出，避免碰撞盒无限累积）
  collision.clear();

  const root = new THREE.Group();
  const ticks: Array<(t: number) => void> = [];

  // 氛围：天空穹顶 + 远山
  const sky = buildSky();
  root.add(sky.mesh);
  root.add(buildDistantHills());

  // 波光海面
  const sea = buildSea();
  root.add(sea.mesh);
  ticks.push(sea.update);

  // 基础地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    groundMaterial('grass', 24),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  root.add(ground);

  // 区块：路网生成（世界坐标）→ 贴边建筑（局部坐标）→ 路面渲染 → 流式区块
  const nets: DistrictRoadNet[] = [];
  const streamCells: StreamCell[] = [];
  for (const d of scene.districts) {
    const c = proj(d.center.lat, d.center.lng);
    // 路网在世界坐标下生成（含区中心偏移），路面组直接挂世界根
    const net = generateRoadNet({
      id: d.id, cx: c.x, cz: c.z, radius: d.cityRadius, density: d.density,
    });
    if (net.segs.length) {
      nets.push(net);
      const roadMesh = buildRoadMesh(net);
      root.add(roadMesh);
    }
    // 街区建筑组（局部坐标，挂区中心）
    const blk = buildDistrictBlock(d, net);
    mergeStaticGroup(blk);
    // 阶段三：街区建筑按区流式挂载（近城常驻，远城卸载）
    streamCells.push({ group: blk, x: c.x, z: c.z, loaded: false });

    // 街道家具：行道树 + 路灯（沿本区路网，静态合并）
    // 按区独立合并并随建筑流式挂载，使合并 mesh 包围盒只覆盖本区 → 远区可视锥剔除/卸载
    const trees = buildStreetTrees([net]);
    if (trees.children.length) streamCells.push({ group: trees, x: c.x, z: c.z, loaded: false });
    const lamps = buildStreetLamps([net]);
    if (lamps.children.length) streamCells.push({ group: lamps, x: c.x, z: c.z, loaded: false });
  }

  // 地标（P2：优先加载真实 GLTF 低模，缺失则降级到程序化 builder）
  for (const l of scene.landmarks) {
    const lmGroup = new THREE.Group();
    const p = proj(l.latlng.lat, l.latlng.lng);
    lmGroup.position.set(p.x, 0, p.z);

    // 尝试 GLTF 模型（异步加载，加载中先显示程序化占位）
    const builder = BUILDERS[l.id];
    let built: THREE.Object3D | null = null;
    if (builder) {
      built = builder();
      mergeStaticGroup(built);
      lmGroup.add(built);
    } else {
      built = box(lmGroup, 0, 0, 0, 26, 22, 20, 0xb8c4d0);
    }
    // 地标碰撞体（世界坐标；玩家不可穿楼）——按地标包围盒近似（24x24 底面）
    collision.addBoxCenter(p.x, p.z, 24, 24, 6);
    // 加载成功后替换为真实模型（异步完成后替换组内容）
    loadLandmarkModel(scene.id, l.id).then(gltf => {
      if (!gltf || !built) return; // 无资源 → 保留程序化 fallback
      lmGroup.remove(built);
      gltf.position.y = 0;
      lmGroup.add(gltf);
    });

    // 名牌 + 交互光圈（远距自动隐藏：装饰物 LOD）
    const decor = new THREE.Group();
    const label = labelSprite(l.name);
    label.position.y = (LABEL_HEIGHT[l.id] ?? 34) + 8;
    decor.add(label);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry((l.interactRadius ?? 600) - 4, l.interactRadius ?? 600, 48),
      new THREE.MeshBasicMaterial({ color: 0x1fb9a8, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    decor.add(ring);
    lmGroup.add(detailSwitch(decor, DECOR_LOD));

    root.add(lmGroup);
  }

  // 出生点传送门（几何合并；门柱注册碰撞，光圈/光柱不注册）
  for (const sp of scene.spawnPoints) {
    const portal = buildSpawnPortal(sp);
    mergeStaticGroup(portal);
    root.add(portal);
    const pp = proj(sp.latlng.lat, sp.latlng.lng);
    collision.addBoxCenter(pp.x, pp.z, 24, 12, 0); // 门框横向两根
  }

  // 交通（站亭注册碰撞；站间距大，常驻渲染）
  const traffic = buildTraffic(scene);
  root.add(traffic);
  if (scene.traffic) {
    for (const s of scene.traffic.stations) {
      const p = proj(s.latlng.lat, s.latlng.lng);
      collision.addBoxCenter(p.x, p.z, 11, 11, 0); // 玻璃方亭 8x8 + 扶梯
    }
  }

  // 车流（动态车辆沿主干道行驶，让街道"活"起来）
  const vehicles = nets.length ? buildVehicles(nets) : null;
  if (vehicles && vehicles.group.children.length) {
    root.add(vehicles.group);
    ticks.push(vehicles.update);
  }

  // 光照
  const lighting = buildLighting();
  root.add(lighting.group);

  // 全城道路图（NPC 游走；无路网则 null）
  const roadGraph = nets.length ? buildRoadGraph(nets) : null;

  return {
    root,
    tick: (t: number) => ticks.forEach(f => f(t)),
    lighting,
    skyMat: sky.mat,
    fog: new THREE.Fog(0xbfd4e6, 1200, 5600),
    roadGraph,
    streaming: makeStreaming(root, streamCells),
    dispose() {
      disposeObjectAssets(root);
      // 流式卸载中的区块不在 root 树下，需单独释放
      for (const c of streamCells) if (!c.loaded) disposeObjectAssets(c.group);
      streamCells.length = 0;
      ticks.length = 0;
    },
  };
}
