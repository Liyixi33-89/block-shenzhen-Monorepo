<script setup lang="ts">
// 游戏内 HUD + 事件 toast + 任务/图鉴/键位面板
// DOM 类名是 e2e 契约：.hud/.toasts/.panel/.toast 等（p0/p1/p2 脚本依赖）
import type { Scene } from '@block-sz/schema';
import type { GameEngine } from '../engine/engine';
import type { IconName } from '../engine/icons';

const props = defineProps<{
  engRef: GameEngine | null;
  hud: { district: string; landmark: string; money: number; photoMode: boolean; version: string };
  toasts: Array<{ id: number; text: string; kind: string; icon: IconName }>;
  quests: any[];
  album: Array<{ id: string; name: string }>;
  scene: Scene | null;
  questPanel: boolean;
  albumPanel: boolean;
  keysPanel: boolean;
  charPanel: boolean;
  mapPanel: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', panel: 'quest' | 'album' | 'keys' | 'char' | 'map'): void;
  (e: 'exit'): void;
}>();

function ic(name: IconName, size = 16) {
  // 与 composable 同源的 iconSvg（此处直接引入避免 prop 传函数）
  return iconSvg(name, size);
}
import { iconSvg } from '../engine/icons';
import CharacterPanel from './CharacterPanel.vue';
import MapPanel from './MapPanel.vue';
import Minimap from './Minimap.vue';

const photoCount = () => props.album.length;
const questDoneCount = () => props.quests.filter(q => q.done).length;

/** 键位图鉴数据（触屏设备替换为触屏操作） */
const isTouch = typeof window !== 'undefined'
  && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
const KEYMAP: Array<{ key: string; desc: string }> = isTouch ? [
  { key: '左下摇杆', desc: '移动' },
  { key: '右侧拖拽', desc: '转动视角' },
  { key: '双指捏合', desc: '缩放视角' },
  { key: '相机按钮', desc: '举起 / 收起相机' },
  { key: '快门按钮', desc: '拍照（相机模式下）' },
  { key: 'E 按钮', desc: '乘车 / 对话' },
  { key: '建造按钮', desc: '建造模式' },
  { key: '传送按钮', desc: '快速传送' },
  { key: '任务按钮', desc: '任务面板' },
] : [
  { key: 'W A S D', desc: '移动' },
  { key: 'Shift', desc: '疾跑' },
  { key: '拖拽', desc: '转动视角' },
  { key: '滚轮', desc: '缩放视角' },
  { key: 'C', desc: '举起 / 收起相机' },
  { key: '空格', desc: '快门（相机模式下）' },
  { key: 'E', desc: '站内乘车' },
  { key: 'B', desc: '建造模式' },
  { key: 'T', desc: '快速传送' },
  { key: 'Q', desc: '任务面板' },
  { key: 'P', desc: '拍摄图鉴' },
  { key: 'K', desc: '键位说明' },
  { key: 'Esc', desc: '关闭面板' },
];
</script>

