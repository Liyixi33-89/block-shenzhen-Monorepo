// 轻量碰撞系统：AABB（轴对齐包围盒）+ 空间哈希网格（uniform grid）。
// 用于玩家「试探移动 + 碰撞响应」与 NPC/车辆的移动约束。
//
// 设计要点：
// - 世界静态碰撞体只有「盒子」一种（建筑/地标/站台等静态物），AABB 足够；
// - 动态实体（玩家/NPC）抽象为圆柱（半径 r），与 AABB 做圆-盒相交测试；
// - 空间哈希：把世界划成 CELL 大小格 子，插入 AABB 时按覆盖格子登记，
//   查询时只取实体所在格子附近的盒子，O(1) 量级；
// - 碰撞响应：滑动（slide）——先尝试完整位移，被挡时分别尝试仅 X / 仅 Z 分量，
//   沿墙面滑行而非卡死。
export interface AABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/** 空间哈希格子边长（建筑尺度 ~10-30 单位，格 128 平衡查询密度） */
const CELL = 128;

export class CollisionWorld {
  private buckets = new Map<number, AABB[]>();
  private boxCount = 0;

  /** 注册一个静态碰撞盒 */
  addBox(b: AABB) {
    this.forEachCell(b, cell => {
      let arr = this.buckets.get(cell);
      if (!arr) { arr = []; this.buckets.set(cell, arr); }
      arr.push(b);
    });
    this.boxCount++;
  }

  /** 便捷注册：中心 + 宽深（不含高度；地面移动是 2D 碰撞） */
  addBoxCenter(cx: number, cz: number, w: number, d: number, pad = 0) {
    this.addBox({ minX: cx - w / 2 - pad, maxX: cx + w / 2 + pad, minZ: cz - d / 2 - pad, maxZ: cz + d / 2 + pad });
  }

  get size() { return this.boxCount; }

  /** 遍历 AABB 覆盖的所有哈希格 */
  private forEachCell(b: AABB, fn: (cell: number) => void) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        fn(this.cellKey(x, z));
      }
    }
  }

  private cellKey(x: number, z: number): number {
    // 打包二维格坐标为单一数字键
    return (x + 4096) * 16384 + (z + 4096);
  }

  /** 收集与查询圆（x, z, r）可能相关的盒子（所在格子及邻格） */
  private nearby(x: number, z: number, r: number, out: AABB[]) {
    out.length = 0;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.buckets.get(this.cellKey(cx, cz));
        if (arr) for (const b of arr) if (!out.includes(b)) out.push(b);
      }
    }
  }

  /** 圆与 AABB 是否相交 */
  private static circleHitsBox(x: number, z: number, r: number, b: AABB): boolean {
    const nx = Math.max(b.minX, Math.min(x, b.maxX));
    const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - nx, dz = z - nz;
    return dx * dx + dz * dz < r * r;
  }

  /** 位置（圆）是否与任何碰撞盒相交 */
  blocked(x: number, z: number, r: number): boolean {
    this.nearby(x, z, r, this.scratch);
    for (const b of this.scratch) {
      if (CollisionWorld.circleHitsBox(x, z, r, b)) return true;
    }
    return false;
  }

  private scratch: AABB[] = [];

  /** 清空全部碰撞体（重建世界前调用，避免重入游戏时无限累积） */
  clear() {
    this.buckets.clear();
    this.boxCount = 0;
  }

  /**
   * 试探移动 + 滑动响应：从 (x,z) 移动 (dx,dz)，返回修正后的新位置。
   * 1) 完整位移可行 → 直达；
   * 2) 否则尝试仅 X 分量、仅 Z 分量（贴墙滑行）；
   * 3) 都不行 → 原地。
   */
  move(x: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } {
    if (dx === 0 && dz === 0) return { x, z };
    const nx = x + dx, nz = z + dz;
    if (!this.blocked(nx, nz, r)) return { x: nx, z: nz };
    // 滑动：仅 X
    if (dx !== 0 && !this.blocked(x + dx, z, r)) return { x: x + dx, z };
    // 滑动：仅 Z
    if (dz !== 0 && !this.blocked(x, z + dz, r)) return { x, z: z + dz };
    return { x, z };
  }

  /**
   * 碰撞安全的落点搜索：从期望点向外螺旋找第一个不阻塞的位置。
   * 用于传送/出生时避免把实体塞进建筑里。
   */
  findFreeSpot(x: number, z: number, r: number): { x: number; z: number } {
    if (!this.blocked(x, z, r)) return { x, z };
    for (let ring = 1; ring <= 24; ring++) {
      const step = ring * (r + 6);
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const cx = x + Math.cos(ang) * step;
        const cz = z + Math.sin(ang) * step;
        if (!this.blocked(cx, cz, r)) return { x: cx, z: cz };
      }
    }
    return { x, z }; // 实在找不到（全被占），原样返回
  }
}

/** 全局碰撞世界单例句柄（由 buildWorld 创建，player/npc 消费；模块级便于引擎接线） */
export const collision = new CollisionWorld();
