// 系统工厂：BuildMode / TeleportSystem 构造参数的唯一组装点
// 【engine 组合根】此前 loadPhase('systems') 与 materializeLockedSystems()
// 两处各写一遍 ~40 行构造代码（复制式膨胀），收敛于此。
import type * as THREE from 'three';
import type { Scene } from '@block-sz/schema';
import { BuildMode } from './build';
import { TeleportSystem, teleportPos } from './teleport';
import { Gameplay } from '../domain/gameplay';

/** 组合根上下文：工厂内只通过该接口访问引擎持有的对象 */
export interface SystemContext {
  container: HTMLElement;
  camera: THREE.PerspectiveCamera;
  scene3: THREE.Scene;
  sceneData: Scene;
  gameplay: Gameplay;
  getPlayerPos: () => THREE.Vector3;
  /** 传送落点（跨系统复用 teleportPos） */
  teleportPlayer: (x: number, z: number) => void;
  /** 面板占用判断（B/T 等模式键冲突防护） */
  panelOpen: () => boolean;
  toast: (msg: string) => void;
  /** 放置/移除后的持久化钩子 */
  onChanged: () => void;
}

export function createBuildMode(ctx: SystemContext): BuildMode {
  const mode = new BuildMode({
    container: ctx.container,
    camera: ctx.camera,
    scene3: ctx.scene3,
    data: ctx.sceneData,
    getPlayerPos: ctx.getPlayerPos,
    spend: n => ctx.gameplay.spend(n),
    addItem: (id, n) => ctx.gameplay.addItem(id, n),
    getItemCount: id => ctx.gameplay.state.inventory[id] ?? 0,
    onPlace: p => {
      ctx.gameplay.notePlacement(p);
      ctx.onChanged();
    },
    onRemove: n => {
      ctx.gameplay.removePlacement(n);
      ctx.onChanged();
    },
    toast: msg => ctx.toast(msg),
  });
  mode.restore(ctx.gameplay.state.placements);
  mode.setPanelGuard(() => ctx.panelOpen());
  return mode;
}

export function createTeleport(ctx: SystemContext): TeleportSystem {
  return new TeleportSystem({
    container: ctx.container,
    data: ctx.sceneData,
    spend: n => ctx.gameplay.spend(n),
    isVisited: id => ctx.gameplay.state.visited.includes(id),
    isQuestDone: id => ctx.gameplay.state.questProgress[id]?.done ?? false,
    onUnlock: id => ctx.gameplay.unlockTeleport(id),
    onTeleport: tp => {
      const p = teleportPos(tp);
      ctx.teleportPlayer(p.x, p.z);
      ctx.toast(`已传送至 ${tp.name}`);
      ctx.onChanged();
    },
    toast: msg => ctx.toast(msg),
    panelGuard: () => ctx.panelOpen(),
  });
}
