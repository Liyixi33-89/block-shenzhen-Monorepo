<script setup lang="ts">
// 场景档案浏览器：区划/地标/交通/任务四页签
import { ref, computed } from 'vue';
import type { Scene, Landmark, Route } from '@block-sz/schema';
import { proj } from '@block-sz/shared';
import { iconSvg } from '../engine/icons';

const props = defineProps<{
  scene: Scene;
  serverOk: boolean | null;
}>();

const emit = defineEmits<{ (e: 'enter'): void }>();

const tab = ref<'overview' | 'landmarks' | 'traffic' | 'quests'>('overview');

const DISTRICT_NAMES: Record<string, string> = {
  futian: '福田区', luohu: '罗湖区', nanshan: '南山区', yantian: '盐田区',
  baoan: '宝安区', longgang: '龙岗区', longhua: '龙华区', pingshan: '坪山区', dapeng: '大鹏新区',
};

const KIND_NAMES: Record<string, string> = {
  metro: '地铁', bus: '巴士', boat: '游船', cable: '索道', elevator: '电梯',
};

function ic(name: any, size = 16) { return iconSvg(name, size); }

function xy(lat: number, lng: number) {
  const p = proj(lat, lng);
  return `(${Math.round(p.x)}, ${Math.round(p.z)})`;
}

const landmarksByDistrict = computed(() => {
  const map = new Map<string, Landmark[]>();
  for (const l of props.scene.landmarks) {
    if (!map.has(l.district)) map.set(l.district, []);
    map.get(l.district)!.push(l);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
});

const routesByKind = computed(() => {
  if (!props.scene.traffic) return {} as Record<string, Route[]>;
  const g: Record<string, Route[]> = {};
  for (const r of props.scene.traffic.routes) {
    (g[r.kind] ||= []).push(r);
  }
  return g;
});
</script>

<template>
  <div class="shell">
    <header>
      <h1>方块鹏城 <span class="en">BLOCK SHENZHEN</span></h1>
      <p class="sub">
        <span :class="serverOk === true ? 'ok' : 'bad'">后端 {{ serverOk === null ? '…' : serverOk ? '在线' : '离线' }}</span>
        <span class="ok">场景 {{ scene.name }} v{{ scene.version }}</span>
      </p>
      <button class="primary enter-btn" @click="emit('enter')">
        <span class="icon" v-html="ic('gamepad')" /> 进入世界
      </button>
    </header>

    <nav class="tabs">
      <button :class="{ active: tab === 'overview' }" @click="tab = 'overview'">总览</button>
      <button :class="{ active: tab === 'landmarks' }" @click="tab = 'landmarks'">地标 {{ scene.landmarks.length }}</button>
      <button :class="{ active: tab === 'traffic' }" @click="tab = 'traffic'">交通 {{ scene.traffic?.routes.length }}</button>
      <button :class="{ active: tab === 'quests' }" @click="tab = 'quests'">任务 {{ scene.quests.length }}</button>
    </nav>

    <section v-if="tab === 'overview'" class="cards">
      <h2>区划（{{ scene.districts.length }}）</h2>
      <div class="grid">
        <div v-for="d in scene.districts" :key="d.id" class="card" :style="{ borderColor: '#' + d.color.toString(16).padStart(6, '0') }">
          <b>{{ d.name }}</b>
          <span class="muted">{{ d.slogan }} · {{ d.density }}</span>
          <span class="muted">{{ d.center.lat.toFixed(4) }}, {{ d.center.lng.toFixed(4) }}</span>
        </div>
      </div>

      <h2>出生点（{{ scene.spawnPoints.length }}）</h2>
      <ul class="list">
        <li v-for="s in scene.spawnPoints" :key="s.id">
          <b>{{ s.name }}</b> · {{ DISTRICT_NAMES[s.district] || s.district }} · {{ s.blurb }} · {{ xy(s.latlng.lat, s.latlng.lng) }}
        </li>
      </ul>

      <h2>传送点（{{ scene.teleportPoints.length }}）</h2>
      <p class="muted">到访解锁 · 冷却 30s · ¥10（P5 引擎实现）</p>
      <div class="chips">
        <span v-for="t in scene.teleportPoints" :key="t.id" class="chip">{{ t.name }}</span>
      </div>
    </section>

    <section v-if="tab === 'landmarks'" class="cards">
      <h2>地标（{{ scene.landmarks.length }}）· 按区分组</h2>
      <div v-for="[did, lms] in landmarksByDistrict" :key="did" class="district-group">
        <h3>{{ DISTRICT_NAMES[did] || did }} <span class="muted">({{ lms.length }})</span></h3>
        <ul class="list">
          <li v-for="l in lms" :key="l.id">
            <b>{{ l.name }}</b>
            <span class="muted"> {{ xy(l.latlng.lat, l.latlng.lng) }}</span>
            <span v-if="l.builder" class="badge builder">{{ l.builder }}</span>
            <span v-for="t in l.tags.filter(t => t.startsWith('grade:'))" :key="t" class="badge" :class="t.slice(6)">{{ t.slice(6) }}</span>
            <p class="desc">{{ l.desc }}</p>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="tab === 'traffic' && scene.traffic" class="cards">
      <h2>交通网络 · {{ scene.traffic.stations.length }} 站 / {{ scene.traffic.routes.length }} 线路</h2>
      <div v-for="(routes, kind) in routesByKind" :key="kind" class="district-group">
        <h3>{{ KIND_NAMES[kind] || kind }} <span class="muted">({{ routes.length }})</span></h3>
        <ul class="list">
          <li v-for="r in routes" :key="r.id">
            <span class="line-dot" :style="{ background: '#' + r.color.toString(16).padStart(6, '0') }"></span>
            <b>{{ r.name }}</b>
            <span class="muted"> {{ r.stations.length }} 站 · ¥{{ r.fare }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="tab === 'quests'" class="cards">
      <h2>任务（{{ scene.quests.length }}）</h2>
      <h3>主线/区任务 <span class="muted">({{ scene.quests.filter(q => q.cycle === 'once').length }})</span></h3>
      <ul class="list">
        <li v-for="q in scene.quests.filter(q => q.cycle === 'once')" :key="q.id">
          <b>{{ q.title }}</b>
          <span class="badge cond">{{ q.cond.type }}</span>
          <span class="muted"> 奖励 ¥{{ q.reward.money }}</span>
          <p class="desc">{{ q.desc }}</p>
        </li>
      </ul>
      <h3>每日任务 <span class="muted">({{ scene.quests.filter(q => q.cycle === 'daily').length }})</span></h3>
      <div class="chips">
        <span v-for="q in scene.quests.filter(q => q.cycle === 'daily')" :key="q.id" class="chip">
          {{ q.title }} · ¥{{ q.reward.money }}
        </span>
      </div>
    </section>
  </div>
</template>
