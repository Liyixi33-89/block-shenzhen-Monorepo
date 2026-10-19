// 存档编解码：GameplaySnapshot ↔ PlayerSave 字段映射唯一源
// 【services 服务层】消除 engine.ts 内联序列化（此前 saveNow / loadPhase 两处各写一遍）
import type { PlayerSave } from '@block-sz/schema';
import type { GameplaySnapshot } from '../domain/gameplay';

export interface SaveExtras {
  playerId: string;
  sceneId: string;
  name: string;
  /** 玩家位置（引擎每帧持有） */
  pos: { x: number; y: number; z: number };
  facing: number;
  ascensionStage: string;
}

/** 序列化：玩法快照 + 玩家态 → PlayerSave */
export function snapshotToSave(snap: GameplaySnapshot, extras: SaveExtras): PlayerSave {
  return {
    playerId: extras.playerId,
    sceneId: extras.sceneId,
    name: extras.name,
    createdAt: extras.name ? new Date().toISOString() : '',   // 由调用方覆盖真实 createdAt
    updatedAt: new Date().toISOString(),
    money: snap.money,
    pos: extras.pos,
    facing: extras.facing,
    visited: snap.visited,
    photos: snap.photos,
    questProgress: snap.questProgress,
    inventory: snap.inventory,
    ascensionPoints: snap.ascensionPoints,
    unlockedTeleports: snap.unlockedTeleports,
    placements: snap.placements,
    ascensionStage: extras.ascensionStage,
    shopBought: snap.shopBought,
    cameraSkins: snap.cameraSkins,
    cameraSkin: snap.cameraSkin,
    investments: snap.investments,
    investSettledAt: snap.investSettledAt,
    activeEffects: snap.activeEffects,
    dailyCounters: snap.dailyCounters,
    dailyStamp: snap.dailyStamp,
    souvenirs: snap.souvenirs,
  } as PlayerSave;
}

/** 回档：PlayerSave → Gameplay 初始快照（null 安全，字段缺失取默认） */
export function saveToInit(saved: any): Partial<GameplaySnapshot> {
  if (!saved) return {};
  return {
    money: saved.money,
    visited: saved.visited ?? [],
    photos: saved.photos ?? [],
    questProgress: saved.questProgress ?? {},
    inventory: saved.inventory ?? {},
    ascensionPoints: saved.ascensionPoints ?? 0,
    unlockedTeleports: saved.unlockedTeleports ?? [],
    placements: saved.placements ?? [],
    shopBought: saved.shopBought ?? {},
    cameraSkins: saved.cameraSkins ?? [],
    cameraSkin: saved.cameraSkin ?? '',
    investments: saved.investments ?? {},
    investSettledAt: saved.investSettledAt ?? '',
    activeEffects: saved.activeEffects ?? {},
    dailyCounters: saved.dailyCounters ?? {},
    dailyStamp: saved.dailyStamp ?? '',
    souvenirs: saved.souvenirs ?? [],
  };
}
