<script setup lang="ts">
// 出生点选择视图
import type { Scene } from '@block-sz/schema';
import { proj } from '@block-sz/shared';
import { iconSvg } from '../engine/icons';

defineProps<{
  scene: Scene;
  spawnId: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'back'): void;
  (e: 'start'): void;
}>();

const DISTRICT_NAMES: Record<string, string> = {
  futian: '福田区', luohu: '罗湖区', nanshan: '南山区', yantian: '盐田区',
  baoan: '宝安区', longgang: '龙岗区', longhua: '龙华区', pingshan: '坪山区', dapeng: '大鹏新区',
};

function ic(name: any, size = 16) { return iconSvg(name, size); }

function xy(lat: number, lng: number) {
  const p = proj(lat, lng);
  return `(${Math.round(p.x)}, ${Math.round(p.z)})`;
}
</script>

<template>
  <div class="shell">
    <header>
      <button class="back" @click="emit('back')">← 返回档案</button>
      <h1>选择出生点</h1>
      <p class="sub">选择你的深圳起点，进入方块鹏城 3D 世界（进度自动云存档）</p>
    </header>
    <div class="grid">
      <div
        v-for="s in scene.spawnPoints" :key="s.id"
        class="card spawn-card" :class="{ selected: spawnId === s.id }"
        @click="emit('select', s.id)"
      >
        <b>{{ s.name }}</b>
        <span class="muted">{{ DISTRICT_NAMES[s.district] || s.district }} · {{ s.blurb }}</span>
        <span class="muted">{{ xy(s.latlng.lat, s.latlng.lng) }}</span>
      </div>
    </div>
    <div class="spawn-actions">
      <button class="primary" :disabled="!spawnId" @click="emit('start')">
        <span class="icon" v-html="ic('gamepad')" /> 进入世界
      </button>
    </div>
  </div>
</template>
