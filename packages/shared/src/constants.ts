// 共享常量：区主题色、材质清单、引擎单位约定
export const KM_IN_UNITS = 200;          // 1 公里 = 200 世界单位
export const PLAYER_WALK_SPEED = 4.2;    // 步行速度（单位/帧秒基数，引擎侧换算）

/** 深圳 9 区主题色（与现版 game.js 一致） */
export const DISTRICT_COLORS: Record<string, number> = {
  futian: 0x1fb9a8,      // 福田 青碧
  luohu: 0xd96f32,       // 罗湖
  nanshan: 0x3a7bd5,     // 南山
  yantian: 0x2fa84f,     // 盐田
  baoan: 0xc94f7c,       // 宝安
  longgang: 0x8b5cf6,    // 龙岗
  longhua: 0xf59e0b,     // 龙华
  pingshan: 0x10b981,    // 坪山
  dapeng: 0x06b6d4,      // 大鹏
};

export const DISTRICT_NAMES: Record<string, string> = {
  futian: '福田区', luohu: '罗湖区', nanshan: '南山区', yantian: '盐田区',
  baoan: '宝安区', longgang: '龙岗区', longhua: '龙华区', pingshan: '坪山区', dapeng: '大鹏新区',
};
