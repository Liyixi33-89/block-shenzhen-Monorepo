// 内容驱动的世界构建：区划街区 + 专属地标 + 交通 + 出生点 + 氛围
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { proj } from '@block-sz/shared';
import type { Scene } from '@block-sz/schema';
import { BUILDERS, LABEL_HEIGHT } from './builders';
import { buildSky, buildSea, buildLighting, buildDistantHills, type LightingRig } from './atmosphere';
import { facadeMaterial, groundMaterial } from './textures';

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

/** 程序化建筑材质缓存（按颜色，P0 升级为物理材质以呈现光影质感） */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: { emissive?: number } = {}) {
  const key = color + ':' + (opts.emissive ?? 0);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    matCache.set(key, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

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

/** 区块网格：以区中心为圆心的程序化街区 */
function buildDistrictBlock(d: Scene['districts'][number]): THREE.Group {
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

  const count = { cbd: 130, urban: 80, suburb: 30, none: 0 }[d.density] ?? 0;
  let seed = d.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7);
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const maxH = { cbd: 60, urban: 34, suburb: 14, none: 10 }[d.density] ?? 10;
  // P2 外立面图集：同色建筑共享窗格贴图（统一 repeat 以保住合并优化）
  const facade = (tone: number) => facadeMaterial(tone, d.density === 'cbd' ? 3 : 2, seed);
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * (R - 30);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const h = 6 + rnd() * rnd() * maxH;
    const w = 10 + rnd() * 14, dp = 10 + rnd() * 14;
    const tone = [0x6f87a8, 0x7d94b5, 0x5d7494][Math.floor(rnd() * 3)];
    box(g, x, 1, z, w, h, dp, tone, { facade: facade(tone) });
    if (h > 30 && rnd() > 0.5) {
      box(g, x, 1 + h, z, w * 0.4, 4, dp * 0.4, 0xffe9a8, { emissive: 0x332200 });
    }
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
}

/** 主构建入口 */
export function buildWorld(scene: Scene): WorldHandle {
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

  // 区块
  for (const d of scene.districts) {
    const blk = buildDistrictBlock(d);
    mergeStaticGroup(blk);
    root.add(blk);
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

  // 出生点传送门（几何合并）
  for (const sp of scene.spawnPoints) {
    const portal = buildSpawnPortal(sp);
    mergeStaticGroup(portal);
    root.add(portal);
  }

  // 交通
  root.add(buildTraffic(scene));

  // 光照
  const lighting = buildLighting();
  root.add(lighting.group);

  return {
    root,
    tick: (t: number) => ticks.forEach(f => f(t)),
    lighting,
    skyMat: sky.mat,
    fog: new THREE.Fog(0xbfd4e6, 1200, 5600),
  };
}
