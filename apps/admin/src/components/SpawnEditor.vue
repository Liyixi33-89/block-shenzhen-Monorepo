<script setup lang="ts">
// 出生点编辑页签（DOM 类名契约：.item-list/.form-pane/.map-picker）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { SpawnPoint } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selSpawnId = ref('');
const selSpawn = computed<SpawnPoint | null>(() =>
  scene.value?.spawnPoints.find(s => s.id === selSpawnId.value) ?? null);

function addSpawn() {
  if (!scene.value) return;
  const id = 'spawn_' + Date.now().toString(36);
  scene.value.spawnPoints.push({
    id, name: '新出生点', district: scene.value.districts[0]?.id ?? 'futian',
    blurb: '', latlng: { lat: 22.5431, lng: 114.0579 }, facing: 0,
  } as SpawnPoint);
  selSpawnId.value = id;
  touch();
}
function delSpawn() {
  if (!scene.value || !selSpawn.value) return;
  if (!confirm(`删除出生点「${selSpawn.value.name}」？`)) return;
  scene.value.spawnPoints = scene.value.spawnPoints.filter(s => s.id !== selSpawnId.value);
  selSpawnId.value = '';
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>出生点（{{ scene?.spawnPoints.length }}）</h2>
      <button class="primary" @click="addSpawn">+ 新增</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="s in scene?.spawnPoints ?? []" :key="s.id" :class="{ sel: s.id === selSpawnId }" @click="selSpawnId = s.id">
          <b>{{ s.name }}</b> <span class="muted">{{ s.district }}</span>
        </li>
      </ul>
      <div v-if="selSpawn && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selSpawn.id" @input="touch" /></label>
          <label>名称 <input v-model="selSpawn.name" @input="touch" /></label>
          <label>所属区
            <select v-model="selSpawn.district" @change="touch">
              <option v-for="d in scene.districts" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </label>
          <label>简介 <input v-model="selSpawn.blurb" @input="touch" /></label>
          <label>朝向（弧度） <input type="number" step="0.1" v-model.number="selSpawn.facing" @input="touch" /></label>
        </div>
        <h4>坐标拾取</h4>
        <MapPicker :scene="scene" v-model="selSpawn.latlng" @update:model-value="touch" />
        <div class="danger-zone"><button class="danger" @click="delSpawn">删除此出生点</button></div>
      </div>
    </div>
  </section>
</template>
