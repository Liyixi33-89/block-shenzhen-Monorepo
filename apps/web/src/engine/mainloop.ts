// 主循环单帧推进：世界 tick、流式加载、NPC/昼夜/天气/交通/建造/传送节流、
// 投资结算、玩家移动与探测、FPS 统计。
// 【engine 横切层】从 engine.ts 抽出 loop 主体；依赖经 MainloopRuntime 接口注入。
import * as THREE from 'three';
import { proj } from '@block-sz/shared';
import type { Scene, Landmark } from '@block-sz/schema';
import type { PlayerAPI } from './player';

/** 每帧推进所需引擎能力（由 GameEngine 实现） */
export interface MainloopRuntime {
  state: {
    clock: string;
    night: boolean;
    weather: string;
    pos: { x: number; z: number };
    nearLandmark: Landmark | null;
    districtName: string;
    fps: number;
  };
  worldTick: ((t: number) => void) | null;
  streaming: { update(px: number, pz: number): void } | null;
  lightingRig: { followShadow(x: number, z: number): void } | null;
  npc: { tick?(t: number, dt: number): void } | null;
  dayNight: { update(dt: number): void; clockString(): string; isNight(): boolean } | null;
  weather: { update(dt: number): void; label: string } | null;
  transit: {
    update(dt: number, player: PlayerAPI, keys: Set<string>): void;
    riding: boolean;
  } | null;
  buildMode: { update(): void } | null;
  teleport: { tickRefresh(): void } | null;
  gameplay: {
    hasEffect(k: string): boolean;
    walk(m: number): void;
    probe(p: { x: number; z: number }): Array<{ id: string }>;
    settleInvestment(): void;
  } | null;
  player: PlayerAPI | null;
  sceneData: Scene | null;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  three: THREE.Scene;
  // —— 可变状态（engine 持久持有，函数内原地修改，避免每帧重建引用）——
  shadowPos: { x: number; z: number };
  lastPos: { x: number; z: number };
  tpRefreshAcc: { v: number };
  investAcc: { v: number };
  fpsAcc: { v: number };
  fpsFrames: { v: number };
  /** 区中心投影坐标缓存（每帧区名判断，静态坐标只需算一次） */
  districtProj: { x: number; z: number }[] | null;
}

/** 推进一帧（loop 每次 rAF 调用）。dt 已由调用方 clamp。 */
export function stepFrame(r: MainloopRuntime, dt: number, t: number) {
  r.worldTick?.(t);

  // 阶段三：分块流式加载（按玩家位置挂载/卸载街区建筑）
  if (r.streaming && r.player) {
    r.streaming.update(r.player.position.x, r.player.position.z);
    // 阴影相机跟随玩家：位移超过阈值才更新（避免逐帧抖动导致阴影边缘闪烁）
    const px = r.player.position.x, pz = r.player.position.z;
    if (Math.hypot(px - r.shadowPos.x, pz - r.shadowPos.z) > 120) {
      r.shadowPos.x = px; r.shadowPos.z = pz;
      r.lightingRig?.followShadow(px, pz);
    }
  }

  // P1 角色动画：NPC 浮动微动 / 路网游走
  r.npc?.tick?.(t, dt);

  // 日夜循环推进（虚拟时钟）
  r.dayNight?.update(dt);
  r.state.clock = r.dayNight?.clockString() ?? '08:00';
  r.state.night = r.dayNight?.isNight() ?? false;

  // 天气推进（雨/雪粒子）
  r.weather?.update(dt);
  r.state.weather = r.weather?.label ?? '晴';

  // 交通：乘车期间接管相机与玩家
  if (r.transit && r.player) {
    r.transit.update(dt, r.player, r.player.keys);
  }

  // 建造幽灵光标跟随
  r.buildMode?.update();

  // 传送面板冷却倒计时刷新（节流）
  r.tpRefreshAcc.v += dt;
  if (r.tpRefreshAcc.v > 1) { r.tpRefreshAcc.v = 0; r.teleport?.tickRefresh(); }

  // P2 投资被动收益结算（每 30s 一次）
  r.investAcc.v += dt;
  if (r.investAcc.v > 30) { r.investAcc.v = 0; r.gameplay?.settleInvestment(); }

  const riding = r.transit?.riding ?? false;

  if (r.player && r.gameplay && !riding) {
    // speed 道具效果：移动速度 ×1.5（飞行同步加成）
    r.player.speedBoost = r.gameplay.hasEffect('speed') ? 1.5 : 1;
    r.player.update(dt, r.sceneData?.landmarks ?? []);
    const pos = r.player.position;
    r.state.pos.x = Math.round(pos.x);
    r.state.pos.z = Math.round(pos.z);

    // 行走里程
    const moved = Math.hypot(pos.x - r.lastPos.x, pos.z - r.lastPos.z);
    if (moved > 0.5) r.gameplay.walk(moved);
    r.lastPos.x = pos.x; r.lastPos.z = pos.z;

    // 到访 / 近地标
    const nearby = r.gameplay.probe({ x: pos.x, z: pos.z });
    r.state.nearLandmark = nearby[0]
      ? r.sceneData!.landmarks.find(l => l.id === nearby[0].id) ?? null
      : null;

    // 区名
    let bestD = Infinity, bestName = '';
    if (!r.districtProj) {
      r.districtProj = r.sceneData!.districts.map(d => {
        const c = proj(d.center.lat, d.center.lng);
        return { x: c.x, z: c.z };
      });
    }
    const dists = r.sceneData!.districts;
    for (let i = 0; i < dists.length; i++) {
      const c = r.districtProj[i];
      const dist = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (dist < bestD) { bestD = dist; bestName = dists[i].name; }
    }
    r.state.districtName = bestD < 1500 ? bestName : '深圳郊野';
  }

  r.fpsAcc.v += dt; r.fpsFrames.v++;
  if (r.fpsAcc.v >= 0.5) {
    r.state.fps = Math.round(r.fpsFrames.v / r.fpsAcc.v);
    r.fpsAcc.v = 0; r.fpsFrames.v = 0;
  }

  r.renderer.render(r.three, r.camera);
}