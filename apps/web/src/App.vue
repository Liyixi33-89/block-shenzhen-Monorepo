<script setup lang="ts">
// 应用壳：模式路由（browser / spawn-select / game）+ 游戏容器
// 逻辑在 composables/useGameShell，视图在 components/（SceneBrowser / SpawnSelect / GameHud）
import { ref, onMounted } from 'vue';
import { useGameShell } from './composables/useGameShell';
import SceneBrowser from './components/SceneBrowser.vue';
import SpawnSelect from './components/SpawnSelect.vue';
import GameHud from './components/GameHud.vue';

const shell = useGameShell();
const gameContainer = ref<HTMLDivElement>();

onMounted(() => { void shell.boot(); });

/** HUD 面板开关（三面板互斥由快捷键层保证，此处直接翻转） */
function togglePanel(panel: 'quest' | 'album' | 'keys') {
  if (panel === 'quest') shell.questPanel.value = !shell.questPanel.value;
  if (panel === 'album') shell.albumPanel.value = !shell.albumPanel.value;
  if (panel === 'keys') shell.keysPanel.value = !shell.keysPanel.value;
  const open = panel === 'quest' ? shell.questPanel.value
    : panel === 'album' ? shell.albumPanel.value : shell.keysPanel.value;
  shell.engRef.value?.analytics?.track('ui_panel', { panel, open });
}
</script>

<template>
  <!-- ============ 3D 游戏模式 ============ -->
  <div v-if="shell.mode.value === 'game'" class="game-root">
    <div ref="gameContainer" class="game-container"></div>
    <div v-if="shell.loading.value" class="game-loading">
      <div class="loading-cube"></div>
      <div class="loading-step">{{ shell.loadingStep.value }}</div>
      <div class="loading-bar"><div class="loading-bar-fill" :style="{ width: shell.loadingPct.value + '%' }"></div></div>
    </div>

    <GameHud
      :eng-ref="shell.engRef.value"
      :hud="shell.hud.value"
      :toasts="shell.toasts.value"
      :quests="shell.quests.value"
      :album="shell.album.value"
      :scene="shell.scene.value"
      :quest-panel="shell.questPanel.value"
      :album-panel="shell.albumPanel.value"
      :keys-panel="shell.keysPanel.value"
      :loading="shell.loading.value"
      @toggle="togglePanel"
      @exit="shell.exitGame()"
    />
  </div>

  <!-- ============ 出生点选择 ============ -->
  <SpawnSelect
    v-else-if="shell.mode.value === 'spawn-select' && shell.scene.value"
    :scene="shell.scene.value"
    :spawn-id="shell.spawnId.value"
    @select="id => shell.spawnId.value = id"
    @back="shell.mode.value = 'browser'"
    @start="shell.startGame(() => gameContainer!)"
  />

  <!-- ============ 场景浏览器（档案模式） ============ -->
  <SceneBrowser
    v-else-if="shell.scene.value"
    :scene="shell.scene.value"
    :server-ok="shell.serverOk.value"
    @enter="shell.enterGame()"
  />
  <div v-else class="shell">
    <p class="hint">场景未发布 —— 用 admin 后台（:5175）发布内容包</p>
  </div>
</template>

<style src="./style.css"></style>
