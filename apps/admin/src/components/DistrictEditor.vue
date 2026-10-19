<script setup lang="ts">
// 区划编辑页签（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { District } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selDistrictId = ref('');
const selDistrict = computed<District | null>(() =>
  scene.value?.districts.find(d => d.id === selDistrictId.value) ?? null);

const DENSITY = ['cbd', 'urban', 'suburb', 'none'];
const DENSITY_LABELS: Record<string, string> = { cbd: 'CBD 高楼', urban: '城区', suburb: '郊野', none: '无' };

// 颜色辅助：int ↔ hex
function intToHex(n: number) { return '#' + n.toString(16).padStart(6, '0'); }
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>区划（{{ scene?.districts.length }}）</h2>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="d in scene?.districts ?? []" :key="d.id" :class="{ sel: d.id === selDistrictId }" @click="selDistrictId = d.id">
          <b>{{ d.name }}</b>
          <span class="muted">{{ d.density }}</span>
        </li>
      </ul>
      <div v-if="selDistrict && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selDistrict.id" @input="touch" /></label>
          <label>名称 <input v-model="selDistrict.name" @input="touch" /></label>
          <label>口号 <input v-model="selDistrict.slogan" @input="touch" /></label>
          <label>主题色 <input type="color" :value="intToHex(selDistrict.color)"
                 @input="selDistrict.color = parseInt(($event.target as any).value.slice(1), 16), touch()" /></label>
          <label>密度
            <select v-model="selDistrict.density" @change="touch">
              <option v-for="dd in DENSITY" :key="dd" :value="dd">{{ DENSITY_LABELS[dd] }}</option>
            </select>
          </label>
          <label>城市半径 <input type="number" v-model.number="selDistrict.cityRadius" @input="touch" /></label>
          <label>排序 <input type="number" v-model.number="selDistrict.sortOrder" @input="touch" /></label>
        </div>
        <h4>区中心拾取</h4>
        <MapPicker :scene="scene" v-model="selDistrict.center" @update:model-value="touch" />
      </div>
    </div>
  </section>
</template>
