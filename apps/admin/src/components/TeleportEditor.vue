<script setup lang="ts">
// 传送点编辑页签（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import MapPicker from '../MapPicker.vue';
import type { TeleportPoint } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selTpId = ref('');
const selTp = computed<TeleportPoint | null>(() =>
  scene.value?.teleportPoints.find(t => t.id === selTpId.value) ?? null);

function addTp() {
  if (!scene.value) return;
  const id = 'tp_' + Date.now().toString(36);
  scene.value.teleportPoints.push({
    id, name: '新传送点', latlng: { lat: 22.5431, lng: 114.0579 },
    unlock: { type: 'free' }, cooldownSec: 20, cost: 10, enabled: true,
  } as TeleportPoint);
  selTpId.value = id;
  touch();
}
function delTp() {
  if (!scene.value || !selTp.value) return;
  if (!confirm(`删除传送点「${selTp.value.name}」？`)) return;
  scene.value.teleportPoints = scene.value.teleportPoints.filter(t => t.id !== selTpId.value);
  selTpId.value = '';
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>传送点（{{ scene?.teleportPoints.length }}）</h2>
      <button class="primary" @click="addTp">+ 新增</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="t in scene?.teleportPoints ?? []" :key="t.id" :class="{ sel: t.id === selTpId }" @click="selTpId = t.id">
          <b>{{ t.name }}</b>
          <span class="muted">¥{{ t.cost }}</span>
          <span v-if="!t.enabled" class="off">停用</span>
        </li>
      </ul>
      <div v-if="selTp && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selTp.id" @input="touch" /></label>
          <label>名称 <input v-model="selTp.name" @input="touch" /></label>
          <label>解锁方式
            <select v-model="(selTp.unlock as any).type" @change="touch">
              <option value="free">无条件</option>
              <option value="visited">到访地标</option>
              <option value="quest">完成任务</option>
            </select>
          </label>
          <label v-if="(selTp.unlock as any).type === 'visited'">到访地标
            <select v-model="(selTp.unlock as any).landmark" @change="touch">
              <option v-for="l in scene.landmarks" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
          </label>
          <label v-if="(selTp.unlock as any).type === 'quest'">完成任务
            <select v-model="(selTp.unlock as any).quest" @change="touch">
              <option v-for="q in scene.quests" :key="q.id" :value="q.id">{{ q.title }}</option>
            </select>
          </label>
          <label>费用 ¥ <input type="number" v-model.number="selTp.cost" @input="touch" /></label>
          <label class="checks"><span><input type="checkbox" v-model="selTp.enabled" @change="touch" /> 启用</span></label>
        </div>
        <h4>坐标拾取</h4>
        <MapPicker :scene="scene" v-model="selTp.latlng" @update:model-value="touch" />
        <div class="danger-zone"><button class="danger" @click="delTp">删除此传送点</button></div>
      </div>
    </div>
  </section>
</template>
