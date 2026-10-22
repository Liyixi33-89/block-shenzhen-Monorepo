// 全局按键路由：E 交互 / C 相机 / F 自拍 / V 起飞 / S 商店 / G 广场 / O 图鉴 / 空格快门。
// 【engine 横切层】从 engine.ts 抽出；依赖经 KeymapTarget 接口注入，engine 为唯一实现方。
import type * as THREE from 'three';

/** Keymap 依赖的引擎能力（由 GameEngine 实现） */
export interface KeymapTarget {
  player: {
    position: THREE.Vector3;
    flying: boolean;
    flightMode(on: boolean): void;
  } | null;
  camera: THREE.PerspectiveCamera;
  npc: { tryInteract(pos: THREE.Vector3): boolean } | null;
  deck: { tryInteract(): boolean } | null;
  transit: { tryInteract(pos: THREE.Vector3): boolean } | null;
  photoMode: {
    /** 切换拍照模式，返回切换后的 active 状态 */
    toggle(): boolean;
    /** 实时读取当前是否处于拍照模式 */
    active(): boolean;
    toggleSelfie(): void;
    /** 实时读取是否处于自拍模式 */
    selfie(): boolean;
    shoot(cam: THREE.PerspectiveCamera): void;
  } | null;
  ascension: { has(k: string): boolean } | null;
  shop: { toggle(): void; refresh(): void } | null;
  gallery: { toggle(): void } | null;
  souvenir: { toggle(): void } | null;
  /** 拍照模式切换后的状态同步钩子（engine 用它更新 HUD state.photoActive） */
  onPhotoToggle?(active: boolean): void;
  toast(msg: string): void;
}

/** 注册全局按键监听；返回清理函数（dispose 时调用）。 */
export function mountKeymap(target: KeymapTarget): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e' && target.player) {
      // NPC 对话优先（更近的交互），否则观景台登顶/下塔，否则地铁站
      if (target.npc?.tryInteract(target.player.position)) return;
      if (target.deck?.tryInteract()) return;
      // 站内交互键：手动探测最近站并开面板（transit.update 每帧轮询 keys 不可靠，
      // 因为合成键盘事件在 keyup 后 keys 已清空，改由事件直推）
      target.transit?.tryInteract(target.player.position);
      return;
    }
    if (k === 'c' && target.photoMode && target.player) {
      const active = target.photoMode.toggle();
      target.onPhotoToggle?.(active);
    } else if (k === 'f' && target.photoMode?.active()) {
      // 自拍模式切换（举起相机后）
      target.photoMode.toggleSelfie();
      target.toast(target.photoMode.selfie() ? '自拍模式开启' : '自拍模式关闭');
    } else if (k === 'v' && target.player && target.ascension?.has('fly') && !target.photoMode?.active() && !target.player.flying) {
      // 飞升 fly 解锁：V 键起飞（落地自动退出，飞行中再按无效防抖）
      target.player.flightMode(true);
      target.toast('起飞！Space 上升 · Ctrl 下降 · 降至地面自动降落');
    } else if (k === 's' && target.shop && target.player && !target.photoMode?.active()) {
      // P2 商店/投资面板（拍照模式时不抢占）
      target.shop.toggle();
      target.shop.refresh();
    } else if (k === 'g' && target.gallery && target.player && !target.photoMode?.active()) {
      // P2-4 作品广场
      target.gallery.toggle();
    } else if (k === 'o' && target.souvenir && target.player && !target.photoMode?.active()) {
      // 纪念品图鉴
      target.souvenir.toggle();
    } else if (k === ' ' && target.photoMode?.active() && target.camera) {
      e.preventDefault();
      target.photoMode.shoot(target.camera);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}