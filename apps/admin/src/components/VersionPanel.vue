<script setup lang="ts">
// 版本管理页签：灰度滑杆 / 回滚锁定 / 版本 diff（DOM 契约：input[type=range]/.diff-controls select）
import { ref } from 'vue';
import { adminFetch } from '../services/api';

const rollout = ref<{ pinnedVersion: string; grayPercent: number }>({ pinnedVersion: '', grayPercent: 100 });
const rolloutVersions = ref<string[]>([]);
const rolloutLatest = ref('');
const grayPct = ref(100);
const pinTarget = ref('');
const diffData = ref<Array<{ path: string; type: string; detail: string }>>([]);
const diffFrom = ref('');
const diffTo = ref('');
const rolloutMsg = ref('');

async function loadRollout() {
  const { data: r } = await adminFetch('/api/content/admin/scenes/shenzhen-main/rollout');
  rollout.value = r.rollout;
  rolloutVersions.value = r.versions ?? [];
  rolloutLatest.value = r.latest ?? '';
  grayPct.value = r.rollout.grayPercent;
  pinTarget.value = r.rollout.pinnedVersion;
  if (rolloutVersions.value.length >= 2) {
    diffTo.value = rolloutLatest.value;
    diffFrom.value = rolloutVersions.value[rolloutVersions.value.length - 2];
  }
}

async function applyGray() {
  rolloutMsg.value = '';
  const { data: r } = await adminFetch('/api/content/admin/scenes/shenzhen-main/rollout/gray', {
    method: 'POST',
    body: { percent: grayPct.value },
  });
  rolloutMsg.value = r.ok ? `灰度已设为 ${grayPct.value}%` : `失败: ${r.error}`;
  await loadRollout();
}

async function applyPin() {
  if (pinTarget.value && !confirm(`全量回滚到 v${pinTarget.value}？所有玩家立即切换。`)) return;
  const { data: r } = await adminFetch('/api/content/admin/scenes/shenzhen-main/rollout/pin', {
    method: 'POST',
    body: { version: pinTarget.value },
  });
  rolloutMsg.value = r.ok
    ? (pinTarget.value ? `已回滚锁定 v${pinTarget.value}` : '已取消锁定，恢复最新版')
    : `失败: ${r.error}`;
  await loadRollout();
}

async function loadDiff() {
  diffData.value = [];
  if (!diffFrom.value || !diffTo.value || diffFrom.value === diffTo.value) return;
  const { data: r } = await adminFetch(`/api/content/admin/scenes/shenzhen-main/diff?from=${diffFrom.value}&to=${diffTo.value}`);
  diffData.value = r.diff ?? [];
}

/** 首次切入页签时自动加载 */
void loadRollout();
</script>

<template>
  <section class="card">
    <h2>版本 · 灰度 · 回滚</h2>
    <p class="tip">最新已发布：<b>v{{ rolloutLatest }}</b>
      <template v-if="rollout.pinnedVersion"> · 当前全量锁定 <b class="bad-inline">v{{ rollout.pinnedVersion }}</b></template>
      <template v-else-if="rollout.grayPercent < 100"> · 灰度 {{ rollout.grayPercent }}%</template>
      <template v-else> · 全量放开</template>
    </p>
    <p v-if="rolloutMsg" class="ok">{{ rolloutMsg }}</p>

    <div class="ver-grid">
      <!-- 灰度 -->
      <div class="ver-box">
        <h3>灰度发布</h3>
        <p class="tip">按玩家 ID 稳定分桶：桶值 < 百分比 → 最新版；其余 → 上一版。逐步放大观察埋点数据。</p>
        <label>灰度比例：<b>{{ grayPct }}%</b></label>
        <input type="range" min="0" max="100" step="5" v-model.number="grayPct" />
        <button class="primary" @click="applyGray">应用灰度</button>
      </div>

      <!-- 回滚 -->
      <div class="ver-box">
        <h3>回滚 / 锁定</h3>
        <p class="tip">全量锁定到历史版本（选「不锁定」恢复最新）。立即生效，所有玩家。</p>
        <label>锁定版本
          <select v-model="pinTarget">
            <option value="">不锁定（跟随最新）</option>
            <option v-for="v in rolloutVersions" :key="v" :value="v">v{{ v }}</option>
          </select>
        </label>
        <button class="primary" @click="applyPin">{{ pinTarget ? '回滚锁定' : '取消锁定' }}</button>
      </div>
    </div>

    <!-- diff -->
    <h3>版本对比</h3>
    <div class="diff-controls">
      <select v-model="diffFrom">
        <option v-for="v in rolloutVersions" :key="v" :value="v">v{{ v }}</option>
      </select>
      <span>→</span>
      <select v-model="diffTo">
        <option v-for="v in rolloutVersions" :key="v" :value="v">v{{ v }}</option>
      </select>
      <button @click="loadDiff">对比</button>
    </div>
    <table class="ana-table" v-if="diffData.length">
      <thead><tr><th>路径</th><th>类型</th><th>变化</th></tr></thead>
      <tbody>
        <tr v-for="(d, i) in diffData.slice(0, 100)" :key="i">
          <td><code>{{ d.path }}</code></td>
          <td>{{ d.type }}</td>
          <td class="muted-cell">{{ d.detail }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="diffFrom && diffTo && diffFrom !== diffTo" class="tip">点击「对比」查看差异（两个版本完全相同时无差异）</p>
  </section>
</template>
