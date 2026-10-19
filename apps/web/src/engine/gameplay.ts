// 【过渡桥】玩法引擎已迁至 ../domain/gameplay（洋葱分层重构）
// 保留此文件以兼容旧 import 路径与 e2e 调试面；全部迁移完成后可删除。
export * from '../domain/gameplay';
export type { GameplayEvent } from '../domain/events';
