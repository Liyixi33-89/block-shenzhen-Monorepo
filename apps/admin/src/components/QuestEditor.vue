<script setup lang="ts">
// 任务编辑页签：条件类型动态表单（DOM 类名契约：.item-list/.form-pane）
import { ref, computed, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import type { Quest } from '@block-sz/schema';

const { doc } = inject(ADMIN_CTX)!;
const scene = doc.scene;
const touch = doc.touch;

const selQuestId = ref('');
const selQuest = computed<Quest | null>(() =>
  scene.value?.quests.find(q => q.id === selQuestId.value) ?? null);

const COND_TYPES = ['visit', 'photo', 'walk', 'ride', 'districts', 'money', 'collect', 'interact'] as const;
const COND_LABELS: Record<string, string> = {
  visit: '到访地标', photo: '拍摄地标', walk: '步行距离', ride: '乘交通工具',
  districts: '探索区数', money: '持有金钱', collect: '收集物品', interact: '完成交互',
};

function addQuest() {
  if (!scene.value) return;
  const id = 'quest_' + Date.now().toString(36);
  scene.value.quests.push({
    id, title: '新任务', desc: '', requires: [],
    cond: { type: 'visit', target: scene.value.landmarks[0]?.id ?? '' } as any,
    reward: { money: 50, items: [], ascension: 0 },
    cycle: 'once', enabled: true,
  } as Quest);
  selQuestId.value = id;
  touch();
}
function delQuest() {
  if (!scene.value || !selQuest.value) return;
  if (!confirm(`删除任务「${selQuest.value.title}」？`)) return;
  scene.value.quests = scene.value.quests.filter(q => q.id !== selQuestId.value);
  selQuestId.value = '';
  touch();
}

/** 切换条件类型时重建 cond 对象（保留 type） */
function onCondTypeChange(e: Event) {
  if (!selQuest.value) return;
  const t = (e.target as HTMLSelectElement).value;
  const old = selQuest.value.cond as any;
  const fresh: any = { type: t };
  if (t === 'visit' || t === 'photo' || t === 'interact') fresh.target = old.target ?? '';
  if (t === 'walk') fresh.meters = old.meters ?? 500;
  if (t === 'districts') fresh.n = old.n ?? 3;
  if (t === 'money') fresh.amount = old.amount ?? 1000;
  if (t === 'collect') { fresh.item = old.item ?? ''; fresh.n = old.n ?? 1; }
  if (t === 'ride') fresh.vehicle = old.vehicle ?? 'metro';
  selQuest.value.cond = fresh;
  touch();
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>任务（{{ scene?.quests.length }}）</h2>
      <button class="primary" @click="addQuest">+ 新增</button>
    </div>
    <div class="editor-body">
      <ul class="item-list">
        <li v-for="q in scene?.quests ?? []" :key="q.id" :class="{ sel: q.id === selQuestId }" @click="selQuestId = q.id">
          <b>{{ q.title }}</b>
          <span class="muted">{{ q.cond.type }}</span>
          <span v-if="q.cycle === 'daily'" class="daily">每日</span>
          <span v-if="!q.enabled" class="off">停用</span>
        </li>
      </ul>
      <div v-if="selQuest && scene" class="form-pane">
        <div class="form-grid">
          <label>ID <input v-model="selQuest.id" @input="touch" /></label>
          <label>标题 <input v-model="selQuest.title" @input="touch" /></label>
          <label class="wide">描述 <input v-model="selQuest.desc" @input="touch" /></label>
          <label>条件类型
            <select :value="(selQuest.cond as any).type" @change="onCondTypeChange">
              <option v-for="t in COND_TYPES" :key="t" :value="t">{{ COND_LABELS[t] }}</option>
            </select>
          </label>
          <!-- 按条件类型动态渲染参数 -->
          <label v-if="['visit','photo','interact'].includes((selQuest.cond as any).type)">目标
            <select v-if="(selQuest.cond as any).type !== 'interact'" v-model="(selQuest.cond as any).target" @change="touch">
              <option v-for="l in scene.landmarks" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
            <input v-else v-model="(selQuest.cond as any).target" @input="touch" />
          </label>
          <label v-if="(selQuest.cond as any).type === 'walk'">米数 <input type="number" v-model.number="(selQuest.cond as any).meters" @input="touch" /></label>
          <label v-if="(selQuest.cond as any).type === 'districts'">区数 <input type="number" v-model.number="(selQuest.cond as any).n" @input="touch" /></label>
          <label v-if="(selQuest.cond as any).type === 'money'">金额 <input type="number" v-model.number="(selQuest.cond as any).amount" @input="touch" /></label>
          <label v-if="(selQuest.cond as any).type === 'collect'">物品 <input v-model="(selQuest.cond as any).item" @input="touch" /></label>
          <label v-if="(selQuest.cond as any).type === 'collect'">数量 <input type="number" v-model.number="(selQuest.cond as any).n" @input="touch" /></label>
          <label v-if="(selQuest.cond as any).type === 'ride'">交通工具
            <select v-model="(selQuest.cond as any).vehicle" @change="touch">
              <option value="metro">地铁</option><option value="bus">巴士</option>
              <option value="boat">游船</option><option value="cable">索道</option>
            </select>
          </label>
          <label>奖励 ¥ <input type="number" v-model.number="selQuest.reward.money" @input="touch" /></label>
          <label>飞升点 <input type="number" v-model.number="selQuest.reward.ascension" @input="touch" /></label>
          <label>周期
            <select v-model="selQuest.cycle" @change="touch">
              <option value="once">单次</option><option value="daily">每日</option>
            </select>
          </label>
          <label class="checks">
            <span><input type="checkbox" v-model="selQuest.enabled" @change="touch" /> 启用</span>
          </label>
        </div>
        <div class="danger-zone"><button class="danger" @click="delQuest">删除此任务</button></div>
      </div>
    </div>
  </section>
</template>
