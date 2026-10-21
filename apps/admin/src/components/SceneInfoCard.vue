<script setup lang="ts">
// 场景信息卡（从 App.vue 壳内拆出）
import { inject } from 'vue';
import { ADMIN_CTX } from '../context';

const { doc } = inject(ADMIN_CTX)!;
</script>

<template>
  <section v-if="doc.scene.value" class="card">
    <h2>场景信息</h2>
    <div class="form-grid">
      <label>名称 <input v-model="doc.scene.value.name" @input="doc.touch" /></label>
      <label>版本 <input v-model="doc.scene.value.version" @input="doc.touch" /></label>
      <label class="wide">描述 <input v-model="doc.scene.value.desc" @input="doc.touch" /></label>
    </div>
    <h3>投影参数</h3>
    <div class="form-grid">
      <label>原点纬度 <input type="number" step="0.0001" v-model.number="doc.scene.value.projection.origin.lat" @input="doc.touch" /></label>
      <label>原点经度 <input type="number" step="0.0001" v-model.number="doc.scene.value.projection.origin.lng" @input="doc.touch" /></label>
      <label>单位/公里 <input type="number" v-model.number="doc.scene.value.projection.unitPerKm" @input="doc.touch" /></label>
      <label>远距压缩 <input type="number" step="0.05" v-model.number="doc.scene.value.projection.farCompress" @input="doc.touch" /></label>
    </div>
    <p class="tip">元素 {{ doc.scene.value.elements.length }} 个 · 建造配方 {{ doc.scene.value.buildRecipes.length }} 条 · NPC {{ doc.scene.value.npcs.length }} 个
      <span v-if="doc.scene.value.traffic">· 交通 {{ doc.scene.value.traffic.routes.length }} 线 {{ doc.scene.value.traffic.stations.length }} 站</span>
      · 商店 {{ doc.scene.value.shopItems.length }} 件
      <span v-if="doc.scene.value.ascension">· 飞升 {{ doc.scene.value.ascension.stages.length }} 阶</span>
      （元素/NPC/交通/商店/飞升均可用对应页签可视化编辑）</p>
  </section>
</template>
