// 程序化路网生成：网格偏移（grid + jitter）算法在圆形街区内核内长出「主干道 + 支路」，
// 建筑贴街区边缘摆放（而非随机散布），并为阶段二提供道路可行走图（供 NPC 游走）。
//
// 设计要点：
// - 每个区划（district）内部生成独立网格路网，网格线间距 = 主干道间距；
// - 网格线带随机抖动（jitter）打破机械感，形成「有机」路网；
// - 每个网格单元（cell）是一个街区地块，建筑沿地块四边贴边布置，中间留院落；
// - 主干道（间隔数条取一）更宽，其余为支路；
// - 输出道路线段集合 + 街区地块集合，供渲染与碰撞注册使用。
import * as THREE from 'three';

/** 一条道路线段（世界坐标 XZ 平面） */
export interface RoadSeg {
  x1: number; z1: number;
  x2: number; z2: number;
  /** 道路半宽（主干道 9 / 支路 5） */
  halfW: number;
  /** 是否主干道（渲染更亮的路面） */
  major: boolean;
}

/** 一个街区地块（矩形，建筑贴边摆放的区域） */
export interface BlockCell {
  x: number; z: number;    // 地块中心
  w: number; d: number;    // 地块宽深（已扣道路半宽）
  /** 建筑密度系数（cbd 高 / suburb 低） */
  density: number;
  /** 随机种子（建筑摆布确定性） */
  seed: number;
}

/** 一个区的路网生成结果 */
export interface DistrictRoadNet {
  segs: RoadSeg[];
  cells: BlockCell[];
}

/** 区划输入（与 scene.districts 字段对应） */
export interface RoadNetInput {
  /** 区划 id（决定随机种子） */
  id: string;
  /** 区中心世界坐标 */
  cx: number;
  cz: number;
  /** 区半径 */
  radius: number;
  /** 建筑密度档位 */
  density: 'cbd' | 'urban' | 'suburb' | 'none';
}

/** 主干道间距（世界单位；1km=200 单位 → 240 单位 ≈ 1.2km，符合主干道尺度） */
const GRID_CBD = 170;
const GRID_URBAN = 200;
const GRID_SUBURB = 260;

