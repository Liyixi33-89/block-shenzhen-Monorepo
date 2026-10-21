<script setup lang="ts">
// 数据分析页签：DAU / 漏斗 / 事件表（DOM 类名契约：.dau-bar/.funnel-step/.ana-table）
import { ref, computed } from 'vue';
import { adminFetch } from '../services/api';

const anaDays = ref(7);
const anaEvents = ref<any[]>([]);
const anaDau = ref<any[]>([]);
const anaFunnel = ref<any[]>([]);
const anaLoaded = ref(false);

async function loadAnalytics() {
  const days = anaDays.value;
  const [ov, dau, fn] = await Promise.all([
    adminFetch(`/api/analytics/admin/overview?days=${days}`).then(r => r.data),
    adminFetch(`/api/analytics/admin/dau?days=${days}`).then(r => r.data),
    adminFetch(`/api/analytics/admin/funnel?steps=session_start,visit,photo,quest_done`).then(r => r.data),
  ]);
  anaEvents.value = ov.events ?? [];
  anaDau.value = dau.dau ?? [];
  anaFunnel.value = fn.funnel ?? [];
  anaLoaded.value = true;
}

/** 首次切入页签时自动加载 */
void loadAnalytics();

const maxDau = computed(() => Math.max(1, ...anaDau.value.map((d: any) => d.n)));

/** 样例属性压缩显示 */
function sampleText(s: any): string {
  if (!s) return '';
  const p = s.props ?? {};
  return Object.entries(p).slice(0, 3).map(([k, v]) => `${k}=${String(v).slice(0, 24)}`).join(' ');
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>数据分析</h2>
      <div class="ana-controls">
        <select v-model.number="anaDays" @change="anaLoaded = false; loadAnalytics()">
          <option :value="1">近 1 天</option>
          <option :value="7">近 7 天</option>
          <option :value="14">近 14 天</option>
          <option :value="30">近 30 天</option>
        </select>
        <button @click="loadAnalytics">刷新</button>
      </div>
    </div>

    <!-- DAU 柱状 -->
    <h3>日活（有埋点的玩家）</h3>
    <div class="dau-chart">
      <div v-for="d in anaDau" :key="d.day" class="dau-bar" :title="`${d.day}: ${d.n}`">
        <div class="dau-fill" :style="{ height: (d.n / maxDau * 100) + '%' }"></div>
        <span class="dau-n">{{ d.n }}</span>
      </div>
    </div>

    <!-- 漏斗 -->
    <h3>核心漏斗（session_start → visit → photo → quest_done）</h3>
    <div class="funnel">
      <div v-for="f in anaFunnel" :key="f.name" class="funnel-step">
        <span class="f-name">{{ f.name }}</span>
        <div class="f-bar" :style="{ width: Math.max(4, f.rate * 100) + '%' }"></div>
        <span class="f-num">{{ f.players }} 人 · {{ (f.rate * 100).toFixed(0) }}%</span>
      </div>
    </div>

    <!-- 事件表 -->
    <h3>事件总览（{{ anaEvents.length }} 种）</h3>
    <table class="ana-table" v-if="anaEvents.length">
      <thead>
        <tr><th>事件</th><th>总量</th><th>玩家数</th><th>今日</th><th>最近样例</th></tr>
      </thead>
      <tbody>
        <tr v-for="ev in anaEvents" :key="ev.name">
          <td><code>{{ ev.name }}</code></td>
          <td>{{ ev.total }}</td>
          <td>{{ ev.players }}</td>
          <td>{{ ev.today }}</td>
          <td class="muted-cell">{{ sampleText(ev.samples[0]) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="tip">暂无数据——客户端每 10 秒批量上报，玩家操作后稍候刷新。</p>
  </section>
</template>
