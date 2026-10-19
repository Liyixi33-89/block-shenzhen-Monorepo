<script setup lang="ts">
// JSON 高级编辑页签：完整场景 JSON 双向同步
// 切入时从场景重新生成（由父组件 watch tab 时调用 refresh）
import { ref, inject, defineExpose } from 'vue';
import { ADMIN_CTX } from '../context';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;

const sceneJson = ref('');
const jsonMsg = ref('');

/** 父组件切入页签时调用：同步当前场景为文本 */
function refresh() {
  if (scene.value) {
    sceneJson.value = JSON.stringify(scene.value, null, 2);
    jsonMsg.value = '';
  }
}
defineExpose({ refresh });

function applyJson() {
  doc.issues.value = [];
  try {
    const parsed = JSON.parse(sceneJson.value);
    if (parsed.id !== 'shenzhen-main') throw new Error('scene.id 必须是 shenzhen-main');
    scene.value = parsed;
    doc.touch();
    doc.draftSaved.value = 'JSON 已应用（记得保存草稿）';
  } catch (e: any) {
    doc.issues.value = ['JSON 错误: ' + e.message];
  }
}

function regenerate() {
  sceneJson.value = JSON.stringify(scene.value, null, 2);
  jsonMsg.value = '';
}
</script>

<template>
  <section class="card">
    <h2>JSON 高级编辑</h2>
    <p class="tip">直接编辑完整场景 JSON（元素/NPC/交通/建造配方只在此处编辑）。点击「应用 JSON」写回结构化数据。</p>
    <textarea v-model="sceneJson" rows="20" spellcheck="false"></textarea>
    <div class="btns">
      <button class="primary" @click="applyJson">应用 JSON</button>
      <button @click="regenerate">重新生成</button>
    </div>
  </section>
</template>