/** 简单可复现随机数（与 world.ts 同款 LCG） */
function mkRnd(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function hashStr(str: string): number {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

/**
 * 生成一个区划的路网。
 * 算法：在 [-R, R] 范围按间距生成带抖动的网格线（垂直线集 + 水平线集），
 * 线只保留「与圆核相交」的部分（裁剪到圆内），每条线等分为若干段（跨路口分段）。
 */
export function generateRoadNet(d: RoadNetInput): DistrictRoadNet {
  const segs: RoadSeg[] = [];
  const cells: BlockCell[] = [];
  if (d.radius <= 40 || d.density === 'none') return { segs, cells };

  const rnd = mkRnd(hashStr(d.id));
  const grid = d.density === 'cbd' ? GRID_CBD : d.density === 'urban' ? GRID_URBAN : GRID_SUBURB;
  const R = d.radius;
  // 网格线中心裁剪半径（留边距，避免路网延伸出地块圆盘）
  const coreR = R - 36;
  if (coreR < grid) return { segs, cells };

  // 带抖动的网格线坐标
  const jitter = grid * 0.22;
  const lines: { v: number[]; h: number[] } = { v: [], h: [] };
  const nLines = Math.floor((coreR * 2) / grid);
  for (let i = 0; i <= nLines; i++) {
    const base = -coreR + i * grid;
    // 边缘两条线不抖动，保持与外圈衔接整齐
    const j = (i === 0 || i === nLines) ? 0 : (rnd() - 0.5) * jitter;
    lines.v.push(base + j);
    const j2 = (i === 0 || i === nLines) ? 0 : (rnd() - 0.5) * jitter;
    lines.h.push(base + j2);
  }

  // 每 3 条线取 1 条为主干道（含首条，保证每区至少一条主干）
  const isMajor = (i: number) => i % 3 === 0;
  const halfOf = (major: boolean) => (major ? 9 : 5);

  // 垂直线：与圆核相交部分裁剪；按水平线集切段（路口分段）
  lines.v.forEach((x, vi) => {
    const major = isMajor(vi);
    const halfW = halfOf(major);
    // 圆内可行区间
    const dx = x - 0;
    if (Math.abs(dx) > coreR - halfW) return;
    const span = Math.sqrt(Math.max(0, coreR * coreR - dx * dx));
    if (span < halfW * 2) return;
    const zTop = -span, zBot = span;
    // 与水平线的交点集合（裁剪范围内的）
    const cuts: number[] = [];
    for (const h of lines.h) {
      if (h > zTop + 4 && h < zBot - 4) cuts.push(h);
    }
    cuts.sort((a, b) => a - b);
    // 分段：[zTop..cut1], [cut1..cut2], ...
    const bounds: Array<[number, number]> = [];
    let prev = zTop;
    for (const c of cuts) { bounds.push([prev, c]); prev = c; }
    bounds.push([prev, zBot]);
    for (const [za, zb] of bounds) {
      if (zb - za < 12) continue; // 过短丢弃
      segs.push({ x1: x, z1: za, x2: x, z2: zb, halfW, major });
    }
  });

  // 水平线同理
  lines.h.forEach((z, hi) => {
    const major = isMajor(hi);
    const halfW = halfOf(major);
    const span = Math.sqrt(Math.max(0, coreR * coreR - z * z));
    if (span < halfW * 2) return;
    const xL = -span, xR = span;
    const cuts: number[] = [];
    for (const v of lines.v) {
      if (v > xL + 4 && v < xR - 4) cuts.push(v);
    }
    cuts.sort((a, b) => a - b);
    const bounds: Array<[number, number]> = [];
    let prev = xL;
    for (const c of cuts) { bounds.push([prev, c]); prev = c; }
    bounds.push([prev, xR]);
    for (const [xa, xb] of bounds) {
      if (xb - xa < 12) continue;
      segs.push({ x1: xa, z1: z, x2: xb, z2: z, halfW, major });
    }
  });

  // 街区地块：相邻网格线之间的矩形，扣掉道路半宽与院落边距
  const densityFactor = d.density === 'cbd' ? 1 : d.density === 'urban' ? 0.7 : 0.35;
  const yardMargin = d.density === 'cbd' ? 6 : 10;
  for (let vi = 0; vi < lines.v.length - 1; vi++) {
    for (let hi = 0; hi < lines.h.length - 1; hi++) {
      const xL = lines.v[vi], xR = lines.v[vi + 1];
      const zT = lines.h[hi], zB = lines.h[hi + 1];
      const cx = (xL + xR) / 2, cz = (zT + zB) / 2;
      // 地块中心须在圆核内（避免边缘残块）
      if (Math.hypot(cx, cz) > coreR - 20) continue;
      const halfL = halfOf(isMajor(vi)), halfR = halfOf(isMajor(vi + 1));
      const halfT = halfOf(isMajor(hi)), halfB = halfOf(isMajor(hi + 1));
      const w = xR - xL - halfL - halfR - yardMargin * 2;
      const dd = zB - zT - halfT - halfB - yardMargin * 2;
      if (w < 24 || dd < 24) continue;
      cells.push({
        x: cx, z: cz, w, d: dd,
        density: densityFactor,
        seed: Math.floor(rnd() * 100000),
      });
    }
  }

  return { segs, cells };
}

// ---------------------------------------------------------------------------
// 渲染：路面 + 标线（合批为一组 Mesh）
// ---------------------------------------------------------------------------

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ROAD_MAIN_COLOR = 0x3a4048;   // 主干道深灰
const ROAD_SIDE_COLOR = 0x464d56;   // 支路灰
const MARK_COLOR = 0xd8d2b8;        // 标线米黄

/** 把一个区的路网渲染成 THREE.Group（路面 + 主干标线，全部静态可合并） */
export function buildRoadMesh(net: DistrictRoadNet): THREE.Group {
  const g = new THREE.Group();

  // 路面：按主/支分桶合并
  const geoMajor: THREE.BufferGeometry[] = [];
  const geoSide: THREE.BufferGeometry[] = [];
  for (const s of net.segs) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 1) continue;
    const geo = new THREE.PlaneGeometry(len + s.halfW * 2, s.halfW * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // 方向：垂直段沿 z，水平段沿 x；PlaneGeometry 建好后长边在 x
    const ang = Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
    geo.rotateY(-ang);
    geo.translate((s.x1 + s.x2) / 2, 0.06, (s.z1 + s.z2) / 2);
    (s.major ? geoMajor : geoSide).push(geo);
  }
  const addMerged = (geos: THREE.BufferGeometry[], color: number) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    geos.forEach(gg => gg.dispose());
    if (!merged) return;
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 }));
    m.receiveShadow = true;
    g.add(m);
  };
  addMerged(geoMajor, ROAD_MAIN_COLOR);
  addMerged(geoSide, ROAD_SIDE_COLOR);

  // 主干道中线标线（分段虚线）
  const marks: THREE.BufferGeometry[] = [];
  for (const s of net.segs) {
    if (!s.major) continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const dirX = (s.x2 - s.x1) / len, dirZ = (s.z2 - s.z1) / len;
    const dash = 12, gap = 10;
    let cur = 8;
    while (cur + dash < len - 8) {
      const geo = new THREE.PlaneGeometry(dash, 1.4, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const ang = Math.atan2(s.z2 - s.z1, s.x2 - s.x1);
      geo.rotateY(-ang);
      geo.translate(s.x1 + dirX * (cur + dash / 2), 0.09, s.z1 + dirZ * (cur + dash / 2));
      marks.push(geo);
      cur += dash + gap;
    }
  }
  if (marks.length) {
    const merged = mergeGeometries(marks, false);
    marks.forEach(gg => gg.dispose());
    if (merged) {
      const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: MARK_COLOR }));
      g.add(m);
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
// 道路图（供 NPC 游走 / 寻路采样）：把线段端点吸附为节点，段为边
// ---------------------------------------------------------------------------

