<script setup lang="ts">
// 地标编辑页签：列表选择 + 表单编辑 + 地图拾点（DOM 类名是 e2e 契约：.item-list/.form-pane）
import { ref, computed } from 'vue';
import { inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { Landmark } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selLandmarkId = ref('');

const selLandmark = computed<Landmark | null>(() =>
  scene.value?.landmarks.find(l => l.id === selLandmarkId.value) ?? null);

function addLandmark() {
  if (!scene.value) return;
  const id = 'lm_' + Date.now().toString(36);
  scene.value.landmarks.push({
    id, name: '新地标', district: scene.value.districts[0]?.id ?? 'futian',
    latlng: { lat: 22.5431, lng: 114.0579 }, interactRadius: 30,
    desc: '', geometry: [], interacts: [], crowds: [],
    photoable: true, tags: [], enabled: true,
  } as Landmark);
  selLandmarkId.value = id;
  touch();
}

function delLandmark() {
  if (!scene.value || !selLandmark.value) return;
  if (!confirm(`删除地标「${selLandmark.value.name}」？`)) return;
  scene.value.landmarks = scene.value.landmarks.filter(l => l.id !== selLandmarkId.value);
  selLandmarkId.value = '';
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>地标（{{ scene?.landmarks.length }}）</h2>
      <button class="primary" @click="addLandmark">+ 新增地标</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="l in scene?.landmarks ?? []" :key="l.id"
            :class="{ sel: l.id === selLandmarkId }" @click="selLandmarkId = l.id">
          <b>{{ l.name }}</b>
          <span class="muted">{{ l.district }}</span>
          <span v-if="!l.enabled" class="off">已停用</span>
        </li>
      </ul>

      <div v-if="selLandmark && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selLandmark.id" @input="touch" /></label>
          <label>名称 <input v-model="selLandmark.name" @input="touch" /></label>
          <label>所属区
            <select v-model="selLandmark.district" @change="touch">
              <option v-for="d in scene.districts" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
          </label>
          <label>建模 builder <input v-model="selLandmark.builder" placeholder="如 pingan / 留空用 geometry" @input="touch" /></label>
          <label>纬度 <input type="number" step="0.0001" v-model.number="selLandmark.latlng.lat" @input="touch" /></label>
          <label>经度 <input type="number" step="0.0001" v-model.number="selLandmark.latlng.lng" @input="touch" /></label>
          <label>交互半径 <input type="number" v-model.number="selLandmark.interactRadius" @input="touch" /></label>
          <label class="checks">
            <span><input type="checkbox" v-model="selLandmark.photoable" @change="touch" /> 可拍照</span>
            <span><input type="checkbox" v-model="selLandmark.enabled" @change="touch" /> 启用</span>
          </label>
          <label class="wide">介绍 <input v-model="selLandmark.desc" @input="touch" /></label>
          <label class="wide">标签（逗号分隔） <input :value="selLandmark.tags.join(',')" @input="(selLandmark.tags = ($event.target as any).value.split(',').map((s: string) => s.trim()).filter(Boolean)), touch()" /></label>
        </div>

        <!-- 地图拾点 -->
        <h4>坐标拾取</h4>
        <MapPicker :scene="scene" v-model="selLandmark.latlng" @update:model-value="touch" />

        <div class="danger-zone">
          <button class="danger" @click="delLandmark">删除此地标</button>
        </div>
      </div>
      <p v-else class="tip">← 从列表选择一个地标进行编辑</p>
    </div>
  </section>
</template>