<template>
  <!-- HUD -->
  <div class="hud" v-if="!loading">
    <div class="hud-box hud-tl">
      <b class="hud-loc"><span class="icon" v-html="ic('location')" /> {{ hud.district || '…' }}</b>
      <span class="hud-money"><span class="icon" v-html="ic('money')" /> ¥{{ hud.money.toLocaleString() }}</span>
      <span v-if="engRef?.state.grayCohort" class="hud-gray">体验版 v{{ hud.version }}</span>
    </div>
    <div class="hud-box hud-tc">
      <span class="hud-clock"><span class="icon" v-html="ic('clock', 13)" /> {{ engRef?.state.clock }}</span>
      <span class="hud-weather" :class="engRef?.state.weather === '雪' ? 'cold' : ''">
        <span class="icon" v-html="ic(engRef?.state.weather === '雨' ? 'rain' : engRef?.state.weather === '雪' ? 'snow' : 'sun', 13)" /> {{ engRef?.state.weather }}
      </span>
      <span v-if="engRef?.state.night" class="hud-night">夜</span>
    </div>
    <div v-if="hud.landmark" class="hud-box hud-landmark">
      <span class="icon" v-html="ic('visit')" /> {{ hud.landmark }} <span class="muted">（已到访 · <kbd>C</kbd> 拍照）</span>
    </div>
    <Minimap :eng-ref="engRef" :visible="true" />
    <div class="hud-box hud-br">
      <button class="hud-mini" @click="emit('toggle', 'quest')">
        <span class="icon" v-html="ic('quest')" /> 任务 <kbd>Q</kbd>
      </button>
      <button class="hud-mini" @click="emit('toggle', 'album')">
        <span class="icon" v-html="ic('photo')" /> 图鉴 <kbd>P</kbd>
      </button>
      <button class="hud-mini" @click="emit('toggle', 'keys')">
        <span class="icon" v-html="ic('keys')" /> 键位 <kbd>K</kbd>
      </button>
      <button class="hud-mini" @click="emit('toggle', 'char')">
        <span class="icon" v-html="ic('char')" /> 角色 <kbd>X</kbd>
      </button>
      <button class="hud-mini" @click="emit('toggle', 'map')">
        <span class="icon" v-html="ic('map')" /> 地图 <kbd>M</kbd>
      </button>
      <button class="hud-exit" @click="emit('exit')">
        <span class="icon" v-html="ic('exit')" /> 退出世界
      </button>
    </div>
    <div v-if="hud.photoMode" class="hud-photo-badge">
      <span class="icon" v-html="ic('camera')" /> 相机模式
    </div>
    <div class="hud-tip">C 相机 · B 建造 · T 传送 · E 乘车 · <b>X</b> 角色 · <b>M</b> 地图 · <b>K</b> 键位说明</div>
  </div>

  <!-- 事件 toast -->
  <div class="toasts">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
      <span class="icon" v-html="ic(t.icon)" /> {{ t.text }}
    </div>
  </div>

  <!-- 任务面板 -->
  <div v-if="questPanel" class="panel panel-quests">
    <div class="panel-head">
      <b><span class="icon" v-html="ic('quest')" /> 任务（{{ questDoneCount() }}/{{ quests.length }} 完成）</b>
      <button class="panel-close" @click="emit('toggle', 'quest')">×</button>
    </div>
    <div class="panel-body">
      <div v-for="q in quests" :key="q.id" class="quest-row" :class="{ done: q.done, locked: q.unlocked === false && !q.done }">
          <span class="q-title">
            <span class="q-cycle">{{ q.cycle === 'daily' ? '日' : '主' }}</span>
            {{ q.unlocked === false ? '🔒 ' + q.title : q.title }}
          </span>
        <span v-if="q.done" class="q-badge done"><span class="icon" v-html="ic('check', 12)" /> 完成</span>
        <span v-else-if="q.unlocked === false" class="q-badge prog">前置未完成</span>
        <span v-else class="q-badge prog">{{ q.cur }}/{{ q.target }}</span>
        <span class="q-reward">¥{{ q.reward.money }}</span>
      </div>
    </div>
  </div>

  <!-- 相册 -->
  <div v-if="albumPanel" class="panel panel-album">
    <div class="panel-head">
      <b><span class="icon" v-html="ic('photo')" /> 拍摄图鉴（{{ photoCount() }}/{{ scene?.landmarks.length ?? 25 }}）</b>
      <button class="panel-close" @click="emit('toggle', 'album')">×</button>
    </div>
    <div class="panel-body">
      <div class="album-grid">
        <div v-for="l in scene?.landmarks ?? []" :key="l.id"
             class="album-cell" :class="{ got: album.some(a => a.id === l.id) }">
          <span class="cell-icon"><span class="icon" v-html="ic(album.some(a => a.id === l.id) ? 'photo' : 'lock', 22)" /></span>
          <span class="cell-name">{{ l.name }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 键位说明 -->
  <div v-if="keysPanel" class="panel panel-keys">
    <div class="panel-head">
      <b><span class="icon" v-html="ic('keys')" /> 键位说明</b>
      <button class="panel-close" @click="emit('toggle', 'keys')">×</button>
    </div>
    <div class="panel-body">
      <div class="keys-grid">
        <div v-for="k in KEYMAP" :key="k.key" class="key-row">
          <kbd>{{ k.key }}</kbd>
          <span class="key-desc">{{ k.desc }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 角色定制 -->
  <CharacterPanel :eng-ref="engRef" :visible="charPanel" @close="emit('toggle', 'char')" />

  <!-- 全城地图 -->
  <MapPanel :eng-ref="engRef" :visible="mapPanel" @close="emit('toggle', 'map')" />
</template>
