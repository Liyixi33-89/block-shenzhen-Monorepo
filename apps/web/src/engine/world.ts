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
        // 楼宇尺寸：贴边深度 8-14，宽度略小于步长
        const depth = 8 + rnd() * 6;
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
        // 高楼屋顶灯箱
        if (h > 30 && rnd() > 0.5) {
          const cap = new THREE.Mesh(boxGeo, mat(0xffe9a8, { emissive: 0x332200 }));
          cap.scale.set((alongX ? w : depth) * 0.4, 4, (alongX ? depth : w) * 0.4);
          cap.position.set(cx, 1 + h + 2, cz);
          g.add(cap);
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
    // 地铁入口风格：玻璃方亭
    box(st, 0, 0, 0, 8, 4.4, 8, 0x4a6a8a);
    box(st, 0, 4.4, 0, 6.4, 0.8, 6.4, 0x7ad0ff, { emissive: 0x0a2a4a });
    // 出口扶梯
    box(st, 5.5, 0, 0, 3, 3, 5, 0x39546e);
    const label = labelSprite(s.name, '#7ad0ff');
    label.position.y = 14;
    label.scale.set(44, 11, 1);
    st.add(label);
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
      label.position.set(mid.x, 10, mid.z);
      label.scale.set(48, 12, 1);
      g.add(label);
    }
  }
  return g;
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

    // 名牌（专属高度或默认 34）
    const label = labelSprite(l.name);
    label.position.y = (LABEL_HEIGHT[l.id] ?? 34) + 8;
    lmGroup.add(label);

    // 交互光圈
    const ring = new THREE.Mesh(
      new THREE.RingGeometry((l.interactRadius ?? 600) - 4, l.interactRadius ?? 600, 48),
      new THREE.MeshBasicMaterial({ color: 0x1fb9a8, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    lmGroup.add(ring);

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