/** 道路图：节点（路口/端点）+ 邻接表 */
export interface RoadGraph {
  nodes: Array<{ x: number; z: number }>;
  /** 邻接：node 索引 → 相邻 node 索引数组 */
  adj: number[][];
}

const NODE_EPS = 6; // 端点吸附距离

/** 把路网段集合编译为道路图（跨区合并，一次编译全城共用） */
export function buildRoadGraph(nets: DistrictRoadNet[]): RoadGraph {
  const nodes: Array<{ x: number; z: number }> = [];
  const adj: number[][] = [];
  const nodeIdx = (x: number, z: number): number => {
    // 线性查找（节点量级 ~数百，编译期一次性，可接受）
    for (let i = 0; i < nodes.length; i++) {
      if (Math.abs(nodes[i].x - x) < NODE_EPS && Math.abs(nodes[i].z - z) < NODE_EPS) return i;
    }
    nodes.push({ x, z });
    adj.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!adj[a].includes(b)) adj[a].push(b);
    if (!adj[b].includes(a)) adj[b].push(a);
  };
  for (const net of nets) {
    for (const s of net.segs) {
      link(nodeIdx(s.x1, s.z1), nodeIdx(s.x2, s.z2));
    }
  }
  return { nodes, adj };
}

/**
 * 在道路图上随机取一条游走路径（NPC 用）：
 * 从 start 出发随机走 stepCount 步，返回途经坐标序列。
 */
export function randomWalkPath(
  graph: RoadGraph,
  start: { x: number; z: number },
  stepCount = 6,
): Array<{ x: number; z: number }> {
  // 找最近节点
  let cur = 0, bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = Math.hypot(graph.nodes[i].x - start.x, graph.nodes[i].z - start.z);
    if (d < bestD) { bestD = d; cur = i; }
  }
  const path: Array<{ x: number; z: number }> = [graph.nodes[cur]];
  let prev = -1;
  for (let s = 0; s < stepCount; s++) {
    const neighbors = graph.adj[cur].filter(n => n !== prev);
    if (!neighbors.length) break;
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    path.push(graph.nodes[next]);
    prev = cur;
    cur = next;
  }
  return path;
}
