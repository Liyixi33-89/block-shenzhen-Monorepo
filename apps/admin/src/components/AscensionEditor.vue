<script setup lang="ts">
// 飞升编辑页签：阶段树 + 能力解锁（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import type { AscensionStage } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const UNLOCKS = ['build', 'teleport', 'fly'];
const UNLOCK_LABELS: Record<string, string> = {
  build: '建造', teleport: '传送', fly: '飞行',
};

const selStageId = ref('');
const selStage = computed<AscensionStage | null>(() =>
  scene.value?.ascension?.stages.find(s => s.id === selStageId.value) ?? null);

function addStage() {
  if (!scene.value) return;
  if (!scene.value.ascension) scene.value.ascension = { stages: [] };
  const id = 'st_' + Date.now().toString(36);
  scene.value.ascension.stages.push({ id, name: '新阶段', desc: '', points: 0, unlocks: [], requires: [] });
  selStageId.value = id;
  touch();
}
function delStage() {
  if (!scene.value?.ascension || !selStage.value) return;
  if (!confirm(`删除阶段「${selStage.value.name}」？`)) return;
  scene.value.ascension.stages = scene.value.ascension.stages.filter(s => s.id !== selStageId.value);
  selStageId.value = '';
  touch();
}
function toggleUnlock(u: string) {
  if (!selStage.value) return;
  const i = selStage.value.unlocks.indexOf(u as any);
  if (i >= 0) selStage.value.unlocks.splice(i, 1);
  else selStage.value.unlocks.push(u as any);
  touch();
}
function addRequire() {
  if (!selStage.value) return;
  selStage.value.requires.push('');
  touch();
}
function delRequire(i: number) {
  if (!selStage.value) return;
  selStage.value.requires.splice(i, 1);
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>飞升阶段（{{ scene?.ascension?.stages.length ?? 0 }}）</h2>
      <button class="primary" @click="addStage">+ 新增阶段</button>
    </div>
    <p class="tip">飞升点通过拍照/任务累计，达到阶段 points 即进阶并解锁能力。</p>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="s in scene?.ascension?.stages ?? []" :key="s.id" :class="{ sel: s.id === selStageId }" @click="selStageId = s.id">
          <b>{{ s.name }}</b>
          <span class="muted">{{ s.points }}点 · {{ s.unlocks.length }}能力</span>
        </li>
      </ul>
      <div v-if="selStage && scene?.ascension" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selStage.id" @input="touch" /></label>
          <label>名称 <input v-model="selStage.name" @input="touch" /></label>
          <label>所需飞升点 <input type="number" min="0" v-model.number="selStage.points" @input="touch" /></label>
          <label class="wide">描述 <input v-model="selStage.desc" @input="touch" /></label>
        </div>
        <h4>解锁能力</h4>
        <div class="form-grid checks">
          <span v-for="u in UNLOCKS" :key="u">
            <input type="checkbox" :checked="selStage.unlocks.includes(u as any)" @change="toggleUnlock(u)" /> {{ UNLOCK_LABELS[u] }}
          </span>
        </div>
        <h4>前置阶段（requires）</h4>
        <div v-for="(rq, i) in selStage.requires" :key="i" class="form-grid">
          <label>前置阶段ID <input v-model="selStage.requires[i]" @input="touch" /></label>
          <button class="danger" @click="delRequire(i)">删</button>
        </div>
        <button @click="addRequire">+ 添加前置</button>
        <div class="danger-zone"><button class="danger" @click="delStage">删除此阶段</button></div>
      </div>
      <p v-else class="tip">← 从列表选择一个阶段进行编辑（或先「+ 新增阶段」）</p>
    </div>
  </section>
</template>